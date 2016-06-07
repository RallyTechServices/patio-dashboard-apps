Ext.define("TSSplitStoryPerSprint", {
    extend: 'CA.techservices.app.ChartApp',
    
    description: '<strong>Split Stories By Sprint</strong>' +
                '<p/>' + 
                'The stacked bar chart displays the number of points (or count) of stories accepted in a sprint, grouped by Story Type.' +
                '<p/>' + 
                'The top table shows the points (or count) of stories accepted in a sprint, grouped by Story Type.' + 
                '<p/>' + 
                'The bottom table shows the percentage of points (or count) of stories grouped by Story Type.' +
                '<p/>' + 
                'There are four types of stories:' + 
                '<ul>' + 
                '<li>Unfinished: Stories that were split and left behind.</li>' +
                '<li>Continued: Stories that were split and moved to a new sprint.</li>' +
                '<li>Multiple Moves: Stories that have been split more than once.</li>' + 
                '<li>Story: Stories that have not been split</li>' + 
                '</ul>',
    
    integrationHeaders : {
        name : "TSSplitStoryPerSprint"
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
        
        this.metric_selector = this.addToBanner({
            xtype: 'tstogglebutton',
            toggleState: 'size',
            itemId: 'metric_selector',
            margin: '3 0 0 0',
            stateful: true,
            stateId: 'techservices-timeinstate-metriccombo',
            stateEvents:['change'],
            listeners: {
                scope: this,
                toggle: this._updateData
            }
        });

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
            keyNavEnabled: true,
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
        this.logger.log('_updateData');
        var me = this;
        this.metric = this.metric_selector.getValue() == 'size' ? 'Points': this.metric_selector.getValue();
        
        Deft.Chain.pipeline([
            this._fetchLastTenTimeBoxes,
            this._sortTimeboxes,
            this._fetchStoriesFromTimeboxes,
            this._setStoryType,
            this._buildTimeboxObjects
        ],this).then({
            scope: this,
            success: function(parsed_sprints){
                this.logger.log('Ready to calculate');
                this.clearAdditionalDisplay();
               
                this._makeRawGrid(parsed_sprints);
                this._makePercentageGrid(parsed_sprints);
                this._makeRawChart(parsed_sprints);
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem Gathering Data', msg);
            }
        }).always(function() { me.setLoading(false); });
    },
    
    
    _buildTimeboxObjects: function(stories) {
        var me = this;
        this.logger.log('_buildTimeboxObjects');

        var timebox_objects = {};
        Ext.Array.each(this.timeboxes, function(timebox){
            var name = me._getSafeTimeboxName(timebox.get('Name'));
            
            timebox_objects[name] = {
                iteration: timebox,
                multiple: [],
                unfinished: [],
                continued: [],
                standard: [],
                stories: []
            }
        });
        
        Ext.Array.each(stories, function(story){
            var timebox_name = me._getSafeTimeboxName( story.get(me.timebox_type).Name );
            var type = story.get('__Type');
            timebox_objects[timebox_name].stories.push(story);
            timebox_objects[timebox_name][type].push(story);
        });
        
        return timebox_objects;
    },    


    _setStoryType: function(stories) {
        this.logger.log("_setStoryType");
        Ext.Array.each(stories, function(story){
            story.set('__Type', this._getTypeFromName(story.get('Name')));
        },this);
        
        return stories;
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
    
   
    _sortTimeboxes: function(timeboxes) {

        this.logger.log('_sortTimeboxes');

        // var type = this.timebox_type;

        // var end_field = "EndDate";

        // if ( type == "Release" ) {
        //     end_field   = "ReleaseDate";
        // }        
        
        // Ext.Array.sort(timeboxes, function(a,b){
        //     if ( a.get(end_field) < b.get(end_field) ) { return -1; }
        //     if ( a.get(end_field) > b.get(end_field) ) { return  1; }
        //     return 0;
        // });
        
        return timeboxes.reverse();
    },

   
    _fetchLastTenTimeBoxes: function() {
        this.logger.log('_fetchLastTenTimeBoxes');

        this.setLoading("Fetching timeboxes...");
        
        var type = this.timebox_type;

        var start_field = "StartDate";
        var end_field = "EndDate";

        if ( type == "Release" ) {
            start_field = "ReleaseStartDate";
            end_field   = "ReleaseDate";
        }

        var config = {
            model:type,
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


    _fetchStoriesFromTimeboxes: function(timeboxes) {
        this.logger.log('_fetchStoriesFromTimeboxes');

        this.setLoading("Fetching Stories...");

        var type = this.timebox_type;

        var start_field = "StartDate";
        var end_field = "EndDate";

        if ( type == "Release" ) {
            start_field = "ReleaseStartDate";
            end_field   = "ReleaseDate";
        }

        this.timeboxes = timeboxes;
        
        if ( timeboxes.length === 0 ) { return []; }
        
        var first_timebox = timeboxes[0];
        var last_timebox = timeboxes[timeboxes.length-1];

        var filters = [];

        if(type=='Iteration'){
            filters = [
                {property:'Iteration.StartDate',operator:'>=', value: Rally.util.DateTime.toIsoString(first_timebox.get(start_field))},
                {property:'Iteration.EndDate',  operator:'<=', value: Rally.util.DateTime.toIsoString(last_timebox.get(end_field))},
                {property:'AcceptedDate',       operator:'!=', value: null }
            ];
        }else{
            filters = [
                {property:'Release.ReleaseStartDate',operator:'>=', value: Rally.util.DateTime.toIsoString(first_timebox.get(start_field))},
                {property:'Release.ReleaseDate',  operator:'<=', value: Rally.util.DateTime.toIsoString(last_timebox.get(end_field))},
                {property:'AcceptedDate',       operator:'!=', value: null }
            ];            
        }
        
        
        
        var config = {
            model: 'HierarchicalRequirement',
            filters: filters,
            context: {
                projectScopeUp: false,
                projectScopeDown: false
            },
            fetch:['FormattedID','ScheduleState','Iteration','Release','Name','PlanEstimate','Feature','Project']
        }
        
        return TSUtilities.loadWsapiRecords(config);
    },    
    
    /*
     * having a dot in the name for the key of a hash causes problems
     */
    _getSafeTimeboxName: function(name) {
        return name.replace(/\./,'&#46;'); 
    },
    
    _getUnsafeTimeboxName: function(name) {
        return name.replace(/&#46;/,'.');
    },
    
    _getRawRows: function(sprint_objects) {
        var me = this;
        // sprint objects have key = name of sprint
        
        var row_fields = this._getCategories(sprint_objects);
         
        this.logger.log('row_fields', row_fields);
        
        var rows = [
            {Type:'unfinished', Name: 'Unfinished Story'},
            {Type:'continued',  Name: 'Continued Story' },
            {Type:'multiple', Name: 'Multiple Moves' },
            {Type:'standard',   Name: 'Unsplit Story'}
        ];
        // set up fields
        
        Ext.Array.each(rows, function(row) {
            Ext.Array.each(row_fields, function(field){
                field = me._getSafeTimeboxName(field);
                row[field] = [];
                row[field + "_number"] = 0;
            });
        });
                
        Ext.Array.each(rows, function(row){
            var type = row.Type;
            Ext.Object.each(sprint_objects, function(sprint_name,value){
                sprint_name = me._getSafeTimeboxName(sprint_name);

                row[sprint_name] = value[type];
                
                if (me.metric == 'count') {
                    row[sprint_name + "_number"] = row[sprint_name].length; 
                } else {
                    var total = 0;
                    Ext.Array.each(row[sprint_name], function(story){
                        var value = story.get('PlanEstimate') || 0;
                        total = total + value;
                    });
                    
                    row[sprint_name + "_number"] = total; 
                }
            });
        });
        
        return rows;
    },
    
    _getPercentageRows: function(sprint_objects) {
        var me = this;
        // sprint objects have key = name of sprint
        var row_fields = this._getCategories(sprint_objects);
                
        var rows = [
            {Type:'unfinished', Name: 'Unfinished Story'},
            {Type:'continued',  Name: 'Continued Story' },
            {Type:'multiple', Name: 'Multiple Moves' },
            {Type:'standard',   Name: 'Unsplit Story'}
        ];
        // set up fields
        
        Ext.Array.each(rows, function(row) {
            Ext.Array.each(row_fields, function(field){
                field = me._getSafeTimeboxName(field);
                row[field] = [];
                row[field + "_number"] = 0;
            });
        });
        
        Ext.Array.each(rows, function(row){
            var type = row.Type;
            Ext.Object.each(sprint_objects, function(sprint_name,value){
                
                row[sprint_name] = value[type];
                var all_stories = value.stories;
                
                if (me.metric == 'count') {
                    if ( all_stories.length === 0 ) {
                        row[sprint_name + "_number"] = "N/A";
                    }
                    row[sprint_name + "_number"] = row[sprint_name].length / all_stories.length; 
                } else {
                    var type_total = 0;
                    Ext.Array.each(row[sprint_name], function(story){
                        var value = story.get('PlanEstimate') || 0;
                        type_total = type_total + value;
                    });
                    
                    var total = 0;
                    
                    Ext.Array.each(all_stories, function(story){
                        var value = story.get('PlanEstimate') || 0;
                        total = total + value;
                    });
                    
                    if ( total === 0 ) {
                        row[sprint_name + "_number"] = "N/A";
                    } else {
                        row[sprint_name + "_number"] = type_total / total; 
                    }
                }
            });
        });
        return rows;
    },
    
    _getCategories: function(sprint_objects) {
        var me = this;
        
        return Ext.Array.map(Ext.Object.getKeys(sprint_objects), function(sprint){
            return me._getUnsafeTimeboxName(sprint);
        });
    },
    
    _getSeriesFromRows: function(rows) {
        var me = this;
        var series = [];
        
        this.logger.log('_getSeriesFromRows');
        
        Ext.Array.each(rows, function(row) {
            var type = row.Type;
            var data = [];
            var records = [];
            
            Ext.Object.each(row, function(key,value) {
                if ( Ext.isArray(value) ) {
                    data.push({ 
                        y: row[key + "_number"],
                        _records: value,
                        events: {
                            click: function() {
                                me.showDrillDown(this._records,  key + " (" + row.Type + ")");
                            }
                        }
                    });
                }
               
            });
            
            series.push({ 
                name: row.Name, 
                data: data
            });
        });
        return series;
    },
    
    _makeRawChart: function(sprint_objects) {
        var me = this;

        this.logger.log('_makeRawChart');
        
        var categories = this._getCategories(sprint_objects);
        
        var sprints = this._getRawRows(sprint_objects);
        var series = this._getSeriesFromRows(sprints);
        var colors = CA.apps.charts.Colors.getConsistentBarColors();
        
        if ( this.getSetting('showPatterns') ) {
            colors = CA.apps.charts.Colors.getConsistentBarPatterns();
        }
        
        this.logger.log('About to set chart');
        
        this.setChart({
            chartData: { series: series, categories: categories },
            chartConfig: this._getChartConfig(),
            chartColors: colors
        });
    },
    
    _getChartConfig: function() {
        var chart_title = this.timebox_type == 'Iteration'? 'Split Stories by Sprint' : 'Split Stories by Release';
        var me = this;
        return {
            chart: { type:'column' },
            title: { text: chart_title },
            xAxis: {},
            yAxis: { 
                min: 0,
                title: { text: this.metric }
            },
            plotOptions: {
                column: {
                    stacking: 'normal'
                }
            }
        }
    },
    
    _makeRawGrid: function(sprint_objects) {
        var me = this;
        
        this.logger.log('_makeRawGrid', sprint_objects);
       
        var columns = [{dataIndex:'Name',text:'Story Type', flex:1}];
        Ext.Array.each(this._getCategories(sprint_objects), function(field){
            columns.push({ dataIndex: me._getSafeTimeboxName(field) + "_number", text: field, align: 'center', flex:1});
        });
        
        this.logger.log('about to get Raw Rows');
        var rows = this._getRawRows(sprint_objects);
        
        this.logger.log('about to create store', rows);
        var store = Ext.create('Rally.data.custom.Store',{ data: rows });
        
        this.logger.log('about to add', store, columns);
        this.addToAdditionalDisplay({
            xtype:'rallygrid',
            padding: 5,
            showPagingToolbar: false,
            store: store,
            columnCfgs: columns,
            listeners: {
                scope: this,
                itemclick: this._makeGridDrilldown
            }
        }); 

    },
    
    _makePercentageGrid: function(sprint_objects) {
        var me = this;
        this.logger.log('_makePercentageGrid', sprint_objects);
        
        var columns = [{dataIndex:'Name',text:'Story Type', flex:1}];
        Ext.Array.each(this._getCategories(sprint_objects), function(field){   
            columns.push({ 
                dataIndex: me._getSafeTimeboxName(field)  + "_number", 
                text: field, 
                align: 'center',
                flex:1,
                renderer: function(value,meta,record) {
                    if ( !Ext.isNumber(value) ) {
                        return 'N/A';
                    }
                    return parseInt(100*value,10) + "%";
                }
            });
                
        });
        
        var rows = this._getPercentageRows(sprint_objects);
        
        this.logger.log("about to add percentage grid", rows);
        this.addToAdditionalDisplay({
            xtype:'rallygrid',
            padding: 5,
            margin: '10 0 0 0',
            showPagingToolbar: false,
            store: Ext.create('Rally.data.custom.Store',{ data: rows }),
            columnCfgs: columns
        }); 

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
                dataIndex: 'Feature',
                text: 'Feature',
                renderer:function(Feature){
                        return Feature ? Feature.FormattedID +' : '+Feature.Name : '';
                },
                flex: 1
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
    
    _makeGridDrilldown: function(view, record, item, index, evt) {
        var me = this;
        var column_index = view.getPositionByEvent(evt).column;
        if ( column_index < 2 ) {
            return;
        }
        var grid = view.ownerCt;
        var columns = grid.getColumnCfgs();
        var column = columns[column_index-1];
        
        this.logger.log('column:', column);
        if ( !/_number/.test(column.dataIndex) ) {
            return;
        }
                
        if ( record.get(column.dataIndex) === 0 ) {
            return;
        }
        
        var new_dataindex = column.dataIndex.replace(/_number/,'');
                
        var stories = record.get(new_dataindex);
                
        var title = column.text + " (type: " + record.get('Type') + ")";
        
        this.showDrillDown(stories, title);
    },
    
    getSettingsFields: function() {
        return [
        { 
            name: 'showPatterns',
                xtype: 'rallycheckboxfield',
                boxLabelAlign: 'after',
                fieldLabel: '',
                margin: '0 0 25 200',
                boxLabel: 'Show Patterns<br/><span style="color:#999999;"><i>Tick to use patterns in the chart instead of color.</i></span>'
        }
        ];
    }
});
