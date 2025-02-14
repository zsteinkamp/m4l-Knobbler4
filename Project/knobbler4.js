"use strict";
var utils_1 = require("./utils");
var config_1 = require("./config");
var consts_1 = require("./consts");
var KnobblerCore = require("./knobblerCore");
autowatch = 1;
inlets = 1;
outlets = 2;
var log = (0, utils_1.logFactory)(config_1.default);
setinletassist(consts_1.INLET_MSGS, 'Receives messages and args to call JS functions');
setinletassist(consts_1.OUTLET_OSC, 'Output OSC messages');
setinletassist(consts_1.OUTLET_MSGS, 'Output messages for other devices or bpatchers. Example: 5-SLOT mapped 1');
function initAll() {
    KnobblerCore.initAll();
}
function bkMap(slot, id) {
    KnobblerCore.bkMap(slot, id);
}
function clearCustomName(slot) {
    KnobblerCore.clearCustomName(slot);
}
function setCustomName(slot, args) {
    KnobblerCore.setCustomName(slot, args);
}
function clearPath(slot) {
    KnobblerCore.clearPath(slot);
}
function setMin(slot, val) {
    KnobblerCore.setMin(slot, val);
}
function setMax(slot, val) {
    KnobblerCore.setMax(slot, val);
}
function setPath(slot, paramPath) {
    KnobblerCore.setPath(slot, paramPath);
}
function refresh() {
    KnobblerCore.refresh();
}
function val(slot, val) {
    KnobblerCore.val(slot, val);
}
function unmap(slot) {
    KnobblerCore.unmap(slot);
}
function setDefault(slot) {
    KnobblerCore.setDefault(slot);
}
function gotoTrackFor(slot) {
    KnobblerCore.gotoTrackFor(slot);
}
log('reloaded knobbler4');
// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
