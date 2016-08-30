Ext.define("TSDeliveryEffortFocus", {
    extend: 'CA.techservices.app.ChartApp',

    description: "<strong>Delivery Effort Focus</strong><br/>" +
            "<br/>" +
            "How is effort distributed within the team? " +
            "This dashboard shows how many hours are being spent on accepted stories during sprints,  " +
            "grouped by types assigned to the tasks.  (Your admin can choose a different field to define " +
            "'type' with the App Settings... menu option.)" +
            "<p/>" +
            "Click on a bar to see a table with the tasks from that type and timebox." +
            "<p/>" +
            "The columns show a stacked count of actual hours by type on the tasks for tasks associated " +
            "with stories accepted in the sprint.",
    
            
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
        
        if ( Ext.isEmpty(this.getSetting('typeField') ) ) {
            Ext.Msg.alert('', 'Use the App Settings... menu option to choose a field to represent the type of task.');
            return;
        }
        this._getAllowedValues('Task',this.getSetting('typeField')).then({
            scope: this,
            success: function(values) {
                this.allowed_types = values;

                this.timebox_limit = 10;
                this.timebox_type = 'Iteration';
                
                this._addSelectors();
                this._updateData();
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem loading allowed values', msg);
            }
        });
    },

    _addSelectors: function() {

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
        });

        this.addToBanner({
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
        });

    }, 
    
    _getAllowedValues: function(model, field_name) {
        var deferred = Ext.create('Deft.Deferred');

        this.logger.log("_getAllowedValues for", model, field_name);
        
        Rally.data.ModelFactory.getModel({
            type: model,
            success: function(model) {
                if ( Ext.isEmpty(model.getField(field_name) ) ) {
                    deferred.reject('Please use the App Settings... menu option to choose a field to represent type of task.')
                    return;
                }
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
        
        Deft.Chain.pipeline([
            this._fetchTimeboxes,
            this._sortTimeboxes,
            this._fetchArtifactsInTimeboxes

        ],this).then({
            scope: this,
            success: function(results) {
               
				this._sortTasks(results);

        var artifacts_by_timebox = this._collectArtifactsByTimebox(results || []);

                this.clearAdditionalDisplay();

                this._makeGrid(artifacts_by_timebox);

                this._makeChart(artifacts_by_timebox);
            },
            failure: function(msg) {
                Ext.Msg.alert('--', msg);
            }
        });
        
    },

    _makeGrid: function(artifacts_by_timebox) {
        var me = this;
        
        var columns = [{dataIndex:'Name',text:'Story Type',flex:1}];
        Ext.Array.each(this._getCategories(artifacts_by_timebox), function(field){
            columns.push({  dataIndex: me._getSafeIterationName(field) + "_number", 
                            text: field + '<br> Actuals Hours / %', 
                            align: 'center',
                            flex:1,
                            renderer: function(value,meta,record) {
                                //if(value.actual_hours_total > 0){
                                    return value.actual_hours_total + " / "+ parseInt(100*value.actual_hours_pct,10) + "%";
                                //}
                            }
                        });
        });

       
        var rows = this._getGridRows(artifacts_by_timebox);
        
        var store = Ext.create('Rally.data.custom.Store',{ data: rows });

        this.addToAdditionalDisplay({
            xtype:'rallygrid',
            padding: 5,
            margin: '10 0 0 0',
            showPagingToolbar: false,
            enableEditing: false,
            showRowActionsColumn: false,                
            store: store,
            columnCfgs: columns
        }); 

    },
    
    _getGridRows: function(artifacts_by_timebox) {
        var me = this;
        // sprint objects have key = name of sprint
        var row_fields = this._getCategories(artifacts_by_timebox);
        
        var series = this._getSeries(artifacts_by_timebox);

        var rows = [
        ];

        Ext.Array.each(this._getSeries(artifacts_by_timebox),function(rowname){
            rows.push({Type:rowname.name == "-None-" ? '':rowname.name,Name:rowname.name});
        })

        // set up fields
        
        Ext.Array.each(rows, function(row) {
            Ext.Array.each(row_fields, function(field){
                field = me._getSafeIterationName(field);
                row[field] = [];
                row[field + "_number"] = 0;
            });
        });
                
        Ext.Array.each(rows, function(row){
            var type = row.Type;

            Ext.Object.each(artifacts_by_timebox, function(sprint_name,value){
                sprint_name = me._getSafeIterationName(sprint_name);

                row[sprint_name] = value.records[type];

                var all_records = value.records['all'];

                var actual_hours_total = 0;
                var all_actual_hours_total = 0;

                Ext.Array.each(all_records, function(story){
                    var value = story.get('Actuals') || 0;
                    all_actual_hours_total = all_actual_hours_total + value;
                });  

                Ext.Array.each(row[sprint_name], function(story){
                    var value = story.get('Actuals') || 0;
                    actual_hours_total = actual_hours_total + value;
                });                
                               
                var actual_hours_pct = all_actual_hours_total > 0?Math.round((actual_hours_total / all_actual_hours_total)*100)/100:0;
                row[sprint_name + "_number"] = {'actual_hours_total':actual_hours_total, 'actual_hours_pct':actual_hours_pct}; 
                
            });
        });

        return rows;
    },

    _getSafeIterationName: function(name) {
        return name.replace(/\./,'&#46;'); 
    },
    
    _fetchTimeboxes: function() {
        var me = this,
            deferred = Ext.create('Deft.Deferred');
                
        this.setLoading("Fetching timeboxes...");
        
        var start_date_field = TSUtilities.getStartFieldForTimeboxType(this.timebox_type);
        var end_date_field = TSUtilities.getEndFieldForTimeboxType(this.timebox_type);

        
        var config = {
            model:  this.timebox_type,
            limit: this.timebox_limit,
            pageSize: this.timebox_limit,
            fetch: ['Name',start_date_field,end_date_field],
            filters: [{property:end_date_field, operator: '<=', value: Rally.util.DateTime.toIsoString(new Date)}],
            sorters: [{property:end_date_field, direction:'DESC'}],
            context: {
                projectScopeUp: false,
                projectScopeDown: false
            }
        };
        
        return TSUtilities.loadWsapiRecords(config);
    },
    
    _sortTimeboxes: function(timeboxes) {
        var end_date_field = TSUtilities.getEndFieldForTimeboxType(this.timebox_type);
      
        Ext.Array.sort(timeboxes, function(a,b){
            if ( a.get(end_date_field) < b.get(end_date_field) ) { return -1; }
            if ( a.get(end_date_field) > b.get(end_date_field) ) { return  1; }
            return 0;
        }); 
        
        return timeboxes;

    },

    _sortTasks: function(task_records) {
    	
        var end_date_field = TSUtilities.getEndFieldForTimeboxType(this.timebox_type);
        
				for (i=0; i < task_records.length; i++) { 
					task_records[i].task_sort_field = task_records[i]['data'][this.timebox_type][end_date_field];
					};
     
        Ext.Array.sort(task_records, function(a,b){      	
            if ( a.task_sort_field < b.task_sort_field ) { return -1; }
            if ( a.task_sort_field > b.task_sort_field ) { return  1; }
            return 0;
        }); 
        
        return task_records;

    },
    
    _fetchArtifactsInTimeboxes: function(timeboxes) {
        if ( timeboxes.length === 0 ) { return; }
 
        var type = this.timebox_type;
        var type_field = this.getSetting('typeField');
        
        var start_field = TSUtilities.getStartFieldForTimeboxType(this.timebox_type);
        var end_field = TSUtilities.getEndFieldForTimeboxType(this.timebox_type);
        
        var deferred = Ext.create('Deft.Deferred');
        var first_date = timeboxes[0].get(start_field);
        var last_date = timeboxes[timeboxes.length - 1].get(end_field);
//        var last_date = timeboxes[timeboxes.length - 1].get(start_field);
        
        var filters = [
            {property: type + '.' + start_field, operator: '>=', value:first_date},
            {property: type + '.' + end_field, operator: '<=', value:last_date},
//            {property: type + '.' + start_field, operator: '<=', value:last_date},
            {property:'WorkProduct.AcceptedDate', operator: '!=', value: null }
        ];
        
        var config = {
            model:'Task',
            limit: Infinity,
            filters: filters,
            fetch: ['FormattedID','Name','ScheduleState','Iteration','ObjectID',
                'PlanEstimate','Project','Release',type_field,'Actuals','Estimate',
                'ToDo','WorkProduct','StartDate','EndDate','ReleaseStartDate','ReleaseDate'],
//           sorters: last_date,    
        };
        
        Deft.Chain.sequence([
            function() { 
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
            if ( Ext.isEmpty(name) ) { name = "-None-"; }
            
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
            
            var size = Ext.Array.sum(
                Ext.Array.map(records, function(record){
                    return record.get('Actuals') || 0;
                })
            );
            
            var title = Ext.String.format("{0} ({1})",
                timebox,
                (Ext.isEmpty(allowed_type)) ? "-- NONE --" : allowed_type
            );
            
            data.push({ 
                y:size,
                _records: records,
                events: {
                    click: function() {
                        me.showDrillDown(this._records,  title);
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
            title: { text: 'Delivery Effort (Actual Task Hours by Type)' },
            xAxis: {},
            yAxis: [{ 
                title: { text: 'Hours' }
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
            model: 'Task',
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
                dataIndex: 'WorkProduct',
                text: 'Work Product',
                flex:1,
                renderer: function(value,meta,record) {
                    if ( Ext.isEmpty(value) ) { return ""; }
                    return value.FormattedID + ": " + value.Name;
                }
            },
            {
                dataIndex: 'Estimate',
                text: 'Task Hours (Est)'
            },
            {
                dataIndex: 'Actuals',
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
