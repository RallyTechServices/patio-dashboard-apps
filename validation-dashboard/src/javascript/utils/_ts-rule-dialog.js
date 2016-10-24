Ext.define('CA.technicalservices.RulePickerDialog', {
    extend: 'Rally.ui.dialog.Dialog',
    alias: 'widget.rulepickerdialog',
    
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
            type: 'vbox',
            align: 'left'
        },
        maxHeight: 600,
        maxWidth: 685
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

        if (this.introText) {
            this.add({
                xtype: 'component',
                componentCls: 'intro-panel',
                html: this.introText
            });
        }

        var container = this.add({
            autoScroll: true,
            layout: 'hbox',
            region: 'center',
            width: this.width - 50,
            height: this.height - 100
        });
        
        this._buildCheckboxes(container);
        
        this.add({
            xtype: 'toolbar',
            dock: 'bottom',
            padding: '10 0 10 5',
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

       // this.selectionCache = this.getInitialSelectedRecords() || [];
    },

    /**
     * Get the records currently selected in the dialog
     * {Rally.data.Model}|{Rally.data.Model[]}
     */
    getSelectedRecords: function() {
        return this.rules;
    },

    _buildCheckboxes: function(container) {
        // add three containers, one per rule model family(task,story,portfolioitem)
        
        
        var pi_panel = container.add({
                    xtype: 'panel',
                    title: '<h3>Portfolio Items</h3>',
                    itemId: 'portfolioRulesPanel',
                    layout: 'auto',
                    margin: 5,
                    height: 475,
                    width: 200
                });
        var story_panel = container.add({
                    xtype: 'panel',
                    title: '<h3>Stories</h3>',
                    itemId: 'storyRulesPanel',
                    layout: 'auto',
                    margin: 5,                    
                    height: 475,
                    width: 200                    
                });
        var task_panel = container.add({
                    xtype: 'panel',
                    title: '<h3>Tasks</h3>',
                    itemId: 'taskRulesPanel',
                    layout: 'auto',
                    margin: 5,               
                    height: 475,
                    width: 200                    
                });
        
        // now add the checkboxes for the rules to the appropriate panel
        Ext.Array.each(this.rules,function(rule){
            if (/^PortfolioItem*/.exec(rule.model)){
                pi_panel.add( {
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
                story_panel.add( {
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
                task_panel.add( {
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
                container.add( {
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