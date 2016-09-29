Ext.define('Rally.technicalservices.Toolbox',{
    singleton: true,

    fetchData: function(config){
        var deferred = Ext.create('Deft.Deferred');

        config.limit = Infinity;
        Ext.create('Rally.data.wsapi.Store',config).load({
            callback: function(records, operation){
                if (operation.wasSuccessful()){
                    deferred.resolve(records);
                } else {
                    deferred.reject(operation);
                }
            }
        });
        return deferred;
    },

    fetchPortfolioItemTypes: function(){
        var deferred = Ext.create('Deft.Deferred');

        var typeStore = Ext.create('Rally.data.wsapi.Store', {
            autoLoad: false,
            model: 'TypeDefinition',
            sorters: [{
                property: 'Ordinal',
                direction: 'ASC'
            }],
            filters: [{
                property: 'Parent.Name',
                operator: '=',
                value: 'Portfolio Item'
            }, {
                property: 'Creatable',
                operator: '=',
                value: true
            }]
        });

        typeStore.load({
            scope: this,
            callback: function (records, operation, success) {
                console.log('callback', operation, success);
                if (success){
                    deferred.resolve(records);

                } else {
                    deferred.reject("Error loading Portfolio Item Types:  " + operation.error.errors.join(','));
                }
            }
        });
        return deferred;
    },

    fetchScheduleStates: function(){
        var deferred = Ext.create('Deft.Deferred');
        Rally.data.ModelFactory.getModel({
            type: 'HierarchicalRequirement',
            success: function(model) {
                var field = model.getField('ScheduleState');
                field.getAllowedValueStore().load({
                    callback: function(records, operation, success) {
                        if (success){
                            var values = [];
                            for (var i=0; i < records.length ; i++){
                                values.push(records[i].get('StringValue'));
                            }
                            deferred.resolve(values);
                        } else {
                            deferred.reject('Error loading ScheduleState values for User Story:  ' + operation.error.errors.join(','));
                        }
                    },
                    scope: this
                });
            },
            failure: function() {
                var error = "Could not load schedule states";
                deferred.reject(error);
            }
        });
        return deferred.promise;
    },

    fetchPreliminaryEstimateValues: function(){
        return this.fetchData({
            model: 'PreliminaryEstimate',
            fetch: ['ObjectID','Name','Value']
        });
    }
});

Ext.override(Rally.sdk.Bootstrapper,{
    _isExternal: function() {
        return this.app.isExternal();
        //return !!Rally.environment.externalContext;
    }
});