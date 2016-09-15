
Ext.define("OIBMApp", {
    extend: 'CA.techservices.app.GridApp',

    descriptions: [
        "<strong>OCIO Dashboard - Backlog Maturity</strong><br/>" +
            "<br/>" +
            "Backlog Maturity based on the stories that are in ready state at the end of the first day of the quarter and the average velocity for that program.<br/>" + 
            "Counts are based on all the stories that were on Ready state at the end of the first day of the quarter "
            
    ],

    defaults: { margin: 10 },
   
    integrationHeaders : {
        name : "OIBMApp"
    },
      
    config: {
        defaultSettings: {
            showScopeSelector: true,
            showAllWorkspaces: false
        }
    },

    launch: function() {
        var me = this;
        this.callParent();

        TSUtilities.getWorkspaces().then({
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

        var me = this;
        if ( this.getSetting('showScopeSelector') || this.getSetting('showScopeSelector') == "true" ) {

            this.addToBanner({
                xtype: 'quarteritemselector',
                stateId: this.getContext().getScopedStateId('app-selector'),
                flex: 1,
                context: this.getContext(),
                workspaces: me.workspaces,
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

        //if there are porgrams selected from drop down get the corresponding workspace and get data otherwise get data from all workspaces.
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
                this.logger.log('all_results>>>>',all_results);
                

                //Modifying the results to include blank records as the customer wants to see all the programs even if the rows dont have values. 
                var results = Ext.Array.flatten(all_results);
                var final_results = []
                Ext.Object.each(quarterAndPrograms.allPrograms,function(key,val){
                    var allow = true;
                    if(this.programObjectIds && this.programObjectIds.length > 0 ){
                        allow = Ext.Array.contains(this.programObjectIds,val.program.ObjectID) ? true : false;
                    }

                    if(allow){
                        var obj = null;
                        Ext.Array.each(results,function(res){
                            if(val.program.Name == res.Program){
                                obj = res;
                                return false;
                            }
                        });

                        if(obj){
                            final_results.push(obj);
                        }else{
                            final_results.push({
                                AvgVelocity:0,
                                Program: val.program.Name,
                                Sprints:0,
                                StoryPoints:0
                            })
                        }                        

                    }

                    
                },me);


                me._displayGrid(final_results);
                
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem gathering data', msg);
            }
        });

        
    },
    //me._displayGrid(backlog_data);

    _getData: function(workspace) {
        var me = this;
        var deferred = Ext.create('Deft.Deferred');
        var workspace_name = workspace.Name ? workspace.Name : workspace.get('Name');
        var workspace_oid = workspace.ObjectID ? workspace.ObjectID : workspace.get('ObjectID');

        var second_day = new Date(this.quarterRecord.get('startDate'));
        second_day.setDate(second_day.getDate() + 1) // add a day to start date to get the end of the day.        

        
        TSUtilities.getPortfolioItemTypes(workspace).then({
            success: function(types) {
                if ( types.length < 2 ) {
                    this.logger.log("Cannot find a record type for EPMS project",workspace._refObjectName);
                    deferred.resolve([]);
                } else {

                    this.setLoading('Loading Workspace ' + workspace_name);
                    var featureModelPath = types[0].get('TypePath');
                    var featureModelName = types[0].get('Name').replace(/\s/g,'');
                    
                    
                    var epmsModelPath = types[1].get('TypePath');

                    var epmsModelName = types[1].get('Name');

                    
                    
                    me._getDataFromSnapShotStore(second_day,workspace_oid).then({
                        scope: me,
                        success: function(records1){
                            me.logger.log('_getDataFromSnapShotStore',records1);
                            var promises = [];
                            if(!records1 || records1.length == 0){
                                deferred.resolve([]);
                            }

                            me._getStoryPointsReadyState(records1,workspace_oid,epmsModelName).then({
                                success: function(records2){

                                    if(Object.keys(records2).length == 0){
                                        deferred.resolve([]);
                                    }

                                    Ext.Object.each(records2,function(key,value){
                                        promises.push(me._getVelocity(key,workspace_oid));
                                    });

                                    Deft.Promise.all(promises).then({
                                        scope: this,
                                        success: function(all_projects_velocity){
                                            me.logger.log('all_projects_velocity',all_projects_velocity);


                                            var backlog_data = [];
                                            Ext.Array.each(all_projects_velocity,function(vel){
                                                
                                                var backlog_rec = {
                                                    ObjectID: vel.ProjectID,
                                                    Program: records2[vel.ProjectID].Name,
                                                    StoryPoints: records2[vel.ProjectID].PlanEstimate > 0 ? records2[vel.ProjectID].PlanEstimate:0,
                                                    AvgVelocity: vel.Velocity,
                                                    Sprints: vel.Velocity > 0 && records2[vel.ProjectID].PlanEstimate > 0 ? (records2[vel.ProjectID].PlanEstimate / vel.Velocity) : 0
                                                }
                                                backlog_data.push(backlog_rec);

                                            });


                                            deferred.resolve(backlog_data);


                                        },
                                        failure: function(error_msg) { deferred.reject(error_msg); }
                                    });

                                
                                },
                                failure: function(error){

                                }

                            });
                            
                            

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

    _getDataFromSnapShotStore:function(date,workspace_oid){
        var me = this;
        var deferred = Ext.create('Deft.Deferred');


        var find = {
                        "_TypeHierarchy": "HierarchicalRequirement",
                        "Ready": true,
                        "Feature": {$ne: null},
                        "__At": date
                    };
        if(me.programObjectIds && me.programObjectIds.length > 0){
            find["Project"] = {"$in": me.programObjectIds};
        }

        workspace_oid = '/workspace/'+workspace_oid;
        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', {
            "context": {"workspace": {"_ref": workspace_oid }},
            "fetch": [ "ObjectID","PlanEstimate","Project","Feature"],
            "find": find,
            "sort": { "_ValidFrom": -1 },
            //"useHttpPost":true,
            "removeUnauthorizedSnapshots":true,            
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

    _getStoryPointsReadyState :function(records,workspace_oid,epmsModelName){
        var me = this;

        var deferred = Ext.create('Deft.Deferred');

        if(!records || !records.length > 0){
            deferred.resolve({});
            return deferred;
        }
        var object_id_filters = [];

        Ext.Array.each(records, function(story){
            object_id_filters.push({property:'ObjectID',value:story.get('ObjectID')});
        })

        var model_filters = [{property: "Feature.Parent.PortfolioItemType.Name", value: epmsModelName}
        //,{property:"Ready", value:"true"}
        ];

        if(object_id_filters.length > 0){
            model_filters = Rally.data.wsapi.Filter.and(model_filters).and(Rally.data.wsapi.Filter.or(object_id_filters));
        }

        Ext.create('Rally.data.wsapi.Store', {
            model: 'UserStory',
            filters: model_filters,
            enablePostGet:true,
            fetch:['ObjectID','Project','PlanEstimate','Name','PortfolioItemType','Feature','Parent','PortfolioItemTypeName']
            ,
            context: { 
                project: null,
                workspace: '/workspace/' + workspace_oid
            }

        }).load({
            callback : function(records, operation, successful) {
                if (successful){
                    me.logger.log('records',records);
                    var epms_id_projects = {};
                    Ext.Array.each(records,function(rec){
                         if(rec.get('Feature') && rec.get('Feature').Parent && rec.get('Feature').Parent.Project){
                            if(epms_id_projects[rec.get('Feature').Parent.Project.ObjectID]){
                                epms_id_projects[rec.get('Feature').Parent.Project.ObjectID].PlanEstimate += rec.get('PlanEstimate');
                            }else{
                                epms_id_projects[rec.get('Feature').Parent.Project.ObjectID] = {'PlanEstimate' : rec.get('PlanEstimate')};
                                epms_id_projects[rec.get('Feature').Parent.Project.ObjectID].Name = rec.get('Project').Name;
                            }                            
                        }
                    });
                    me.logger.log('epms_id_projects',epms_id_projects);
                    deferred.resolve(epms_id_projects);
                }
            }
        });
        
        return deferred.promise;

    },

     _getVelocity: function(project_obejctID,workspace_oid){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;

        var today = new Date();

        var filters = [{property:'Project.ObjectID',value: project_obejctID},
                    {property:'EndDate', operator: '<=', value: today}];

        var filter = Rally.data.wsapi.Filter.and(filters);
        
        Ext.create('Rally.data.wsapi.Store', {
            model: 'Iteration',
            fetch: ['ObjectID','Name','PlanEstimate','StartDate','EndDate'],
            filters: filter,
            sorters: [{
                        property: 'EndDate',
                        direction: 'DESC'
                    }],
            limit: 3,
            pageSize:3,
            context: { 
                project: null
                ,
                workspace: '/workspace/' + workspace_oid
            }
        }).load({
            callback : function(records, operation, successful) {
                if (successful){
                    me.logger.log('_getIterations',records);

                    var result = {ProjectID:project_obejctID};
 
                    var past_velocity = 0;
                    var past_velocity_length = 0;
    

                    Ext.Array.each(records,function(iteration){
                        past_velocity += iteration.get('PlanEstimate') ? iteration.get('PlanEstimate') : 0;
                        past_velocity_length += 1;
                    });

                    result.Velocity = past_velocity_length > 0 && past_velocity > 0 ? Math.round(past_velocity / past_velocity_length):0;

                    deferred.resolve(result);

                } else {
                    me.logger.log("Failed: ", operation);
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
            fetch: ['ObjectID']
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

    _loadAStoreWithAPromise: function(model_name, model_fields){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        this.logger.log("Starting load:",model_name,model_fields);
          
        Ext.create('Rally.data.wsapi.Store', {
            model: model_name,
            fetch: model_fields
        }).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(this);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    
   _displayGrid: function(records){

        this.setLoading(false);
        //Custom store
        var store = Ext.create('Rally.data.custom.Store', {
            data: records,
            remoteSort: false
        });


        var grid = {
            xtype: 'rallygrid',
            store: store,
            showRowActionsColumn: false,
            editable: false,
            sortableColumns: true,            
            columnCfgs: this._getColumns()
        }


        this.setGrid(grid,0);


    },

    _getColumns: function() {
        var columns = [];
        var me = this;
        columns.push({dataIndex:'Program',text:'Program', flex: 2 });
        columns.push({dataIndex:'StoryPoints',text:'# Story Points Ready State', flex: 1 });
        columns.push({dataIndex:'AvgVelocity',text:'Average Velocity', flex: 1 });
        columns.push({dataIndex:'Sprints',text:'# Sprints of Ready Stories (Target 3 Sprints)', flex: 1,
                      renderer: function(Variance){
                        return Ext.util.Format.number(Variance > 0 ? Variance : 0, "000.00");
                      } 
                  });  
        return columns;
    },

    _export: function(){
        var grid = this.down('rallygrid');
        var me = this;

        if ( !grid ) { return; }
        
        this.logger.log('_export',grid);

        var filename = Ext.String.format('backlog_maturity_counts.csv');

        this.setLoading("Generating CSV");
        Deft.Chain.sequence([
            function() { return Rally.technicalservices.FileUtilities._getCSVFromCustomBackedGrid(grid) } 
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
        
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },
    
    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        this.logger.log('onSettingsUpdate',settings);
        // Ext.apply(this, settings);
        this.launch();
    }
});
