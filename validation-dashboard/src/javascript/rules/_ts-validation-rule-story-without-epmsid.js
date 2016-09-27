Ext.define('CA.techservices.validation.StoryWithoutEPMSID',{
    extend: 'CA.techservices.validation.BaseRule',
    alias: 'widget.tsstorywithoutepmsid',
    config: {
        portfolioItemTypes:[],
        model: 'HierarchicalRequirement',
        label: 'Missing EPMS ID (Story)'
    },
    constructor: function(config) {
        Ext.apply(this,config);
    },

    _filters: Rally.data.wsapi.Filter.and([
        {property:'Feature.Parent.c_EPMSid',operator:'=',value:''},
        {property:'DirectChildrenCount',value: 0}
    ]),
    
    getDescription: function() {
        return Ext.String.format("<strong>{0}</strong>: {1}",
            this.label,
            "Stories that don't trace to a EPMS Project with an EPMS ID.  This can be because the EPMS Project doesn't have" +
            " an ID, because the Feature isn't related to an EPMS Project, or because there's no Feature for the story."
        );
    },
    
    getFetchFields: function() {
        return [/[^\/]*$/.exec(this.portfolioItemTypes[0]),'Parent','c_EPMSid'];
    },
    
    getFilters: function() {
        return this._filters;
    },
    
    /* model MUST be a wsapi model, not its name */
    isValidField: function(model, field_name) {
        var field_defn = model.getField(field_name);
        return ( !Ext.isEmpty(field_defn) );
    },
    
    /* override to allow the validator to check if the rule makes sense to run 
     * (e.g., the field checker for fields that don't even exist)
     * 
     * resolve promise with text if problem -- the validator will return the text so
     * it can be put into a description
     * 
     * The rule will still be executed unless this.shouldExecuteRule is set to false (and
     * the rule class implements skipping because of this.shouldExecuteRule).
     * 
     * A rule class could be multi-part and only partially fail, so execution or not execution
     * needs to be handled by the class itself.
     * 
     */
    precheckRule: function() {
        var deferred = Ext.create('Deft.Deferred'),
            me = this;
        
        Rally.data.ModelFactory.getModel({
            type: 'PortfolioItem',
            success: function(model) {
                var text = null;
                if ( !me.isValidField(model,'c_EPMSid') ) {
                    text = "EPMS ID check will not be run.  PortfolioItem records do not have a c_EPMSid field ";
                    me.shouldExecuteRule = false;
                    me._filters = Rally.data.wsapi.Filter.and([{property:'ObjectID',value:0}])
                }
                
                deferred.resolve(text);
            },
            failure: function() {
                deferred.reject("Issue prechecking Rule");
            }
        });
        
        return deferred.promise;
    },
    // return false if the record doesn't match
    // return string if record fails the rule
    applyRuleToRecord: function(record) {
        if ( ! this.shouldExecuteRule ) { return false; }
        
        if ( Ext.isEmpty(record.get(/[^\/]*$/.exec(this.portfolioItemTypes[0])) )) {
            return 'Has no EPMS ID (' + /[^\/]*$/.exec(this.portfolioItemTypes[0]) + ')';
        }
        
        if ( Ext.isEmpty(record.get(/[^\/]*$/.exec(this.portfolioItemTypes[0])).Parent )) {
            return 'Has no EPMS ID (no ' + /[^\/]*$/.exec(this.portfolioItemTypes[1]) + ')';
        }
        
        if ( Ext.isEmpty(record.get(/[^\/]*$/.exec(this.portfolioItemTypes[0])).Parent.c_EPMSid) ) {
            return 'Has no EPMS ID';
        }
        return false;
    },
    
    getUserFriendlyRuleLabel: function() {        
        return this.label;
    }
});