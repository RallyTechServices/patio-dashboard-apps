Ext.define('CA.techservices.ToggleButton', {
    extend: Ext.Container ,
    alias:'widget.tstogglebutton',

    componentCls: 'rui-gridboard-toggle toggle-button-group',
    layout: 'hbox',
    border: 1,
    activeButtonCls: 'rly-active hide-tooltip',

    toggleState: 'size',

    defaultType: 'rallybutton',
    items: [
        {
            itemId: 'size',
            cls: 'toggle rly-left',
            frame: false,
            text: 'S',
            toolTipConfig: {
                html: 'Switch to Size View',
                anchor: 'top',
                hideDelay: 0,
                constrainPosition: false,
                anchorOffset: 45,
                mouseOffset: [-45, 0]
            }
        },
        {
            itemId: 'count',
            cls: 'toggle rly-right',
            frame: false,
            text: 'C',
            toolTipConfig: {
                html: 'Switch to Count View',
                anchor: 'top',
                hideDelay: 0,
                constrainPosition: false,
                anchorOffset: 65,
                mouseOffset: [-65, 0]
            }
        }
    ],

    initComponent: function() {
        this.callParent(arguments);

        this.addEvents([
            /**
             * @event toggle
             * Fires when the toggle value is changed.
             * @param {String} toggleState 'Hours' or 'Days'.
             */
            'toggle'
        ]);

        this.items.each(function(item) {
            this.mon(item, 'click', this._onButtonClick, this);
        }, this);

        this.down('#' + this.toggleState).addCls(this.activeButtonCls);
    },

    _onButtonClick: function(btn) {
        var btnId = btn.getItemId();
        if (btnId !== this.toggleState) {
            this.toggleState = btnId;

            this.items.each(function(item) {
                if (item === btn) {
                    if (!item.hasCls(this.activeButtonCls.split(' ')[0])) {
                        item.addCls(this.activeButtonCls);
                    }
                } else {
                    item.removeCls(this.activeButtonCls);
                }
            }, this);

            this.fireEvent('toggle', this, this.toggleState);
        }
    },
    
    getValue: function() {
        return this.toggleState;
    }
});