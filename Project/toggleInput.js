inlets = 1;
outlets = 1;
var origInputs = {};
var lo = null;
var currTrack = null;
var tiDebugLog = false;
function tiDebug(_) {
    if (tiDebugLog) {
        post(tiDebug.caller ? tiDebug.caller.name : 'ROOT', Array.prototype.slice.call(arguments).join(' '), '\n');
    }
}
function getTrackStatus() {
    var airt = null;
    var currentInput = null;
    var noInput = null;
    var allInputs = null;
    var inputEnabled = false;
    //tiDebug(currTrack.type);
    if (currTrack.get('is_foldable') == '0' &&
        currTrack.get('can_be_frozen') == '1') {
        //tiDebug("IN HERE");
        var airt = JSON.parse(currTrack.get('available_input_routing_types')).available_input_routing_types;
        currentInput = JSON.parse(currTrack.get('input_routing_type')).input_routing_type;
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
    //tiDebug(JSON.stringify(ret));
    return ret;
}
function updateTrackDisplay() {
    var trackStatus = getTrackStatus();
    //tiDebug('inputEnabled?', trackStatus.inputEnabled);
    if (trackStatus.inputEnabled) {
        outlet(0, ['/toggleInput', 1]);
    }
    else {
        outlet(0, ['/toggleInput', 0]);
    }
}
function currentTrackCallback(a) {
    var args = arrayfromargs(a);
    if (args.shift() !== 'selected_track') {
        //tiDebug("RETURNING1");
        return;
    }
    var trackId = args.join(' ');
    if (trackId === 'id 0') {
        //tiDebug("RETURNING2");
        return;
    }
    currTrack = new LiveAPI(function () { }, trackId);
    updateTrackDisplay();
}
function tiInit() {
    //post("INIT\n");
    lo = new LiveAPI(currentTrackCallback, 'live_set view');
    lo.mode = 1;
    lo.property = 'selected_track';
}
function toggle() {
    //tiDebug("IN TOGGLE");
    var trackStatus = getTrackStatus();
    var ret = null;
    if (trackStatus.inputEnabled) {
        origInputs[currTrack.id] = trackStatus.currentInput;
        // set to No Input
        ret = trackStatus.noInput;
    }
    else {
        // set to Original, TODO default to All Inputs
        ret = origInputs[currTrack.id] || trackStatus.allInputs;
    }
    if (trackStatus.currentInput) {
        currTrack.set('input_routing_type', ret);
    }
    updateTrackDisplay();
}
tiDebug('reloaded toggleInput\n');
