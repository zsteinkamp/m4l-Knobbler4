"use strict";
// Focused test: instantiate LiveAPI for every clip slot, get name, deallocate
// ES5 version for [js] engine
// Send "run" to execute

autowatch = 1;
inlets = 1;
outlets = 0;

var noFn = function () {};

function run() {
  var api = new LiveAPI(noFn, 'live_set');

  // gather track ids
  var trackIds = [];
  var raw = api.get('tracks');
  for (var i = 0; i < raw.length; i++) {
    var n = parseInt(raw[i].toString());
    if (n.toString() === raw[i].toString()) trackIds.push(n);
  }
  // skip return tracks and master — no clip slots

  // get scene count
  var sceneRaw = api.get('scenes');
  var sceneCount = 0;
  for (var i = 0; i < sceneRaw.length; i++) {
    if (parseInt(sceneRaw[i].toString()).toString() === sceneRaw[i].toString())
      sceneCount++;
  }

  var totalSlots = trackIds.length * sceneCount;
  post('Tracks: ' + trackIds.length + '  Scenes: ' + sceneCount + '  Total slots: ' + totalSlots + '\n');

  // warm up
  for (var t = 0; t < Math.min(3, trackIds.length); t++) {
    api.id = trackIds[t];
    api.get('name');
  }

  var reps = 5;
  var times = [];

  for (var r = 0; r < reps; r++) {
    var clipCount = 0;
    var t0 = new Date().getTime();

    for (var t = 0; t < trackIds.length; t++) {
      for (var s = 0; s < sceneCount; s++) {
        var clipApi = new LiveAPI(noFn, 'id ' + trackIds[t]);
        clipApi.path = clipApi.unquotedpath + ' clip_slots ' + s + ' clip';
        if (+clipApi.id !== 0) {
          clipApi.get('name');
          clipCount++;
        }
        clipApi.id = 0;
      }
    }

    var elapsed = new Date().getTime() - t0;
    times.push(elapsed);
    post('  run ' + (r + 1) + ': ' + elapsed + 'ms (' + clipCount + ' clips found)\n');
  }

  times.sort(function (a, b) { return a - b; });
  post('  median: ' + times[Math.floor(times.length / 2)] + 'ms\n');
  post('Done.\n');
}

var module = {};
module.exports = {};
