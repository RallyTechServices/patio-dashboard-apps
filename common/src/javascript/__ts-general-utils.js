Ext.define('TSUtilities', {
    singleton: true,
    
    timeLockKeyPrefix: 'rally.technicalservices.timesheet.weeklock',
    approvalKeyPrefix: 'rally.technicalservices.timesheet.status',
    deletionKeyPrefix: 'rally.technicalservices.timesheet.deletion',
    pinKeyPrefix     : 'rally.technicalservices.timesheet.pin',

    archiveSuffix: '~archived',
    
    loadWsapiRecords: function(config,returnOperation){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        
        var default_config = {
            model: 'Defect',
            fetch: ['ObjectID']
        };
        Ext.create('Rally.data.wsapi.Store', Ext.Object.merge(default_config,config)).load({
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
    
    loadWsapiRecordsWithParallelPages: function(config, msg) {
        var deferred = Ext.create('Deft.Deferred'),
            me = this;
        
        var count_check_config = Ext.clone(config);
        count_check_config.limit = 1;
        count_check_config.pageSize = 1;
        count_check_config.fetch = ['ObjectID'];
        
        this.loadWsapiRecords(count_check_config, true).then({
            success: function(operation) {                
                config.pageSize = 200;
                config.limit = config.pageSize;
                var total = operation.resultSet.totalRecords;
                var page_count = Math.ceil(total/config.pageSize);
     
                var promises = [];
                Ext.Array.each(_.range(1,page_count+1), function(page_index) {
                    var config_clone = Ext.clone(config);
                    config_clone.currentPage = page_index;
                    promises.push(function() {
                        var percentage = parseInt( page_index * 100 / page_count, 10);
                        var message = msg || "Loading values";
                        Rally.getApp().setLoading(message + " (" + percentage + "%)");
                        return me.loadWsapiRecords(config_clone); 
                    });
                });
                CA.techservices.promise.ParallelThrottle.throttle(promises, 6, me).then({
                        success: function(results){
                            deferred.resolve( Ext.Array.flatten(results) );
                        },
                        failure: function(msg) {
                            deferred.reject(msg);
                        }
                });
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
        });
        return deferred.promise;
    },
    
    getPreferenceProject: function() {
        var app = Rally.getApp();
        
        return app.getSetting('preferenceProjectRef');
    },
    
    isEditableProjectForCurrentUser: function(projectRef,scope) {
        var app = scope || Rally.getApp(),
            me = this;

        if ( this.currentUserIsAdmin(scope) ) {
            return true;
        }
        
        var project_oid = this._getOidFromRef(projectRef);
        var editor_permissions = Ext.Array.filter(app.getContext().getPermissions().userPermissions, function(permission){
            if ( permission.Role != "Editor" && permission.Role != "ProjectAdmin") {
                return false;
            }
            
            return ( me._getOidFromRef(permission._ref) == project_oid );
        });
        
        console.log(editor_permissions);
        return ( editor_permissions.length > 0 );
    },
    
    getEditableProjectForCurrentUser: function() {
        var app = Rally.getApp();
        if ( this._currentUserCanWrite() ) {
            return app.getContext().getProjectRef();
        }
        
        var workspace_oid = this._getOidFromRef( app.getContext().getWorkspaceRef());
        
        var editor_permissions = Ext.Array.filter(app.getContext().getPermissions().userPermissions, function(permission){
            if ( Ext.isEmpty(permission.Workspace) ) {
                return false;
            }
            var permission_oid = this._getOidFromRef(permission.Workspace);

            //console.log('comparing ', workspace_oid, permission_oid, permission);
            if (workspace_oid  !=  permission_oid) {
                return false;
            }
                        
            return ( permission.Role == "Editor" || permission.Role == "ProjectAdmin");
        },this);
        
        
        if ( editor_permissions.length > 0 ) {
            return editor_permissions[0]._ref;
        }
        return false;
    },
    
    _getOidFromRef: function(ref) {
        var ref_array = ref.replace(/\.js$/,'').split(/\//);
        return ref_array[ref_array.length-1].replace(/\.js/,'');
    },
    
    // true if sub or workspace admin
    currentUserIsAdmin: function(scope){
        var app = scope || Rally.getApp();
        
        console.log('current user:', app.getContext().getUser());
        if ( this.currentUserIsSubAdmin() ) {
            return true;
        }
        
        var permissions = app.getContext().getPermissions().userPermissions;

        var workspace_admin_list = Ext.Array.filter(permissions, function(p) {
            return ( p.Role == "Workspace Admin" || p.Role == "Subscription Admin");
        });
        
        var current_workspace_ref = app.getContext().getWorkspace()._ref;
        var is_workspace_admin = false;
                
        if ( workspace_admin_list.length > 0 ) {
            Ext.Array.each(workspace_admin_list, function(p){
                
                if (current_workspace_ref.replace(/\.js$/,'') == p._ref.replace(/\.js$/,'')) {
                    is_workspace_admin = true;
                }
            });
        }
        
        return is_workspace_admin;
    },
    
    currentUserIsSubAdmin: function(scope) {
        var app = scope || Rally.getApp();
                
        var permissions = app.getContext().getPermissions().userPermissions;

        var sub_admin_list = Ext.Array.filter(permissions, function(p) {
            return ( p.Role == 'Subscription Admin' );
        });
        
        return ( sub_admin_list.length > 0 );
    },
    
    _currentUserCanWrite: function() {
        var app = Rally.getApp();
        
        //console.log('_currentUserCanWrite',app.getContext().getUser(), app.getContext().getUser().SubscriptionAdmin);
        if ( app.getContext().getUser().SubscriptionAdmin ) {
            return true;
        }
        
        var permissions = app.getContext().getPermissions().userPermissions;

        var workspace_admin_list = Ext.Array.filter(permissions, function(p) {
            return ( p.Role == "Workspace Admin" || p.Role == "Subscription Admin");
        });
        
        var current_workspace_ref = app.getContext().getWorkspace()._ref;
        var can_unlock = false;
                
        if ( workspace_admin_list.length > 0 ) {
            Ext.Array.each(workspace_admin_list, function(p){
                
                if (current_workspace_ref.replace(/\.js$/,'') == p._ref.replace(/\.js$/,'')) {
                    can_unlock = true;
                }
            });
        }
        
        return can_unlock;
    },
    
    _currentUserCanUnapprove: function() {
        return this.currentUserIsAdmin();
    }
});