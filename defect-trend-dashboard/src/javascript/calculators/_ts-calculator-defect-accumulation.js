Ext.define('CA.techservices.calculator.DefectAccumulation', {
    extend: 'Rally.data.lookback.calculator.TimeSeriesCalculator',
    config: {
        closedStateValues: ['Closed'],
        allowedPriorities: [],
        /*
         * granularity: "month"|"year"|"day"|"quarter"
         */
        granularity: "day",
        /*
         * timeboxCount:  number of days/months/quarters to display back from current
         * 
         * (null to display whatever data is available)
         */
        
        timeboxCount: null
    },
    
    constructor: function(config) {
        this.initConfig(config);
        this.callParent(arguments);
        
        if ( Ext.isEmpty(this.granularity) ) { this.granularity = "day"; }
        this.granularity = this.granularity.toLowerCase();
        
    },

    getMetrics: function() {
        return [{
            'field': 'wasCreated',
            'as': 'Total Defects Opened',
            'f': 'sum',
            'display': 'line'
        },
        {
            'field': 'isClosed',
            'as': 'Total Defects Closed',
            'f': 'sum',
            'display': 'line'
        },
        // added for delta series:
        {
            'field': 'isOpen',
            'as': 'Open',
            'f': 'sum',
            'display': 'column'
        }];
        
    },
    
    getDerivedFieldsOnInput: function() {
        var me = this;
        return [
            { 
                as: 'wasCreated',
                f : function(snapshot) {
                    if ( me._matchesPriority(snapshot) ) { 

                        return 1;
                    }

                    return 0;
                }
            },
            {
                as: 'isClosed',
                f: function(snapshot) {
                    if ( Ext.Array.contains(me.closedStateValues, snapshot.State) ) {
                        if ( me._matchesPriority(snapshot) ) { 
                            return 1;
                        }
                        return 0;
                    }
                    return 0;
                }
            },
            {
                as: 'isOpen',
                f: function(snapshot) {
                    if ( !Ext.Array.contains(me.closedStateValues, snapshot.State) ) {
                        if ( me._matchesPriority(snapshot) ) { 
                            return 1;
                        }
                        return 0;
                    }
                    return 0;
                }
            }
        ];
    },
    
    _matchesPriority: function(snapshot) {
        var me = this;
        
        if ( Ext.isEmpty(me.allowedPriorities) || me.allowedPriorities.length === 0 ) {
            return true;
        }
        
        if ( Ext.Array.contains(me.allowedPriorities, snapshot.Priority) ) {
            return true;
        }
        
        // when hydrated, lookback will return "None" for an empty field
        if ( snapshot.Priority == 'None' && Ext.Array.contains(me.allowedPriorities, '') ) {
            return true;
        }
        return false;
    },
    
    // override to limit number of x points displayed
    runCalculation: function (snapshots) {        
        var calculatorConfig = this._prepareCalculatorConfig(),
            seriesConfig = this._buildSeriesConfig(calculatorConfig);

        var calculator = this.prepareCalculator(calculatorConfig);
        calculator.addSnapshots(snapshots, this._getStartDate(snapshots), this._getEndDate(snapshots));

        var chart_data = this._transformLumenizeDataToHighchartsSeries(calculator, seriesConfig);
        
        var updated_chart_data = this._addEvents(chart_data);

        updated_chart_data = this._removeEarlyDates(updated_chart_data,this.timeboxCount);

        updated_chart_data = this._splitCharts(updated_chart_data);
        
        console.log('--',updated_chart_data);
        
        return updated_chart_data;
    },
    
    _splitCharts: function(data) {
        var series = data.series;
        
        Ext.Array.each(series, function(s) {
            var zindex = 3;
            if ( s.name == "Open" ) { 
                zindex = 2;
                s.yAxis = 1
            }
            s.zIndex = zindex;
            
        });
        
        return data;
    },
    
    _addEvents: function(data){
        var series = data.series;
        
        Ext.Array.each(series, function(s) {
            console.log('s', s);
            s.data = Ext.Array.map(s.data, function(datum){
                return {
                    y: datum,
                    events: {
                        click: function() {
                            Rally.getApp().showTrendDrillDown(this);
                        }
                    }
                }
            });
            
            
        });
        
        return data;
    },
    
    // override to allow for assigning granularity
    prepareCalculator: function (calculatorConfig) {
        var config = Ext.Object.merge(calculatorConfig, {
            granularity: this.granularity || this.lumenize.Time.DAY,
            tz: this.config.timeZone,
            holidays: this.config.holidays,
            workDays: this._getWorkdays()
        });

        return new this.lumenize.TimeSeriesCalculator(config);
    },
    
    _removeEarlyDates: function(chart_data,timebox_count) {
        if ( Ext.isEmpty(timebox_count) ) { return chart_data; }
        
        var categories = Ext.Array.slice(chart_data.categories, -1 * timebox_count);
        var series_group = Ext.Array.map(chart_data.series, function(series) {
            var data = Ext.Array.slice(series.data, -1 * timebox_count);
            // this format is to prevent the series from being modified:
            return Ext.Object.merge( {}, series, { data: data } );
        });
        
        
        return { 
            categories: categories, 
            series: series_group 
        };
            
    }
});
