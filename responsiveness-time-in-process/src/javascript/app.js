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
            "<br/>(1) This app only looks at data in the selected project (Team).  Parent/Child scoping and data aggregation (rollups) are not supported.",
    
            
    integrationHeaders : {
        name : "TSResponsivenessTiP"
    },
    
    config: {
        defaultSettings: {
            showPatterns: false,
        }
    },
                        
    launch: function() {
        this.callParent();
        
                this.timebox_limit = 10;
                this.timebox_type = 'Iteration';
                
                this._addSelectors();
                this._updateData();
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

        this._makeChart(artifacts_by_timebox);
            },
            failure: function(msg) {
                Ext.Msg.alert('--', msg);
            }
        });
        
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

				if (timeboxes === 'undefined' || timeboxes.length === 0) { 
            Ext.Msg.alert('', 'The project you selected does not have any ' + this.timebox_type + 's');
            this.setLoading(false);					
						return [];
				}

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

				for (i=0; i < records.length; i++) { 
					records[i].sort_field = records[i]['data'][this.timebox_type][end_date_field];
					};
     
        Ext.Array.sort(records, function(a,b){      	
            if ( a.sort_field < b.sort_field ) { return -1; }
            if ( a.sort_field > b.sort_field ) { return  1; }
            return 0;
        }); 
        
        return records;

    },
    
    _fetchArtifactsInTimeboxes: function(timeboxes) {
        if ( timeboxes.length === 0 ) { return; }
 
        var type = this.timebox_type;
        
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
                
        if ( items.length === 0 ) { return hash; }
     
        var base_hash = {
            records: { all: []},
            tip_values: [],
            median: 0
        };
       
				for (i=0; i < items.length; i++) { 
            var timebox = items[i].get(timebox_type).Name;
            var end_date = items[i].get('AcceptedDate');
		        var start_date = items[i].get('InProgressDate');
		        
		        var responsiveness_value = Rally.technicalservices.util.Utilities.daysBetweenWithFraction(start_date,end_date,true);

						items[i].tip = responsiveness_value;
     
            if ( Ext.isEmpty(hash[timebox])){
                
//                hash[timebox] = Ext.clone(base_hash);
                hash[timebox] = Ext.Object.merge({}, Ext.clone(base_hash) );
            }
            hash[timebox].records.all.push(items[i]);
            hash[timebox].tip_values.push(responsiveness_value);

					};
					
// calculate and push median value into hash            
					Ext.Object.each(hash, function (key, value) {
						Ext.Object.each(value, function (entry) {
							var median_value = 0;

					    value.tip_values.sort( function(a,b) {return a - b;} );
					
					    var half = Math.floor(value.tip_values.length/2);
					
					    if(value.tip_values.length % 2)
					        median_value = value.tip_values[half];
					    else
					        median_value = (value.tip_values[half-1] + value.tip_values[half]) / 2.0;

	            value['median'] = median_value;
						});					        					        
					});

        return hash;
    },
        
    _makeChart: function(artifacts_by_timebox) {
        var me = this;
        var categories = this._getCategories(artifacts_by_timebox);
        var datapoints = this._getdataPoints(artifacts_by_timebox);		
        var colors = CA.apps.charts.Colors.getConsistentBarColors();
        
        if ( this.getSetting('showPatterns') ) {
            colors = CA.apps.charts.Colors.getConsistentBarPatterns();
        }

        this.setChart({
		        	chartData: {
		                        categories: categories,
		                        series: [{
		                        	name: 'Median Days in Process', 
		                        	data: datapoints
		                         	}]
		                     },
		        chartConfig: { 
		          							chart: {type: 'column'},
		                        title: {text: 'Responsiveness (Stories)'},
		                        subtitle: {text: 'Time in Process (P50)'},
		                        xAxis: {},
		                        yAxis: {title: {text: 'Days'}},
		                        plotOptions: {
		                            column: {stacking: 'normal'}
		                        },
		                        tooltip: {
								                formatter: function() {
		                    					return '<b>'+ Ext.util.Format.number(this.point.y, '0.##')+ '</b>: ';
		                						} 
		             						}
		                     },
					  chartColors: colors                                 
		                       
				});
        this.setLoading(false);
			},

    _getCategories: function(artifacts_by_timebox) {
        return Ext.Object.getKeys(artifacts_by_timebox);
    },
    
    _getdataPoints: function(artifacts_by_timebox) {
    		var me = this;
    		var datapoints = [];
        Ext.Object.each(artifacts_by_timebox, function (key, value) {
        	var records = value.records || [];
        	datapoints.push({
        		y: value.median,
        		_records: records,
						events: {
   					click: function () {
   						me.showDrillDown(this._records.all,  "Median Time in Process (Stories P50) for " + key + ": " + Ext.util.Format.number(this.y, '0.##'));
   						}
						}      		
        	});
        });
        	
       return datapoints;
    },
    
    getSettingsFields: function() {
        return [
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
                dataIndex: 'tip',
                text: 'Time (Days) in Process',
                flex: 2,
                renderer: function(value,meta,record) {
//                    if ( Ext.isEmpty(value) ) { return "X"; }
                    return record.tip;
                }
            },
            {
                dataIndex: 'Project',
                text: 'Project',
                renderer:function(Project){
                        return Project.Name;
                },
                flex: 3
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
