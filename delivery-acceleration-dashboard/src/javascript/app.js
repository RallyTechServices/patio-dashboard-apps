Ext.define("TSDeliveryAcceleration", {
    extend: 'CA.techservices.app.ChartApp',

    description: "<strong>Delivery Acceleration</strong><br/>" +
            "<br/>" +
            "This chart displays the velocity and change in velocity for timeboxes that " +
            "follow a selected timebox.  Use the toggle switch to choose the type of " +
            "timebox (iteration or release), then use the dropdown to choose a baseline " +
            "timebox." +
            "<p/>" +
            "Click on a bar or point on the line to see a table with the accepted items from that timebox." +
            "<p/>" +
            "<ul>" +
            "<li>The line on the chart shows each timebox's velocity</li>" +
            "<li>The bars on the chart show the percentage difference from the baseline timebox.</li>" +
            "</ul>",
    
    integrationHeaders : {
        name : "TSDeliveryAcceleration"
    },
    
    config: {
        defaultSettings: {
            showPatterns: false
        }
    },
                        
    launch: function() {
        this.callParent();
        
        this._addSelectors();
    }, 
    
    _addSelectors: function() {
        
        this.timebox_selector = null;
        
        this.timebox_type_selector = this.addToBanner({
            xtype: 'tstogglebutton',
            toggleState: 'iteration',
            itemId: 'metric_selector',
            margin: '3 0 0 0',
            stateful: true,
            stateId: 'techservices-deliveryacceleration-timeboxtype-toggle',
            stateEvents:['change'],
            listeners: {
                scope: this,
                toggle: this._updateTimeboxSelector
            }
        });
        
        this._updateTimeboxSelector();
    },
    
    _updateTimeboxSelector: function() {
        var type = this.timebox_type_selector.getValue();
        
        if ( ! Ext.isEmpty(this.timebox_selector) ) {
            this.timebox_selector.destroy();
        }
        
        if ( type == 'iteration' ) {
            this.timebox_selector = this.addToBanner({
                xtype:'rallyiterationcombobox',
                fieldLabel: 'Base Iteration:',
                labelWidth: 80,
                margin: '0 0 10 25',
                stateful: true,
                stateId: 'techservices-deliveryacceleration-iteration-box',
                stateEvents:['change'],
                listeners: {
                    scope: this,
                    change: this._updateData
                }
            });
        } else {
            this.timebox_selector = this.addToBanner({
                xtype:'rallyreleasecombobox',
                fieldLabel: 'Base Release:',
                labelWidth: 70,
                margin: '0 0 10 25',
                stateful: true,
                stateId: 'techservices-deliveryacceleration-release-box',
                stateEvents:['change'],
                listeners: {
                    scope: this,
                    change: this._updateData
                }
            });
        }
        
    },
    
    _updateData: function() {
        var me = this;
        this.metric = "size";
        
        
        Deft.Chain.pipeline([
            this._fetchTimeboxesAfterBaseline,
            this._fetchArtifactsInTimeboxes
        ],this).then({
            scope: this,
            success: function(results) {
                var artifacts_by_timebox = this._collectArtifactsByTimebox(results || []);
                this._makeChart(artifacts_by_timebox);
            },
            failure: function(msg) {
                Ext.Msg.alert('--', msg);
            }
        });
        
    },
    
    _fetchTimeboxesAfterBaseline: function() {
        var me = this,
            deferred = Ext.create('Deft.Deferred'),
            baseTimeboxRef = this.timebox_selector.getRecord().get('_ref'),
            type = this.timebox_type_selector.getValue();
        
        var start_field = "StartDate";
        var end_field = "EndDate";
        if ( type == "release" ) {
            start_field = "ReleaseStartDate",
            end_field = "ReleaseDate"
        }
        var fetch = ['ObjectID','Name',start_field,end_field];
        
        this._getRecordByRef(baseTimeboxRef, fetch).then({
            scope: this,
            success: function(base_timebox) {
                this.baseTimeboxObject = base_timebox;
                
                var config = {
                    model:type,
                    limit: 10,
                    pageSize: 10,
                    fetch: fetch,
                    context: {
                        projectScopeUp: false,
                        projectScopeDown: false
                    },
                    sorters: [{property:end_field, direction:'ASC'}],
                    filters: [
                        {property:start_field,operator:'>=',value:base_timebox.get(start_field)},
                        {property:end_field,operator:'<', value: Rally.util.DateTime.toIsoString(new Date()) }
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
    
    _fetchArtifactsInTimeboxes: function(timeboxes) {
        if ( timeboxes.length === 0 ) { return; }
        
        var type = this.timebox_type_selector.getValue();
        var start_field = "StartDate";
        var end_field = "EndDate";
        var timebox_property = 'Iteration';
        if ( type == "release" ) {
            start_field = "ReleaseStartDate",
            end_field = "ReleaseDate",
            timebox_property = "Release"
        }
        
        var deferred = Ext.create('Deft.Deferred');
        var first_date = timeboxes[0].get(start_field);
        var last_date = timeboxes[timeboxes.length - 1].get(start_field);
        
        var filters = [
            {property: timebox_property + '.' + start_field, operator: '>=', value:first_date},
            {property: timebox_property + '.' + start_field, operator: '<=', value:last_date},
            {property:'AcceptedDate', operator: '!=', value: null }
        ];
        
        var config = {
            model:'HierarchicalRequirement',
            limit: Infinity,
            filters: filters,
            fetch: ['FormattedID','Name','ScheduleState','Iteration','ObjectID','PlanEstimate','Release']
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
    
    _collectArtifactsByTimebox: function(items) {
        var hash = {},
            type = this.timebox_type_selector.getValue();
            
        if ( items.length === 0 ) { return hash; }
        
        var timebox_property = 'Iteration';
        if ( type == "release" ) {
            timebox_property = "Release"
        }
        
        Ext.Array.each(items, function(item){
            var timebox = item.get(timebox_property).Name;
            if ( Ext.isEmpty(hash[timebox])){
                hash[timebox]={
                    items: []
                };
            }
            hash[timebox].items.push(item);
        });
        
        Ext.Object.each(hash, function(timebox,value){
            var items = value.items;
            var estimates = Ext.Array.map(items, function(item){
                return item.get('PlanEstimate') || 0;
            });
            value.velocity = Ext.Array.sum(estimates);
        });
        
        var values = Ext.Object.getValues(hash);
        var baseline = values[0].velocity;
        
        Ext.Object.each(hash, function(timebox, value) {
            var velocity = value.velocity || 0;
            var delta = 0;
            if ( baseline > 0 ) {
                delta = Math.round( 100 * ( velocity - baseline ) / baseline );
            }
            value.delta = delta;
        });
        return hash;
    },
    
    _makeChart: function(artifacts_by_timebox) {
        var me = this;

        var categories = this._getCategories(artifacts_by_timebox);
        var series = this._getSeries(artifacts_by_timebox);
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
    
    _getSeries: function(artifacts_by_timebox) {
        var series = [];
        
        series.push({
            name: 'Acceleration',
            data: this._getVelocityAcceleration(artifacts_by_timebox),
            type:'column',
            yAxis: "b",
            tooltip: {
                valueSuffix: ' %'
            }
        });
        
        series.push({
            name: 'Velocity', 
            data: this._getVelocityData(artifacts_by_timebox),
            type:'line',
            yAxis: "a"
        });
        
        
        return series;
    },
    
    _getVelocityData: function(artifacts_by_timebox) {
        var me = this,
            data = [];
        
        Ext.Object.each(artifacts_by_timebox, function(timebox, value){
            data.push({ 
                y: value.velocity,
                _records: value.items,
                events: {
                    click: function() {
                        me.showDrillDown(this._records,  timebox);
                    }
                }
            });
        });
        
        return data;
        
    },
    
    _getVelocityAcceleration: function(artifacts_by_timebox) {
        var me = this,
            data = [];
        
        Ext.Object.each(artifacts_by_timebox, function(timebox, value){
            data.push({ 
                y: value.delta,
                _records: value.items,
                events: {
                    click: function() {
                        me.showDrillDown(this._records,  timebox);
                    }
                }
            });
        });
        
        return data;
        
    },
    
    _getCategories: function(artifacts_by_timebox) {
        return Ext.Object.getKeys(artifacts_by_timebox);
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
//        {
//            name: 'baseIteration',
//            xtype:'rallyiterationcombobox',
//            fieldLabel: 'Base Iteration',
//            margin: '0 0 10 25'
////            storeConfig: {
////            TODO: limit to past iterations
////                fetch: ["Name", 'StartDate', 'EndDate', "ObjectID", "State", "PlannedVelocity"],
////                sorters: [
////                    {property: 'StartDate', direction: "DESC"},
////                    {property: 'EndDate', direction: "DESC"}
////                ],
////                model: Ext.identityFn('Iteration'),
////                
////                filters: [{property:'EndDate',operator:'<',value: Rally.util.DateTime.toIsoString(new Date())}],
////                
////                limit: Infinity,
////                context: {
////                    projectScopeDown: false,
////                    projectScopeUp: false
////                },
////                remoteFilter: false,
////                autoLoad: true
////                
////            }
//        },
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
