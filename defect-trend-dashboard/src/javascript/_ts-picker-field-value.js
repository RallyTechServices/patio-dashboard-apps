
/**
 * A picker which allows selecting multiple field values.
 *
 *      @example
 *      Ext.create('Ext.Container', {
 *          items: [{
 *              xtype: 'tsmultifieldvaluepicker',
 *              model: 'defect',
 *              field: 'State'
 *          }],
 *          renderTo: Ext.getBody().dom
 *      });
 */
Ext.define('CA.techservices.picker.FieldValuePicker', {
    extend: 'Ext.form.field.Picker',
    alias: 'widget.tsmultifieldvaluepicker',
    
    inheritableStatics: {
        defaultRowTextCls: 'rui-picker-option-text'
    },

    componentCls: 'rui-multiobject-picker',

    config: {
        /**
         * @cfg {Boolean}
         * Whether to expand on load
         */
        autoExpand: false,

        /**
         * @cfg {Boolean}
         * Whether to always be expanded
         */
        alwaysExpanded: false,

        /**
         * @cfg {String}
         * Text shown during store load
         */
        loadingText: 'Loading...',

        /**
         * @cfg {String}
         * The key of a value in a selected record. That value is used when saving the record's selected state.
         */
        selectionKey: 'StringValue',

        /**
         * 
         * @cfg {String} (Required)
         * The name of a model that a field belongs to.
         */
        model: 'UserStory',
        
        /**
         * 
         * @cfg {String} (Required)
         * The name of a field on the model 
         */
        field: null,
        
        /**
         * @cfg {String}
         * The key of the value in a record.
         */
        recordKey: 'StringValue',

        /**
         * @cfg {Object}
         * The DataStore configuration
         */
        storeConfig: {
            autoLoad: false,
            fetch: ["StringValue"],
            pageSize: 200,
            remoteGroup: false,
            remoteSort: false,
            remoteFilter: false,
            limit: Infinity,
            sorters: [
                {
                    property: 'Name',
                    direction: 'ASC'
                }
            ]
        },

        /**
         * @cfg {Object}
         * An object that will be passed to store.load()
         */
        storeLoadOptions: undefined,

        /**
         * @cfg {String}
         * The picker type
         */
        pickerType: 'Ext.container.Container',

        /**
         * @cfg {Object}
         * The picker configuration
         */
        pickerCfg: {
            floating: true,
            hidden: true,
            focusOnToFront: false,
            shadow: false,
            layout: {
                type: 'vbox',
                align: 'stretch',
                shrinkToFit: true
            },
            cls: 'multiobject-picker'
        },

        /**
         * @cfg {String}
         * The list type
         */
        listType: 'Ext.view.BoundList',

        /**
         * @cfg {Object}
         * The list configuration
         */
        listCfg: {
            selModel: {
                mode: 'SIMPLE'
            },
            displayField: "Name",
            pageSize: 0,
            autoScroll: true,
            cls: 'rui-multi-object-list'
        },

        /**
         * @cfg {Boolean}
         * Whether rows are selectable
         */
        rowSelectable: false,

        /**
         * @cfg {String}
         * The cls to apply to the row checkbox
         */
        rowCheckboxCls: 'rui-picker-checkbox',

        /**
         * @cfg {String}
         * The place to render validation errors
         */
        msgTarget: 'side',

        /**
         * @cfg {String}
         * The cls to apply to each row
         */
        rowCls: 'rui-multi-object-picker',

        /**
         * @cfg {String}
         * The cls to apply to disabled rows
         */
        disabledRowCls: 'rui-multi-object-picker-disabled',

        /**
         * @cfg {Boolean}
         * Whether to maintain scroll position
         */
        maintainScrollPosition: false,

        /**
         * @cfg {String[]}
         * Values that will always show selected in the bound list
         */
        alwaysSelectedValues: [],
        
        /**
         * @cfg {String}
         * Text to use for the '-- No Entry --' option.
         */
        noEntryText: '-- No Entry --',

        /**
         * @cfg {String}
         * The text shown in the text field prior to typing.
         */
        emptyText: 'Begin typing...',

        /**
         * @cfg {String}
         * The text shown when no matching items are found.
         */
        notFoundText: '<div class="rui-multi-object-picker-empty-text">No matching item</div>',

        /**
         * @cfg {String}
         * The name of the attribute that will contain the matched text.
         */
        matchFieldName: 'StringValue',

        /**
         * @cfg {String}
         * The name of the attribute that will be filtered.
         */
        filterFieldName: 'Name',

        /**
         * @cfg {Boolean}
         * Enables Grouping of 'Selected' and 'Available'
         */
        enableGrouping: true,

        /**
         * @cfg {Boolean}
         * Enables remote filtering. Defaults to client-side filtering.
         */
        remoteFilter: false,

        /**
         * @cfg {Boolean}
         * Shows or hides the close 'x' in the top right corner
         */
        showCloseButton: false,

        /**
         * @cfg {Boolean}
         * Shows or hides the search icon in the input field
         */
        showSearchIcon: false

    },

    constructor: function (config) {
        this.mergeConfig(config);
        this.plugins = this.plugins || [];
        if (this.remoteFilter) {
            this.plugins.push({ptype: 'rallyremotefiltering'});
        } else {
            this.plugins.push({ptype: 'rallyclientfiltering'});
        }
        if (this.enableGrouping) {
            this.plugins.push(this._getSelectedGroupableConfig());
        }

        this.selectedValues = Ext.create('Ext.util.MixedCollection');
        if (this.alwaysExpanded && !Ext.isDefined(this.config.hideTrigger)) {
            this.hideTrigger = true;
        }

        this.callParent([this.config]);
    },

    initComponent: function() {
        this.addEvents(
            /**
             * @event afteralignpicker
             * Fires after the picker has been aligned, which is the last thing done when displaying/refreshing the picker.
             */
            'afteralignpicker',

            /**
             * @event select
             * Fires when a value is selected in the picker
             * @param {Rally.ui.picker.MultiObjectPicker} picker This picker
             * @param {Object} value The newly selected value
             * @param {Object[]} values The currently selected values
             * @param {Ext.EventObject} event The event that initiated this action
             */
            'select',

            /**
             * @event deselect
             * Fires when a value is deselected in the picker
             * @param {Rally.ui.picker.MultiObjectPicker} picker This picker
             * @param {Object} value The newly deselected value
             * @param {Object[]} values The currently selected values
             * @param {Ext.EventObject} event The event that initiated this action
             */
            'deselect',

            /**
             * @event selectionchange
             * Fires when the selected values change
             * @param {Rally.ui.picker.MultiObjectPicker} picker This picker
             * @param {Object[]} values The currently selected values
             */
            'selectionchange',

            /**
             * @event datachanged
             * Fires when the picker's data changes.
             */
            'datachanged'

        );

        this.callParent(arguments);
    },

    initEvents: function () {
        this.callParent(arguments);
        this.on('afterrender', this._onAfterRender, this, {single: true});
        this.on('afteralignpicker', this._selectCheckboxes, this);
        this.on('expand', this._onInitialExpand, this, {single: true});
        this._initInputEvents();
        this._autoExpand();
    },

    /**
     * [setValue sets the values in the picker]
     * @param {Ext.data.Model[]/String} values
     */
    setValue: function (values) {
        var items = Ext.isString(values) ? values.split(',') : Ext.Array.from(values);

        items = Ext.Array.merge(items, this.alwaysSelectedValues);

        if (!Ext.isEmpty(items) && this.store && this.store.isLoading()) {
            this.store.on('load', function() {
                this._selectValues(items);
            }, this, {single: true});
        }
        else {
            this._selectValues(items);
        }
    },

    _selectValues: function (items) {
        var oldValue = this.selectedValues.getRange();
        this.selectedValues.clear();

        _.each(items, function (item) {
            var value = item && item.isModel ? item.get(this.selectionKey) : item;
            var record = this.findInStore(value);

            if (record) {
                this.selectedValues.add(this._getKey(record), record);
            } else if (item.isModel) {
                this.selectedValues.add(value, item);
            }
        }, this);

        if (this.isExpanded) {
            this._onListRefresh();
            this._groupSelectedRecords();
        }

        this.fireEvent('change', this, this.selectedValues.getRange(), oldValue);
    },

    getValue: function () {
        return this._getRecordValue();
    },

    getSubmitData: function () {
        var ret = {};
        ret[this.name] = this.getSubmitValue();
        return ret;
    },

    getSubmitValue: function(){
        var submitValue = [];
        this.selectedValues.eachKey(function (key, value) {
            if (value.get(this.selectionKey)) {
                submitValue.push(value.get(this.selectionKey));
            }
        }, this);
        return submitValue;
    },

    /**
     * @private
     */
    createPicker: function () {
        this.picker = Ext.create(this.pickerType, this.pickerCfg);
        this.picker.add(this._createList());
        if (this.alwaysExpanded) {
            this.picker.on('beforehide', this._onBeforeHide);
        }
        return this.picker;
    },

    _onBeforeHide: function() {
        return false;
    },

    /**
     * @private
     */
    setAlwaysExpanded: function(alwaysExpanded) {
        if (alwaysExpanded) {
            this.alwaysExpanded = true;
            this.picker.on('beforehide', this._onBeforeHide);
        } else {
            this.alwaysExpanded = false;
            this.picker.removeListener('beforehide', this._onBeforeHide);
        }
    },

    /**
     * @private
     */
    alignPicker: function () {
        var heightAbove = this.getPosition()[1] - Ext.getBody().getScroll().top,
            heightBelow = Ext.Element.getViewHeight() - heightAbove - this.getHeight(),
            space = Math.max(heightAbove, heightBelow) - 5;

        this._alignPickerAndList();

        if (this.pickerCfg.height) {
            this.picker.setHeight(this.pickerCfg.height);
            this.list.setHeight(this.pickerCfg.height);
        } else if (this._getListHeight() > space) {
            this.list.setHeight(space);
            this.picker.setHeight(space);
        } else if (this._getListHeight() < space) {
            //this clears out the height so that it shrinks to fit
            this.list.setHeight(null);
            this.picker.setHeight(null);
        }

        // DE17524: Without Ext.defer, alignPicker always uses out-of-date this.inputEl coordinates in IE*
        if (Ext.isIE && !this.hasDeferedAlign){
            this.hasDeferedAlign = true;
            Ext.defer(function() {
                if (this.picker.isVisible()) {
                    this.alignPicker();
                }
                delete this.hasDeferedAlign;
            }, 1, this);
        }

        this.fireEvent('afteralignpicker');
    },

    _getListHeight: function() {
        return this.list.listEl.child('ul').getHeight();
    },

    /**
     * @override
     * Wrapping doAlign because Ext 4.2 calls fixDisplay which blindly sets visibility to hidden.
     * We don't want that to happen.
     */
    doAlign: function() {
        var visibility = this.picker.el.getStyle('visibility');

        this.callParent(arguments);

        // Ext 4.2 calls fixDisplay for some reason, this sets it back to what it was
        this.picker.el.setStyle({visibility: visibility});
    },

    _alignPickerAndList: function () {
        if (this.isExpanded) {
            if (this.matchFieldWidth) {
                var labelWidth = 0;
                if (!!this.fieldLabel && this.labelAlign !== 'top') {
                    labelWidth = this.labelWidth + 5;
                }
                this.list.setSize(this.getWidth() - labelWidth, null);
                this.picker.setSize(this.getWidth() - labelWidth, this._getPickerHeight());
            }

            if (this.picker.isFloating()) {
                this.doAlign();
            }
        }
    },

    expand: function () {
        if (this.store) {
            this.callParent(arguments);
        } else {
            this._createStoreAndExpand();
        }
    },

    /**
     * @private
     * Overridden to NOT collapse on mouse scroll event outside of picker
     */
    collapseIf: function () {
        // don't ever collapse
    },

    collapse: function () {
        if (!this.alwaysExpanded) {
            this.callParent(arguments);
        }
    },

    /**
     * @private
     * Overridden to NOT collapse during list refresh when the user clicks too quickly within the bound list
     */
    validateBlur: function (e) {
        var el = Ext.get(e.target);
        if (!this.isDestroyed) {
            return !(el.hasCls(this.rowCls) || el.hasCls(this.self.defaultRowTextCls) || el.hasCls(this.rowCheckboxCls));
        }
        return false;
    },

    /**
     * Refreshes records displayed in picker.
     *
     * @returns {Deft.Promise}
     */
    refresh: function() {
        return this._refreshStore().then({
            success: this.refreshView,
            scope: this
        });
    },

    /**
     * Refreshes the view without loading the store.
     */
    refreshView: function () {
        this._initFiltering();
        this._groupRecords(this._getRecordValue());

        if (this.originalValue) {
            this.setValue(this.originalValue);
        }

        if (this.list) {
            this.list.refresh();
        }
    },

    isRecordAlwaysSelected: function(record) {
        return _.contains(this.alwaysSelectedValues, record.get(this.selectionKey));
    },

    _initFiltering: function() {
        this._setMatchedFieldValues();
    },

    _setMatchedFieldValues: function () {
        //  Note to future self... if you find yourself having to add another chunk of logic here, maybe you
        //  should allow a function to be passed in instead. We almost went that route, but decided against
        //  until the need arises.
        this.store.each(function(record) {
            record.set(this.matchFieldName, record.get(this.filterFieldName));
        }, this);
    },

    /**
     * Adds a record to the selection,
     *
     * @param record {Ext.data.Model}
     */
    select: function(record) {
        //here var key = record.get(this.selectionKey);
        var key = this._getKey(record);
        this.selectedValues.add(key, record);
        this._syncSelection();
    },

    /**
     * Updates the input el text to match the currently selected value.
     */
    syncSelectionText: function() {
        var text = _.map(this.selectedValues.getRange(), function(record) {
            return record.get(this.filterFieldName);
        }, this).join(', ');

        if (Ext.isEmpty(text)) {
            this.focusPlaceholderText();
        } else {
            this.setValueText(text);
        }
    },

    resetFilters: function (suppressEvent) {
        this.store.clearFilter(suppressEvent);
        this.store.filter(this.getBaseFilter());
    },

    getBaseFilter: Ext.emptyFn,

    onEditorEnter: function () {
        this.resetFilters(true);
    },

    onRender: function () {
        this.callParent(arguments);
        if (!this.hideTrigger) {
            this.inputEl.addCls('rui-multi-object-picker-no-trigger');
        }
        if(this.showSearchIcon) {
            var searchIconNode = this.inputEl.insertHtml('afterEnd','<div class="icon-search rally-search-button"></div>');
            Ext.get(searchIconNode).on('click', function() {
                // We want clicking on the search icon to open the picker.  Focusing on this does all
                // the needed wiring and expanding.
                this.focus();
            }, this);
        }
    },

    /**
     * Adds a new record to the picker
     *
     * @param record
     * @return Deft.Promise
     */
    addRecord: function(record) {
        var deferred = Ext.create('Deft.Deferred');
        this.mon(this.list, 'refresh', function() {
            deferred.resolve(record);
        }, this, {single: true});

        this.store.loadData([record], true);

        return deferred.promise;
    },

    _initInputEvents: function() {
        if (!this.rendered) {
            this.on('afterrender', this._initInputEvents, this, {single: true});
            return;
        }

        this.mon(this.inputEl, 'keydown', this._onInputKeyDown, this);
        this.mon(this.inputEl, 'keyup', this.validate, this);
        this.mon(this.inputEl, 'keyup', this._onInputKeyUp, this);
    },

    _onAfterRender: function() {
        this.getInputEl().addCls('rui-multi-object-input');
        this.getEl().on('click', this.expand, this);
    },

    _onInputKeyUp: function(event) {
        this._setAppropriateEmptyText();

        //allow shift but disregard other modifiers
        if (event.shiftKey || !Rally.util.Event.isModifierKey(event)) {
            this.fireEvent('inputtextchanged', this.getInputTextValue());
        }
    },

    _onInputKeyDown: function(event, inputField) {
        //isSpecialKey() doesn't include Mac's command key, but ctrlKey does. Ignore all of those.
        if (!event.isSpecialKey() && !event.ctrlKey && !this.isExpanded){
            this.expand();
        }
    },

    _setAppropriateEmptyText: function() {
        var list = this.getList(),
            listCfg = this.listCfg;

        if (list && listCfg && listCfg.emptyText) {
            if (Ext.isEmpty(this.getInputTextValue())) {
                list.emptyText = listCfg.emptyText;
            } else {
                list.emptyText = this.notFoundText;
            }
        }
    },

    _autoExpand: function() {
        if (!this.rendered) {
            this.on('afterrender', this._autoExpand, this, {single: true});
            return;
        }

        if (this.alwaysExpanded || this.autoExpand) {
            this.expand();
        }
    },

    _onInitialExpand: function(field) {
        if (field.inputEl) {
            field.mon(field.inputEl, 'click', function() {
                var picker = field.getPicker();
                if (picker) {
                    // required to set correct zIndex when picker is inside a popover.
                    picker.zIndexManager.bringToFront(picker);
                }
            });
        }

        this.list.getEl().on('click', this.triggerBlur, this, {
            delegate: '.rui-multi-object-picker-close-button'
        });

        this.list.on('refresh', function () {
            var closeButton = this.list.listEl.down('.rui-multi-object-picker-close-button');
            if (closeButton) {
                var scrollBarVisible = this.list.listEl.dom.scrollHeight > this.list.listEl.dom.clientHeight;
                closeButton.setStyle('padding-right', (scrollBarVisible ? Ext.getScrollbarSize().width : 0) + 'px');
            }
        }, this);
    },

    createStore: function () {
        var me = this,
            deferred = Ext.create('Deft.Deferred');
        
        Rally.data.ModelFactory.getModel({
            type: me.model,
            success: function(model) {
                me.store = model.getField(me.field).getAllowedValueStore(Ext.merge({requester: this}, me.storeConfig));
                
                me.relayEvents(me.store, ['datachanged']);
                deferred.resolve();
//                model.getField(me.field).getAllowedValueStore().load({
//                    callback: function(records, operation, success) {
//                        Ext.Array.each(records, function(allowedValue) {
//                            //each record is an instance of the AllowedAttributeValue model 
//                            console.log(allowedValue.get('StringValue'));
//                        });
//                    }
//                });
            },
            failure: function() {
                deferred.reject("Problem getting model allowed value store");
            }
            
        });

        return deferred.promise;
    },
    
    _createStoreAndExpand: function () {
        this.createStore().then({
            success: this.expand,
            scope: this
        });
    },
    /**
     * Retrieve the selected items as an array of records
     */
    _getRecordValue: function () {
        var recordArray = [];
        this.selectedValues.eachKey(function (key, value) {
            var record = this.findInStore(value.get(this.selectionKey));
            if (record) {
                recordArray.push(record);
            } else {
                recordArray.push(value);
            }
        }, this);
        return recordArray;
    },

    /**
     * Create the BoundList based on #listCfg and setup listeners to some of its events.
     */
    _createList: function () {
        var listCfg = Ext.apply({
            store: this.store,
            tpl: this._getListTpl()
        }, this.listCfg);

        this.list = Ext.create(this.listType, listCfg);

        this.mon(this.list, {
            refresh: this._onListRefresh,
            itemclick: this._onListItemClick,
            scope: this
        });

        return this.list;
    },

    _onStoreLoaded: function(){
        if (this.allowNoEntry) {
            var noEntryExists = this.store.count() > 0 && this.store.findRecord(this.listCfg.displayField, this.noEntryText);

            if (!noEntryExists) {
                var record = Ext.create(this.store.model);
                record.set(this.listCfg.displayField, this.noEntryText);
                record.set(this.selectionKey, null);
                record.set(this.recordKey, 0);
                this.store.insert(0, record);
            }
        }

        this.resetFilters();
    },

    /**
     * Select the checkboxes for the selected records
     */
    _selectCheckboxes: function () {
        if (this.list && this.list.getSelectionModel()) {
            Ext.each(this.list.getSelectionModel().getSelection(), function (record) {
                this._selectRowCheckbox(record.get(this.recordKey));
            }, this);
        }
    },

    _refreshStore: function() {
        var loadPromise;

        if (this.store) {
            this.resetFilters();
            this.store.clearGrouping();
            this.store.requester = this;

            if (this.store.getCount() < 1) {
                loadPromise = this.store.load(this.storeLoadOptions);
            } else {
                loadPromise = Deft.Promise.when(this.store.data);
            }
        } else {
            loadPromise = this.createStore().then({
                success: function() {
                    return this.store.load(this.storeLoadOptions);
                },
                scope: this
            });
        }

        return loadPromise.then({
            success: this._onStoreLoaded,
            scope: this
        });
    },

    /**
     * Determine the height of the picker panel by adding up the heights of all its children items.
     */
    _getPickerHeight: function () {
        var totalHeight = 0;
        Ext.each(this.picker.items.getRange(), function (item) {
            if (item.isVisible()) {
                totalHeight += item.getHeight();
            }
        });
        return totalHeight;
    },

    /**
     * Ensure that the selected rows in the list match the internal array of selected values
     */
    _syncSelection: function () {
        if (this.list) {
            var selectionModel = this.list.getSelectionModel();
            selectionModel.deselectAll(true);
            var selectedInList = Ext.Array.filter(this._getRecordValue(), this._isRecordInList, this);

            this._doWithMaintainedScrollPosition(function() {
                selectionModel.select(selectedInList, false, true); // records, [keepExisting], [suppressEvent]
            });
        }
    },

    /**
     * @param recordId the value of the record's ID, which corresponds to the row
     */
    _getOptionCheckbox: function (recordId) {
        var checkboxSelector = 'li.' + this.id + '.' + this._getOptionClass(recordId) + ' .rui-picker-checkbox';
        return Ext.get(Ext.DomQuery.selectNode(checkboxSelector));
    },

    /**
     * @param recordId the value of the record's ID, which corresponds to the row
     */
    _getOptionClass: function (recordId) {
        return 'rui-multi-object-picker-option-id-' + recordId.toString();
    },

    _selectRowCheckbox: function (recordId) {
        var checkbox = this._getOptionCheckbox(recordId);
        if (checkbox) {
            checkbox.addCls('rui-picker-cb-checked');
        }
    },

    _deselectRowCheckbox: function (recordId) {
        this._getOptionCheckbox(recordId) && this._getOptionCheckbox(recordId).removeCls('rui-picker-cb-checked');
    },

    _isRecordInList: function (record) {
        return this.list.getNode(record) ? true : false;
    },

    /**
     * @private
     * @return {Ext.XTemplate} the XTemplate for the list.
     */
    _getListTpl: function () {
        var me = this;
        return Ext.create('Ext.XTemplate',
            '<tpl if="this.showCloseButton">',
                '<div class="rui-multi-object-picker-close-button icon-cancel"></div>',
            '</tpl>',
            '<tpl exec="this.headerRendered = false"></tpl>',
            '<ul>',
                '<tpl for=".">',
                    '<tpl if="(!this.headerRendered) || (this.groupSelected !== values.groupSelected)">',
                        '<tpl exec="this.groupSelected = values.groupSelected"></tpl>',
                        '<tpl exec="this.headerRendered = true"></tpl>',
                        '<div class="rally-group-header multi-object-picker-header">',
                            '{groupSelected}',
                        '</div>',
                    '</tpl>',
                    '<li class="' + Ext.baseCSSPrefix + 'boundlist-item ' + this.rowCls + ' {[this._getDisableClass(values)]} ' + this.id + ' rui-multi-object-picker-option-id-{' + this.recordKey + '}">',
                        '<div class="' + this.rowCheckboxCls + '" ></div>',
                        '<div class="{[this._getRowTextCls(values)]}">',
                            '{[this._getMatchedText(values)]} {[this._getRightListHtml(values)]}',
                        '</div>',
                    '</li>',
                '</tpl>',
            '</ul>',
            {
                showCloseButton: this.showCloseButton,
                _getDisableClass: function (recordData) {
                    if (Ext.Array.contains(me.alwaysSelectedValues, recordData[me.selectionKey]) || !me.editable) {
                        return me.disabledRowCls;
                    }

                    return '';
                },
                _getRightListHtml: function (recordData) {
                    return me.getRightListHtml(recordData);
                },
                _getMatchedText: function(recordData) {
                    return me.getMatchedTextHtml(recordData);
                },
                _getRowTextCls: function(recordData){
                    return me.getRowTextCls(recordData);
                }
            }
        );
    },

    onListItemSelect: function (record, event, itemEl) {
        this.select(record);
        this._selectRowCheckbox(record.get(this.recordKey));
        this._groupRecordsAndScroll(this._getRecordValue());
        this.fireEvent('select', this, record, this.getValue(), event);
        this._fireSelectionChange();
    },

    onListItemDeselect: function (record, event, itemEl) {        
        var key = this._getKey(record);
        this.selectedValues.remove(this.selectedValues.get(key));
        this._syncSelection();
        this._deselectRowCheckbox(record.get(this.recordKey));
        this._groupRecordsAndScroll(this._getRecordValue());
        this.fireEvent('deselect', this, record, this.getValue(), event);
        this._fireSelectionChange();
    },

    getMatchedTextHtml: function(recordData) {
        var value = recordData[this.matchFieldName];
        if ( Ext.isEmpty(value) ) {
            value = this.noEntryText;
        }
        return value;
    },

    getRightListHtml: function () {
        return '';
    },

    getRowTextCls: function(recordData){
        return this.self.defaultRowTextCls;
    },

    _getKey: function (record) {
        return record.get(this.selectionKey) || this.noEntryText;
    },

    _fireSelectionChange: function () {
        this.fireEvent('selectionchange', this, this.getValue());
        this.focus();
    },

    /**
     * Listener to list's itemclick event
     * @private
     */
    _onListItemClick: function (view, record, itemEl, index, event) {
        if (this.isRecordAlwaysSelected(record) || !this.editable) {
            return false;
        }

        var selModel = this.list.getSelectionModel();
        if (selModel.isSelected(record)) {
            this.onListItemDeselect(record, event, itemEl);
        } else {
            this.onListItemSelect(record, event, itemEl);
        }
        return false;
    },

    _onListRefresh: function () {
        this._syncSelection();
        this.alignPicker();
    },

    //TODO: Move this into SelectedGroupable
    _groupRecordsAndScroll: function (selectedRecords) {
        var scroll = 0;
        if (this.maintainScrollPosition) {
            scroll = this.list.listEl.getScroll();
        }

        this._groupRecords(selectedRecords);

        if (this.maintainScrollPosition) {
            Ext.Object.each(scroll, function (key) {
                this.list.listEl.scrollTo(key, scroll[key]);
            }, this);
        }
    },

    _doWithMaintainedScrollPosition: function(callback) {
        var scroll = 0;
        if (this.maintainScrollPosition) {
            scroll = this.list.listEl.getScroll();
        }

        callback.call(this);

        if(this.maintainScrollPosition) {
            Ext.Object.each(scroll, function (key) {
                this.list.listEl.scrollTo(key, scroll[key]);
            }, this);
        }
    },

    _getSelectedGroupableConfig: function () {
        var config = {ptype: 'rallypickerselectedgroupable'};

        if (this.selectedTextLabel) {
            config.selectedTextLabel = this.selectedTextLabel;
        }

        if (this.availableTextLabel) {
            config.availableTextLabel = this.availableTextLabel;
        }

        return  config;
    },

    getInputTextValue: function() {
        return this.getInputEl().dom.value;
    },

    focusPlaceholderText: function() {
        if (this.emptyText) {
            // focus and move the cursor to index 0
            var selectionRange = [0, 0];
            this.focus(selectionRange);
        }
    },

    setValueText: function(text) {
        var inputEl = this.getInputEl();
        if (inputEl) {
            inputEl.dom.value = text;
        }
    },

    getInputEl: function() {
        return this.inputEl;
    },

    getList: function() {
        return this.list;
    },

    containsExactMatch: function() {
        var store = this.store,
            inputField = this.filterFieldName,
            inputText = this.getInputTextValue();

        return store.findBy(function(record) {
            return record.get(inputField) === inputText;
        }) > -1;
    },

    onEnable: function() {
        this.callParent(arguments);

        if(this.alwaysExpanded){
            this.getPicker().enable();
        }
    },

    onDisable: function() {
        this.callParent(arguments);

        if(this.alwaysExpanded){
            this.getPicker().disable();
        }
    },

    findInStore: function(value) {
        return this.store ? this.store.findRecord(this.selectionKey, new RegExp('^' + value + '$')) : null;
    },

    //TODO: Eliminate the need for this template method. Currently needs to be here for SelectedGroupable
    _groupRecords: Ext.emptyFn,
    _groupSelectedRecords: Ext.emptyFn
});