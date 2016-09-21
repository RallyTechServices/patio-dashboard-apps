Ext.define("TSValidationApp", {
extend: 'CA.techservices.app.ChartApp',
    //stateId: this.getContext().getScopedStateId('CA.validationApp.1'), // automatically save a cookie (apps need unique stateIds)
    stateful: true,
    stateEvents: ['refreshrules'],
    description: '<strong>Data Validation</strong>' +
                '<p/>' + 
                'The stacked bar chart shows a count of items that fail the various validation rules.  Each bar ' +
                'represents a team and record type.  For a story to be evaluated, it needs to be either In-Progress or Completed or ' +
                'Defined (when also Ready).  For a task to be evaluated, its story needs to meet the same state rule.' +
                '<p/>' + 
                '<strong>Rules</strong>' +
                '<p/>',
    
    integrationHeaders : {
        name : "TSValidationApp"
    },

    config: {
        chartLabelRotationSettings:{
            rotateNone: 0,
            rotate45: 5,
            rotate90: 10 
        },
        defaultSettings: {
            showPatterns: false,
            showStoryRules: true,
            showTaskRules: false,
            showFeatureNoEpic: false,
            showEpicNoEpms: false,
            showEpmsNoInitiative: false,
            showInitiativeNoObjective: false,
            showObjectiveNoGoal: false
        }
    },

    rulesByType: {
        Task: [
            {xtype:'tstaskrequiredfieldrule',  requiredFields: ['Owner']},
            {xtype:'tstasktodonoestimate'},
            {xtype:'tstaskactivenotodo'},
            {xtype:'tstaskcompletednoactuals'}
        ],
        HierarchicalRequirement: [
            {xtype:'tsstoryrequiredfieldrule', requiredFields: ['Release','Owner','Description','Feature',
                'c_AcceptanceCriteria','c_Type','c_IsTestable']},
            {xtype:'tsstorycompletednoactuals'},
            {xtype:'tsstorywithoutepmsid'},
            {xtype:'tsstorynonullplanestimaterule' },
            {xtype: 'tsstorywithfeatureandfeatureprojectnotdeliveryroot'}            
        ],
        PortfolioItem: [            
            {xtype:'tsfeatureunscheduledprojectnotstrategyrootrule'},
            {xtype: 'tsfeaturescheduledprojectnotdeliveryrootrule'},
            {xtype: 'tsfeaturewithoutparentrule'},
            {xtype: 'tsepicwithoutparentrule'}
        ]
    },
    
    launch: function() {
        this.callParent();
        
        this.addEvents(
            /**
             * @event refreshrules
             * Fires when rules have been changed and the user closes the dialog box
             */
            'refreshrules'
        );
        // dynamically lookup portfolio item type names
        this._fetchPortfolioItemTypes().then({
            success: this._initializeApp, 
            failure: this._showErrorMsg,
            scope: this
        });  
    },
    _loadData:function(){
        
        console.log("_loadData:", this.validator);

        this.description = this.description + this.validator.getRuleDescriptions();
        
        var precheckResults = this.validator.getPrecheckResults();
        if (precheckResults == null){
            this._processPrecheckResults([]);
        } else {

            precheckResults.then({
                scope: this,
                success: this._processPrecheckResults,
                failure: function(msg) {
                    Ext.Msg.alert('Problem with precheck', msg);
                }
            });
        }               
    },
    _processPrecheckResults: function(issues){
        var messages = Ext.Array.filter(issues, function(issue){
            return !Ext.isEmpty(issue);
        });
        
        if ( messages.length > 0 ) {
            var append_text = "<br/><b>Precheck Issues:</b><br/><ul>";
            Ext.Array.each(messages, function(message){
                append_text += '<li>' + message + '</li>';
            });
            append_text += "</ul>";
            
            this.description = this.description + " " + append_text;
        }
        
        this.setDescription();
        this._updateData();
    },
    _updateData: function() {
        var me = this;
        this.setLoading("Loading data...");
        
        Deft.Chain.pipeline([
            function() { 
                me.setLoading("Gathering data...");
                return me.validator.gatherData(); 
            },
            function() { 
                me.setLoading("Analyzing data...");
                return me.validator.getChartData(); 
            }
        ]).then({
            scope: this,
            success: function(results) {
                
                if ( results.categories && results.categories.length === 0 ) {
                    Ext.Msg.alert('','No violations found');
                    return;
                }
                
                this.display_rows = Ext.Object.getValues( this.validator.recordsByModel );
                
                this._makeChart(results);
                this.down('#export_button').setDisabled(false);
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem loading data', msg);
            }
        }).always(function() { me.setLoading(false); });
        
    }, 
    
    _instantiateValidator: function() {
        var me = this;
                
        var validator = Ext.create('CA.techservices.validator.Validator',{
            rules: this.ruleConfigs,
            fetchFields: ['FormattedID','ObjectID'],
            baseFilters: {
                HierarchicalRequirement: this.story_filter, 
                Task: this.task_filter                
            },        
            pointEvents: {
                click: function() {
                    me.showDrillDown(this._records,this._name);
                }
            }
        });
        
        return validator;
    },
    
    _addSelectors: function() {
        var container = this.down('#banner_box');
        container.removeAll();
        
        container.add({xtype:'container',flex: 1});
        
        container.add({
            xtype:'rallybutton',
            itemId:'rules_selection_button',
            cls: 'secondary',
            text: 'Select Rules',
            disabled: false,
            listeners: {
                scope: this,
                click: function() {
                    console.log('addSelectors: ',this.defaultSettings.showEpicNoEpms);

                    this._showRulesSelection();
                }
            }
        });

        container.add({
            xtype:'rallybutton',
            itemId:'export_button',
            cls: 'secondary',
            text: '<span class="icon-export"> </span>',
            disabled: true,
            listeners: {
                scope: this,
                click: function() {
                    this._export();
                }
            }
        });
    },
    
    _makeChart: function(data) {
        var me = this;
        
        this.logger.log('_makeChart', data);
        var colors = CA.apps.charts.Colors.getConsistentBarColors();
        
        if ( this.getSetting('showPatterns') ) {
            colors = CA.apps.charts.Colors.getConsistentBarPatterns();
        }
        
        this.setChart({
            chartData: data,
            chartConfig: this._getChartConfig(data),
            chartColors: colors
        });
    },
    
    _getChartConfig: function(data) {
        var me = this;
        
        
        var title_prefix = "";
        if ( this.getSetting('showStoryRules') && !this.getSetting('showTaskRules') ) {
            title_prefix = "Story ";
        }
        if ( this.getSetting('showTaskRules') && !this.getSetting('showStoryRules')) {
            title_prefix = "Task ";
        }
        
        return {
            chart: { type:'column' },
            title: { text: title_prefix + 'Validation Results' },
            xAxis: this._rotateProjectLabels(data.categories.length), // returns label rotation styling
            yAxis: { 
                min: 0,
                title: { text: 'Count' }
            },
            plotOptions: {
                column: {
                    stacking: 'normal'
                }
            }
        }
    },
    
    showDrillDown: function(records, title) {
        var me = this;

        var store = Ext.create('Rally.data.custom.Store', {
            data: records,
            pageSize: 2000
        });
        
        Ext.create('Rally.ui.dialog.Dialog', {
            id        : 'detailPopup',
            title     : title,
            width     : 500,
            height    : 400,
            closable  : true,
            layout    : 'border',
            items     : [
            {
                xtype                : 'rallygrid',
                region               : 'center',
                layout               : 'fit',
                sortableColumns      : true,
                showRowActionsColumn : false,
                showPagingToolbar    : false,
                columnCfgs           : [
                    {
                        dataIndex : 'FormattedID',
                        text: "id",
                        renderer: function(value,meta,record){
                            return Ext.String.format("<a href='{0}' target='_top'>{1}</a>",Rally.nav.Manager.getDetailUrl(record.get('_ref')),value);
                        }
                    },
                    {
                        dataIndex : 'Name',
                        text: "Name",
                        flex: 1
                    },
                    {
                        dataIndex: '__ruleText',
                        text: 'Violations',
                        flex: 2,
                        renderer: function(value, meta, record) {
                            if ( Ext.isEmpty(value) ) { return ""; }
                            var display_value = "";
                            Ext.Array.each(value, function(violation){
                                display_value = display_value + Ext.String.format("<li>{0}</li>", violation);
                            });

                            return Ext.String.format("<ul>{0}</ul>", display_value);
                        }
                    }
                ],
                store : store
            }]
        }).show();
    },
    _showRulesSelection: function() {
        var me = this;
        var rules = this.validator.getRules();

        console.log("_showRulesSelection:",rules);

        Ext.create('CA.technicalservices.RulePickerDialog',{
            rules: rules,
            listeners: {
                scope: this,
                itemschosen: function(dialog,rules){
                    console.log('ShowRulesDialogItemsChosen:',dialog,rules);
                    this.validator.rules = rules;
                    this.fireEvent('refreshrules'); // fire the app level save of rules
                    this._loadData();                    
                }    
            }
        }).show();
    },
    
    _export: function(){
        var me = this;
        this.logger.log('_export');
        
        var grid = this.down('rallygrid');
        var rows = Ext.Array.flatten( this.display_rows );
        
        rows = Ext.Array.map(rows, function(row) { return row.data; });
        
        this.logger.log('number of rows:', rows.length);
        
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
                }
                
                ]
            });
        }
        
        var filename = 'validator-report.csv';

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
    _initializeApp: function(portfolioItemTypes){
        var me = this;
        // do layout and configs
        this.chartLabelRotationSettings.rotate45 = this.getSetting('rotateChartLabels45');
        this.chartLabelRotationSettings.rotate90 = this.getSetting('rotateChartLabels90');

      
        me.logger.log('InitializeApp',portfolioItemTypes,me.getSetting('rootStrategyProject'));

        // add the array to the app.
        me.portfolioItemTypes = portfolioItemTypes;


        // make rules array - visible throughout the app        
        this.ruleConfigs = [];

        //if ( this.getSetting('showPortfolioItemRules') ) {
        this.ruleConfigs = Ext.Array.push(this.ruleConfigs, this.rulesByType['PortfolioItem']);
        //}

        // if ( this.getSetting('showStoryRules') ) {
        this.ruleConfigs = Ext.Array.push(this.ruleConfigs, this.rulesByType['HierarchicalRequirement']);
        // }
        // if ( this.getSetting('showTaskRules') ) {
        this.ruleConfigs = Ext.Array.push(this.ruleConfigs, this.rulesByType['Task']);
        // }

        // add the array of portfolioItem Type names to each portfolio rule as we instantiate it
        // also grab appSetting for a target folder to hold high-level portfolio items
        Ext.Array.each(me.rulesByType.PortfolioItem, function(rule){
            // get the collection of workspace specific portfolio item names per level            
            rule.portfolioItemTypes = portfolioItemTypes;
  
            // for rules that need to have a specific project folder for portfolio items
            rule.rootStrategyProject = me.getSetting('rootStrategyProject');
            
            if ((me.activeRules) && (Ext.Array.contains(me.activeRules,rule.xtype))) { // match in array contents against second argument value
                rule.active = true;
            }
        });
        // add the portfolio typepath names to the story rules, also the target project folders for strategy/delivery
        Ext.Array.each(me.rulesByType.HierarchicalRequirement, function(rule){
            // get the collection of workspace specific portfolio item names per level            
            rule.portfolioItemTypes = portfolioItemTypes;
  
            // for rules that need to have a specific project folder for portfolio items
            rule.rootStrategyProject = me.getSetting('rootStrategyProject');
            rule.rootDeliveryProject = me.getSetting('rootDeliveryProject');

            // mark each rule Active - if it matches a rule in the activeRules array.            
            if ((me.activeRules) && (Ext.Array.contains(me.activeRules,rule.xtype))) { // match in array contents against second argument value
                rule.active = true;
            }
        });
        // add the portfolio typepath names to the task rules, also the target project folders for strategy/delivery
        Ext.Array.each(me.rulesByType.Task, function(rule){
            // get the collection of workspace specific portfolio item names per level            
            rule.portfolioItemTypes = portfolioItemTypes;
  
            // for rules that need to have a specific project folder for portfolio items
            rule.rootStrategyProject = me.getSetting('rootStrategyProject');
            rule.rootDeliveryProject = me.getSetting('rootDeliveryProject');

            // mark each rule Active - if it matches a rule in the activeRules array.            
            if ((me.activeRules) && (Ext.Array.contains(me.activeRules,rule.xtype))) { // match in array contents against second argument value
                rule.active = true;
            }
        });

        // setup filter rule configs
        var story_base_filter = Rally.data.wsapi.Filter.or([
            {property:'ScheduleState', value:'Completed' },
            {property:'ScheduleState', value:'In-Progress'}
        ]);
        
        var story_ready_filter = Rally.data.wsapi.Filter.and([
            {property:'ScheduleState', value: 'Defined' },
            {property:'Ready', value: true }
        ]);
        this.story_filter = story_base_filter.or(story_ready_filter);

        var task_base_filter = Rally.data.wsapi.Filter.or([
            {property:'WorkProduct.ScheduleState', value:'Completed' },
            {property:'WorkProduct.ScheduleState', value:'In-Progress'}
        ]);
        
        var task_ready_filter = Rally.data.wsapi.Filter.and([
            {property:'WorkProduct.ScheduleState', value: 'Defined' },
            {property:'WorkProduct.Ready', value: true }
        ]);
        this.task_filter = task_base_filter.or(task_ready_filter);

        // create the validator object
        this.validator = this._instantiateValidator();
        
        // add any selectors required
        this._addSelectors();
        
        // go get the data
        me._loadData();
    },
    _fetchPortfolioItemTypes: function(){
        var deferred = Ext.create('Deft.Deferred');
        Ext.create('Rally.data.wsapi.Store',{
            model: 'typedefinition',
            fetch:['TypePath','Ordinal'],
            filters: [{property:'TypePath',operator:'contains',value:'PortfolioItem/'}],
            sorters: [{property:'Ordinal',direction:'ASC'}]
        }).load({
            callback: function(records,operation){
                if (operation.wasSuccessful()){
                    var portfolioItemArray = [];
                    Ext.Array.each(records,function(rec){
                        portfolioItemArray.push(rec.get('TypePath'));
                    });
                    deferred.resolve(portfolioItemArray);
                } else {
                    var message = 'failed to load Portfolio Item Types ' + (operation.error && operation.error.errors.join(','));
                    deferred.reject(message);
                }
            }
        })
        
        return deferred;
    },
    _rotateProjectLabels: function(project_count){
        
        var rotationSetting = {};

        if (project_count <= this.chartLabelRotationSettings.rotate45) {
            rotationSetting = {labels:{rotation:0}};
        } else if (project_count <= this.chartLabelRotationSettings.rotate90){
            rotationSetting =  {labels:{rotation:45}};
        } else { // full vertical rotation for more than 10 items (good for up-to about 20)
            rotationSetting =  {labels:{rotation:90}};
        }
        this.logger.log("_rotateProjectLabels: ",project_count,this.chartLabelRotationSettings,rotationSetting);
        
        return rotationSetting;
    },

    _showErrorMsg: function(msg){
        Rally.ui.notify.Notifier.showError({message:msg});
    },

    applyState: function(state){
       console.log('app.applyState:',state);
       if ((state) && (state.activeRules)) {
           this.activeRules = state.activeRules;
       }
    },

    getSettingsFields: function() {
        return [
        { 
            name: 'rootStrategyProject',
            itemId: 'rootStrategyProject',
            xtype: 'rallytextfield',
            fieldLabel: 'Name of root Business Strategy project:'
        },
        { 
            name: 'rootDeliveryTeamProject',
            itemId: 'rootDeliveryTeamProject',            
            xtype: 'rallytextfield',
            fieldLabel: 'Name of root Delivery Team project:'
        },
        { 
            name: 'rotateChartLabels45',
            itemId: 'rotateChartLabels45',            
            xtype: 'rallynumberfield',
            fieldLabel: 'Rotate Chart Labels 45 degrees at this project count:',
            allowDecimals: false,
            allowExponential: false,
            autoStripChars: true,
            baseChars: '0123456789',
            maxValue: 20,
            minValue: 1
        },
        { 
            name: 'rotateChartLabels90',
            itemId: 'rotateChartLabels90',            
            xtype: 'rallynumberfield',
            fieldLabel: 'Rotate Chart Labels 90 degrees at this project count:',
            allowDecimals: false,
            allowExponential: false,
            autoStripChars: true,
            baseChars: '0123456789',
            maxValue: 30,
            minValue: 5
        },
        { 
            name: 'showPatterns',
            xtype: 'rallycheckboxfield',
            boxLabelAlign: 'after',
            fieldLabel: '',
            margin: '0 0 25 200',
            boxLabel: 'Show Patterns<br/><span style="color:#999999;"><i>Tick to use patterns in the chart instead of color.</i></span>'
        } 
        ];
    },
    getState: function() {
        var me = this,
            state = null;
        if (this.validator){
            var active = Ext.Array.map(this.validator.getActiveRules(), function(rule){
                return rule.xtype;
            });
            state = this.addPropertyToState(state, 'activeRules', active);
        }
        //     sizeModel = me.getSizeModel();

        // if (sizeModel.width.configured) {
        //     state = me.addPropertyToState(state, 'width');
        // }
        // if (sizeModel.height.configured) {
        //     state = me.addPropertyToState(state, 'height');
        // }


        // return state;
        console.log("app.getState:");
        return state;
    },
});