Ext.define("TSDefectsByProgram", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },

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
        var me = this;
        this._getWorkspaces().then({
            scope: this,
            success: function(workspaces) {
                me.workspaces = workspaces;
                me._addComponents();
            },
            failure: function(msg) {
                Ext.Msg.alert('',msg);
            }
        });
        
        
    },
      
    _addComponents: function(){
        this.removeAll();

        this.headerContainer = this.add({xtype:'container',itemId:'header-ct', layout: {type: 'hbox'}});
        this.displayContainer = this.add({xtype:'container',itemId:'body-ct', tpl: '<tpl>{message}</tpl>'});

        if ( this.getSetting('showScopeSelector') || this.getSetting('showScopeSelector') == "true" ) {

            this.headerContainer.add({
                xtype: 'quarteritemselector',
                stateId: this.getContext().getScopedStateId('app-selector'),
                flex: 1,
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
        
        this.headerContainer.add({xtype:'container',flex: 1});
        this.headerContainer.add({
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
        
        me.logger.log('_updateQuarterInformation', quarterRecord, this.programs);

        var promises = [];
        if ( this.getSetting('showAllWorkspaces') ) {
        
            promises = Ext.Array.map(this.workspaces, function(workspace){
                var workspace_data = Ext.clone( workspace.getData() );
                return function() { return me._updateDataForWorkspace(workspace_data,quarterRecord); };
            });
        } else {
            var workspace_data = this.getContext().getWorkspace();
            
            promises = [ function() { return me._updateDataForWorkspace(workspace_data,quarterRecord); } ];
        }
        
        Deft.Chain.sequence(promises,this).then({
            success: function(results) {
                var defects = Ext.Array.flatten(results);
                defects = Ext.Array.filter(defects, function(defect) {
                    return !Ext.isEmpty(defect);
                });
        
                if ( defects.length === 0 ) {
                    Ext.Msg.alert('','No Defects in this Quarter');
                    return;
                }
                
                var defects_by_program = this._organizeDefectsByProgram(defects);
                console.log('defects_by_program', defects_by_program);
                
                this._makeChart(defects_by_program);
                this._makeGrid(defects_by_program);

                
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
        
        this.setLoading("Gathering Data For " + workspace._refObjectName);
        this.logger.log("Workspace:", workspace._refObjectName);
        
        TSUtilities.getPortfolioItemTypes(workspace).then({
            success: function(types) {
                if ( types.length < 2 ) {
                    this.logger.log("Cannot find a record type for EPMS project",workspace._refObjectName);
                    deferred.resolve('');
                } else {
 
                    var featureModelPath = types[0].get('TypePath');
                    var featureModelName = types[0].get('Name').replace(/\s/g,'');
                    
                    // TODO: another way to find out what the field on story is that gives us the feature
                    //if ( featureModelName == "Features" ) { featureModelName = "Feature"; }
                    if (workspace._refObjectName == "LoriTest4") { featureModelName = "Feature"; }
                    
                    var epmsModelPath = types[1].get('TypePath');
                    Deft.Promise.all([
                        //me._getEPMSProjects(),
                        me._getStoriesForEPMSProjects(featureModelName,quarterRecord,workspace)
                    ],this).then({
                        scope: this,
                        success: function(stories){
                            stories = Ext.Array.flatten(stories);
                          
                            if ( stories.length === 0 ) {
                                deferred.resolve([]);
                            } else {
                                
                                this._getDefectsForStories(stories,quarterRecord,workspace,featureModelName).then({
                                    scope: this,
                                    success: function(defects) {
                                        Ext.Array.each(defects, function(defect){
                                            
                                            defect.set('__feature', defect.get('Requirement')[featureModelName]);
                                        });
                                        deferred.resolve(defects);
                                    },
                                    failure: function(msg){
                                        deferred.reject(msg);
                                    }
                                });
                            }
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

    _getEPMSProjects:function(){
        var me = this;
        var deferred = Ext.create('Deft.Deferred');

        var config = {
            model: this.epmsModelPath,
            fetch:['ObjectID','Project','Name'],
            context: { 
                project: null
            }
        };
        
        this._loadWsapiRecords(config).then({
            success: function(records) {
                var epms_id_projects_by_name = {};
                Ext.Array.each(records,function(rec){
                    var project_name = rec.get('Project').ObjectID;
                    
                    if ( Ext.isEmpty(epms_id_projects_by_name[project_name]) ) {
                        epms_id_projects_by_name[project_name] = {
                            program: rec.get('Project'),
                            projects: []
                        }
                    }
                    
                    epms_id_projects_by_name[project_name].projects.push(rec.getData());
                    
                });
                deferred.resolve(epms_id_projects_by_name);
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
            
        });
        
        return deferred.promise;
    },
    
    _getStoriesForEPMSProjects: function(featureModelName,quarterRecord,workspace) {
        
        var end_date = quarterRecord.get('endDate');
        var start_date = quarterRecord.get('startDate');

        var filters = Rally.data.wsapi.Filter.and([
            {property:'Defects.CreationDate',operator:'>=',value:start_date},
            {property:'Defects.CreationDate',operator:'<=',value:end_date},
            {property:featureModelName + ".Parent.ObjectID", operator:">",value: 0 }
        ]);
        
        if (this.programs.length > 0) {
            var program_filters = Ext.Array.map(this.programs, function(program_oid){
                return {property:featureModelName + ".Parent.Project.ObjectID", value: program_oid };
            });
            filters = filters.and(Rally.data.wsapi.Filter.or(program_filters));
        }
        
        var config = {
            model: 'hierarchicalrequirement',
            filters: filters,
            limit: Infinity,
            pageSize: 2000,
            fetch: ['ObjectID','FormattedID'],
            context: { 
                project: null,
                workspace: workspace._ref
            }
        };
        
        return this._loadWsapiRecords(config);
    },
    
    _getDefectsForStories: function(stories,quarterRecord,workspace,featureModelName) {

        var end_date = quarterRecord.get('endDate');
        var start_date = quarterRecord.get('startDate');

        var date_filters = Rally.data.wsapi.Filter.and([
            {property:'CreationDate',operator:'>=',value:start_date},
            {property:'CreationDate',operator:'<=',value:end_date}
        ]);

        var story_filters = Rally.data.wsapi.Filter.or(
            Ext.Array.map(stories, function(story){
                return { property:'Requirement.ObjectID',value:story.get('ObjectID')};
            })
        );
        
        var filters = story_filters.and(date_filters);
        
        var config = {
            model: 'defect',
            filters: filters,
            limit: Infinity,
            pageSize: 2000,
            fetch: ['ObjectID','FormattedID','Project','Requirement','State',featureModelName,'Parent'],
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
            var feature = defect.get('__feature');
            
            if ( feature && feature.Parent ) {
                var program = feature.Parent.Project._refObjectName;
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
            }
        });
        
        return defects_by_program;
    },

    _makeChart: function(defects_by_program) {
        this.displayContainer.removeAll();
        
        this.displayContainer.add({
            xtype: 'rallychart',
            loadMask: false,
            chartData: this._getChartData(defects_by_program),
            chartConfig: this._getChartConfig()
        });
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
        this.grid = this.displayContainer.add({
            xtype: 'rallygrid',
            hidden: true,
            store: Ext.create('Rally.data.custom.Store', {
                data: rows,
                pageSize: 1000
            }),
            columnCfgs: this._getColumns(),
            showRowActionsColumn: false,
            showPagingToolbar: false
        });
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
                { name: "Total Defects", data: all_data },
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
        {
            name: 'showAllWorkspaces',
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Show All Workspaces',
            labelWidth: 135,
            labelAlign: 'left',
            minWidth: 200,
            margin: 10
        }];
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    }
    
});
