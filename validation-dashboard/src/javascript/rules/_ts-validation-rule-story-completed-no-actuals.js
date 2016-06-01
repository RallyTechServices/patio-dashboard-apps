Ext.define('CA.techservices.validation.StoryCompletedNoActuals',{
    extend: 'CA.techservices.validation.BaseRule',
    alias: 'widget.tsstorycompletednoactuals',
    config: {
        model: 'HierarchicalRequirement',
        label: 'Completed without Actuals (User Story)',
        completedStates: ['Completed','Accepted']
    },
    
    getDescription: function() {
        return Ext.String.format("<strong>{0}</strong>: {1}",
            this.label,
            "Stories that have reached the Completed state but have nothing in the Actuals field on their tasks."
        );
    },
    
    getFetchFields: function() {
        return ['TaskActualTotal','ScheduleState'];
    },
    
    getFilters: function() {
        return Rally.data.wsapi.Filter.and([
            {property:'ScheduleState',operator:'>=',value:'Completed'},
            {property:'TaskActualTotal',operator: '<', value: .0000001 }
        ]);
    },
    // return false if the record doesn't match
    // return string if record fails the rule
    applyRuleToRecord: function(record) {
        if ( record.get('TaskActualTotal') > 0 || !Ext.Array.contains(this.completedStates, record.get('ScheduleState')) ) {
            return false; 
        }
        return Ext.String.format('Completed but has no Actuals (State:{0})', record.get('ScheduleState'));
    },
    
    getUserFriendlyRuleLabel: function() {        
        return this.label;
    }
});