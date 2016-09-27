Ext.define('CA.techservices.validation.TaskRequiredFieldRule',{
    extend: 'CA.techservices.validation.BaseRule',
    alias:  'widget.tstaskrequiredfieldrule',
    
    config: {
        model: 'Task',
        requiredFields: [],
        label: 'Required Fields Are Missing (Task)'
    },
    
    getDescription: function() {
        return Ext.String.format("<strong>{0}</strong>: {1}",
            this.label,
            "Tasks that are missing expected fields."
        );
    },
    
    getFetchFields: function() {
        return this.requiredFields;
    },
    
    /* model MUST be a model not just a model name */
    isValidField: function(model, field_name) {
        var field_defn = model.getField(field_name);
        return ( !Ext.isEmpty(field_defn) );
    },
    
    applyRuleToRecord: function(record) {
        var missingFields = [];

        Ext.Array.each(this.requiredFields, function (field_name) {
            if ( this.isValidField(record, field_name) ) {
                var value = record.get(field_name);
                if ( Ext.isEmpty(value) ) {
                    missingFields.push(record.getField(field_name).displayName);
                }
            }
        },this);
        if (missingFields.length === 0) {
            return false;
        }
        return Ext.String.format('Fields Missing: {0}', missingFields.join(','))
    },
    
    /* 
     * override to allow the validator to check if the rule makes sense to run 
     * 
     * resolve promise with text if problem
     * 
     */
    precheckRule: function() {
        var deferred = Ext.create('Deft.Deferred'),
            me = this;
                
        this.requestedRequiredFields = this.requiredFields;
        
        if ( Ext.isString(this.model) ) {
            Rally.data.ModelFactory.getModel({
                type: this.model,
                success: function(model) {
                    var bad_fields = Ext.Array.filter(me.requiredFields, function (field_name) {
                        return !me.isValidField(model,field_name);
                    });
                    
                    Ext.Array.each(bad_fields, function(field){
                        Ext.Array.remove(me.requiredFields, field);
                    });
                    
                    var text = null;
                    if ( bad_fields.length > 0 ) {
                        text = "Cannot perform Field Validation for Tasks for nonexistent fields: " + bad_fields.join(', ');
                    }
                    
                    deferred.resolve(text);
                },
                failure: function() {
                    deferred.reject("Issue prechecking Rule");
                }
            });
        }
        
        return deferred.promise;
    },
    
    getFilters: function() {        
        var filters = Ext.Array.map(this.requiredFields, function(field) {
            return { property: field, value: "" };
        });
        
        return Rally.data.wsapi.Filter.or(filters);
    }
});