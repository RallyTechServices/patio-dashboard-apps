Ext.define("TSDefectsByProgram", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },

    integrationHeaders : {
        name : "TSDefectsByProgram"
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

    updateQuarters: function(quarterRecord){
        var me = this;
        this.quarterRecord = quarterRecord;
        
        me.logger.log('updateQuarters', quarterRecord);

        //second_day.setDate(second_day.getDate() + 1) // add a day to start date to get the end of the day.

        this.setLoading("Loading data...");
        Deft.Promise.all([
            this._getEPMSProjects(),
            this._getStoriesForEPMSProjects()
        ],this).then({
            scope: this,
            success: function(results){
                var epms_id_projects = results[0];
                var stories = results[1];
                
                this.logger.log('epms_id_projects',epms_id_projects);
                this.logger.log('stories', stories);
                
                if ( stories.length === 0 ) {
                    Ext.Msg.alert('','No Defects in this Quarter');
                    return;
                }
                me.setLoading('Fetching Defects...');
                this._getDefectsForStories(stories).then({
                    scope: this,
                    success: function(defects) {
                        var defects_by_program = this._organizeDefectsByProgram(defects);
                        this._makeChart(defects_by_program);
                        this._makeGrid(defects_by_program);
                    },
                    failure: function(msg){
                        Ext.Msg.alert('',msg);
                    }
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
    
    _getStoriesForEPMSProjects: function() {
        
        this.logger.log('updateQuarters', this.quarterRecord);
        var end_date = this.quarterRecord.get('endDate');
        var start_date = this.quarterRecord.get('startDate');

        var filters = [
            {property:'Defects.CreationDate',operator:'>=',value:start_date},
            {property:'Defects.CreationDate',operator:'<=',value:end_date},
            {property:this.featureModelName + ".Parent.ObjectID", operator:">",value: 0 }
        ];
        
        var config = {
            model: 'hierarchicalrequirement',
            filters: filters,
            limit: Infinity,
            pageSize: 2000,
            fetch: ['ObjectID','FormattedID'],
            context: { project: null }
        };
        
        return this._loadWsapiRecords(config);
    },
    
    _getDefectsForStories: function(stories) {

        var end_date = this.quarterRecord.get('endDate');
        var start_date = this.quarterRecord.get('startDate');

        var date_filters = Rally.data.wsapi.Filter.and([
            {property:'CreationDate',operator:'>=',value:start_date},
            {property:'CreationDate',operator:'<=',value:end_date}
        ]);

        var story_filters = Rally.data.wsapi.Filter.or(
            Ext.Array.map(stories, function(story){
                return { property:'Requirement.ObjectID',value:story.get('ObjectID')};
            })
        );
        
        var filters = story_filters.and(date_filters);
        
        var config = {
            model: 'defect',
            filters: filters,
            limit: Infinity,
            pageSize: 2000,
            fetch: ['ObjectID','FormattedID','Project','Requirement','State',this.featureModelName,'Parent'],
            context: { project: null },
            enablePostGet: true
        };
        
        return this._loadWsapiRecords(config);
    },
    
    _organizeDefectsByProgram: function(defects){
        var me = this,
            defects_by_program = {};
        
        Ext.Array.each(defects, function(defect){
            var requirement = defect.get('Requirement');
            if ( requirement[me.featureModelName] && requirement[me.featureModelName].Parent ) {
                var program = requirement[me.featureModelName].Parent.Project._refObjectName;
                if ( Ext.isEmpty(defects_by_program[program]) ) {
                    defects_by_program[program] = {
                        all: [],
                        open: [],
                        closed:[]
                    };
                }
                defects_by_program[program].all.push(defect);
                if ( defect.get('State') == "Closed" ) {
                    defects_by_program[program].closed.push(defect);
                } else {
                    defects_by_program[program].open.push(defect);
                }
            }
        });
        
        return defects_by_program;
    },

    _makeChart: function(defects_by_program) {
        this.displayContainer.removeAll();
        
        this.displayContainer.add({
            xtype: 'rallychart',
            loadMask: false,
            chartData: this._getChartData(defects_by_program),
            chartConfig: this._getChartConfig()
        });
    },

    _makeGrid: function(defects_by_program) {
        var rows = [];
        
         Ext.Object.each(defects_by_program, function(key,value){
            var row =  {
                program: key,
                open: value.open.length,
                closed: value.closed.length,
                all: value.all.length
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
            { dataIndex:'open', text: 'Defects Open' },
            { dataIndex:'closed', text: 'Defects Closed' },
            { dataIndex:'all', text: 'Total Defects' }
        ];
    },
    
    _getChartData: function(defects_by_program) {
        
        var categories = Ext.Object.getKeys(defects_by_program);
        
        var all_data = [];
        var open_data = [];
        var closed_data = [];
        
        Ext.Object.each(defects_by_program, function(key,value){
            all_data.push(value.all.length);
            open_data.push(value.open.length);
            closed_data.push(value.closed.length);
        });
        
        return { 
            series: [ 
                { name: "Defects Open", data: open_data },
                { name: "Defects Closed", data: closed_data },
                { name: "Total Defects", data: all_data },
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
                text: 'Defects Open vs. Closed'
            },
            xAxis: {
            },
            yAxis: {
                min: 0,
                    title: {
                    text: 'Number of Defects'
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
        
        var filename = 'defect_counts.csv';

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
