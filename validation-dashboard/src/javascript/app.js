Ext.define("TSValidationApp", {
extend: 'CA.techservices.app.ChartApp',
    
    description: '<strong>Data Validation</strong>' +
                '<p/>' + 
                'The stacked bar chart shows a count of items that fail the various validation rules.  Each bar ' +
                'represents a team.' +
                '<p/>' + 
                'Click on a column on the chart to see a list of records that failed a validation test, along with a ' +
                'list of other validation issues for the same issues',
    
    integrationHeaders : {
        name : "TSValidationApp"
    },
    
    /**
     * Configurations
     */
    allReleasesText: 'All Releases',
    portfolioItemFeature: 'PortfolioItem/Feature',
    featureFetchFields: ['FormattedID','Name','Project','Release','State','AcceptedLeafStoryCount','LeafStoryCount','PlannedStartDate','PlannedEndDate','Owner','ActualStartDate','Parent','ValueScore','c_ValueMetricKPI','c_Risk','c_RiskDescription','LeafStoryPlanEstimateTotal'],
    storyFetchFields: ['FormattedID','Name','Project','Iteration','Release','ScheduleState','Feature','Owner','PlanEstimate','Blocked','BlockedReason','Blocker','c_Risk','c_RiskStatement'],
    taskFetchFields: ['FormattedID','Name','Project','Iteration','Release','State','Owner'],


    typeMapping: {
        'portfolioitem/feature': 'Feature',
        'hierarchicalrequirement': 'User Story',
        'task'                   : 'Task'
    },

    chartColors: [ '#2f7ed8', '#8bbc21', '#910000',
        '#492970', '#f28f43', '#145499','#77a1e5', '#c42525', '#a6c96a',
        '#7cb5ec', '#434348', '#90ed7d', '#f7a35c', '#8085e9','#aa1925',
        '#f15c80', '#e4d354', '#2b908f', '#f45b5b', '#91e8e1','#1aadce',
        '#4572A7', '#AA4643', '#89A54E', '#80699B', '#3D96AE',
        '#DB843D', '#92A8CD', '#A47D7C', '#B5CA92'],

    selectedRelease: null,
    selectedIteration: null,

    
    launch: function() {
        this.callParent();
        
        this._addSelectors();
    }, 
    
    _addSelectors: function() {
        
        this.timebox_selector = this.addToBanner({
            xtype: 'rallyreleasecombobox',
            margin: 5,
            stateful: true,
            stateId: this.getContext().getScopedStateId('ts-validation-timebox'),
            stateEvents:['change'],
            listeners: {
                scope: this,
                change: this._updateData
            }
        });
    },
        
    getIterationFiltersForIterations:function(release){
        if (!release){
            return [];
        }

        return [{
            property: 'StartDate',
            operator: '>=',
            value: Rally.util.DateTime.toIsoString(release.get('ReleaseStartDate'))
        },{
            property: 'EndDate',
            operator: '<=',
            value: Rally.util.DateTime.toIsoString(release.get('ReleaseDate'))
        }];
        
    },

    getReleaseFilters: function(release){

        if (!release){
            return [];
        }

        return [{
            property: 'Release.Name',
            value: release.get('Name')
        },{
            property: 'Release.ReleaseStartDate',
            value: Rally.util.DateTime.toIsoString(release.get('ReleaseStartDate'))
        },{
            property: 'Release.ReleaseDate',
            value: Rally.util.DateTime.toIsoString(release.get('ReleaseDate'))
        }];
    },
    
    _updateData: function() {
        this.setLoading('Loading data...');
        this.timebox = this.timebox_selector.getRecord();
        
        var release = this.timebox;
        
        var promises = [
            //this._fetchData(this.portfolioItemFeature, this.featureFetchFields, this.getReleaseFilters(release)),
            this._fetchData('HierarchicalRequirement', this.storyFetchFields, this.getReleaseFilters(release)),
            this._fetchScheduleStates(),
        //    this._fetchData('Task', this.taskFetchFields, this.getReleaseFilters(release).concat(this.getIterationFilters(iteration))),
        //    this._fetchData('Project', ['Name'], this.getProjectFilters()),
        //    this._fetchData('Preference',['Name','Value'], [{property:'Name',operator:'contains',value:'project-wip:'}]),
        //    this._fetchData('Iteration',['Name','PlannedVelocity','Project'], this.getIterationFiltersForIterations(release))
        ];
        
        Deft.Promise.all(promises).then({
            scope: this,
            success: function(results) {
                this.setLoading(false);
                var stories          = results[0];
                var schedule_states  = results[1];
                
                var storyRules = Ext.create('Rally.technicalservices.UserStoryValidationRules',{
                    orderedScheduleStates: schedule_states,
                    definedScheduleStateIndex: _.indexOf(schedule_states, 'Defined')
                });
                                
                var storyValidator = Ext.create('Rally.technicalservices.Validator',{
                    validationRuleObj: storyRules,
                    records: stories
                });
                
                this.validatorData = storyValidator.ruleViolationData;
                this._makeChart(this.validatorData);
            },
            failure: function(msg) {
                this.setLoading(false);
                Ext.Msg.alert('Problem Loading Data', msg);
            }
        });
    },
    
    _fetchData: function(modelType, fetchFields, filters){

        var deferred = Ext.create('Deft.Deferred'),
            store = Ext.create('Rally.data.wsapi.Store',{
                model: modelType,
                limit: 'Infinity',
                fetch: fetchFields,
                filters: filters
            });

        store.load({
            scope: this,
            callback: function(records, operation, success){
                if (success){
                    deferred.resolve(records);
                } else {
                    deferred.reject(operation);
                }
            }
        });
        return deferred;
    },
    
    _fetchScheduleStates: function(){
        var deferred = Ext.create('Deft.Deferred');
        var scheduleStates = [];
        Rally.data.ModelFactory.getModel({
            type: 'UserStory',
            fetch: ['ValueIndex','StringValue'],
            sorters: [{
                property: 'ValueIndex',
                direction: 'ASC'
            }],
            success: function(model) {
                model.getField('ScheduleState').getAllowedValueStore().load({
                    callback: function(records, operation, success) {
                        Ext.Array.each(records, function(allowedValue) {
                            //each record is an instance of the AllowedAttributeValue model
                            scheduleStates.push(allowedValue.get('StringValue'));
                        });
                        deferred.resolve(scheduleStates);
                    }
                });
            }
        });

        return deferred;
    },
    
    _getCategories: function(data) {
        return Ext.Array.unique(
            Ext.Array.map(
                data, function(datum) { return datum.Project; }
            )
        ).sort();
    },
    
    _getSeries: function(data, projects) {
        var me = this;        
        var violations = Ext.Array.flatten(
            Ext.Array.map(data, function(datum){
                return datum.violations;
            })
        );
        
        var rules = Ext.Array.map(violations, function(violation){ return violation.rule; });
        
        console.log('rules', rules);
        
        var series = Ext.Array.map(Ext.Array.unique(rules), function(rule){
            return {
                name: Rally.technicalservices.ValidationRules.getUserFriendlyRuleLabel(rule),
                data: [],
                stack: 1,
                rule: rule
            };
        });
        
        console.log('series', series);
        
        Ext.Array.each(series, function(s) {
            var counts = [];
            Ext.Array.each(projects, function(project){
                var count_in_project = 0;
                var records = [];
                Ext.Array.each(data, function(datum){
                    Ext.Array.each(datum.violations, function(violation){
                        if ( violation.rule == s.rule && datum.Project == project ) {
                            count_in_project = count_in_project + 1;
                            records.push(datum);
                        }
                    });
                });
                counts.push({ 
                    y: count_in_project,
                    _records: records,
                    events: {
                        click: function() {
                            me.showDrillDown(this._records,'');
                        }
                    }
                });
            });
            s.data = counts;
        });
        
        return series;
    },
    
    _getChartConfig: function() {
        var me = this;
        return {
            chart: { type:'column' },
            title: { text: 'Validation Results' },
            xAxis: {},
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
    
    _makeChart: function(data) {
        var me = this;
        
        this.logger.log('_makeChart', data);

        var categories = this._getCategories(data);
        var series = this._getSeries(data,categories);
        
        this.setChart({
            chartData: { series: series, categories: categories },
            chartConfig: this._getChartConfig()
        });
    },
    
    showDrillDown: function(records, title) {
        var me = this;

        console.log(records);
        var store = Ext.create('Rally.data.custom.Store', {
            data: records,
            pageSize: 2000
        });
        
        Ext.create('Rally.ui.dialog.Dialog', {
            id        : 'detailPopup',
            title     : title,
            width     : 400,
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
                        text: "id"
                    },
                    {
                        dataIndex : 'Name',
                        text: "Name",
                        flex: 1
                    },
                    {
                        dataIndex: 'violations',
                        text: 'Violations',
                        flex: 1,
                        renderer: function(value, meta, record) {
                            console.log('value', value);
                            if ( Ext.isEmpty(value) ) { return ""; }
                            var display_value = "<ul>";
                            Ext.Array.each(value, function(violation){
                                display_value = display_value + violation.text;
                            });
                            display_value = display_value + "</ul>";
                            console.log('display-value', display_value);
                            return display_value;
                        }
                    }
                ],
                store : store
            }]
        }).show();
    }
    
});
