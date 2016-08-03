Ext.define("CA.TechnicalServices.calculator.DefectResponseTimeCalculator", {
    extend: "Rally.data.lookback.calculator.TimeInStateCalculator",

    config: {
        closedStateValues: ['Fixed','Closed','Junked','Duplicate'],
        productionDefects: [],
        showOnlyProduction: false,
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
        
        console.log('closed states:', me.closedStateValues, snapshots.length);
        
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
            cycle_times.push(time_difference);
            
            snapshot.__cycle = time_difference;
            if ( me.granularity == 'day' ) { snapshot.__cycle = time_difference / 24; }
        });

        var series = [];
        var categories = Ext.Object.getKeys(this.buckets);
        
        series = [{type: 'column', name:'Defects',data: this._putTimesInBuckets(cycle_times)}];
        
        return {
            categories: categories,
            series: series
        }
    },
    
    _putTimesInBuckets: function(ages) {
        var bucket_ranges = this.buckets;
        var buckets = {};
        
        Ext.Object.each(bucket_ranges, function(key, value){
            buckets[key] = [];
        });
        
        Ext.Array.each(ages, function(age){
            
            var bucket_choice = null;
            Ext.Object.each( bucket_ranges, function( key, value ) {
                if ( age >= value ) {
                    bucket_choice = key;
                }
            });
            
            buckets[bucket_choice].push(age);
            
        });
        
        var data = [];
        Ext.Object.each(buckets, function(key,items){
            data.push(items.length);
        });
        
        return data;
    },
    
    onPointClick: function(evt) {
        // override with configuration setting
    }
    
 });