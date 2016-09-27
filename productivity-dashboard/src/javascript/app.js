Ext.define("ProductivityApp", {
    extend: 'CA.techservices.app.ChartApp',

    descriptions: [
        "<strong>Productivity Dashboard</strong><br/>" +
            "<br/>" +
            "Velocity is the amount of work completed during each project or team’s sprint. The dashboard will allow the user to determine the number of points accepted in a sprint and if the effort allocated was from user Stories (new and unfinished work) or Defects.<br/>" +
            "The top stacked bar chart displays total points stacked by story, split story or defect points accepted in that sprint<br/>" +
            "The gray line is the average velocity for all sprints displayed in the dashboard"              
    ],
    
    integrationHeaders : {
        name : "ProductivityApp"
    },
    
    config: {
        chartLabelRotationSettings:{
            rotateNone: 0,
            rotate45: 10,
            rotate90: 15 
        },
        defaultSettings: {
            showPatterns: false,
            targetVariability: 50
        }
    },
    
    launch: function() {
        this.callParent();
        this._addSelectors();
        this._updateData();
    },

    _addSelectors: function() {

        this.timebox_limit = 10;
        this.addToBanner({
            xtype: 'rallynumberfield',
            name: 'timeBoxLimit',
            itemId: 'timeBoxLimit',
            fieldLabel: 'Timebox Limit',
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
    
    _updateData: function() {
        var me = this;
        this.metric = "size";
//        this.timebox_type = 'Iteration';
        
        Deft.Chain.pipeline([
            this._fetchTimeboxes,
            this._sortTimeboxes,
            this._fetchArtifactsInTimeboxes
        ],this).then({
            scope: this,
            success: function(results) {
//								this._sortObjectsbyTBDate(results);
                var artifacts_by_timebox = this._collectArtifactsByTimebox(results || []);
                this._makeTopChart(artifacts_by_timebox);
                this._makeRawTopGrid(artifacts_by_timebox);
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
                
        var start_field = "StartDate";
        var end_field = "EndDate";

        if ( type == "Release" ) {
            start_field = "ReleaseStartDate";
            end_field   = "ReleaseDate";
        }   

        this.setLoading("Fetching timeboxes...");
                
        var config = {
            model: type,
            limit: this.timebox_limit,
            pageSize: this.timebox_limit,
            fetch: ['Name','ObjectID',start_field,end_field],
            filters: [{property:end_field, operator: '<=', value: Rally.util.DateTime.toIsoString(new Date)}],
            sorters: [{property:end_field, direction:'DESC'}],
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
        var end_date_field = TSUtilities.getEndFieldForTimeboxType(this.timebox_type);
      
        Ext.Array.sort(timeboxes, function(a,b){
            if ( a.get(end_date_field) < b.get(end_date_field) ) { return -1; }
            if ( a.get(end_date_field) > b.get(end_date_field) ) { return  1; }
            return 0;
        }); 
        
				this.timeboxes = timeboxes;        
        return timeboxes;
    },

    _fetchArtifactsInTimeboxes: function(timeboxes) {
        var me = this;
        if ( timeboxes.length === 0 ) { return; }
        
        var type = this.timebox_type;
        
        var start_field = "StartDate";
        var end_field = "EndDate";
        if ( type == "Release" ) {
            start_field = "ReleaseStartDate";
            end_field   = "ReleaseDate";
        }
        
        var deferred = Ext.create('Deft.Deferred');
        var first_date = timeboxes[0].get(start_field);
        var last_date = timeboxes[timeboxes.length - 1].get(end_field);

        var filters = [
            {property: type + '.' + start_field, operator: '>=', value:first_date},
            {property: type + '.' + end_field, operator: '<=', value:last_date}
        ];
        
        filters = Rally.data.wsapi.Filter.and(filters).and({property: 'ScheduleState', operator: '>=', value: 'Accepted'});

        var config1 = {
            model:'HierarchicalRequirement',
            limit: Infinity,
            filters: filters,
            fetch: ['FormattedID','Name','ScheduleState','Iteration','ObjectID','Defects',
                'PlanEstimate','Project','Release','AcceptedDate', 'TaskEstimateTotal',start_field,end_field]
        };


        var config2 = {
            model:'Defect',
            limit: Infinity,
            filters: filters,
            fetch: ['FormattedID','Name','ScheduleState','Iteration','ObjectID','Defects',
                'PlanEstimate','Project','Release','AcceptedDate','TaskEstimateTotal', start_field,end_field]
        };
        
        Deft.Chain.sequence([
            function() { 
                return TSUtilities.loadWsapiRecords(config1);
            },
            function() { 
                return TSUtilities.loadWsapiRecords(config2);
            }            
        ],this).then({
            success: function(results) {
                deferred.resolve(results);
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
     * { "iteration 1": { "records": { "Stories": [o,o,o] } , { "Split_Stories": [o,o,o] }, { "Defects": [o,o,o] } } }
     * 
     */

    _collectArtifactsByTimebox: function(items) {
        this.logger.log('_collectArtifactsByTimebox', items);    	
       
        var me = this;
        var hash = {},
            timebox_type = this.timebox_type;

        
        if ( items[0].length === 0 ) { return hash; }
        
        var base_hash = {
            records: {
                Stories: [],
                Split_Stories: [],
                Defects:[]
            }
        };

        var total_velocity = 0;
        var total_length = 0;

        Ext.Array.each(items[0], function(item){
            total_velocity += item.get('PlanEstimate');

            var timebox = item.get(timebox_type).Name;
            
            if ( Ext.isEmpty(hash[timebox])){
                total_length += 1;
                hash[timebox] = Ext.Object.merge({}, Ext.clone(base_hash) );
            }
            if(me._getTypeFromName(item.get('Name')) == "standard"){
                hash[timebox].records.Stories.push(item);
            }else{
                hash[timebox].records.Split_Stories.push(item);
            }
            
          
        });
       
        Ext.Array.each(items[1], function(item){
            total_velocity += item.get('PlanEstimate');

            var timebox = item.get(timebox_type).Name;
            
            if ( Ext.isEmpty(hash[timebox])){
                total_length += 1;                
                hash[timebox] = Ext.Object.merge({}, Ext.clone(base_hash) );
            }
            hash[timebox].records.Defects.push(item);
          
        });
        me.averageVelocity = total_velocity / total_length;
        return hash;
    },

   
    _makeTopChart: function(artifacts_by_timebox) {
        var me = this;

        var categories = this._getCategories(artifacts_by_timebox);

        var series = this._getTopSeries(artifacts_by_timebox);
        var colors = CA.apps.charts.Colors.getConsistentBarColors();
        
        if ( this.getSetting('showPatterns') ) {
            colors = CA.apps.charts.Colors.getConsistentBarPatterns();
        }
        this.setChart({
            chartData: { series: series, categories: categories },
            chartConfig: this._getTopChartConfig(),
            chartColors: colors
        },0);
        this.setLoading(false);
    },


    _rotateLabels: function(){
        
        var rotationSetting = 0;

        if (this.timebox_limit <= this.chartLabelRotationSettings.rotate45) {
            rotationSetting = 0;
        } else if (this.timebox_limit <= this.chartLabelRotationSettings.rotate90){
            rotationSetting =  45;
        } else { // full vertical rotation for more than 10 items (good for up-to about 20)
            rotationSetting =  90;
        }
        
        return rotationSetting;
    },

    _getTopSeries: function(artifacts_by_timebox) {
        var me = this;
        var allowed_types = ['Stories','Split_Stories','Defects']
        var series = [];
        
        Ext.Array.each(allowed_types,function(allowed_type){

            series.push({
                name: allowed_type,
                data: me._calculateTopMeasure(artifacts_by_timebox,allowed_type),
                type: 'column',             
								stacking: 'normal'
            });

        });
        // series for actual velocity
        
        return series;
    },


    _calculateTopMeasure: function(artifacts_by_timebox,allowed_type) {
        var me = this,
            data = [];
 
 
	 			Ext.Array.each(this.timeboxes, function(tb) {
					var timebox = tb.get('Name');
					var value = artifacts_by_timebox[timebox];
					if (Ext.isEmpty(value) ) {
						  data.push({ 
	                y:0,
	                _records: []
	            });
							return;
					}

///       Ext.Object.each(artifacts_by_timebox, function(timebox, value){
            var records = value.records[allowed_type] || [];
            var y_value = 0;

            Ext.Array.each(records,function(story){
                y_value += story.get('PlanEstimate') ; 
            });

            data.push({ 
                y:y_value,
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

    _getTopChartConfig: function() {
        var me = this;
        return {
            chart: { type:'column' },
            title: { text: 'Accepted Story/Defect Count and Size' },
            xAxis: {
                labels:{
                    rotation:this._rotateLabels()
                }
            },
            yAxis: { 
                min: 0,
                title: { text: 'Total Points' },
                plotLines: [{ 
                    value: me.averageVelocity,
                    color: CA.apps.charts.Colors.blue_dark,
                    width: '1',
                    zIndex: 5,
                    label: {
                        text: 'Average Velocity ' + Ext.util.Format.number(me.averageVelocity,"000.00"),
                        style: {
                            color: '#606060'
                        }
                    }
                }],                
                stackLabels: {
                    enabled: true,
                    style: {
                        fontWeight: 'bold',
                        color: 'gray'
                    }
                }   
            },
            plotOptions: {
                stacking: 'normal',
                dataLabels: {
                    enabled: true,
                    color:'gray',
                    style: {
                        textShadow: '0 0 3px black'
                    },
                    format: '{y}',
                },                
                column: {
                    grouping: false,
                    shadow: false,
                    borderWidth: 0
                }
            }
        }
    },

    
 
    _makeRawTopGrid: function(artifacts_by_timebox) {
        var me = this;
        
        this.logger.log('_makeRawGrid', artifacts_by_timebox);
       
        var columns = [{dataIndex:'Name',text:'',flex:2}];
        Ext.Array.each(this._getCategories(artifacts_by_timebox), function(field){
            columns.push({ dataIndex: me._getSafeIterationName(field) + "_number", 
                            text: field, 
                            align: 'center',
                            flex:1,
                            renderer: function(value,metaData){
                                return value;
                            }
                        });
        });
        
        this.logger.log('about to get Raw Rows');
        var rows = this._getRawTopRows(artifacts_by_timebox);
        
        this.logger.log('about to create store', rows);
        var store = Ext.create('Rally.data.custom.Store',{ data: rows });
        
        this.logger.log('about to add', store, columns);

        this.setGrid({
            xtype:'rallygrid',
            padding: 5,
            showPagingToolbar: false,
            enableEditing: false,
            showRowActionsColumn: false,     
            store: store,
            columnCfgs: columns
        },0);

    },
    
    _getRawTopRows: function(artifacts_by_timebox) {
        var me = this;
        // sprint objects have key = name of sprint
        
        var row_fields = this._getCategories(artifacts_by_timebox);
         
        this.logger.log('row_fields', row_fields);
        
        var rows = [
            {Type:'AcceptedDefectPoints', Name: 'Accepted Defect Points'},
            {Type:'AcceptedSplitStoryPoints',  Name: 'Accepted Split Story Points' },
            {Type:'AcceptedStoryPoints', Name: 'Accepted Story Points' },
            {Type:'TotalAcceptedPoints', Name: 'Total Accepted Points' },
            {Type:'StoryDefectCount', Name: 'Story/Defect Count' },
            {Type:'AverageStorySize', Name: 'Average Story Size (Pts)' },
            {Type:'HoursPerPoint', Name: 'Hours per Point' }
        ];

        Ext.Array.each(rows, function(row) {
            Ext.Array.each(row_fields, function(field){
                field = me._getSafeIterationName(field);
                row[field] = [];
                row[field + "_number"] = 0;
            });
        });
        
        this.logger.log('rows >>',rows);

        Ext.Array.each(rows, function(row){
            var type = row.Type;
            Ext.Object.each(artifacts_by_timebox, function(sprint_name,value){
                sprint_name = me._getSafeIterationName(sprint_name);

              
                row[sprint_name + "_number"] = me._getTopSize(value,type); 
                
            });
        });
        
        return rows;
    },


    _getTopSize:function(value,type){

            var size = 0;

            if('AcceptedDefectPoints' == type){
                Ext.Array.each(value.records.Defects, function(defect){
                    size += defect.get('PlanEstimate');
                }); 
            }else if('AcceptedSplitStoryPoints' == type){
                Ext.Array.each(value.records.Split_Stories, function(story){
                    size += story.get('PlanEstimate');
                }); 
            }else if('AcceptedStoryPoints' == type){
                Ext.Array.each(value.records.Stories, function(story){
                    size += story.get('PlanEstimate');
                }); 
            }else if('TotalAcceptedPoints' == type){
                Ext.Array.each(value.records.Defects, function(defect){
                    size += defect.get('PlanEstimate');
                });
                Ext.Array.each(value.records.Split_Stories, function(story){
                    size += story.get('PlanEstimate');
                });                                  
                Ext.Array.each(value.records.Stories, function(story){
                    size += story.get('PlanEstimate');
                }); 
            }else if('StoryDefectCount' == type){
                size = value.records.Defects.length + value.records.Split_Stories.length + value.records.Stories.length;
            }else if('TotalAcceptedPoints' == type){
                total_points = 0;
                Ext.Array.each(value.records.Defects, function(defect){
                    total_points += defect.get('PlanEstimate');
                });
                Ext.Array.each(value.records.Split_Stories, function(story){
                    total_points += story.get('PlanEstimate');
                });                                  
                Ext.Array.each(value.records.Stories, function(story){
                    total_points += story.get('PlanEstimate');
                }); 

                total_count = value.records.Defects.length + value.records.Split_Stories.length + value.records.Stories.length;

                size = total_count > 0 ? total_points / total_count : 0
            }else if('HoursPerPoint' == type){
                total_points = 0;
                total_hours = 0;
                Ext.Array.each(value.records.Defects, function(defect){
                    total_points += defect.get('PlanEstimate');
                    total_hours += defect.get('TaskEstimateTotal');
                });
                Ext.Array.each(value.records.Split_Stories, function(story){
                    total_points += story.get('PlanEstimate');
                    total_hours += story.get('TaskEstimateTotal');
                });                                  
                Ext.Array.each(value.records.Stories, function(story){
                    total_points += story.get('PlanEstimate');
                    total_hours += story.get('TaskEstimateTotal');
                }); 

                size = total_hours > 0 ? Ext.util.Format.round(total_points / total_hours,2) : 0
            }

            return size;
    },

    _getTypeFromName: function(name) {
        if ( /\[Continued\]/.test(name) &&  /\[Unfinished\]/.test(name) ) {
            return 'multiple';
        }
        if ( /\[Continued\]/.test(name) ) {
            return 'continued';
        }
        
        if ( /\[Unfinished\]/.test(name) ) {
            return 'unfinished';
        }
        
        return 'standard';
    },

    _getCategories: function(artifacts_by_timebox) {
				return Ext.Array.map(this.timeboxes, function(timebox) {

					return timebox.get('Name');

			});
    },

    getSettingsFields: function() {
        var me = this;
        return [
            { 
                name: 'showPatterns',
                xtype: 'rallycheckboxfield',
                boxLabelAlign: 'after',
                fieldLabel: '',
                margin: '0 0 25 25',
                boxLabel: 'Show Patterns<br/><span style="color:#999999;"><i>Tick to use patterns in the chart instead of color.</i></span>'
/*
            },
            {
                xtype: 'rallynumberfield',
                name: 'targetVariability',
                itemId: 'targetVariability',
                fieldLabel: 'Target Variability (+/-)',
                margin: '0 0 25 25',
                width: 150,
                allowBlank: false,  // requires a non-empty value
*/
            }                 
        ];
    },
    
    getDrillDownColumns: function(title) {
        var columns = [
            {
                dataIndex : 'FormattedID',
                text: "id"
            },
            {
                dataIndex : 'Name',
                text: "Name",
                flex: 2
            },
            {
                dataIndex: 'AcceptedDate',
                text: 'Accepted Date',
                flex:1
            },
            {
                dataIndex: 'PlanEstimate',
                text: 'Plan Estimate'
            },
            {
                dataIndex: 'Iteration',
                text: 'Iteration',
                renderer:function(Iteration){
                        return Iteration.Name;
                }                
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
    },
    /*
     * having a dot in the name for the key of a hash causes problems
     */
    _getSafeIterationName: function(name) {
        return name.replace(/\./,'&#46;'); 
    },
    
    _getUnsafeIterationName: function(name) {
        return name.replace(/&#46;/,'.');
    },

    fetchWsapiCount: function(model, query_filters){
        var deferred = Ext.create('Deft.Deferred');

        Ext.create('Rally.data.wsapi.Store',{
            model: model,
            fetch: ['ObjectID'],
            enablePostGet: true,
            filters: query_filters,
            limit: 1,
            pageSize: 1
        }).load({
            callback: function(records, operation, success){
                if (success){
                    deferred.resolve(operation.resultSet.totalRecords);
                } else {
                    deferred.reject(Ext.String.format("Error getting {0} count for {1}: {2}", model, query_filters.toString(), operation.error.errors.join(',')));
                }
            }
        });
        return deferred;
    },
    
});
