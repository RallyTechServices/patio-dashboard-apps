Ext.define("OIPRApp", {
    extend: 'CA.techservices.app.ChartApp',
    defaults: { margin: 10 },

descriptions: [
        "<strong>OCIO Dashboard - Productivity</strong><br/>" +
            "<br/>" +
            "Productivity is the number of work items broken down by user stories, split stories and defects " + 
            "by program by quarter."
    ],
    
    integrationHeaders : {
        name : "OIPRApp"
    },
      
    config: {
        defaultSettings: {
            showScopeSelector: true,
            showAllWorkspaces: false
        }
    },
        
    launch: function() {
        this.callParent();
        
        if ( this.getSetting('showScopeSelector') || this.getSetting('showScopeSelector') == "true" ) {
            this.workspaces = this.getSetting('workspaceProgramParents');
            
            if ( Ext.isEmpty(this.workspaces) || this.workspaces == "[]" ) {
                Ext.Msg.alert('Configuration Issue','This app requires the designation of a parent project to determine programs in each workspace.' +
                    '<br/>Please use Edit App Settings... to make this configuration.');
                return;
            }
            
            if ( Ext.isString(this.workspaces ) ){
                this.workspaces = Ext.JSON.decode(this.workspaces);
            }
            Ext.Array.each(this.workspaces, function(workspace){
                workspace._ref = workspace.workspaceRef;
                workspace.Name = workspace.workspaceName;
                workspace.ObjectID = workspace.workspaceObjectID;
            });
        
        }
        this._addComponents();
    },
    
    _addComponents: function(){
        var me = this;
        if ( this.getSetting('showScopeSelector') || this.getSetting('showScopeSelector') == "true" ) {

            this.addToBanner({
                xtype: 'quarteritemselector',
                stateId: this.getContext().getScopedStateId('app-selector'),
                workspaces: me.workspaces,
                context: this.getContext(),
                stateful: false,
                listeners: {
                    change: this.updateQuarters,
                    scope: this
                }
            });
        } else {
            this.subscribe(this, 'quarterSelected', this.updateQuarters, this);
            this.publish('requestQuarter', this);
        }

        // for pushing button over to the right
        this.addToBanner({
            xtype:'container',
            flex: 1
        });
        
        this.addToBanner({
            xtype:'rallybutton',
            itemId:'export_button',
            cls: 'secondary',
            text: '<span class="icon-export"> </span>',
            disabled: false,
            listeners: {
                scope: this,
                click: function(button) {
                    this._export(button);
                }
            }
        });
    },
    
    updateQuarters: function(quarterAndPrograms){
        var me = this;
        this.quarterRecord = quarterAndPrograms.quarter;
        this.programs = [];

        //if there are programs selected from drop down get the corresponding workspace and get data 
        //quarterAndPrograms.allPrograms[quarterAndPrograms.programs[0]].workspace.ObjectID
        var workspaces_of_selected_programs = {};
        Ext.Array.each(quarterAndPrograms.programs,function(selected){
            var ws = quarterAndPrograms.allPrograms[selected].workspace;
            
            workspaces_of_selected_programs[ws.ObjectID] = {
                Name: ws.Name,
                ObjectID: ws.ObjectID,
                _ref: ws._ref,
                workspaceName: ws.workspaceName,
                workspaceObjectID: ws.workspaceObjectID
            };
            me.programs.push(quarterAndPrograms.allPrograms[selected].program);
        })

        if(this.programs.length < 1){
            Ext.Msg.alert('There are no chosen programs');
            return;
        }

        var promises = Ext.Array.map(Ext.Object.getValues(workspaces_of_selected_programs), function(workspace) {
            return function() { 
                return me._getDataForWorkspace( workspace ) 
            };
        });
        
        Deft.Chain.sequence(promises).then({
            scope: this,
            success: function(all_results) {
                var items_by_program = this._organizeItemsByProgram(Ext.Array.flatten(all_results));
                
                //Modifying the results to include blank records as the customer wants to see all the programs even if the rows dont have values. 
                var final_results = {};
                                
                Ext.Array.each(this.programs,function(program_info){                    
                    var name = program_info.Name;
                    
                    final_results[name] = {
                        defects: [],
                        split_stories: [],
                        stories: []
                    };
                    
                    if ( items_by_program[name] ) {
                        final_results[name] = items_by_program[name];
                    }
                });

                me._makeChart(final_results);
                me._makeGrid(final_results);
                
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem gathering data', msg);
            }
        }).always(function() { me.setLoading(false); });
    },

    _getDataForWorkspace: function(workspace) {
        var me = this,
            deferred = Ext.create('Deft.Deferred');

        var workspace_name = workspace.Name ? workspace.Name : workspace.get('Name');
        var workspace_oid = workspace.ObjectID ? workspace.ObjectID : workspace.get('ObjectID');

        me.setLoading('Loading..');
        TSUtilities.getPortfolioItemTypes(workspace).then({
            success: function(types) {
                if ( types.length < 3 ) {
                    this.logger.log("Cannot find a record type for EPMS project in workspace",workspace._refObjectName);
                    deferred.resolve([]);
                } else {
                    this.setLoading('Loading Workspace ' + workspace_name);
                    
                    var epmsModelPaths = [types[2].get('TypePath'),types[1].get('TypePath')];
                    Deft.Chain.pipeline([
                        function() { 
                            return me._getEPMSProjectsOn(new Date(),workspace,epmsModelPaths);
                        },
                        function(epms_programs_by_project_name) { 
                            return me._getAcceptedItems(me.quarterRecord,workspace,epms_programs_by_project_name); 
                        }
                    ],me).then({
                        scope: me,
                        success: function(work_items){
                            deferred.resolve(work_items);
                        },
                        failure: function(msg) {
                            deferred.reject(msg);
                        }
                    });
                }
            },
            failure: function(msg){
                Ext.Msg.alert('',msg);
            },
            scope: this
        });

        return deferred.promise;
    },

    // 
    _getEPMSProjectsOn:function(date,workspace,epmsModelPaths){
        var me = this,
            deferred = Ext.create('Deft.Deferred');

        var find = {
            "_TypeHierarchy": { "$in": epmsModelPaths },
            "__At": date
        };
        
        var config = {
            context: { 
                project: null,
                workspace: workspace._ref
            },
            "fetch": [ "ObjectID","Project"],
            "find": find,
            "hydrate": ["Project"]
        };
        
        this._loadLookbackRecords(config).then({
            success: function(pis) {
                var epms_programs_by_project_name = {};
                
                Ext.Array.each(pis,function(pi){
                    var project_name = pi.get('Project').Name;
                    
                    if ( Ext.isEmpty(epms_programs_by_project_name[project_name]) ) {
                        epms_programs_by_project_name[project_name] = {
                            program: pi.get('Project'),
                            epms_projects: [],
                            Name: project_name
                        }
                    }
                    
                    epms_programs_by_project_name[project_name].epms_projects.push(pi.getData());
                });
                deferred.resolve(epms_programs_by_project_name);
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
        });
    
        return deferred;
    },
    
    _organizeItemsByProgram: function(items){
        var me = this,
            items_by_program = {};

        // remove doubled items
        var items_by_oid = {};
        Ext.Array.each(items, function(item){
            items_by_oid[item.get('ObjectID')] = item;
        });
        
        Ext.Array.each(Ext.Object.getValues(items_by_oid), function(item){
            var program = item.EPMSProject;
            if ( Ext.isEmpty(items_by_program[program]) ) {
                items_by_program[program] = {
                    stories: [],
                    split_stories: [],
                    defects: []
                };
            }
            
            var type_hierarchy = item.get('_TypeHierarchy');
            var type = type_hierarchy[type_hierarchy.length-1];
            
            if ( type == "Defect" ) {
                items_by_program[program].defects.push(item);
            } else {
                if ( 'standard' == me._getTypeFromName(item.get('Name')) ) {
                    items_by_program[program].stories.push(item);
                } else{
                    items_by_program[program].split_stories.push(item);
                }
            }
        });
        
        return items_by_program;
    },

    // get items accepted during the quarter
    _getAcceptedItems:function(quarterRecord,workspace,epms_items_by_project_name){
        var me = this,
            deferred = Ext.create('Deft.Deferred');
        
        var epms_oids = [];
        if ( Ext.Object.getKeys(epms_items_by_project_name).length > 0 ) {
            var epms_oids = [];
            Ext.Object.each(epms_items_by_project_name, function(key,epms_item){
                var epms_projects = epms_item.epms_projects || [];
                Ext.Array.each(epms_projects, function(epms_project){
                    epms_oids.push(epms_project.ObjectID);
                });
            });
        }

               
        var find = {
            "_TypeHierarchy": {"$in": ["HierarchicalRequirement","Defect"]},
            "_ItemHierarchy": {"$in": epms_oids},
            "AcceptedDate": { "$gte": quarterRecord.get('startDate') },
            "AcceptedDate": { "$lte": quarterRecord.get('endDate') },
            "__At": 'current'
        };
        
        var config = {
            find: find,
            fetch: ['ObjectID','Name','FormattedID','_ItemHierarchy','_TypeHierarchy'],
            context: { 
                project: null,
                workspace: workspace._ref
            },
            hydrate: ['_TypeHierarchy']
        };

        this._loadLookbackRecords(config).then({
            success: function(items) {
                Ext.Object.each(epms_items_by_project_name, function(name,epms_item){
                    var epms_projects = epms_item.epms_projects || [];
                    Ext.Array.each(epms_projects, function(epms_project){
                        var project_oid = epms_project.ObjectID;
                        Ext.Array.each(items, function(item){
                            if (Ext.Array.contains(item.get('_ItemHierarchy'), project_oid)) {
                                item.EPMSProject = name;
                            }
                        });
                    });
                });
                deferred.resolve(items);
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
        });
        
        return deferred.promise;
    },

    _makeChart: function(items_by_program) {

        var colors = CA.apps.charts.Colors.getConsistentBarColors();
        
        if ( this.getSetting('showPatterns') ) {
            colors = CA.apps.charts.Colors.getConsistentBarPatterns();
        }

        this.setChart({
            chartData: this._getChartData(items_by_program),
            chartConfig: this._getChartConfig(),
            chartColors: colors
        },0);
    },

    _makeGrid: function(items_by_program) {
        var rows = [];
        
         Ext.Object.each(items_by_program, function(name,summary_info){
            var row =  {
                program: name,
                stories: summary_info.stories.length,
                split_stories: summary_info.split_stories.length,
                defects: summary_info.defects.length
            };
            
            rows.push(row);
        });
        
        this.rows = rows;
       
        this.setGrid({
            xtype: 'rallygrid',
            hidden: true,
            store: Ext.create('Rally.data.custom.Store', {
                data: rows,
                pageSize: 1000
            }),
            columnCfgs: this._getColumns(),
            showRowActionsColumn: false,
            showPagingToolbar: false
        },0);
    },
    
    _getColumns: function() {
        return [
            { dataIndex:'program', text: 'Program' },
            { dataIndex:'stories', text: 'Total Stories' },
            { dataIndex:'split_stories', text: 'Total Split Stories' },
            { dataIndex:'defects', text: 'Total Defects' }
        ];
    },
    
    _getChartData: function(items_by_program) {
        
        var categories = Ext.Object.getKeys(items_by_program);
        
        var stories = [];
        var split_stories = [];
        var defects = [];
        
        Ext.Object.each(items_by_program, function(name,summary_info){
            stories.push(summary_info.stories.length);
            split_stories.push(summary_info.split_stories.length);
            defects.push(summary_info.defects.length);
        });
        
        
        return { 
            series: [ 
                { name: "Stories", data: stories },
                { name: "Split Stories", data: split_stories },
                { name: "Defects", data: defects }
            ],
            categories: categories
        };
    },
            
    _getChartConfig: function() {
        return {
            chart: {
                type: 'column'
            },
            title: {
                text: 'Productivity'
            },
            xAxis: {
            },
            yAxis: {
                min: 0,
                    title: {
                    text: ''
                }
            },
            plotOptions: {
                column: {
                    stacking: 'normal',
                    dataLabels: {
                        enabled: true
                    }
                }
            }
        };
    },
    
    _loadLookbackRecords: function(config,returnOperation) {
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var default_config = {
            sort: { "_ValidFrom": -1 },
            "useHttpPost":true,
            removeUnauthorizedSnapshots:true
        };
        
        Ext.create('Rally.data.lookback.SnapshotStore', Ext.Object.merge(default_config,config)).load({
            callback : function(records, operation, successful) {
                if (successful){
                    if ( returnOperation ) {
                        deferred.resolve(operation);
                    } else {
                        deferred.resolve(records);
                    }
                } else {
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    
    _loadWsapiRecords: function(config){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var default_config = {
            model: 'Defect',
            fetch: ['ObjectID'],
            compact: false
        };

        Ext.create('Rally.data.wsapi.Store', Ext.Object.merge(default_config,config)).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    
    _export: function(){
        var me = this;
       
        var grid = this.down('rallygrid');
        var rows = this.rows || [];
                        
        if (!rows ) { return; }
        
        var store = Ext.create('Rally.data.custom.Store',{ data: rows });
        
        if ( !grid ) {
            
            grid = Ext.create('Rally.ui.grid.Grid',{
                store: store,
                columnCfgs: [{
                    dataIndex: 'FormattedID',
                    text: 'ID'
                },
                {
                    dataIndex: 'Name',
                    text: 'Name'
                },
                {
                    dataIndex: 'Project',
                    text: 'Project',
                    renderer: function(value,meta,record){
                        if ( Ext.isEmpty(value) ) { 
                            return "";
                        }
                        return value._refObjectName
                    }
                },
                {
                    dataIndex: '__ruleText',
                    text:'Rules',
                    renderer: function(value,meta,record){                        
                        return value.join('\r\n');
                    }
                }]
            });
        }
        
        var filename = 'productivity_counts.csv';
        
        this.setLoading("Generating CSV");
        Deft.Chain.sequence([
            function() { return Rally.technicalservices.FileUtilities.getCSVFromRows(this,grid,rows); } 
        ]).then({
            scope: this,
            success: function(csv){
                if (csv && csv.length > 0){
                    Rally.technicalservices.FileUtilities.saveCSVToFile(csv,filename);
                } else {
                    Rally.ui.notify.Notifier.showWarning({message: 'No data to export'});
                }
                
            }
        }).always(function() { me.setLoading(false); });
    },

    _getTypeFromName: function(name) {
        if ( /\[Continued\]/.test(name) &&  /\[Unfinished\]/.test(name) ) {
            return 'multiple';
        }
        if ( /\[Continued\]/.test(name) ) {
            return 'continued';
        }
        
        if ( /\[Unfinished\]/.test(name) ) {
            return 'unfinished';
        }
        
        return 'standard';
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

    getSettingsFields: function() {
        return [{
            name: 'showScopeSelector',
            xtype: 'rallycheckboxfield',
            label: ' ',
            boxLabel: 'Show Scope Selector<br/><span style="color:#999999;"> ' +
            '<i>Tick to show the selectors and broadcast settings.</i><p/>' + 
            '<em>If this is not checked, the app expects another app on the same page ' +
            'to broadcast the chosen program(s) and quarter.  When <b>checked</b> the Workspaces and ' +
            'Program Parents must be chosen.  When <b>not checked</b> the below Workspaces and Program ' +
            'Parents are ignored.</em>' +
            '</span>' + 
            '<p/>' + 
            '<span style="color:#999999;">' + 
            '<em>Programs are the names of projects that hold EPMS Projects.  Choose a new row ' +
            'for each workspace you wish to display, then choose the AC project underwhich the ' + 
            'leaf projects that represent programs live.</em>' +
            '</span>'
        },
//        {
//            name: 'showAllWorkspaces',
//            xtype: 'rallycheckboxfield',
//            fieldLabel: 'Show All Workspaces',
//            labelWidth: 135,
//            labelAlign: 'left',
//            minWidth: 200,
//            margin: 10
//        },
        {
            name: 'workspaceProgramParents',
            xtype:'tsworkspacesettingsfield',
            fieldLabel: ' ',
            boxLabel: 'Program Parent in Each Workspace<br/><span style="color:#999999;"> ' +
            '<p/>' + 
            '<em>Programs are the names of projects that hold EPMS Projects.  Choose a new row ' +
            'for each workspace you wish to display, then choose the AC project underwhich the ' + 
            'leaf projects that represent programs live.</em>' +
            '</span>'
        }];
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    }
    
});
