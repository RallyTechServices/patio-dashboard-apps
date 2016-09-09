Ext.define("TSResponsivenessTiP", {
    extend: 'CA.techservices.app.ChartApp',

    description: "<strong>Responsiveness - Time in Process</strong><br/>" +
            "<br/>" +
            "Accurate planning and budgeting requires accurate work estimates. " + 
            "Time in Process P50 shows how long the median of Stories are in process. " +
            "<p/>" +
            "Time in Process is the number of business days a typical user story is in the 'In-progress' " + 
            "or 'Completed' column. Similar to lead time, cycle time, and time to market. " +
            "<p/>" +
            "Click on a bar to see a table with the stories and TiP for the team in that timebox." +
            "<p/>" +
            "<strong>Notes:</strong>" +
            "<br/>(1) ",
    
            
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
//        this._getAllowedValues('Task',this.getSetting('typeField')).then({
//            scope: this,
//            success: function(values) {
//                this.allowed_types = values;

                this.timebox_limit = 10;
//                this.timebox_type = 'Iteration';
                this.timebox_type = 'Release';
                
                this._addSelectors();
                this._updateData();
//            },
//            failure: function(msg) {
//                Ext.Msg.alert('Problem loading allowed values', msg);
//            }
//        });
    },

    _addSelectors: function() {

        this.addToBanner({
            xtype: 'rallynumberfield',
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
               
				this._sortObjectsbyTBDate(results);

        var artifacts_by_timebox = this._collectArtifactsByTimebox(results || []);

                this.clearAdditionalDisplay();

//                this._makeGrid(artifacts_by_timebox);

                this._makeChart(artifacts_by_timebox);
            },
            failure: function(msg) {
                Ext.Msg.alert('--', msg);
            }
        });
        
    },

    _makeGrid: function(artifacts_by_timebox) {
        var me = this;
        
        var columns = [{dataIndex:'Name',text:'Task Type',flex:1}];
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

                Ext.Array.each(all_records, function(record){
                    var value = record.get('Actuals') || 0;
                    all_actual_hours_total = all_actual_hours_total + value;
                });  

                Ext.Array.each(row[sprint_name], function(record){
                    var value = record.get('Actuals') || 0;
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

        this.logger.log("_fetchTimeboxes");

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

        this.setLoading("Fetching timeboxes...");
        this.logger.log("_sortTimeboxes IN", timeboxes);
       
        var end_date_field = TSUtilities.getEndFieldForTimeboxType(this.timebox_type);
      
        Ext.Array.sort(timeboxes, function(a,b){
            if ( a.get(end_date_field) < b.get(end_date_field) ) { return -1; }
            if ( a.get(end_date_field) > b.get(end_date_field) ) { return  1; }
            return 0;
        }); 
        
        return timeboxes;

    },

    _sortObjectsbyTBDate: function(records) {
    	
        var end_date_field = TSUtilities.getEndFieldForTimeboxType(this.timebox_type);
//        this.logger.log("_sortObjectsbyTBDate IN", records, this.timebox_type, end_date_field);

				for (i=0; i < records.length; i++) { 
					records[i].sort_field = records[i]['data'][this.timebox_type][end_date_field];
					};
     
        Ext.Array.sort(records, function(a,b){      	
            if ( a.sort_field < b.sort_field ) { return -1; }
            if ( a.sort_field > b.sort_field ) { return  1; }
            return 0;
        }); 
        
//        this.logger.log("_sortObjectsbyTBDate OUT", records);

        return records;

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
        
        var filters = [
            {property: type + '.' + start_field, operator: '>=', value:first_date},
            {property: type + '.' + end_field, operator: '<=', value:last_date},
            {property:'AcceptedDate', operator: '!=', value: null }
        ];
        
        var config = {
            model:'HierarchicalRequirement',
            limit: Infinity,
            filters: filters,
            fetch: ['FormattedID','Name','ScheduleState','Iteration','ObjectID',
                'PlanEstimate','Project','Release','InProgressDate','AcceptedDate',
                'StartDate','EndDate','ReleaseStartDate','ReleaseDate'],
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
            timebox_type = this.timebox_type;
            type_field = this.getSetting('typeField'),
            allowed_types = this.allowed_types;
                
        if ( items.length === 0 ) { return hash; }
     
        var base_hash = {
            records: []
        };

//this.logger.log("_collectArtifactsByTimebox 1", items, items.length, timebox_type, hash, base_hash);
       
				for (i=0; i < items.length; i++) { 
            var timebox = items[i].get(timebox_type).Name;
            var end_date = items[i].get('AcceptedDate');
		        var start_date = items[i].get('InProgressDate');
		        
		        var responsiveness_value = Rally.technicalservices.util.Utilities.daysBetweenWithFraction(start_date,end_date,true);

						items[i].responsiveness_value  = responsiveness_value;

            if ( Ext.isEmpty(hash[timebox])){
                
                hash[timebox] = Ext.Object.merge({}, Ext.clone(base_hash) );
            }

            hash[timebox].records.push(items[i]);

					};
            
this.logger.log("_collectArtifactsByTimebox OUT", hash);

        return hash;
    },
    
    _makeChart: function(artifacts_by_timebox) {
        var me = this;

        var categories = this._getCategories(artifacts_by_timebox);
				var timeboxes = categories;      

        var series = this._getSeries(artifacts_by_timebox, categories);
        var colors = CA.apps.charts.Colors.getConsistentBarColors();
        
        if ( this.getSetting('showPatterns') ) {
            colors = CA.apps.charts.Colors.getConsistentBarPatterns();
        }
        this.setChart({
            chartData: { 
            	series: series, 
            	categories: categories },
            chartConfig: this._getChartConfig(),
            chartColors: colors
        });
        this.setLoading(false);
    },
    
    _getSeries: function(artifacts_by_timebox) {
this.logger.log("_getSeries IN", artifacts_by_timebox, artifacts_by_timebox.length);
        var series = [];
       
//        Ext.Object.each(artifacts_by_timebox, function(timebox) {
				for (i=0; i < artifacts_by_timebox.length; i++) {
					var responsiveness = [];
this.logger.log("_getSeries 1", i);
					for (j=0; j < i.length; j++) {
this.logger.log("_getSeries 1", i,j);//        	Ext.Object.each(timebox, function(records) {
						for (k=0; k < j.length; k++) {

//						Ext.Array.each(records, function(item) { });
this.logger.log("_getSeries 1", i,j,k);
// 						responsiveness.push(item['responsiveness_value']);
						};
 					};
 				};
this.logger.log("_getSeries 2", responsiveness);
        	
//        	var data_element = artifacts_by_timebox[item]['records'].length;
//        	var data_element = this._calculateMeasure(artifacts_by_timebox,item);
         
            series.push({
                name: item,
                data: data_element,
//                data: this._calculateMeasure(artifacts_by_timebox, item),
                type: 'column'
//                stack: 'a'
            }); 
this.logger.log("_getSeries OUT", series);

        return series;
    },
    
    _calculateMeasure: function(artifacts_by_timebox, item) {
//this.logger.log("_calculateMeasure IN", artifacts_by_timebox, item);
        var me = this,
            data = [];
        
        Ext.Object.each(artifacts_by_timebox, function(timebox){
        		     	
						Ext.Object.each(timebox, function(item) {
						});
/*
function median(values) {

    values.sort( function(a,b) {return a - b;} );

    var half = Math.floor(values.length/2);

    if(values.length % 2)
        return values[half];
    else
        return (values[half-1] + values[half]) / 2.0;
}
*/


//
/*  old stuff        	
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
*/
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
            title: { text: 'Responsiveness - Time in Process (P50)' },
            xAxis: categories,
            yAxis: [{ 
            		data: data,
                title: { text: 'Days' }
            }],
            plotOptions: {
                column: {
                    stacking: 'normal'
                }
            },
            tooltip: {
                formatter: function() {
 //                   return '<b>'+ this.series.name +'</b>: '+ Ext.util.Format.number(this.point.y, '0.##');
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
                flex: 2,
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
