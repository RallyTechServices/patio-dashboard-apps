Ext.define("TSSplitStoryPerSprint", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'chart_box'},
        {xtype:'container',itemId:'raw_grid_box'},
        {xtype:'container',itemId:'ratio_grid_box'}
    ],

    config: {
        defaultSettings: {
            metric: 'size' // count or size
        }
    },
    
    integrationHeaders : {
        name : "TSSplitStoryPerSprint"
    },
                        
    launch: function() {
        var me = this;
        
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
    
    _makeRawGrid: function(sprint_objects) {
        var me = this;
        // sprint objects have key = name of sprint
        var row_fields = Ext.Array.map(Ext.Object.getKeys(sprint_objects), function(sprint){
            return sprint;
        });
                
        var rows = [
            {Type:'unfinished', Name: 'Unfinished Story'},
            {Type:'continued',  Name: 'Continued Story' },
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
                
                if (me.getSetting('metric') == 'count') {
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
        
        var columns = [{dataIndex:'Name',text:'Story Type'}];
        Ext.Array.each(row_fields, function(field){            
            columns.push({ dataIndex: field + "_number", text: field, align: 'center'});
        });
        
        this.down('#raw_grid_box').add({
            xtype:'rallygrid',
            showPagingToolbar: false,
            store: Ext.create('Rally.data.custom.Store',{ data: rows }),
            columnCfgs: columns
        }); 

    },
    
    getSettingsFields: function() {
        return [
        {
            name: 'metric',
            xtype: 'rallycombobox',
            fieldLabel: 'Measure',
            labelWidth: 100,
            labelAlign: 'left',
            minWidth: 200,
            margin: 10,
            displayField:'Name',
            valueField: 'Value',
            store: Ext.create('Rally.data.custom.Store',{
                data: [
                    {Name:'Count', Value:'count'},
                    {Name:'Size', Value:'size'}
                ]
            }),
            readyEvent: 'ready'
        }
        ];
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
