Ext.define("OIPRApp", {
    extend: 'CA.techservices.app.ChartApp',
    defaults: { margin: 10 },

descriptions: [
        "<strong>OCIO Dashboard - Productivity</strong><br/>" +
            "<br/>" +
            "It is the number of work broken down by user stories, split stories and defects by program by quarter<br/>" +
            "Count displayed as of the end of First day of Quarter."
    ],
    
    integrationHeaders : {
        name : "OIPRApp"
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
        
        this.logger.log('chosen workspaces:', this.workspaces);
        
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

        // for pushing button over to the right
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
    

    updateQuarters: function(quarterAndPrograms){
        //var deferred = Ext.create('Deft.Deferred');
        this.logger.log('updateQuarters',quarterAndPrograms);
        var me = this;
        this.quarterRecord = quarterAndPrograms.quarter;
        this.programObjectIds = quarterAndPrograms.programs;

        //if there are programs selected from drop down get the corresponding workspace and get data 
        //otherwise get data from all workspaces.
        //quarterAndPrograms.allPrograms[quarterAndPrograms.programs[0]].workspace.ObjectID
        var workspaces_of_selected_programs = []
        Ext.Array.each(quarterAndPrograms.programs,function(selected){
            workspaces_of_selected_programs.push(quarterAndPrograms.allPrograms[selected].workspace);
        })

        if(this.programObjectIds.length < 1){
            workspaces_of_selected_programs = me.workspaces;
        }

        var promises = Ext.Array.map(Ext.Array.unique(workspaces_of_selected_programs), function(workspace) {
            return function() { 
                return me._getData( workspace ) 
            };
        });
        
        Deft.Chain.sequence(promises).then({
            scope: this,
            success: function(all_results) {
                //me._displayGrid(Ext.Array.flatten(all_results));
                //var results = Ext.Array.flatten(all_results)
                me.setLoading(false);

                //Modifying the results to include blank records as the customer wants to see all the programs even if the rows dont have values. 
                var results = Ext.Array.flatten(all_results);
                var final_results = {};
                Ext.Object.each(quarterAndPrograms.allPrograms,function(key,val){
                    var allow = true;
                    if(this.programObjectIds && this.programObjectIds.length > 0 ){
                        allow = Ext.Array.contains(this.programObjectIds,val.program.ObjectID) ? true : false;
                    }

                    if(allow){
                        var obj = null;
                        Ext.Object.each(results[0],function(key1,val1){
                            if(val.program.Name == key1){
                                obj = val1;
                                return false;
                            }
                        });

                        if(obj){
                            final_results[val.program.Name]=obj;
                        }else{
                            final_results[val.program.Name] = {
                                defects:0,
                                split_stories: 0,
                                stories:0
                            };
                        }                        

                    }
                },me);

                me._makeChart(final_results);
                me._makeGrid(final_results);
                
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem gathering data', msg);
            }
        });

        
    },

    _getData: function(workspace) {
        var me = this;
        var deferred = Ext.create('Deft.Deferred');
        this.logger.log('_getData:', workspace);
        var workspace_name = workspace.Name ? workspace.Name : workspace.get('Name');
        var workspace_oid = workspace.ObjectID ? workspace.ObjectID : workspace.get('ObjectID');

        this.logger.log('Quarter Start:', this.quarterRecord.get('startDate'), this.quarterRecord);
        var second_day = new Date(this.quarterRecord.get('startDate'));
        
        second_day = Rally.util.DateTime.add(second_day,'day', 1);// add a day to start date to get the end of the day.        
        me.setLoading('Loading..');
        TSUtilities.getPortfolioItemTypes(workspace).then({
            success: function(types) {
                if ( types.length < 3 ) {
                    this.logger.log("Cannot find a record type for EPMS project in workspace",workspace._refObjectName);
                    deferred.resolve([]);
                } else {
                    this.setLoading('Loading Workspace ' + workspace_name);
                    var featureModelPath = types[0].get('TypePath');
                    var featureModelName = types[0].get('Name').replace(/\s/g,'');
                    
                    // TODO: another way to find out what the field on story is that gives us the feature
                    //if ( featureModelName == "Features" ) { featureModelName = "Feature"; }
                    //if (workspace._refObjectName == "LoriTest4") { featureModelName = "Feature"; }
                    
                    var epmsModelPath = types[2].get('TypePath');

                    this._getDataFromSnapShotStore(second_day,workspace_oid,epmsModelPath).then({
                        scope: this,
                        success: function(results){
                            if (!results || !results.length > 0 ) {
                                deferred.resolve({});
                                return;
                            }                            

                            var item_hierarchy_ids = [];

                            Ext.Array.each(results,function(res){
                                item_hierarchy_ids.push({"ObjectID":res.get('ObjectID'),"EPMSProject":res.get('Project').Name});
                            })
                            
                            this._getStoriesFromSnapShotStore(second_day,workspace_oid,item_hierarchy_ids).then({
                                success:function(results1){

                                    if ( results1.length === 0 ) {
                                        deferred.resolve({});
                                        return;
                                    }

                                    var stories_by_program = this._organizeStoriesByProgram(results1);
                                    deferred.resolve(stories_by_program);

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
                    }).always(function() { 
                        //me.setLoading(false);
                    } );
                }
            },
            failure: function(msg){
                Ext.Msg.alert('',msg);
            },
            scope: this
        });



        return deferred.promise;
    },


    _organizeStoriesByProgram: function(stories){
        var me = this,
            stories_by_program = {};
        
        Ext.Array.each(stories, function(story){
            var program = story.EPMSProject;
            if ( Ext.isEmpty(stories_by_program[program]) ) {
                stories_by_program[program] = {
                    stories: 0,
                    split_stories: 0,
                    defects: 0
                };
            }
            stories_by_program[program].defects += story.get('Defects').length;
            if ( 'standard' == me._getTypeFromName(story.get('Name')) ) {
                stories_by_program[program].stories++;
            } else{
                stories_by_program[program].split_stories++;
            }
        });
        
        return stories_by_program;
    },

    
    _getDataFromSnapShotStore:function(date,workspace_oid,epmsModelPath){
        var me = this;
        var deferred = Ext.create('Deft.Deferred');

        this.logger.log('_getDataFromSnapShotStore',epmsModelPath,date);
        
        var find = {
            "_TypeHierarchy": epmsModelPath,
            "__At": Rally.util.DateTime.toIsoString(date)
        };
        
        if(me.programObjectIds && me.programObjectIds.length > 0){
            find["Project"] = {"$in": me.programObjectIds};
        }

        workspace_oid = '/workspace/'+workspace_oid;
        
        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', {
            //"context": {"workspace": {"_ref": workspace_oid }},
            "context": { workspace: workspace_oid },
            "fetch": [ "ObjectID","Project"],
            "find": find,
            "sort": { "_ValidFrom": -1 },
            "removeUnauthorizedSnapshots":true,            
            //"useHttpPost":true,
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

    _getStoriesFromSnapShotStore:function(date,workspace_oid,item_hierarchy_ids){
        var me = this;
        var deferred = Ext.create('Deft.Deferred');

        var hierarchy_ids = [];
        var empms_projects = {};

        Ext.Array.each(item_hierarchy_ids,function(id){
            hierarchy_ids.push(id.ObjectID);
            empms_projects[id.ObjectID] = {"ObjectID":id.ObjectID,"EPMSProject":id.EPMSProject};
        });

        var find = {
            "_TypeHierarchy": "HierarchicalRequirement",
            "_ItemHierarchy": {"$in": hierarchy_ids},
            "__At": date
        };

        // if(me.programObjectIds && me.programObjectIds.length > 0){
        //     find["Project"] = {"$in": me.programObjectIds};
        // }

        workspace_oid = '/workspace/'+workspace_oid;
        console.log('workspace for snapshot store', workspace_oid);
        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', {
            //"context": {"workspace": {"_ref": workspace_oid }},
            "context": {"workspace": workspace_oid },
            "fetch": [ "ObjectID","PlanEstimate","Project","Defects","Name","_ItemHierarchy"],
            "find": find,
            "sort": { "_ValidFrom": -1 },
            "removeUnauthorizedSnapshots":true,            
            //"useHttpPost":true,
             "hydrate": ["Project","Defects"]
        });
        

        snapshotStore.load({
            callback: function(records, operation) {
                this.logger.log('lookback recs',records);
                Ext.Array.each(records,function(rec){
                    Ext.Object.each(empms_projects, function(key,val){
                        if(Ext.Array.contains(rec.get('_ItemHierarchy'),val.ObjectID)){
                            rec.EPMSProject = val.EPMSProject;
                        }
                    });
                });
                deferred.resolve(records);
            },
            scope:this
        });
    
        return deferred;
    },

    _makeChart: function(stories_by_program) {

        var colors = CA.apps.charts.Colors.getConsistentBarColors();
        
        if ( this.getSetting('showPatterns') ) {
            colors = CA.apps.charts.Colors.getConsistentBarPatterns();
        }

        this.setChart({
            chartData: this._getChartData(stories_by_program),
            chartConfig: this._getChartConfig(),
            chartColors: colors
        },0);
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
                { name: "Defects", data: defects }
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
            labelWidth: 135,
            labelAlign: 'left',
            minWidth: 200,
            margin: 10
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
        }
        ];
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    }
    
});
