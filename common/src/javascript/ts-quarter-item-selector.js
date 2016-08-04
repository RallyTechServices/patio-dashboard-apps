Ext.define('quarter-item-selector', {
    extend : 'Ext.Container',
    componentCls : 'app',
    alias : 'widget.quarteritemselector',
    layout : 'hbox',
    width : '100%',
    mixins : [
        'Rally.Messageable',
        'Ext.state.Stateful'
    ],
    stateful: true,
    stateEvents: ['change'],

    buttonPushed: false,
    constructor : function(config){
        this.callParent(arguments);
    },

    initComponent : function()
    {
        this.callParent(arguments);
        this.removeAll();

        this._addSelector();
        // configured to allow others to ask what the current selection is,
        // in case they missed the initial message
        this.subscribe(this, 'requestQuarter', this._requestQuarter, this);

    },
    _addSelector: function(){
        // The data store containing the list of states
        var quarters = Ext.create('Ext.data.Store', {
            fields: ['abbr', 'name','startDate','endDate'],
            data : [
                {"abbr":"Q12015", "name":"2015 - Q1", "startDate":"2014-10-01", "endDate":"2014-12-31"},
                {"abbr":"Q22015", "name":"2015 - Q2", "startDate":"2015-01-01", "endDate":"2015-03-31"},
                {"abbr":"Q32015", "name":"2015 - Q3", "startDate":"2015-04-01", "endDate":"2015-06-30"},
                {"abbr":"Q42015", "name":"2015 - Q4", "startDate":"2015-07-01", "endDate":"2015-09-30"},            
                {"abbr":"Q12016", "name":"2016 - Q1", "startDate":"2015-10-01", "endDate":"2015-12-31"},
                {"abbr":"Q22016", "name":"2016 - Q2", "startDate":"2016-01-01", "endDate":"2016-03-31"},
                {"abbr":"Q32016", "name":"2016 - Q3", "startDate":"2016-04-01", "endDate":"2016-06-30"},
                {"abbr":"Q42016", "name":"2016 - Q4", "startDate":"2016-07-01", "endDate":"2016-09-30"},
                {"abbr":"Q12017", "name":"2017 - Q1", "startDate":"2016-10-01", "endDate":"2016-12-31"},
                {"abbr":"Q22017", "name":"2017 - Q2", "startDate":"2017-01-01", "endDate":"2017-03-31"},
                {"abbr":"Q32017", "name":"2017 - Q3", "startDate":"2017-04-01", "endDate":"2017-06-30"},
                {"abbr":"Q42017", "name":"2017 - Q4", "startDate":"2017-07-01", "endDate":"2016-09-30"}                
            ]
        });

        

        this.add({
            xtype: 'combobox',
            fieldLabel: 'Choose Quarter',
            itemId: 'quarter-combobox',
            store: quarters,
            queryMode: 'local',
            displayField: 'name',
            valueField: 'abbr',
            margin: 10,
            listeners:{
                change: this._updateGoButton,
                scope: this,
            }

        });

        this.add({
                xtype: 'rallybutton',
                text: 'Go',
                itemId: 'cb-go-button',
                cls: 'rly-small primary',
                disabled: true,
                margin: 10,
                listeners: {
                    scope: this,
                    click: this._updateQuarter
                }
        });

    },

    _updateQuarter: function(){
        this.buttonPushed = true;
        var cb = this.down('#quarter-combobox');
        
        if (cb){
            var quarter = cb.findRecordByValue(cb.value);
            this.quarter = quarter;
            this.fireEvent('change', quarter);
            this.publish('quarterSelected', quarter);
            if (this.stateful && this.stateId){
                this.saveState();
            }
        }

    },

    _updateGoButton: function(cb) {
        if ( !Ext.isEmpty(cb.getValue()) ) {
            this.down('#cb-go-button').setDisabled(false);
        } else {
            this.down('#cb-go-button').setDisabled(true);
        }
    },

    _requestQuarter : function() {
        // only publish if the go button has been pushed
        if ( this.buttonPushed ) {
            this.publish('quarterSelected', this.quarter || null);
            return;
        }
        
        console.log("Requested Quarter, but the user hasn't pushed the Go button");
        
    },

});