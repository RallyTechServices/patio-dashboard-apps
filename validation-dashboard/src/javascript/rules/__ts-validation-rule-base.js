Ext.define('CA.techservices.validation.BaseRule',{
    extend: 'Ext.Base',
    /**
     * 
     * @cfg
     * {String} model The name of a record type that this rule applies to 
     */
    model: null,
    /**
     * 
     * @cfg {String} a human-readable label for the chart that will be made from the rule
     */
    label: 'No label supplied for this rule',
    
    constructor: function(config) {
        Ext.apply(this,config);
    },
    
    getFetchFields: function() {
        return [];
    },
    
    getModel: function() {
        return this.model;
    },
    
    getFilters: function() {
        console.error('getFilters not implemented in subclass ', this.self.getName());
        throw 'getFilters not implemented in subclass ' + this.self.getName();
    },
    // return false if the record doesn't match
    // return string if record fails the rule
    applyRuleToRecord: function(record) {
        console.error('applyRuleToRecord not implemented in subclass ', this.self.getName());
        throw 'applyRuleToRecord not implemented in subclass ' + this.self.getName();
        
        return record;
    },
    
    getUserFriendlyRuleLabel: function() {        
        return this.label;
    }
});