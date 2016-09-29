Ext.define("release-burnup", {
    extend: 'CA.techservices.app.ChartApp',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container', width:'98%', items:[
        {xtype:'container',itemId:'headerBox', layout: 'hbox', padding: 10, flex: 1},
        {xtype:'container',itemId:'displayBox', flex: 1},
            {xtype:'container',itemId:'banner_box', layout:'hbox', padding: 10},
            {xtype:'container',itemId:'main_display_box'},
            {xtype:'container',itemId:'additional_display_box'},
        		{xtype:'container', itemId:'description_box'}
        ]}
    ],

    integrationHeaders : {
        name : "ts-release-burnup"
    },
   
    descriptions: [
        "<strong>Release Burn Up Chari</strong><br/>" +
            "<br/>" +
            "The Release Burnup app displays work delivered so far in the " +
            "release to proactively anticipate whether the release scope will be delivered. " +
            "<p/>" +
						"By default, the chart burns up all points or counts from all user " + 
						"stories and defects within the current project scope that meet one  " +
						"of the following criteria: " +
            "<p/> " +
            "<ol/>" +
            "<li>Are descendants of ANY lowest level portfolio item CURRENTLY associated " +
            "with the selected Release (note that the Portfolio Item may be outside of " +
            "the current project scope. Stories associated with Portfolio Items " +
            "outside of the current project scope will be included IF they are within " +
            "the currently selected project scope).</li>" +
            "<li>Are directly associated with the release.</li>" +
            "<li>Defects not directly associated with the release will be included " +
            "if they are associated with a User Story that falls within the " +
            "dataset for (1) or (2).</li>" +
            "</ol>" +
            "<p/>" +
        "<strong>App settings for this release include:</strong><br/>" +
            "<ol/>" +
						"<li>Show Defects (default: true): When unchecked, then no defects will " +
						"be included in the burnup calculations on the chart.</li>" +
						"<li>Show Prediction Lines (default: true): When unchecked, no prediction " +
						"lines for Planned or Accepted points will be calculated or shown on the chart.</li>" +
						"<li>Show User Stories (default: true): When unchecked, will only show " +
						"defects. Note that if both 'Show Defects and Show User Stories' settings " +
						"are unchecked, the chart will ignore this setting and default to showing " +
						"User Stories only.</li>" +
            "</ol>" +
            "<p/> " +
        "<strong>Notes:</strong><br/>" +
            "<ol/>" +
            "<li>Only leaf stories (stories with no children) or defects are included in " +
            "the dataset.</li>" +
            "<li>This chart uses the lookback API to retrieve historical data for the user stories and defects.</li>" +
            "<li>When retrieving user stories for the Portfolio Items associated with " +
            "the release, the app will only look for user stories associated with the " +
            "Portfolio Items that are in the release as of today. If a Portfolio Item " +
            "was removed from the release yesterday, then any stories associated with " +
            "that Portfolio Item not associated directly with the release will not be " +
            "included in the historical dataset.</li>" +
            "</ol>"
    ],
    
    config: {
        defaultSettings: {
            showPlannedPredictionLine: false,
            showAcceptedPredictionLine: true,
            showDefects: true,
            showStories: true,
            showExportButton: false
        }
    },

    chartUnits: ['Points','Count'],  //Default is first in the list
    portfolioItemTypes: ['PortfolioItem/Feature'],
    completedStates: ['Accepted', 'Released'],
    preliminaryEstimateValueHashByObjectID: {},

    timeboxStartDateField: 'ReleaseStartDate',
    timeboxEndDateField: 'ReleaseDate',
    timeboxType: 'release',
    timeboxTypePicker: 'rallyreleasecombobox',

    launch: function() {
        this.callParent();

        Deft.Promise.all([
            Rally.technicalservices.Toolbox.fetchPortfolioItemTypes(),
            Rally.technicalservices.Toolbox.fetchScheduleStates()
        //    Rally.technicalservices.Toolbox.fetchPreliminaryEstimateValues()
        ]).then({
            success: this._initializeApp,
            failure: this._showError,
            scope: this
        });



    },
    _initializeApp: function(results){
        this.portfolioItemTypes = _.map(results[0], function(r){ return r.get('TypePath'); });
        this.completedStates = results[1].slice(_.indexOf(results[1],"Accepted"));
        this.preliminaryEstimateValueHashByObjectID = _.reduce(results[2],function(hash, record){
            hash[record.get('ObjectID')] = record.get('Value');
            return hash;
        },{});
        this.logger.log('_initializeApp', this.portfolioItemTypes, this.completedStates, this.preliminaryEstimateValueHashByObjectID);

        this._addComponents();
    },
    isOnScopedDashboard: function(){
        if (this.getContext().getTimeboxScope() && this.getContext().getTimeboxScope().type === this.timeboxType){
            return true;
        }
        return false;
    },
    _addComponents: function(){
        var headerBox = this.down('#headerBox');
        headerBox.removeAll();
        if (!this.isOnScopedDashboard()){
            var rcb = headerBox.add({
                xtype: this.timeboxTypePicker
            });
            rcb.on('select', this.updateTimebox, this);
            rcb.on('ready', this.updateTimebox, this);
        }
        var cb = headerBox.add({
            xtype: 'tscustomcombobox',
            itemId: 'cbUnit',
            allowedValues: this.chartUnits
        });
        cb.on('select',this._updateBurnup, this);
        if (this.isOnScopedDashboard()){
            this.updateTimebox();
        }

        if (this.getShowExport()){
            var btn = headerBox.add({
                xtype: 'rallybutton',
                iconCls: 'icon-export secondary rly-small',
                margin: '0 0 0 25'
            });
            btn.on('click', this._export, this);
        }

        headerBox.add({
            xtype: 'container',
            itemId: 'etlDate',
            padding: 10,
            tpl: '<tpl><div class="etlDate">Data current as of {etlDate}</div></tpl>'
        });
    },
    _export: function(){
        var chart = this.down('rallychart'),
            snapshots = chart && chart.calculator && chart.calculator.snapshots,
            chartEndDate = chart.calculator.endDate,
            chartStartDate = chart.calculator.startDate;
        this.logger.log('_Export', chart.calculator ,chartStartDate, chartEndDate);
        if (snapshots){
            var csv = [];
            var headers = ['FormattedID','PlanEstimate','ScheduleState','_ValidFrom','_ValidTo'];
            csv.push(headers.join(','));
            Ext.Array.each(snapshots, function(s){
                var validFrom = Rally.util.DateTime.fromIsoString(s._ValidFrom),
                    validTo = Rally.util.DateTime.fromIsoString(s._ValidTo);

                if (validFrom < chartEndDate && validTo >= chartStartDate){
                    var row = [s.FormattedID, s.PlanEstimate, s.ScheduleState, s._ValidFrom, s._ValidTo];
                    csv.push(row.join(','));
                }
            });
            csv = csv.join("\r\n");

            CArABU.technicalservices.Exporter.saveCSVToFile(csv, Ext.String.format('export-{0}.csv', Rally.util.DateTime.format(new Date(), 'Y-m-d')));
        }
    },
    _updateETLDate: function(store, records, success){
        this.logger.log('_updateETLDate', store, records, success);
        var etlDate = store && store.proxy && store.proxy._etlDate;
        if (etlDate){
            this.down('#etlDate').update({etlDate: Rally.util.DateTime.fromIsoString(etlDate)});
        }
    },
    getUnit: function(){
        return this.down('#cbUnit') && this.down('#cbUnit').getValue() || this.chartUnits[0];
    },
    getTimeboxStartDate: function(){
        var record = this.getTimeboxRecord();
        return record.get(this.timeboxStartDateField);
    },
    getTimeboxEndDate: function(){
        var record = this.getTimeboxRecord();
        return record.get(this.timeboxEndDateField);
    },
    getTimeboxRecord: function(){
        var record = null;
        this.logger.log('getTimeboxRecord', this.isOnScopedDashboard(), this.down(this.timeboxTypePicker) && this.down(this.timeboxTypePicker).getRecord())
        if (this.isOnScopedDashboard()){
            record = this.getContext().getTimeboxScope().getRecord();
        } else {
            record = this.down(this.timeboxTypePicker) && this.down(this.timeboxTypePicker).getRecord();
        }
        return record;
    },
    getTimeboxFilter: function(isForTimebox){
        var record = this.getTimeboxRecord();

        var prefix = isForTimebox ? "" : Ext.String.capitalize(this.timeboxType) + ".";

        if (record){
            return Rally.data.wsapi.Filter.and([
                {
                    property: prefix + 'Name',
                    value: record.get('Name')
                },
                {
                    property: prefix + this.timeboxStartDateField,
                    value: Rally.util.DateTime.toUtcIsoString(this.getTimeboxStartDate())
                },
                {
                    property: prefix + this.timeboxEndDateField,
                    value: Rally.util.DateTime.toUtcIsoString(this.getTimeboxEndDate())
                }
            ]);
        }
        return [];
    },
    updateTimebox: function(){
        var timeboxFilter = this.getTimeboxFilter();
        this.logger.log('updateTimebox', timeboxFilter.toString());

        this.releases = [];
        this.portfolioItems = [];

        if (!timeboxFilter || timeboxFilter.length === 0){
            this._showMissingCriteria();
            return;
        }
        this.setLoading(true);
        var promises = [Rally.technicalservices.Toolbox.fetchData({
            model: Ext.String.capitalize(this.timeboxType),
            fetch: ['ObjectID'],
            filters: this.getTimeboxFilter(true)
        }), Rally.technicalservices.Toolbox.fetchData({
            model: this.portfolioItemTypes[0],
            fetch: ['ObjectID','PreliminaryEstimate','Value'],
            context: {project: null},
            filters: timeboxFilter
        })];

        var me = this;
        Deft.Promise.all(promises).then({

            success: function(results){
                this.logger.log('updateTimebox Results', results);
                this.timeboxes = results[0];
                this.portfolioItems = results[1];
                this._updateBurnup();
            },
            failure: this._showError,
            scope: this
        }).always(function(){
            me.setLoading(false);
        });
    },
    onTimeboxScopeChange: function(timeboxScope){
        this.logger.log('onTimeboxScopeChange',timeboxScope);
        if (timeboxScope && timeboxScope.type === this.timeboxType){
            this.getContext().setTimeboxScope(timeboxScope);
            this.updateTimebox();
        }
    },
    _getFieldValueArray: function(records, fieldName){
        return _.map(records || [], function(r){ return r.get(fieldName); });
    },
    _showMissingCriteria: function(){
//        this.down('#displayBox').removeAll();
//        this.down('#displayBox').add({
        this.down('#chart_box').removeAll();
        this.down('#chart_box').add({
            xtype: 'container',
            html: 'Please select a release filter.'
        });
    },
    _showError: function(msg){
        Rally.ui.notify.Notifier.showError({message: msg});
    },
    _getChartColors: function(){
        //In order to keep the colors consistent for the different options,
        //we need to build the colors according to the settings
        var chartColors = [],
            numCompletedStates = this.completedStates.length;

        if (this.getShowStories()){
            chartColors.push('#b2cee9');
        }
        if (this.getShowDefects()){
            chartColors.push('#C0C0C0');
        }
        if (numCompletedStates > 1){
            if (this.getShowStories()){
                chartColors.push('#005EB8');
            }
            if (this.getShowDefects()){
                chartColors.push('#666');
            }
        }
//        chartColors.push('#7CAFD7');005EB8
        chartColors.push('#FF8200');
        if (this.getShowPlannedPredictionLine()){
            chartColors.push('#FF8200');
        }
        if (this.getShowAcceptedPredictionLine()){
            chartColors.push('#F6A900');
        }
        return chartColors;
    },
    _updateBurnup: function(){
        this.logger.log('_updateBurnup', this.getUnit(), this.getTimeboxEndDate());

//        this.down('#displayBox').removeAll();
        this.down('#chart_box').removeAll();

        if (!this.timeboxes || this.timeboxes.length === 0){
            this._showMissingCriteria();
            return;
        }

//        this.down('#displayBox').add({
        this.down('#chart_box').add({
            xtype: 'rallychart',
            chartColors: this._getChartColors(),
            storeType: 'Rally.data.lookback.SnapshotStore',
            storeConfig: this._getStoreConfig(),
            calculatorType: 'Rally.technicalservices.ReleaseBurnupCalculator',
            calculatorConfig: {
                usePoints: this.getUnit() === 'Points',
                completedScheduleStateNames: this.completedStates,
                startDate: this.getTimeboxStartDate(),
                endDate: this.getTimeboxEndDate(),
                showPlannedPredictionLine: this.getShowPlannedPredictionLine(),
                showAcceptedPredictionLine: this.getShowAcceptedPredictionLine(),
                showDefects: this.getShowDefects(),
                showStories: this.getShowStories()
                //preliminaryEstimateValueHashByObjectID: this.preliminaryEstimateValueHashByObjectID
            },
            chartConfig: this._getChartConfig()
        });
    },
    getBooleanSetting: function(settingName){
        return this.getSetting(settingName) === 'true' || this.getSetting(settingName) === true;
    },
    getShowPlannedPredictionLine: function(){
        return this.getBooleanSetting('showPlannedPredictionLine');
    },
    getShowAcceptedPredictionLine: function(){
        return this.getBooleanSetting('showAcceptedPredictionLine');
    },
    getShowDefects: function(){
        return this.getBooleanSetting('showDefects');
    },
    getShowExport: function(){
        return this.getBooleanSetting('showExportButton');
    },
    getShowStories: function(){
        var showStories = this.getBooleanSetting('showStories');
        if (!this.getShowDefects()){
            return true;
        }
        return showStories;

    },
    _getStoreConfig: function(){

        var rOids = this._getFieldValueArray(this.timeboxes,'ObjectID'),
            piOids = this._getFieldValueArray(this.portfolioItems,'ObjectID'),
            projectOid = this.getContext().getProject().ObjectID;
        this.logger.log('_getStoreConfig', this.portfolioItems);
        var typeHierarchy = [];
        if (this.getShowStories()){
            typeHierarchy.push('HierarchicalRequirement');
        }
        if (this.getShowDefects()){
            typeHierarchy.push('Defect');
        }
        if (typeHierarchy.length === 0){
            typeHierarchy = ['HierarchicalRequirement'];
        }

        var configs = [{
            find: {
                _TypeHierarchy: {$in: typeHierarchy},
                Children: null,
                Release: {$in: rOids} //We don't need project hierarchy here because the releases are associated with the current project hierarchy.
            },
            fetch: ['ScheduleState', 'PlanEstimate','_id','_TypeHierarchy','FormattedID'],
            hydrate: ['ScheduleState','_TypeHierarchy'],
            removeUnauthorizedSnapshots: true,
            sort: {
                _ValidFrom: 1
            },
            context: this.getContext().getDataContext(),
            limit: Infinity,
            listeners: {
                load: this._updateETLDate,
                scope: this
            }
        }];

        piOids = piOids.slice(-10);
        this.logger.log('PortfolioItems', piOids.length);
        if (piOids && piOids.length > 0){


            configs.push({
                find: {
                        _TypeHierarchy: {$in: typeHierarchy},
                        Children: null,
                        _ItemHierarchy: {$in: piOids},
                        _ProjectHierarchy: projectOid // We need project hierarchy here to limit the stories and defects to just those in this project.
                },
                fetch: ['ScheduleState', 'PlanEstimate','_id','_TypeHierarchy','FormattedID'],
                hydrate: ['ScheduleState','_TypeHierarchy'],
                compress: true,
                removeUnauthorizedSnapshots: true,
                sort: {
                    _ValidFrom: 1
                },
                //context: this.getContext().getDataContext(),
                limit: Infinity,
                listeners: {
                    load: this._updateETLDate,
                    scope: this
                }
            });
        }
        return configs;
    },
    _getChartConfig: function(){
        var numTicks = 6;
        return {
            chart: {
                defaultSeriesType: 'area',
                zoomType: 'xy'
            },
            title: {
                text: this.getTimeboxRecord() && this.getTimeboxRecord().get('Name') || "No Release",
                style: {
                    color: '#666',
                    fontSize: '18px',
                    fontFamily: 'ProximaNova',
                    fill: '#666'
                }
            },
            xAxis: {
                categories: [],
                tickmarkPlacement: 'on',
                title: {
                    text: 'Date',
                    margin: 10,
                    style: {
                        color: '#444',
                        fontFamily:'ProximaNova',
                        textTransform: 'uppercase',
                        fill:'#444'
                    }
                },
                labels: {
                    style: {
                        color: '#444',
                        fontFamily:'ProximaNova',
                        textTransform: 'uppercase',
                        fill:'#444'
                    },
                    formatter: function(){
                        var d = new Date(this.value);
                        return Rally.util.DateTime.format(d, 'm/d/Y');
                    }
                },
                tickPositioner: function () {
                    var positions = [],
                        tick = Math.floor(this.dataMin),
                        increment = Math.ceil((this.dataMax - this.dataMin) / numTicks);

                    if (this.dataMax !== null && this.dataMin !== null) {
                        for (tick; tick - increment <= this.dataMax; tick += increment) {
                            positions.push(tick);
                        }
                    }
                    return positions;
                }
            },
            yAxis: [
                {
                    title: {
                        text: this.getUnit(),
                        style: {
                            color: '#444',
                            fontFamily:'ProximaNova',
                            textTransform: 'uppercase',
                            fill:'#444'
                        }
                    },
                    labels: {
                        style: {
                            color: '#444',
                            fontFamily:'ProximaNova',
                            textTransform: 'uppercase',
                            fill:'#444'
                        }
                    },
                    min: 0
                }
            ],
            legend: {
                itemStyle: {
                        color: '#444',
                        fontFamily:'ProximaNova',
                        textTransform: 'uppercase'
                },
                borderWidth: 0
            },
            tooltip: {
                backgroundColor: '#444',
                headerFormat: '<span style="display:block;margin:0;padding:0 0 2px 0;text-align:center"><b style="font-family:NotoSansBold;color:white;">{point.key}</b></span><table><tbody>',
                footerFormat: '</tbody></table>',
                pointFormat: '<tr><td class="tooltip-label"><span style="color:{series.color};width=100px;">\u25CF</span> {series.name}</td><td class="tooltip-point">{point.y}</td></tr>',
                shared: true,
                useHTML: true,
                borderColor: '#444'
            },
            plotOptions: {
                series: {
                    marker: {
                        enabled: false,
                        states: {
                            hover: {
                                enabled: true
                            }
                        }
                    },
                    groupPadding: 0.01
                },
                column: {
                    stacking: true,
                    shadow: false
                }
            }
        };
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
    getSettingsFields: function(){
        var labelWidth = 200;

        return [{
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Show Planned Prediction Line',
            labelAlign: 'right',
            labelWidth: labelWidth,
            name: 'showPlannedPredictionLine'
        },{
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Show Accepted Prediction Line',
            labelAlign: 'right',
            labelWidth: labelWidth,
            name: 'showAcceptedPredictionLine'
        },{
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Show Defects',
            labelAlign: 'right',
            labelWidth: labelWidth,
            name: 'showDefects'
        },{
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Show User Stories',
            labelAlign: 'right',
            labelWidth: labelWidth,
            name: 'showStories'
        },{
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Show Export Button',
            labelAlign: 'right',
            labelWidth: labelWidth,
            name: 'showExportButton'

        }];
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
    }
});
