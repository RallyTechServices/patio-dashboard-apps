Ext.define('CA.techservices.validation.StoryWithoutEPMSID',{
    extend: 'CA.techservices.validation.BaseRule',
    alias: 'widget.tsstorywithoutepmsid',
    config: {
        model: 'HierarchicalRequirement',
        label: 'Story without EPMS ID'
    },
    
    getDescription: function() {
        return Ext.String.format("<strong>{0}</strong>{1}",
            this.label,
            "Stories that don't trace to a EPMS Project with an EPMS ID.  This can be because the EPMS Project doesn't have" +
            " an ID, because the Feature isn't related to an EPMS Project, or because there's no Feature for the story."
        );
    },
    
    getFetchFields: function() {
        return ['Feature','Parent','c_EPMSid'];
    },
    
    getFilters: function() {
        return Rally.data.wsapi.Filter.and([
            {property:'Feature.Parent.c_EPMSid',operator:'=',value:''}
        ]);
    },
    // return false if the record doesn't match
    // return string if record fails the rule
    applyRuleToRecord: function(record) {
        if ( Ext.isEmpty(record.get('Feature')) ) {
            return 'Has no EPMS ID (no Feature)';
        }
        
        if ( Ext.isEmpty(record.get('Feature').Parent )) {
            return 'Has no EPMS ID (no EPMS Project)';
        }
        
        if ( Ext.isEmpty(record.get('Feature').Parent.c_EPMSid) ) {
            return 'Has no EPMS ID';
        }
        return false;
    },
    
    getUserFriendlyRuleLabel: function() {        
        return this.label;
    }
});