Ext.define('CA.technicalservices.ProjectTreePickerDialog', {
    extend: 'Rally.ui.dialog.Dialog',
    alias: 'widget.projecttreepickerdialog',

    minWidth: 400,
    width: 400,
    minHeight: 300,
    height: 300,
    
    layout: 'fit',
    closable: true,
    draggable: true,

    config: {
        /**
         * @cfg {String}
         * Title to give to the dialog
         */
        title: 'Choose Project(s)',
        /**
         * 
         * @cfg {String} introText
         * 
         *  Informational text to include on the dialog.
         */
        introText: null,
        
        /**
         * @cfg {Boolean}
         * Allow multiple selection or not
         */
        multiple: true,
        
        /**
         * @cfg {Object}  || Rally.data.wsapi.Filter[]  
         * Name of top project to start building the tree down through the hierarchy.
         */
        root_filters: [{
                property: 'Parent',
                value: ""
        }],

        /**
         * @cfg {Object}
         * An {Ext.data.Store} config object used when building the grid
         * Handy when you need to limit the selection with store filters
         */
        storeConfig: {
            context: {
                project: null
            },
            sorters: [
                {
                    property: 'Name',
                    direction: 'DESC'
                }
            ]
        },

        /**
         * @cfg {Ext.grid.Column}
         * List of columns that will be used in the chooser
         */
        columns: [
            'Name'
        ],

        /**
         * @cfg {String}
         * Text to be displayed on the button when selection is complete
         */
        selectionButtonText: 'Done',

        /**
         * @cfg {Object}
         * The grid configuration to be used when creative the grid of items in the dialog
         */
        gridConfig: {},

        /**
         * @cfg {Object[] || Rally.data.wsapi.Model[]}  initialSelectedRecords
         * The records to select when the chooser loads.  Provide either configuration objects
         * (with at lease { _ref: xxx } defined) or models
         */
        initialSelectedRecords: undefined,

        /**
         * @cfg showRadioButtons {Boolean}
         */
        showRadioButtons: true,
        
        /**
         * @cfg showSearchBox {Boolean}
         * 
         * [ Experimental.  Search box might not work ]
         */
        showSearchBox: false
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
             * @event artifactchosen
             * Fires when user clicks done after choosing an artifact
             * @param {Rally.ui.dialog.ArtifactChooserDialog} source the dialog
             * @param {Rally.data.wsapi.Model}| {Rally.data.wsapi.Model[]} selection selected record or an array of selected records if multiple is true
             */
            'itemschosen'
        );

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
                        this.fireEvent('itemschosen', this.getSelectedRecords());
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

        if ( this.showSearchBox ) {
            this.addDocked({
                xtype: 'toolbar',
                itemId: 'searchBar',
                dock: 'top',
                border: false,
                padding: '0 0 10px 0',
                items: this.getSearchBarItems()
            });
        }

        this.buildGrid();

        this.selectionCache = this.getInitialSelectedRecords() || [];
    },

    /**
     * Get the records currently selected in the dialog
     * {Rally.data.Model}|{Rally.data.Model[]}
     */
    getSelectedRecords: function() {
        return this.multiple ? this.selectionCache : this.selectionCache[0];
    },

    getSearchBarItems: function() {
        
        return [
            {
                xtype: 'triggerfield',
                cls: 'rui-triggerfield chooser-search-terms',
                emptyText: 'Search Keyword or ID',
                enableKeyEvents: true,
                flex: 1,
                itemId: 'searchTerms',
                listeners: {
                    keyup: function (textField, event) {
                        if (event.getKey() === Ext.EventObject.ENTER) {
                            this._search();
                        }
                    },
                    afterrender: function (field) {
                        field.focus();
                    },
                    scope: this
                },
                triggerBaseCls: 'icon-search chooser-search-icon'
            }
        ];
    },
    getStoreFilters: function() {
        return [];
    },

    buildGrid: function() {
        if (this.grid) {
            this.grid.destroy();
        }
        var me = this;

        this.setLoading('Fetching Project Tree...');
        Ext.create('Rally.data.wsapi.ProjectTreeStoreBuilder').build({
            models: ['project'],
            autoLoad: true,
            enableHierarchy: true,
            filters: me.root_filters,
            sorters: [{property:'Name'}]
        }).then({
            scope: this,
            success: function(store) {

                var mode = this.multiple ? 'MULTI' : 'SINGLE';

                var checkbox_model = Ext.create('Rally.ui.selection.CheckboxModel', {
                    mode: mode,
                    enableKeyNav: false,
                    allowDeselect: true
                });

                this.grid = this.add({
                    xtype: 'rallytreegrid',
                    treeColumnDataIndex: 'Name',
                    treeColumnHeader: 'Name',
                    viewConfig: {
                        cls: 'grid-view-bulk-edit'
                    },
                    enableRanking: false,
                    enableEditing: false,
                    enableBulkEdit: false,
                    shouldShowRowActionsColumn: false,

                    selModel: checkbox_model,
                    _defaultTreeColumnRenderer: function (value, metaData, record, rowIdx, colIdx, store) {
                        store = store.treeStore || store;
                        return Rally.ui.renderer.RendererFactory.getRenderTemplate(store.model.getField('Name')).apply(record.data);
                    },
                    columnCfgs: [],
                    store: store
                });

                this.mon(this.grid, {
                    beforeselect: this._onGridSelect,
                    beforedeselect: this._onGridDeselect,
                    load: this._onGridLoad,
                    scope: this
                });
                this.add(this.grid);
                this._onGridReady();
            }
        }).always(function() { me.setLoading(false);} );
    },

    _enableDoneButton: function() {
        this.down('#doneButton').setDisabled(this.selectionCache.length ? false : true);
    },

    _findRecordInSelectionCache: function(record){
        var me = this;
        return _.findIndex(this.selectionCache, function(cachedRecord) {
            return me._specialGet(cachedRecord,'_ref') === me._specialGet(record,'_ref');
        });
    },

    _onGridSelect: function(selectionModel, record) {
        var index = this._findRecordInSelectionCache(record);

        if (index === -1) {
            if (!this.multiple) {
                this.selectionCache = [];
            }
            this.selectionCache.push(record);
        }

        this._enableDoneButton();
    },

    _onGridDeselect: function(selectionModel, record) {
        var index = this._findRecordInSelectionCache(record);
        if (index !== -1) {
            this.selectionCache.splice(index, 1);
        }
        this._enableDoneButton();
    },

    _onGridReady: function() {
        if (!this.grid.rendered) {
            this.mon(this.grid, 'afterrender', this._onGridReady, this, {single: true});
            return;
        }

        if (this.grid.getStore().isLoading()) {
            this.mon(this.grid, 'load', this._onGridReady, this, {single: true});
            return;
        }

        this._onGridLoad();
        this.center();
    },
    
    _specialGet: function(item, field) {
        if ( Ext.isEmpty(item) ) { 
            return null;
        }
        
        if ( Ext.isFunction(item.get) ) { 
            return item.get(field);
        }
        
        return item[field];
    },
    
    _onGridLoad: function() {
        var store = this.grid.store;
        var records = [];
        Ext.Array.each(this.selectionCache, function(record) {
            var ref = this._specialGet(record,'_ref');
            var foundNode = store.getRootNode().findChild('_ref',ref,true);

            if (foundNode) {
                records.push(foundNode);
            }
        },this);
        if (records.length) {
            this.grid.getSelectionModel().select(records);
        }
    },
    _search: function() {
        var terms = this._getSearchTerms();
        var store = this.grid.getStore();
        //Filter functions call store load so we don't need to refresh the selections becuaes the
        //onGridLoad function will
        if (terms) {
            store.filter([
                Ext.create('Rally.data.wsapi.Filter',{
                    property: 'Name',
                    operator: 'contains',
                    value: terms
                })
            ]);
        } else {
            store.clearFilter();
        }

    },
    _getSearchTerms: function() {
        var textBox = this.down('#searchTerms');
        return textBox && textBox.getValue();
    }
});

