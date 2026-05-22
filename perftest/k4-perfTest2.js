"use strict";
// Focused test: instantiate LiveAPI for every clip slot, get name, deallocate
// Load as both [js k4-perfTest2-es5] and [v8 k4-perfTest2]
// Send "run" to execute

var module = { exports: {} };

autowatch = 1;
inlets = 1;
outlets = 0;

const noFn = () => {};

function run() {
  const api = new LiveAPI(noFn, 'live_set');

  // gather track ids
  const trackIds = [];
  const raw = api.get('tracks');
  for (let i = 0; i < raw.length; i++) {
    const n = parseInt(raw[i].toString());
    if (n.toString() === raw[i].toString()) trackIds.push(n);
  }
  // skip return tracks and master — no clip slots

  // get scene count
  const sceneRaw = api.get('scenes');
  let sceneCount = 0;
  for (let i = 0; i < sceneRaw.length; i++) {
    if (parseInt(sceneRaw[i].toString()).toString() === sceneRaw[i].toString())
      sceneCount++;
  }

  const totalSlots = trackIds.length * sceneCount;
  post('Tracks: ' + trackIds.length + '  Scenes: ' + sceneCount + '  Total slots: ' + totalSlots + '\n');

  // warm up
  for (let t = 0; t < Math.min(3, trackIds.length); t++) {
    api.id = trackIds[t];
    api.get('name');
  }

  const reps = 5;
  const times = [];

  for (let r = 0; r < reps; r++) {
    let clipCount = 0;
    const t0 = new Date().getTime();

    for (let t = 0; t < trackIds.length; t++) {
      for (let s = 0; s < sceneCount; s++) {
        const clipApi = new LiveAPI(noFn, 'id ' + trackIds[t]);
        clipApi.path = clipApi.unquotedpath + ' clip_slots ' + s + ' clip';
        if (+clipApi.id !== 0) {
          clipApi.get('name');
          clipCount++;
        }
        clipApi.id = 0;
      }
    }

    const elapsed = new Date().getTime() - t0;
    times.push(elapsed);
    post('  run ' + (r + 1) + ': ' + elapsed + 'ms (' + clipCount + ' clips found)\n');
  }

  times.sort(function (a, b) { return a - b; });
  post('  median: ' + times[Math.floor(times.length / 2)] + 'ms\n');
  post('Done.\n');
}

module.exports = {};
