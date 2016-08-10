Ext.define('quarter-item-selector', {
    extend : 'Ext.Container',
    componentCls : 'app',
    alias : 'widget.quarteritemselector',
    layout : 'hbox',
    width : '100%',
    mixins : [
        'Rally.Messageable',
        'Ext.state.Stateful'
    ],
    stateful: true,
    stateEvents: ['change'],

    buttonPushed: false,
    constructor : function(config){
        this.callParent(arguments);
    },

    initComponent : function()
    {
        var me = this;
        this.callParent(arguments);
        this.removeAll();

        TSUtilities.getPortfolioItemTypes().then({
            success: function(types) {
                if ( types.length < 2 ) {
                    Ext.Msg.alert('',"Cannot find a record type for EPMS project");
                    return;
                }

                me.featureModelPath = types[0].get('TypePath');
                me.featureModelName = types[0].get('Name');
                me.epmsModelPath = types[1].get('TypePath');
               
                this._getEPMSProjects().then({
                    scope:me,
                    success:function(store){
                        me.programs = store;
                        me._addSelector();                
                    },
                    failure:function(error){
                        me.setLoading(false);
                        Ext.Msg.alert('',msg);
                    }
                });


            },
            failure: function(msg){
                Ext.Msg.alert('',msg);
            },
            scope: this
        });


        // configured to allow others to ask what the current selection is,
        // in case they missed the initial message
        this.subscribe(this, 'requestQuarter', this._requestQuarter, this);

    },
    _addSelector: function(){
        // The data store containing the list of states
        var me = this;
        var quarters = Ext.create('Ext.data.Store', {
            fields: ['abbr', 'name','startDate','endDate'],
            data : [
                {"abbr":"Q12015", "name":"2015 - Q1", "startDate":"2014-10-01", "endDate":"2014-12-31"},
                {"abbr":"Q22015", "name":"2015 - Q2", "startDate":"2015-01-01", "endDate":"2015-03-31"},
                {"abbr":"Q32015", "name":"2015 - Q3", "startDate":"2015-04-01", "endDate":"2015-06-30"},
                {"abbr":"Q42015", "name":"2015 - Q4", "startDate":"2015-07-01", "endDate":"2015-09-30"},            
                {"abbr":"Q12016", "name":"2016 - Q1", "startDate":"2015-10-01", "endDate":"2015-12-31"},
                {"abbr":"Q22016", "name":"2016 - Q2", "startDate":"2016-01-01", "endDate":"2016-03-31"},
                {"abbr":"Q32016", "name":"2016 - Q3", "startDate":"2016-04-01", "endDate":"2016-06-30"},
                {"abbr":"Q42016", "name":"2016 - Q4", "startDate":"2016-07-01", "endDate":"2016-09-30"},
                {"abbr":"Q12017", "name":"2017 - Q1", "startDate":"2016-10-01", "endDate":"2016-12-31"},
                {"abbr":"Q22017", "name":"2017 - Q2", "startDate":"2017-01-01", "endDate":"2017-03-31"},
                {"abbr":"Q32017", "name":"2017 - Q3", "startDate":"2017-04-01", "endDate":"2017-06-30"},
                {"abbr":"Q42017", "name":"2017 - Q4", "startDate":"2017-07-01", "endDate":"2016-09-30"}                
            ]
        });

        var programs = []
        Ext.Object.each(me.programs,function(key,value){programs.push(value.program)});

        var programs_store = Ext.create('Ext.data.Store', {
            fields: ['Name','ObjectID'],
            data : programs
        });        

        this.add({
            xtype: 'combobox',
            fieldLabel: 'Choose Quarter',
            itemId: 'quarter-combobox',
            store: quarters,
            queryMode: 'local',
            displayField: 'name',
            valueField: 'abbr',
            margin: 10,
            listeners:{
                change: this._updateGoButton,
                scope: this,
            }

        });

        this.add({
            xtype: 'combobox',
            fieldLabel: 'Choose Programs',
            itemId: 'program-combobox',
            store: programs_store,
            multiSelect: true,
            queryMode: 'local',
            displayField: 'Name',
            valueField: 'ObjectID',
            margin: 10,
            listeners:{
                change: this._updateGoButton,
                scope: this,
            }

        });

        this.add({
                xtype: 'rallybutton',
                text: 'Go',
                itemId: 'cb-go-button',
                cls: 'rly-small primary',
                disabled: true,
                margin: 10,
                listeners: {
                    scope: this,
                    click: this._updateQuarter
                }
        });

    },

    _updateQuarter: function(){
        this.buttonPushed = true;
        var cb_quarter = this.down('#quarter-combobox');
        var cb_programs = this.down('#program-combobox');

        
        if (cb_quarter && cb_programs){
            var quarter = cb_quarter.findRecordByValue(cb_quarter.value);
            this.quarter_and_programs = {'quarter':quarter,'programs':cb_programs.value};
            this.fireEvent('change', this.quarter_and_programs);
            this.publish('quarterSelected', this.quarter_and_programs);
            if (this.stateful && this.stateId){
                this.saveState();
            }
        }

    },


    _getEPMSProjects:function(){
        var me = this;
        var deferred = Ext.create('Deft.Deferred');

        var config = {
            model: this.epmsModelPath,
            fetch:['ObjectID','Project','Name'],
            context: { 
                project: null
            }
        };
        
        TSUtilities.loadWsapiRecords(config).then({
            success: function(records) {
                var epms_id_projects = {};
                Ext.Array.each(records,function(rec){
                    var project_oid = rec.get('Project').ObjectID;
                    
                    if ( Ext.isEmpty(epms_id_projects[project_oid]) ) {
                        epms_id_projects[project_oid] = {
                            program: rec.get('Project'),
                            projects: []
                        }
                    }
                    
                    epms_id_projects[project_oid].projects.push(rec.getData());
                    
                });
                deferred.resolve(epms_id_projects);
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
            
        });
        
        return deferred.promise;
    },

    _updateGoButton: function(cb) {
        if ( !Ext.isEmpty(cb.getValue()) ) {
            this.down('#cb-go-button').setDisabled(false);
        } else {
            this.down('#cb-go-button').setDisabled(true);
        }
    },

    _requestQuarter : function() {
        // only publish if the go button has been pushed
        if ( this.buttonPushed ) {
            this.publish('quarterSelected', this.quarter_and_programs || null);
            return;
        }
        
        console.log("Requested Quarter, but the user hasn't pushed the Go button");
        
    },

});