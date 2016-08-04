
Ext.define("OIBMApp", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
   
    integrationHeaders : {
        name : "OIBMApp"
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

       
        me._getStoryPointsReadyState().then({
            scope: me,
            success: function(records){
                me.logger.log('updateQuarters',records);
                var promises = [];

                Ext.Object.each(records,function(key,value){
                    promises.push(me._getVelocity(key));
                });

                Deft.Promise.all(promises).then({
                    scope: this,
                    success: function(all_projects_velocity){
                        me.logger.log('all_projects_velocity',all_projects_velocity);

                        backlog_data = []
                        Ext.Array.each(all_projects_velocity,function(vel){
                            
                            var backlog_rec = {
                                Program: records[vel.ProjectID].Name,
                                StoryPoints: records[vel.ProjectID].PlanEstimate > 0 ? records[vel.ProjectID].PlanEstimate:0,
                                AvgVelocity: vel.Velocity,
                                Sprints: vel.Velocity > 0 && records[vel.ProjectID].PlanEstimate > 0 ? (records[vel.ProjectID].PlanEstimate / vel.Velocity) : 0
                            }
                            backlog_data.push(backlog_rec);

                        });


                        me._displayGrid(backlog_data);


                    },
                    failure: function(error_msg) { deferred.reject(error_msg); }
                });

            }
        });
        //return deferred.promise;


    },


    _getStoryPointsReadyState :function(){
        var me = this;
        var deferred = Ext.create('Deft.Deferred');

        var model_name = me.piType;
        var model_filters = [{property: "Feature.Parent.PortfolioItemType.Name", value: "Initiative"},{property:"Ready", value:"true"}];

        model_filters = Rally.data.wsapi.Filter.and(model_filters);

        Ext.create('Rally.data.wsapi.Store', {
            model: 'UserStory',
            filters: model_filters,
            enablePostGet:true,
            fetch:['ObjectID','Project','PlanEstimate','Name','PortfolioItemType','Feature','Parent','PortfolioItemTypeName'],
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
                            epms_id_projects[rec.get('Project').ObjectID].PlanEstimate += rec.get('PlanEstimate');
                        }else{
                            epms_id_projects[rec.get('Project').ObjectID] = {'PlanEstimate' : rec.get('PlanEstimate')};
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

     _getVelocity: function(project_obejctID){
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
            pageSize:3
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
        this.displayContainer.removeAll();
        //Custom store
        var store = Ext.create('Rally.data.custom.Store', {
            data: records,
            remoteSort: false
        });


        this.logger.log('_displayGrid>>',store);


         this.headerContainer.add({
            xtype:'rallybutton',
            itemId:'export_button',
            text: 'Download CSV',
            margin:10,
            align:'right',
            disabled: false,
            iconAlign: 'right',
            listeners: {
                scope: this,
                click: function() {
                    this._export();
                }
            },
            margin: '10',
            scope: this
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

        var filename = Ext.String.format('quarter-commit-snapshot.csv');

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
