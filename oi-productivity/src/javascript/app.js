Ext.define("OIPRApp", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },

    integrationHeaders : {
        name : "OIPRApp"
    },
      
    config: {
        defaultSettings: {
            showScopeSelector: true
        }
    },
        
    launch: function() {
        var me = this;
        TSUtilities.getPortfolioItemTypes().then({
            success: function(types) {
                if ( types.length < 2 ) {
                    Ext.Msg.alert('',"Cannot find a record type for EPMS project");
                    return;
                }

                me.featureModelPath = types[0].get('TypePath');
                me.featureModelName = types[0].get('Name');
                
                me.epmsModelPath = types[1].get('TypePath');
                
                me._addComponents();
            },
            failure: function(msg){
                Ext.Msg.alert('',msg);
            },
            scope: this
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
                    change: this.updateQuarters,
                    scope: this
                }
            });

        } else {
            this.subscribe(this, 'quarterSelected', this.updateQuarters, this);
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

    updateQuarters: function(quarterAndPrograms){
        this.logger.log('updateQuarters',quarterAndPrograms);
        var me = this;
        this.quarterRecord = quarterAndPrograms.quarter;
        this.programObjectIds = quarterAndPrograms.programs;

        var second_day = new Date(this.quarterRecord.get('startDate'));
        second_day.setDate(second_day.getDate() + 1) // add a day to start date to get the end of the day.

        this.setLoading("Loading data...");
        Deft.Promise.all([
            this._getEPMSProjects(),
            this._getDataFromSnapShotStore(second_day)
        ],this).then({
            scope: this,
            success: function(results){
                var epms_id_projects = results[0];
                var stories_from_lookback = results[1];
                
                this._getStoriesForEPMSProjects(stories_from_lookback).then({
                    success:function(results1){

                        if ( results1.length === 0 ) {
                            Ext.Msg.alert('','No Defects in this Quarter');
                            return;
                        }

                        var stories_by_program = this._organizeStoriesByProgram(results1);
                        this._makeChart(stories_by_program);
                        this._makeGrid(stories_by_program);
                    },
                    failure: function(msg) {
                        Ext.Msg.alert('',msg);
                    },
                    scope:this
                });

            },
            failure: function(msg) {
                Ext.Msg.alert('',msg);
            }
        }).always(function() { me.setLoading(false);} );
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
                var epms_id_projects = {};
                Ext.Array.each(records,function(rec){
                    var project_oid = rec.get('Project').ObjectID;
                    
                    if ( Ext.isEmpty(epms_id_projects[project_oid]) ) {
                        epms_id_projects[project_oid] = {
                            program: rec.get('Project'),
                            projects: []
                        }
                    }
                    
                    epms_id_projects[project_oid].projects.push(rec.getData());
                    
                });
                deferred.resolve(epms_id_projects);
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
            
        });
        
        return deferred.promise;
    },
    
    _getStoriesForEPMSProjects: function(stories_from_lookback) {
        
        if(!stories_from_lookback.length > 0){
            Ext.Msg.alert('',"No Data found");
                    return;
        }

        this.logger.log('updateQuarters', this.quarterRecord);
        var end_date = this.quarterRecord.get('endDate');
        var start_date = this.quarterRecord.get('startDate');

        var object_id_filters = [];

        Ext.Array.each(stories_from_lookback, function(story){
            object_id_filters.push({property:'ObjectID',value:story.get('ObjectID')});
        })

        var filters = [
            {property:this.featureModelName + ".Parent.ObjectID", operator:">",value: 0 }
        ];
        
        filters = Rally.data.wsapi.Filter.or(object_id_filters).and(Rally.data.wsapi.Filter.and(filters));

        var config = {
            model: 'hierarchicalrequirement',
            filters: filters,
            limit: Infinity,
            pageSize: 2000,
            fetch: ['ObjectID','FormattedID','Defects','Name','Parent',this.featureModelName,'Project'],
            context: { project: null }
            // ,
            // enablePostGet:true
        };
        
        return this._loadWsapiRecords(config);
    },

    _organizeStoriesByProgram: function(stories){
        var me = this,
            stories_by_program = {};
        
        Ext.Array.each(stories, function(story){
            //var requirement = defect.get('Requirement');
            if ( story.get(me.featureModelName) && story.get(me.featureModelName).Parent ) {
                var program = story.get(me.featureModelName).Parent.Project._refObjectName;
                if ( Ext.isEmpty(stories_by_program[program]) ) {
                    stories_by_program[program] = {
                        stories: 0,
                        split_stories: 0,
                        defects: 0
                    };
                }
                stories_by_program[program].defects += story.get('Defects').Count;
                if ( 'standard' == me._getTypeFromName(story.get('Name')) ) {
                    stories_by_program[program].stories++;
                } else{
                    stories_by_program[program].split_stories++;
                }
            }
        });
        
        return stories_by_program;
    },

    _getDataFromSnapShotStore:function(date){
        var me = this;
        var deferred = Ext.create('Deft.Deferred');

        var find = {
                        "_TypeHierarchy": "HierarchicalRequirement",
                        "Ready": true,
                        "__At": date
                    };
        if(me.programObjectIds && me.programObjectIds.length > 0){
            find["Project"] = {"$in": me.programObjectIds};
        }

        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', {
            //"context": this.getContext().getDataContext(),
            "fetch": [ "ObjectID","PlanEstimate","Project"],
            "find": find,
            "sort": { "_ValidFrom": -1 },
            //useHttpPost:true,
             "hydrate": ["Project"]
        });

        snapshotStore.load({
            callback: function(records, operation) {
                this.logger.log('Lookback recs',records);
                deferred.resolve(records);
            },
            scope:this
        });
    
        return deferred;
    },

    _makeChart: function(stories_by_program) {
        this.displayContainer.removeAll();
        
        this.displayContainer.add({
            xtype: 'rallychart',
            loadMask: false,
            chartData: this._getChartData(stories_by_program),
            chartConfig: this._getChartConfig()
        });
    },

    _makeGrid: function(stories_by_program) {
        var rows = [];
        
         Ext.Object.each(stories_by_program, function(key,value){
            var row =  {
                program: key,
                stories: value.stories,
                split_stories: value.split_stories,
                defects: value.defects
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
            { dataIndex:'stories', text: 'Total Stories' },
            { dataIndex:'split_stories', text: 'Total Split Stories' },
            { dataIndex:'defects', text: 'Total Defects' }
        ];
    },
    
    _getChartData: function(stories_by_program) {
        
        var categories = Ext.Object.getKeys(stories_by_program);
        
        var stories = [];
        var split_stories = [];
        var defects = [];
        
        Ext.Object.each(stories_by_program, function(key,value){
            stories.push(value.stories);
            split_stories.push(value.split_stories);
            defects.push(value.defects);
        });
        
        return { 
            series: [ 
                { name: "Stories", data: stories },
                { name: "Split Stories", data: split_stories },
                { name: "Defects", data: defects },
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
                text: 'Productivity'
            },
            xAxis: {
            },
            yAxis: {
                min: 0,
                    title: {
                    text: ''
                }
            },
            plotOptions: {
                column: {
                    stacking: 'normal',
                    dataLabels: {
                        enabled: true
                    }
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
        
        var filename = 'productivity_counts.csv';

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

    _getTypeFromName: function(name) {
        if ( /\[Continued\]/.test(name) &&  /\[Unfinished\]/.test(name) ) {
            return 'multiple';
        }
        if ( /\[Continued\]/.test(name) ) {
            return 'continued';
        }
        
        if ( /\[Unfinished\]/.test(name) ) {
            return 'unfinished';
        }
        
        return 'standard';
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
