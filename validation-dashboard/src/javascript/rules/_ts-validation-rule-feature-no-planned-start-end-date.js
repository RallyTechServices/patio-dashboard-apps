Ext.define('CA.techservices.validation.FeatureNoPlannedStartEndDateRule',{
    extend: 'CA.techservices.validation.BaseRule',
    alias:  'widget.tsfeaturenoplannedstartenddaterule',
   
    config: {
        /*
        * [{Rally.wsapi.data.Model}] portfolioItemTypes the list of PIs available
        * we're going to use the first level ones (different workspaces name their portfolio item levels differently)
        */

        // discovered in app.js, passed on create
        portfolioItemTypes:[],
        
        //model: 'PortfolioItem/Feature - types loaded in base class.',
        model: null,
        label: 'Feature No Planned Start/End Date'

    },
    constructor: function(config) {
        Ext.apply(this,config);
        this.model = this.portfolioItemTypes[0];
        this.label = this.getLabel();
    },
    getDescription: function() {
        console.log("featureNoPlannedStartEndDate.getDescription: ",this);
        
        var msg = Ext.String.format(
            "{0} must have both Planned Start and End Dates.",
            /[^\/]*$/.exec(this.model)
            );

        return msg;
    },
    
    getFetchFields: function() {
        return ['Name','PlannedStartDate','PlannedEndDate'];
    },

    getLabel: function(){
        this.label = Ext.String.format(
            "Planned Start/End Date Missing ({0})",
            /[^\/]*$/.exec(this.getModel())
        );

        return this.label;
    },

    isValidField: function(model, field_name) {
        var field_defn = model.getField(field_name);
        return ( !Ext.isEmpty(field_defn) );
    },
    
    applyRuleToRecord: function(record) {
        console.log("featureNoPlannedStartEndDate.applyRuleToRecord:",record);        
        
        if ((record.get('PlannedStartDate') == null) || ( record.get('PlannedEndDate') == null )) {
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