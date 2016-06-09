Ext.define("TSDeliveryEfficiency", {
    extend: 'CA.techservices.app.ChartApp',

    description: "<strong>Delivery Efficiency</strong><br/>" +
            "<br/>" +
            "This chart can help teams understand where time is being spent while delivering value. " +
            "This dashboard allows teams to identify how efficiently they are working to deliver an " +
            "accepted point of each of the different types.  (Your admin can choose a different field to define " +
            "'type' with the App Settings... menu option.)" +
            "<p/>" +
            "Click on a bar or point on the line to see a table with the accepted items from that timebox." +
            "<p/>" +
            "The efficiency is calculated by finding Tasks of each type and dividing the total of estimates in hours by actuals.  This is averaged for each sprint.",
    
    integrationHeaders : {
        name : "TSDeliveryAcceleration"
    },
    
    config: {
        defaultSettings: {
            showPatterns: false,
            typeField: 'c_Type'
        }
    },
                        
    launch: function() {
        this.callParent();
        
        this._getAllowedValues('UserStory',this.getSetting('typeField')).then({
            scope: this,
            success: function(values) {
                this.allowed_types = values;
                this._addSelectors();
                this._updateData();
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem loading allowed values', msg);
            }
        });
    }, 

    _addSelectors: function() {

        this.timebox_limit = 10;
        this.addToBanner({
            xtype: 'numberfield',
            name: 'timeBoxLimit',
            itemId: 'timeBoxLimit',
            fieldLabel: 'Time Box Limit',
            value: 10,
            maxValue: 20,
            minValue: 1,            
            margin: '0 0 0 50',
            width: 150,
            allowBlank: false,  // requires a non-empty value
            listeners:{
                change:function(nf){
                    this.timebox_limit = nf.value;
                    this._updateData();
                },
                scope:this
            }
        }
        );

        this.timebox_type = 'Iteration';
        this.addToBanner(
        {
            xtype      : 'radiogroup',
            fieldLabel : 'Timebox Type',
            margin: '0 0 0 50',
            width: 300,
            defaults: {
                flex: 1
            },
            layout: 'hbox',
            items: [
                {
                    boxLabel  : 'Iteration',
                    name      : 'timeBoxType',
                    inputValue: 'Iteration',
                    id        : 'radio1',
                    checked   : true                    
                }, {
                    boxLabel  : 'Release',
                    name      : 'timeBoxType',
                    inputValue: 'Release',
                    id        : 'radio2'
                }
            ],
            listeners:{
                change:function(rb){
                    this.timebox_type = rb.lastValue.timeBoxType;
                    this._updateData();
                },
                scope:this
            }
        }
        );


    },    
    
    _getAllowedValues: function(model, field_name) {
        var deferred = Ext.create('Deft.Deferred');

        this.logger.log("_getAllowedValues for", model, field_name);
        
        Rally.data.ModelFactory.getModel({
            type: model,
            success: function(model) {
                model.getField(field_name).getAllowedValueStore().load({
                    callback: function(records, operation, success) {
                        var values = Ext.Array.map(records, function(record) {
                            return record.get('StringValue');
                        });
                        deferred.resolve(values);
                    }
                });
            },
            failure: function(msg) { deferred.reject('Error loading field values: ' + msg); }
        });
        return deferred;
    },
    
    _updateData: function() {
        var me = this;
        this.metric = "size";
        //this.timebox_type = 'Iteration';
        
        Deft.Chain.pipeline([
            this._fetchTimeboxes,
            this._sortIterations,
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
    
    _fetchTimeboxes: function() {
        var me = this,
            deferred = Ext.create('Deft.Deferred'),
            type = this.timebox_type;
                
        this.setLoading("Fetching timeboxes...");

        var start_field = "StartDate";
        var end_field = "EndDate";

        if ( type == "Release" ) {
            start_field = "ReleaseStartDate";
            end_field   = "ReleaseDate";
        }        
                
        var config = {
            model: type,
            limit: this.timebox_limit,
            pageSize: this.timebox_limit,
            fetch: ['Name',start_field,end_field],
            filters: [{property:end_field, operator: '<=', value: Rally.util.DateTime.toIsoString(new Date)}],
            sorters: [{property:end_field, direction:'DESC'}],
            context: {
                projectScopeUp: false,
                projectScopeDown: false
            }
        };
        
        return TSUtilities.loadWsapiRecords(config);
    },
    
    _sortIterations: function(iterations) {
        
        // Ext.Array.sort(iterations, function(a,b){
        //     if ( a.get('EndDate') < b.get('EndDate') ) { return -1; }
        //     if ( a.get('EndDate') > b.get('EndDate') ) { return  1; }
        //     return 0;
        // });
        
        return iterations.reverse();
    },
    
    _fetchArtifactsInTimeboxes: function(timeboxes) {
        if ( timeboxes.length === 0 ) { return; }
        
        var type = this.timebox_type;
        var type_field = this.getSetting('typeField');
        
        var start_field = "StartDate";
        var end_field = "EndDate";
        if ( type == "Release" ) {
            start_field = "ReleaseStartDate";
            end_field   = "ReleaseDate";
        }
        
        //var deferred = Ext.create('Deft.Deferred');
        var first_date = timeboxes[0].get(start_field);
        var last_date = timeboxes[timeboxes.length - 1].get(start_field);
        
        var filters = [
            {property: type + '.' + start_field, operator: '>=', value:first_date},
            {property: type + '.' + start_field, operator: '<=', value:last_date},
            //{property:'AcceptedDate', operator: '!=', value: null }
            {property:'WorkProduct.AcceptedDate', operator: '!=', value: null }
        ];

        
        var config = {
            //model:'HierarchicalRequirement',
            model: 'Task',
            limit: Infinity,
            filters: filters,
            fetch: ['FormattedID','Name','ScheduleState','Iteration','Release','ObjectID',
                'PlanEstimate','Project','Release',type_field,'TaskEstimateTotal','Tasks',
                'Actuals','Estimate','TaskActualTotal']
        };
        
        return TSUtilities.loadWsapiRecords(config);

        // Deft.Chain.sequence([
        //     function() { 
        //         return TSUtilities.loadWsapiRecords(config);
        //     },
        //     function() {
        //         config.model = "Defect";
        //         return TSUtilities.loadWsapiRecords(config);
        //     },
        //     function() {
        //         config.model = "TestSet";
        //         return TSUtilities.loadWsapiRecords(config);
        //     },
        //     function() {
        //         config.model = "DefectSuite";
        //         return TSUtilities.loadWsapiRecords(config);
        //     }
        // ],this).then({
        //     success: function(results) {
        //         deferred.resolve(Ext.Array.flatten(results));
        //     },
        //     failure: function(msg) {
        //         deferred.reject(msg);
        //     }
        // });
        //return deferred.promise;
    },
    
    /* 
     * returns a hash of hashes -- key is iteration name value is
     * another hash where the records key holds a hash
     *    the records hash has a key for each allowed value 
     *    which then provides an array of items that match the allowed value 
     *    and timebox
     * as in
     * { "iteration 1": { "records": { "all": [o,o,o], "SPIKE": [o,o], "": [o] } } }
     */
    _collectArtifactsByTimebox: function(items) {
        var hash = {},
            timebox_type = this.timebox_type,
            type_field = this.getSetting('typeField'),
            allowed_types = this.allowed_types;
        
        
        if ( items.length === 0 ) { return hash; }
        
        var base_hash = {
            records: {
                all: []
            }
        };
        Ext.Array.each(allowed_types, function(value) {
            base_hash.records[value] = [];
        });
        
        Ext.Array.each(items, function(item){
            var timebox = item.get(timebox_type).Name;
            
            if ( Ext.isEmpty(hash[timebox])){
                
                hash[timebox] = Ext.Object.merge({}, Ext.clone(base_hash) );
            }
            hash[timebox].records.all.push(item);
            
            var type = item.get(type_field) || "";
            if ( Ext.isEmpty(hash[timebox].records[type]) ) {
                hash[timebox].records[type] = [];
            }
            hash[timebox].records[type].push(item);
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
        this.setLoading(false);
    },
    
    _getSeries: function(artifacts_by_timebox) {
        var series = [],
            allowed_types = this.allowed_types;
        
        Ext.Array.each(allowed_types, function(allowed_type){
            var name = allowed_type;
            if ( Ext.isEmpty(name) ) { name = "-N/A-"; }
            
            series.push({
                name: name,
                data: this._calculateMeasure(artifacts_by_timebox,allowed_type),
                type: 'column',
                stack: 'a'
            });
        },this);
        
        return series;
    },
    
    _calculateMeasure: function(artifacts_by_timebox,allowed_type) {
        var me = this,
        data = [];

        Ext.Object.each(artifacts_by_timebox, function(timebox, value){
            var records = value.records[allowed_type] || [];

            var points = Ext.Array.sum(
                Ext.Array.map(records, function(record){
                    return record.get('Estimate') || 0;
                })
            );
            
            var estimate = Ext.Array.sum(
                Ext.Array.map(records, function(record){
                    return record.get('Actuals') || 0;
                })
            );
            
            var efficiency = null;
            if ( estimate > 0 ) {
                efficiency = points/estimate;
            }

            data.push({ 
                y:efficiency,
                _records: records,
                events: {
                    click: function() {
                        me.showDrillDown(this._records,  timebox + " (" + allowed_type + ")");
                    }
                }
            });


        });

        return data
    },



    
    _getCategories: function(artifacts_by_timebox) {
        return Ext.Object.getKeys(artifacts_by_timebox);
    },
    
    _getChartConfig: function() {
        var me = this;
        return {
            chart: { type:'column' },
            title: { text: 'Delivery Efficiency' },
            xAxis: {},
            yAxis: [{ 
                title: { text: 'Velocity' }
            }],
            plotOptions: {
                column: {
                    stacking: 'normal'
                }
            },
            tooltip: {
                formatter: function() {
                    return '<b>'+ this.series.name +'</b>: '+ Ext.util.Format.number(this.point.y, '0.##');
                }
            }
        }
    },
    
    getSettingsFields: function() {
        return [
        {
            name: 'typeField',
            xtype: 'rallyfieldcombobox',
            model: 'UserStory',
            _isNotHidden: function(field) {
                if ( field.hidden ) { return false; }
                var defn = field.attributeDefinition;
                if ( Ext.isEmpty(defn) ) { return false; }
                
                return ( defn.Constrained && defn.AttributeType == 'STRING' );
            }
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
    },
    
    getDrillDownColumns: function(title) {
        var columns = [
            {
                dataIndex : 'FormattedID',
                text: "id",
                flex:1
            },
            {
                dataIndex : 'Name',
                text: "Name",
                flex: 3
            },
            {
                dataIndex: 'ScheduleState',
                text: 'Schedule State',
                flex:1
            },
            {
                dataIndex: 'PlanEstimate',
                text: 'Plan Estimate',
                flex: 1
            },
            {
                dataIndex: 'TaskEstimateTotal',
                text: 'Task Hours (Est)'
            },
            {
                dataIndex: 'TaskActualTotal',
                text: 'Task Hours (Actual)'
            },
            {
                dataIndex: 'Project',
                text: 'Project',
                renderer:function(Project){
                        return Project.Name;
                },
                flex: 1
            }
        ];
        
        if ( /\(multiple\)/.test(title)) {
            columns.push({
                dataIndex: 'Name',
                text: 'Count of Moves',
                renderer: function(value, meta, record) {
                    
                    return value.split('[Continued]').length;
                }
            });
        }
        
        
        return columns;
    }
    
});
