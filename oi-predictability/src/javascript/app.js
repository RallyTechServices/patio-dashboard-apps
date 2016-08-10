
Ext.define("OIPApp", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
   
    integrationHeaders : {
        name : "OIPApp"
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
    },

    updateQuarters: function(quarterAndPrograms){
        //var deferred = Ext.create('Deft.Deferred');
        this.logger.log('updateQuarters',quarterAndPrograms);
        var me = this;
        this.quarterRecord = quarterAndPrograms.quarter;
        this.programObjectIds = quarterAndPrograms.programs;


        var second_day = new Date(this.quarterRecord.get('startDate'));
        second_day.setDate(second_day.getDate() + 1) // add a day to start date to get the end of the day.

        Deft.Promise.all([
            me._getEPMSProjects(),
            me._getDataFromSnapShotStore(second_day)
        ],me).then({
            scope: me,
            success: function(records){
                me.logger.log('updateQuarters',records);
                var merged_results = Ext.Object.merge(records[0],records[1]);
                me.logger.log('updateQuarters-merged',Ext.Object.merge(records[0],records[1]));

                predict_data = []
                Ext.Object.each(merged_results,function(key,val){
                    var predict_rec = {
                        Program: val.Name,
                        CommittedPoints: val.CommittedPoints,
                        EarnedPoints: val.EarnedPoints,
                        Variance: val.EarnedPoints > 0 && val.CommittedPoints > 0 ? (val.EarnedPoints / val.CommittedPoints) * 100 : 0
                    }
                    predict_data.push(predict_rec);
                })

                me._displayGrid(predict_data);

            }
        });
    },


    _getEPMSProjects:function(){
        var me = this;
        var deferred = Ext.create('Deft.Deferred');

        var model_name = me.epmsModelPath;

        var config = {
            model: model_name,
            enablePostGet:true,
            fetch:['ObjectID','Project','LeafStoryPlanEstimateTotal','Name'],
            context: { 
                project: null
                //,
                //workspace: '/workspace/' + workspace_oid
            }
        };

        if(me.programObjectIds && me.programObjectIds.length > 0){

            var model_filters = [];

            Ext.Array.each(me.programObjectIds,function(objId){
                model_filters.push({property:'Project.ObjectID',value:objId});
            })

            model_filters = Rally.data.wsapi.Filter.or(model_filters);
                        
            config["filters"] =  model_filters;

        }


        Ext.create('Rally.data.wsapi.Store', config).load({
            callback : function(records, operation, successful) {
                if (successful){
                    me.logger.log('records',records);
                    var epms_id_projects = {};
                    Ext.Array.each(records,function(rec){
                        if(epms_id_projects[rec.get('Project').ObjectID]){
                            epms_id_projects[rec.get('Project').ObjectID].EarnedPoints += rec.get('LeafStoryPlanEstimateTotal');
                        }else{
                            epms_id_projects[rec.get('Project').ObjectID] = {'EarnedPoints' : rec.get('LeafStoryPlanEstimateTotal')};
                            epms_id_projects[rec.get('Project').ObjectID].Name = rec.get('Project').Name;

                        }
                    });
                    me.logger.log('epms_id_projects',epms_id_projects);
                    deferred.resolve(epms_id_projects);
                }
            }
        });
        
        return deferred.promise;

    },


    _getDataFromSnapShotStore:function(date){
        var me = this;
        var deferred = Ext.create('Deft.Deferred');


        var find = {
                        "_TypeHierarchy": me.epmsModelPath,
                        "__At": date
                    };
        if(me.programObjectIds && me.programObjectIds.length > 0){
            find["Project"] = {"$in": me.programObjectIds};
        }

        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', {
            //"context": this.getContext().getDataContext(),
            "fetch": [ "ObjectID","LeafStoryPlanEstimateTotal","Project"],
            "find": find,
            "sort": { "_ValidFrom": -1 },
            useHttpPost:true,
             "hydrate": ["Project"]
        });

        snapshotStore.load({
            callback: function(records, operation) {
               this.logger.log('Lookback Data>>>',records,operation);
               var epms_id_projects = [];
                Ext.Array.each(records,function(rec){
                    if(epms_id_projects[rec.get('Project').ObjectID]){
                        epms_id_projects[rec.get('Project').ObjectID].CommittedPoints += rec.get('LeafStoryPlanEstimateTotal');
                    }else{
                        epms_id_projects[rec.get('Project').ObjectID] = {'CommittedPoints' : rec.get('LeafStoryPlanEstimateTotal')};
                        epms_id_projects[rec.get('Project').ObjectID].Name = rec.get('Project').Name;
                    }                
                });
                deferred.resolve(epms_id_projects);
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
        this.displayContainer.removeAll();
        //Custom store
        var store = Ext.create('Rally.data.custom.Store', {
            data: records,
            remoteSort: false
        });


        this.logger.log('_displayGrid>>',store);

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

        var grid = {
            xtype: 'rallygrid',
            store: store,
            showRowActionsColumn: false,
            editable: false,
            //defaultSortToRank: true,
            sortableColumns: true,            
            columnCfgs: this._getColumns(),
            width: this.getWidth()
        }

        this.logger.log('grid before rendering',grid);

        this.displayContainer.add(grid);


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
            fieldLabel: 'Show Scope Selector',
            //bubbleEvents: ['change'],
            labelAlign: 'right',
            labelCls: 'settingsLabel'
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
