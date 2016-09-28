Ext.define("TSDefectsByProgram", {
    extend: 'CA.techservices.app.ChartApp',

    defaults: { margin: 10 },

    descriptions: [
        "<strong>OCIO Dashboard - Quality</strong><br/>" +
            "<br/>" +
            "Defects opened vs Defects closed vs Total Open<br/> "  +
            "Defects that were created between Quarter start date and Quarter end date."

    ],

    integrationHeaders : {
        name : "TSDefectsByProgram"
    },
      
    config: {
        defaultSettings: {
            showScopeSelector: true,
            showAllWorkspaces: false
        }
    },
    
    
    launch: function() {
        this.callParent();

        if ( Ext.isEmpty(this.getSetting('workspaceProgramParents')) ) {
            Ext.Msg.alert('Configuration Issue','This app requires the designation of a parent project to determine programs in each workspace.' +
                '<br/>Please use Edit App Settings... to make this configuration.');
            return;
        }
        
        this.workspaces = this.getSetting('workspaceProgramParents');
        if ( Ext.isString(this.workspaces ) ){
            this.workspaces = Ext.JSON.decode(this.workspaces);
        }
        Ext.Array.each(this.workspaces, function(workspace){
            workspace._ref = workspace.workspaceRef;
            workspace.Name = workspace.workspaceName;
            workspace.ObjectID = workspace.workspaceObjectID;
        });
                
        this._addComponents();
    },
      
    _addComponents: function(){
        var me = this;
        if ( this.getSetting('showScopeSelector') || this.getSetting('showScopeSelector') == "true" ) {

            this.addToBanner({
                xtype: 'quarteritemselector',
                stateId: this.getContext().getScopedStateId('app-selector'),
                flex: 1,
                workspaces: me.workspaces,
                context: this.getContext(),
                stateful: false,
                width: '75%',                
                listeners: {
                    change: this._updateQuarterInformation,
                    scope: this
                }
            });

        } else {
            this.subscribe(this, 'quarterSelected', this._updateQuarterInformation, this);
            this.publish('requestQuarter', this);
        }
        
        this.addToBanner({
            xtype:'rallybutton',
            itemId:'export_button',
            cls: 'secondary',
            text: '<span class="icon-export"> </span>',
            disabled: false,
            listeners: {
                scope: this,
                click: function(button) {
                    this._export(button);
                }
            }
        });
    },

    _updateQuarterInformation: function(selectorValue){
        var me = this;
        var quarterRecord = selectorValue.quarter;
        this.programs = selectorValue.programs || [];
                
        this.setLoading('Loading Data...');
        
        var promises = [];

        //if there are programs selected from drop down get the corresponding workspace and get data otherwise get data from all workspaces.
        //quarterAndPrograms.allPrograms[quarterAndPrograms.programs[0]].workspace.ObjectID
        var workspaces_of_selected_programs = []
        Ext.Array.each(selectorValue.programs,function(selected){
            workspaces_of_selected_programs.push(selectorValue.allPrograms[selected].workspace);
        })

        if(this.programs.length < 1){
            workspaces_of_selected_programs = this.workspaces;
        }
        
        promises = Ext.Array.map(Ext.Array.unique(workspaces_of_selected_programs), function(workspace){
            var workspace_data = Ext.clone( workspace );
            return function() { return me._updateDataForWorkspace(workspace_data,quarterRecord); };
        });
    
        Deft.Chain.sequence(promises,this).then({
            success: function(defects) {
                defects = Ext.Array.filter(Ext.Array.flatten(defects), function(defect) {
                    return !Ext.isEmpty(defect);
                });
        
                var defects_by_program = this._organizeDefectsByProgram(defects);

                //Modifying the results to include blank records as the customer wants to see all the programs even if the rows dont have values. 
                var final_results = {};
                Ext.Object.each(selectorValue.allPrograms,function(key,val){
                    var allow = true;
                    if(this.programs && this.programs.length > 0 ){
                        allow = Ext.Array.contains(this.programs,val.program.ObjectID) ? true : false;
                    }

                    if(allow){
                        var obj = null;
                        Ext.Object.each(defects_by_program,function(key1,val1){
                            if(val.program.Name == key1){
                                obj = val1;
                                return false;
                            }
                        });

                        if(obj){
                            final_results[val.program.Name]=obj;
                        }else{
                            final_results[val.program.Name] = {
                                all:[],
                                closed: [],
                                open:[]
                            };
                        }                        

                    }
                },me);

                this._makeChart(final_results);
                this._makeGrid(final_results);
                
                // this._makeChart(defects_by_program);
                // this._makeGrid(defects_by_program);

                
            },
            failure: function(msg){
                Ext.Msg.alert("Problem While Loading Data", msg);
            },
            scope: this
        }).always(function() { me.setLoading(false);} );
        
    },
    
    _updateDataForWorkspace: function(workspace,quarterRecord) {
        var me = this,
            deferred = Ext.create('Deft.Deferred');
        
        this.setLoading("Gathering Data For " + workspace.Name);
        this.logger.log("Workspace:", workspace.Name, workspace);
        
        TSUtilities.getPortfolioItemTypes(workspace).then({
            success: function(types) {
                if ( types.length < 3 ) {
                    this.logger.log("Cannot find a record type for EPMS project",workspace._refObjectName);
                    deferred.resolve('');
                } else {
                    var epmsModelPath = types[2].get('TypePath');
                    
                    Deft.Chain.pipeline([
                        function() {
                            return me._getEPMSProjects(epmsModelPath,workspace);
                        },
                        function(epms_id_projects_by_name) {
                            return me._getDefectsEPMSProjects(epms_id_projects_by_name,epmsModelPath,quarterRecord,workspace);
                        }
                    ],this).then({
                        scope: this,
                        success: function(possible_defects){
                            deferred.resolve( possible_defects );
                        }, 
                        failure: function(msg) {
                            deferred.reject(msg);
                        }
                    });
                }
            },
            failure: function(msg){
                Ext.Msg.alert('',msg);
            },
            scope: this
        });
        
        return deferred.promise;
    },

    _getEPMSProjects:function(epmsModelPath,workspace){
        var me = this;
        var deferred = Ext.create('Deft.Deferred');

        var config = {
            model: epmsModelPath,
            fetch:['ObjectID','Project','Name'],
            context: { 
                project: null,
                workspace: workspace._ref
            }
        };
        
        this._loadWsapiRecords(config).then({
            success: function(records) {
                var epms_programs_by_project_name = {};
                Ext.Array.each(records,function(rec){
                    var project_name = rec.get('Project').Name;
                    
                    if ( Ext.isEmpty(epms_programs_by_project_name[project_name]) ) {
                        epms_programs_by_project_name[project_name] = {
                            program: rec.get('Project'),
                            epms_projects: []
                        }
                    }
                    
                    epms_programs_by_project_name[project_name].epms_projects.push(rec.getData());
                    
                });
                deferred.resolve(epms_programs_by_project_name);
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
            
        });
        
        return deferred.promise;
    },
    
    _getDefectsEPMSProjects: function(epms_items_by_project_name,epmsModelPath,quarterRecord,workspace) {
        var deferred = Ext.create('Deft.Deferred');
        
        var end_date = quarterRecord.get('endDate');
        var start_date = quarterRecord.get('startDate');

        this.logger.log('_getDefectsForEPMSProjects',epms_items_by_project_name,quarterRecord);
        
        var filters = [
            {property:'CreationDate',operator:'>=',value:start_date},
            {property:'CreationDate',operator:'<=',value:end_date},
            {property:'_TypeHierarchy',value:'Defect'},
            {property:'__At',value: 'current' }
        ];
        
        if ( Ext.Object.getKeys(epms_items_by_project_name).length > 0 ) {
            var epms_oids = [];
            Ext.Object.each(epms_items_by_project_name, function(key,epms_item){
                var epms_projects = epms_item.epms_projects || [];
                Ext.Array.each(epms_projects, function(epms_project){
                    epms_oids.push(epms_project.ObjectID);
                });
            });
            
            filters.push({property:'_ItemHierarchy',operator:'in',value:epms_oids});
        }
        
        var config = {
            filters: filters,
            fetch: ['ObjectID','FormattedID','CreationDate','Project','_ItemHierarchy','State'],
            context: { 
                project: null,
                workspace: workspace._ref
            },
            hydrate: ['State']
        };
        
        this._loadLookbackRecords(config).then({
            success: function(defects) {
                Ext.Object.each(epms_items_by_project_name, function(name,epms_item){
                    var epms_projects = epms_item.epms_projects || [];
                    Ext.Array.each(epms_projects, function(epms_project){
                        var project_oid = epms_project.ObjectID;
                        Ext.Array.each(defects, function(defect){
                            if (Ext.Array.contains(defect.get('_ItemHierarchy'), project_oid)) {
                                defect.EPMSProject = name;
                            }
                        });
                    });
                });
                deferred.resolve(defects);
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
        });
        
        return deferred.promise;
    },
    
    _getDefectsForStories: function(stories,quarterRecord,workspace,featureModelName) {

        var end_date = quarterRecord.get('endDate');
        var start_date = quarterRecord.get('startDate');

        var date_filters = Rally.data.wsapi.Filter.and([
            {property:'CreationDate',operator:'>=',value:start_date},
            {property:'CreationDate',operator:'<=',value:end_date}
        ]);
        
        var config = {
            model: 'defect',
            filters: filters,
            limit: Infinity,
            pageSize: 2000,
            fetch: ['ObjectID','FormattedID','Project','Requirement','State','Parent'],
            context: { 
                project: null,
                workspace: workspace._ref
            },
            enablePostGet: true
        };
        
        return this._loadWsapiRecords(config);
    },
    
    _organizeDefectsByProgram: function(defects){
        var me = this,
            defects_by_program = {};

        Ext.Array.each(defects, function(defect){
            var program = defect.EPMSProject;
            if ( Ext.isEmpty(defects_by_program[program]) ) {
                defects_by_program[program] = {
                    all: [],
                    open: [],
                    closed:[]
                };
            }
            defects_by_program[program].all.push(defect);
            if ( defect.get('State') == "Closed" ) {
                defects_by_program[program].closed.push(defect);
            } else {
                defects_by_program[program].open.push(defect);
            }
        });
        
        return defects_by_program;
    },

    _makeChart: function(defects_by_program) {

        var colors = CA.apps.charts.Colors.getConsistentBarColors();
        
        if ( this.getSetting('showPatterns') ) {
            colors = CA.apps.charts.Colors.getConsistentBarPatterns();
        }

        this.setChart({
            chartData: this._getChartData(defects_by_program),
            chartConfig: this._getChartConfig(),
            chartColors: colors
        },0);
        
    },

    _makeGrid: function(defects_by_program) {
        var rows = [];
        
         Ext.Object.each(defects_by_program, function(key,value){
            var row =  {
                program: key,
                open: value.open.length,
                closed: value.closed.length,
                all: value.all.length
            };
            
            rows.push(row);
        });
        
        this.rows = rows;
        this.setGrid({
            xtype: 'rallygrid',
            hidden: true,
            store: Ext.create('Rally.data.custom.Store', {
                data: rows,
                pageSize: 1000
            }),
            columnCfgs: this._getColumns(),
            showRowActionsColumn: false,
            showPagingToolbar: false
        },0);
    },
    
    _getColumns: function() {
        return [
            { dataIndex:'program', text: 'Program' },
            { dataIndex:'open', text: 'Defects Open' },
            { dataIndex:'closed', text: 'Defects Closed' },
            { dataIndex:'all', text: 'Total Defects' }
        ];
    },
    
    _getChartData: function(defects_by_program) {
        
        var categories = Ext.Object.getKeys(defects_by_program);
        
        var all_data = [];
        var open_data = [];
        var closed_data = [];
        
        Ext.Object.each(defects_by_program, function(key,value){
            all_data.push(value.all.length);
            open_data.push(value.open.length);
            closed_data.push(value.closed.length);
        });
        
        return { 
            series: [ 
                { name: "Defects Open", data: open_data },
                { name: "Defects Closed", data: closed_data },
                { name: "Total Defects", data: all_data }
            ],
            categories: categories
        };
    },
            
    _getChartConfig: function() {
        return {
            chart: {
                type: 'column'
            },
            title: {
                text: 'Defects Open vs. Closed'
            },
            xAxis: {
            },
            yAxis: {
                min: 0,
                    title: {
                    text: 'Number of Defects'
                }
            }
        };
    },
    
    _loadLookbackRecords: function(config,returnOperation) {
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var default_config = {
            sort: { "_ValidFrom": -1 },
            //"useHttpPost":true,
            removeUnauthorizedSnapshots:true
        };
        
        
        this.logger.log("_loadLookbackRecords", config);
        Ext.create('Rally.data.lookback.SnapshotStore', Ext.Object.merge(default_config,config)).load({
            callback : function(records, operation, successful) {
                if (successful){
                    if ( returnOperation ) {
                        deferred.resolve(operation);
                    } else {
                        deferred.resolve(records);
                    }
                } else {
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    
    _loadWsapiRecords: function(config){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var default_config = {
            model: 'Defect',
            fetch: ['ObjectID'],
            compact: false
        };
        this.logger.log("Starting load:",config.model);
        Ext.create('Rally.data.wsapi.Store', Ext.Object.merge(default_config,config)).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    
    _getWorkspaces: function() {
        var deferred = Ext.create('Deft.Deferred');
        var config = {
            model: 'Subscription',
            fetch: ['ObjectID','Workspaces']
        };
        
        this._loadWsapiRecords(config).then({
            scope: this,
            success: function(subs) {
                var sub = subs[0];
                sub.getCollection('Workspaces').load({
                    fetch: ['ObjectID','Name','State'],
                    sorters: [{property:'Name'}],
                    callback: function(workspaces,operation,success){
                        
                        var open_workspaces = Ext.Array.filter(workspaces, function(ws) {
                            if ( Rally.getApp().getSetting('showAllWorkspaces') == false ) {
                                return ( ws.get('ObjectID') == Rally.getApp().getContext().getWorkspace().ObjectID );
                            }
                            
                            return ( ws.get('State') == "Open" ) ;
                        });
                        deferred.resolve(open_workspaces);
                    }
                });
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
        });
        return deferred.promise;
    },
    
    _export: function(){
        var me = this;
        this.logger.log('_export');
       
        var grid = this.down('rallygrid');
        var rows = this.rows || [];
                
        this.logger.log('number of rows:', rows.length, rows);
        
        if (!rows ) { return; }
        
        var store = Ext.create('Rally.data.custom.Store',{ data: rows });
        
        if ( !grid ) {
            
            grid = Ext.create('Rally.ui.grid.Grid',{
                store: store,
                columnCfgs: [{
                    dataIndex: 'FormattedID',
                    text: 'ID'
                },
                {
                    dataIndex: 'Name',
                    text: 'Name'
                },
                {
                    dataIndex: 'Project',
                    text: 'Project',
                    renderer: function(value,meta,record){
                        if ( Ext.isEmpty(value) ) { 
                            return "";
                        }
                        return value._refObjectName
                    }
                },
                {
                    dataIndex: '__ruleText',
                    text:'Rules',
                    renderer: function(value,meta,record){                        
                        return value.join('\r\n');
                    }
                }]
            });
        }
        
        var filename = 'defect_counts.csv';

        this.logger.log('saving file:', filename);
        
        this.setLoading("Generating CSV");
        Deft.Chain.sequence([
            function() { return Rally.technicalservices.FileUtilities.getCSVFromRows(this,grid,rows); } 
        ]).then({
            scope: this,
            success: function(csv){
                this.logger.log('got back csv ', csv.length);
                if (csv && csv.length > 0){
                    Rally.technicalservices.FileUtilities.saveCSVToFile(csv,filename);
                } else {
                    Rally.ui.notify.Notifier.showWarning({message: 'No data to export'});
                }
                
            }
        }).always(function() { me.setLoading(false); });
    },
    
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },

    getSettingsFields: function() {
        return [{
            name: 'showScopeSelector',
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Show Scope Selector',
            //bubbleEvents: ['change'],
            labelAlign: 'right',
            labelCls: 'settingsLabel'
        },
//        {
//            name: 'showAllWorkspaces',
//            xtype: 'rallycheckboxfield',
//            fieldLabel: 'Show All Workspaces',
//            labelWidth: 135,
//            labelAlign: 'left',
//            minWidth: 200,
//            margin: 10
//        },
        {
            name: 'workspaceProgramParents',
            xtype:'tsworkspacesettingsfield',
            fieldLabel: 'Workspaces and Program Parents',
            margin: '0 10 100 0'
        }];
    }
    
});
