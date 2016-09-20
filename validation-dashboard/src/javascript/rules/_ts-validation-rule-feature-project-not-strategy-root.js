Ext.define('CA.techservices.validation.FeatureProjectNotStrategyRootRule',{
    extend: 'CA.techservices.validation.BaseRule',
    alias:  'widget.tsfeatureprojectnotstrategyrootrule',
   
    config: {
        /*
        * [{Rally.wsapi.data.Model}] portfolioItemTypes the list of PIs available
        * we're going to use the first level ones (different workspaces name their portfolio item levels differently)
        */
        // Set Name of the Top-Level container where teams *must* put their portfolio items
        rootStrategyProject: null,
        
        // discovered in app.js, passed on crea
        portfolioItemTypes:[],
        //model: 'PortfolioItem/Feature - types loaded in base class.',
        model: null,
        label: 'Wrong Project'
    },
    constructor: function(config) {
        Ext.apply(this,config);
        this.model = this.portfolioItemTypes[0];
    },
    getDescription: function() {
        console.log("getDescription: WrongProject:",this);
        
        var msg = Ext.String.format(
            "{0} must be saved into *{1}*.",
            /[^\/]*$/.exec(this.model),
            this.rootStrategyProject
            );

        return msg;
    },
    
    getFetchFields: function() {
        return ['Name','Project','Parent'];
    },

    getLabel: function(){
        this.label = Ext.String.format(
            "{0} Wrong Project",
            /[^\/]*$/.exec(this.getModel())
        );
        return this.label;
    },

    isValidField: function(model, field_name) {
        var field_defn = model.getField(field_name);
        return ( !Ext.isEmpty(field_defn) );
    },
    
    applyRuleToRecord: function(record) {
        console.log("applyRuleToRecord:",record);        
        // if we need check for target root and direct child projects, use the commented filter instead. 
        // if (( record.get('Project').Name == this.project_PortfolioRoot ) || (record.get('Project').Parent.Name == this.project_PortfolioRoot)) {
        if ( record.get('Project').Name == this.rootStrategyProject ) {
            return null; // no rule violation   
        } else {
            return this.getDescription();
        }
    },
    
    getFilters: function() {        

       // return Rally.data.wsapi.Filter.and([
       //     {property:'Parent',operator:'=',value:null}
       // ]);
       return [];
    }
});