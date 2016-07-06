Ext.define("TSEstimationEffort", {
    extend: 'CA.techservices.app.ChartApp',

    descriptions: [
        "<strong>Estimation Effort (Average Hours by Size)</strong><br/>" +
        "<br/>" +
        "This chart can help answer the question 'How much effort is required to complete a sprint backlog item?'<p/>" +
        "For the selected number of iterations, this chart collects the stories and defects into Fibonacci buckets and " +
        "then provides the average, minimum and maximum number of hours spent on the tasks in each size category.<p/>" +
        "The task actuals are taken from a rollup of the Actuals field from associated tasks for stories and defects that " +
        "have been Accepted.  Stories and Defects that have sizes that don't fit into the Fibonacci sequence are placed in " +
        "the 'Non-Fibonacci' category and shown if the Show non-Fibonacci Categroy checkbox is ticked in App Settings.<p/>" +
        "Click on a bar or point on the line to see a table with the defects and stories with that Fibonacci size." +
        "<p/>",
        
        "<strong>Estimation Effort (Average Hours by Sprint)</strong><br/>" +
        "<br/>" +
        "This chart can help answer the question 'How much effort is required to complete a sprint backlog item?'  This" +
        "version of the chart further reveals how stories of various sizes are distributed among the selected sprints.<p/>" +
        "For the selected number of iterations, this chart collects the stories and defects into Fibonacci buckets and " +
        "then provides the average, minimum and maximum number of hours spent on the tasks in each size category in each sprint.<p/>" +
        "The task actuals are taken from a rollup of the Actuals field from associated tasks for stories and defects that " +
        "have been Accepted.  Stories and Defects that have sizes that don't fit into the Fibonacci sequence are placed in " +
        "the 'Non-Fibonacci' category and shown if the Show non-Fibonacci Categroy checkbox is ticked in App Settings.<p/>" +
        "Click on a bar or point on the line to see a table with the defects and stories with that Fibonacci size." +
        "<p/>"
    ],
    
    integrationHeaders : {
        name : "TSEstimationEffort"
    },
    
    config: {
        defaultSettings: {
            showPatterns: false,
            showNonFibonacciCategory: true
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
            xtype: 'numberfield',
            name: 'timeBoxLimit',
            itemId: 'timeBoxLimit',
            fieldLabel: 'Time Box Limit',
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
//        this.addToBanner(
//        {
//            xtype      : 'radiogroup',
//            fieldLabel : 'Timebox Type',
//            margin: '0 0 0 50',
//            width: 300,
//            defaults: {
//                flex: 1
//            },
//            layout: 'hbox',
//            items: [
//                {
//                    boxLabel  : 'Iteration',
//                    name      : 'timeBoxType',
//                    inputValue: 'Iteration',
//                    id        : 'radio1',
//                    checked   : true                    
//                }, {
//                    boxLabel  : 'Release',
//                    name      : 'timeBoxType',
//                    inputValue: 'Release',
//                    id        : 'radio2'
//                }
//            ],
//            listeners:{
//                change:function(rb){
//                    this.timebox_type = rb.lastValue.timeBoxType;
//                    this._updateData();
//                },
//                scope:this
//            }
//        }
//        );

    },    
    
    _updateData: function() {
        var me = this;
        this.metric = "size";
        this.timebox_type = 'Iteration';
        
        Deft.Chain.pipeline([
            this._fetchTimeboxes,
            this._sortIterations,
            this._fetchArtifactsInTimeboxes
        ],this).then({
            scope: this,
            success: function(artifacts) {
                var artifacts_by_size = this._collectArtifactsByFibonacci(artifacts||[]);
                artifacts_by_size = this._setMinMaxAvg(artifacts_by_size);
                
                var artifacts_by_timebox = this._collectArtifactsByFibonacciBySprint(artifacts_by_size);

                this._makeChartBySize(artifacts_by_size);
                this._makeChartBySprint(artifacts_by_timebox);
            },
            failure: function(msg) {
                Ext.Msg.alert('--', msg);
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
            filters: [{property:end_field, operator: '<=', value: Rally.util.DateTime.toIsoString(new Date)}],
            sorters: [{property:end_field, direction:'DESC'}],
            context: {
                projectScopeUp: false,
                projectScopeDown: false
            }
        };
        
        return TSUtilities.loadWsapiRecords(config);
    },
    
    _sortIterations: function(iterations) {
        
        Ext.Array.sort(iterations, function(a,b){
            if ( Ext.isFunction(a.get) ) { a = a.getData(); }
            if ( Ext.isFunction(b.get) ) { b = b.getData(); }
            
            if ( a.EndDate < b.EndDate ) { return -1; }
            if ( a.EndDate > b.EndDate ) { return  1; }
            return 0;
        });
        
        return iterations;
    },
    
    _fetchArtifactsInTimeboxes: function(timeboxes) {
        if ( timeboxes.length === 0 ) { return; }
        
        var type = this.timebox_type;
        
        var start_field = "StartDate";
        var end_field = "EndDate";
        if ( type == "Release" ) {
            start_field = "ReleaseStartDate";
            end_field   = "ReleaseDate";
        }
        
        var deferred = Ext.create('Deft.Deferred');
        var first_date = timeboxes[0].get(start_field);
        var last_date = timeboxes[timeboxes.length - 1].get(start_field);
        
        var filters = [
            {property: type + '.' + start_field, operator: '>=', value:first_date},
            {property: type + '.' + start_field, operator: '<=', value:last_date},
            {property:'AcceptedDate', operator: '!=', value: null }
        ];
        
        var config = {
            model:'HierarchicalRequirement',
            limit: Infinity,
            filters: filters,
            fetch: ['FormattedID','Name','ScheduleState','Iteration','ObjectID','TaskActualTotal',
                'PlanEstimate','Project','Release','AcceptedDate',start_field,end_field]
        };
        
        Deft.Chain.sequence([
            function() { 
                return TSUtilities.loadWsapiRecords(config);
            },
            function() {
                config.model = "Defect";
                return TSUtilities.loadWsapiRecords(config);
            }
        ],this).then({
            success: function(results) {
                deferred.resolve(Ext.Array.flatten(results));
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
        });
        return deferred.promise;
    },
    
    /*
     * returns a hash of hashes -- key is fibonacci, value is another hash with keys of:
     * 
     * records (an array),
     * actuals (an array)
     * 
     * -1 represents anything that has a size that does not match Fibonacci
     */
    _collectArtifactsByFibonacci: function(items) {
        var fibonacci = [0,1,2,3,5,8,13,21];
        if ( this.getSetting('showNonFibonacciCategory') ) {
            fibonacci.push(-1);
        }
        
        var artifacts_by_fibonacci = {};
        
        Ext.Array.each(fibonacci, function(f) {
            artifacts_by_fibonacci[f] = {
                records: [],
                actuals: []
            }
        });
        
        Ext.Array.each( items, function(item) {
            var plan_estimate = item.get('PlanEstimate') || 0;
            var actuals = item.get('TaskActualTotal') || 0;
            if ( Ext.isEmpty(artifacts_by_fibonacci[plan_estimate] ) ){
                plan_estimate = -1;
            }
            
            if ( artifacts_by_fibonacci[plan_estimate] ) {
                artifacts_by_fibonacci[plan_estimate].records.push(item);
                artifacts_by_fibonacci[plan_estimate].actuals.push(actuals);
            }
        });
        
        return artifacts_by_fibonacci;
    },
    
    /*
     * Given a hash of hashes (from _collectArtifactsByFibonacci above)
     * 
     * Returns a hash of hashes: 
     * { 
     *      fibby number : { 
     *          iteration name : {
     *              records: [],
     *              actuals: []
     *          }
     *      }
     * }
     */
    _collectArtifactsByFibonacciBySprint: function(artifacts_by_size) {
        this.logger.log("_collectArtifactsByFibonacciBySprint", artifacts_by_size);
        
        var me = this,
            artifacts_by_timebox = {};
            
        Ext.Object.each(artifacts_by_size, function(fibby, value){
            var records = value.records;
            var iterations = {};
            
            
            var sorted_iterations = me._sortIterations( Ext.Array.map(records, function(record) { return record.get('Iteration'); }) );
            
            Ext.Array.each(sorted_iterations, function(i){
                iterations[i.Name] = {
                    iteration: i,
                    records: [],
                    actuals: []
                };
            });
            
            Ext.Array.each(records, function(item){
                var iteration_name = item.get('Iteration').Name;

                var plan_estimate = item.get('PlanEstimate') || 0;
                var actuals = item.get('TaskActualTotal') || 0;
                iterations[iteration_name].records.push(item);
                iterations[iteration_name].actuals.push(actuals);
            });
            artifacts_by_timebox[fibby] = iterations;
        });
        
        // set averages
        Ext.Object.each(artifacts_by_timebox, function(fibby, iteration_hash){
            Ext.Object.each(iteration_hash, function(name, iteration_value) {
                iteration_value.average = Ext.Array.mean(iteration_value.actuals);
            });
        });
        
        return artifacts_by_timebox;
    },
    
    _setMinMaxAvg: function(artifacts_by_size) {
        Ext.Object.each(artifacts_by_size, function(fibonacci, size_hash){
            size_hash.max = -1;
            size_hash.min = -1;
            size_hash.average = -1;
            
            var actuals = size_hash.actuals;
            if ( actuals.length > 0 ) {
                size_hash.max = Ext.Array.max(actuals);
                size_hash.min = Ext.Array.min(actuals);
                size_hash.average = Ext.Array.mean(actuals);
            }
        });
        
        return artifacts_by_size;
    
    },
    
    /* 
     * returns a hash of hashes -- key is sprint day name value is
     * another hash where the records key holds a hash
     * as in
     * {1:{"records":{item1,item2},"accepted_sprint_day"}, 1:{"records":{item1,item2},"accepted_sprint_day"}}
     */
    _collectArtifactsByTimebox: function(items) {
        var hash = {},
            timebox_type = this.timebox_type;

        var artifacts_with_timings = [];
        Ext.Array.each(items,function(artifact){
            var accepted_sprint_day = Rally.technicalservices.util.Utilities.daysBetween(artifact.get('Iteration').StartDate,artifact.get('AcceptedDate'),false);
            artifacts_with_timings.push({'artifact':artifact,'accepted_sprint_day':accepted_sprint_day});
        });

        console.log('artifacts_with_timings>>',artifacts_with_timings);

        var hash = {};

        Ext.Array.each(artifacts_with_timings,function(item){
            if(hash[item.accepted_sprint_day]){
                hash[item.accepted_sprint_day].records.push(item.artifact);
                hash[item.accepted_sprint_day].total_records++;
            }
            else{
                hash[item.accepted_sprint_day] = {total_records:1,records:[item.artifact]};
            }
        })


        var temp = [];

        Ext.Array.each(Ext.Object.getKeys(hash),function(key){temp.push(parseInt(key));});

        var max_day = Math.max.apply(Math,temp);

        for(var i=0;i<=max_day;i++){
            if(!hash[i]){
               hash[i] = {total_records:0,records:[]};
            }
        }

        return hash;
    },

    _makeChartBySize: function(artifacts_by_size) {
        var me = this;

        var categories = this._getSizeCategories(artifacts_by_size);

        var series = this._getChartBySizeSeries(artifacts_by_size);
        var colors = CA.apps.charts.Colors.getConsistentBarColors();
        
        if ( this.getSetting('showPatterns') ) {
            colors = CA.apps.charts.Colors.getConsistentBarPatterns();
        }
        this.setChart({
            chartData: { series: series, categories: categories },
            chartConfig: this._getChartBySizeConfig(),
            chartColors: colors
        },0);
        this.setLoading(false);
    },

    _getChartBySizeSeries: function(artifacts_by_size) {
        var me = this,
            series = [],
            mins = [],
            maxs = [],
            avgs = [];
       
        Ext.Object.each(artifacts_by_size, function(fibonacci,size_hash){
            var min = size_hash.min; 
            if ( min < 0 ) { min = null; }
            
            mins.push({
                _records: size_hash.records,
                y: min,
                events: {
                    click: function() {
                        me.showDrillDown(this._records,  "Records for Size " + fibonacci);
                    }
                }
            });
            
            var max = size_hash.max; 
            if ( max < 0 ) { max = null; }
            
            maxs.push({
                _records: size_hash.records,
                y: max,
                events: {
                    click: function() {
                        me.showDrillDown(this._records,  "Records for Size " + fibonacci);
                    }
                }
            });
            
            var average = size_hash.average; 
            if ( average < 0 ) { average = null; }
            
            avgs.push({
                _records: size_hash.records,
                y: average,
                events: {
                    click: function() {
                        me.showDrillDown(this._records,  "Records for Size " + fibonacci);
                    }
                }
            });
        });
        
        series.push({ name: 'Avg. Actuals', data: avgs });
        series.push({ name: 'Min. Actuals', data: mins });
        series.push({ name: 'Max. Actuals', data: maxs });

        return series;
    },    

    _getChartBySizeConfig: function() {
        var me = this;
        return {
            chart: { type: 'column' },
            title: { text: 'Average Actual Hours per Accepted Story/Defect Size' },
            xAxis: {
                title: { text: 'Plan Estimate' }
            },
            yAxis: [{ 
                title: { text: 'Actual Hours' }
            }],
            tooltip: {
                formatter: function() {
                    return '<b>'+ this.series.name +'</b>: '+ me._limitDecimals(this.y);
                }
            },
            plotOptions: {
                series: {
                    marker: {
                        enabled: false,
                        states: {
                            hover: {
                                enabled: true
                            }
                        }
                    },
                    groupPadding: 0.2
                },
                column: {
                    tooltip: {
                        enabled: true
                    },
                    pointPadding: 0
                }
            }
        }
    },

    _makeChartBySprint: function(artifacts_by_sprint) {
        var me = this;
        me.logger.log('_makeChartBySprint', artifacts_by_sprint);

        var categories = this._getSprintCategories(artifacts_by_sprint);

        this.logger.log('categories for sprints:', categories);
        
        var series = this._getChartBySprintSeries(artifacts_by_sprint);
        var colors = CA.apps.charts.Colors.getConsistentBarColors();
        
        if ( this.getSetting('showPatterns') ) {
            colors = CA.apps.charts.Colors.getConsistentBarPatterns();
        }
        this.setChart({
            chartData: { series: series, categories: categories },
            chartConfig: this._getChartBySprintConfig(artifacts_by_sprint),
            chartColors: colors
        },1);
        this.setLoading(false);
    },

    _getChartBySprintSeries: function(artifacts_by_sprint) {
        var me = this,
            series = [],
            avgs = [];
       
        Ext.Object.each(artifacts_by_sprint, function(fibonacci,sprint_hashes){
            Ext.Object.each(sprint_hashes, function(name, sprint_hash){           
                avgs.push({
                    _records: sprint_hash.records,
                    y: sprint_hash.average,
                    events: {
                        click: function() {
                            var title = Ext.String.format("Records for Size {0} in {1}",
                                fibonacci,
                                name
                            );
                            me.showDrillDown(this._records,  title);
                        }
                    }
                });
            });
        });
        
        series.push({ name: 'Avg. Actuals', data: avgs });

        return series;
    },    

    _getChartBySprintConfig: function(artifacts_by_sprint) {
        var me = this;
        return {
            chart: { type: 'column' },
            title: { text: 'Average Actual Hours per Accepted Story/Defect by Size and Sprint' },
            xAxis: {
                title: { text: 'Sprint' },
                plotBands: this._getSizePlotBands(artifacts_by_sprint),
                labels: {
                    rotation: -90
                }
            },
            yAxis: [{ 
                title: { text: 'Average Actual Hours' }
            }],
            tooltip: {
                formatter: function() {
                    return '<b>'+ this.series.name +'</b>: '+ me._limitDecimals(this.y);
                }
            },
            plotOptions: {
                series: {
                    marker: {
                        enabled: false,
                        states: {
                            hover: {
                                enabled: true
                            }
                        }
                    },
                    groupPadding: 0.2
                },
                column: {
                    tooltip: {
                        enabled: true
                    },
                    pointPadding: 0
                }
            }
        }
    },

    _getSizePlotBands: function(artifacts_by_sprint) {
        var me = this,
            bands = [];
        
        var start_index = 0;
        Ext.Object.each(artifacts_by_sprint, function(fibby, sprint_hash){
            var index = start_index;
            var name = fibby; 
            if ( fibby == -1 ) { name = 'Non'; }
            
            Ext.Object.each(sprint_hash, function(name,value){
                index = index + 1;
            });
            
            // skip if no data in there
            if ( start_index != index ) {
                
                bands.push({
                    borderColor: '#eee',
                    borderWidth: 2,
                    from: start_index - 0.5,
                    to: index - 0.5,
                    label: {
                        text: name,
                        align: 'center',
                        y: 15
                    },
                    zIndex: 3
                });
            }
            
            start_index = index;
        });
        
        return bands;
    },

    _limitDecimals: function(initial_value) {
        return parseInt( 10*initial_value, 10 ) / 10;
    },

    _getSprintCategories: function(artifacts_by_sprint) {
        var categories = [];
        
        Ext.Object.each(artifacts_by_sprint, function(fibby,sprint_hash){
            Ext.Object.each(sprint_hash, function(name, value) {
                
                categories.push(name);
            });
        });
        
        return categories;
    },
    
    _getSizeCategories: function(artifacts_by_size) {
        return Ext.Array.map(Ext.Object.getKeys(artifacts_by_size), function(key) {
            if ( key == -1 ) { return "Non-Fibonacci"; }
            return key;
        });
    },

    getSettingsFields: function() {
        return [
        
        { 
            name: 'showPatterns',
            xtype: 'rallycheckboxfield',
            boxLabelAlign: 'after',
            fieldLabel: '',
            margin: '0 0 25 25',
            boxLabel: 'Show Patterns<br/><span style="color:#999999;"><i>Tick to use patterns in the chart instead of color.</i></span>'
        },
        { 
            name: 'showNonFibonacciCategory',
            xtype: 'rallycheckboxfield',
            boxLabelAlign: 'after',
            fieldLabel: '',
            margin: '0 0 25 25',
            boxLabel: 'Show non-Fibonacci Category<br/><span style="color:#999999;"><i>Tick to use show a category for items that have sizes not in the Fibonacci series.</i></span>'
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
                dataIndex: 'TaskActualTotal',
                text: 'Actuals'
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
    }
    
});