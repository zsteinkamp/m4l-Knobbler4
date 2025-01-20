"use strict";
var utils_1 = require("./utils");
var config_1 = require("./config");
inlets = 1;
outlets = 1;
var log = (0, utils_1.logFactory)(config_1.default);
var OUTLET_PARAM_NAME = 0;
var INLET_INPUT = 0;
setinletassist(INLET_INPUT, 'Input (object ID)');
setoutletassist(OUTLET_PARAM_NAME, 'Param Name (string)');
function truncate(str, len) {
    //post('IN TRUNCATE ' + JSON.stringify({ str, len }) + '\n')
    if (str.length < len) {
        return str;
    }
    return str.substring(0, len - 2) + '…';
}
function updateParamName(objId) {
    //log(objId)
    var nameArr = [];
    var counter = 0;
    var obj = new LiveAPI(function () { }, 'id ' + objId);
    if (obj.id == 0) {
        return;
    }
    while (counter < 10) {
        if (obj.type === 'Song') {
            break;
        }
        if (obj.type === 'MixerDevice') {
            nameArr.unshift('Mixer');
        }
        else {
            nameArr.unshift(truncate(obj.get('name').toString(), 32));
        }
        obj = new LiveAPI(function () { }, obj.get('canonical_parent'));
        counter++;
    }
    var name = nameArr[0];
    if (nameArr.length == 2) {
        name = [nameArr[0], nameArr[1]].join(' > ');
    }
    else if (nameArr.length > 2) {
        name = [nameArr[0], nameArr[1], nameArr[nameArr.length - 1]].join(' > ');
    }
    outlet(OUTLET_PARAM_NAME, name);
}
log('reloaded fullParamName');
// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
