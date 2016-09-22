Ext.define("PVNApp", {
    extend: 'CA.techservices.app.ChartApp',

     
    integrationHeaders : {
        name : "PVNApp"
    },
    
    config: {
        defaultSettings: {
            showPatterns: false,
            showCount:  false,
            model: 'UserStory'
        }
    },
         
    description: "",

    _getDescriptions: function(){
        var me = this;
        var model_names = {'UserStory':'Stories', 'Defect':'Defects'};
        var model = model_names[this.getSetting('model')];
        var metric = 'number of points accepted for each item';
        if ( this.getSetting('showCount') ) {
            metric = 'number of items accepted';
        }
        
        return  Ext.String.format("<strong>Productivity Throughput ({0})</strong><br/>" +
            "<br/>" +
            "This Chart displays the {1} item in each timebox." + 
            "Click on a bar to see a table with the stories for the team in that timebox." +
            "<p/>" +
            "<strong>Notes:</strong>" +
            "<br/>(1) This app only looks at data in the selected project (Team).  Parent/Child scoping and data aggregation (rollups) are not supported.",
            
            model,
            metric
        );
    },


    launch: function() {
        this.description = this._getDescriptions();
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
        
        var model_name = this.getSetting('model');
        console.log('model:', model_name);
        
        var config = {
            model:model_name,
            limit: Infinity,
            filters: filters,
            fetch: ['FormattedID','Name','ScheduleState','Iteration','ObjectID',
                'PlanEstimate','Project','Release','InProgressDate','AcceptedDate',
                'StartDate','EndDate','ReleaseStartDate','ReleaseDate']
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

        // console.log('>>>>items',items);   
        var me = this;
        var hash = {},
            timebox_type = this.timebox_type;

        
        if ( items.length === 0 ) { return hash; }
        
        var base_hash = {
            records: {
                all: []
            }
        };

        Ext.Array.each(items, function(item){
            var timebox = item.get(timebox_type).Name;
            
            if ( Ext.isEmpty(hash[timebox])){
                hash[timebox] = Ext.Object.merge({}, Ext.clone(base_hash) );
            }
            hash[timebox].records.all.push(item);
           
        });
        
        return hash;

    },
        
    _makeChart: function(artifacts_by_timebox) {
        console.log('artifacts_by_timebox>>>>',artifacts_by_timebox);
        var me = this;
        
        var model_names = {'UserStory':'Stories', 'Defect':'Defects'};
        var model_name = model_names[this.getSetting('model')];
        var type = "Velocity";
        if ( me.getSetting('showCount') ) { type = "Throughput"; }
        
        var title = Ext.String.format('Productivity {0} ({1})',
            type,
            model_name
        );
        
        var name = me.getSetting('showCount') ? 'Counts':'Points';
        var categories = this._getCategories(artifacts_by_timebox);
        var series = this._getSeries(artifacts_by_timebox);        
        var colors = CA.apps.charts.Colors.getConsistentBarColors();
        
        if ( this.getSetting('showPatterns') ) {
            colors = CA.apps.charts.Colors.getConsistentBarPatterns();
        }

        this.setChart({
            chartData: {
                categories: categories,
                series: [{
                    name: name, 
                    data: series
                }]
            },
            chartConfig: { 
                chart: {type: 'column'},
                title: {text: title},
                xAxis: {},
                yAxis: {title: {text: name}},
                plotOptions: {
                    column: {stacking: 'normal'}
                },
                tooltip: {
                    formatter: function() {
                    return '<b>'+ Ext.util.Format.number(this.point.y, '0')+ '</b>';
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
    
    _getSeries: function(artifacts_by_timebox) {
        var me = this;
        var name = me.getSetting('showCount') ? 'Counts':'Points';
        var datapoints = [];
        Ext.Object.each(artifacts_by_timebox, function (key, value) {
            var records = value.records || [];
            var value = 0;
            if(me.getSetting('showCount')){
                value = records.all.length;
            }else{
                Ext.Array.each(records.all,function(story){
                    value += story.get('PlanEstimate');
                });
            }
        
            datapoints.push({
                y: value,
                _records: records,
                events: {
                   click: function () {
                       me.showDrillDown(this._records.all,  "Stories for " + key + " - Total "+name+": " + Ext.util.Format.number(this.y, '0'));
                   }
                }              
            });
        });
            
        return datapoints;
    },
    
    getSettingsFields: function() {
        var artifact_name_store = Ext.create('Ext.data.Store', {
            fields: ['Name','Model'],
            data : [
                { Name: 'User Story', Model: 'HierarchicalRequirement'},
                { Name:'Defect', Model:'Defect'}
            ]
        });        

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
            name: 'showCount',
            xtype: 'rallycheckboxfield',
            boxLabelAlign: 'after',
            fieldLabel: '',
            margin: '0 0 25 25',
            boxLabel: 'Show by Count<br/><span style="color:#999999;"><i>Tick to use story count.  Otherwise, uses story points.</i></span>'
        },
        {
            name: 'model',
            xtype: 'combobox',
            fieldLabel: 'Choose Type',
            store: artifact_name_store,
            queryMode: 'local',
            displayField: 'Name',
            valueField: 'Model',
            margin: '0 0 25 25'
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
                dataIndex: 'PlanEstimate',
                text: 'Plan Estimate',
                flex: 2
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
