Ext.define('CA.techservices.validation.TaskCompletedNoActuals',{
    extend: 'CA.techservices.validation.BaseRule',
    alias: 'widget.tstaskcompletednoactuals',
    config: {
        model: 'Task',
        label: 'Completed without Actuals (Task)',
        completedStates: ['Completed']
    },
    
    getFetchFields: function() {
        return ['Actuals','State'];
    },
    
    getDescription: function() {
        return Ext.String.format("<strong>{0}</strong>{1}",
            this.label,
            "Tasks that are Completed but do not have any hours in the Actuals field."
        );
    },
    
    getFilters: function() {
        return Rally.data.wsapi.Filter.and([
            {property:'State',operator:'=',value:'Completed'},
            {property:'Actuals',operator: '<', value: .0000001 }
        ]);
    },
    // return false if the record doesn't match
    // return string if record fails the rule
    applyRuleToRecord: function(record) {
        if ( record.get('Actuals') > 0 || !Ext.Array.contains(this.completedStates, record.get('State')) ) {
            return false; 
        }
        return Ext.String.format('Completed but has no Actuals (State:{0})', record.get('State'));
    },
    
    getUserFriendlyRuleLabel: function() {        
        return this.label;
    }
});