Ext.define("OIBMApp", {
    extend: 'CA.techservices.app.GridApp',

    descriptions: [
        "<strong>OCIO Dashboard - Backlog Maturity</strong><br/>" +
            "<br/>" +
            "Backlog Maturity based on the stories that are in ready state at the end of the first day of the quarter and the average velocity for that program.<br/>" + 
            "Counts are based on all the stories that were on Ready state at the end of the first day of the quarter." + 
            "<br/><br/>" + 
            "Velocity is determined by:  finding accepted stories that descend from EPMS projects in the chosen program, then " + 
            "determining the velocities of the last three sprints of the projects associated with the stories.  The velocity " +
            "averaged for each set of three sprints, but then added together for all the associated projects."
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
        var me = this;
        this.quarterRecord = quarterAndPrograms.quarter;
        this.programs = [];

        //if there are programs selected from drop down get the corresponding workspace and get data 
        //quarterAndPrograms.allPrograms[quarterAndPrograms.programs[0]].workspace.ObjectID
        var workspaces_of_selected_programs = {};
        Ext.Array.each(quarterAndPrograms.programs,function(selected){
            var ws = quarterAndPrograms.allPrograms[selected].workspace;
            
            workspaces_of_selected_programs[ws.ObjectID] = {
                Name: ws.Name,
                ObjectID: ws.ObjectID,
                _ref: ws._ref,
                workspaceName: ws.workspaceName,
                workspaceObjectID: ws.workspaceObjectID
            };
            me.programs.push(quarterAndPrograms.allPrograms[selected].program);
        })

        if(this.programs.length < 1){
            Ext.Msg.alert('There are no chosen programs');
            return;
        }

        var promises = Ext.Array.map(Ext.Object.getValues(workspaces_of_selected_programs), function(workspace) {
            return function() { 
                return me._getDataForWorkspace( workspace ) 
            };
        });
        
        Deft.Chain.sequence(promises).then({
            scope: this,
            success: function(epms_programs_by_project_name) {
                var final_results = {};
                
                var merged_programs_by_name = {};
                
                Ext.Array.each(epms_programs_by_project_name, function(program) {
                    merged_programs_by_name = Ext.Object.merge(merged_programs_by_name,program);
                });
                
                Ext.Array.each(this.programs,function(program_info){
                    var name = program_info.Name;
                    
                    final_results[name] = {
                        velocity:0,
                        name: name,
                        sprints:0,
                        ready_points:0
                    };
                    
                    if ( merged_programs_by_name[name] ) {
                        var program = merged_programs_by_name[name];
                        final_results[name].velocity = program.velocity;
                        final_results[name].ready_points = program.ready_points;
                        final_results[name].sprints = ( program.velocity > 0 ) && program.ready_points / program.velocity;
                    }
                });
                
                me._displayGrid(final_results);
                
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem gathering data', msg);
            }
        });
    },

    _getDataForWorkspace: function(workspace) {
        var me = this,
            deferred = Ext.create('Deft.Deferred');
            
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
                    var message = Ext.String.format("Loading {0}", workspace_name);
                    
                    this.setLoading(message);
                    
                    var epmsModelPaths = [types[2].get('TypePath'),types[1].get('TypePath')];
                    Deft.Chain.pipeline([
                        function() { 
                            return me._getEPMSProjectsOn(new Date(),workspace,epmsModelPaths);
                        },
                        function(epms_programs_by_project_name) { 
                            return me._getReadyItemsInPrograms(second_day,workspace,epms_programs_by_project_name); 
                        },
                        function(epms_programs_by_project_name) { 
                            return me._getItemsInProgram(second_day,workspace,epms_programs_by_project_name); 
                        },
                        function(epms_programs_by_project_name) {
                            console.log(epms_programs_by_project_name)
                            return me._getVelocitiesForProjectsInItems(second_day,epms_programs_by_project_name,workspace);
                        }
                    ],me).then({
                        scope: me,
                        success: function(work_items){
                            deferred.resolve(work_items);
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

    // 
    _getEPMSProjectsOn:function(date,workspace,epmsModelPaths){
        var me = this,
            deferred = Ext.create('Deft.Deferred');

        var find = {
            "_TypeHierarchy": { "$in": epmsModelPaths },
            "__At": date
        };
        
        var config = {
            context: { 
                project: null,
                workspace: workspace._ref
            },
            "fetch": [ "ObjectID","Project","Name"],
            "find": find,
            "hydrate": ["Project"]
        };
        
        this._loadLookbackRecords(config).then({
            success: function(pis) {
                var epms_programs_by_project_name = {};
                
                Ext.Array.each(pis,function(pi){
                    var project_name = pi.get('Project').Name;
                    
                    if ( Ext.isEmpty(epms_programs_by_project_name[project_name]) ) {
                        epms_programs_by_project_name[project_name] = {
                            program: pi.get('Project'),
                            epms_projects: [],
                            Name: project_name
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
    
        return deferred;
    },

    _getReadyItemsInPrograms:function(second_day,workspace,epms_items_by_project_name){
        var me = this,
            deferred = Ext.create('Deft.Deferred');
        
        var epms_oids = [];
        if ( Ext.Object.getKeys(epms_items_by_project_name).length > 0 ) {
            var epms_oids = [];
            Ext.Object.each(epms_items_by_project_name, function(key,epms_item){
                var epms_projects = epms_item.epms_projects || [];
                Ext.Array.each(epms_projects, function(epms_project){
                    epms_oids.push(epms_project.ObjectID);
                });
            });
        }

        var find = {
            "_TypeHierarchy": {"$in": ["HierarchicalRequirement"]},
            "_ItemHierarchy": {"$in": epms_oids},
            "__At": Rally.util.DateTime.toIsoString(second_day),
            "Ready": true
        };
        
        var config = {
            find: find,
            fetch: ['ObjectID','Name','FormattedID','_ItemHierarchy','PlanEstimate'],
            context: { 
                project: null,
                workspace: workspace._ref
            }
        };

        this._loadLookbackRecords(config).then({
            success: function(items) {
                Ext.Object.each(epms_items_by_project_name, function(name,epms_item){
                    var epms_projects = epms_item.epms_projects || [];
                    Ext.Array.each(epms_projects, function(epms_project){
                        var project_oid = epms_project.ObjectID;
                        Ext.Array.each(items, function(item){
                            if (Ext.Array.contains(item.get('_ItemHierarchy'), project_oid)) {
                                item.EPMSProject = name;
                            }
                        });
                    });
                });
                
                if ( Ext.Object.getKeys(epms_items_by_project_name).length > 0 ) {
                    var epms_oids = [];
                    Ext.Object.each(epms_items_by_project_name, function(key,epms_item){
                        var epms_projects = epms_item.epms_projects || [];
                        if ( Ext.isEmpty(epms_item.ready_items) ) {
                            epms_item.ready_items = [];
                            epms_item.ready_points = 0;
                        }
                        
                        Ext.Array.each(items, function(item){
                            if (item.EPMSProject == key){
                                var value = item.get('PlanEstimate') || 0;
                                epms_item.ready_items.push(item);
                                epms_item.ready_points += value;
                            }
                        });
                    });
                }
                
                deferred.resolve(epms_items_by_project_name);
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
        });
        
        return deferred.promise;
    },  
    
    // get stories so that we can figure out which projects are delivery projects
    _getItemsInProgram: function(second_day,workspace,epms_items_by_project_name){
        var me = this,
            deferred = Ext.create('Deft.Deferred');
        
        var epms_oids = [];
        if ( Ext.Object.getKeys(epms_items_by_project_name).length > 0 ) {
            var epms_oids = [];
            Ext.Object.each(epms_items_by_project_name, function(key,epms_item){
                var epms_projects = epms_item.epms_projects || [];
                Ext.Array.each(epms_projects, function(epms_project){
                    epms_oids.push(epms_project.ObjectID);
                });
            });
        }

        // FORCE to __At current to see which teams currently "belong" to an EPMS project
        var find = {
            "_ItemHierarchy": {"$in": epms_oids},
            "_TypeHierarchy": {"$in": ["HierarchicalRequirement"]},
            "__At": 'current'
//            "__At": Rally.util.DateTime.toIsoString(second_day)
        };
        
        var config = {
            find: find,
            fetch: ['ObjectID','Name','FormattedID','_ItemHierarchy']
        };

        this._loadLookbackRecords(config).then({
            success: function(items) {
                
                Ext.Object.each(epms_items_by_project_name, function(name,epms_item){
                    
                    var epms_projects = epms_item.epms_projects || [];
                    Ext.Array.each(epms_projects, function(epms_project){
                        var project_oid = epms_project.ObjectID;
                        Ext.Array.each(items, function(item){
                            if (Ext.Array.contains(item.get('_ItemHierarchy'), project_oid)) {
                                item.EPMSProject = name;
                            }
                        });
                    });
                });
                
                if ( Ext.Object.getKeys(epms_items_by_project_name).length > 0 ) {
                    var epms_oids = [];
                    Ext.Object.each(epms_items_by_project_name, function(key,epms_item){
                        var epms_projects = epms_item.epms_projects || [];
                        if ( Ext.isEmpty(epms_item.candidate_items) ) {
                            epms_item.candidate_items = [];
                        }
                        
                        Ext.Array.each(items, function(item){
                            if (item.EPMSProject == key){
                                epms_item.candidate_items.push(item);
                            }
                        });
                    });
                }
                
                deferred.resolve(epms_items_by_project_name);
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
        });
        
        return deferred.promise;
    },
    
    
    _getVelocitiesForProjectsInItems: function(second_day,epms_programs_by_project_name,workspace) {
        var me = this,
            deferred = Ext.create('Deft.Deferred');
            
        // which teams are participating in the program?
        var delivery_projects = {};
        
        Ext.Object.each(epms_programs_by_project_name, function(name,program_info) {
            var candidate_items = program_info.candidate_items;
            Ext.Array.each(candidate_items, function(item){
                delivery_projects[item.get('Project')] = 1; // oid
            });
        });
        
        // get the velocity for each project in the delivery_projects list
        var promises = [];
        Ext.Array.each(Ext.Object.getKeys(delivery_projects), function(project_oid){
            promises.push( function() { return me._getVelocityForProject(second_day,project_oid,workspace); } );
        });

        epms_programs_by_project_name = this._setDeliveryProjectsOnPrograms(epms_programs_by_project_name);
        
        Deft.Chain.sequence(promises).then({
            success: function(velocities_by_project) {
                var merged_velocities_by_project = {};
                
                Ext.Array.each(velocities_by_project, function(velocity) {
                    merged_velocities_by_project = Ext.Object.merge(merged_velocities_by_project,velocity);
                });
                                
                Ext.Object.each(epms_programs_by_project_name, function(name,program){
                    var delivery_projects = program.delivery_project_oids;
                    var velocity = 0;
                    
                    Ext.Array.each(delivery_projects, function(project_oid){
                        velocity += merged_velocities_by_project[project_oid] || 0;
                    });
                    
                    program.velocity = velocity;
                });
                deferred.resolve(epms_programs_by_project_name);
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
        });
        
        return deferred.promise;
    },
    
    _setDeliveryProjectsOnPrograms:function(epms_programs_by_project_name){
        Ext.Object.each(epms_programs_by_project_name, function(name,program){
            program.delivery_project_oids = Ext.Array.unique(
                Ext.Array.map(program.candidate_items, function(item){
                    return item.get('Project');
                })
            );
        });
        
        return epms_programs_by_project_name;
    },
        
    _getVelocityForProject: function(second_day,project_oid,workspace) {
        var me = this,
            deferred = Ext.create('Deft.Deferred');
        // get preceding three iterations
        this._getLastThreeIterations(second_day,project_oid,workspace).then({
            success: function(iterations) {
                var iteration_oids = Ext.Array.map(iterations, function(iteration){ return iteration.get('ObjectID')});
                
                me._getAcceptedItemsInIterations(iteration_oids,workspace).then({
                    success: function(accepted_items) {
                        
                        var number_of_iterations = iteration_oids.length;
                        var velocity = 0;
                        if ( number_of_iterations > 0 ) {
                            var sizes = Ext.Array.map(accepted_items, function(item){
                                return item.get('PlanEstimate') || 0;
                            });
                            velocity = Ext.Array.sum(sizes) / number_of_iterations;
                        }
                        
                        var hash = {};
                        hash[project_oid] = velocity;
                        deferred.resolve(hash);
                    },
                    failure: function(msg) {
                        deferred.reject(msg);
                    }
                }); 
            },
            failure: function(msg) {
                deferred.reject(msg);
            },
            scope: this
        });
        return deferred.promise;
    },
    
    _getLastThreeIterations: function(second_day,project_oid,workspace) {
        var search_date = second_day || new Date();
        
        var config = {
            model: 'Iteration',
            limit: 3,
            pageSize: 3,
            filters: [{property:'EndDate', operator: '<', value: Rally.util.DateTime.toIsoString(search_date)}],
            sorters: [{property:'EndDate',direction:'Desc'}],
            context: { 
                project: null,
                workspace: workspace._ref
            }
        };
        
        return this._loadWsapiRecords(config);
    },
    
    _getAcceptedItemsInIterations: function(iteration_oids,workspace) {
        var me = this;
               
        var find = {
            "_TypeHierarchy": {"$in": ["HierarchicalRequirement","Defect"]},
            "ScheduleState": "Accepted",
            "Iteration": { "$in": iteration_oids },
            "__At": 'current'
        };
        
        var config = {
            find: find,
            fetch: ['ObjectID','Name','FormattedID','PlanEstimate' ],
            context: { 
                project: null,
                workspace: workspace._ref
            }
        };

        return this._loadLookbackRecords(config);
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
    
    _loadLookbackRecords: function(config,returnOperation) {
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var default_config = {
            sort: { "_ValidFrom": -1 },
            "useHttpPost":true,
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
            data: Ext.Object.getValues(records),
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
        columns.push({dataIndex:'name',text:'Program', flex: 2 });
        columns.push({dataIndex:'ready_points',text:'# Story Points Ready State', flex: 1,align:'right' });
        columns.push({dataIndex:'velocity',text:'Average Velocity', flex: 1,align:'right',
            renderer: function(value){
                return Ext.util.Format.number(value > 0 ? value : 0, "000.00");
            } 
        });
        columns.push({dataIndex:'sprints',text:'# Sprints of Ready Stories (Target 3 Sprints)', flex: 1,align:'right',
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
            boxLabel: 'Program Parent in Each Workspace<br/><span style="color:#999999;"> ' +
            '<p/>' + 
            '<em>Programs are the names of projects that hold EPMS Projects.  Choose a new row ' +
            'for each workspace you wish to display, then choose the AC project underwhich the ' + 
            'leaf projects that represent programs live.</em>' +
            '</span>'
        }];
    }
});
