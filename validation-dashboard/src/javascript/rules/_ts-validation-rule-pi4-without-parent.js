Ext.define('CA.techservices.validation.Pi4WithoutParentRule',{
    extend: 'CA.techservices.validation.BaseRule',
    alias:  'widget.tspi4withoutparentrule',
   
    config: {
        /*
        * [{Rally.wsapi.data.Model}] portfolioItemTypes the list of PIs available
        * we're going to use the first level ones (different workspaces name their portfolio item levels differently)
        */

        // discovered in app.js, passed on crea
        portfolioItemTypes:[],
        //model: 'PortfolioItem/Feature - types loaded in base class.',
        model: null,
        label: 'Objective No Parent'

    },
    constructor: function(config) {
        Ext.apply(this,config);
        this.model = this.portfolioItemTypes[4];
        this.label = this.getLabel();
    },
    getDescription: function() {
        console.log("ObjectiveNoParent.getDescription:",this);
        
        var msg = Ext.String.format(
            "{0} must have a parent *{1}*.",
            /[^\/]*$/.exec(this.model),
            /[^\/]*$/.exec(this.portfolioItemTypes[5])
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
            /[^\/]*$/.exec(this.portfolioItemTypes[5])
        );
        return this.label;
    },

    isValidField: function(model, field_name) {
        var field_defn = model.getField(field_name);
        return ( !Ext.isEmpty(field_defn) );
    },
    
    applyRuleToRecord: function(record) {
        console.log("Pi4NoParent.applyRuleToRecord:",record);        
        
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