Ext.define('CA.techservices.validation.StoryWithFeatureAndFeatureProjectNotDeliveryRoot',{
    extend: 'CA.techservices.validation.BaseRule',
    alias: 'widget.tsstorywithfeatureandfeatureprojectnotdeliveryroot',
    config: {
        portfolioItemTypes:[],
        model: 'HierarchicalRequirement',
        label: 'Story Feature in Wrong Project(Story)'                
    },
    constructor: function(config) {
        Ext.apply(this,config);
        this.label = this.getLabel();
    },

    getDescription: function() {
        var explanation = Ext.String.format("<strong>{0}</strong>: Stories must be associated with a {1}, and that {1} must be in the Delivery Team project.",
            this.label,
            /[^\/]*$/.exec(this.portfolioItemTypes[0]) 
            );

        console.log('StoryFeatureWrongProject.getDescription: ',explanation);

        return explanation;
    },

    getFetchFields: function() {
        return [this.portfolioItemTypes[0],'Parent','c_EPMSid'];
    },
    
    getFilters: function() {
        var propertyPortfolioItemName = /[^\/]*$/.exec(this.portfolioItemTypes[0]) + '.Parent.c_EPMSid'; // Feature name in this workspace plus the Parent.c_EPMSid
        
        console.log('StoryFeatureWrongProject.getFilters: ',propertyPortfolioItemName );

        // return Rally.data.wsapi.Filter.and([
        //     {property: propertyPortfolioItemName, operator:'=', value:''},
        //     {property:'DirectChildrenCount', value: 0}        
        // ]);
        return [];
    },

    getLabel: function(){
        this.label = Ext.String.format(
            "{0} Wrong Project (Story)",
            /[^\/]*$/.exec(this.portfolioItemTypes[0])
        );
        return this.label;
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
        var me = this;

        // check precheck rule first and exit if fails
        if ( ! this.shouldExecuteRule ) { return false; }
        
        if ( Ext.isEmpty(record.get(this.portfolioItemTypes[0])) ) {
            return 'Has no EPMS ID (' + /[^\/]*$/.exec(this.portfolioItemTypes[0]) + ')';
        }
        
        if ( Ext.isEmpty(record.get(this.portfolioItemTypes[0]).Parent )) {
            return 'Has no EPMS ID (no EPMS Project)';
        }
        
        if ( Ext.isEmpty(record.get(this.portfolioItemTypes[0]).Parent.c_EPMSid) ) {
            return 'Has no EPMS ID';
        }

        
        return false;
    },
    
    getUserFriendlyRuleLabel: function() {        
        return this.label;
    },
    
});