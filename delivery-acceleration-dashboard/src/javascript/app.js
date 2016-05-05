Ext.define("TSDeliveryAcceleration", {
    extend: 'CA.techservices.app.ChartApp',

    description: "<strong>Delivery Acceleration</strong><br/>" +
            "<br/>" +
            "In the settings, choose a base iteration.  The velocity " +
            "from this iteration will be used as a baseline for the following " +
            "iterations.  " +
            "<p/>" +
            "Click on a bar or point on the line to see a table with the accepted items from that sprint." +
            "<p/>" +
            "<ul>" +
            "<li>The line on the chart shows each iteration's velocity</li>" +
            "<li>The bars on the chart show the percentage difference from the baseline velocity.</li>" +
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
            this._fetchIterationsAfterBaseline,
            this._fetchArtifactsInIterations
        ],this).then({
            scope: this,
            success: function(results) {
                var artifacts_by_iteration = this._collectArtifactsByIteration(results);
                this._makeChart(artifacts_by_iteration);
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
                    
        var fetch = ['ObjectID','Name','StartDate','EndDate'];
        
        this._getRecordByRef(baseIterationRef, fetch).then({
            scope: this,
            success: function(base_iteration) {
                this.baseIterationObject = base_iteration;
                
                var config = {
                    model:'Iteration',
                    limit: 10,
                    pageSize: 10,
                    fetch: fetch,
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
    
    _fetchArtifactsInIterations: function(iterations) {
        if ( iterations.length === 0 ) { return; }
        
        var deferred = Ext.create('Deft.Deferred');
        var first_date = iterations[0].get('StartDate');
        var last_date = iterations[iterations.length - 1].get('StartDate');
        
        var filters = [
            {property:'Iteration.StartDate', operator: '>=', value:first_date},
            {property:'Iteration.StartDate', operator: '<=', value:last_date},
            {property:'AcceptedDate', operator: '!=', value: null }
        ];
        
        var config = {
            model:'HierarchicalRequirement',
            limit: Infinity,
            filters: filters,
            fetch: ['FormattedID','Name','ScheduleState','Iteration','ObjectID','PlanEstimate']
        };
        
        Deft.Chain.sequence([
            function() { 
                return TSUtilities.loadWsapiRecords(config);
            },
            function() {
                config.model = "Defect";
                return TSUtilities.loadWsapiRecords(config);
            },
            function() {
                config.model = "TestSet";
                return TSUtilities.loadWsapiRecords(config);
            },
            function() {
                config.model = "DefectSuite";
                return TSUtilities.loadWsapiRecords(config);
            }
        ],this).then({
            success: function(results) {
                deferred.resolve(Ext.Array.flatten(results));
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
        });
        return deferred.promise;
    },
    
    _collectArtifactsByIteration: function(items) {
        var hash = {};
        if ( items.length === 0 ) { return hash; }
        
        Ext.Array.each(items, function(item){
            var iteration = item.get('Iteration').Name;
            if ( Ext.isEmpty(hash[iteration])){
                hash[iteration]={
                    items: []
                };
            }
            hash[iteration].items.push(item);
        });
        
        Ext.Object.each(hash, function(iteration,value){
            var items = value.items;
            var estimates = Ext.Array.map(items, function(item){
                return item.get('PlanEstimate') || 0;
            });
            value.velocity = Ext.Array.sum(estimates);
        });
        
        var values = Ext.Object.getValues(hash);
        var baseline = values[0].velocity;
        
        Ext.Object.each(hash, function(iteration, value) {
            var velocity = value.velocity || 0;
            var delta = 0;
            if ( baseline > 0 ) {
                delta = Math.round( 100 * ( velocity - baseline ) / baseline );
            }
            value.delta = delta;
        });
        return hash;
    },
    
    _makeChart: function(artifacts_by_sprint) {
        var me = this;

        var categories = this._getCategories(artifacts_by_sprint);
        var series = this._getSeries(artifacts_by_sprint);
        var colors = CA.apps.charts.Colors.getConsistentBarColors();
        
        if ( this.getSetting('showPatterns') ) {
            colors = CA.apps.charts.Colors.getConsistentBarPatterns();
        }
        this.setChart({
            chartData: { series: series, categories: categories },
            chartConfig: this._getChartConfig(),
            chartColors: colors
        });
    },
    
    _getSeries: function(artifacts_by_sprint) {
        var series = [];
        
        series.push({
            name: 'Acceleration',
            data: this._getVelocityAcceleration(artifacts_by_sprint),
            type:'column',
            yAxis: "b",
            tooltip: {
                valueSuffix: ' %'
            }
        });
        
        series.push({
            name: 'Velocity', 
            data: this._getVelocityData(artifacts_by_sprint),
            type:'line',
            yAxis: "a"
        });
        
        
        return series;
    },
    
    _getVelocityData: function(artifacts_by_sprint) {
        var me = this,
            data = [];
        
        Ext.Object.each(artifacts_by_sprint, function(iteration, value){
            data.push({ 
                y: value.velocity,
                _records: value.items,
                events: {
                    click: function() {
                        me.showDrillDown(this._records,  iteration);
                    }
                }
            });
        });
        
        return data;
        
    },
    
    _getVelocityAcceleration: function(artifacts_by_sprint) {
        var me = this,
            data = [];
        
        Ext.Object.each(artifacts_by_sprint, function(iteration, value){
            data.push({ 
                y: value.delta,
                _records: value.items,
                events: {
                    click: function() {
                        me.showDrillDown(this._records,  iteration);
                    }
                }
            });
        });
        
        return data;
        
    },
    
    _getCategories: function(artifacts_by_sprint) {
        return Ext.Object.getKeys(artifacts_by_sprint);
    },
    
    _getChartConfig: function() {
        var me = this;
        return {
            chart: { type:'column' },
            title: { text: 'Delivery Acceleration' },
            xAxis: {},
            yAxis: [{ 
                id: "a",
                //min: 0,
                title: { text: 'Velocity' }
            },
            {
                id: "b",
                title: { text: '' },
                opposite: true
            }],
            plotOptions: {
                column: {
                    stacking: 'normal'
                }
            },
            tooltip: {
                formatter: function() {
                    if ( this.series.name == "Acceleration" ) {
                        return '<b>'+ this.series.name +'</b>: '+ this.point.y + "%";
                    }
                    return '<b>'+ this.series.name +'</b>: '+ Ext.util.Format.number(this.point.y, '0.##');
                }
            }
        }
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
            margin: '0 0 10 25'
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
