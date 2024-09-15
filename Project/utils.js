"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logFactory = void 0;
function logFactory(_a) {
    var _b = _a.outputLogs, outputLogs = _b === void 0 ? true : _b;
    function log(_) {
        post(Array.prototype.slice.call(arguments).join(' '), '\n');
    }
    if (!outputLogs) {
        return function () { };
    }
    return log;
}
exports.logFactory = logFactory;
