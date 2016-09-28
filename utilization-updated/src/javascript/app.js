Ext.define("TSUtilization", {
    extend: 'CA.techservices.app.ChartApp',

    descriptions: [
        "<strong>Utilization Chart</strong><br/>" +
            "<br/>" +
            "The Utilization Chart app measures total estimated task hours in an iteration, " +
						"divided by the sum of the team members' capacity for the iteration, to get a " +
						"utilization rating that can be intuitively read by any stakeholders " +
						"as a percentage." +
            "<p/>" +
						"The purpose of the Utilization Chart is to help teams focus on their " +
						"cadence and help to keep them from incurring the quality issues that " +
						"can occur when they are over committed. If the team is too far over " +
						"or under 100% utilization, that information can be used as a cue to " +
						"make needed improvements to iteration backlog grooming and planning." +
            "<p/>" +
						"The chart can also help to identify problems where teams are " +
						"under-committed due to poor planning or scope change." +
            "<p/> " +
        "<strong>Notes:</strong><br/>" +
            "<ol/>" +
            "<li>Data is shown for the current project only.  " +
            "Sub-projects are not included.</li>" +
            "<li>User Iteration Capacities must be set on the Track >> Team Status page).</li>" +
            "<li>If an Iteration has NO Task Estimates AND/OR NO Team Capacity, no bar will be shown</li>" +
            "</ol>"
    ],
    
    integrationHeaders : {
        name : "TSUtilization"
    },
    
    config: {
        chartLabelRotationSettings:{
            rotateNone: 0,
            rotate45: 10,
            rotate90: 15 
        },
        defaultSettings: {
            showPatterns: false
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
        });

//        this._updateData();
    },
    
    _updateData: function() {
        var me = this;
        this.timebox_type = "Iteration";
        
        Deft.Chain.pipeline([
            this._fetchTimeboxes,
            this._sortTimeboxes,
            this._fetchArtifactsInTimeboxes
        ],this).then({
            scope: this,
            success: function(results) {            	
                var artifacts_by_timebox = this._collectArtifactsByTimebox(results || []);
//                deferred.resolve(Ext.Array.flatten(results));
                this._makeTopChart(artifacts_by_timebox);
            },
            failure: function(msg) {
                Ext.Msg.alert('--', msg);
            }
        });
        
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
            fetch: ['Name','TaskEstimateTotal',start_date_field,end_date_field],
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
        if ( timeboxes.length === 0 ) { return; }
        
        var start_field = TSUtilities.getStartFieldForTimeboxType(this.timebox_type);
        var end_field = TSUtilities.getEndFieldForTimeboxType(this.timebox_type);
        
        var first_date = timeboxes[0].get(start_field);
        var last_date = timeboxes[timeboxes.length - 1].get(end_field);
        
        var filters = [
            {property: this.timebox_type + '.' + start_field, operator: '>=', value:first_date},
            {property: this.timebox_type + '.' + end_field, operator: '<=', value:last_date}
				];
        
        var config = {
            model:'UserIterationCapacity',
            limit: Infinity,
            filters: filters,
            fetch: ['Capacity','User','Iteration','Name','TaskEstimateTotal', start_field, end_field]
        };
        
        return TSUtilities.loadWsapiRecords(config);
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
				me = this;
        var hash = {};
                
        if ( items.length === 0 ) { return hash; }

        var base_hash = {
            TaskEstimateTotal: 0,
            UserIterationCapacitySum: 0,
            StartDate: '',
            EndDate: ''
            };

        Ext.Array.each(items, function(item){
            var timebox = item['data']['Iteration']['Name'];

            if ( Ext.isEmpty(hash[timebox])){
                hash[timebox] = Ext.Object.merge({}, Ext.clone(base_hash) );
            }
        
            hash[timebox].TaskEstimateTotal = item['data']['Iteration']['TaskEstimateTotal'];
            hash[timebox].StartDate = item['data']['Iteration']['StartDate'];
            hash[timebox].EndDate = item['data']['Iteration']['EndDate'];
						hash[timebox].UserIterationCapacitySum += item['data']['Capacity'];

        });
        
        return hash;
    },

    _makeTopChart: function(artifacts_by_timebox) {
        var me = this;

        var categories = this._getCategories();
        var series = this._getTopSeries(artifacts_by_timebox);
        var colors = CA.apps.charts.Colors.getConsistentBarColors();

        if ( this.getSetting('showPatterns') ) {
            colors = CA.apps.charts.Colors.getConsistentBarPatterns();
        }
        this.setChart({
            chartData: { series: series, categories: categories },
            chartConfig: this._getTopChartConfig(),
            chartColors: colors
        });
        this.setLoading(false);

// Make the Alert box show...
//				me.averageUtilization = 0;        

        if (me.averageUtilization == 0) {
		        Ext.Msg.alert('', 'The selected Iterations have no Task Estimates and/or no User Capacities entered.');
        }
    },
    
    _getTopSeries: function(artifacts_by_timebox) {
        var me = this;
        var series = [];
        
            series.push({
                name: 'Utilization %',
                data: this._calculateTopMeasure(artifacts_by_timebox),
                type: 'column',             
								stacking: 'normal'
            });

        // series for actual velocity
        
        return series;
    },

    _calculateTopMeasure: function(artifacts_by_timebox) {
        var me = this,
            data = [];
        var total_utilization = 0;
        var total_iterations = 0;
       
			Ext.Array.each(this.timeboxes, function(tb) {
				var timebox = tb.get('Name');
				var timeboxEnd = tb.get('EndDate');
				var timeboxStart = tb.get('StartDate');
				var value = artifacts_by_timebox[timebox];
				if (Ext.isEmpty(value) ) {
            data.push({ 
                y: 0,
                _taskEstimateTotals: 0,
                _userIterationCapacity: 0,
                _timeboxStartDate: timeboxStart,
                _timeboxEndDate: timeboxEnd,
                _timeboxName: timebox
            });
						return;
				}

            total_iterations += (((value.UserIterationCapacitySum > 0) && (value.TaskEstimateTotal > 0)) ? 1 : 0);
						total_utilization += (((value.UserIterationCapacitySum > 0) && (value.TaskEstimateTotal > 0)) ? (value.TaskEstimateTotal/value.UserIterationCapacitySum)*100 : 0);
						me.averageUtilization = total_utilization/total_iterations;

            data.push({ 
                y: (value.UserIterationCapacitySum > 0 ? (value.TaskEstimateTotal/value.UserIterationCapacitySum)*100 : 0),
                _taskEstimateTotals: value.TaskEstimateTotal,
                _userIterationCapacity: value.UserIterationCapacitySum,
                _timeboxStartDate: value.StartDate,
                _timeboxEndDate: value.EndDate,
                _timeboxName: timebox
            });
        });
        me.num_iterations = total_iterations;
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

    _getCategories: function() {
//        return Ext.Object.getKeys(artifacts_by_timebox);
				return Ext.Array.map(this.timeboxes, function(timebox) {
						return timebox.get('Name');
				});
    },

    _getTopChartConfig: function() {
        var me = this;
        
        return {
            chart: { type:'column' },
            title: { text: 'Utilization % by Iteration' },
            xAxis: {
                labels:{
                    rotation:this._rotateLabels()
                }
            },
            yAxis: { 
                title: { text: 'Utilization %' },
                plotLines: [{ 
                    value: me.averageUtilization,
                    color: CA.apps.charts.Colors.blue_dark,
                    width: '1',
                    zIndex: 5,
                    label: {
                        text: '<strong>Average Utilization for last ' + me.num_iterations + ' non-zero Iterations = ' + Ext.util.Format.number(me.averageUtilization,"000.00" + '%</strong>'),
                        style: {
                            color: CA.apps.charts.Colors.blue_dark
                        }
                    }
                }],                

            },
            plotOptions: {
                column: {
                    stacking: 'normal'
                }
            },
            tooltip: {
                formatter: function() {
                	
								return "<strong>" + this.point._timeboxName + "</strong><br/><strong>Dates:</strong> " + 
												Ext.util.Format.date(this.point._timeboxStartDate) + " - " +
								        Ext.util.Format.date(this.point._timeboxEndDate) + "<br/>" +
								        "<strong>Task Estimates:</strong> " + this.point._taskEstimateTotals + " Hours<br/>" +
								        "<strong>Team Capacity:</strong> " + this.point._userIterationCapacity + " Hours<br/>" +
								        "<strong>Utilization Rate:</strong> " + 
								        Ext.util.Format.number(this.point.y, '0.##') + "%";
                	
//                    return '<b>'+ this.series.name +'</b>: '+ Ext.util.Format.number(this.point.y, '0.##');
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
                //console.log(field);
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
                text: "id"
            },
            {
                dataIndex : 'Name',
                text: "Name",
                flex: 2
            },
            {
                dataIndex: 'WorkProduct',
                text: 'Work Product',
                flex:2,
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
                dataIndex: 'ToDo',
                text: 'Task Hours (To Do)'
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
    }
    
});
