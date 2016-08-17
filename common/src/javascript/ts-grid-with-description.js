Ext.define('CA.techservices.container.GridWithDescription',{
    extend: 'Ext.container.Container',
    alias:  'widget.tsgridwithdescription',
    
    layout: 'hbox',
    
    items: [
        {xtype:'container', itemId:'grid_box', flex: 1},
        {xtype:'container', itemId:'description_box'}
    ],
    
    setDescription: function(description) {
        var box = this.down('#description_box');
        box.removeAll();
        
        if ( Ext.isEmpty(description) ) {
            return;
        }
        box.add({
            xtype:'panel',
            ui: 'info-box',
            title: '<span class="icon-info-circle"> </span>',
            collapsible: true,
            collapsed: true,
            collapseDirection: 'right',
            headerPosition: 'left',
            width: 375,
            height: 375,
            margin: 5,
            overflowY: 'auto',
            html: description,
            listeners:{
                collapse: function(){
                    this.up().previousSibling().focus();
                },
                expand: function(){
                    this.up().previousSibling().focus();
                }
            }
            
        });
    },
    
    setGrid: function(config) {
        var box = this.down('#grid_box');
        box.removeAll();
        config.height = 375;
        box.add(config);
    }
});