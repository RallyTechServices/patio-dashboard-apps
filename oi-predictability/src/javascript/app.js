
Ext.define("OIPApp", {
    extend: 'CA.techservices.app.GridApp',

    descriptions: [
        "<strong>OCIO Dashboard - Predictability</strong><br/>" +
        "<br/>" +
        "Predictability is measured as a percentage by dividing the amount of committed story " +
        "points by the amount of earned story points." +
        "Committed Points: Total points as of the end of first day of the quarter <br>" +
        "Earned Points: Total points as of today <br>" +
        "Commitment Variance (%): (Committed Points / Earned Points) * 100 <br>"
    ],

    defaults: { margin: 10 },
   
    integrationHeaders : {
        name : "OIPApp"
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
            success: function(rows) {
                rows = Ext.Array.flatten(rows);
                var clean_rows = {};
                
                Ext.Array.each(this.programs,function(program_info){
                    Ext.Array.each(rows, function(row){
                        if ( program_info.Name == row.Name ) {
                            clean_rows[row.Name] = row;
                        }
                    });
                });
 
                me._displayGrid(Ext.Object.getValues(clean_rows));
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem gathering data', msg);
            }
        }).always(function() { me.setLoading(false); });
    },
    
    _getUniqueRows: function(items){
        items = Ext.Array.flatten(items);
        var rows = {};
        Ext.Array.each(items, function(item){
            rows[item.Program] = item;
        });
        return Ext.Object.getValues(rows);
    },

    _getDataForWorkspace: function(workspace) {
        var me = this;
        var deferred = Ext.create('Deft.Deferred');
        var workspace_name = workspace.Name ? workspace.Name : workspace.get('Name');
        var workspace_oid = workspace.ObjectID ? workspace.ObjectID : workspace.get('ObjectID');

        var second_day = new Date(this.quarterRecord.get('startDate'));
        second_day = Rally.util.DateTime.add(second_day,'day', 1);// add a day to start date to get the end of the day.        

        this.setLoading("Gathering Data For " + workspace.Name);

        TSUtilities.getPortfolioItemTypes(workspace).then({
            success: function(types) {
                if ( types.length < 3 ) {
                    this.logger.log("Cannot find a record type for EPMS project",workspace._refObjectName);
                    deferred.resolve([]);
                } else {
                    
                    var epmsModelPaths = [types[2].get('TypePath'),types[1].get('TypePath')];
                    
                    Deft.Chain.sequence([
                        function() { return me._getEPMSProjectsOn(new Date(),workspace,epmsModelPaths); },
                        function() { return me._getEPMSProjectsOn(second_day,workspace,epmsModelPaths); }
                    ],me).then({
                        scope: me,
                        success: function(results){
                            var programs_now = results[0];
                            var programs_then = results[1];
                            
                            var program_names = Ext.Object.getKeys(programs_now);
                            Ext.Object.each(programs_then, function(program,info){
                                program_names.push(program);
                            });
                            
                            var rows = [];
                            
                            Ext.Array.each(program_names, function(program_name){
                                var row = {
                                    program: program_name,
                                    epms_projects: [],
                                    earned_points: 0,
                                    planned_points: 0,
                                    Name: program_name,
                                    variance: null
                                };
                                
                                var program_then = programs_then[program_name];
                                if ( program_then ) {
                                    var start_plan = program_then.planned_points || 0;
                                    var start_earned = program_then.earned_points || 0;
                                    row.planned_points = start_plan - start_earned;
                                }
                                
                                var program_now = programs_now[program_name];
                                if ( program_now ) {
                                    row.earned_points = program_now.earned_points || 0; 
                                    row.variance = row.earned_points > 0 && row.planned_points > 0 ? (row.earned_points / row.planned_points) * 100 : 0
                                }
                                
                                rows.push(row);
                            });
                            
                            deferred.resolve(rows);
                        }
                    });
                }
            },
            failure: function(msg){
                deferred.reject(msg);
            },
            scope: this
        });

        return deferred.promise;
    },

    _getPortfolioItems: function(typepath,workspace) {
        var config = {
            model: typepath,
            enablePostGet:true,
            fetch:['ObjectID','Project','LeafStoryPlanEstimateTotal','Name','AcceptedLeafStoryPlanEstimateTotal'],
            context: { 
                project: null,
                workspace: workspace._ref
            }
        };
        
        return this._loadWsapiRecords(config);
    },

    // get the level 1 or level 2 (from the bottom) portfolio items from the given workspace
    // as they are now
    _getEPMSProjects:function(workspace,epmsModelPaths){
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
                            epms_projects: [],
                            earned_points: 0,
                            planned_points: 0,
                            Name: project_name
                        }
                    }
                    
                    epms_programs_by_project_name[project_name].epms_projects.push(pi.getData());
                    var planned_size = pi.get('LeafStoryPlanEstimateTotal') || 0;
                    epms_programs_by_project_name[project_name].planned_points += planned_size;                    var accepted_size = pi.get('AcceptedLeafStoryPlanEstimateTotal') || 0;
                    var accepted_size = pi.get('AcceptedLeafStoryPlanEstimateTotal') || 0;
                    epms_programs_by_project_name[project_name].earned_points += accepted_size;
                });
                deferred.resolve(epms_programs_by_project_name);
            },
            failure: function(msg) {
                deferred.reject(msg)
            }
        });
        return deferred.promise;
    },

    // 
    _getEPMSProjectsOn:function(date,workspace,epmsModelPaths){
        var me = this,
            deferred = Ext.create('Deft.Deferred');

        var find = {
            "_TypeHierarchy": { "$in": [ epmsModelPaths[0],epmsModelPaths[1] ] },
            "__At": date
        };
        
        var config = {
            context: { 
                project: null,
                workspace: workspace._ref
            },
            "fetch": [ "ObjectID","LeafStoryPlanEstimateTotal","Project","AcceptedLeafStoryPlanEstimateTotal"],
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
                            earned_points: 0,
                            Name: project_name
                        }
                    }
                    
                    epms_programs_by_project_name[project_name].epms_projects.push(pi.getData());
                    var planned_size = pi.get('LeafStoryPlanEstimateTotal') || 0;
                    epms_programs_by_project_name[project_name].planned_points += planned_size;                    var accepted_size = pi.get('AcceptedLeafStoryPlanEstimateTotal') || 0;
                    var accepted_size = pi.get('AcceptedLeafStoryPlanEstimateTotal') || 0;
                    epms_programs_by_project_name[project_name].earned_points += accepted_size;
                });
                deferred.resolve(epms_programs_by_project_name);
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
        });
    
        return deferred;
    },
    
    _loadLookbackRecords: function(config){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var default_config = {
            "sort": { "_ValidFrom": -1 },
            "removeUnauthorizedSnapshots":true,
            "useHttpPost":true
        };

        Ext.create('Rally.data.lookback.SnapshotStore', Ext.Object.merge(default_config,config)).load({
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
       console.log('rows:', records);
       
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
        columns.push({dataIndex:'Name',text:'Program', flex: 1 });
        columns.push({dataIndex:'planned_points',text:'Committed Points', flex: 1 ,align:'right'});
        columns.push({dataIndex:'earned_points',text:'Earned Points', flex: 1 ,align:'right' });
        columns.push({dataIndex:'variance',text:'Commitment Variance', flex: 1, align:'right',
            renderer: function(Variance){
                return Ext.util.Format.number(Variance > 0 ? Variance : 0, "000.00")+'%';
            } 
        });  
        return columns;
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
    },
        
    _export: function(){
        var grid = this.down('rallygrid');
        var me = this;

        if ( !grid ) { return; }
        
        var filename = Ext.String.format('predictability_counts.csv');

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
    }
});
