// Probe: does [node.script] (Node for Max) run here, and can it send a raw UDP
// datagram? Reports progress as an int out the [node.script] outlet, so a
// parameter-enabled [live.numbox] downstream shows the result on the Push display:
//
//   0  -> Node for Max never started   (node.script NOT supported here)
//   1  -> Node started
//   2  -> require('dgram') + socket created
//   3  -> a raw UDP datagram actually sent (full capability we need)
//
// On desktop you should see 3. On Push 3 standalone, whatever it lands on tells
// us definitively whether the node.script approach is viable there.

const maxApi = require('max-api')

maxApi.outlet(1)
maxApi.post('nodecheck: Node for Max started')

try {
  const dgram = require('dgram')
  const sock = dgram.createSocket('udp4')
  maxApi.outlet(2)
  maxApi.post('nodecheck: dgram socket created')

  // loopback target; we only care that send() works, not that anything listens
  sock.send(Buffer.from([0x2f, 0x6f, 0x6b, 0x00]), 9999, '127.0.0.1', (err) => {
    if (err) {
      maxApi.post('nodecheck: send error: ' + err)
    } else {
      maxApi.outlet(3)
      maxApi.post('nodecheck: raw datagram sent OK')
    }
    try {
      sock.close()
    } catch (e) {}
  })
} catch (e) {
  maxApi.post('nodecheck: dgram unavailable: ' + e)
}
