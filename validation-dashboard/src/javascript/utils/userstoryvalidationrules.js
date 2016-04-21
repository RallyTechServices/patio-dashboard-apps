Ext.define('Rally.technicalservices.UserStoryValidationRules',{
    extend: 'Rally.technicalservices.ValidationRules',
    //ruleFnPrefix: 'ruleFn_',
    requiredFields: undefined, //
    features: undefined,
    orderedScheduleStates: undefined,
    definedScheduleStateIndex: undefined,

    constructor: function(config){
        Ext.apply(this, config);
        this.requiredFields = ['Owner','Description'];
    },
//    ruleFn_unscheduledIterationScheduleState: function(r){
//        /**
//         * If Iteration = unscheduled and state In-Progress raise flag
//         */
//        var scheduleStateIdx = _.indexOf(this.orderedScheduleStates, r.get('ScheduleState'));
//
//        if (!r.get('Iteration') && scheduleStateIdx > this.definedScheduleStateIndex){
//            return {
//                rule: 'ruleFn_unscheduledIterationScheduleState',
//                text: Ext.String.format('<li>Story is In-Progress with unscheduled Iteration', r.get('ScheduleState'))
//            };
//        }
//        return null;
//    },
//    ruleFn_blockedNotInProgress: function(r){
//        /**
//         * Story is blocked, schedulestate must be In-Progress
//         */
//        if (r.get('Blocked')){
//            if (r.get('ScheduleState') != 'In-Progress'){
//                return Ext.String.format('<li>Story is Blocked but not In-Progress ({0})', r.get('ScheduleState'));
//            }
//        }
//        return null;
//    },
    ruleFn_storyMissingFields: function(r) {
        var missingFields = [];

        _.each(this.requiredFields, function (f) {
            if (!r.get(f) && r.getField(f)) {
                var name = r.getField(f).displayName;
                missingFields.push(name);
            }
        });
        if (missingFields.length === 0) {
            return null;
        }
        return {
            rule: 'ruleFn_storyMissingFields',
            text: Ext.String.format('<li>Story fields Missing: {0}', missingFields.join(','))
        };
    },
    ruleFn_storyHasNoFeature: function(r){
        if (!r.get('Feature')){
            return {
                rule: 'ruleFn_storyHasNoFeature',
                text: '<li>Story has no parent Feature.'
            };
        }
        return null;
    },
    ruleFn_storyPlanEstimate: function(r){
        if (r.get('PlanEstimate')==0){
            return {
                rule: 'ruleFn_storyPlanEstimate',
                text: '<li>Story has no points'
            };
        }
        return null;
    },
//    ruleFn_storyHasIterationWithoutRelease: function(r){
//        if (!r.get('Release') && r.get('Iteration')){
//            return {
//                rule: 'ruleFn_storyHasIterationWithoutRelease',
//                text: Ext.String.format('<li>Story has Iteration [{0}] without a Release.', r.get('Iteration').Name)
//            };
//        }
//        return null;
//    },
//    ruleFn_storyBlockedWithoutReason: function(r){
//        if (r.get('Blocked') && !r.get('BlockedReason')){
//            return {
//                rule: 'ruleFn_storyBlockedWithoutReason',
//                text: '<li>Story is blocked without reason.'
//            };
//            //if (r.get('Blocker')){
//            //    return '<li>Story is blocked without reason.';
//            //} else {
//            //    return '<li>Story is blocked without a reason.';
//            //}
//        }
//        return null;
//    },
//    ruleFn_storyRelaseDoesNotMatchFeatureRelease: function(r){
//        var msg = null;
//
//        var release = r.get('Release');
//        if (r.get('Feature') && release){
//
//            if (!r.get('Feature').Release || r.get('Feature').Release.Name != release.Name ||
//                r.get('Feature').Release.ReleaseStartDate != release.ReleaseStartDate ||
//                r.get('Feature').Release.ReleaseDate != release.ReleaseDate){
//                return {
//                    rule: 'ruleFn_storyRelaseDoesNotMatchFeatureRelease',
//                    text: '<li>Story Release is not Feature Release'
//                };
//            }
//        }
//        return msg;
//    },
//    ruleFn_storyRiskDescription: function(r){
//        if (r.get('c_Risk') && !r.get('c_RiskStatement')){
//            return {
//                rule: 'ruleFn_storyRiskDescription',
//                text: '<li>Story Risk has no Description'
//            };
//        }
//        return null;
//    }
});
