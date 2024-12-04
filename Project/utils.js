"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.debouncedTask = exports.isValidPath = exports.dequote = exports.logFactory = void 0;
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
function dequote(str) {
    //log(str, typeof str)
    return str.toString().replace(/^"|"$/g, '');
}
exports.dequote = dequote;
function isValidPath(path) {
    return typeof path === 'string' && path.match(/^live_set /);
}
exports.isValidPath = isValidPath;
var tasks = {};
function debouncedTask(key, slot, task, delayMs) {
    if (!tasks[key]) {
        tasks[key] = [];
    }
    if (tasks[key][slot]) {
        tasks[key][slot].cancel();
        tasks[key][slot] = null;
    }
    tasks[key][slot] = task;
    tasks[key][slot].schedule(delayMs);
}
exports.debouncedTask = debouncedTask;
