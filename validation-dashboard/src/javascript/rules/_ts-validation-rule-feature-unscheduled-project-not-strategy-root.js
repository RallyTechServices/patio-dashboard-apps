Ext.define('CA.techservices.validation.FeatureUnscheduledProjectNotStrategyRootRule',{
    extend: 'CA.techservices.validation.BaseRule',
    alias:  'widget.tsfeatureunscheduledprojectnotstrategyrootrule',
   
    config: {
        /*
        * [{Rally.wsapi.data.Model}] portfolioItemTypes the list of PIs available
        * we're going to use the first level ones (different workspaces name their portfolio item levels differently)
        */

        // discovered in app.js, passed on crea
        portfolioItemTypes:[],
        //model: 'PortfolioItem/Feature - types loaded in base class.',
        model: null,
        label: 'Unscheduled, Wrong Project'

    },
    constructor: function(config) {
        Ext.apply(this,config);
        this.model = this.portfolioItemTypes[0];
        this.label = this.getLabel();
    },
    getDescription: function() {
        console.log("getDescription: WrongProject:",this);
        
        var msg = Ext.String.format(
            "Unscheduled {0} must be saved into a Business Planning project.",
            /[^\/]*$/.exec(this.model)
            );

        return msg;
    },
    
    getFetchFields: function() {
        return ['Name','Project','Parent','Release'];
    },

    getLabel: function(){
        this.label = Ext.String.format(
            "Unscheduled, Wrong Project ({0})",
            /[^\/]*$/.exec(this.getModel())
        );

        return this.label;
    },

    isValidField: function(model, field_name) {
        var field_defn = model.getField(field_name);
        return ( !Ext.isEmpty(field_defn) );
    },
    
    applyRuleToRecord: function(record) {
        // this rule: Unscheduled Feature is not in specified 'strategy' folder.
        var me = this;

        var projectRefs = Ext.Array.map(me.strategyProjects,function(project){return project._ref});
        console.log('UnscheduledFeatureInWrongProject.Refs:',projectRefs);

        if ((record.get('Release') == null) && ( !Ext.Array.contains(projectRefs, record.get('Project')._ref )) ){
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