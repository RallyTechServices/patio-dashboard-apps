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
         * @cfg {Boolean}
         * Enables the dialog to be draggable.
         */
        draggable: true,

        /**
         * @cfg {String}|{String[]}
         * The ref(s) of items which should be selected when the chooser loads
         */
        rules: undefined,
        layout:{
            type: 'hbox',
            align: 'left'
        },
        minWidth: 800,
        minHeight: 500
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
        // add three containers, one per rule model family(task,story,portfolioitem)
        this.add([
                {
                    xtype: 'panel',
                    title: '<h3>Portfolio Items</h3>',
                    itemId: 'portfolioRulesPanel',
                    layout: 'auto',
                    margin: 5,
                    height: 450,
                    width: 250
                },
                {
                    xtype: 'panel',
                    title: '<h3>Stories</h3>',
                    itemId: 'storyRulesPanel',
                    layout: 'auto',
                    margin: 5,                    
                    height: 450,
                    width: 250                    
                },
                            {
                    xtype: 'panel',
                    title: '<h3>Tasks</h3>',
                    itemId: 'taskRulesPanel',
                    layout: 'auto',
                    margin: 5,               
                    height: 450,
                    width: 250                    
                }
            ]
        );
        // now add the checkboxes for the rules to the appropriate panel
        Ext.Array.each(this.rules,function(rule){
            console.log('InsideArray:',rule.model,rule.label,rule);
            if (/^PortfolioItem*/.exec(rule.model)){
                this.down('#portfolioRulesPanel').add( {
                        xtype: 'rallycheckboxfield',
                        boxLabel: rule.label,
                        autoScroll: true,
                        name: rule.xtype,
                        height: 15,
                        padding: 10,
                        value: rule.active,  // boolean on whether the rule has been selected
                        listeners: {
                            change: function() {
                                rule.active = this.getValue();
                            }
                        }                 
                    });                
            } else if (/^HierarchicalRequirement/.exec(rule.model)){
                this.down('#storyRulesPanel').add( {
                        xtype: 'rallycheckboxfield',
                        boxLabel: rule.label,
                        autoScroll: true,
                        name: rule.xtype,
                        height: 15,
                        padding: 10,
                        value: rule.active,
                        listeners: {
                            change: function() {
                                rule.active = this.getValue();
                            }
                        }                 
                    });                  
            } else if (/^Task/.exec(rule.model)){
                this.down('#taskRulesPanel').add( {
                        xtype: 'rallycheckboxfield',
                        boxLabel: rule.label,
                        autoScroll: true,
                        name: rule.xtype,
                        height: 15,
                        padding: 10,
                        value: rule.active,
                        listeners: {
                            change: function() {
                                rule.active = this.getValue();
                            }
                        }                 
                    });                  
            } else {
                // No match on Model! drop the checkboxes on the raw panel. Will be a 
                // flag to see that we're handling a new model!
                this.add( {
                        xtype: 'rallycheckboxfield',
                        boxLabel: rule.label,
                        autoScroll: true,
                        name: rule.xtype,
                        height: 25,
                        value: rule.active,
                        listeners: {
                            change: function() {
                                rule.active = this.getValue();
                            }
                        }                 
                    });
            }                  
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