Ext.define('CA.techservices.calculator.DefectAccumulation', {
    extend: 'Rally.data.lookback.calculator.TimeSeriesCalculator',
    config: {
        closedStateValues: ['Closed']
    },

    constructor: function(config) {
        this.initConfig(config);
        this.callParent(arguments);
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
                    return 1;
                }
            },
            {
                as: 'isClosed',
                f: function(snapshot) {
                    if ( Ext.Array.contains(me.closedStateValues, snapshot.State) ) {
                        return 1;
                    }
                    return 0;
                }
            }
        ];
    }
});
