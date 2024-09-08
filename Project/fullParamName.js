// FULL PARAM NAME
inlets = 1;
outlets = 1;
var OUTLET_PARAM_NAME = 0;
var INLET_INPUT = 0;
setinletassist(INLET_INPUT, 'Input (object ID)');
setoutletassist(OUTLET_PARAM_NAME, 'Param Name (string)');
var fpDebugLog = false;
function fpDebug(_) {
    if (fpDebugLog) {
        post(tiDebug.caller ? tiDebug.caller.name : 'ROOT', Array.prototype.slice.call(arguments).join(' '), '\n');
    }
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
            nameArr.unshift(obj.get('name'));
        }
        obj = new LiveAPI(function () { }, obj.get('canonical_parent'));
        counter++;
    }
    outlet(OUTLET_PARAM_NAME, nameArr.join(' > '));
}
fpDebug('reloaded fullParamName\n');
