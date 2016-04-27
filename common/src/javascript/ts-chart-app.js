Ext.define("CA.techservices.app.ChartApp", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    padding: 5,
    
    description: '<em>No Description Available</em>',
    
    items: [
        {xtype:'container', width:'98%', items:[
            {xtype:'container',itemId:'banner_box'},
            {xtype:'tschartwithdescription' },
            {xtype:'container',itemId:'additional_display_box'}
        ]}
    ],

    config: {
        defaultSettings: {
            showPatterns: false
        }
    },
    
    launch: function() {
        this.setDescription();
    }, 
    
    setDescription: function() {
        this.down('tschartwithdescription').setDescription(this.description);
    },
    
    clearBanner: function() {
        this.down('#banner_box').removeAll();
    },
    
    addToBanner: function(config) {
        return this.down('#banner_box').add(config);
    },
    
    clearAdditionalDisplay: function() {
        this.down('#additional_display_box').removeAll();
    },
    
    addToAdditionalDisplay: function(config) {
        return this.down('#additional_display_box').add(config);
    },
    
    setChart: function(config) {
        return this.down('tschartwithdescription').setChart(config);
    },
    
    getDrillDownColumns: function(title) {
        return [
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
        ];
    },
    
    showDrillDown: function(stories, title) {
        var me = this;

        var store = Ext.create('Rally.data.custom.Store', {
            data: stories,
            pageSize: 2000
        });
        
        Ext.create('Rally.ui.dialog.Dialog', {
            id        : 'detailPopup',
            title     : title,
            width     : Ext.getBody().getWidth() - 50,
            height    : Ext.getBody().getHeight() - 50,
            closable  : true,
            layout    : 'border',
            items     : [
            {
                xtype                : 'rallygrid',
                region               : 'center',
                layout               : 'fit',
                sortableColumns      : true,
                showRowActionsColumn : false,
                showPagingToolbar    : false,
                columnCfgs           : this.getDrillDownColumns(title),
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
    },
    
    getSettingsFields: function() {
        return [
        { 
            name: 'showPatterns',
                xtype: 'rallycheckboxfield',
                boxLabelAlign: 'after',
                fieldLabel: '',
                margin: '0 0 25 200',
                boxLabel: 'Show Patterns<br/><span style="color:#999999;"><i>Tick to use patterns in the chart instead of color.</i></span>'
        }
        ];
    }
    
    
    
});
