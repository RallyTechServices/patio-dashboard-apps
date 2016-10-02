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
        this.callParent();

        if ( this.getSetting('showScopeSelector') || this.getSetting('showScopeSelector') == "true" ) {

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
        }
                
        this._addComponents();
    },
      
    _addComponents: function(){

        var me = this;
        if ( this.getSetting('showScopeSelector') || this.getSetting('showScopeSelector') == "true" ) {

            this.addToBanner({
                xtype: 'quarteritemselector',
                stateId: this.getContext().getScopedStateId('app-selector'),
                context: this.getContext(),
                workspaces: me.workspaces,
                stateful: false,
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
        second_day = Rally.util.DateTime.add(second_day,'day', 1);// add a day to start date to get the end of the day.        

        me.setLoading('Loading...');
        TSUtilities.getPortfolioItemTypes(workspace).then({
            success: function(types) {
                if ( types.length < 3 ) {
                    this.logger.log("Cannot find a record type for EPMS project in workspace:",workspace._refObjectName);
                    deferred.resolve([]);
                } else {
                    this.setLoading('Loading Workspace ' + workspace_name);
                    
                    var epmsModelPath = types[2].get('TypePath');
                    var epmsModelName = types[2].get('Name');
     
                    me._getEPMSProjectsFromSnapshotStore(second_day,workspace_oid,epmsModelPath).then({
                        scope: me,
                        success: function(programs){
                            
                            if (!programs || !programs.length > 0 ) {
                                deferred.resolve({});
                                return;
                            } 
                            
                            var item_hierarchy_ids = [];

                            Ext.Array.each(programs,function(res){
                                item_hierarchy_ids.push({
                                    "ObjectID":res.get('ObjectID'),
                                    "EPMSProject":res.get('Project').Name
                                });
                            })
                            
                            this._getStoriesFromSnapShotStore(second_day,workspace_oid,item_hierarchy_ids).then({
                                success:function(story_snapshots){
                                    var promises = [];
                                    if(!story_snapshots || story_snapshots.length == 0){
                                        deferred.resolve([]);
                                        return;
                                    }

                                    me._getStoryPointsReadyState(story_snapshots,workspace_oid,epmsModelName).then({
                                        success: function(stories_by_program){

                                            if(Ext.Object.getKeys(stories_by_program).length === 0){
                                                deferred.resolve([]);
                                                return;
                                            }

                                            var programs_by_name = {};
                                            Ext.Object.each(stories_by_program,function(key,value){
                                                var plan_estimate = 0;
                                                Ext.Array.each(value, function(story){
                                                    var size = story.get("PlanEstimate") || 0;
                                                    if ( story.snapshot && story.snapshot.get('Ready') ) {
                                                        plan_estimate = plan_estimate + size;
                                                    }
                                                });
                                                programs[key] = {
                                                    stories: value,
                                                    PlanEstimate: plan_estimate
                                                };
                                            });
                                            
                                            Ext.Object.each(stories_by_program,function(key,value){
                                                promises.push(me._getVelocity(key,workspace_oid,value));
                                            });
                                                                                        
                                            Deft.Promise.all(promises).then({
                                                scope: this,
                                                success: function(all_projects_velocity){
                                                    var backlog_data = [];
                                                    Ext.Array.each(all_projects_velocity,function(vel){
                                                        
                                                        var backlog_rec = {
                                                            ObjectID: vel.ProjectID,
                                                            Program: vel.ProjectID,
                                                            StoryPoints: programs[vel.ProjectID].PlanEstimate > 0 ? programs[vel.ProjectID].PlanEstimate:0,
                                                            AvgVelocity: vel.Velocity,
                                                            Sprints: vel.Velocity > 0 && programs[vel.ProjectID].PlanEstimate > 0 ? (programs[vel.ProjectID].PlanEstimate / vel.Velocity) : 0
                                                        }
                                                        backlog_data.push(backlog_rec);

                                                    });
                                                    deferred.resolve(backlog_data);
                                                },
                                                failure: function(error_msg) { deferred.reject(error_msg); }
                                            });
                                        },
                                        failure: function(msg) {
                                            deferred.reject(msg);
                                        },
                                        scope: this
                                    });
                                },
                                failure: function(error) { deferred.reject(error); }
                            });
                        },
                        failure: function(error){
                            deferred.reject(error);
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

    // get the epms projects in the appropriate programs
    _getEPMSProjectsFromSnapshotStore:function(date,workspace_oid,epmsModelPath){
        var me = this;
        var deferred = Ext.create('Deft.Deferred');
        
        var find = {
            "_TypeHierarchy": epmsModelPath,
            "__At": Rally.util.DateTime.toIsoString(date)
        };
        
        if(me.programObjectIds && me.programObjectIds.length > 0){
            find["Project"] = {"$in": me.programObjectIds};
        }

        workspace_oid = '/workspace/'+workspace_oid;
        
        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', {
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
                deferred.resolve(records);
            },
            scope:this
        });
    
        return deferred;
        
    },
    
    _getStoriesFromSnapShotStore: function(second_day,workspace_oid,item_hierarchy_ids) {
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
            //"Ready": true,
            "__At": second_day
        };

        workspace_oid = '/workspace/'+workspace_oid;
        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', {
            "context": {"workspace": workspace_oid },
            "fetch": [ "ObjectID","PlanEstimate","Project","Feature","_ItemHierarchy","Ready"],
            "find": find,
            "sort": { "_ValidFrom": -1 },
            //"useHttpPost":true,
            "removeUnauthorizedSnapshots":true,            
            "hydrate": ["Project"]
        });

        snapshotStore.load({
            callback: function(records, operation) {
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

    _getStoryPointsReadyState :function(story_snapshots,workspace_oid,epmsModelName){
        var me = this;

        var deferred = Ext.create('Deft.Deferred');

        if(!story_snapshots || !story_snapshots.length > 0){
            deferred.resolve({});
            return deferred;
        }
        var object_id_filters = [];

        Ext.Array.each(story_snapshots, function(story){
            object_id_filters.push({property:'ObjectID',value:story.get('ObjectID')});
        })

        Ext.create('Rally.data.wsapi.Store', {
            model: 'UserStory',
            filters: Rally.data.wsapi.Filter.or(object_id_filters),
            enablePostGet:true,
            fetch:['ObjectID','Project','PlanEstimate','Name','PortfolioItemType','Feature','Parent'],
            limit: Infinity,
            pageSize: 2000,
            context: { 
                project: null,
                workspace: '/workspace/' + workspace_oid
            }

        }).load({
            callback : function(stories, operation, successful) {
                if (successful){
                    var records_by_oid = {};
                    
                    Ext.Array.each(stories,function(story){
                        records_by_oid[story.get('ObjectID')] = story;
                    });
                    
                    Ext.Array.each(story_snapshots, function(snapshot){
                        var oid = snapshot.get('ObjectID');
                        if (records_by_oid[oid]) {
                            records_by_oid[oid].EPMSProject = snapshot.EPMSProject;
                            records_by_oid[oid].snapshot = snapshot;
                        }
                    });
                                        
                    var stories_by_program = me._organizeStoriesByProgram(Ext.Object.getValues(records_by_oid));

                    deferred.resolve(stories_by_program);
                }
            }
        });
        
        return deferred.promise;

    },

    _organizeStoriesByProgram: function(stories){
        var me = this,
            stories_by_program = {};
        
        Ext.Array.each(stories, function(story){
            var program = story.EPMSProject;
            if ( Ext.isEmpty(stories_by_program[program]) ) {
                stories_by_program[program] = [];
            }
                stories_by_program[program].push(story);
        });
        
        return stories_by_program;
    },

     _getVelocity: function(program_name,workspace_oid,stories){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        
        var project_oid = -1;
        
        Ext.Array.each(stories, function(story){
            project_oid = story.get('Project').ObjectID;
        });

        var today = new Date();

        var filters = [
            {property:'Project.ObjectID',value: project_oid},
            {property:'EndDate', operator: '<=', value: today}
        ];

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
                project: null,
                workspace: '/workspace/' + workspace_oid
            }
        }).load({
            callback : function(records, operation, successful) {
                if (successful){

                    var result = {ProjectID:program_name};
 
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
            margin: '0 10 50 150',
            boxLabel: 'Program Parent in Each Workspace<br/><span style="color:#999999;"> ' +
            '<p/>' + 
            '<em>Programs are the names of projects that hold EPMS Projects.  Choose a new row ' +
            'for each workspace you wish to display, then choose the AC project underwhich the ' + 
            'leaf projects that represent programs live.</em>' +
            '</span>'
        }];
    }
});
