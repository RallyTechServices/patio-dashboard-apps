Ext.define('CA.techservices.container.GridBox',{
    extend: 'Ext.container.Container',
    alias:  'widget.tsgridbox',
        
    items: [
        {xtype:'container', region: 'center', itemId:'grid_box'},
    ],
    
    setGrid: function(config) {
        var default_config = {
            margin: 10,
            padding: 10,
            height: 200
        };
                
        var box = this.down('#grid_box');
        box.removeAll();
        
        var new_config = Ext.Object.merge(default_config,config);
        
        box.add(new_config);
    }
});