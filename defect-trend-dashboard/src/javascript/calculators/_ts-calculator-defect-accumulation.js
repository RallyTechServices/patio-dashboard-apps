Ext.define('CA.techservices.calculator.DefectAccumulation', {
    extend: 'Rally.data.lookback.calculator.TimeSeriesCalculator',
    config: {
        closedStateValues: ['Closed'],
        allowedPriorities: [],
        /*
         * granularity: "month"|"year"|"day"|"quarter"
         */
        granularity: "day"
    },

    constructor: function(config) {
        this.initConfig(config);
        this.callParent(arguments);
        
        if ( Ext.isEmpty(this.granularity) ) { this.granularity = "day"; }
        this.granularity = this.granularity.toLowerCase();
        
    },
    
    prepareCalculator: function (calculatorConfig) {
        var config = Ext.Object.merge(calculatorConfig, {
            granularity: this.granularity || this.lumenize.Time.DAY,
            tz: this.config.timeZone,
            holidays: this.config.holidays,
            workDays: this._getWorkdays()
        });

        return new this.lumenize.TimeSeriesCalculator(config);
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
    }
});
