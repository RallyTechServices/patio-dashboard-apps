Ext.define('CA.technicalservices.WorkspaceProgramPickerDialog', {
    extend: 'Rally.ui.dialog.Dialog',
    alias: 'widget.workspaceprogrampickerdialog',

    config: {
        autoShow: true,
        
        width: 200,
        height: 200,
        
        closable: false,
        draggable: true,
        /**
         * @cfg {String}
         * Title to give to the dialog
         */
        title: 'Choose Workspace and Program',

        /**
         * @cfg {String}
         * Text to be displayed on the button when selection is complete
         */
        selectionButtonText: 'Done',
        
        /**
         * @cfg {Rally.data.wsapi.Model[]} workspaces
         * 
         * The workspaces to allow for choosing.
         */
        workspaces: []
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
             * @event select
             * Fires when user clicks the done button after choosing the workspace and project
             * @param {CA.technicalservices.ProjectTreePickerDialog} source the dialog
             * @param {Object} the workspace and project chosen.  Looks like:
             *   { workspace: {Rally.data.wsapi.Model}, project: {Rally.data.wsapi.Model} }
             */
            'select'
        );
                
        this.workspaces_by_ref = {};
        Ext.Array.each(this.workspaces, function(workspace){
            this.workspaces_by_ref[workspace.get('_ref')] = workspace;
        },this);
        
        this.addCls(['chooserDialog', 'chooser-dialog']);
    },

    destroy: function() {
        //      this._destroyTooltip();
        this.callParent(arguments);
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
                    disabled: true,
                    userAction: 'clicked done in dialog',
                    handler: function() {
                        this.fireEvent('select', this, this.getSelectedValues());
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
        
        var container = this.add({
            xtype: 'container',
            itemId: 'selector_box'
        });

        this.addSelectors(container);
    },

    addSelectors: function(container) {
        container.removeAll();
        var ws_store = Ext.create('Ext.data.Store',{
            fields: ['_ref','Name'],
            data: Ext.Array.map(this.workspaces, function(workspace) { return workspace.getData(); })
        });
        
        this.workspace_selector = container.add({
            xtype: 'combobox',
            store: ws_store,
            queryMode: 'local',
            displayField:'Name',
            valueField: '_ref',
            fieldLabel: 'Workspace',
            labelAlign: 'top',
            margin: 5,
            
            listeners: {
                scope: this,
                change: function(wb){
                    this.project_selector && this.project_selector.destroy();
                    this._disableDoneButton();
                    
                    this.project_selector = container.add({
                        xtype: 'rallyprojectpicker',
                        showMostRecentlyUsedProjects: false,
                        workspace: wb.getValue(),
                        fieldLabel: 'Program',
                        labelAlign: 'top',
                        margin: 5,
                        listeners: {
                            scope: this,
                            change: function(pb) {
                                if ( pb.getValue() ) {
                                    this._enableDoneButton();
                                } else {
                                    this._disableDoneButton();
                                }
                            }
                        }
                    });
                }
            }
        });
                
    },

    _enableDoneButton: function() {
        this.down('#doneButton').setDisabled(false);
    },

    _disableDoneButton: function() {
        this.down('#doneButton').setDisabled(true);
    },
    
    getSelectedValues: function() {

        if ( Ext.isEmpty(this.project_selector) || Ext.isEmpty(this.workspace_selector) ) {
            return null;
        }
        
        var project = this.project_selector && this.project_selector.getSelectedRecord();
        var workspace_ref = this.workspace_selector && this.workspace_selector.getValue();

        var workspace = this.workspaces_by_ref[workspace_ref];
        return {
            workspace:workspace,
            project: project
        };
    }
});