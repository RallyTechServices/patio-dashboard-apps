Ext.define('CA.techservices.validation.ThemeWithoutEpmsIdRule',{
    extend: 'CA.techservices.validation.BaseRule',
    alias:  'widget.tsthemewithoutepmsidrule',
   
    config: {
        /*
        * [{Rally.wsapi.data.Model}] portfolioItemTypes the list of PIs available
        * we're going to use the first level ones (different workspaces name their portfolio item levels differently)
        */

        // discovered in app.js, passed on crea
        portfolioItemTypes:[],

        //model: 'PortfolioItem/Feature - types loaded in base class.',
        model: null,
        label: 'EPMS Project wo EPMS ID'

    },
    constructor: function(config) {
        Ext.apply(this,config);
        this.model = this.portfolioItemTypes[2];
        this.label = this.getLabel();
    },
    getDescription: function() {
        console.log("ThemeNoEpmsId.getDescription:",this);
        
        var msg = Ext.String.format(
            "{0} must have an EPMS ID.",
            /[^\/]*$/.exec(this.model)
            );
        return msg;
    },
    
    getFetchFields: function() {
        return ['Name','Project','Parent'];
    },

    getLabel: function(){
        this.label = Ext.String.format(
            "{0} no EPMS ID",
            /[^\/]*$/.exec(this.getModel())
        );
        return this.label;
    },

    isValidField: function(model, field_name) {
        var field_defn = model.getField(field_name);
        return ( !Ext.isEmpty(field_defn) );
    },
    
    applyRuleToRecord: function(record) {
        console.log("ThemeNoEpmsId.applyRuleToRecord:",record);        
        
        if (record.get('c_EPMSid') == null) {
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