Ext.override(Rally.data.wsapi.ParentChildMapper, {
    constructor: function() {
        this.parentChildTypeMap = {
            project: [{
                typePath: 'project', collectionName: 'Children', parentField: 'Parent'
            }],
            hierarchicalrequirement: [
                {typePath: 'defect', collectionName: 'Defects', parentField: 'Requirement'},
                {typePath: 'task', collectionName: 'Tasks', parentField: 'WorkProduct'},
                {typePath: 'testcase', collectionName: 'TestCases', parentField: 'WorkProduct'},
                {typePath: 'hierarchicalrequirement', collectionName: 'Children', parentField: 'Parent'}
            ],
            defect: [
                {typePath: 'task', collectionName: 'Tasks', parentField: 'WorkProduct'},
                {typePath: 'testcase', collectionName: 'TestCases', parentField: 'WorkProduct'}
            ],
            defectsuite: [
                {typePath: 'defect', collectionName: 'Defects', parentField: 'DefectSuites'},
                {typePath: 'task', collectionName: 'Tasks', parentField: 'WorkProduct'},
                {typePath: 'testcase', collectionName: 'TestCases', parentField: 'WorkProduct'}
            ],
            testset: [
                {typePath: 'task', collectionName: 'Tasks', parentField: 'WorkProduct'},
                {typePath: 'testcase', collectionName: 'TestCases', parentField: 'TestSets'}
            ]
        };
    }
});


