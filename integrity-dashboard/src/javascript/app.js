Ext.define("IntegrityApp", {
    extend: 'CA.techservices.app.ChartApp',

    descriptions: [
        "<strong>Percentage of Stories with Functional Test Coverage</strong><br/>" +
            "<br/>" +
            "The top stacked bar chart displays your total test case coverage (by %) for user stories in the " +
            "sprint (e.g., 100% indicates every testable user story had at least one testcase)" 
            ,
        "<strong>Percentage Passed</strong><br/>"+
            "<br/>" +
            "The gold line graph displays the pass rate of all the test cases completed in the sprint bytest casetype. <br/>" +
            "The green line graph displays the pass rate of stories tested in the sprint" 
    ],
    
    integrationHeaders : {
        name : "IntegrityApp"
    },
    
     config: {
        chartLabelRotationSettings:{
            rotateNone: 0,
            rotate45: 10,
            rotate90: 15 
        },
        defaultSettings: {
           showPatterns: false,
            typeField: 'Type',
            typeFieldValue: 'Acceptance',
            isTestableField: 'c_IsTestable',
            gridThreshold: 2
        }
    },
                        
    launch: function() {
        this.callParent();
        this._addSelectors();
        this._updateData();
    },

    _addSelectors: function() {

        this.timebox_limit = 10;
        this.addToBanner({
            xtype: 'rallynumberfield',
            name: 'timeBoxLimit',
            itemId: 'timeBoxLimit',
            fieldLabel: 'Timebox Limit',
            value: 10,
            maxValue: 20,
            minValue: 1,            
            margin: '0 0 0 50',
            width: 150,
            allowBlank: false,  // requires a non-empty value
            listeners:{
                change:function(nf){
                    this.timebox_limit = nf.value;
                    this._updateData();
                },
                scope:this
            }
        }
        );

        this.timebox_type = 'Iteration';
        this.addToBanner(
        {
            xtype      : 'radiogroup',
            fieldLabel : 'Timebox Type',
            margin: '0 0 0 50',
            width: 300,
            defaults: {
                flex: 1
            },
            layout: 'hbox',
            items: [
                {
                    boxLabel  : 'Iteration',
                    name      : 'timeBoxType',
                    inputValue: 'Iteration',
                    id        : 'radio1',
                    checked   : true                    
                }, {
                    boxLabel  : 'Release',
                    name      : 'timeBoxType',
                    inputValue: 'Release',
                    id        : 'radio2'
                }
            ],
            listeners:{
                change:function(rb){
                    this.timebox_type = rb.lastValue.timeBoxType;
                    this._updateData();
                },
                scope:this
            }
        }
        );


    },    
    
    _updateData: function() {
        var me = this;
        this.metric = "size";
//        this.timebox_type = 'Iteration';
        
        Deft.Chain.pipeline([
            this._fetchTimeboxes,
            this._sortTimeboxes,
            this._fetchArtifactsInTimeboxes
        ],this).then({
            scope: this,
            success: function(results) {
                if ( Ext.isEmpty(results) ) { 
                    return;
                }

                var artifacts_by_timebox = this._collectArtifactsByTimebox(results || []);
                this._makeTopChart(artifacts_by_timebox);
                this._makeBottomChart(artifacts_by_timebox);
                this._makeRawBottomGrid(artifacts_by_timebox);
            },
            failure: function(msg) {
//                Ext.Msg.alert('--', msg);
                Ext.Msg.alert('--', "Be sure you have gone to App Settings to set your configuration");
            }
        }).always(function() { me.setLoading(false); });
        
    },
    
    _fetchTimeboxes: function() {
        var me = this,
            deferred = Ext.create('Deft.Deferred'),
            type = this.timebox_type;
                
        var start_field = "StartDate";
        var end_field = "EndDate";

        if ( type == "Release" ) {
            start_field = "ReleaseStartDate";
            end_field   = "ReleaseDate";
        }   

        this.setLoading("Fetching timeboxes...");
                
        var config = {
            model: type,
            limit: this.timebox_limit,
            pageSize: this.timebox_limit,
            fetch: ['Name',start_field,end_field],
            filters: [{property:start_field, operator: '<=', value: Rally.util.DateTime.toIsoString(new Date)}],
            sorters: [{property:end_field, direction:'DESC'}],
            context: {
                projectScopeUp: false,
                projectScopeDown: false
            }
        };
        
        return TSUtilities.loadWsapiRecords(config);
    },
    
    _sortTimeboxes: function(timeboxes) {
        if (timeboxes === 'undefined' || timeboxes.length === 0) { 
            Ext.Msg.alert('', 'The project you selected does not have any ' + this.timebox_type + 's');
            this.setLoading(false);					
            return [];
        }
        var end_date_field = TSUtilities.getEndFieldForTimeboxType(this.timebox_type);
      
        Ext.Array.sort(timeboxes, function(a,b){
            if ( a.get(end_date_field) < b.get(end_date_field) ) { return -1; }
            if ( a.get(end_date_field) > b.get(end_date_field) ) { return  1; }
            return 0;
        }); 
        
				this.timeboxes = timeboxes;        
        return timeboxes;
    },

   
    _fetchArtifactsInTimeboxes: function(timeboxes) {
        var me = this;
        if ( timeboxes.length === 0 ) { return; }
        
        var type = this.timebox_type;
        
        var isTestableField = me.getSetting('isTestableField');

        var start_field = "StartDate";
        var end_field = "EndDate";
        if ( type == "Release" ) {
            start_field = "ReleaseStartDate";
            end_field   = "ReleaseDate";
        }
        
        var foundByColumn = this.getSetting('typeField');
        var foundByValues = me.getSetting('typeFieldValue').split(',');

        var foundByFilter = [];

        Ext.Array.each(foundByValues, function(val){
            foundByFilter.push({property: 'TestCases.'+foundByColumn, value:val});
        });


        var deferred = Ext.create('Deft.Deferred');
        var first_date = timeboxes[0].get(start_field);
        var last_date = timeboxes[timeboxes.length - 1].get(end_field);

        var filters = [
            {property: type + '.' + start_field, operator: '>=', value:first_date},
            {property: type + '.' + end_field, operator: '<=', value:last_date}
        ];
        
        filters = Rally.data.wsapi.Filter.and(filters).and({property: isTestableField, operator: '=', value: true});

        foundByFilter = filters.and(Rally.data.wsapi.Filter.or(foundByFilter));

        var config = {
            model:'HierarchicalRequirement',
            limit: Infinity,
            filters: filters,
            fetch: ['FormattedID','Name','ScheduleState','Iteration','ObjectID','Defects',
                'PlanEstimate','Project','Release','AcceptedDate','TestCaseCount','PassingTestCaseCount','TestCaseStatus',foundByColumn, start_field,end_field]
        };

        var config1 = {
            model:'HierarchicalRequirement',
            limit: Infinity,
            filters: foundByFilter,
            fetch: ['FormattedID','Name','ScheduleState','Iteration','ObjectID','Defects',
                'PlanEstimate','Project','Release','AcceptedDate','TestCaseCount','PassingTestCaseCount','TestCaseStatus',foundByColumn, start_field,end_field]
        };
        // make two calls to get the ones with test cases of specific type.
        Deft.Chain.sequence([
            function() { 
                return TSUtilities.loadWsapiRecords(config);
            },
            function() { 
                return TSUtilities.loadWsapiRecords(config1);
            }
        ],this).then({
            success: function(results) {
                //deferred.resolve(Ext.Array.flatten(results));
                deferred.resolve(results);
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
        });
        return deferred.promise;
    },
    
    /* 
     * returns a hash of hashes -- key is iteration name value is
     * another hash where the records key holds a hash
     *    the records hash has a key for each allowed value 
     *    which then provides an array of items that match the allowed value 
     *    and timebox
     * as in
     * { "iteration 1": { "records": { "all": [o,o,o], "with_test_cases": [o,o] } } }
     */

    _collectArtifactsByTimebox: function(items) {        
        var test_cases_object_ids = [];

        Ext.Array.each(items[1],function(item){
            test_cases_object_ids.push(item.get('ObjectID'));
        });


        var me = this;
        var hash = {},
            timebox_type = this.timebox_type;

        
        if ( Ext.isEmpty(items[0]) || items[0].length === 0 ) { return hash; }
        
        var base_hash = {
            records: {
                all: [],
                with_test_cases:[]
            }
        };

        Ext.Array.each(items[0], function(item){
            var timebox = item.get(timebox_type).Name;
            
            if ( Ext.isEmpty(hash[timebox])){
                
                hash[timebox] = Ext.Object.merge({}, Ext.clone(base_hash) );
            }
            hash[timebox].records.all.push(item);

            //var filter = Rally.data.wsapi.Filter.or(foundByFilter).and({ property: 'Requirement.ObjectID', value: item.get('ObjectID')});
            if(Ext.Array.contains(test_cases_object_ids,item.get('ObjectID'))){
                hash[timebox].records['with_test_cases'].push(item);
            }
           
        });
        
        return hash;
    },

   
    _makeTopChart: function(artifacts_by_timebox) {
        var me = this;

        var categories = this._getCategories(artifacts_by_timebox);

        var series = this._getTopSeries(artifacts_by_timebox);
        var colors = CA.apps.charts.Colors.getConsistentBarColors();
        
        if ( this.getSetting('showPatterns') ) {
            colors = CA.apps.charts.Colors.getConsistentBarPatterns();
        }
        this.setChart({
            chartData: { series: series, categories: categories },
            chartConfig: this._getTopChartConfig(),
            chartColors: colors
        },0);
        this.setLoading(false);
    },


    _getTopSeries: function(artifacts_by_timebox) {
        var series = [],
            allowed_types = ['all','with_test_cases'];
        
        Ext.Array.each(allowed_types, function(allowed_type){
            var name = allowed_type == 'all' ? 'All':'With Test Cases';

            series.push({
                name: name,
                color: allowed_type == 'all' ? CA.apps.charts.Colors.blue_dark:CA.apps.charts.Colors.blue,
                data: this._calculateTopMeasure(artifacts_by_timebox,allowed_type),
								pointPadding: allowed_type == 'all' ? 0 : 0.15,
                type: 'column'              
            });
        },this);
        
        return series;
    },

    _calculateTopMeasure: function(artifacts_by_timebox,allowed_type) {
        var me = this,
        data = [];

			Ext.Array.each(this.timeboxes, function(tb) {
				var timebox = tb.get('Name');
				var value = artifacts_by_timebox[timebox];
				if (Ext.isEmpty(value) ) {
					  data.push({ 
                y:0,
                _records: []
            });
						return;
				}
//        Ext.Object.each(artifacts_by_timebox, function(timebox, value){
            var records = value.records[allowed_type] || [];
            var y_value = 0;

            if('all' == allowed_type){
                y_value = 100;
            } else if ('with_test_cases' == allowed_type){
                y_value = (records.length / value.records['all'].length) * 100;
            }

            data.push({ 
                y:y_value,
                _records: records,
                events: {
                    click: function() {
                        me.showDrillDown(this._records,  timebox + " (" + allowed_type + ")");
                    }
                }
            });


        });

        return data
    },       

    _getTopChartConfig: function() {
        var me = this;
        var testCaseTypes = me.getSetting('typeFieldValue') ? me.getSetting('typeFieldValue') : 'None';

        return {
            chart: { type:'column' },
            title: { text: 'Percentage of Stories with Functional Test Coverage' },
            subtitle: { text: 'Test Case Types: ' + testCaseTypes},
            xAxis: {
                labels:{
                    rotation:this._rotateLabels()
                }
            },
            yAxis: { 
                min: 0,
                title: { text: '%' },
                stackLabels: {
                    enabled: true,
                    style: {
                        fontWeight: 'bold',
                        color: 'gray'
                    }
                }   
            },
            plotOptions: {
                stacking: 'normal',
                dataLabels: {
                    enabled: true,
                    color:'gray',
                    style: {
                        textShadow: '0 0 3px black'
                    },
                    format: '{y} %',
                },                
                column: {
                    grouping: false,
                    shadow: false,
                    borderWidth: 0
                }
            },
            tooltip: {
                formatter: function() {
                    return '<b>'+ this.series.name +'</b>: '+ Math.round(this.point.y) + ' %';
                }
            }
        }
    },

    _rotateLabels: function(){
        
        var rotationSetting = 0;

        if (this.timebox_limit <= this.chartLabelRotationSettings.rotate45) {
            rotationSetting = 0;
        } else if (this.timebox_limit <= this.chartLabelRotationSettings.rotate90){
            rotationSetting =  45;
        } else { // full vertical rotation for more than 10 items (good for up-to about 20)
            rotationSetting =  90;
        }
        
        return rotationSetting;
    },

    _makeBottomChart: function(artifacts_by_timebox) {
        var me = this;

        var categories = this._getCategories(artifacts_by_timebox);

        var series = this._getBottomSeries(artifacts_by_timebox);
        var colors = CA.apps.charts.Colors.getConsistentBarColors();
        
        if ( this.getSetting('showPatterns') ) {
            colors = CA.apps.charts.Colors.getConsistentBarPatterns();
        }
        this.setChart({
            chartData: { series: series, categories: categories },
            chartConfig: this._getBottomChartConfig(),
            chartColors: colors
        },1);
        this.setLoading(false);
    },
    

    
    _getBottomSeries: function(artifacts_by_timebox) {
        var series = [];
            
        series.push({
            name: 'Pass Rate of Stories',
            data: this._calculateBottomMeasure(artifacts_by_timebox,'Stories'),
            color: 'green'
        });

        series.push({
            name: 'Pass Rate of Test Cases',
            data: this._calculateBottomMeasure(artifacts_by_timebox,'TestCase'),
            color: '#FFD700' // Gold.
        });

        return series;
    },


    _calculateBottomMeasure: function(artifacts_by_timebox,graph_type) {
        var me = this,
            data = [];

			Ext.Array.each(this.timeboxes, function(tb) {
				var timebox = tb.get('Name');
				var value = artifacts_by_timebox[timebox];
				if (Ext.isEmpty(value) ) {
					  data.push({ 
                y:0
            });
						return;
				}
//        Ext.Object.each(artifacts_by_timebox, function(key, value){
            var y_value = 0;
            var all_length = value.records.all.length;
            var pass_length = 0;
            var test_case_length = value.records.with_test_cases.length;
            Ext.Array.each(value.records.with_test_cases,function(story){
                if("ALL_RUN_ALL_PASSING" == story.get('TestCaseStatus')){
                    pass_length += 1;
                }                
            });

            if("Stories" == graph_type){
                y_value = all_length > 0 ? Math.round((pass_length / all_length) * 100):0;
            } else  if("TestCase" == graph_type){
                y_value = test_case_length > 0 ? Math.round((pass_length / test_case_length) * 100):0;
            }

            data.push({ 
                y: y_value
            });
        });

        return data;
    },    
    
    _getBottomChartConfig: function() {
        var me = this;
        return {
            chart: { type: 'line' },
            title: { text: 'Percentage Passed' },
            xAxis: {
                title: { },
                labels:{
                    rotation:this._rotateLabels()
                }
            },
            yAxis: [{ 
                //min: 0,
                title: { text: '% Passed' }
            }],
            plotOptions: {
                line: {
                    // color: 'red',
                    dataLabels: {
                        enabled: true,
                        format: '{y} %',
                    },                    
                    pointStart: 0,
                    marker: {
                        enabled: true,
                        symbol: 'circle',
                        radius: 2,
                        states: {
                            hover: {
                                enabled: true
                            }
                        }
                    }
                }
            }
        }
    },

    _makeRawBottomGrid: function(artifacts_by_timebox) {
        var me = this;
        
        var columns = [{dataIndex:'Name',text:'Counts',flex:2}];
        Ext.Array.each(this._getCategories(artifacts_by_timebox), function(field){
            columns.push({ 
                dataIndex: me._getSafeIterationName(field) + "_number", 
                text: field, 
                align: 'center',
                flex:1,
                renderer: function(value,metaData, record){
                    if("TotalTCStoryCount"==metaData.record.get('Type') && value < me.getSetting('gridThreshold')){
                         metaData.style = 'text-align:center;background-color:#ff9999';    
                    }
                    return value;
                }
            });
        });
        
        var rows = this._getRawBottomRows(artifacts_by_timebox);
        
        var store = Ext.create('Rally.data.custom.Store',{ data: rows });
        
        this.logger.log('about to add grid', store, columns);

        this.setGrid({
            xtype:'rallygrid',
            padding: 5,
            showPagingToolbar: false,
            enableEditing: false,
            showRowActionsColumn: false,     
            store: store,
            columnCfgs: columns
        },1);
    },
    
    _getRawBottomRows: function(artifacts_by_timebox) {
        var me = this;
        // sprint objects have key = name of sprint
        
        var row_fields = this._getCategories(artifacts_by_timebox);
         
        this.logger.log('row_fields', row_fields);
        
        var rows = [
            {Type:'TotalStoryCount', Name: 'Testable Stories'},
            {Type:'TotalTCStoryCount',  Name: 'Stories w/ Test Cases' },
            {Type:'TotalTCPassStoryCount', Name: 'Stories w/ All Test Cases Pass' }
        ];

        // Ext.Array.each(this._getSeries(artifacts_by_timebox),function(rowname){
        //     rows.push({Type:rowname.name,Name:rowname.name});
        // })
        // set up fields
        
        Ext.Array.each(rows, function(row) {
            Ext.Array.each(row_fields, function(field){
                field = me._getSafeIterationName(field);
                row[field] = [];
                row[field + "_number"] = 0;
            });
        });
        
        this.logger.log('rows >>',rows);

        Ext.Array.each(rows, function(row){
            var type = row.Type;
            Ext.Object.each(artifacts_by_timebox, function(sprint_name,value){
                sprint_name = me._getSafeIterationName(sprint_name);

              
                row[sprint_name + "_number"] = me._getBottomSize(value,type); 
                
            });
        });
        
        return rows;
    },


    _getBottomSize:function(value,type){

            var size = 0;

            if('TotalStoryCount' == type){
                size = value.records.all.length;
            }else if('TotalTCStoryCount' == type){
                size = value.records.with_test_cases.length;
            }else if('TotalTCPassStoryCount' == type){
                Ext.Array.each(value.records.with_test_cases, function(story){
                    if("ALL_RUN_ALL_PASSING" == story.get('TestCaseStatus')){
                        size += 1;
                    }    
                }); 
            }

            return size;
    },


    _getCategories: function(artifacts_by_timebox) {
//        return Ext.Object.getKeys(artifacts_by_timebox);
        return Ext.Array.map(this.timeboxes, function(timebox) {
            return timebox.get('Name');
        });
    },

    _filterOutExceptChoices: function(store) {
        var app = Rally.getApp();
        
        store.filter([{
            filterFn:function(field){ 
                
                var forbidden_fields = ['Recycled','Ready'];
                if ( Ext.Array.contains(forbidden_fields, field.get('name') ) ) {
                    return false;
                }
                
                var attribute_definition = field.get('fieldDefinition').attributeDefinition;
                var attribute_type = null;
                if ( attribute_definition ) {
                    attribute_type = attribute_definition.AttributeType;
                }
                if (  attribute_type == "BOOLEAN" ) {
                    return false;
                }
                if ( attribute_type == "STRING" || attribute_type == "STATE" ) {
                    if ( field.get('fieldDefinition').attributeDefinition.Constrained ) {
                        return true;
                    }
                }
                return false;
            } 
        }]);
    },    

    getSettingsFields: function() {
        var me = this;
        
        return [
//        {
//                name: 'isTestableField',
//                xtype: 'rallyfieldcombobox',
//                itemId: 'isTestableField',
//                labelWidth: 125,
//                labelAlign: 'left',
//                minWidth: 200,
//                fieldLabel: 'Is Testable Field',
//                model: 'HierarchicalRequirement',
//                margin: '10 10 10 10',
//                _isNotHidden: function(field) {
//                    if ( field.hidden ) { return false; }
//                    var defn = field.attributeDefinition;
//                    if ( Ext.isEmpty(defn) ) { return false; }
//                    
//                    return ( defn.AttributeType == 'BOOLEAN' );
//                }
//        },
        {
            xtype:'container',
            html: 'You can limit displayed items by choosing a field on test cases and one or more values. ' +
                'This is generally used to limit to certain types of tests.<br/>' +
                'Choose the field and value(s) below.'
        },
        {
                name: 'typeField',
                itemId:'typeField',
                xtype: 'rallyfieldcombobox',
                fieldLabel: 'Test Case Field',
                labelWidth: 125,
                labelAlign: 'left',
                minWidth: 200,
                margin: '10 10 10 10',
                autoExpand: false,
                alwaysExpanded: false,                
                model: 'TestCase',
                bubbleEvents: ['typeFieldChange'],
                _isNotHidden: function(field) {
                    if ( field.hidden ) { return false; }
                    var defn = field.attributeDefinition;
                    if ( Ext.isEmpty(defn) ) { return false; }
                    
                    return ( defn.Constrained && defn.AttributeType == 'STRING' );
                },
                listeners: {
                    ready: function(cb) {
                        me._filterOutExceptChoices(cb.getStore());
                    },
                    select: function(cb) {
                        this.fireEvent('typeFieldChange',cb);
                    }
                }
                //,                
 //               readyEvent: 'ready'
            },
            {
                name: 'typeFieldValue',
                xtype: 'rallyfieldvaluecombobox',
                fieldLabel: 'Test Case Value(s)',
                labelWidth: 125,
                labelAlign: 'left',
                minWidth: 200,
                margin: '10 10 10 10',
//                autoExpand: true,
//                alwaysExpanded: true,
                model: 'TestCase',
                field: me.getSetting('typeField'),
                multiSelect: true,
                listeners: {
                    ready: function(cb) {
                        cb.setValue(me.getSetting('typeFieldValue').split(','));
                        var field_values = me.getSetting('typeFieldValue') || [];
                        if ( Ext.isString(field_values) ) {
                            field_values = field_values.split(',');
                        }
                        console.log(field_values);
                        cb.setValue(field_values);
                    }
                }, 
                handlesEvents: {
                    typeFieldChange: function(chk){
                        var field = chk.getValue();
                        this.field = chk.model.getField(field);
                        if(this.field){
                            this._populateStore();
                        }
                    }
                }
//                readyEvent: 'ready'                
            },
            {
                xtype:'container',
                html: 'The Stories w/ Test Cases row of the grid will turn cells red when the number is below the Hightlight Threshold chosen below.'
            },
            {
                name:'gridThreshold',
                xtype:'textfield',
                fieldLabel: 'Highlight Threshold',
                itemId: 'gridThreshold',
                labelWidth: 125,
                labelAlign: 'left',
                minWidth: 200,
                margin: '10 10 10 10'
            },        
            { 
                name: 'showPatterns',
                xtype: 'rallycheckboxfield',
                boxLabelAlign: 'after',
                fieldLabel: '',
                margin: '0 0 25 25',
                boxLabel: 'Show Patterns<br/><span style="color:#999999;"><i>Tick to use patterns in the chart instead of color.</i></span>'
            }      
        
        ];
    },
    
    getDrillDownColumns: function(title) {
        var columns = [
            {
                dataIndex : 'FormattedID',
                text: "id"
            },
            {
                dataIndex : 'Name',
                text: "Name",
                flex: 2
            },
            {
                dataIndex: 'AcceptedDate',
                text: 'Accepted Date',
                flex:1
            },
            {
                dataIndex: 'PlanEstimate',
                text: 'Plan Estimate'
            },
            {
                dataIndex: 'Iteration',
                text: 'Iteration',
                renderer:function(Iteration){
                        return Iteration.Name;
                }                
            },
            {
                dataIndex: 'Project',
                text: 'Project',
                renderer:function(Project){
                        return Project.Name;
                },
                flex: 1
            },
            {
                dataIndex: 'TestCaseCount',
                text: 'Test Case Count',
                flex: 1
            },
            {
                dataIndex: 'TestCaseStatus',
                text: 'Test Case Status',
                flex: 1
            }
        ];
        
        if ( /\(multiple\)/.test(title)) {
            columns.push({
                dataIndex: 'Name',
                text: 'Count of Moves',
                renderer: function(value, meta, record) {
                    
                    return value.split('[Continued]').length;
                }
            });
        }
        
        
        return columns;
    },
    /*
     * having a dot in the name for the key of a hash causes problems
     */
    _getSafeIterationName: function(name) {
        return name.replace(/\./,'&#46;'); 
    },
    
    _getUnsafeIterationName: function(name) {
        return name.replace(/&#46;/,'.');
    },

    fetchWsapiCount: function(model, query_filters){
        var deferred = Ext.create('Deft.Deferred');

        Ext.create('Rally.data.wsapi.Store',{
            model: model,
            fetch: ['ObjectID'],
            enablePostGet: true,
            filters: query_filters,
            limit: 1,
            pageSize: 1
        }).load({
            callback: function(records, operation, success){
                if (success){
                    deferred.resolve(operation.resultSet.totalRecords);
                } else {
                    deferred.reject(Ext.String.format("Error getting {0} count for {1}: {2}", model, query_filters.toString(), operation.error.errors.join(',')));
                }
            }
        });
        return deferred;
    },
    
});
