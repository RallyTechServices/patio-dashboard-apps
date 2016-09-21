Ext.define('CA.techservices.validation.ThemeWithoutParentRule',{
    extend: 'CA.techservices.validation.BaseRule',
    alias:  'widget.tsthemewithoutparentrule',
   
    config: {
        /*
        * [{Rally.wsapi.data.Model}] portfolioItemTypes the list of PIs available
        * we're going to use the first level ones (different workspaces name their portfolio item levels differently)
        */
        // Set Name of the Top-Level container where teams *must* put their portfolio items
        rootStrategyProject: null,
        rootDeliveryProject: null,
        // discovered in app.js, passed on crea
        portfolioItemTypes:[],
        //model: 'PortfolioItem/Feature - types loaded in base class.',
        model: null,
        label: 'Epic No Parent'

    },
    constructor: function(config) {
        Ext.apply(this,config);
        this.model = this.portfolioItemTypes[2];
        this.label = this.getLabel();
    },
    getDescription: function() {
        console.log("ThemeNoParent.getDescription:",this);
        
        var msg = Ext.String.format(
            "{0} must have a parent *{1}*.",
            /[^\/]*$/.exec(this.model),
            /[^\/]*$/.exec(this.portfolioItemTypes[3])
            );
        return msg;
    },
    
    getFetchFields: function() {
        return ['Name','Project','Parent'];
    },

    getLabel: function(){
        this.label = Ext.String.format(
            "{0} no parent {1}",
            /[^\/]*$/.exec(this.getModel()),
            /[^\/]*$/.exec(this.portfolioItemTypes[3])
        );
        return this.label;
    },

    isValidField: function(model, field_name) {
        var field_defn = model.getField(field_name);
        return ( !Ext.isEmpty(field_defn) );
    },
    
    applyRuleToRecord: function(record) {
        console.log("ThemeNoParent.applyRuleToRecord:",record);        
        
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