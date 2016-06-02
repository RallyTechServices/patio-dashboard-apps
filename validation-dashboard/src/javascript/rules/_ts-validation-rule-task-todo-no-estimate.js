Ext.define('CA.techservices.validation.TaskTodoNoEstimate',{
    extend: 'CA.techservices.validation.BaseRule',
    alias: 'widget.tstasktodonoestimate',
    config: {
        model: 'Task',
        label: 'Positive ToDo But No Estimate (Task)'
    },
    
    getDescription: function() {
        return Ext.String.format("<strong>{0}</strong>: {1}",
            this.label,
            "Tasks that have hours left in the To Do field but no Estimate."
        );
    },
    
    getFetchFields: function() {
        return ['ToDo','Estimate'];
    },
    
    getFilters: function() {
        return Rally.data.wsapi.Filter.and([
            {property:'ToDo',operator:'>',value:0},
            {property:'Estimate',operator: '<', value: .0000001 }
        ]);
    },
    // return false if the record doesn't match
    // return string if record fails the rule
    applyRuleToRecord: function(record) {
        if ( !record.get('ToDo') > 0 || record.get('Estimate') > 0 ) {
            return false; 
        }
        return Ext.String.format('Has ToDo But No Estimate (ToDo:{0})', record.get('ToDo'));
    },
    
    getUserFriendlyRuleLabel: function() {        
        return this.label;
    }
});