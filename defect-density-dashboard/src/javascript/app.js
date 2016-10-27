Ext.define("DDApp", {
    extend: 'CA.techservices.app.ChartApp',

    descriptions: [
        "<strong>Defect Density per Timebox</strong><br/>" +
            "<br/>" +
            "The top stacked bar chart displays the total number of stories versus stories with at least one defect" 
            ,
        "<strong>Percentage of Stories with Defects</strong><br/>"+
            "<br/>" +
            "The brown line graph displays the percentage of stories that are affected by at least one defect" ,
        "<strong>Percentage of Points Affected by Defects</strong><br/>"+
             "<br/>" +
            "The red line graph displays the percentage of points that are affected by defects in the sprint" 
    ],
    
    
    integrationHeaders : {
        name : "DDApp"
    },
    
    config: {
        chartLabelRotationSettings:{
            rotateNone: 0,
            rotate45: 10,
            rotate90: 15 
        },
        defaultSettings: {
            showPatterns: false,
            foundByColumn: 'c_FoundBy',
            typeFieldValue: 'UAT'
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
                this._makeMiddleChart(artifacts_by_timebox);
                this._makeBottomChart(artifacts_by_timebox);
                this._makeRawBottomGrid(artifacts_by_timebox);
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
            filters: [{property:start_field, operator: '<=', value: Rally.util.DateTime.toIsoString(new Date)}],
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
        var deferred = Ext.create('Deft.Deferred');
        

        var type = this.timebox_type;
        
        var start_field = "StartDate";
        var end_field = "EndDate";
        if ( type == "Release" ) {
            start_field = "ReleaseStartDate";
            end_field   = "ReleaseDate";
        }
        
        var first_date = timeboxes[0].get(start_field);
        var last_date = timeboxes[timeboxes.length - 1].get(end_field);

        var filters = [
            {property: type + '.' + start_field, operator: '>=', value:first_date},
            {property: type + '.' + end_field, operator: '<=', value:last_date}
        ];

        

        var config = {
            model:'HierarchicalRequirement',
            limit: Infinity,
            filters: filters,
            fetch: ['FormattedID','Name','ScheduleState','Iteration','ObjectID','Defects',
                'PlanEstimate','Project','Release','AcceptedDate',start_field,end_field]
        };
        
        Deft.Chain.sequence([
            function() { 
                return me._loadStoryRecords(config);
            }
        ],this).then({
            success: function(results) {
                console.log('final res>>',results);
                deferred.resolve(Ext.Array.flatten(results));
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
        });
        return deferred.promise;
    },

    _loadStoryRecords: function(config){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;

        Ext.create('Rally.data.wsapi.Store', config).load({
            callback : function(records, operation, successful) {
                if (successful){       
                    var promises = [];

                    Ext.Array.each(records,function(story){
                        promises.push(function(){
                            return me._getCollection(story); 
                        });

                    },me);

                    Deft.Chain.sequence(promises).then({
                            success: function(results){
                                console.log('_getCollection',results)
                                deferred.resolve(results);
                            },
                            scope:me
                    });


                } else {
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },

    _getCollection: function(story){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;       


        if(story.get('Defects').Count > 0 ){
            var foundByColumn = me.getSetting('typeField');
                     
            story.getCollection('Defects').load({
                fetch: ['FormattedID', 'Name', 'State',foundByColumn],
                //filters: filter,
                //limit: Infinity,
                callback: function(records, operation, success) {
                    story.set('__defects',records);
                    deferred.resolve(story);
                }
            });
        }else{
            deferred.resolve(story);
        }

        return deferred.promise;
    },

    _collectArtifactsByTimebox: function(items) {
        this.logger.log('1 _collectArtifactsByTimebox', items);
        var me = this;
        var foundByColumn = me.getSetting('typeField');
        var foundByValues = me.getSetting('typeFieldValue').split(',');        
        var hash = {},
            timebox_type = this.timebox_type;

        
        if ( items.length === 0 ) { return hash; }
        
        var base_hash = {
            records: {
                All: [],
                With_Defects:[]
            }
        };

        Ext.Array.each(items, function(item){
            var timebox = item.get(timebox_type).Name;
            
            if ( Ext.isEmpty(hash[timebox])){
                
                hash[timebox] = Ext.Object.merge({}, Ext.clone(base_hash) );
            }
            hash[timebox].records.All.push(item);

            Ext.Array.each(item.get('__defects'),function(defect){
                if(Ext.Array.contains(foundByValues,defect.get(foundByColumn))){
                    hash[timebox].records['With_Defects'].push(item);
                    return false;
                }
            });
            
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
        var series = [],
            allowed_types = ['All','With_Defects'];
        
        Ext.Array.each(allowed_types, function(allowed_type){
            var name = allowed_type;

            series.push({
                name: name,
                color: allowed_type == 'All' ? CA.apps.charts.Colors.blue_dark:CA.apps.charts.Colors.blue,
                data: this._calculateTopMeasure(artifacts_by_timebox,allowed_type),
                type: 'column',
                pointPadding: allowed_type == 'All' ? 0 : 0.15,
                pointPlacement: 0                
            });
        },this);
        
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

            data.push({ 
                y:records.length,
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
        var foundByValues = me.getSetting('typeFieldValue') ? me.getSetting('typeFieldValue') : 'None';
        return {
            chart: { type:'column' },
            title: { text: 'Defect Density - Stories vs Stories with Defects' },
            subtitle: { text: 'Defect Found By: ' + foundByValues},
            xAxis: {
                labels:{
                    rotation:this._rotateLabels()
                }
            },
            yAxis: [{ 
                title: { text: 'Total Stories vs Stories w/ Defects' }
            }],
            plotOptions: {
                column: {
                    grouping: false,
                    shadow: false,
                    borderWidth: 0
                }
            },
            tooltip: {
                formatter: function() {
                    return '<b>'+ this.series.name +'</b>: '+ Ext.util.Format.number(this.point.y, '0.##');
                }
            }
        }
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
        var series = [];
        
        var name = "Percentage";
        series.push({
            name: name,
            data: this._calculateMiddleMeasure(artifacts_by_timebox)
        });

        return series;
    },


    _calculateMiddleMeasure: function(artifacts_by_timebox) {
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

            y_value = value.records.All.length > 0 ? Math.round((value.records.With_Defects.length / value.records.All.length) * 100):0;
            data.push({ 
                y: y_value
            });
        });
        return data;
    },       


    _getMiddleChartConfig: function() {
        var me = this;
        return {
            chart: { type: 'line' },
            title: { text: 'Percentage of Stories with Defects' },
            xAxis: {
                labels:{
                    rotation:this._rotateLabels()
                },
                title: { }
            },
            yAxis: [{ 
                title: { text: '% of Stories w/ Defects' }
            }],
            plotOptions: {
                line: {
                        color: '#808080',
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
        var series = [];
            
        var name = "Percentage";
        series.push({
            name: name,
            data: this._calculateBottomMeasure(artifacts_by_timebox),
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
            
            var all_points =0;
            var defect_points = 0;
            Ext.Array.each(value.records.All,function(story){
                all_points += story.get('PlanEstimate') > 0 ? story.get('PlanEstimate') : 0;
            });

            Ext.Array.each(value.records.With_Defects,function(story){
                defect_points += story.get('PlanEstimate') > 0 ? story.get('PlanEstimate') : 0;
            });

            y_value = all_points > 0 ? Math.round((defect_points / all_points) * 100):0;

            data.push({ 
                y: y_value
            });
        });

        return data;
    },    
    
    _getBottomChartConfig: function() {
        var me = this;
        return {
            chart: { type: 'line' },
            title: { text: 'Percentage of Points Affected by Defects' },
            xAxis: {
                labels:{
                    rotation:this._rotateLabels()
		            },
                title: { }
            },
            yAxis: [{ 
                title: { text: '% of Points Affected by Defects' }
            }],
            plotOptions: {
                line: {
                        color: 'red',
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
       
        var columns = [{dataIndex:'Name',text:'Counts'}];
        Ext.Array.each(this._getCategories(artifacts_by_timebox), function(field){
            columns.push({ dataIndex: me._getSafeIterationName(field) + "_number", text: field, align: 'center',flex:1});
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
        },2);

    },
    
    _getRawBottomRows: function(artifacts_by_timebox) {
        var me = this;
        // sprint objects have key = name of sprint
        
        var row_fields = this._getCategories(artifacts_by_timebox);
         
        this.logger.log('row_fields', row_fields);
        
        var rows = [
            {Type:'TotalStoryCount', Name: 'Total Story Count'},
            {Type:'TotalDefectCount',  Name: 'Total Defect Count' },
            {Type:'StoryCountInDefects', Name: 'Story Count Within Defects' }
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

              
                row[sprint_name + "_number"] = me._getBottomSize(value,type); 
                
            });
        });
        
        return rows;
    },


    _getBottomSize:function(value,type){

            var size = 0;

            if('TotalStoryCount' == type){
                size = value.records.All.length;
            }else if('StoryCountInDefects' == type){
                size = value.records.With_Defects.length;
            }else if('TotalDefectCount' == type){
                Ext.Array.each(value.records.With_Defects, function(story){
                    size += story.get('Defects').Count;
                }); 
            }

            return size;
    },

    _getCategories: function(artifacts_by_timebox) {
			return Ext.Array.map(this.timeboxes, function(timebox) {

		          return timebox.get('Name');

			});
    },

    _filterOutExceptChoices: function(store) {
        var app = Rally.getApp();
        
        store.filter([{
            filterFn:function(field){ 
                
                var forbidden_fields = ['Recycled','Ready'];
                if ( Ext.Array.contains(forbidden_fields, field.get('name') ) ) {
                    return false;
                }
                
                var attribute_definition = field.get('fieldDefinition').attributeDefinition;
                var attribute_type = null;
                if ( attribute_definition ) {
                    attribute_type = attribute_definition.AttributeType;
                }
                if (  attribute_type == "BOOLEAN" ) {
                    return false;
                }
                if ( attribute_type == "STRING" || attribute_type == "STATE" ) {
                    if ( field.get('fieldDefinition').attributeDefinition.Constrained ) {
                        return true;
                    }
                }
                return false;
            } 
        }]);
    },

    getSettingsFields: function() {
        var me = this;
        return [
        {
            xtype:'container',
            html: 'You can limit displayed defects by choosing a field on the defect and one or more values.<br/>' +
                  'Choose the field and value(s) below.'
        },
        {
                name: 'typeField',
                itemId:'typeField',
                xtype: 'rallyfieldcombobox',
                fieldLabel: 'Field',
                labelWidth: 125,
                labelAlign: 'left',
                minWidth: 200,
                margin: '10 10 10 10',
                autoExpand: false,
                alwaysExpanded: false,                
                model: 'Defect',
                bubbleEvents: ['typeFieldChange'],
                _isNotHidden: function(field) {
                    if ( field.hidden ) { return false; }
                    var defn = field.attributeDefinition;
                    if ( Ext.isEmpty(defn) ) { return false; }
                    
                    return ( defn.Constrained && defn.AttributeType == 'STRING' );
                },
                listeners: {
                    ready: function(cb) {
                        //me._filterOutExceptChoices(cb.getStore());
                    },
                    select: function(cb) {
                        this.fireEvent('typeFieldChange',cb);
                    }
                }
            },
            {
                name: 'typeFieldValue',
                itemId:'typeFieldValue',
                xtype: 'rallyfieldvaluecombobox',
                fieldLabel: 'Value',
                labelWidth: 125,
                labelAlign: 'left',
                minWidth: 200,
                margin: '10 10 10 10',
                autoExpand: true,
                alwaysExpanded: true,                
                model: 'Defect',
                field: me.getSetting('typeField'),
                value: me.getSetting('typeFieldValue').split(','),
                multiSelect: true,
                listeners: {
                    ready: function(cb) {
                        cb.setValue(me.getSetting('typeFieldValue').split(','));
                    }
                }, 
                handlesEvents: {
                    typeFieldChange: function(chk){
                        var field = chk.getValue();
                        this.field = chk.model.getField(field);
                        if(this.field){
                            this._populateStore();
                        }
                    }
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
            },
            {
                dataIndex: 'Defects',
                text: 'Defect Count',
                renderer:function(Defects){
                        return Defects.Count;
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
    }
    
});
