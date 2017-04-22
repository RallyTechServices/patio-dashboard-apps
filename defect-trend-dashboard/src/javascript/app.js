Ext.define("TSDefectTrendDashboard", {
    extend: 'CA.techservices.app.ChartApp',

    
    descriptions: [
        "<strong>Defect Accumulation</strong><br/>" +
        "<br/>" +
        "What is the defect trend over time? " +
        "This chart shows the trend of creating and closing defects over time." +
        "<p/>" + 
        "Use the priorities drop-down box to determine which defect priorities to " +
        "display.  If nothing is chosen, the app will display all defects regardless " +
        "of priority.  Keep in mind that if filtering on priority, then the data line " +
        "will count the items in the proper state and with that priority on the day of each " +
        "point.  For example, if you choose High priority, a defect created on Monday as Low " +
        "priority but set to High on Wednesday won't get counted on the chart until Wednesday. " +
        "<p/>",
        
        
//        "<strong>Open Defects</strong><br/>" +
//        "<br/>" +
//        "What is the defect trend over time? " +
//        "This chart shows result of defects that remain open over time." +
//        "<p/>" + 
//        "Use the priorities drop-down box to determine which defect priorities to " +
//        "display.  If nothing is chosen, the app will display all defects regardless " +
//        "of priority.  Keep in mind that if filtering on priority, then the data line " +
//        "will count the items in the proper state and with that priority on the day of each " +
//        "point.  For example, if you choose High priority, a defect created on Monday as Low " +
//        "priority but set to High on Wednesday won't get counted on the chart until Wednesday. " +
//        "<p/>",
        
        "<strong>Open Defect Aging (Days Open) by Priority</strong><br/>" +
        "<br/>" +
        "How long have things been open? " +
        "This chart shows the number of defects by how long they've been open. " +
        "Each bar represents a range of day counts and the number is the number of defects that are " +
        "currently open and how long it has been since they were created.  The bar is segmented by priority." +
        "<p/>" + 
        "This chart shows all priorities. " +
        "<p/>",


        "<strong>Defect Closure Durations by Priority</strong><br/>" +
        "<br/>" +
        "How long do things stay open before closure? " +
        "This chart shows the number of defects by how long they were open before closing. " +
        "Each bar represents a range of day counts and the number is the number of defects that are " +
        "currently open and how long it has been since they were created.  The bar is segmented by priority." +
        "<p/>" + 
        "This chart shows all priorities. " +
        "<p/>"
        
    ],
    
    integrationHeaders : {
        name : "TSDefectTrendDashboard"
    },

    
    config: {
        defaultSettings: {
            showPatterns: false,
            closedStateValues: ['Closed']
        }
    },
        
    priorities: null,
    granularity: 'month',
    timebox_limit: 5,
    all_priorities: [],
    
    launch: function() {
        this.callParent();
        
        var closedStates = this.getSetting('closedStateValues');
        if ( Ext.isArray(closedStates) ) { closedStates = closedStates.join(', '); }
                
        this.descriptions[0] += "<strong>Notes:</strong><br/>" +
            "<ul>" +
            "<li>States that count as 'Closed' (can be set by administrator): " + closedStates + "</li>" +
            "</ul>";
                
        this.applyDescription(this.descriptions[0],0);
        
        TSUtilities.getAllowedValues('Defect','Priority').then({
            scope: this,
            success: function(priorities) {
                this.all_priorities = priorities;
                
                this._addSelectors();
                this._updateData();
            },
            failure: function(msg) {
                Ext.Msg.alert("Problem reading priorities", msg);
            }
        });
    },

    _addSelectors: function() {

        this.addToBanner({
            xtype: 'tsmultifieldvaluepicker',
            model: 'Defect',
            field: 'Priority',
            margin: 10,
            fieldLabel: 'Include Priorities:',
            labelWidth: 95,
            listeners:{
                blur:function(picker){
                    this.priorities = Ext.Array.map(picker.getValue(), function(value){ return value.get('StringValue')});
                    this.logger.log("Chosen Priorities", this.priorities, picker.getValue());
                    this._updateData();
                },
                scope:this
            }
        });
        
        var granularity_store = Ext.create('Rally.data.custom.Store',{
            data:[
                { value:'month', display: 'Month' },
                { value:'quarter', display: 'Quarter' },
                { value:'day', display: 'Day' }
            ]
        });
        
        this.addToBanner({
            xtype:'rallycombobox',
            store: granularity_store,
            displayField:'display',
            valueField:'value',
            margin: 10,
            fieldLabel: 'Timebox Granularity:',
            labelWidth: 115,
            listeners: {
                select: function(cb) {
                    this.granularity = cb.getValue();
                    this._updateData();
                },
                scope: this
            }
        });
        
        this.addToBanner({
            xtype: 'rallynumberfield',
            name: 'timeBoxLimit',
            itemId: 'timeBoxLimit',
            fieldLabel: 'Number of Timeboxes:',
            value: this.timebox_limit,
            minValue: 1,
            margin: 10,
            labelWidth: 135,
            width: 200,
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
        
        
    },
    
    _updateData: function() {
        var me = this;
        
        Deft.Chain.pipeline([
            this._makeAccumulationChart,
            //this._makeDeltaChart,
            this._makeDefectAgingChart,
            this._makeDefectOpenTimeChart
        ],this).then({
            scope: this,
            success: function(results) {
                //
            },
            failure: function(msg) {
                Ext.Msg.alert('--', msg);
            }
        });
    },
    
    _makeAccumulationChart: function() {
        var me = this,
            closedStates = this.getSetting('closedStateValues');
        
        if ( !Ext.isArray(closedStates) ) { closedStates = closedStates.split(/,/); }
        
        this.setChartLoading(0,"Loading");
        
        this.setChart({
            xtype: 'rallychart',
            storeType: 'Rally.data.lookback.SnapshotStore',
            storeConfig: this._getChartStoreConfig(),
            
            calculatorType: 'CA.techservices.calculator.DefectAccumulation',
            calculatorConfig: {
                closedStateValues: closedStates,
                allowedPriorities: this.all_priorities,
                granularity: this.granularity,
                endDate: new Date(),
                timeboxCount: this.timebox_limit
            },
            
            chartConfig: this._getAccumulationChartConfig(),
            chartColors: [CA.apps.charts.Colors.red, CA.apps.charts.Colors.green, CA.apps.charts.Colors.blue_light],
            listeners: {
                chartRendered: function() {
                    me.setChartLoading(0,false);
                }
            }
        },0);
    },
    
    _makeDefectOpenTimeChart: function() {
        var me = this,
            closedStates = this.getSetting('closedStateValues');
        if ( !Ext.isArray(closedStates) ) { closedStates = closedStates.split(/,/); }
        
        var colors = CA.apps.charts.Colors.getConsistentBarColors();
                
        if ( this.getSetting('showPatterns') ) {
            colors = CA.apps.charts.Colors.getConsistentBarPatterns();
        }
        
        me.setChartLoading(2,"Loading...");

        this.setChart({
            xtype: 'rallychart',
            storeType: 'Rally.data.lookback.SnapshotStore',
            storeConfig: this._getChartStoreConfig(),
            
            calculatorType: 'CA.TechnicalServices.calculator.DefectResponseTimeCalculator',
            calculatorConfig: {
                closedStateValues: closedStates,
                granularity: 'day',
                buckets: this._getBucketRanges(),
                allowedPriorities: this.all_priorities,
                onPointClick: this.showClosureDrillDown
            },
            
            chartConfig: this._getClosureChartConfig(),
            chartColors: colors,
            listeners: {
                chartRendered: function() {
                    me.setChartLoading(2,false);
                }
            }
        },2);
    },
    
    _makeDefectAgingChart: function() {
        var me = this,
            closedStates = this.getSetting('closedStateValues');
            
        if ( !Ext.isArray(closedStates) ) { closedStates = closedStates.split(/,/); }
        
        this._fetchOpenDefects(closedStates).then({
            scope: this,
            success: function(defects) {
                Ext.Array.each(defects, function(defect){
                    defect.set('__age', me._getAge(defect));
                });
                
                var defects_by_age = this._collectDefectsByAge(defects);
                this.logger.log('buckets:', defects_by_age);
                var categories = Ext.Object.getKeys(defects_by_age);
                var series = this._getAgingSeries(defects_by_age);
                var colors = CA.apps.charts.Colors.getConsistentBarColors();
        
                if ( this.getSetting('showPatterns') ) {
                    colors = CA.apps.charts.Colors.getConsistentBarPatterns();
                }
                this.setChart({
                    chartData: { series: series, categories: categories },
                    chartConfig: this._getAgingChartConfig(),
                    chartColors: colors
                },1);
                this.setLoading(false);
                
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
        });
    },
    
    _fetchOpenDefects: function(closed_states) {
        var filters = Ext.Array.map(closed_states, function(state){
            return {property:'State', operator: '!=', value: state}
        });
        
        var config = {
            model: 'Defect',
            limit: Infinity,
            filters: filters,
            fetch: ['FormattedID','Name','ScheduleState','Iteration','Release','ObjectID',
                'PlanEstimate','Project','State','CreationDate','Priority']
        };
        
        return TSUtilities.loadWsapiRecords(config);
    },
    
    _getAge: function(item){
        return Rally.util.DateTime.getDifference(new Date(), item.get('CreationDate'),'day');
    },
    
    _getBucketRanges: function() {
        return {
            "0-14 Days":  0,
            "15-30 Days": 15,
            "31-60 Days": 31,
            "61-90 Days": 61,
            "91-200 Days": 91,
            "201-300 Days": 201,
            "301+ Days": 301
        };
    },
    
    _collectDefectsByAge: function(defects) {
        
        var bucket_ranges = this._getBucketRanges();
        var buckets = {};
        
        Ext.Object.each(bucket_ranges, function(key, value){
            //buckets[key] = [];
            buckets[key] = {"all":[]};
            Ext.Array.each(this.all_priorities, function(priority){
                if (priority == "") {
                    priority = "None";
                }
                buckets[key][priority] = [];
            }
            );
        },this);
        
        Ext.Array.each(defects, function(defect){
            var age = defect.get('__age');
            var priority = defect.get('Priority');

            var bucket_choice = null;
            Ext.Object.each( bucket_ranges, function( key, value ) {
                if ( age >= value ) {
                    bucket_choice = key;
                }
            });
            buckets[bucket_choice]["all"].push(defect);
            buckets[bucket_choice][priority].push(defect);
            
        });
        
        return buckets;
        
    },
    
    _pushIntoBuckets: function(buckets, name, priority, item) {
        buckets[name].all.push(item);
        buckets[name][priority].push(item); 
        return buckets;
    },
    
    _getAgingSeries: function(defects_by_age){
        var me = this,
            series = [],
            priorities = this.all_priorities;
        
        Ext.Array.each(priorities, function(priority){
            if ( priority == "" ) { priority = "None"; }
            
            series.push({
                name: priority,
                data: me._calculateAgingMeasures(defects_by_age, priority),
                type:'column',
                stack: 'a'
            });
        });
        
        return series;
    },
    
    _calculateAgingMeasures: function(defects_by_age,priority) {
        var me = this,
            data = [];
            
        Ext.Object.each(defects_by_age, function(bucket,value){
            data.push({
                y: value[priority].length,
                _records: value.all,
                events: {
                    click: function() {
                        me.showDrillDown(this._records, bucket);
                    }
                }
            });
        });
        
        return data;
    },
    
    _getAgingChartConfig: function() {
        var me = this;
        return {
            chart: { type:'column' },
            title: { text: 'Open Defect Aging (Days Open)' },
            xAxis: {},
            yAxis: [{ 
                title: { text: 'Open Defects' }
            }],
            plotOptions: {
                column: {
                    stacking: 'normal'
                }
            },
            tooltip: {
                formatter: function() {
                    return '<b>'+ this.series.name +'</b>: '+ Ext.util.Format.number(this.point.y, '0.##');
                }
            }
        }
    },
    
    _makeDeltaChart: function() {
        var closedStates = this.getSetting('closedStateValues');
        if ( !Ext.isArray(closedStates) ) { closedStates = closedStates.split(/,/); }
        
        this.setChart({
            xtype: 'rallychart',
            storeType: 'Rally.data.lookback.SnapshotStore',
            storeConfig: this._getChartStoreConfig(),
            
            calculatorType: 'CA.techservices.calculator.DefectDelta',
            calculatorConfig: {
                closedStateValues: closedStates,
                allowedPriorities: this.all_priorities,
                granularity: this.granularity,
                timeboxCount: this.timebox_limit
            },
            
            chartConfig: this._getDeltaChartConfig(),
            chartColors: ['#000']
        },1);
    },
    
    _getChartStoreConfig: function() {     
        // this.granularity  this.timebox_limit
        var granularity = this.granularity; 
        var count = -1 * this.timebox_limit;
        if ( granularity == "quarter" ) {
            granularity = "month";
            count = 3 * count;
        }
        var start_date = Rally.util.DateTime.toIsoString(
            Rally.util.DateTime.add(new Date(), this.granularity, -1 * this.timebox_limit )
        );
        
        this.logger.log('start date:', start_date);
        
        return {
            find: {
                _TypeHierarchy: 'Defect',
                _ProjectHierarchy: this.getContext().getProject().ObjectID,
//                "$or": [
//                    { _ValidFrom: { "$gte": start_date } },
//                    { __At: start_date }
//                ]
           },
           removeUnauthorizedSnapshots: true,
           compress: true,
           fetch: ['ObjectID','State','Priority','CreationDate','FormattedID','Name'],
           hydrate: ['State','Priority'],
           sort: {
               '_ValidFrom': 1
           }
        };
    },
    
    _getTickInterval: function(granularity) {
        if ( Ext.isEmpty(granularity) ) { return 30; }
        
        
        granularity = granularity.toLowerCase();
        if (this.timebox_limit < 30) {
            return 1;
        }
        if ( granularity == 'day' ) { return 30; }
        
        return 1;
        
    },
    
    _getAccumulationChartConfig: function() {
        var me = this;
        return {
            chart: {
                zoomType: 'xy'
            },
            title: {
                text: 'Defect Accumulation'
            },
            xAxis: {
                tickmarkPlacement: 'on',
                tickInterval: this._getTickInterval(this.granularity),
                title: {
                    text: 'Date'
                },
                labels            : {
                    rotation : -45
                }
            },
            yAxis: [
                {
                    min: 0,
                    title: {
                        text: 'Total Defects (cumulative)'
                    }
                },
                {
                    min: 0,
                    title: {
                        text: 'Total Defects'
                    },
                    opposite: true
                }
            ],
            tooltip: { shared: true },
            plotOptions: {
                series: {
                    marker: {
                        enabled: false
                    }
                },
                area: {
                    stacking: 'normal'
                }
            }
        };
    },
    
    _getDeltaChartConfig: function() {
        return {
            chart: {
                zoomType: 'xy'
            },
            title: {
                text: ''
            },
            xAxis: {
                tickmarkPlacement: 'on',
                tickInterval: this._getTickInterval(this.granularity),
                title: {
                    text: 'Date'
                },
                labels            : {
                    rotation : -45
                }
            },
            yAxis: [
                {
                    min: 0,
                    title: {
                        text: 'Total Open Defects'
                    }
                }
            ],
            tooltip: { shared: true },
            plotOptions: {
                series: {
                    marker: {
                        enabled: false
                    }
                },
                area: {
                    stacking: 'normal'
                }
            }
        };
    },
    
    _getClosureChartConfig: function() {
        return {
            chart: {
                zoomType: 'xy'
            },
            title: {
                text: 'Defect Closure Durations by Priority'
            },
            xAxis: {
                tickmarkPlacement: 'on',
                title: {
                    text: ''
//                },
//                labels            : {
//                    rotation : -45
                }
            },
            yAxis: [
                {
                    min: 0,
                    title: {
                        text: 'Days to Close'
                    }
                }
            ],
            tooltip: { shared: true },
            plotOptions: {
                series: {
                    marker: {
                        enabled: false
                    }
                },
                column: {
                    stacking: 'normal'
                }
            }
        };
    },
    
    getSettingsFields: function() {
        var left_margin = 5;
        return [{
            name: 'closedStateValues',
            xtype: 'tsmultifieldvaluepicker',
            model: 'Defect',
            field: 'State',
            margin: left_margin,
            fieldLabel: 'States to Consider Closed',
            labelWidth: 150
        },
        
        { 
            name: 'showPatterns',
            xtype: 'rallycheckboxfield',
            boxLabelAlign: 'after',
            fieldLabel: '',
            margin: '0 0 225 ' + left_margin,
            boxLabel: 'Show Patterns<br/><span style="color:#999999;"><i>Tick to use patterns in the chart instead of color.</i></span>'
        }];
    },
    
    getDrillDownColumns: function(title) {
        var columns = [
            {
                dataIndex : 'FormattedID',
                text: "id",
                flex:1
            },
            {
                dataIndex : 'Name',
                text: "Name",
                flex: 2
            },
            {
                dataIndex: 'CreationDate',
                text: 'Created'
            },
            {
                dataIndex: '__age',
                text: 'Age (Days)'
            },
            { 
                dataIndex: 'Priority',
                text: 'Priority'
            },
            {
                dataIndex: 'State',
                text: 'State'
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
     * expecting input like 2015Q3
     */
    _getEndOfQuarterFromCategory: function(category){
        var year = category.replace(/Q.*$/,'');
        var quarter = parseInt(category.replace(/.*Q/,''),10);
        
        var month = quarter * 3;
        var point_date = new Date(year,month,1);
        var shifted_date = Rally.util.DateTime.add(jsdate,'day',-1);
        if ( shifted_date > new Date() ) {
            shifted_date = new Date();
        }
        return Rally.util.DateTime.toIsoString(shifted_date).replace(/T.*$/,'');
 
    },
    
    _getDateFromPoint: function(point) {
        var point_date = point.category;
        
        if ( this.granularity == "month" ) {
            point_date = point_date + "-01";
            var jsdate = Rally.util.DateTime.fromIsoString(point_date);
            var shifted_date = Rally.util.DateTime.add(jsdate,'month',1);
            shifted_date = Rally.util.DateTime.add(shifted_date,'day',-1);
            if ( shifted_date > new Date() ) {
                shifted_date = new Date();
            }
            point_date = Rally.util.DateTime.toIsoString(shifted_date).replace(/T.*$/,'');
        }
        
        if ( this.granularity == "quarter" ) {
            point_date = this._getEndOfQuarterFromCategory(point_date);
        }
        return point_date;
    },
    
    showClosureDrillDown: function(point) {
        var store = Ext.create('Rally.data.custom.Store',{
            data: point.__all_records || []
        });
        var columns = [
            {dataIndex:'FormattedID',text:'id'},
            {dataIndex:'Name',text:'Name',flex:1},
            {dataIndex:'State',text:'State'},
            {dataIndex:'Priority',text:'Priority'},
            {dataIndex:'__cycle', text:'Time to Close (Days)', flex: 1, renderer: function(value,meta,record){
                if ( Ext.isEmpty(value) ){ return ""; }
                return Ext.util.Format.number(value,'0.0');
            }}
        ];
//            
        
        Ext.create('Rally.ui.dialog.Dialog', {
            id        : 'detailPopup',
            title     : point.category,
            width     : Ext.getBody().getWidth() - 50,
            height    : Ext.getBody().getHeight() - 50,
            closable  : true,
            layout    : 'border',
            items     : [{
                xtype                : 'rallygrid',
                region               : 'center',
                layout               : 'fit',
                sortableColumns      : true,
                showRowActionsColumn : false,
                showPagingToolbar    : true,
                columnCfgs           : columns,
                store : store
            }]
        }).show();
        
    },
    
    showTrendDrillDown: function(point) {
        var me = this;
        
        var iso_date = this._getDateFromPoint(point);

        var filters = [
            {property:'_TypeHierarchy',value:'Defect'},
            {property:'__At',value:iso_date},
            {property:'_ProjectHierarchy',value:this.getContext().getProject().ObjectID}
        ];
        
        
        var config = {
            fetch: ['FormattedID','Name','State','Priority'],
            filters: filters,
            hydrate: ['Priority','State'],
            autoLoad: true
        };
        
        TSUtilities.loadLookbackRecords(config).then({
            scope: this,
            failure: function(msg) {
                Ext.Msg.alert("Problem loading Drill Down",msg);
            },
            success: function(records) {
                // loading into custom store because the snapshot store and
                // column combination isn't allowing us to put anything into
                // the FOrmattedID column, even though we have the data.
                var store = Ext.create('Rally.data.custom.Store',{
                    data: records
                });
                var columns = [
                    {dataIndex:'FormattedID',text:'id'},
                    {dataIndex:'Name',text:'Name',flex:1},
                    {dataIndex:'State',text:'State'},
                    {dataIndex:'Priority',text:'Priority', flex: 1}
                ];
    //            
                Ext.create('Rally.ui.dialog.Dialog', {
                    id        : 'detailPopup',
                    title     : 'Defects on ' + iso_date,
                    width     : Ext.getBody().getWidth() - 50,
                    height    : Ext.getBody().getHeight() - 50,
                    closable  : true,
                    layout    : 'border',
                    items     : [{
                        xtype                : 'rallygrid',
                        region               : 'center',
                        layout               : 'fit',
                        sortableColumns      : true,
                        showRowActionsColumn : false,
                        showPagingToolbar    : true,
                        columnCfgs           : columns,
                        store : store
                    }]
                }).show();
            }
        });
        
        
    }
    
    
});
