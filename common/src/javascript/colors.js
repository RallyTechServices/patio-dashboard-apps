Ext.define("CA.apps.charts.Colors", {
    
    singleton: true, 
    
    // RGB values obtained from here: http://ux-blog.rallydev.com/?cat=23
    grey4: "#C0C0C0",  // $grey4
    orange: "#FF8200",  // $orange
    gold: "#F6A900",  // $gold
    yellow: "#FAD200",  // $yellow
    lime: "#8DC63F",  // $lime
    green_dk: "#1E7C00",  // $green_dk
    blue_link: "#337EC6",  // $blue_link
    blue: "#005EB8",  // $blue
    blue_dark: '#00386e', 
    blue_light: '#b2cee9',
    purple : "#7832A5",  // $purple,
    pink : "#DA1884",   // $pink,
    grey7 : "#666",

    cumulativeFlowColors : function() {
        return [
            this.grey4, this.orange, this.gold, this.yellow, this.lime, this.green_dk, this.blue_link, this.blue, this.purple, this.pink
        ];
    },

    burnLineColor : function (){ return this.blue; },
    burnColumnColor : function() { return this.lime; },
    
    getConsistentBarColors: function() { return [this.grey4, this.blue_light, this.blue, this.blue_dark ]; },
    
    getConsistentBarPatterns: function() { 
        return [
            'url(#circles)',
            'url(#diagonal-down)',
            'url(#diagonal-up)',
            'url(#vertical)',
            'url(#horizontal)',
            'url(#squares)',
            'url(#diamonds)',
            'url(#highcharts-default-pattern-6)',
            'url(#highcharts-default-pattern-7)'
        ];
    }
});
