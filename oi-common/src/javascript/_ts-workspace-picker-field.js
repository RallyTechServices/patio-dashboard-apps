Ext.define('CA.technicalservices.WorkspaceSettingsField',{
    extend: 'Ext.form.field.Base',
    alias: 'widget.tsworkspacesettingsfield',
    fieldSubTpl: '<div id="{id}" class="settings-grid"></div>',
    width: '100%',
    cls: 'column-settings',

    height: 150,
    width: 500,
    
    store: undefined,
    labelAlign: 'top',
    
    onDestroy: function() {
        if (this._grid) {
            this._grid.destroy();
            delete this._grid;
        }
        this.callParent(arguments);
    },
    
    initComponent: function(){
        this.callParent();

        var me = this;
        this.addEvents('ready');

        this.setLoading("Fetching Information...");
        TSUtilities.getAllWorkspaces().then({
            scope: this,
            success: me._buildWorkspaceGrid,
            failure: function(msg) {
                Ext.Msg.alert('Problem Loading Workspaces', msg);
            }
        });
    },

    onRender: function() {
        this.callParent(arguments);
        this.setLoading('Loading...');
    },
        
    _buildWorkspaceGrid: function(workspaces){
        this.setLoading(false);
        
        var container = Ext.create('Ext.container.Container',{
            layout: { type:'hbox' },
            renderTo: this.inputEl,
            minWidth: 50,
            border: '1px solid red'
        });
        
        var decodedValue = [];
        
        if (this.initialConfig && this.initialConfig.value && !_.isEmpty(this.initialConfig.value)){
            if (!Ext.isObject(this.initialConfig.value)){
                decodedValue = Ext.JSON.decode(this.initialConfig.value);
            } else {
                decodedValue = this.initialConfig.value;
            }
        }
        
        console.log('decodedValue', decodedValue);
        
        var data = [],
            empty_text = "No selections";
            
        if ( Ext.isArray(decodedValue) ) {
            
            data = decodedValue;
            
        } 
        
        var custom_store = Ext.create('Ext.data.Store', {
            fields: ['workspaceName','workspaceRef','workspaceObjectID','workspaceProjectName','workspaceProjectRef','workspaceProjectObjectID'],
            data: data
        });
        
        
        var gridWidth = Math.min(this.width-125, 500);
        this._grid = container.add(  {
            xtype:'rallygrid',
            autoWidth: true,
            columnCfgs: this._getColumnCfgs(workspaces),
            showRowActionsColumn:false,
            showPagingToolbar: false,
            store: custom_store,
            width: gridWidth,
            emptyText: empty_text,
            editingConfig: {
                publishMessages: false
            }
        });
        
        container.add({
            xtype: 'rallybutton',
            text: 'Add Row',
            margin: '0 0 0 10',
            listeners: {
                scope: this,
                click: function(){
                    var store = this._grid.getStore();
                    Ext.create('CA.technicalservices.WorkspaceProgramPickerDialog',{
                        workspaces: workspaces,
                        listeners: {
                            scope: this,
                            select: function(dialog,value) {
                                if ( Ext.isEmpty(value) ) { return; }
                              
                                var workspace = value.workspace;
                                var project = value.project;
                                
                                store.add({
                                    workspaceName: workspace.get('Name'),
                                    workspaceRef: workspace.get('_ref'),
                                    workspaceObjectID: workspace.get('ObjectID'),
                                    workspaceProjectName: project.get('Name'),
                                    workspaceProjectObjectID: project.get('ObjectID'),
                                    workspaceProjectRef: project.get('_ref')
                                });                                
                            }
                        }
                    });

                    
                }
            }
        });

       this.fireEvent('ready', true);
    },
    _removeProject: function(){
        this.grid.getStore().remove(this.record);
    },
    
    _getColumnCfgs: function(workspaces) {
        var me = this;

        var columns = [{
            xtype: 'rallyrowactioncolumn',
            scope: this,
            rowActionsFn: function(record){
                return  [
                    {text: 'Remove', record: record, handler: me._removeProject, grid: me._grid }
                ];
            }
        },
        {
            text: 'Workspace',
            dataIndex: 'workspaceName',
            flex: 1,
            editor: null
        },
        {
            text: 'Program Parent',
            dataIndex: 'workspaceProjectName',
            flex: 1,
            editor: false
        }];
        return columns;
    },
    /**
     * When a form asks for the data this field represents,
     * give it the name of this field and the ref of the selected project (or an empty string).
     * Used when persisting the value of this field.
     * @return {Object}
     */
    getSubmitData: function() {
        var data = {};
        data[this.name] = Ext.JSON.encode(this._buildSettingValue());
        console.log('getSubmitData', data);
        return data;
    },
    
    _buildSettingValue: function() {
        var mappings = [];
        var store = this._grid.getStore();

        store.each(function(record) {
            if (record.get('workspaceRef') && record.get('workspaceProjectRef')) {
                mappings.push({
                    workspaceName: record.get('workspaceName'),
                    workspaceRef: record.get('workspaceRef'),
                    workspaceObjectID: record.get('workspaceObjectID'),
                    workspaceProjectName: record.get('workspaceProjectName'),
                    workspaceProjectObjectID: record.get('workspaceProjectObjectID'),
                    workspaceProjectRef: record.get('workspaceProjectRef')
                });
            }
        }, this);
        
        return mappings;
    },

    getErrors: function() {
        var errors = [];
        //Add validation here
        return errors;
    },
    setValue: function(value) {
        console.log('setValue', value);
        this.callParent(arguments);
        this._value = value;
    }
});