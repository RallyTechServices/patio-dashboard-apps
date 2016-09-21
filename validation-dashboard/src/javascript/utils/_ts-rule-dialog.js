Ext.define('CA.technicalservices.RulePickerDialog', {
    extend: 'Rally.ui.dialog.Dialog',
    alias: 'widget.rulepickerdialog',

    //layout: 'fit',
    
    config: {
        /**
         * @cfg {String}
         * Title to give to the dialog
         */
        title: 'Choose Rule(s)',

        /**
         * @cfg {String}
         * Text to be displayed on the button when selection is complete
         */
        selectionButtonText: 'Done',

        /**
         * @cfg {String}|{String[]}
         * The ref(s) of items which should be selected when the chooser loads
         */
        rules: undefined,
        minWidth: 400,
        minHeight: 400
    },

    constructor: function(config) {
        this.mergeConfig(config);

        this.callParent([this.config]);
    },

    selectionCache: [],

    initComponent: function() {
        this.callParent(arguments);

        this.addEvents(
            /**
             * @event itemschosen
             * Fires when user clicks done after choosing one or more rules
             * @param {CA.technicalservices.RulePickerDialog} source the dialog
             * @param {CA.techservices.validation.BaseRule[]} selection of an array of selected rules
             */
            'itemschosen'
        );

        this.addCls(['chooserDialog', 'chooser-dialog']);
    },

    beforeRender: function() {
        this.callParent(arguments);

        this.addDocked({
            xtype: 'toolbar',
            dock: 'bottom',
            padding: '0 0 10 0',
            layout: {
                type: 'hbox',
                pack: 'center'
            },
            ui: 'footer',
            items: [
                {
                    xtype: 'rallybutton',
                    itemId: 'doneButton',
                    text: this.selectionButtonText,
                    cls: 'primary rly-small',
                    scope: this,
                    disabled: false,
                    userAction: 'clicked done in dialog',
                    handler: function() {
                        this.fireEvent('itemschosen', this, this.getSelectedRecords());
                        this.close();
                    }
                },
                {
                    xtype: 'rallybutton',
                    text: 'Cancel',
                    cls: 'secondary rly-small',
                    handler: this.close,
                    scope: this,
                    ui: 'link'
                }
            ]
        });

        if (this.introText) {
            this.addDocked({
                xtype: 'component',
                componentCls: 'intro-panel',
                html: this.introText
            });
        }

        this._buildCheckboxes();

       // this.selectionCache = this.getInitialSelectedRecords() || [];
    },

    /**
     * Get the records currently selected in the dialog
     * {Rally.data.Model}|{Rally.data.Model[]}
     */
    getSelectedRecords: function() {
        return this.rules;
    },

    _buildCheckboxes: function() {
        console.log("_buildCheckboxes:", this.rules);

        Ext.Array.each(this.rules,function(rule){
            console.log('InsideArray:',rule);
            this.add( {
                xtype: 'rallycheckboxfield',
                fieldLabel: rule.label,
                name: rule.xtype,
                height: 25,
                value: rule.active,
                listeners: {
                    change: function() {
                        rule.active = this.getValue();
                    }
                }                 
            });
        },this );
    },

    _enableDoneButton: function() {
        this.down('#doneButton').setDisabled(this.selectionCache.length ? false : true);
    },

    _findRecordInSelectionCache: function(record){
        return _.findIndex(this.selectionCache, function(cachedRecord) {
            return cachedRecord.get('_ref') === record.get('_ref');
        });
    }
});