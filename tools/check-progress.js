#!/usr/bin/env node
// Verify /clips/progress only streams while the transport is PLAYING.
// Declares the 'prog' capability (so the device enables progress streaming),
// enters the clips page, and counts /clips/progress over a window.
//   - transport STOPPED  -> expect ~0
//   - a clip PLAYING     -> expect ~20/s (50ms poll)
//
// Run on the host: node tools/check-progress.js [--listen 9100] [--secs 3]

const { OscClient } = require('./osc')

const opt = { host: '127.0.0.1', to: 2346, listen: 9100, secs: 3 }
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--listen') opt.listen = +argv[++i]
  else if (argv[i] === '--to') opt.to = +argv[++i]
  else if (argv[i] === '--host') opt.host = argv[++i]
  else if (argv[i] === '--secs') opt.secs = +argv[++i]
}

async function main() {
  const client = new OscClient({ host: opt.host, sendPort: opt.to, listenPort: opt.listen })
  await client.bind()
  client.send('/connect', [`${opt.host}:${opt.listen}`])
  await client.sleep(150)
  client.send('/syn', ['1.0 prog']) // declare prog so the device streams progress
  await client.waitFor((m) => m.address === '/ack', 2000)
  await client.sleep(400)

  client.send('/page/clips', [])
  client.send('/clipView', ['[0,0,8,8]'])
  await client.sleep(500) // let the window settle

  const mark = client.since()
  console.log(`watching /clips/progress for ${opt.secs}s...`)
  await client.sleep(opt.secs * 1000)

  const msgs = client.log.slice(mark).filter((m) => m.address === '/clips/progress')
  const rate = (msgs.length / opt.secs).toFixed(1)
  console.log(`\n/clips/progress: ${msgs.length} messages  (${rate}/s)`)
  if (msgs.length === 0) {
    console.log('✅ silent — correct if the transport is STOPPED / nothing playing')
  } else {
    console.log(`📈 streaming — correct ONLY if a clip is currently PLAYING`)
    console.log(`   sample: ${JSON.stringify(msgs[msgs.length - 1].args)}`)
  }
  client.close()
  process.exit(0)
}

main().catch((e) => {
  console.error('error:', e)
  process.exit(1)
})
