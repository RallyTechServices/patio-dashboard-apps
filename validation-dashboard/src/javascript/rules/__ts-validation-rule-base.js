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
    
    getDescription: function() {
        console.error('getRuleDescription is not implemented in subclass ', this.self.getName());
        return null;
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
    
    /* override to allow the validator to check if the rule makes sense to run 
     * (e.g., the field checker for fields that don't even exist)
     * 
     * resolve promise with text if problem
     * 
     * 
     */
    precheckRule: function() {
        return null;
    },
    
    getUserFriendlyRuleLabel: function() {        
        return this.label;
    }
});