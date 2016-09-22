Ext.define("TSProductivityThroughput", {
    extend: 'CA.techservices.app.ChartApp',

    description: "<strong>Productivity - Throughput (Features)</strong><br/>" +
    "<br/>" +
    "Throughput is the number of items completed over a period of time. In this variant " + 
    "it’s the count of features that were fully completed in the timebox.  A feature is fully " +
    "completed when all of its child stories have been accepted." +
    "<br/>" + 
    "This number is for the project(s) in scope only." + 
    "<br/>" + 
    "Why is this Important?<br/><br/>" + 
    "Throughput shows how well work is moving across the board. This can be adversely affected " + 
    "if stories are frequently blocked or inconsistently sized.",
    
    integrationHeaders : {
        name : "TSProductivityThroughput"
    },
    
    config: {
        defaultSettings: {
            showPatterns: false
        }
    },
                        
    launch: function() {
        this.callParent();
        
        TSUtilities.getPortfolioItemTypes().then({
            scope: this,
            success: function(types) {
                this._piTypes = types;
                this._updateData();
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem Loading PI Types', msg);
            }
        });
    },
    
    _updateData: function() {
        var me = this;
        
        this.setLoading("Gathering completed features...");
        this._getCompletedFeatures().then({
            scope: this,
            success: function(features) {
                this._makeChart(features);
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem Loading Features',msg);
            }
        }).always(function() { me.setLoading(false); });
    },
    
    _getMonthStartLastYear: function() {
        var today = new Date();
        var last_year = Rally.util.DateTime.add(today,'month',-12);
        
        last_year.setHours(0,0,0,0);
        last_year.setDate(1);
        
        return last_year;
    },
    
    _getYearOfBuckets: function() {
        var start = this._getMonthStartLastYear();
        
        return Ext.Array.map( _.range(12), function(i) {
            return Rally.util.DateTime.add(start,'month',i);
        });
    },
    
    _getCompletedFeatures: function() {
        var feature = this._piTypes[0].get('TypePath');
        var start_date = this._getMonthStartLastYear();
        var start_date_iso = Rally.util.DateTime.toIsoString(start_date);
        
        this.logger.log('Start Date', start_date, start_date_iso);
        var filters = [{property:'ActualEndDate',operator:'>=',value:start_date_iso}];
        
        config = {
            model: feature,
            filters: filters,
            fetch: ['FormattedID','Name','State','Project','ActualStartDate','ActualEndDate']
        };
        
        return TSUtilities.loadWsapiRecords(config);
    },
    
    _makeChart: function(features) {
        var categories = this._getCategories();
        var series = [ this._getProductivitySeries(features) ];
        var colors = CA.apps.charts.Colors.getConsistentBarColors();
        if ( this.getSetting('showPatterns') ) {
            colors = CA.apps.charts.Colors.getConsistentBarPatterns();
        }
        this.setChart({
            chartData: { series: series, categories: categories },
            chartConfig: this._getChartConfig(),
            chartColors: colors
        },0);
    },
    
    _getCategories: function() {
        return Ext.Array.map(this._getYearOfBuckets(), function(start_of_month){
            return Ext.util.Format.date(start_of_month,'Y-m');
        });
    },
    
    _getProductivitySeries: function(features) {
        var me = this,
            features_by_bucket = {};
        var buckets = this._getYearOfBuckets();
        
        Ext.Array.each(buckets, function(bucket){
            features_by_bucket[Ext.util.Format.date(bucket, 'Y-m')] = [];
        });
        
        Ext.Array.each(features, function(feature){
            var accepted_date = feature.get('ActualEndDate');
            var bucket = Ext.util.Format.date(accepted_date,'Y-m');
            if ( features_by_bucket[bucket] ) {
                features_by_bucket[bucket].push(feature);
            }
        });
        
        var data = Ext.Array.map(Ext.Object.getKeys(features_by_bucket), function(bucket){
            return {
                y: features_by_bucket[bucket].length,
                _records: features_by_bucket[bucket],
                events: {
                    click: function() {
                        me.showDrillDown(this._records,  bucket);
                    }
                }
            };
                
        });
        return {
            name: 'Project',
            data: data,
            type:'column'
        };
    },
    
    _getChartConfig: function() {
        var me = this;
        return {
            chart: { type:'column' },
            title: { text: 'Throughput (Features)' },
            xAxis: {},
            yAxis: [{ 
                title: { text: 'Count' }
            }],
            plotOptions: {
                column: {
                    grouping: false,
                    shadow: false,
                    borderWidth: 0
                }
            },
            tooltip: {
                formatter: function() {
                    return '<b>'+ this.series.name +'</b>: '+ Ext.util.Format.number(this.point.y, '0.##');
                }
            }
        }
    },
 
    getDrillDownColumns: function(title) {
        var columns = [{
            dataIndex : 'FormattedID',
            text: "id"
        },
        {
            dataIndex: 'Name',
            text: 'Name',
            flex: 1
        },
        {
            dataIndex: 'State',
            text: 'State',
            renderer: function(value,meta,record){
                if ( Ext.isEmpty(value) ) {
                    return "";
                }
                return value._refObjectName;
            }
        },
        {
            dataIndex: 'ActualStartDate',
            text:'Actual Start Date',
            renderer: function(value,meta,record) {
                if ( Ext.isEmpty(value) ) { return ""; }
                return Rally.util.DateTime.formatDate(value);
            }
        },
        {
            dataIndex: 'ActualEndDate',
            text:'Actual End Date',
            renderer: function(value,meta,record) {
                if ( Ext.isEmpty(value) ) { return ""; }
                return Rally.util.DateTime.formatDate(value);
            }
        },
        {
            dataIndex: 'Project',
            text: 'Project',
            flex: 1,
            renderer: function(value,meta,record){
                if ( Ext.isEmpty(value) ) {
                    return "";
                }
                return value._refObjectName;
            }
        }];
        
        return columns;
    }
    
});
