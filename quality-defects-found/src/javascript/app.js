Ext.define("TSQualityDefectsFound", {
    extend: 'CA.techservices.app.ChartApp',

    description: "<strong>Quality - Defect Density</strong><br/>" +
    "<br/>" +
    "Quality-Defect Density is the representation of the number of defects found in each environment selected, per workday  " + 
    "<br/>" + 
    "This number is for the project(s) in scope only." + 
    "<br/>" + 
    "The test environments can be set on app settings.",
    
    integrationHeaders : {
        name : "TSQualityDefectsFound"
    },
    
    config: {
        defaultSettings: {
            showPatterns: false,
            envFieldValue:""
        }
    },

    getSettingsFields: function() {
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
            name: 'envFieldValue',
            itemId:'envFieldValue',
            xtype: 'rallyfieldvaluecombobox',
            fieldLabel: 'Environment',
            labelWidth: 125,
            labelAlign: 'left',
            minWidth: 200,
            margin: '10 10 10 10',
            autoExpand: true,
            alwaysExpanded: true,
            multiSelect: true,                
            model: 'Defect',
            field: 'Environment'
        }
        ];        
    },
         

    launch: function() {
        this.callParent();

        if ( Ext.isEmpty(this.getSetting('envFieldValue')) ) { 
            Ext.Msg.alert('Configuration Note', 'Use the App Settings item on the gear menu to set the field that defines Environment type.');
            return;
        }
        
        this.allowed_types = this._getEnvs();
        this._updateData();

    },

    _getEnvs: function(){
        var envs = this.getSetting('envFieldValue') || [];
        if (!(envs instanceof Array)){
            envs = envs.split(',');
        }
        return envs;
    },
    
    _updateData: function() {
        var me = this;
        
        this.setLoading("Gathering Defects...");
        this._getCreatedDefects().then({
            scope: this,
            success: function(defects) {
                this._makeChart(defects);
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem Loading defects',msg);
            }
        }).always(function() { me.setLoading(false); });
    },
    
    _getMonthStartLastYear: function() {
        var today = new Date();
        var last_year = Rally.util.DateTime.add(today,'month',-12);
        
        last_year.setHours(0,0,0,0);
        last_year.setDate(1);
        
        return last_year;
    },
    
    _getYearOfBuckets: function() {
        var initial = this._getMonthStartLastYear();
        
        return Ext.Array.map( _.range(12), function(i) {
            start = Rally.util.DateTime.add(initial,'month',i);
            end = start;
            end = new Date(start.getFullYear(),end.getMonth()+1,0);
            differnce = Rally.technicalservices.util.Utilities.daysBetween(start,end,true);
            return {"Start":start,"End":end,"Difference":differnce};
        });
    },
    
    _getCreatedDefects: function() {
        var start_date = this._getMonthStartLastYear();
        var start_date_iso = Rally.util.DateTime.toIsoString(start_date);
        
        this.logger.log('Start Date', start_date, start_date_iso);
        var filters = [{property:'CreationDate',operator:'>=',value:start_date_iso}];
        
        config = {
            model: 'Defect',
            filters: filters,
            fetch: ['FormattedID','Name','State','Project','CreationDate','Environment']
        };
        
        return TSUtilities.loadWsapiRecords(config);
    },
    
    _makeChart: function(defects) {
        var categories = this._getCategories();
        var series = this._getQualitySeries(defects);
        var colors = CA.apps.charts.Colors.getConsistentBarColors();
        if ( this.getSetting('showPatterns') ) {
            colors = CA.apps.charts.Colors.getConsistentBarPatterns();
        }
        this.setChart({
            chartData: { series: series, categories: categories },
            chartConfig: this._getChartConfig(),
            chartColors: colors
        },0);
    },
    
    _getCategories: function() {
        return Ext.Array.map(this._getYearOfBuckets(), function(start_of_month){
            return Ext.util.Format.date(start_of_month.Start,'Y-m');
        });
    },
    
    //
    _getQualitySeries: function(defects) {
        var series = [],
            allowed_types = this.allowed_types;

        var me = this,
            defects_by_bucket = {};
        var buckets = this._getYearOfBuckets();
        
        Ext.Array.each(buckets, function(bucket){
            defects_by_bucket[Ext.util.Format.date(bucket.Start, 'Y-m')] = {"Difference":bucket.Difference,records:{}};
        });
        
        Ext.Array.each(defects, function(defect){
            var accepted_date = defect.get('CreationDate');
            var bucket = Ext.util.Format.date(accepted_date,'Y-m');
            var environement = defect.get('Environment') == ''?'None' : defect.get('Environment');
            if ( defects_by_bucket[bucket] ) {
                if(defects_by_bucket[bucket].records && defects_by_bucket[bucket].records[environement]){
                    defects_by_bucket[bucket].records[environement].push(defect);
                }else{
                    defects_by_bucket[bucket].records[environement] = [defect];
                }
            }
        });
        
        Ext.Array.each(allowed_types, function(allowed_type){
            var name = allowed_type;
            if ( Ext.isEmpty(name) ) { name = "-None-"; }
            
            series.push({
                name: name,
                data: this._calculateMeasure(defects_by_bucket,allowed_type),
                type: 'column',
                stack: 'a'
            });
        },this);

        return series;

    },
    

    _calculateMeasure: function(defects_by_bucket,allowed_type) {
        var me = this,
        data = [];

        var data = Ext.Array.map(Ext.Object.getKeys(defects_by_bucket), function(bucket){
            var value = defects_by_bucket[bucket].records[allowed_type] ? defects_by_bucket[bucket].records[allowed_type].length/defects_by_bucket[bucket].Difference:0;
            return {
                y: value,
                _records: defects_by_bucket[bucket].records[allowed_type] ? defects_by_bucket[bucket].records[allowed_type]:[],
                events: {
                    click: function() {
                        me.showDrillDown(this._records,  bucket+": "+Ext.util.Format.number(value, '0.##')+" Points");
                    }
                }
            };
        });
        return data
    },

    _getChartConfig: function() {
        var me = this;
        return {
            chart: { type:'column' },
            title: { text: 'Defect Density' },
            subtitle: {text: 'Environments: ' + me.getSetting('envFieldValue') },
            xAxis: {},
            yAxis: [{ 
                title: { text: 'Count' }
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
 
    getDrillDownColumns: function(title) {
        var columns = [{
            dataIndex : 'FormattedID',
            text: "id"
        },
        {
            dataIndex: 'Name',
            text: 'Name',
            flex: 1
        },
        {
            dataIndex: 'State',
            text: 'State'
        },
        {
            dataIndex: 'Environment',
            text: 'Environment'
        },        
        {
            dataIndex: 'CreationDate',
            text:'Creation Date'
        },
        {
            dataIndex: 'Project',
            text: 'Project',
            flex: 1,
            renderer: function(value,meta,record){
                if ( Ext.isEmpty(value) ) {
                    return "";
                }
                return value._refObjectName;
            }
        }];
        
        return columns;
    }
    
});
