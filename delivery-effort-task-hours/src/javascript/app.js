Ext.define("TSDeliveryEffortTaskHours", {
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
        "<strong>Delivery Effort Full Time Equivalents</strong><br/>"

    ],
    
    integrationHeaders : {
        name : "TSDeliveryEffortTaskHours"
    },
    
    config: {
        defaultSettings: {
            showPatterns: false
        }
    },
                        
    launch: function() {
        this.callParent();
        this._updateData();
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
                var artifacts_by_timebox = this._collectArtifactsByTimebox(results || []);
                this._makeTopChart(artifacts_by_timebox);
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
                
        this.setLoading("Fetching timeboxes...");
                
        var config = {
            model: type,
            limit: 10,
            pageSize: 10,
            fetch: ['Name','StartDate','EndDate'],
            filters: [{property:'EndDate', operator: '<=', value: Rally.util.DateTime.toIsoString(new Date)}],
            sorters: [{property:'EndDate', direction:'DESC'}],
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
        var type_field = this.getSetting('typeField');
        
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
            {property:'WorkProduct.AcceptedDate', operator: '!=', value: null }
        ];
        
        var config = {
            model:'Task',
            limit: Infinity,
            filters: filters,
            fetch: ['FormattedID','Name','ScheduleState','Iteration','ObjectID',
                'PlanEstimate','Project','Release',type_field,'Actuals','Estimate',
                'ToDo','WorkProduct',start_field,end_field]
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
            
            var start_date = Rally.util.DateTime.fromIsoString(item.get(timebox_type).StartDate);

            var end_date = Rally.util.DateTime.fromIsoString(item.get(timebox_type).EndDate);
        
            var sprint_days_excluding_weekend = Rally.technicalservices.util.Utilities.daysBetween(end_date,start_date,this.true);

            if ( Ext.isEmpty(hash[timebox])){
                
                hash[timebox] = Ext.Object.merge({}, Ext.clone(base_hash) );
            }
            
            hash[timebox].records.all.push(item);
            
            var type = item.get(type_field) || "";
            if ( Ext.isEmpty(hash[timebox].records[type]) ) {
                hash[timebox].records[type] = [];
            }
            hash[timebox].records[type].push(item);

            hash[timebox].records['SprintDaysExcludingWeekend'] = sprint_days_excluding_weekend;

        });
        
        return hash;
    },
    
    _makeTopChart: function(artifacts_by_timebox) {
        var me = this;

        var categories = this._getCategories(artifacts_by_timebox);
        var series = this._getSeries(artifacts_by_timebox);
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
    },
    


    _makeBottomChart: function(artifacts_by_timebox) {
        var me = this;

        var categories = this._getCategories(artifacts_by_timebox);
        // TODO: change series to have FTE calcs.
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
    
    _getSeries: function(artifacts_by_timebox) {
        var series = [],
            allowed_types = this.allowed_types;
        
        console.log('--', artifacts_by_timebox);
    
        var name = "Actual Hours";
        series.push({
            name: name,
            data: this._calculateMeasure(artifacts_by_timebox,"Actuals",name),
            type: 'column',
            stack: 'a'
        });

        var name = "To Do Hours";
        series.push({
            name: name,
            data: this._calculateMeasure(artifacts_by_timebox,"ToDo",name),
            type: 'column',
            stack: 'a'
        });
        
        var name = "Estimated Hours";
        series.push({
            name: name,
            data: this._calculateMeasure(artifacts_by_timebox,"Estimate",name),
            type: 'line'
        });
        
        return series;
    },
    
    _getBottomSeries: function(artifacts_by_timebox) {
        var series = [],
            allowed_types = this.allowed_types;
        
        console.log('--', artifacts_by_timebox);
    
        var name = "Actual FTEs";
        series.push({
            name: name,
            data: this._calculateBottomMeasure(artifacts_by_timebox,"Actuals",name),
            type: 'column',
            stack: 'a'
        });

        var name = "To Do FTEs";
        series.push({
            name: name,
            data: this._calculateBottomMeasure(artifacts_by_timebox,"ToDo",name),
            type: 'column',
            stack: 'a'
        });
        
        var name = "Estimated FTEs";
        series.push({
            name: name,
            data: this._calculateBottomMeasure(artifacts_by_timebox,"Estimate",name),
            type: 'line'
        });
        
        return series;
    },

    _calculateMeasure: function(artifacts_by_timebox,hours_field,title) {
        var me = this,
            data = [];
        
        Ext.Object.each(artifacts_by_timebox, function(timebox, value){
            var records = value.records.all || [];
        
            var size = Ext.Array.sum(
                Ext.Array.map(records, function(record){
                    return record.get(hours_field) || 0;
                })
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

    _calculateBottomMeasure: function(artifacts_by_timebox,hours_field,title) {
        var me = this,
            data = [];
        
        Ext.Object.each(artifacts_by_timebox, function(timebox, value){
            var records = value.records.all || [];
            
            var size = Ext.Array.sum(
                Ext.Array.map(records, function(record){
                    return record.get(hours_field) || 0;
                })
            );
            
            //calculate full time equivalent ( number of hours in velocity / ( .8 * 8 * number of workdays in sprint) )
            if(size > 0){
                size = (value.records.SprintDaysExcludingWeekend * 8) / ( .8 * 8 * size);
            }

            data.push({ 
                y: parseInt(size,10),
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
    
    _getTopChartConfig: function() {
        var me = this;
        return {
            chart: { type:'column' },
            title: { text: 'Actual Task Hours by Sprint' },
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
    
    _getBottomChartConfig: function() {
        var me = this;
        return {
            chart: { type:'column' },
            title: { text: 'Actual FTEs by Sprint' },
            xAxis: {},
            yAxis: [{ 
                title: { text: 'FTEs' }
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
    }
    
});
