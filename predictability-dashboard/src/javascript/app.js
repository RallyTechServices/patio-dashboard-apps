Ext.define("PredictabilityApp", {
    extend: 'CA.techservices.app.ChartApp',

    descriptions: [
        "<strong>Predictability Dashboard</strong><br/>" +
            "<br/>" +
            "A team plans and commits to work effort during their Sprint Planning Meeting at the beginning of each sprint. The dashboard will allow the team to determine the effectiveness of planning / committing to work by examining the difference between their Planned and Actual Velocity (execution) in a sprint.<br/>" +
            "The top bar chart displays your total accepted points (actual velocity) in that sprint<br/>" +
            "The gold line graph displays the total points planned (planned velocity) in that sprint",
"<strong>Percentage of difference between planned and actual velocity</strong><br/>" +
            "<br/>" +
            "The orange line graph displays the % difference between planned and actual velocity for the sprint.<br/>" +
            "The green box represents the target variability of ±7.5%<br/>" +
            "The target variability can be set using the app settings."              
    ],
    
    integrationHeaders : {
        name : "PredictabilityApp"
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

                var artifacts_by_timebox = this._collectArtifactsByTimebox(results || []);
                this._makeTopChart(artifacts_by_timebox);
                this._makeBottomChart(artifacts_by_timebox);
                // this._makeRawBottomGrid(artifacts_by_timebox);
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

        var config = {
            model:'HierarchicalRequirement',
            limit: Infinity,
            filters: filters,
            fetch: ['FormattedID','Name','ScheduleState','Iteration','ObjectID','Defects',
                'PlanEstimate','Project','Release','AcceptedDate', start_field,end_field]
        };

        
        Deft.Chain.sequence([
            function() { 
                return TSUtilities.loadWsapiRecords(config);
            },
            function() { 
                return me._getStoriesFromSnapShotStore(type,timeboxes);
            },
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

    _getStoriesFromSnapShotStore:function(type,timeboxes){
        var me = this;
        var deferred = Ext.create('Deft.Deferred');
        var promises = [];
        Ext.Array.each(timeboxes,function(timebox){
            promises.push(function() { 
                return me._getDataFromSnapShotStore(type,timebox);
            });
        })

        Deft.Chain.sequence(promises,me).then({
            success: function(results) {
                console.log('_getStoriesFromSnapShotStore>>',results);
                deferred.resolve(Ext.Array.flatten(results));
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
        });


        return deferred;

    },

    _getDataFromSnapShotStore:function(type,timebox){
        var me = this;
        var deferred = Ext.create('Deft.Deferred');

        var find = {
                        "_TypeHierarchy": "HierarchicalRequirement"
                    };

        var start_field = "StartDate";
        if ( type == "Release" ) {
            start_field = "ReleaseStartDate";
            find["Release"] = timebox.get('ObjectID');
        }else{
            find["Iteration"] = timebox.get('ObjectID');
        }
        
        var second_day = new Date(timebox.get(start_field));
        second_day.setDate(second_day.getDate() + 1) // add a day to start date to get the end of the day.      

        find["__At"] = second_day;

        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', {
            "fetch": [ "ObjectID","Name","PlanEstimate","Project","Iteration","Release"],
            "find": find,
            "sort": { "_ValidFrom": -1 },
            //useHttpPost:true,
             "hydrate": ["Project","Iteration","Release"]
        });

        snapshotStore.load({
            callback: function(records, operation) {
                this.logger.log('Lookback recs',records);
                deferred.resolve(records);
            },
            scope:this
        });
    
        return deferred;
    },

    
    /* 
     * returns a hash of hashes -- key is iteration name value is
     * another hash where the records key holds a hash
     *    the records hash has a key for each allowed value 
     *    which then provides an array of items that match the allowed value 
     *    and timebox
     * as in
     * { "iteration 1": { "records": { "av": [o,o,o] } , { "pv": [o,o,o] } } }
     * where as av is accepted velocity and pv is planned velocity
     */

    _collectArtifactsByTimebox: function(items) {
        //console.log('items >>', items);

        var me = this;
        var hash = {},
            timebox_type = this.timebox_type;

        
        if ( items[0].length === 0 && items[1].length === 0 ) { return hash; }
        
        var base_hash = {
            records: {
                av: [],
                pv: []
            }
        };

        Ext.Array.each(items[0], function(item){
            var timebox = item.get(timebox_type).Name;
            
            if ( Ext.isEmpty(hash[timebox])){
                
                hash[timebox] = Ext.Object.merge({}, Ext.clone(base_hash) );
            }
            hash[timebox].records.av.push(item);
          
        });

        Ext.Array.each(items[1], function(item){
            var timebox = item.get(timebox_type).Name;
            
            if ( Ext.isEmpty(hash[timebox])){
                
                hash[timebox] = Ext.Object.merge({}, Ext.clone(base_hash) );
            }
            hash[timebox].records.pv.push(item);
          
        });
        
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


    _getTopSeries: function(artifacts_by_timebox) {
        var series = [];
        
        // series for actual velocity
        series.push({
            name: 'Actual Velocity',
            color: CA.apps.charts.Colors.blue_dark,
            data: this._calculateTopMeasure(artifacts_by_timebox,'av'),
            type: 'column'              
        });


        // series for planned velocity
        series.push({
            name: 'Planned Velocity',
            color: CA.apps.charts.Colors.gold,
            data: this._calculateTopMeasure(artifacts_by_timebox,'pv'),
            type: 'line'              
        });
        
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

          var records = value.records[allowed_type] || [];
          var y_value = 0;

          Ext.Array.each(records,function(story){
              y_value += story.get('PlanEstimate') || 0;  
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

        return data;
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

    _getTopChartConfig: function() {
        var me = this;
        return {
            chart: { type:'column' },
            title: { text: 'Predictability - Plan Variance' },
             xAxis: {
                labels:{
                    rotation:this._rotateLabels()
                }
            },
           yAxis: { 
                min: 0,
                title: { text: 'Total Points' },
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
            // ,
            // tooltip: {
            //     formatter: function() {
            //         return '<b>'+ this.series.name +'</b>: '+ this.point.y;
            //     }
            // }
        }
    },



    _makeBottomChart: function(artifacts_by_timebox) {
        var me = this;

        var categories = this._getCategories(artifacts_by_timebox);

        var series = this._getBottomSeries(artifacts_by_timebox);
        var colors = CA.apps.charts.Colors.getConsistentBarColors();
        
        if ( this.getSetting('showPatterns') ) {
            colors = CA.apps.charts.Colors.getConsistentBarPatterns();
        }
        this.setChart({
            chartData: { series: series, categories: categories },
            chartConfig: this._getBottomChartConfig(),
            chartColors: colors
        },1);
        this.setLoading(false);
    },
    

    
    _getBottomSeries: function(artifacts_by_timebox) {
        var series = [];

        series.push({
            name: '% of Difference',
            data: this._calculateBottomMeasure(artifacts_by_timebox),
            color: '#FFD700' // Gold.
        });

        return series;
    },


    _calculateBottomMeasure: function(artifacts_by_timebox) {
        var me = this,
        data = [];
        
				Ext.Array.each(this.timeboxes, function(tb) {
					var timebox = tb.get('Name');
					var value = artifacts_by_timebox[timebox];

					if (Ext.isEmpty(value) ) {
						  data.push({ 
          	      y:0
            	});
							return;
					}

          var av_records = value.records.av || [];
          var pv_records = value.records.pv || [];
          var av_value = 0;
          var pv_value = 0;
          var y_value = 0;

          Ext.Array.each(av_records,function(story){
              av_value += story.get('PlanEstimate')  
          });

          Ext.Array.each(pv_records,function(story){
              pv_value += story.get('PlanEstimate')  
          });

          y_value = pv_value > 0 ? ((av_value - pv_value) / pv_value ) * 100 : 0;

          data.push({ 
              y: Math.round(y_value)
          });

      });

     	return data
    },    
    
    _getBottomChartConfig: function() {
        var me = this;
        return {
            chart: { type: 'line' },
            title: { text: 'Percentage of Difference between Planned and Actual Velocity' },
            xAxis: {
                title: { },
                labels:{
                    rotation:this._rotateLabels()
                }
            },
            yAxis: [{ 
                title: { text: 'Percentage' },
                plotBands: [{ 
                    from: me.getSetting('targetVariability'),
                    to: -1 * me.getSetting('targetVariability'),
                    color: CA.apps.charts.Colors.green,
                    label: {
                        text: 'Target Variability',
                        style: {
                            color: '#606060'
                        }
                    }
                }]
            }],
            plotOptions: {
                line: {
                    color: CA.apps.charts.Colors.orange,
                    dataLabels: {
                        enabled: true,
                        format: '{y} %',
                    },                    
                    pointStart: 0,
                    marker: {
                        enabled: true,
                        symbol: 'circle',
                        radius: 2,
                        states: {
                            hover: {
                                enabled: true
                            }
                        }
                    }
                }
            }
        }
    },

    _makeRawBottomGrid: function(artifacts_by_timebox) {
        var me = this;
        
        this.logger.log('_makeRawGrid', artifacts_by_timebox);
       
        var columns = [{dataIndex:'Name',text:'Counts',flex:2}];
        Ext.Array.each(this._getCategories(artifacts_by_timebox), function(field){
            columns.push({ dataIndex: me._getSafeIterationName(field) + "_number", 
                            text: field, 
                            align: 'center',
                            flex:1,
                            renderer: function(value,metaData){
                                if("TotalTCStoryCount"==metaData.record.get('Type') && value < me.getSetting('gridThreshold')){
                                     metaData.style = 'text-align:center;background-color:#ff9999';    
                                }
                                return value;
                            }
                        });
        });
        
        this.logger.log('about to get Raw Rows');
        var rows = this._getRawBottomRows(artifacts_by_timebox);
        
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
        },1);

    },
    
    _getRawBottomRows: function(artifacts_by_timebox) {
        var me = this;
        // sprint objects have key = name of sprint
        
        var row_fields = this._getCategories(artifacts_by_timebox);
         
        this.logger.log('row_fields', row_fields);
        
        var rows = [
            {Type:'TotalStoryCount', Name: 'Testable Stories'},
            {Type:'TotalTCStoryCount',  Name: 'Stories w/ Test Case' },
            {Type:'TotalTCPassStoryCount', Name: 'Stories w/ Test Cases All Pass' }
        ];

        // Ext.Array.each(this._getSeries(artifacts_by_timebox),function(rowname){
        //     rows.push({Type:rowname.name,Name:rowname.name});
        // })
        // set up fields
        
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

              
                row[sprint_name + "_number"] = me._getBottomSize(value,type); 
                
            });
        });
        
        return rows;
    },


    _getBottomSize:function(value,type){

            var size = 0;

            if('TotalStoryCount' == type){
                size = value.records.all.length;
            }else if('TotalTCStoryCount' == type){
                size = value.records.with_test_cases.length;
            }else if('TotalTCPassStoryCount' == type){
                Ext.Array.each(value.records.with_test_cases, function(story){
                    if("ALL_RUN_ALL_PASSING" == story.get('TestCaseStatus')){
                        size += 1;
                    }    
                }); 
            }

            return size;
    },


    _getCategories: function(artifacts_by_timebox) {
//        return Ext.Object.getKeys(artifacts_by_timebox);
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
            },
            {
                xtype: 'rallynumberfield',
                name: 'targetVariability',
                itemId: 'targetVariability',
                fieldLabel: 'Target Variability (+/-)',
                margin: '0 0 25 25',
                width: 150,
                allowBlank: false,  // requires a non-empty value
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
            },
            {
                dataIndex: 'TestCaseCount',
                text: 'Test Case Count',
                flex: 1
            },
            {
                dataIndex: 'TestCaseStatus',
                text: 'Test Case Status',
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
