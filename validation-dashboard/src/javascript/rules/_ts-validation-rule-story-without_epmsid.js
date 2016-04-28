Ext.define('CA.techservices.validation.StoryWithoutEPMSID',{
    extend: 'CA.techservices.validation.BaseRule',
    alias: 'widget.tsstorywithoutepmsid',
    config: {
        model: 'HierarchicalRequirement',
        label: 'Story without EPMS ID'
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