Ext.define("TSVariabilityThroughputStories", {
    extend: 'CA.techservices.app.ChartApp',

    description: "<strong>Predictability - Variability of Throughput Stories</strong><br/><br/>" +
    "Variability of Throughput is computed by finding the average (mean) and standard deviation of Throughput (number of accepted stories for a month) for 3 month time periods. The Coefficient of Variance is the standard deviation divided by the mean.<br/>" +
    "<br/>Why is this Important?<br/>"+
    "Variability of Throughput shows how consistently your team delivers the same amount of work each timebox. This can be adversely affected if stories are frequently blocked or inconsistently sized. If consistent Throughput (Stories) is important to you, then you will want to include Variability of Throughput (Stories) in your Predictability score.",
    
    integrationHeaders : {
        name : "TSVariabilityThroughputStories"
    },
    
    config: {
        defaultSettings: {
            showPatterns: false
        }
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
        }
        ];        
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
        
        this.setLoading("Gathering Storys...");
        this._getCreatedStorys().then({
            scope: this,
            success: function(storys) {
                this._makeChart(storys);
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem Loading storys',msg);
            }
        }).always(function() { me.setLoading(false); });
    },
    
    _getMonthStartLastYear: function(forDisplay) {
        var today = new Date();
        var range = -(forDisplay?12:15);        
        var last_year = Rally.util.DateTime.add(today,'month',range);
        
        last_year.setHours(0,0,0,0);
        last_year.setDate(1);
        
        return last_year;
    },
    
    _getYearOfBuckets: function(forDisplay) {
        var initial = this._getMonthStartLastYear(forDisplay);
        var range = forDisplay?12:15;

        return Ext.Array.map( _.range(range), function(i) {
            start = Rally.util.DateTime.add(initial,'month',i);
            end = start;
            end = new Date(start.getFullYear(),end.getMonth()+1,0);
            differnce = Rally.technicalservices.util.Utilities.daysBetween(start,end,true);
            return {"Start":start,"End":end,"Difference":differnce};
        });
    },
    
    _getCreatedStorys: function() {
        var start_date = this._getMonthStartLastYear(false);
        var start_date_iso = Rally.util.DateTime.toIsoString(start_date);
        
        this.logger.log('Start Date', start_date, start_date_iso);
        var filters = [{property:'AcceptedDate',operator:'!=',value:null}, {property:'AcceptedDate',operator:'>=',value:start_date_iso}];
        
        config = {
            model: 'UserStory',
            filters: filters,
            fetch: ['FormattedID','Name','ScheduleState','Project','AcceptedDate']
        };
        
        return TSUtilities.loadWsapiRecords(config);
    },
    
    _makeChart: function(storys) {
        var categories = this._getCategories();
        var series = [ this._getVariabilitySeries(storys) ];
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
        return Ext.Array.map(this._getYearOfBuckets(true), function(start_of_month){
            return Ext.util.Format.date(start_of_month.Start,'Y-m');
        });
    },
    

    _getVariabilitySeries: function(stories) {
        var me = this,
            storys_by_bucket = {},
            storys_by_bucket_year ={};

        var buckets = this._getYearOfBuckets(false);
        var buckets_year = this._getYearOfBuckets(true);
        
        Ext.Array.each(buckets, function(bucket){
            storys_by_bucket[Ext.util.Format.date(bucket.Start, 'Y-m')] = {"Difference":bucket.Difference,all:[]};
        });
        
        Ext.Array.each(buckets_year, function(bucket){
            storys_by_bucket_year[Ext.util.Format.date(bucket.Start, 'Y-m')] = {};
        });

        Ext.Array.each(stories, function(story){
            var accepted_date = story.get('AcceptedDate');
            var bucket = Ext.util.Format.date(accepted_date,'Y-m');
            if ( storys_by_bucket[bucket] ) {
                storys_by_bucket[bucket].all.push(story);
            }
        });
        
        var data = Ext.Array.map(Ext.Object.getKeys(storys_by_bucket_year), function(bucket){

            var bucket_date = new Date(bucket+"-02");
            var last_year = Rally.util.DateTime.add(new Date(),'month',-12);

            //if(bucket_date > last_year){
            
            var bucket_minus_one = Ext.util.Format.date(new Date(bucket_date.setMonth(bucket_date.getMonth() -1)), 'Y-m');

            var bucket_minus_two = Ext.util.Format.date(new Date(bucket_date.setMonth(bucket_date.getMonth() -1)), 'Y-m');

            var bucket_value = storys_by_bucket[bucket]? storys_by_bucket[bucket].all.length : 0;

            
            var mean =  (bucket_value + storys_by_bucket[bucket_minus_one]? storys_by_bucket[bucket_minus_one].all.length:0 + storys_by_bucket[bucket_minus_two]?storys_by_bucket[bucket_minus_two].all.length:0)/3;
            var value = me._standardDeviation([bucket_value , storys_by_bucket[bucket_minus_one]? storys_by_bucket[bucket_minus_one].all.length:0 , storys_by_bucket[bucket_minus_two]?storys_by_bucket[bucket_minus_two].all.length:0]);
            return {
                y: mean > 0 ? value/mean:0,
                _records: storys_by_bucket[bucket]?storys_by_bucket[bucket].all:[],
                events: {
                    click: function() {
                        me.showDrillDown(this._records,  bucket+": "+Ext.util.Format.number(value, '0.##')+" Points");
                    }
                }
            };


        });
        return {
            name: 'Project',
            data: data,
            color: CA.apps.charts.Colors.blue_light,
            type:'areaspline'
        };
    },
    

    _standardDeviation:function(values){
      var avg = this._average(values);
      
      var squareDiffs = values.map(function(value){
        var diff = value - avg;
        var sqrDiff = diff * diff;
        return sqrDiff;
      });
      
      var avgSquareDiff = this._average(squareDiffs);

      var stdDev = Math.sqrt(avgSquareDiff);
      return stdDev;
    },

    _average:function (data){
      var sum = data.reduce(function(sum, value){
        return sum + value;
      }, 0);

      var avg = sum / data.length;
      return avg;
    },    

    _getChartConfig: function() {
        var me = this;
        return {
            chart: { type:'areaspline' },
            title: { text: 'Predictability - Variability of Throughput Stories' },
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
            dataIndex: 'ScheduleState',
            text: 'ScheduleState',
            flex:1
        },
        {
            dataIndex: 'AcceptedDate',
            text:'Accepted Date',
            flex:1
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
