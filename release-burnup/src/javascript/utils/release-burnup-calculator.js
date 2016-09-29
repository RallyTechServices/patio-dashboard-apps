Ext.define('Rally.technicalservices.ReleaseBurnupCalculator',{
    extend: 'Rally.data.lookback.calculator.TimeSeriesCalculator',
    config: {
        completedScheduleStateNames: ['Accepted'],
        usePoints: true,
        plannedPredictionLineName: "Prediction (Planned Points)",
        acceptedPredictionLineName: "Prediction (Accepted Points)"
    },

    constructor: function(config) {
        this.initConfig(config);
        this.callParent(arguments);
    },
    runCalculation: function (snapshots) {
        var calculatorConfig = this._prepareCalculatorConfig(),
            seriesConfig = this._buildSeriesConfig(calculatorConfig);

        var calculator = this.prepareCalculator(calculatorConfig);
        calculator.addSnapshots(snapshots, this._getStartDate(snapshots), this._getEndDate(snapshots));

        this.snapshots = snapshots;

        return this._transformLumenizeDataToHighchartsSeries(calculator, seriesConfig);
    },
    _getTypes: function(){
        var typeHierarchy = [];
        if (this.showStories){
            typeHierarchy.push('HierarchicalRequirement');
        }
        if (this.showDefects){
            typeHierarchy.push('Defect');
        }
        return typeHierarchy;
    },
    getDerivedFieldsOnInput: function() {
        var completedScheduleStateNames = this.getCompletedScheduleStateNames(),
            usePoints = this.usePoints;

        var fields = [
            {
                "as": "Planned",
                "f": function(snapshot) {
                    if (snapshot.ScheduleState){ //We've added this to weed out the portfolio items for the count
                        if (usePoints){
                            return snapshot.PlanEstimate || 0;
                        } else {
                            return 1;
                        }
                    }
                    return 0;
                }
            }];

        var typeHierarchy = this._getTypes();

        Ext.Array.each(completedScheduleStateNames, function(ss){
            Ext.Array.each(typeHierarchy, function(t){
                fields.push({
                    "as": ss + t,
                    "f": function(snapshot) {
                        if (Ext.Array.contains(snapshot._TypeHierarchy, t) && snapshot.ScheduleState === ss) {
                            if (usePoints){
                                return snapshot.PlanEstimate || 0;
                            } else {
                                return 1;
                            }
                        }
                        return 0;
                    }
                });
            });
        });

        return fields;
    },
    getMetrics: function() {
        var completedScheduleStateNames = this.getCompletedScheduleStateNames(),
            metrics = [],
            typeHierarchy = this._getTypes();

        Ext.Array.each(completedScheduleStateNames, function(ss){
            Ext.Array.each(typeHierarchy, function(t){
                metrics.push({
                    "field": ss+t,
                    "f": "sum"
                });
            });
        });

        metrics = metrics.concat([{
            "field": "Planned",
            "f": "sum"
        }]);

        return metrics;
    },
    _getSummedData: function(seriesData, metricNames, types){
        if (!Ext.isArray(metricNames)){
            metricNames = [metricNames];
        }
        types = types || [];

        var sum_xy = 0;
        var sum_x = 0;
        var sum_y = 0;
        var sum_x_squared = 0;
        var n = 0;
        var current_date = new Date();

        for (var i=0; i<seriesData.length; i++){
            var val = 0;

            Ext.Array.each(metricNames, function(m){
                if (types.length > 0){
                    Ext.Array.each(types, function(t){

                        val += (seriesData[i][m + t + "_sum"] || 0);
                    });
                } else {
                    val += (seriesData[i][m + "_sum"] || 0);
                }

            });

            if (val){
                sum_xy += val * i;
                sum_x += i;
                sum_y += val;
                sum_x_squared += i * i;
                n++;
            }

            if (i + 1 < seriesData.length){
                var point_date = Rally.util.DateTime.fromIsoString(seriesData[i+1].tick);
                if (point_date > current_date) {
                    i = seriesData.length;
                }
            }
        }
        return {
            sumXY: sum_xy,
            sumX: sum_x,
            sumY: sum_y,
            sumXSquared: sum_x_squared,
            n: n
        };
    },
    _getSlope: function(summedData){
        if ((summedData.n * summedData.sumXSquared - summedData.sumX * summedData.sumX) !== 0){
            return (summedData.n*summedData.sumXY - summedData.sumX * summedData.sumY)/(summedData.n*summedData.sumXSquared - summedData.sumX * summedData.sumX);
        }
        return 0;
    },
    _getIntercept: function(summedData){
        var slope = this._getSlope(summedData);
        if (summedData.n === 0){
            return 0;
        }
        return (summedData.sumY - slope * summedData.sumX)/summedData.n;
    },
    getSummaryMetricsConfig: function () {
        var me = this,
            completedScheduleStates = this.completedScheduleStateNames,
            summaryMetrics = [],
            types = this._getTypes();

        if (this.showPlannedPredictionLine){
            summaryMetrics = summaryMetrics.concat({
                "as": "planned_slope",
                "f": function(seriesData, metrics) {
                    var summedData = me._getSummedData(seriesData, "Planned");
                    return me._getSlope(summedData);
                }
            },{
                "as": "planned_intercept",
                "f": function(seriesData, metrics) {
                    var summedData = me._getSummedData(seriesData, "Planned");
                    return me._getIntercept(summedData);
                }
            });
        }

        if (this.showAcceptedPredictionLine){
            summaryMetrics = summaryMetrics.concat({
                "as": "accepted_slope",
                "f": function(seriesData, metrics) {
                    var summedData = me._getSummedData(seriesData, completedScheduleStates, types);
                    return me._getSlope(summedData);
                }
            },{
                "as": "accepted_intercept",
                "f": function(seriesData, metrics) {
                    var summedData = me._getSummedData(seriesData, completedScheduleStates, types);
                    return me._getIntercept(summedData);
                }
            });
        }
        return summaryMetrics;
    },
    getDerivedFieldsAfterSummary: function () {

        var metrics = [],
            completedScheduleStateNames = this.getCompletedScheduleStateNames(),
            typeHierarchy = this._getTypes();

        var now = new Date(),
            endOfDayToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59,999);

        Ext.Array.each(completedScheduleStateNames, function(ss){
            Ext.Array.each(typeHierarchy, function(t){
                var fieldDisplayName = Ext.String.format("{0} ({1})",ss,t.replace('HierarchicalRequirement','User Story'));
                metrics.push({
                    "as": fieldDisplayName,
                    "f": function(snapshot, index, metrics, seriesData){
                        var point_date = Rally.util.DateTime.fromIsoString(snapshot.tick);
                       // console.log('point_date', point_date, endOfDayToday)
                        if (point_date > endOfDayToday){
                            return null;
                        }
                        return snapshot[ss + t + "_sum"];
                    },
                    "display": "column"
                });
            });
        });

        if (this.showPlannedPredictionLine){
            metrics.push({
                "as": "Planned",
                "f": function(snapshot, index, metrics, seriesData){
                    var point_date = Rally.util.DateTime.fromIsoString(snapshot.tick);
                    if (point_date > new Date()){
                        return null;
                    }
                    return snapshot.Planned_sum;
                },
                "display": "line"
            });

           metrics.push({
               "as": this.plannedPredictionLineName ,
               "f": function(snapshot, index, metrics, seriesData) {
                   return Math.round(metrics.planned_intercept + metrics.planned_slope * index);
               },
               "display": "line",
               "dashStyle": "ShortDash"
           });
        } else {
            metrics.push({
                "as": "Planned",
                "f": function(snapshot, index, metrics, seriesData){
                    return snapshot.Planned_sum;
                },
                "display": "line"
            });
        }

        if (this.showAcceptedPredictionLine){
            metrics.push({
                "as": this.acceptedPredictionLineName,
                "f": function(snapshot, index, metrics, seriesData) {
                    return Math.round(metrics.accepted_intercept + metrics.accepted_slope * index);
                },
                "display": "line",
                "dashStyle": "ShortDash"
            });
        }

        return metrics;
    },
    prepareChartData: function (stores) {
        var snapshots = [], ids = [];

        Ext.Array.each(stores, function (store) {
            store.each(function(record){
                var data = record.raw;
                //We need to make sure the snapshots are unique so we are filtering them here.
                //The alternative is making a single store config that can filter both.
                //This approach may not be faster, but it makes the configuration code easier to read.
                if (!Ext.Array.contains(ids, data._id)){
                    ids.push(data._id);
                    snapshots.push(data);
                }
            });
        });
        return this.runCalculation(snapshots);
    },
    _buildSeriesConfig: function (calculatorConfig) {
        var aggregationConfig = [],
            derivedFieldsAfterSummary = calculatorConfig.deriveFieldsAfterSummary;

        for (var j = 0, jlength = derivedFieldsAfterSummary.length; j < jlength; j += 1) {
            var derivedField = derivedFieldsAfterSummary[j];
            aggregationConfig.push({
                name: derivedField.as,
                type: derivedField.display,
                dashStyle: derivedField.dashStyle || "Solid"
            });
        }

        return aggregationConfig;
    }
});
