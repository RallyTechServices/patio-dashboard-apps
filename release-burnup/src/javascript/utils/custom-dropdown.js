Ext.define('Rally.technicalservices.CustomStoreDropdown',{
    extend: 'Rally.ui.combobox.ComboBox',
    alias: 'widget.tscustomcombobox',

    constructor: function(config) {
        if (!config.valueField){
            config.valueField = 'value';
        }
        if (!config.displayField){
            config.displayField = config.valueField;
        }

        var storeData = config.allowedValues || [];
        if (storeData.length > 0 && Ext.isString(storeData[0])){
            storeData = _.map(storeData, function(item){
                var obj = {};
                obj[config.valueField] = item;
                return obj;
            });
        }
        console.log ('cfg',config, storeData);
        config.store = Ext.create('Ext.data.Store', {
            fields: [config.valueField],
            data: storeData
        });
        console.log ('cfg',config);
        return this.callParent([config]);
    }
});
