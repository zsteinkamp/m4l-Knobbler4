"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanArr = exports.debouncedTask = exports.isDeviceSupported = exports.truncate = exports.colorToString = exports.isValidPath = exports.dequote = exports.logFactory = void 0;
var consts_1 = require("./consts");
function logFactory(_a) {
    var _b = _a.outputLogs, outputLogs = _b === void 0 ? true : _b;
    function log() {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        post(args
            .map(function (a) {
            return typeof a === 'string' ? a : JSON.stringify(a);
        })
            .join(' '), '\n');
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
function colorToString(colorVal) {
    if (!colorVal) {
        return consts_1.DEFAULT_COLOR;
    }
    var retString = parseInt(colorVal.toString()).toString(16).toUpperCase();
    var strlen = retString.length;
    for (var i = 0; i < 6 - strlen; i++) {
        retString = '0' + retString;
    }
    return retString;
}
exports.colorToString = colorToString;
function truncate(str, len) {
    //post('IN TRUNCATE ' + JSON.stringify({ str, len }) + '\n')
    if (str.length < len) {
        return str;
    }
    return str.substring(0, len - 2) + '…';
}
exports.truncate = truncate;
function isDeviceSupported(obj) {
    return !!obj.info.match(/property/);
}
exports.isDeviceSupported = isDeviceSupported;
var tasks = {};
function debouncedTask(key, slot, task, delayMs) {
    if (!tasks[key]) {
        tasks[key] = [];
    }
    if (tasks[key][slot]) {
        tasks[key][slot].cancel();
        tasks[key][slot].freepeer();
        tasks[key][slot] = null;
    }
    tasks[key][slot] = task;
    tasks[key][slot].schedule(delayMs);
}
exports.debouncedTask = debouncedTask;
function cleanArr(arr) {
    if (!arr) {
        return [];
    }
    return arr.filter(function (e) {
        return parseInt(e).toString() === e.toString();
    });
}
exports.cleanArr = cleanArr;
