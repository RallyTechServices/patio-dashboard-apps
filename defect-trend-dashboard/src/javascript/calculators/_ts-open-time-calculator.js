Ext.define("CA.TechnicalServices.calculator.DefectResponseTimeCalculator", {
    extend: "Rally.data.lookback.calculator.TimeInStateCalculator",

    config: {
        closedStateValues: ['Fixed','Closed','Junked','Duplicate'],
        productionDefects: [],
        showOnlyProduction: false,
        allowedPriorities: [],
        chartType: 'column', /* column or pie */
        buckets: {} /* a hash of values >= */
    },
    
    _isCreatedAfterStart: function(snapshot) {
        var me = this;
        
        if ( me.config.showOnlyProduction) {
            var production_defect_oids = Ext.Array.map(this.config.productionDefects,function(d){
                return d.get('ObjectID')
            });
            
            return (
                snapshot.CreationDate >= Rally.util.DateTime.toIsoString(me.startDate)
                && Ext.Array.contains(production_defect_oids,snapshot.ObjectID)
            );
        }
        return (snapshot.CreationDate >= Rally.util.DateTime.toIsoString(me.startDate));

    },
    
    _isResolved: function(snapshot) {
        var me = this;
        var killed_states = this.config.closedStateValues;

        if ( me.config.showOnlyProduction) {
            var production_defect_oids = Ext.Array.map(this.config.productionDefects,function(d){
                return d.get('ObjectID')
            });
            
            return (
                Ext.Array.contains(killed_states,snapshot.State)
                && Ext.Array.contains(production_defect_oids,snapshot.ObjectID)
                && snapshot.CreationDate >= Rally.util.DateTime.toIsoString(me.startDate)
            );
        }

        return ( 
            Ext.Array.contains(killed_states,snapshot.State)
            && snapshot.CreationDate >= Rally.util.DateTime.toIsoString(me.startDate) 
        );

    },
    
    runCalculation: function (snapshots) {
        var me = this;
                
        this.startDate = this.startDate || this._getStartDate(snapshots);
        this.endDate = this.endDate || this._getEndDate(snapshots);
            
        var final_snaps = Ext.Array.filter(snapshots, function(snapshot){
            return ( me._isResolved(snapshot)  && snapshot._ValidTo == "9999-01-01T00:00:00.000Z" );
        });
        
        var cycle_times = [];
        
        Ext.Array.each(final_snaps,function(snapshot){
            var creation_date_in_js = Rally.util.DateTime.fromIsoString(snapshot.CreationDate);
            var state_date_in_js =    Rally.util.DateTime.fromIsoString(snapshot._ValidFrom);
            
            var time_difference = Rally.util.DateTime.getDifference(state_date_in_js,creation_date_in_js,'hour');

            snapshot.__cycle = time_difference;
            if ( me.granularity == 'day' ) { snapshot.__cycle = time_difference / 24; }
            cycle_times.push({
                age: snapshot.__cycle ,
                snapshot: snapshot
            });
            
        
        });

        var series = [];
        var categories = Ext.Object.getKeys(this.buckets);
        
        series = [{type: 'column', name:'Defects',data: this._putTimesInBuckets(cycle_times)}];

        series = this._addEventsToSeries(series);
        
        series = this._splitBucketsIntoPriorities(series);
        
        return {
            categories: categories,
            series: series
        }
    },
    
    /*
     * expect data like: {
//                age: time_difference,
//                snapshot: snapshot
//            }
     */
    _putTimesInBuckets: function(item_data) {
        var bucket_ranges = this.buckets;
        var buckets = {};
        
        Ext.Object.each(bucket_ranges, function(key, value){
            buckets[key] = [];
        });
        
        Ext.Array.each(item_data, function(item){
            
            var age = item.age;
            
            var bucket_choice = null;
            Ext.Object.each( bucket_ranges, function( key, value ) {
                if ( age >= value ) {
                    bucket_choice = key;
                }
            });
            
            buckets[bucket_choice].push(item);
            
        });
        
        var data = [];
        Ext.Object.each(buckets, function(key,items){
            var records = Ext.Array.map(items, function(item) { return item.snapshot; });
            data.push({
                y: items.length,
                __records: records
            });
        });
        
        return data;
    },
    
    /*
     * given a series where key = bucket_choice and data is an array of
     * [{_records:[],events:function(), y:#},{},...]
     * 
     */
    _splitBucketsIntoPriorities: function(series){
        var series_by_priority = {}; // key will be priority
        var allowed_priorities = this.allowedPriorities;
        
        Ext.Array.each(allowed_priorities, function(p){
            if ( Ext.isEmpty(p) ) { p = "None"; }
            
            series_by_priority[p] = {
                name: p,
                type:'column',
                data: []
            };
        });
        
        Ext.Array.each(series[0].data, function(s){
            var all_records = s.__records ||[];
            var events = s.events;
            var records_by_priority = {};
            
            Ext.Array.each(all_records, function(record){
                var priority = record.Priority;
                if ( Ext.isEmpty(records_by_priority[priority]) ) {
                    records_by_priority[priority] = [];
                }
                records_by_priority[priority].push(record);
            });
            
            Ext.Array.each(allowed_priorities, function(p){
                if ( Ext.isEmpty(p) ) { p = "None"; }
                
                var record_set = records_by_priority[p] || [];
                series_by_priority[p].data.push({
                    y: record_set.length,
                    events: events,
                    __all_records: all_records,
                    __records: record_set
                });
            });
        });
                
        return Ext.Object.getValues(series_by_priority);
    },
    
    _addEventsToSeries: function(series) {
        var me = this;
        
        Ext.Array.each(series, function(s) {
            s.data = Ext.Array.map(s.data, function(datum){
                return {
                    y: datum.y,
                    __records: datum.__records,
                    events: {
                        click: function() {
                            me.onPointClick(this);
                        }
                    }
                }
            });
            
            
        });
        
        
        return series;
    },
    
    
    onPointClick: function(evt) {
        // override with configuration setting
    }
    
 });