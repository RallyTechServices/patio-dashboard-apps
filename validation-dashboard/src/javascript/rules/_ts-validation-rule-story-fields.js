Ext.define('CA.techservices.validation.StoryRequiredFieldRule',{
    extend: 'CA.techservices.validation.BaseRule',
    alias:  'widget.tsstoryrequiredfieldrule',
    
   
    config: {
        model: 'HierarchicalRequirement',
        requiredFields: [],
        label: 'Required Fields are missing (user story)'
    },
    
    getDescription: function() {
        return Ext.String.format("<strong>{0}</strong>{1}",
            this.label,
            "Stories that are missing expected fields."
        );
    },
    
    getFetchFields: function() {
        return this.requiredFields;
    },
    
    isValidField: function(model, field_name) {
        var field_defn = model.getField(field_name);
        return ( !Ext.isEmpty(field_defn) );
    },
    
    applyRuleToRecord: function(record) {
        var missingFields = [];

        Ext.Array.each(this.requiredFields, function (field_name) {
            if ( this.isValidField(record, field_name) ) {
                var value = record.get(field_name);
                missingFields.push(record.getField(field_name).displayName);
            }
        },this);
        if (missingFields.length === 0) {
            return false;
        }
        return Ext.String.format('Fields Missing: {0}', missingFields.join(','))
    },
    
    getFilters: function() {        
        var filters = Ext.Array.map(this.requiredFields, function(field) {
            return { property: field, value: "" };
        });
        
        return Rally.data.wsapi.Filter.or(filters);
    }
});