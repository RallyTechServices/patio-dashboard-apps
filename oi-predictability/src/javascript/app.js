//PortfolioItem/EPMSIDProject
// Do cross workspace setting
// 1. get all PortfolioItem/EPMSIDProject in worksapce
// 2. get all projects 
// 3. Lookback and get committed points on day 1 of quarter
// 4. Get points on current 
// 5. calculate variance
// 6. Export.
//

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

//    piType: 'PortfolioItem/EPMSIDProject',
    //TODO: find 2nd level PI
    piType: 'PortfolioItem/Initiative',

    launch: function() {
        var me = this;


        me._addComponents();
        // this.down('#message_box').update(this.getContext().getUser());
        
        // var model_name = 'Defect',
        //     field_names = ['Name','State'];
        
        // this._loadAStoreWithAPromise(model_name, field_names).then({
        //     scope: this,
        //     success: function(store) {
        //         this._displayGrid(store,field_names);
        //     },
        //     failure: function(error_message){
        //         alert(error_message);
        //     }
        // }).always(function() {
        //     me.setLoading(false);
        // });
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

    updateQuarters: function(quarterRecord){
        //var deferred = Ext.create('Deft.Deferred');

        var me = this;
        me.logger.log('updateQuarters', quarterRecord);
        var second_day = new Date(quarterRecord.get('startDate'));
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
        //return deferred.promise;


    },


    _getEPMSProjects:function(){
        var me = this;
        var deferred = Ext.create('Deft.Deferred');

        var model_name = me.piType;
        var model_filters = [];

        model_filters = Rally.data.wsapi.Filter.or(model_filters);

        Ext.create('Rally.data.wsapi.Store', {
            model: model_name,
            //filters: model_filters,
            enablePostGet:true,
            fetch:['ObjectID','Project','LeafStoryPlanEstimateTotal','Name'],
            context: { 
                project: null
                //,
                //workspace: '/workspace/' + workspace_oid
            }

        }).load({
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
        var deferred = Ext.create('Deft.Deferred');

        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', {
            //"context": this.getContext().getDataContext(),
            "fetch": [ "ObjectID","LeafStoryPlanEstimateTotal","Project"],
            "find": {
                    "_TypeHierarchy": this.piType,
                    "__At": date
            },
            "sort": { "_ValidFrom": -1 },
            //useHttpPost:true,
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


        // this.logger.log('_displayGrid>>',store);


        //  this.down('#selector_box').add({
        //     xtype:'rallybutton',
        //     itemId:'export_button',
        //     text: 'Download CSV',
        //     margin:10,

        //     disabled: false,
        //     iconAlign: 'right',
        //     listeners: {
        //         scope: this,
        //         click: function() {
        //             this._export();
        //         }
        //     },
        //     margin: '10',
        //     scope: this
        // });

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
