Ext.define("TSSplitStoryPerSprint", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container', itemId: 'selector_box' },
        {xtype:'container', layout: 'hbox', items: [
            {xtype:'container', itemId:'chart_box', flex: 1},
            {xtype:'container', itemId:'description_box'}
        ]},
        {xtype:'container',itemId:'raw_grid_box'},
        {xtype:'container',itemId:'ratio_grid_box'}
    ],
    
    integrationHeaders : {
        name : "TSSplitStoryPerSprint"
    },

    launch: function() {
        this._addSelectors(this.down('#selector_box'));
        this._addDescription(this.down('#description_box'));
        this._updateData();
    }, 
    
    _addDescription: function(container) {
        container.add({
            xtype:'panel',
            ui: 'info-box',
            title: '<span class="icon-info-circle"> </span>',
            collapsible: true,
            collapsed: true,
            collapseDirection: 'right',
            headerPosition: 'left',
            width: 375,
            height: 375,
            margin: 5,
            
            html: '<strong>Split Stories By Sprint</strong>' +
                '<p/>' + 
                'The stacked bar chart displays the total points (or count) of stories accepted in a sprint, grouped by Story Type.' +
                '<p/>' + 
                'The top table shows the total points (or count) of stories accepted in a sprint, grouped by Story Type.' + 
                '<p/>' + 
                'The bottom table shows the total percentage of points (or count) of stories grouped by Story Type.' +
                '<p/>' + 
                'There are four types of stories:' + 
                '<ul>' + 
                '<li>Unfinished: Stories that were split and left behind.</li>' +
                '<li>Continued: Stories that were split and moved to a new sprint.</li>' +
                '<li>Multiple Moves: Stories that have been split more than once.</li>' + 
                '<li>Story: Stories that have not been split</li>' + 
                '</ul>'
            
        });
    },
    
    _addSelectors: function(container) {
        container.add({
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
    },
    
    _updateData: function() {
        var me = this;
        this.metric = this.down('#metric_selector').getValue();
        
        Deft.Chain.pipeline([
            this._fetchLastTenIterations,
            this._sortIterations,
            this._fetchStoriesFromIterations,
            this._setStoryType,
            this._buildIterationObjects
        ],this).then({
            scope: this,
            success: function(parsed_sprints){
                this._makeRawGrid(parsed_sprints);
                this._makePercentageGrid(parsed_sprints);
                this._makeRawChart(parsed_sprints);
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem Gathering Data', msg);
            }
        }).always(function() { me.setLoading(false); });
    },
    
    _buildIterationObjects: function(stories) {
        var iteration_objects = {};
        Ext.Array.each(this.iterations, function(iteration){
            iteration_objects[iteration.get('Name')] = {
                iteration: iteration,
                multiple: [],
                unfinished: [],
                continued: [],
                standard: [],
                stories: []
            }
        });
        
        Ext.Array.each(stories, function(story){
            var iteration_name = story.get('Iteration').Name;
            var type = story.get('__Type');
            iteration_objects[iteration_name].stories.push(story);
            iteration_objects[iteration_name][type].push(story);
        });
        
        return iteration_objects;
    },
    
    _setStoryType: function(stories) {
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
    
    _sortIterations: function(iterations) {
        
        Ext.Array.sort(iterations, function(a,b){
            if ( a.get('EndDate') < b.get('EndDate') ) { return -1; }
            if ( a.get('EndDate') > b.get('EndDate') ) { return  1; }
            return 0;
        });
        
        return iterations;
    },
    
    _fetchLastTenIterations: function() {
        this.setLoading("Fetching iterations...");
        var config = {
            model:'Iteration',
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
    
    _fetchStoriesFromIterations: function(iterations) {
        this.setLoading("Fetching Stories...");
        this.iterations = iterations;
        
        if ( iterations.length === 0 ) { return []; }
        
        var first_iteration = iterations[0];
        var last_iteration = iterations[iterations.length-1];
        
        var filters = [
            {property:'Iteration.StartDate',operator:'>=', value: Rally.util.DateTime.toIsoString(first_iteration.get('StartDate'))},
            {property:'Iteration.EndDate',  operator:'<=', value: Rally.util.DateTime.toIsoString(last_iteration.get('EndDate'))},
            {property:'AcceptedDate',       operator:'!=', value: null }
        ];
        
        var config = {
            model: 'HierarchicalRequirement',
            filters: filters,
            fetch:['FormattedID','ScheduleState','Iteration','Name','PlanEstimate']
        }
        
        return TSUtilities.loadWsapiRecords(config);
    },
    
    _getRawRows: function(sprint_objects) {
        var me = this;
        // sprint objects have key = name of sprint
        var row_fields = this._getCategories(sprint_objects);
                
        var rows = [
            {Type:'unfinished', Name: 'Unfinished Story'},
            {Type:'continued',  Name: 'Continued Story' },
            {Type:'multiple', Name: 'Multiple Moves' },
            {Type:'standard',   Name: 'Story'}
        ];
        // set up fields
        
        Ext.Array.each(rows, function(row) {
            Ext.Array.each(row_fields, function(field){
                row[field] = [];
                row[field + "_number"] = 0;
            });
        });
        
        Ext.Array.each(rows, function(row){
            var type = row.Type;
            Ext.Object.each(sprint_objects, function(sprint_name,value){
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
            {Type:'standard',   Name: 'Story'}
        ];
        // set up fields
        
        Ext.Array.each(rows, function(row) {
            Ext.Array.each(row_fields, function(field){
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
        return Ext.Array.map(Ext.Object.getKeys(sprint_objects), function(sprint){
            return sprint;
        });
    },
    
    _getSeriesFromRows: function(rows) {
        var me = this;
        var series = [];
        
        Ext.Array.each(rows, function(row) {
            var type = row.Type;
            var data = [];
            var records = [];
            
            Ext.Object.each(row, function(key,value) {
                if ( Ext.isArray(value) ) {
                    //data.push(value);
                    data.push({ 
                        y: row[key + "_number"],
                        _records: value,
                        events: {
                            click: function() {
                                
                                me._showDrillDown(this._records,  key + " (" + row.Type + ")");
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
        
        var container = this.down('#chart_box');
        
        container.removeAll();
        
        var categories = this._getCategories(sprint_objects);
        var sprints = this._getRawRows(sprint_objects);
        var series = this._getSeriesFromRows(sprints);
        
        container.add({
            xtype:'rallychart',
            loadMask: false,
            chartColors: CA.apps.charts.Colors.getConsistentBarColors(),

            chartData: { series: series, categories: categories },
            chartConfig: this._getChartConfig()
        });
    },
    
    _getChartConfig: function() {
        var me = this;
        return {
            chart: { type:'column' },
            title: { text: 'Split Stories by Sprint' },
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
        var container = this.down('#raw_grid_box');
        container.removeAll();

        var columns = [{dataIndex:'Name',text:'Story Type'}];
        Ext.Array.each(this._getCategories(sprint_objects), function(field){   
            columns.push({ dataIndex: field + "_number", text: field, align: 'center'});
        });
        
        var rows = this._getRawRows(sprint_objects);
        
        container.add({
            xtype:'rallygrid',
            showPagingToolbar: false,
            store: Ext.create('Rally.data.custom.Store',{ data: rows }),
            columnCfgs: columns,
            listeners: {
                scope: this,
                itemclick: this._makeGridDrilldown
            }
        }); 

    },
    
    _makePercentageGrid: function(sprint_objects) {
        var me = this;
        var container = this.down('#ratio_grid_box');
        container.removeAll();
        
        var columns = [{dataIndex:'Name',text:'Story Type'}];
        Ext.Array.each(this._getCategories(sprint_objects), function(field){   
            columns.push({ 
                dataIndex: field + "_number", 
                text: field, 
                align: 'center',
                renderer: function(value,meta,record) {
                    if ( !Ext.isNumber(value) ) {
                        return 'N/A';
                    }
                    return parseInt(100*value,10) + "%";
                }
            });
                
        });
        
        var rows = this._getPercentageRows(sprint_objects);
        
        container.add({
            xtype:'rallygrid',
            showPagingToolbar: false,
            store: Ext.create('Rally.data.custom.Store',{ data: rows }),
            columnCfgs: columns
        }); 

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
        
        this.logger.log('count/size', record.get(column.dataIndex));
        
        if ( record.get(column.dataIndex) === 0 ) {
            return;
        }
        
        var new_dataindex = column.dataIndex.replace(/_number/,'');
                
        var stories = record.get(new_dataindex);
                
        var title = column.text + " (type: " + record.get('Type') + ")";
        
        this._showDrillDown(stories, title);
    },
    
    _showDrillDown: function(stories, title) {
        var me = this;

        var store = Ext.create('Rally.data.custom.Store', {
            data: stories,
            pageSize: 2000
        });
        
        Ext.create('Rally.ui.dialog.Dialog', {
            id        : 'detailPopup',
            title     : title,
            width     : Ext.getBody().getWidth() - 25,
            height    : Ext.getBody().getHeight() - 25,
            closable  : true,
            layout    : 'border',
            items     : [
            {
                xtype                : 'rallygrid',
                region               : 'center',
                sortableColumns      : true,
                showRowActionsColumn : false,
                showPagingToolbar    : false,
                columnCfgs           : [
                    {
                        dataIndex : 'FormattedID',
                        text: "id"
                    },
                    {
                        dataIndex : 'Name',
                        text: "Name",
                        flex: 1
                    },
                    {
                        dataIndex: 'ScheduleState',
                        text: 'Schedule State'
                    },
                    {
                        dataIndex: 'PlanEstimate',
                        text: 'Plan Estimate'
                    }
                ],
                store : store
            }]
        }).show();
    },
    
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },
    
    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        this.logger.log('onSettingsUpdate',settings);
        // Ext.apply(this, settings);
        this.launch();
    }
});
