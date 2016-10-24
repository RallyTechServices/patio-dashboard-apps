Ext.define("TSValidationApp", {
extend: 'CA.techservices.app.ChartApp',
    // need an array of descriptions - 1 for each chartbox containers
    // need at least one or the container won't be initialized
    descriptions: ['<strong>Data Validation</strong>' +
        '<p/>' + 
        'The stacked bar chart shows a count of items that fail the various validation rules.  Each bar ' +
        'represents a team and record type.  For a story to be evaluated, it needs to be either In-Progress or Completed or ' +
        'Defined (when also Ready).  For a task to be evaluated, its story needs to meet the same state rule.' +
        '<p/>' + 
        '<strong>Rules</strong>' +
        '<p/>'], 
    
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
            showWrongProject: true,
            rotateChartLabels45: 5, // how many categories (projects) before we rotate the labels
            rotateChartLabels90: 10 // how many categories (projects) before we rotate the labels        
        },
        rootStrategyProject: null,
        rootDeliveryProject: null,
    },
    
    stateId: 'CA.techservices.TSValidationApp.state', // automatically save a cookie (each app needs unique stateId)
    stateful: true,
    initialActiveRules: [],         // a listing of the xtypes of active rules (saved for each user)
    
    strategyProjects:[],            // array of projects that are in the strategy branch of project hierarchy
    deliveryTeamProjects:[],        // array of projects that are in the execution/delivery team branch
    
    getState: function() {
        // persisting state
        var state = {};
        console.log("app.getState0",this.initialActiveRules,this.validator);

        if (this.validator){
            var active = Ext.Array.map(this.validator.getActiveRules(), function(rule){
                return rule.xtype;
            });
            state = {
                initialActiveRules: active
            };
        } else {
            state = {initialActiveRules: this.initialActiveRules};
        }
        
        // clear out before saving.
        state.strategyProjects = [];
        state.strategyProjects = this.strategyProjects;

        state.deliveryTeamProjects = [];
        state.deliveryTeamProjects = this.deliveryTeamProjects;

        console.log('app.getState1: ', state);

        return state;
    },


    applyState: function(state) {
        console.log('app.applyState:',state);

        // rehydrating state...
        this.callParent(arguments);
        if ( state.hasOwnProperty('initialActiveRules') ) {
            this.initialActiveRules = state.initialActiveRules;
        }
        if (state.hasOwnProperty('strategyProjects')) {
            this.strategyProjects = state.strategyProjects;
        }
        if (state.hasOwnProperty('deliveryTeamProjects')) {
            this.deliveryTeamProjects = state.deliveryTeamProjects;
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
            {xtype: 'tsfeaturewithoutparentrule'},
            {xtype: 'tsepicwithoutparentrule'},
            {xtype: 'tsthemewithoutparentrule'},
            {xtype: 'tspi3withoutparentrule'},
            {xtype: 'tspi4withoutparentrule'},
            {xtype: 'tsthemewithoutepmsidrule'},
            {xtype: 'tsfeaturenoplannedstartenddaterule'},
            {xtype: 'tsthemenoplannedstartenddaterule'}
        ],
        PortfolioItemProject: [            
            {xtype:'tsfeatureunscheduledprojectnotstrategyrootrule'},
            {xtype: 'tsfeaturescheduledprojectnotdeliveryrootrule'}
        ]
    },
    
    launch: function() {
        this.callParent();
        
        // dynamically lookup portfolio item type names
        this._fetchPortfolioItemTypes().then({
            success: this._initializeApp, 
            failure: this._showErrorMsg,
            scope: this
        });  
    },

    _initializeApp: function(portfolioItemTypes){
        var me = this;
        // do layout and configs
        this.chartLabelRotationSettings.rotate45 = this.getSetting('rotateChartLabels45');
        this.chartLabelRotationSettings.rotate90 = this.getSetting('rotateChartLabels90');

        // add the array to the app.
        me.portfolioItemTypes = portfolioItemTypes;
        
        this.setLoading("Configuring rules ...");
        
        // configure the rules
        me._configureRules();

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

        this.setLoading("Creating Validator ...");
        // create the validator object
        this.validator = this._instantiateValidator();

        // add any selectors required
        this._addSelectors();
        
        // go get the data
        me._loadData();
    },

    _addSelectors: function() {
        var me = this;

        var container = this.down('#banner_box');
        container.removeAll();
        
        container.add({xtype:'container',flex: 1});

        console.log('app._addSelectors:',me.getSettings('showWrongProject'));

        if (me.getSetting('showWrongProject')){ // only add the boxes when the appSettings enable it.
            container.add({
                xtype:'rallybutton',
                itemId:'business_project_selection_button',
                cls: 'secondary',
                text: 'Business Planning', // USPTO calls 'Business Planning (Strategy)'
                disabled: false,
                listeners: {
                    scope: this,
                    click: function() {
                        console.log('addSelectors._showBusinessPlanning: ');
                        this._showBusinessPlanningSelection();
                    }
                }
            });

            container.add({
                xtype:'rallybutton',
                itemId:'delivery_teams_selection_button',
                cls: 'secondary',
                text: 'Delivery Teams', // USPTO calls 'Delivery Teams'
                disabled: false,
                listeners: {
                    scope: this,
                    click: function() {
                        console.log('addSelectors._showDeliveryTeamsSelection: ');
                        this._showDeliveryTeamsSelection();
                    }
                }
            });         
        } 
        
        container.add({
            xtype:'rallybutton',
            itemId:'rules_selection_button',
            //cls: 'secondary',
            cls: 'primary',
            text: 'Select Rules',
            disabled: false,
            listeners: {
                scope: this,
                click: function() {
                    console.log('addSelectors: ');

                    this._showRulesSelection();
                }
            }
        });
        // REMOVE EXPORT BUTTON (sr 2016-09-21)
        // container.add({
        //     xtype:'rallybutton',
        //     itemId:'export_button',
        //     cls: 'secondary',
        //     text: '<span class="icon-export"> </span>',
        //     disabled: true,
        //     listeners: {
        //         scope: this,
        //         click: function() {
        //             this._export();
        //         }
        //     }
        // });
    },

    _loadData:function(){
       
        // remove the last chart, have to redraw anyway
        this.clearChartBox(0);
       
        // as we set and reset the description, we need to not retain the previous rule descriptions.
        // separating the appDescription from the description accumulator allows us to handle them
        // independently.
        this.description = this.descriptions[0] + this.validator.getRuleDescriptions();

        this.setLoading("Performing prechecks...");
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

    _configureRules: function(){
        var me = this;

        // make rules array - visible throughout the app        
        this.ruleConfigs = [];
        
        // add the array of portfolioItem Type names to each portfolio rule as we instantiate it
        // also grab appSetting for a target folder to hold high-level portfolio items
        Ext.Array.each(me.rulesByType.PortfolioItemProject, function(rule){
            // get the collection of workspace specific portfolio item names per level            
            rule.portfolioItemTypes = me.portfolioItemTypes;

            // for rules that need to have a specific project folder for portfolio items
            rule.strategyProjects = me.strategyProjects;
            rule.deliveryTeamProjects = me.deliveryTeamProjects;
                        
            if ((me.initialActiveRules) && (Ext.Array.contains(me.initialActiveRules,rule.xtype))) { // match in array contents against second argument value
                rule.active = true;
            }
        });
    
        // add the array of portfolioItem Type names to each portfolio rule as we instantiate it
        // also grab appSetting for a target folder to hold high-level portfolio items
        Ext.Array.each(me.rulesByType.PortfolioItem, function(rule){
            // get the collection of workspace specific portfolio item names per level            
            rule.portfolioItemTypes = me.portfolioItemTypes;
  
            // for rules that need to have a specific project folder for portfolio items
            rule.strategyProjects = me.strategyProjects;
            rule.deliveryTeamProjects = me.deliveryTeamProjects;
                        
            if ((me.initialActiveRules) && (Ext.Array.contains(me.initialActiveRules,rule.xtype))) { // match in array contents against second argument value
                rule.active = true;
            }
        });
        // add the portfolio typepath names to the story rules, also the target project folders for strategy/delivery
        Ext.Array.each(me.rulesByType.HierarchicalRequirement, function(rule){
            // get the collection of workspace specific portfolio item names per level            
            rule.portfolioItemTypes = me.portfolioItemTypes;
  
            // for rules that need to have a specific project folder for portfolio items
            rule.strategyProjects = me.strategyProjects;
            rule.deliveryTeamProjects = me.deliveryTeamProjects;
                        
            // mark each rule Active - if it matches a rule in the activeRules array.            
            if ((me.initialActiveRules) && (Ext.Array.contains(me.initialActiveRules,rule.xtype))) { // match in array contents against second argument value
                rule.active = true;
            }
        });
        
        // add the portfolio typepath names to the task rules, also the target project folders for strategy/delivery
        Ext.Array.each(me.rulesByType.Task, function(rule){            
            // get the collection of workspace specific portfolio item names per level            
            rule.portfolioItemTypes = me.portfolioItemTypes;
  
            // for rules that need to have a specific project folder for portfolio items
            rule.strategyProjects = me.strategyProjects;
            rule.deliveryTeamProjects = me.deliveryTeamProjects;
                        
            // mark each rule Active - if it matches a rule in the activeRules array.            
            if ((me.initialActiveRules) && (Ext.Array.contains(me.initialActiveRules,rule.xtype))) { // match in array contents against second argument value
                rule.active = true;
            }
        });

        // Get all the ruleConfigs into the array
        if (me.getSetting('showWrongProject')) { // only enable these rules when allowed by appSettings
             this.ruleConfigs = Ext.Array.push(this.ruleConfigs, this.rulesByType['PortfolioItemProject']);
        }
        this.ruleConfigs = Ext.Array.push(this.ruleConfigs, this.rulesByType['PortfolioItem']);
        this.ruleConfigs = Ext.Array.push(this.ruleConfigs, this.rulesByType['HierarchicalRequirement']);
        this.ruleConfigs = Ext.Array.push(this.ruleConfigs, this.rulesByType['Task']);

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
            
            // note: appDescription is already combined with rulesText. 
            // This function appends the pre-check results to the existing combined description
            this.description = this.description + " " + append_text;
        }
        
        this.applyDescription(this.description, 0);
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

                    Ext.Msg.alert('','No violations using the current rules. ' +
                        'Please select other rules and/or change your project selection.');
                    return;
                }
                
                this.display_rows = Ext.Object.getValues( this.validator.recordsByModel );
                
                this._makeChart(results);
                // REMOVE EXPORT BUTTON: sr 2016-09-21
                //this.down('#export_button').setDisabled(false);
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem loading data', msg);
            }
        }).always(function() { me.setLoading(false); });
        
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
        // if ( this.getSetting('showStoryRules') && !this.getSetting('showTaskRules') ) {
        //     title_prefix = "Story ";
        // }
        // if ( this.getSetting('showTaskRules') && !this.getSetting('showStoryRules')) {
        //     title_prefix = "Task ";
        // }
        
        return {
            chart: { type:'column' },
            title: { text: title_prefix + 'Validation Results' },
            xAxis: {
                labels:{
                    rotation:this._rotateProjectLabels(data.categories.length)
                }
            },
           
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
                            return Ext.String.format("<a href='{0}' target='_new'>{1}</a>",Rally.nav.Manager.getDetailUrl(record.get('_ref')),value);
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

    _showBusinessPlanningSelection: function() {
        var me = this;

        var strategy_oid = Rally.util.Ref.getOidFromRef( me.getContext().getProjectRef() );
        var strategy_ref = me.getSetting('strategyProjectPicker');
        if ( !Ext.isEmpty(strategy_ref) ) {
            strategy_oid = Rally.util.Ref.getOidFromRef(strategy_ref);
        }
        
        Ext.create('CA.technicalservices.ProjectTreePickerDialog',{
            
            title: 'Select the Business Planning projects',
            introText: 'Select the projects where your portfolio items should be.',
            initialSelectedRecords: me.strategyProjects,
            root_filters:   [{
                property: 'ObjectID',      // reads a top-level starting point from which to build-out the tree
                operator: '=',
                value: strategy_oid
            }],

            listeners: {
                scope: this,
                itemschosen: function(items){
                    // save the data ref of each project - because preferences
                    // can choke on an instantiated class                  
                    me.strategyProjects = Ext.Array.map(items,function(item){
                        if (Ext.isFunction(item.getData)) {
                            item = item.getData();
                        }
                        return item;
                    });
                    this.logger.log("_showBusinessPlanningSelection:", items);
                    this.logger.log('--', this.strategyProjects);
                    this.saveState();

                    this._loadData();                    
                }    
            }
        }).show();
    },


    _showDeliveryTeamsSelection: function() {
        var me = this;

        console.log("showDeliveryTeam._showDeliveryTeamsSelection:",this.getSetting('deliveryProjectPicker'));

        var top_oid = Rally.util.Ref.getOidFromRef( me.getContext().getProjectRef() );
        var top_ref = me.getSetting('deliveryProjectPicker');
        if ( !Ext.isEmpty(top_ref) ) {
            top_oid = Rally.util.Ref.getOidFromRef(strategy_ref);
        }
        
        Ext.create('CA.technicalservices.ProjectTreePickerDialog',{
            title: 'Select the Delivery Team projects',
            introText: 'Select the projects for the Delivery Teams',
            initialSelectedRecords: me.deliveryTeamProjects,
            root_filters: [{
                property: 'ObjectID',      // reads a top-level starting point from which to build-out the tree
                operator: '=',
                value: top_oid
            }],

            listeners: {
                scope: this,
                itemschosen: function(items){
                    // save the data ref of each project - because preferences can choke on fully instantiated classes
                    this.deliveryTeamProjects = Ext.Array.map(items,function(item){
                        if (Ext.isFunction(item.getData)){
                            item = item.getData();
                        }
                        return item;
                    });
                    this.logger.log('_showDeliveryTeamsSelection: ',items);
                    this.logger.log('--',this.deliveryTeamProjects);
                    this.saveState();

                    this._loadData();                    
                }    
            }
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
                    this.saveState();
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
        
        var rotationSetting = 0;

        if (project_count <= this.chartLabelRotationSettings.rotate45) {
            rotationSetting = 0;
        } else if (project_count <= this.chartLabelRotationSettings.rotate90){
            rotationSetting =  45;
        } else { // full vertical rotation for more than 10 items (good for up-to about 20)
            rotationSetting =  90;
        }
        
        return rotationSetting;
    },

    _showErrorMsg: function(msg){
        Rally.ui.notify.Notifier.showError({message:msg});
    },

    getSettingsFields: function() {
        var me = this;

        return [
//        {
//         name: 'strategyProjectPicker',
//         xtype: 'rallyprojectpicker',
//         itemId: 'strategyProjectPicker',            
//         fieldLabel: 'Choose the root Business Planning (Strategy) project:',
//         showMostRecentlyUsedProjects: false,
//         workspace: this.getContext().getWorkspaceRef(),
//         labelAlign:'left',
//         labelWidth: 300,
//         labelPad: 10,
//         stateful: true,
//         stateId: 'strategyProjectPicker',
//         stateEvents: ['change','select'],
//         listeners: {
//                scope: me,
//                select: function(field,value,eOpts){
//                    console.log('app.getSettings.strategyProjectPicker.select:',field,value,eOpts);                 
//                },
//                change: function(){
//                    console.log('app.getSettings.strategyProjectPicker.change: ',this.getSelectedRecord());
//                    me.rootStrategyProject = this.getSelectedRecord().get('Name');
//                }    
//            }
//        },
//        {
//         name: 'deliveryProjectPicker',
//         xtype: 'rallyprojectpicker',
//         itemId: 'deliveryProjectPicker',            
//         fieldLabel: 'Choose the root Delivery Team project:',
//         showMostRecentlyUsedProjects: false,
//         workspace: this.getContext().getWorkspaceRef(),
//         labelAlign:'left',
//         labelWidth: 300,
//         labelPad: 10,
//         stateful: true,
//         stateId: 'deliveryProjectPicker',
//         stateEvents: ['change','select'],
//         listeners: {
//                scope: me,
//                select: function(field,value,eOpts){
//                    console.log('app.getSettings.deliveryProjectPicker.select:',field,value,eOpts);                    
//                },
//                change: function(eOpts){
//                    console.log('app.getSettings.strategyProjectPicker.change: ',eOpts);
//                }    
//            }
//        },
        { 
            name: 'rotateChartLabels45',
            itemId: 'rotateChartLabels45',            
            xtype: 'rallynumberfield',
            fieldLabel: 'Rotate Chart Labels 45 degrees at this project count:',
            labelAlign:'left',
            labelWidth: 300,
            labelPad: 10,
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
            labelAlign:'left',
            labelWidth: 300,
            labelPad: 10,
            allowDecimals: false,
            allowExponential: false,
            autoStripChars: true,
            baseChars: '0123456789',
            maxValue: 30,
            minValue: 5
        },
//        { 
//            name: 'showWrongProject',
//            xtype: 'rallycheckboxfield',
//            fieldLabel: 'Enable selection of the two Feature Selection rules. Use the ' +
//                '[Business Planning] and [Delivery Team] buttons to identify the correct projects for ' +
//                'scheduled and unscheduled Features in your program.',
//            labelAlign:'left',
//            labelWidth: 300,
//            labelPad: 10,
//            padding: '0 0 50 0'  //top right bottom left
//        },                
        { 
            name: 'showPatterns',
            xtype: 'rallycheckboxfield',
            //boxLabelAlign: 'after',
            //margin: '0 0 25 200',
            fieldLabel: 'Show Patterns<br/><span style="color:#999999;"><i>Tick to use patterns in the chart instead of color.</i></span>',
            labelAlign:'left',
            labelWidth: 300,
            labelPad: 10,
            padding: '0 0 50 0'  //top right bottom left
        }
        ];
    }
});