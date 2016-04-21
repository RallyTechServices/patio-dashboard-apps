Ext.define('Rally.technicalservices.ValidationRules',{

    ruleFnPrefix: 'ruleFn_',
    requiredFields: undefined,

    constructor: function(config){
        Ext.apply(this, config);
    },

    getRules: function(){
        var ruleFns = [],
            ruleRe = new RegExp('^' + this.ruleFnPrefix);

        for (var fn in this)
        {
            if (ruleRe.test(fn)){
                ruleFns.push(fn);
            }
        }
        return ruleFns;
    },
    //ruleFn_missingFields: function(r) {
    //    var missingFields = [];
    //
    //    _.each(this.requiredFields, function (f) {
    //        if (!r.get(f)) {
    //            missingFields.push(f);
    //        }
    //    });
    //    if (missingFields.length === 0) {
    //        return null;
    //    }
    //    return Ext.String.format('Missing fields: {0}', missingFields.join(','));
    //},

    statics: {
        getUserFriendlyRuleLabel: function(ruleName){
            switch(ruleName){
                case 'ruleFn_missingFields':
                    return 'Required Fields are missing';
                case 'ruleFn_unscheduledIterationScheduleState':
                    return 'Story is In-Progress with unscheduled Iteration';
                case 'ruleFn_blockedNotInProgress':
                    return 'Story is Blocked but not In-Progress';
                case 'ruleFn_sprintCompleteNotAccepted':
                    return 'Story in past Iteration not complete';
                case 'ruleFn_noStoriesForFeature':
                    return 'Feature has no Stories';
                case 'ruleFn_FeatureHasNotBeenStarted':
                    return 'Feature not started';
                case 'ruleFn_featureHasNotBeenCompleted':
                    return 'Feature not completed.';
                case 'ruleFn_featureMissingFields':
                    return 'Feature fields Missing';
                case 'ruleFn_storyMissingFields':
                    return 'Story fields Missing';
                case 'ruleFn_FeatureHasNoParent':
                    return 'Feature has no parent';
                case 'ruleFn_storyHasNoFeature':
                    return 'Story has no parent Feature';
                case 'ruleFn_storyHasIterationWithoutRelease':
                    return 'Story has Iteration without Release';
                case 'ruleFn_storyBlockedWithoutReason':
                    return 'Story Blocked without Reason';
                case 'ruleFn_storyRelaseDoesNotMatchFeatureRelease':
                    return 'Story Release is not Feature Release';
                case 'ruleFn_storyPlanEstimate':
                    return 'Story has no points';
                case 'ruleFn_featureHasNoPoints':
                    return 'Feature has no points';
                case 'ruleFn_storyRiskDescription':
                    return 'Story Risk has no Description';
                case 'ruleFn_featureRiskDescription':
                    return 'Feature Risk has no Description';
                case 'ruleFn_taskMissingFields':
                    return 'Task fields Missing';
                case 'ruleFn_projectMissingWIP':
                    return 'Project Missing WIP';
                case 'ruleFn_iterationMissingFields':
                    return 'Iteration fields Missing';
                case 'ruleFn_FeatureDateIssue':
                    return 'Feature Date Issue';
                case 'ruleFn_isProgramRisk':
                    return 'Feature is program level risk';
            }
            return ruleName;
        }
    }
});