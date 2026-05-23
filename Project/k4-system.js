"use strict";
// System module — the connection handshake, device-version reply, and the loose
// Max-side passthroughs (loop / refresh / configure) that were the last things
// left in [v8 router]. Folding this into the entry lets [v8 router] be deleted,
// leaving a single [v8 knobbler] + UI + the I/O objects.
//
// Inbound OSC (via the entry dispatcher):
//   /syn        -> /ack <ver> caps, /sendState 1, + deferred full re-push
//   /ping       -> /pong <ver> caps
//   /connect <ip>:<port> -> [s ---CONFIGURE] host/port for the node sender,
//                           then ctx.loopProbe() (knobbler.ts owns /loop)
//   /btnRefresh -> [s ---REFRESH_LOGIC] 'refresh'
//   /initMenu   -> [s ---REFRESH_LOGIC] 'initMenuOnly'
// Inbound Max message (entry top-level fn -> setDeviceVersion):
//   setDeviceVersion <ver> -> /deviceVersion <ver>
//
// clientVersion/clientCapabilities go through utils saveSetting (the shared
// transient named dict) because [k4-oscBatch] — a separate object — reads them
// to decide batching; that cross-object channel is why they aren't in ctx.
Object.defineProperty(exports, "__esModule", { value: true });
exports.init = exports.setDeviceVersion = exports.routes = void 0;
var k4_config_1 = require("./k4-config");
var utils_1 = require("./utils");
var consts_1 = require("./consts");
var log = (0, utils_1.logFactory)(k4_config_1.default);
// Device capabilities advertised back to the app in /ack and /pong replies.
var REPLY_CAPS = ' mxr mkMap swap pos';
var deviceVersion = '';
var synRefreshTask = null;
var ctx = null;
function saveClient(val) {
    if (!val) {
        return;
    }
    var parts = val.toString().split(' ');
    (0, utils_1.saveSetting)('clientVersion', parts[0]);
    (0, utils_1.saveSetting)('clientCapabilities', parts.slice(1).join(' '));
}
// Max message from the live.thisdevice version chain ([prepend setDeviceVersion]).
function setDeviceVersion(ver) {
    deviceVersion = ver.toString();
    (0, utils_1.osc)('/deviceVersion', deviceVersion);
}
exports.setDeviceVersion = setDeviceVersion;
// /syn — the app just connected. Reply, ask it to send its state, then fire a
// deferred full re-push: the modules pushed their state at LOAD (before connect,
// while the OSC-out gate was closed) and it was lost. Deferred so /ack settles.
function synAck(val) {
    saveClient(val);
    (0, utils_1.osc)('/ack', deviceVersion + REPLY_CAPS);
    (0, utils_1.osc)('/sendState', 1);
    if (synRefreshTask) {
        synRefreshTask.cancel();
    }
    synRefreshTask = new Task(function () {
        outlet(consts_1.OUTLET_REFRESH, 'refresh');
    });
    synRefreshTask.schedule(150);
}
function ping(val) {
    saveClient(val);
    (0, utils_1.osc)('/pong', deviceVersion + REPLY_CAPS);
}
// /connect <ip>:<port> — configure the node sender's target, then fire the
// feedback-loop probe (knobbler.ts owns the /loop guard).
function connect(val) {
    var parts = val.toString().split(':');
    if (parts.length === 2) {
        outlet(consts_1.OUTLET_CONFIGURE, 'host', parts[0]);
        outlet(consts_1.OUTLET_CONFIGURE, 'port', parseInt(parts[1]));
        ctx.loopProbe();
    }
}
function btnRefresh() {
    outlet(consts_1.OUTLET_REFRESH, 'refresh');
}
function initMenu() {
    outlet(consts_1.OUTLET_REFRESH, 'initMenuOnly');
}
var routes = [
    { prefix: '/syn', parse: 'val', fn: synAck },
    { prefix: '/ping', parse: 'val', fn: ping },
    { prefix: '/connect', parse: 'val', fn: connect },
    { prefix: '/btnRefresh', parse: 'bare', fn: btnRefresh },
    { prefix: '/initMenu', parse: 'bare', fn: initMenu },
];
exports.routes = routes;
// Wire this module's own utils instance to the orchestrator's OSC sink so the
// handshake replies (/ack, /pong, /sendState, /deviceVersion) are batched too.
function init(c) {
    (0, utils_1.setOscSink)(c.osc);
    ctx = c;
}
exports.init = init;
log('reloaded k4-system');