Ext.define('Rally.data.wsapi.ProjectTreeStore', {

    extend: 'Rally.data.wsapi.TreeStore',
    alias: 'store.rallyprojectwsapitreestore',
    
    /**
     * The type definition typePaths to render as root items (required)
     * @cfg {String[]} parentTypes
     */
    parentTypes: ['project'],
    
    /**
     * @property
     * @private
     */
    childLevelSorters: [{
        property: 'Name',
        direction: 'ASC'
    }],
        
    getParentFieldNamesByChildType: function(childType, parentType) {
        return ['Parent'];
    },

    _getChildNodeFilters: function(node) {
        var parentType = node.self.typePath,
            childTypes = this._getChildTypePaths([parentType]),
            parentFieldNames = this._getParentFieldNames(childTypes, parentType);

        var filter = [];
        if (parentFieldNames.length) {
            filter =  [
                Rally.data.wsapi.Filter.or(_.map(parentFieldNames, function(parentFieldName) {
                    return {
                        property: parentFieldName,
                        operator: '=',
                        value: node.get('_ref')
                    };
                }))
            ];
        }

        return filter;
    },

    filter: function(filters) {
        console.log('--');
        this.fireEvent('beforefilter', this);
        //We need to clear the filters to remove the Parent filter
        this.filters.clear();
        this.filters.addAll(filters);
        this._resetCurrentPage();
        this.load();
    },
    
    load: function(options) {
        this.recordLoadBegin({description: 'tree store load', component: this.requester});

        this._hasErrors = false;

        this.on('beforeload', function(store, operation) {
            delete operation.id;
        }, this, { single: true });

        options = this._configureLoad(options);
        options.originalCallback = options.callback;
        var deferred = Ext.create('Deft.Deferred'),
            me = this;

        options.callback = function (records, operation, success) {
            me.dataLoaded = true;

            if (me._pageIsEmpty(operation)) {
                me._reloadEmptyPage(options).then({
                    success: function (records) {
                        // this gives a maximum callstack exceeded error.  don't know why
                        //me._resolveLoadingRecords(deferred, records, options, operation, success);
                    },
                    failure: function() {
                        me._rejectLoadingRecord(deferred, options, operation);
                    }
                });
            } else {
                //me._resolveLoadingRecords(deferred, records, options, operation, success);
            }
        };

        if (this._isViewReady()) {
            this._beforeInitialLoad(options);
        }

        this.callParent([options]);

        return deferred.promise;
    },

    clearFilter: function(suppressEvent) {
        this._resetCurrentPage();
        this.filters.clear();
        //We need to add the parent filter back in
        this.filters.addAll(Ext.create('Rally.data.wsapi.Filter',{
            property: 'Parent',
            value: ''
        }));

        if (!suppressEvent) {
            this.load();
        }
    }
});

Ext.define('Rally.data.wsapi.ProjectTreeStoreBuilder', {
    extend: 'Rally.data.wsapi.TreeStoreBuilder',

    build: function(config) {
        config = _.clone(config || {});
        config.storeType = 'Rally.data.wsapi.ProjectTreeStore';

        return this.loadModels(config).then({
            success: function(models) {
                models = _.values(models);
                return this._buildStoreWithModels(models, config);
            },
            scope: this
        });
    },

    _useCompositeArtifacts: function (models, config) {
        return false;
    }
});