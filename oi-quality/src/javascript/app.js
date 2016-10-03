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
        if ( this.getSetting('showScopeSelector') || this.getSetting('showScopeSelector') == "true" ) {
            this.workspaces = this.getSetting('workspaceProgramParents');
            
            if ( Ext.isEmpty(this.workspaces) || this.workspaces == "[]" ) {
                Ext.Msg.alert('Configuration Issue','This app requires the designation of a parent project to determine programs in each workspace.' +
                    '<br/>Please use Edit App Settings... to make this configuration.');
                return;
            }
            
            if ( Ext.isString(this.workspaces ) ){
                this.workspaces = Ext.JSON.decode(this.workspaces);
            }
            Ext.Array.each(this.workspaces, function(workspace){
                workspace._ref = workspace.workspaceRef;
                workspace.Name = workspace.workspaceName;
                workspace.ObjectID = workspace.workspaceObjectID;
            });
        }
                
        this._addComponents();
    },
      
    _addComponents: function(){
        var me = this;
        if ( this.getSetting('showScopeSelector') || this.getSetting('showScopeSelector') == "true" ) {

            this.addToBanner({
                xtype: 'quarteritemselector',
                stateId: this.getContext().getScopedStateId('app-selector'),
                workspaces: me.workspaces,
                context: this.getContext(),
                stateful: false,
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
            xtype:'container',
            flex: 1
        });
        
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
        
        //if there are programs selected from drop down get the corresponding workspace 
        //quarterAndPrograms.allPrograms[quarterAndPrograms.programs[0]].workspace.ObjectID
        var workspaces_of_selected_programs = []
        Ext.Array.each(selectorValue.programs,function(selected){
            workspaces_of_selected_programs.push(selectorValue.allPrograms[selected].workspace);
        })

        if(this.programs.length < 1){
            Ext.Msg.alert('There are no chosen programs');
            return;
        }
        
        var promises = Ext.Array.map(Ext.Array.unique(workspaces_of_selected_programs), function(workspace){
            var workspace_data = Ext.clone( workspace );
            return function() { return me._updateDataForWorkspace(workspace_data,quarterRecord); };
        });
    
        Deft.Chain.sequence(promises,this).then({
            success: function(defects) {
                defects = Ext.Array.filter(Ext.Array.flatten(defects), function(defect) {
                    return !Ext.isEmpty(defect);
                });
                
                // filter out duplicates
                var defects_by_fid = {};
                Ext.Array.each(defects, function(defect){
                    defects_by_fid[defect.get('FormattedID')] = defect;
                });
                
                var defects_by_program = this._organizeDefectsByProgram(Ext.Object.getValues(defects_by_fid));

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
        
        TSUtilities.getPortfolioItemTypes(workspace).then({
            success: function(types) {
                if ( types.length < 3 ) {
                    this.logger.log("Cannot find a record type for EPMS project",workspace._refObjectName);
                    deferred.resolve('');
                } else {
                    var epmsModelPaths = [types[2].get('TypePath'),types[1].get('TypePath')];
                    
                    Deft.Chain.pipeline([
                        function() {
                            return me._getEPMSProjects(epmsModelPaths,workspace);
                        },
                        function(epms_id_projects_by_name) {
                            return me._getDefectsFromEPMSProjects(epms_id_projects_by_name,quarterRecord,workspace);
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

    _getPortfolioItems: function(typepath,workspace) {
        var config = {
            model: typepath,
            enablePostGet:true,
            fetch:['ObjectID','Project','Name'],
            context: { 
                project: null,
                workspace: workspace._ref
            }
        };
        
        return this._loadWsapiRecords(config);
    },
    
    // get the level 1 or level 2 (from the bottom) portfolio items from the given workspace
    // as they are now
    _getEPMSProjects:function(epmsModelPaths,workspace){
        var me = this,
            deferred = Ext.create('Deft.Deferred');

        
        Deft.Chain.sequence([
            function() { return me._getPortfolioItems(epmsModelPaths[0],workspace); },
            function() { return me._getPortfolioItems(epmsModelPaths[1],workspace); }
        ]).then({
            success: function(level_1_pis, level_2_pis) {
                var epms_programs_by_project_name = {};

                var pis = Ext.Array.flatten(level_1_pis,level_2_pis);
                
                Ext.Array.each(pis,function(pi){
                    var project_name = pi.get('Project').Name;
                    
                    if ( Ext.isEmpty(epms_programs_by_project_name[project_name]) ) {
                        epms_programs_by_project_name[project_name] = {
                            program: pi.get('Project'),
                            epms_projects: []
                        }
                    }
                    
                    epms_programs_by_project_name[project_name].epms_projects.push(pi.getData());
                    
                });
                deferred.resolve(epms_programs_by_project_name);
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
            
        });
        
        return deferred.promise;
    },
    
    // get the defects that are currently associated with level 1 or level 2 (from the bottom) portfolio
    // items and were created during the quarter. The state is what the state is now.
    _getDefectsFromEPMSProjects: function(epms_items_by_project_name,quarterRecord,workspace) {
        var deferred = Ext.create('Deft.Deferred');
        
        var end_date = quarterRecord.get('endDate');
        var start_date = quarterRecord.get('startDate');
        
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
    
    _organizeDefectsByProgram: function(defects){
        var me = this,
            defects_by_program = {};

        Ext.Array.each(defects, function(defect){
            var program = defect.EPMSProject;
            console.log("--", defect.get("FormattedID"), program);
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
       
        var grid = this.down('rallygrid');
        var rows = this.rows || [];
                        
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
        
        this.setLoading("Generating CSV");
        Deft.Chain.sequence([
            function() { return Rally.technicalservices.FileUtilities.getCSVFromRows(this,grid,rows); } 
        ]).then({
            scope: this,
            success: function(csv){
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
            label: ' ',
            boxLabel: 'Show Scope Selector<br/><span style="color:#999999;"> ' +
            '<i>Tick to show the selectors and broadcast settings.</i><p/>' + 
            '<em>If this is not checked, the app expects another app on the same page ' +
            'to broadcast the chosen program(s) and quarter.  When <b>checked</b> the Workspaces and ' +
            'Program Parents must be chosen.  When <b>not checked</b> the below Workspaces and Program ' +
            'Parents are ignored.</em>' +
            '</span>' + 
            '<p/>' + 
            '<span style="color:#999999;">' + 
            '<em>Programs are the names of projects that hold EPMS Projects.  Choose a new row ' +
            'for each workspace you wish to display, then choose the AC project underwhich the ' + 
            'leaf projects that represent programs live.</em>' +
            '</span>'
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
            fieldLabel: ' ',
            boxLabel: 'Program Parent in Each Workspace<br/><span style="color:#999999;"> ' +
            '<p/>' + 
            '<em>Programs are the names of projects that hold EPMS Projects.  Choose a new row ' +
            'for each workspace you wish to display, then choose the AC project underwhich the ' + 
            'leaf projects that represent programs live.</em>' +
            '</span>'
        }];
    }
    
});
