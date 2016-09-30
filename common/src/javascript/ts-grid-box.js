Ext.define('CA.techservices.container.GridBox',{
    extend: 'Ext.container.Container',
    alias:  'widget.tsgridbox',
    
    layout: 'border',
    
    items: [
        {xtype:'container', region: 'center', layout:'fit', itemId:'grid_box'},
    ],
    
    setGrid: function(config) {
        var box = this.down('#grid_box');
        box.removeAll();
        
        box.add(config);
    }
});