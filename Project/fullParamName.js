"use strict";
var utils_1 = require("./utils");
var config_1 = require("./config");
var consts_1 = require("./consts");
inlets = 1;
outlets = 1;
var log = (0, utils_1.logFactory)(config_1.default);
var OUTLET_PARAM_NAME = 0;
var INLET_INPUT = 0;
setinletassist(INLET_INPUT, 'Input (object ID)');
setoutletassist(OUTLET_PARAM_NAME, 'Param Name (string)');
function updateParamName(objId) {
    //log('UpdateParamName ' + objId)
    var nameArr = [];
    var counter = 0;
    var obj = new LiveAPI(function () { }, 'id ' + objId);
    if (+obj.id === 0) {
        // no device selected, how about track?
        obj.path = 'live_set view selected_track';
        if (+obj.id === 0) {
            return consts_1.nullString;
        }
        outlet(OUTLET_PARAM_NAME, obj.get('name').toString());
    }
    if (!(0, utils_1.isDeviceSupported)(obj)) {
        log('Unsupported / Incomplete device type ' + obj.type);
        outlet(OUTLET_PARAM_NAME, '? Unsupported');
        return;
    }
    while (counter < 20) {
        if (obj.type === 'MixerDevice') {
            nameArr.unshift('Mixer');
        }
        else {
            nameArr.unshift((0, utils_1.truncate)(obj.get('name').toString(), 40));
        }
        if (['Song', 'Track'].indexOf(obj.type) > -1) {
            break;
        }
        obj.id = obj.get('canonical_parent')[1];
        counter++;
    }
    var name = nameArr[0];
    //log(nameArr)
    if (nameArr.length > 1) {
        name += ' > ' + nameArr[nameArr.length - 1];
    }
    //log('PARAM NAME ' + name)
    outlet(OUTLET_PARAM_NAME, name);
}
log('reloaded fullParamName');
// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
