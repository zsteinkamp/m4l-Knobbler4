"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleTrackInput = exports.enableTrackInput = exports.disableTrackInput = exports.getTrackInputStatus = void 0;
var utils_1 = require("./utils");
var config_1 = require("./config");
var origInputs = {};
var log = (0, utils_1.logFactory)(config_1.default);
function getTrackInputStatus(currTrack) {
    var airt = null;
    var currentInput = null;
    var noInput = null;
    var allInputs = null;
    var inputEnabled = false;
    //log(
    //  'GET INPUT STATUS ' + currTrack.type + ' ' + currTrack.get('can_be_armed')
    //)
    if (currTrack.get('is_foldable') == '0' &&
        currTrack.get('can_be_armed') == '1') {
        var airt = JSON.parse(currTrack.get('available_input_routing_types').toString()).available_input_routing_types;
        currentInput = JSON.parse(currTrack.get('input_routing_type').toString()).input_routing_type;
        allInputs = airt[0];
        noInput = airt[airt.length - 1]; // "No Input" is the last available input routing type
        inputEnabled = currentInput.display_name !== noInput.display_name;
    }
    var ret = {
        currentInput: currentInput,
        noInput: noInput,
        inputEnabled: inputEnabled,
        allInputs: allInputs,
    };
    //log('TRACK_INPUT_STATUS ' + JSON.stringify(ret))
    return ret;
}
exports.getTrackInputStatus = getTrackInputStatus;
var Intent;
(function (Intent) {
    Intent[Intent["Disable"] = 0] = "Disable";
    Intent[Intent["Enable"] = 1] = "Enable";
    Intent[Intent["Toggle"] = 2] = "Toggle";
})(Intent || (Intent = {}));
function changeInternal(trackObj, intent) {
    //log('CHANGE INTERNAL id=' + trackObj.id + ' ' + intent)
    var ret = null;
    var trackStatus = getTrackInputStatus(trackObj);
    if (trackStatus.inputEnabled) {
        if (intent === Intent.Disable || intent === Intent.Toggle) {
            origInputs[trackObj.id] = trackStatus.currentInput;
            // set to No Input
            ret = trackStatus.noInput;
            //log('GONNA ENABLE ' + JSON.stringify(ret))
        }
    }
    else {
        // input disabled
        if (intent === Intent.Enable || intent === Intent.Toggle) {
            ret = origInputs[trackObj.id] || trackStatus.allInputs;
            if (!ret) {
                //log('FALLBACK')
                ret = JSON.parse(trackObj.get('available_input_routing_types').toString()).available_input_routing_types[0];
            }
        }
    }
    if (ret) {
        //log('SET ROUTING TYPE ' + JSON.stringify(ret))
        trackObj.set('input_routing_type', ret);
    }
}
function disableTrackInput(trackObj) {
    changeInternal(trackObj, Intent.Disable);
}
exports.disableTrackInput = disableTrackInput;
function enableTrackInput(trackObj) {
    changeInternal(trackObj, Intent.Enable);
}
exports.enableTrackInput = enableTrackInput;
function toggleTrackInput(trackObj) {
    changeInternal(trackObj, Intent.Toggle);
}
exports.toggleTrackInput = toggleTrackInput;
log('reloaded toggleInput');
