Ext.define('CA.techservices.calculator.DefectDelta', {
    extend: 'Rally.data.lookback.calculator.TimeSeriesCalculator',
    config: {
        closedStateValues: ['Closed'],
        allowedPriorities: []
    },

    constructor: function(config) {
        this.initConfig(config);
        this.callParent(arguments);
    },

    getMetrics: function() {
        return [{
            'field': 'isOpen',
            'as': 'Open',
            'f': 'sum',
            'display': 'line'
        }];
        
    },
    
    getDerivedFieldsOnInput: function() {
        var me = this;
        return [
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
    }
});
