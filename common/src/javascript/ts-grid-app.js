Ext.define("CA.techservices.app.GridApp", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    padding: 5,
    
    description: '<em>Deprecated.  Make an array in this.descriptions instead.</em>',
    
    descriptions: [],
    
    items: [
        {xtype:'container', width:'98%', items:[
            {xtype:'container',itemId:'banner_box', layout:'hbox', padding: 10},
            {xtype:'container',itemId:'main_display_box'},
            {xtype:'container',itemId:'additional_display_box'}
        ]}
    ],

    config: {
        defaultSettings: {
            showPatterns: false
        }
    },
    
    launch: function() {
        
        var descriptions = [this.description];
        
        if ( !Ext.isEmpty(this.descriptions) && this.descriptions.length > 0 ) {
            descriptions = this.descriptions;
        }
                
        Ext.Array.each(descriptions, function(description,index){
            this._addGridBox(index);
            this.applyDescription(description,index);
        },this);
    }, 
    
    _addGridBox: function(index) {
        return this.down("#main_display_box").add({
            xtype:'tsgridwithdescription', 
            itemId: 'main_grid_' + index
        });
    },
    
    /*
     * DEPRECATED. Use applyDescription
     */
    setDescription: function() {
        this.applyDescription(this.description,0);
    },
    
    applyDescription: function(description,index) {
        this.getGridBox(index).setDescription(description);
    },
    
    clearBanner: function() {
        this.down('#banner_box').removeAll();
    },
    
    addToBanner: function(config) {
        return this.down('#banner_box').add(config);
    },
    
    
    /*
     * DEPRECATED. Use getGridBox, setGrid instead.
     */
    clearAdditionalDisplay: function() {
        this.down('#additional_display_box').removeAll();
    },
    
    addToAdditionalDisplay: function(config) {
        return this.down('#additional_display_box').add(config);
    },
    

    getGridBox: function(index) {
        if ( Ext.isEmpty( index ) ) { index = 0; }
        return this.down('#main_grid_' + index);
    },
    
    setGrid: function(config,index) {
        this.getGridBox(index).setGrid(config);
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
      
});
