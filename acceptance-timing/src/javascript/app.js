Ext.define("ATApp", {
    extend: 'CA.techservices.app.ChartApp',

    descriptions: [
        "<strong>Delivery Effort Task Hours</strong><br/>" +
            "<br/>" +
            "This dashboard shows how many hours are being spent on accepted stories during sprints,  " +
            "compared to the estimated hours and hours left to-do." +
            "<p/>" +
            "Click on a bar to see a table with the tasks from that timebox." +
            "<p/> " +
            "<ul/>" +
            "<li>The columns show the count of actual hours on the tasks associated " +
            "with stories accepted in the sprint.</li>" +
            "<li>The line shows the count of the estimated hours on the tasks " + 
            "associated with stories accepted in the sprint.</li>" + 
            "</ul>",
        "<strong>Delivery Effort Full Time Equivalents</strong><br/>"+
            "<br/>" +
            "This dashboard shows the number of actual FTEs spent on accepted stories during sprints,  " +
            "compared to the estimated FTEs and FTEs left to-do." +
            "<p/>" +
            "Click on a bar to see a table with the tasks from that timebox." +
            "<p/> " +
            "<ul/>" +
            "<li>The columns show the count of actual hours on the tasks associated " +
            "with stories accepted in the sprint.</li>" +
            "<li>The line shows the count of the estimated hours on the tasks " + 
            "associated with stories accepted in the sprint.</li>" + 
            "</ul>",
        "<strong>Delivery Effort Full Time Equivalents</strong><br/>"+
            "<br/>" +
            "This dashboard shows the number of actual FTEs spent on accepted stories during sprints,  " +
            "compared to the estimated FTEs and FTEs left to-do." +
            "<p/>" +
            "Click on a bar to see a table with the tasks from that timebox." +
            "<p/> " +
            "<ul/>" +
            "<li>The columns show the count of actual hours on the tasks associated " +
            "with stories accepted in the sprint.</li>" +
            "<li>The line shows the count of the estimated hours on the tasks " + 
            "associated with stories accepted in the sprint.</li>" + 
            "</ul>"

    ],
    
    integrationHeaders : {
        name : "ATApp"
    },
    
    config: {
        defaultSettings: {
            showPatterns: false
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
    
    _updateData: function() {
        var me = this;
        this.metric = "size";
        this.timebox_type = 'Iteration';
        
        Deft.Chain.pipeline([
            this._fetchTimeboxes,
            this._sortIterations,
            this._fetchArtifactsInTimeboxes
        ],this).then({
            scope: this,
            success: function(results) {
                console.log('results>>',results);
                var artifacts_by_timebox = this._collectArtifactsByTimebox(results || []);
                this._makeTopChart(artifacts_by_timebox);
                this._makeMiddleChart(artifacts_by_timebox);
                this._makeBottomChart(artifacts_by_timebox);
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
        
        Ext.Array.sort(iterations, function(a,b){
            if ( a.get('EndDate') < b.get('EndDate') ) { return -1; }
            if ( a.get('EndDate') > b.get('EndDate') ) { return  1; }
            return 0;
        });
        
        return iterations;
    },
    
    _fetchArtifactsInTimeboxes: function(timeboxes) {
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
        var last_date = timeboxes[timeboxes.length - 1].get(start_field);
        
        var filters = [
            {property: type + '.' + start_field, operator: '>=', value:first_date},
            {property: type + '.' + start_field, operator: '<=', value:last_date},
            {property:'AcceptedDate', operator: '!=', value: null }
        ];
        
        var config = {
            model:'HierarchicalRequirement',
            limit: Infinity,
            filters: filters,
            fetch: ['FormattedID','Name','ScheduleState','Iteration','ObjectID',
                'PlanEstimate','Project','Release','AcceptedDate',start_field,end_field]
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
     * returns a hash of hashes -- key is sprint day name value is
     * another hash where the records key holds a hash
     * as in
     * {1:{"records":{item1,item2},"accepted_sprint_day"}, 1:{"records":{item1,item2},"accepted_sprint_day"}}
     */

    _collectArtifactsByTimebox: function(items) {
        var hash = {},
            timebox_type = this.timebox_type;

        var artifacts_with_timings = [];
        Ext.Array.each(items,function(artifact){
            var accepted_sprint_day = Rally.technicalservices.util.Utilities.daysBetween(artifact.get('Iteration').StartDate,artifact.get('AcceptedDate'),false);
            artifacts_with_timings.push({'artifact':artifact,'accepted_sprint_day':accepted_sprint_day});
        });

        console.log('artifacts_with_timings>>',artifacts_with_timings);

        var hash = {};

        Ext.Array.each(artifacts_with_timings,function(item){
            if(hash[item.accepted_sprint_day]){
                hash[item.accepted_sprint_day].records.push(item.artifact);
                hash[item.accepted_sprint_day].total_records++;
            }
            else{
                hash[item.accepted_sprint_day] = {total_records:1,records:[item.artifact]};
            }
        })


        console.log('artifacts_with_timings>> count hash',hash);

        var temp = [];

        Ext.Array.each(Ext.Object.getKeys(hash),function(key){temp.push(parseInt(key));});

        var max_day = Math.max.apply(Math,temp);

        for(var i=0;i<=max_day;i++){
            if(!hash[i]){
               hash[i] = {total_records:0,records:[]};
            }
        }

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
        var series = [],
            allowed_types = this.allowed_types;
        
        var name = "Stories";
        series.push({
            name: name,
            data: this._calculateTopMeasure(artifacts_by_timebox)
        });

        return series;
    },


    _calculateTopMeasure: function(artifacts_by_timebox) {
        var me = this,
            data = [],
            sum_total_records = 0;
        Ext.Object.each(artifacts_by_timebox, function(key, value){
            sum_total_records += value.total_records;
            data.push({ 
                y: sum_total_records
            });
        });
        return data;
    },       

    _getTopChartConfig: function() {
        var me = this;
        return {
            chart: { type: 'area' },
            title: { text: 'Acceptance Timing of Stories' },
            xAxis: {
                title: { text: 'Sprint Day' }
            },
            yAxis: [{ 
                title: { text: 'Total # Stories Accepted' }
            }],
            plotOptions: {
                area: {
                        dataLabels: {
                            enabled: true
                        },                      
                        pointStart: 0,
                        marker: {
                            enabled: false,
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


    _makeMiddleChart: function(artifacts_by_timebox) {
        var me = this;

        var categories = this._getCategories(artifacts_by_timebox);

        var series = this._getMiddleSeries(artifacts_by_timebox);
        var colors = CA.apps.charts.Colors.getConsistentBarColors();
        
        if ( this.getSetting('showPatterns') ) {
            colors = CA.apps.charts.Colors.getConsistentBarPatterns();
        }
        this.setChart({
            chartData: { series: series, categories: categories },
            chartConfig: this._getMiddleChartConfig(),
            chartColors: colors
        },1);
        this.setLoading(false);
    },

    _getMiddleSeries: function(artifacts_by_timebox) {
        var series = [],
            allowed_types = this.allowed_types;
        
        var name = "Stories";
        series.push({
            name: name,
            data: this._calculateMiddleMeasure(artifacts_by_timebox)
        });

        return series;
    },


    _calculateMiddleMeasure: function(artifacts_by_timebox) {
        var me = this,
            data = [],
            pct_total = 0,
            sum_total_records = 0;

        Ext.Object.each(artifacts_by_timebox, function(key, value){
            pct_total += value.total_records;
        });

        Ext.Object.each(artifacts_by_timebox, function(key, value){
            sum_total_records += value.total_records;
            y_value = Math.round((sum_total_records / pct_total) * 100);
            data.push({ 
                y: y_value
            });
        });
        return data;
    },       


    _getMiddleChartConfig: function() {
        var me = this;
        return {
            chart: { type: 'area' },
            title: { text: 'Acceptance Timing of Stories' },
            xAxis: {
                title: { text: 'Sprint Day' }
            },
            yAxis: [{ 
                title: { text: 'Acceptance %' }
            }],
            plotOptions: {
                area: {
                        dataLabels: {
                            enabled: true
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
        },2);
        this.setLoading(false);
    },
    

    
    _getBottomSeries: function(artifacts_by_timebox) {
        var series = [],
            allowed_types = this.allowed_types;
        
        console.log('--', artifacts_by_timebox);
    
        var name = "Stories";
        series.push({
            name: name,
            data: this._calculateBottomMeasure(artifacts_by_timebox),
            type: 'column'
        });

        return series;
    },


    _calculateBottomMeasure: function(artifacts_by_timebox) {
        var me = this,
            data = [];
        
        Ext.Object.each(artifacts_by_timebox, function(key, value){
            data.push({ 
                y: value.total_records,
                _records: value.records,
                events: {
                    click: function() {
                        me.showDrillDown(this._records,  "Records for sprint Day " + key);
                    }
                }
            });
        });
        return data;
    },    
    
    _getBottomChartConfig: function() {
        var me = this;
        return {
            chart: { type:'column' },
            title: { text: 'Acceptance Timing of Stories' },
            xAxis: {
                title: { text: 'Sprint Day' }
            },
            yAxis: [{ 
                title: { text: 'Total # Stories Accepted' }
            }],
            plotOptions: {

            },
        }
    },


    _getCategories: function(artifacts_by_timebox) {
        return Ext.Object.getKeys(artifacts_by_timebox);
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
    
});
