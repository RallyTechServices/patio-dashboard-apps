Ext.define('recordHolder',{
    data: {},
    constructor: function(config) {
        Ext.apply(this, config);
    },
    
    get: function(field) {
        return this.data[field];
    }
});

Ext.define('Rally.technicalservices.FileUtilities', {
    singleton: true,
    logger: new Rally.technicalservices.Logger(),
    
    saveCSVToFile:function(csv,file_name,type_object){
        if (type_object === undefined){
            type_object = {type:'text/csv;charset=utf-8'};
        }
        this.saveAs(csv,file_name, type_object);
    },
    
    saveAs: function(textToWrite, fileName)
    {
        this.logger.log('saveAs:', fileName);
        
        if (Ext.isIE9m){
            Rally.ui.notify.Notifier.showWarning({message: "Export is not supported for IE9 and below."});
            return;
        }

        var textFileAsBlob = null;
        try {
            textFileAsBlob = new Blob([textToWrite], {type:'text/plain'});
        }
        catch(e){
            this.logger.log('Caught an error ', e);
            
            window.BlobBuilder = window.BlobBuilder ||
                        window.WebKitBlobBuilder ||
                    window.MozBlobBuilder ||
                    window.MSBlobBuilder;
            if (window.BlobBuilder ) { //&&  e.name === 'TypeError'){
                bb = new BlobBuilder();
                bb.append([textToWrite]);
                textFileAsBlob = bb.getBlob("text/plain");
            }

        }

        if (!textFileAsBlob){
            Rally.ui.notify.Notifier.showWarning({message: "Export is not supported for this browser."});
            return;
        }

        var fileNameToSaveAs = fileName;

        if (Ext.isIE10p){
            window.navigator.msSaveOrOpenBlob(textFileAsBlob,fileNameToSaveAs); // Now the user will have the option of clicking the Save button and the Open button.
            return;
        }

        var url = this.createObjectURL(textFileAsBlob);

        if (url){
            var downloadLink = document.createElement("a");
            if ("download" in downloadLink){
                downloadLink.download = fileNameToSaveAs;
            } else {
                //Open the file in a new tab
                downloadLink.target = "_blank";
            }

            downloadLink.innerHTML = "Download File";
            downloadLink.href = url;
            if (!Ext.isChrome){
                // Firefox requires the link to be added to the DOM
                // before it can be clicked.
                downloadLink.onclick = this.destroyClickedElement;
                downloadLink.style.display = "none";
                document.body.appendChild(downloadLink);
            }
            downloadLink.click();
        } else {
            Rally.ui.notify.Notifier.showError({message: "Export is not supported "});
        }

    },
    createObjectURL: function ( file ) {
        if ( window.webkitURL ) {
            return window.webkitURL.createObjectURL( file );
        } else if ( window.URL && window.URL.createObjectURL ) {
            return window.URL.createObjectURL( file );
        } else {
            return null;
        }
    },
    saveTextAsFile: function(textToWrite, fileName) {
        var textFileAsBlob = new Blob([textToWrite], {type:'text/plain'});
        var fileNameToSaveAs = fileName;

        var downloadLink = document.createElement("a");
        downloadLink.download = fileNameToSaveAs;
        downloadLink.innerHTML = "Download File";
        if (window.webkitURL != null)
        {
            // Chrome allows the link to be clicked
            // without actually adding it to the DOM.
            downloadLink.href = window.webkitURL.createObjectURL(textFileAsBlob);
        }
        else
        {
            // Firefox requires the link to be added to the DOM
            // before it can be clicked.
            downloadLink.href = window.URL.createObjectURL(textFileAsBlob);
            downloadLink.onclick = destroyClickedElement;
            downloadLink.style.display = "none";
            document.body.appendChild(downloadLink);
        }
        downloadLink.click();
    },
    destroyClickedElement: function(event)
    {
        document.body.removeChild(event.target);
    },
    convertDataArrayToCSVText: function(data_array, requestedFieldHash){
       
        var text = '';
        Ext.each(Object.keys(requestedFieldHash), function(key){
            text += requestedFieldHash[key] + ',';
        });
        text = text.replace(/,$/,'\n');
        
        Ext.each(data_array, function(d){
            Ext.each(Object.keys(requestedFieldHash), function(key){
                if (d[key]){
                    if (typeof d[key] === 'object'){
                        if (d[key].FormattedID) {
                            text += Ext.String.format("\"{0}\",",d[key].FormattedID ); 
                        } else if (d[key].Name) {
                            text += Ext.String.format("\"{0}\",",d[key].Name );                    
                        } else if (!isNaN(Date.parse(d[key]))){
                            text += Ext.String.format("\"{0}\",",Rally.util.DateTime.formatWithDefaultDateTime(d[key]));
                        }else {
                            text += Ext.String.format("\"{0}\",",d[key].toString());
                        }
                    } else {
                        text += Ext.String.format("\"{0}\",",d[key] );                    
                    }
                } else {
                    text += ',';
                }
            },this);
            text = text.replace(/,$/,'\n');
        },this);
        return text;
    },
    _getCSVFromWsapiBackedGrid: function(grid,skip_headers) {
        var deferred = Ext.create('Deft.Deferred');
        var store = Ext.create('Rally.data.wsapi.Store',{
            fetch: grid.getStore().config.fetch,
            filters: grid.getStore().config.filters,
            model: grid.getStore().config.model,
            pageSize: 200
        });
        
        var columns = grid.columns;
        
        var record_count = grid.getStore().getTotalCount(),
            page_size = grid.getStore().pageSize,
            pages = Math.ceil(record_count/page_size),
            promises = [];

        for (var page = 1; page <= pages; page ++ ) {
            promises.push(this.loadStorePage(grid, store, columns, page, pages));
        }
        Deft.Promise.all(promises).then({
            success: function(csvs){
                var csv = [];
                if ( !skip_headers ) {
                    csv.push('"' + this._getHeadersFromGrid(grid).join('","') + '"');
                }
                _.each(csvs, function(c){
                    _.each(c, function(line){
                        csv.push(line);
                    });
                });
                csv = csv.join('\r\n');
                deferred.resolve(csv);
                Rally.getApp().setLoading(false);
            }
        });
        return deferred.promise;
    },
    
    getCSVFromRows: function(scope, grid, rows) {
        var me = this;
        var columns = grid.columns;
        var store = grid.getStore();
        
        console.log('getCSVFromRows');
        
        var model = grid.model;

        var csv = [];
        
        csv.push('"' + this._getHeadersFromGrid(grid).join('","') + '"');
        
        Ext.Array.each(rows,function(row){
            
            csv.push( me._getCSVFromRecord(Ext.create('recordHolder', { data:row}), grid, store) );
        });
        
        csv = csv.join('\r\n');
        return csv;
    },
    
    // custom grid assumes there store is fully loaded
    _getCSVFromCustomBackedGrid: function(grid, skip_headers) {
        var deferred = Ext.create('Deft.Deferred');
        var store = Ext.clone( grid.getStore() );
        var columns = grid.columns;
        Rally.getApp().setLoading("Generating CSV...");
        
        var record_count = store.getTotalCount(),
            page_size = store.pageSize,
            pages = Math.ceil(record_count/page_size),
            promises = [];

        for (var page = 1; page <= pages; page ++ ) {
            promises.push(this.loadStorePage(grid, store, columns, page, pages));
        }
        
        Deft.Promise.all(promises).then({
            scope: this,
            success: function(csvs){
                var csv = [];
                if ( !skip_headers ) {
                    csv.push('"' + this._getHeadersFromGrid(grid).join('","') + '"');
                }
                _.each(csvs, function(c){
                    _.each(c, function(line){
                        csv.push(line);
                    });
                });
                csv = csv.join('\r\n');
                deferred.resolve(csv);
                Rally.getApp().setLoading(false);
            }
        });
        return deferred.promise;
    },
    
    _getHeadersFromGrid: function(grid) {
        var headers = [];        
        var columns = grid.columns;

        Ext.Array.each(columns,function(column){
            if ( column.hidden ) { return; }
            
            if ( column.dataIndex || column.renderer ) {
                if ( column.csvText ) {
                    headers.push(column.csvText.replace('&nbsp;',' '));
                } else if ( column.text )  {
                    headers.push(column.text.replace('&nbsp;',' '));
                }
            }
        });
        
        return headers;
    },
    
    _getColumnNamesFromGrid: function(grid) {
        var names = [];
        var columns = grid.columns;

        Ext.Array.each(columns,function(column){
            if ( column.dataIndex || column.renderer ) {
                names.push(column.dataIndex);
            }
        });
        
        return names;
    },
    /*
     * will render using your grid renderer.  If you want it to ignore the grid renderer, 
     * have the column set _csvIgnoreRender: true
     */
    getCSVFromGrid:function(app, grid, skip_headers){
        this.logger.log("Exporting grid with store type:", Ext.getClassName(grid.getStore()));
        
        if ( Ext.getClassName(grid.getStore()) != "Rally.data.custom.Store" ) {
            return this._getCSVFromWsapiBackedGrid(grid,skip_headers);
        }
        
        return this._getCSVFromCustomBackedGrid(grid,skip_headers);
    },
    loadStorePage: function(grid, store, columns, page, total_pages){
        var deferred = Ext.create('Deft.Deferred');
        this.logger.log('loadStorePage',page, total_pages);

        store.loadPage(page, {
            callback: function (records) {
                var csv = [];
                Rally.getApp().setLoading(Ext.String.format('Page {0} of {1} loaded',page, total_pages));
                for (var i = 0; i < records.length; i++) {
                    var record = records[i];
                    csv.push( this._getCSVFromRecord(record, grid, store) );
                }
                deferred.resolve(csv);
            },
            scope: this
        });
        return deferred;
    },
    
    _getCSVFromRecord: function(record, grid, store) {
        //console.log('record:', record);
        
        var mock_meta_data = {
            align: "right",
            classes: [],
            cellIndex: 9,
            column: null,
            columnIndex: 9,
            innerCls: undefined,
            recordIndex: 5,
            rowIndex: 5,
            style: "",
            tdAttr: "",
            tdCls: "x-grid-cell x-grid-td x-grid-cell-headerId-gridcolumn-1029 x-grid-cell-last x-unselectable",
            unselectableAttr: "unselectable='on'"
        };
        
        var node_values = [];
        var columns = grid.columns;
        
        Ext.Array.each(columns, function (column) {
            if (column.xtype == 'rallyrowactioncolumn'  || column.xtype == 'tsrowactioncolumn') {
                return;
            }
            
            if ( column.hidden ) {
                return;
            }
            
            if (column.dataIndex) {
                var column_name = column.dataIndex;
                
                var display_value = record.get(column_name);

                if (!column._csvIgnoreRender && ( column.renderer || column.exportRenderer) ) {
                    if (column.exportRenderer) {
                        display_value = column.exportRenderer(display_value, mock_meta_data, record, 0, 0, store, grid.getView());
                    } else {
                        display_value = column.renderer(display_value, mock_meta_data, record, 0, 0, store, grid.getView());
                    }
                }
                node_values.push(display_value);
            } else {
                var display_value = null;
                if (!column._csvIgnoreRender && column.renderer) {
                    if (column.exportRenderer) {
                        display_value = column.exportRenderer(display_value, mock_meta_data, record, record, 0, 0, store, grid.getView());
                    } else {
                        display_value = column.renderer(display_value, mock_meta_data, record, record, 0, 0, store, grid.getView());
                    }
                    node_values.push(display_value);
                }
            }
        }, this);
        
        var csv_string = "";
        Ext.Array.each(node_values, function(node_value,idx){
            if ( idx > 0 ) {
                csv_string = csv_string + ",";
            }
            if (/^=/.test(node_value) ) {
                csv_string = csv_string + node_value;
            } else {
                csv_string = csv_string + '"' + node_value + '"';
            }

        });
        
        return csv_string;
    }

});