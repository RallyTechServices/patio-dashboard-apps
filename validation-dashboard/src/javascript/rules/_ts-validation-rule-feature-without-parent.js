Ext.define('CA.techservices.validation.FeatureWithoutParentRule',{
    extend: 'CA.techservices.validation.BaseRule',
    alias:  'widget.tsfeaturewithoutparentrule',
   
    config: {
        /*
        * [{Rally.wsapi.data.Model}] portfolioItemTypes the list of PIs available
        * we're going to use the first level ones (different workspaces name their portfolio item levels differently)
        */

        // discovered in app.js, passed on crea
        portfolioItemTypes:[],
        //model: 'PortfolioItem/Feature - types loaded in base class.',
        model: null,
        label: 'No Parent (Feature)'

    },
    constructor: function(config) {
        Ext.apply(this,config);
        this.model = this.portfolioItemTypes[0];
        this.label = this.getLabel();
    },
    getDescription: function() {
        console.log("FeatureNoParent.getDescription: ",this);
        
        var msg = Ext.String.format(
            "{0} must be linked to a *{1}*.",
            /[^\/]*$/.exec(this.model),
            /[^\/]*$/.exec(this.portfolioItemTypes[1])
            );
        return msg;
    },
    
    getFetchFields: function() {
        return ['Name','Project','Parent'];
    },

    getLabel: function(){
        this.label = Ext.String.format(
            "No Parent ({0})",
            /[^\/]*$/.exec(this.getModel())
        );
        return this.label;
    },

    isValidField: function(model, field_name) {
        var field_defn = model.getField(field_name);
        return ( !Ext.isEmpty(field_defn) );
    },
    
    applyRuleToRecord: function(record) {
        console.log("FeatureNoParent.applyRuleToRecord:",record);        
        // this rule: Feature has no parent.
        if (record.get('Parent') == null) {
            return this.getDescription();               
        } else {
            return null; // no rule violation
        }
    },
    
    getFilters: function() {        
       // return Rally.data.wsapi.Filter.and([
       //     {property:'Parent',operator:'=',value:null}
       // ]);
       return [];
    }
});