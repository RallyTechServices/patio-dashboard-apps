Ext.define("TSDeliveryAcceleration", {
    extend: 'CA.techservices.app.ChartApp',

    description: "<strong>Delivery Acceleration</strong><br/>" +
            "<br/>" +
            "In the settings, choose a base iteration.  The velocity " +
            "from this iteration will be used as a baseline for the following " +
            "iterations.  " +
            "<p/>" +
            "<ul>" +
            "<li>The line on the chart shows each iteration's velocity</li>" +
            "<li>The bars on the chart show the difference from the baseline</li>" +
            "</ul>",
    
    integrationHeaders : {
        name : "TSDeliveryAcceleration"
    },
    
    config: {
        defaultSettings: {
            showPatterns: false,
            baseIteration: null
        }
    },
                        
    launch: function() {
        this.callParent();
        
        if ( Ext.isEmpty( this.getSetting('baseIteration'))  ){
            Ext.Msg.alert("Settings needed","Use the settings gear to choose a base iteration");
            return;
        }
        
        this._updateData();
    },
    
    _updateData: function() {
        var me = this;
        this.metric = "size";
        
        Deft.Chain.pipeline([
            this._fetchIterationsAfterBaseline
        ],this).then({
            scope: this,
            success: function(results) {
                console.log('results', results);
            },
            failure: function(msg) {
                Ext.Msg.alert('--', msg);
            }
        });
        
    },
    
    _fetchIterationsAfterBaseline: function() {
        var me = this,
            deferred = Ext.create('Deft.Deferred'),
            baseIterationRef = this.getSetting('baseIteration');
            
        console.log('base Iteration:', baseIterationRef);
        
        var fields = ['ObjectID','Name','StartDate','EndDate'];
        
        this._getRecordByRef(baseIterationRef, fields).then({
            scope: this,
            success: function(base_iteration) {
                this.baseIterationObject = base_iteration;
                
                var config = {
                    model:'Iteration',
                    limit: 10,
                    pageSize: 10,
                    context: {
                        projectScopeUp: false,
                        projectScopeDown: false
                    },
                    sorters: [{property:'EndDate', direction:'ASC'}],
                    filters: [
                        {property:'StartDate',operator:'>=',value:base_iteration.get('StartDate')},
                        {property:'EndDate',operator:'<', value: Rally.util.DateTime.toIsoString(new Date()) }
                    ]
                }
                
                TSUtilities.loadWsapiRecords(config).then({
                    success: function(results) {
                        deferred.resolve(results);
                    },
                    failure: function(msg) {
                        deferred.reject(msg);
                    }
                });
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
        });
        
        return deferred.promise;
    },
    
    _getRecordByRef: function(ref, fields) {
        var deferred = Ext.create('Deft.Deferred');
        
        var ref_array = ref.split('\/');
        
        if ( ref_array.length < 2 ) {
            deferred.reject('NO NO NO');
            return deferred;
        }
        
        var object_id = ref_array.pop();
        var model = ref_array.pop();
        
        Rally.data.ModelFactory.getModel({
            type: model,
            success: function(model) {
                model.load(object_id,{
                    fetch: Ext.Array.merge(['ObjectID','Name'], fields),
                    callback: function(result, operation) {
                        if(operation.wasSuccessful()) {
                            deferred.resolve(result);
                        } else {
                            deferred.reject(operation.error.errors.join('. '))
                        }
                    }
                });
            }
        });
        
        return deferred.promise;
    },
    
    getSettingsFields: function() {
        return [
        {
            name: 'baseIteration',
            xtype:'rallyiterationcombobox',
            fieldLabel: 'Base Iteration',
            margin: '0 0 10 25',
//            storeConfig: {
//            TODO: limit to past iterations
//                fetch: ["Name", 'StartDate', 'EndDate', "ObjectID", "State", "PlannedVelocity"],
//                sorters: [
//                    {property: 'StartDate', direction: "DESC"},
//                    {property: 'EndDate', direction: "DESC"}
//                ],
//                model: Ext.identityFn('Iteration'),
//                
//                filters: [{property:'EndDate',operator:'<',value: Rally.util.DateTime.toIsoString(new Date())}],
//                
//                limit: Infinity,
//                context: {
//                    projectScopeDown: false,
//                    projectScopeUp: false
//                },
//                remoteFilter: false,
//                autoLoad: true
//                
//            }
        },
        { 
            name: 'showPatterns',
            xtype: 'rallycheckboxfield',
            boxLabelAlign: 'after',
            fieldLabel: '',
            margin: '0 0 25 25',
            boxLabel: 'Show Patterns<br/><span style="color:#999999;"><i>Tick to use patterns in the chart instead of color.</i></span>'
        }
        
        ];
    }
});
