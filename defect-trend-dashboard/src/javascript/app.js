Ext.define("TSDefectTrendDashboard", {
    extend: 'CA.techservices.app.ChartApp',

    description: [
        "<strong>Defect Accumulation</strong><br/>" +
        "<br/>" +
        "What is the defect trend over time? " +
        "This chart shows the trend of opening and closing defects over time." +
        "<p/>"
        
    ],
    
    integrationHeaders : {
        name : "TSDefectTrendDashboard"
    },

    
    config: {
        defaultSettings: {
            showPatterns: false
        }
    },
                        
    launch: function() {
        this.callParent();
        
        this._updateData();

    },
    
    _updateData: function() {
        var me = this;
        
        Deft.Chain.pipeline([
            this._makeAccumulationChart
        ],this).then({
            scope: this,
            success: function(results) {
                //
            },
            failure: function(msg) {
                Ext.Msg.alert('--', msg);
            }
        });
        
    },
    
    _makeAccumulationChart: function() {
        this.setChart({
            xtype: 'rallychart',
            storeType: 'Rally.data.lookback.SnapshotStore',
            storeConfig: this._getChartStoreConfig(),
            
            calculatorType: 'CA.techservices.calculator.DefectAccumulation',
            calculatorConfig: {
            },
            
            chartConfig: this._getAccumulationChartConfig()
        },0);
    },
    
    _getChartStoreConfig: function() {        
        return {
           find: {
               _ProjectHierarchy: this.getContext().getProject().ObjectID , 
               _TypeHierarchy: 'Defect' 
           },
           removeUnauthorizedSnapshots: true,
           fetch: ['ObjectID','State'],
           hydrate: ['State'],
           sort: {
               '_ValidFrom': 1
           }
        };
    },
    
    _getAccumulationChartConfig: function() {
        return {
            chart: {
                zoomType: 'xy'
            },
            title: {
                text: 'Defect Accumulation'
            },
            xAxis: {
                tickmarkPlacement: 'on',
                tickInterval: 20,
                title: {
                    text: 'Date'
                }
            },
            yAxis: [
                {
                    title: {
                        text: 'Count'
                    }
                }
            ],
            plotOptions: {
                series: {
                    marker: {
                        enabled: false
                    }
                },
                area: {
                    stacking: 'normal'
                }
            }
        };
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
                dataIndex: 'WorkProduct',
                text: 'Work Product',
                flex:1,
                renderer: function(value,meta,record) {
                    if ( Ext.isEmpty(value) ) { return ""; }
                    return value.FormattedID + ": " + value.Name;
                }
            },
            {
                dataIndex: 'Estimate',
                text: 'Task Hours (Est)'
            },
            {
                dataIndex: 'Actuals',
                text: 'Task Hours (Actual)'
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
    }
    
});
