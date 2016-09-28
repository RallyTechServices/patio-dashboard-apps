
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
                flex: 1,
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
        this.logger.log('updateQuarters',quarterAndPrograms);
        var me = this;
        this.quarterRecord = quarterAndPrograms.quarter;
        this.programObjectIds = quarterAndPrograms.programs;

        //if there are programs selected from drop down get the corresponding workspace and get data otherwise 
        // get data from all workspaces.
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
                this.setLoading(false);
                me._displayGrid(Ext.Array.flatten(all_results));
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem gathering data', msg);
            }
        });

        
    },

    _getData: function(workspace) {
        var me = this;
        var deferred = Ext.create('Deft.Deferred');
        var workspace_name = workspace.Name ? workspace.Name : workspace.get('Name');
        var workspace_oid = workspace.ObjectID ? workspace.ObjectID : workspace.get('ObjectID');

        this.logger.log('Quarter Start:', this.quarterRecord.get('startDate'), this.quarterRecord);
        var second_day = new Date(this.quarterRecord.get('startDate'));
        second_day = Rally.util.DateTime.add(second_day,'day', 1);// add a day to start date to get the end of the day.        

        TSUtilities.getPortfolioItemTypes(workspace).then({
            success: function(types) {
                if ( types.length < 3 ) {
                    this.logger.log("Cannot find a record type for EPMS project",workspace._refObjectName);
                    deferred.resolve([]);
                } else {
                    this.setLoading('Loading Workspace ' + workspace_name);
                                        
                    var epmsModelPath = types[2].get('TypePath');

                    Deft.Promise.all([
                        me._getEPMSProjects(workspace_oid,epmsModelPath),
                        me._getDataFromSnapShotStore(second_day,workspace_oid,epmsModelPath)
                    ],me).then({
                        scope: me,
                        success: function(records){
                            var merged_results = Ext.Object.merge(records[0],records[1]);

                            predict_data = []
                            Ext.Object.each(merged_results,function(key,val){
                                var predict_rec = {
                                    Program: val.Name,
                                    CommittedPoints: val.CommittedPoints > 0 ?val.CommittedPoints:0,
                                    EarnedPoints: val.EarnedPoints,
                                    Variance: val.EarnedPoints > 0 && val.CommittedPoints > 0 ? (val.EarnedPoints / val.CommittedPoints) * 100 : 0
                                }
                                predict_data.push(predict_rec);
                            })
                            
                            deferred.resolve(predict_data);
                            
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

    _getEPMSProjects:function(workspace_oid,epmsModelPath){
        var me = this;
        var deferred = Ext.create('Deft.Deferred');

        var config = {
            model: epmsModelPath,
            enablePostGet:true,
            fetch:['ObjectID','Project','LeafStoryPlanEstimateTotal','Name','AcceptedLeafStoryPlanEstimateTotal'],
            context: { 
                project: null,
                workspace: '/workspace/' + workspace_oid
            }
        };

        if(me.programObjectIds && me.programObjectIds.length > 0){

            var model_filters = [];

            Ext.Array.each(me.programObjectIds,function(objId){
                model_filters.push({property:'Project.ObjectID',value:objId});
            })

            model_filters = Rally.data.wsapi.Filter.or(model_filters);
                        
            config.filters =  model_filters;

        }

        Ext.create('Rally.data.wsapi.Store', config).load({
            callback : function(epmsprojects, operation, successful) {
                var programs_by_project_oid = {};
                Ext.Array.each(epmsprojects,function(rec){
                    if(programs_by_project_oid[rec.get('Project').ObjectID]){
                        programs_by_project_oid[rec.get('Project').ObjectID].EarnedPoints += rec.get('AcceptedLeafStoryPlanEstimateTotal');
                    }else{
                        programs_by_project_oid[rec.get('Project').ObjectID] = {
                            EarnedPoints : rec.get('AcceptedLeafStoryPlanEstimateTotal'),
                            Name         : rec.get('Project').Name
                        };
                    }
                });
                me.logger.log('epms_projects_by_oid',programs_by_project_oid);
                deferred.resolve(programs_by_project_oid);
            }
        });
        
        return deferred.promise;

    },


    _getDataFromSnapShotStore:function(date,workspace_oid,epmsModelPath){
        var me = this;
        var deferred = Ext.create('Deft.Deferred');

        var find = {
            "_TypeHierarchy": epmsModelPath,
            "__At": date
        };
        if(me.programObjectIds && me.programObjectIds.length > 0){
            find["Project"] = {"$in": me.programObjectIds};
        }
        workspace_oid = '/workspace/'+workspace_oid;
        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', {
            "context": {"workspace": workspace_oid},
            "fetch": [ "ObjectID","LeafStoryPlanEstimateTotal","Project"],
            "find": find,
            "sort": { "_ValidFrom": -1 },
            "removeUnauthorizedSnapshots":true,            
            "useHttpPost":true,
            "hydrate": ["Project"]
        });

        snapshotStore.load({
            callback: function(records, operation) {
               var programs_by_project_oid = {};
                Ext.Array.each(records,function(rec){
                    if(programs_by_project_oid[rec.get('Project').ObjectID]){
                        programs_by_project_oid[rec.get('Project').ObjectID].CommittedPoints += rec.get('LeafStoryPlanEstimateTotal');
                    }else{
                        programs_by_project_oid[rec.get('Project').ObjectID] = {'CommittedPoints' : rec.get('LeafStoryPlanEstimateTotal')};
                        programs_by_project_oid[rec.get('Project').ObjectID].Name = rec.get('Project').Name;
                    }                
                });
                deferred.resolve(programs_by_project_oid);
            },
            scope:this
        });
    
        return deferred;
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
        //this.displayContainer.removeAll();
        //Custom store
        var store = Ext.create('Rally.data.custom.Store', {
            data: records,
            remoteSort: false
        });


        this.logger.log('_displayGrid>>',store);



        var grid = {
            xtype: 'rallygrid',
            store: store,
            showRowActionsColumn: false,
            editable: false,
            sortableColumns: true,            
            columnCfgs: this._getColumns()
        }

        this.logger.log('grid before rendering',grid);

        this.setGrid(grid,0);

        //this.displayContainer.add(grid);


    },

    _getColumns: function() {
        var columns = [];
        var me = this;
        columns.push({dataIndex:'Program',text:'Program', flex: 1 });
        columns.push({dataIndex:'CommittedPoints',text:'Committed Points', flex: 1 });
        columns.push({dataIndex:'EarnedPoints',text:'Earned Points', flex: 1 });
        columns.push({dataIndex:'Variance',text:'Commitment Variance', flex: 1,
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
            margin: '0 10 50 150',
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
        
        this.logger.log('_export',grid);

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
