Ext.define('CA.techservices.container.GridBox',{
    extend: 'Ext.container.Container',
    alias:  'widget.tsgridbox',
    
    items: [
        {xtype:'container', itemId:'grid_box'},
    ],
    
    setGrid: function(config) {
        var box = this.down('#grid_box');
        box.removeAll();
        
        box.add(config);
    }
});