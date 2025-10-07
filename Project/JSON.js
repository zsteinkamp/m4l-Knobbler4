function list() {
    var a = arrayfromargs(arguments);
    var json = JSON.stringify(a);
    outlet(0, json);
}