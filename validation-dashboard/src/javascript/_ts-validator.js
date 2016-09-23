Ext.define('CA.techservices.validator.Validator',{
    alias: 'widget.tsvalidator',
    
    
    /**
     * 
     * [{rule}] An array of validation rules
     */
    rules: [],
    
    /**
     * 
     */
    deliveryTeamProjects: [],       // listing of projects where a SCHEDULED feature might reside

    businessPlanningProjects: [],   // listing of programs where an UNSCHEDULED feature might reside
    
    recordsByModel: {},
    
    categoryField: 'Project',
    
    // fields that all rules should fetch
    fetchFields: [],
    /**
     * 
     * a hash containing events for a data point e.g.,
     * 
     * points will include a field called _records holding the associated records
     * and each record will have a field called __ruleText holding a statement about
     * its violation
     * 
     *     {
     *          click: function() {
     *          me.showDrillDown(this._records,this._name);
     *      }
     */
    pointEvents: null,
    /**
     * 
     * a hash of filters by model type.  Filter will be ANDed to the filters we get from the validation rules 
     * (which are themselves ORed together).
     */
    baseFilters: {},
    
    constructor: function(config) {
        Ext.apply(this,config);
        
        var rules = [];
        
        Ext.Array.each(this.rules, function(rule){
            var name = rule.xtype;
            if ( !Ext.isEmpty(name) ) {
                delete rule.xtype;
                console.log('Initializing ', name);
                rules.push(Ext.createByAlias('widget.' + name, rule));
            }
        });
        
        this.rules = rules;
    },
    
    getRuleDescriptions: function() {
        var text = "<ul>";
        
        Ext.Array.each(this.getActiveRules(), function(rule){
            var rule_description = rule.getDescription() || "";
            if ( !Ext.isEmpty(rule_description) ) {
                text = text + "<li>" + rule_description + "</li>";
            }
        });
        text = text + "</ul>";
        
        return text;
    },
    
    getRules: function(){
        return this.rules;
    },
    
    getActiveRules: function(){
        return Ext.Array.filter(this.getRules(),function(rule){
                return rule.active;
            });
    },

    getFiltersByModel: function() {
        var me = this,
            filters_by_model = {};
            
        Ext.Array.each(this.getActiveRules(), function(rule){
            var model = rule.getModel();
            var filters = rule.getFilters();

            if ( !Ext.isEmpty(model) && !Ext.isEmpty(filters) ) {
                if ( Ext.isEmpty(filters_by_model[model]) ) {
                    filters_by_model[model] = [];
                }
                filters_by_model[model].push(filters);
            }
        });
        
        Ext.Object.each(filters_by_model, function(model, filters){
            filters = Ext.Array.unique( Ext.Array.flatten(filters) );
            filters_by_model[model] = Rally.data.wsapi.Filter.or(filters);
            
            if ( me.baseFilters && me.baseFilters != {} && me.baseFilters[model] != {} ) {
                filters_by_model[model] = filters_by_model[model].and(me.baseFilters[model]);
            }
        });
        
        return filters_by_model;
    },
    
    getFetchFieldsByModel: function() {
        var me = this,
            fields_by_model = {};
            
        Ext.Array.each(this.getActiveRules(), function(rule){
            var model = rule.getModel();
            var fields = rule.getFetchFields();

            if ( !Ext.isEmpty(model) && !Ext.isEmpty(fields) && fields.length > 0 ) {
                if ( Ext.isEmpty(fields_by_model[model]) ) {
                    fields_by_model[model] = [me.categoryField,'Name'];
                }
                fields_by_model[model].push(fields);
            }
        });
        
        Ext.Object.each(fields_by_model, function(model, fields){
            fields = Ext.Array.flatten(fields);
            fields = Ext.Array.push(fields, me.fetchFields);
            
            fields_by_model[model] = Ext.Array.unique(fields);
        });
        
        return fields_by_model;
    },
    
    // returns a promise, promise fulfilled by hash of results by model type
    gatherData: function() {
        var deferred = Ext.create('Deft.Deferred'),
            me = this;
                
        console.log("gatherData:");

        var fetch_by_model = this.getFetchFieldsByModel();
        var filters_by_model = this.getFiltersByModel();
        
        console.log("gatherData: fetch_by_model",fetch_by_model);

        var promises = [];
        Ext.Object.each(fetch_by_model, function(model, fetch){
            var config = {
                model: model,
                fetch: fetch,
                limit: Infinity,
                filters: filters_by_model[model]
            };
            
            promise = function() {
                return this._loadWsapiRecords(config);
            };
            promises.push(promise);
        },this);
        
        Deft.Chain.sequence(promises,this).then({
            success: function(results) {
                me.recordsByModel = {};
                Ext.Array.each(results, function(result) {
                    me.recordsByModel = Ext.apply(me.recordsByModel, result);
                });
                deferred.resolve(results);
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
        });
        return deferred.promise;
    },
    
    getChartData: function() {
        if ( this.recordsByModel == {} ) {
            console.log('No search results');
            return {};
        }
        
        var categories = this.getCategories();
        var series = this.getSeries(categories);
        
        return { series: series, categories: categories };
        
    },
    
    getCategories: function() {
        var me = this,
            records = Ext.Array.flatten(Ext.Object.getValues(this.recordsByModel));
        
        var category_field = this.categoryField;
        
        var possible_categories = Ext.Array.map(records, function(record) {
            return me.getCategoryFromRecord(record,category_field);
        });
        
        return Ext.Array.unique(possible_categories);
    },
    
    getCategoryFromRecord: function(record,category_field) {
        if ( Ext.isEmpty(record.get(category_field)) ) { return ""; }
        if ( Ext.isString(record.get(category_field)) ) { return record.get(category_field); }
        return record.get(category_field)._refObjectName;
    },
    
    getSeries: function(categories) {
        var me = this,
            category_field = me.categoryField,
            series = [];
            
        // one series per rule, one stack per model type
        Ext.Array.each(this.getActiveRules(), function(rule){
            var series_name = rule.getUserFriendlyRuleLabel();
            var model = rule.getModel();
            var records = me.recordsByModel[model];
            
            var failed_records = me.getFailedRecordsForRule(records, rule);

            var records_by_category = me.getRecordsByCategory(failed_records, categories, category_field);
            
            var data = [];
            Ext.Array.each(categories, function(category){
                var category_records = records_by_category[category] || [];
                
                var count = category_records.length;
                var datum = { 
                    y: count,
                    _records: category_records,
                    _name: series_name
                };
                
                if ( !Ext.isEmpty(me.pointEvents) ) {
                    datum.events = me.pointEvents
                }
                data.push(datum);
            });
            series.push({
                name: series_name,
                
                records: failed_records,
                data: data,
                stack: model
            });
        });
        
        return series;
    },
    
    getFailedRecordsForRule: function(records, rule) {
        var failed_records = [];
        Ext.Array.each(records, function(record) {
            var failure = rule.applyRuleToRecord(record);
            if ( failure ) {
                var texts = record.get('__ruleText') || [];
                texts.push(failure);
                record.set('__ruleText', texts);
                failed_records.push(record);
            }
        });
        
        return failed_records;
    },
    
    getRecordsByCategory: function(records, categories, category_field) {
        var me = this,
            record_hash = {};
            
        Ext.Array.each(records, function(record){
            var category = me.getCategoryFromRecord(record,category_field);
            if ( Ext.isEmpty(record_hash[category]) ) {
                record_hash[category] = [];
            }
            record_hash[category].push(record);
        });
        
        return record_hash;
    },
    
    getPrecheckResults: function() {        
        var promises = Ext.Array.map(this.getActiveRules(), function(rule){
            return function() {
                return rule.precheckRule();
            };
        });
        
        if ( promises.length === 0 ) {
            return null;
        }
        
        return Deft.Chain.sequence(promises);
    },
    
    _loadWsapiRecords: function(config) {
        var deferred = Ext.create('Deft.Deferred');
        
        TSUtilities.loadWsapiRecords(config).then({
            success: function(results) {
                var result = {};
                result[config.model] = results;
                deferred.resolve(result);
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
        });
        return deferred.promise;
    }
});