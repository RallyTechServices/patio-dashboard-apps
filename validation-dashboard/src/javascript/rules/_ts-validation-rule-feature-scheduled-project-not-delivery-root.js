Ext.define('CA.techservices.validation.FeatureScheduledProjectNotDeliveryRootRule',{
    extend: 'CA.techservices.validation.BaseRule',
    alias:  'widget.tsfeaturescheduledprojectnotdeliveryrootrule',
   
    config: {
        /*
        * [{Rally.wsapi.data.Model}] portfolioItemTypes the list of PIs available
        * we're going to use the first level ones (different workspaces name their portfolio item levels differently)
        */

        portfolioItemTypes:[],
        //model: 'PortfolioItem/Feature - types loaded in base class.',
        model: null,
        label: 'Scheduled, Wrong Project'
    },
    constructor: function(config) {
        Ext.apply(this,config);
        this.model = this.portfolioItemTypes[0];
        this.label = this.getLabel();
    },
    getDescription: function() {
        console.log("FeatureScheduledProjectNotDelivery.getDescription:",this);
        
        var msg = Ext.String.format(
            "Scheduled {0} must be saved into a Delivery Team project.",
            /[^\/]*$/.exec(this.model)
            );
        return msg;
    },
    
    getFetchFields: function() {
        return ['Name','Project','Parent','Release'];
    },

    getLabel: function(){
        this.label = Ext.String.format(
            "Scheduled, Wrong Project ({0})",
            /[^\/]*$/.exec(this.getModel())
        );
        return this.label;
    },

    isValidField: function(model, field_name) {
        var field_defn = model.getField(field_name);
        return ( !Ext.isEmpty(field_defn) );
    },
    
    applyRuleToRecord: function(record) {
        // this rule: Scheduled Feature is not in specified 'delivery' folder.
        var me = this;

        console.log("featureScheduledInWrongProject.applyRuleToRecord:",record,me.deliveryTeamProjects);   
        console.log('featureScheduledInWrongProject.applyRuleToRecord2:',me.deliveryTeamProjects);     
        
        // slice out the project._ref from each project. Then compare on that!
        var projectRefs = Ext.Array.map(me.deliveryTeamProjects,function(project){return project._ref});

        if ((record.get('Release') != null) && ( !Ext.Array.contains(projectRefs, record.get('Project')._ref))) {
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