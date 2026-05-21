#!/usr/bin/env python3
"""Unpack / pack / jq-edit the JSON payload of a Max .amxd device file.

An .amxd is a binary header followed by the patcher JSON and a trailing NUL.
The JSON byte-length is a little-endian uint32 stored in the 4 bytes immediately
before the JSON (right after the 'ptch' marker) — so it lives at `start-4`,
where `start` is the offset of the first '{'. This is robust to header size
(stock devices use a 32-byte header; some older ones are larger).

Read/Edit tools corrupt the binary header (UTF-8 round-tripping mangles the raw
bytes), so never edit a .amxd directly — unpack it, edit the plain JSON with any
tool (Read/Edit/jq/python), then pack it back.

Usage:
  amxd.py unpack DEVICE.amxd [OUT.json]        # extract JSON (byte-exact; stdout if no OUT)
  amxd.py pack   IN.json DEVICE.amxd [--from REF.amxd]   # rebuild DEVICE.amxd from IN.json
  amxd.py jq     DEVICE.amxd 'FILTER'          # run a jq filter on the JSON, write back in place

The header is never reconstructed — it's copied verbatim from an existing .amxd
(DEVICE.amxd itself, or `--from REF.amxd` when writing a fresh file). Only the
4-byte JSON-length field is patched so Max reads the right number of bytes.
"""
import sys
import json
import struct
import subprocess


def _obj_end(raw, start):
    """Byte offset just past the JSON object that begins at `start`. Brace-counts
    at the byte level (string/escape aware) so it never decodes trailing binary —
    some devices carry non-UTF-8 snapshot data after the JSON, within the size."""
    depth = 0
    in_str = False
    esc = False
    i = start
    n = len(raw)
    while i < n:
        c = raw[i]
        if in_str:
            if esc:
                esc = False
            elif c == 0x5C:  # backslash
                esc = True
            elif c == 0x22:  # "
                in_str = False
        elif c == 0x22:
            in_str = True
        elif c == 0x7B:  # {
            depth += 1
        elif c == 0x7D:  # }
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    raise ValueError("amxd: unterminated JSON object")


def _split(raw):
    """Return (header_bytes, json_bytes, trailing_bytes). json_bytes is the exact
    byte slice of the JSON object; trailing is whatever follows it within the
    declared size (normally a single NUL). The JSON byte-length lives at start-4."""
    start = raw.find(b"{")
    if start < 4:
        sys.exit("amxd: no JSON object found / header too small")
    header = raw[:start]
    size = struct.unpack("<I", raw[start - 4:start])[0]
    end = _obj_end(raw, start)
    return header, raw[start:end], raw[end:start + size]


def _write_amxd(path, header, json_bytes, trailing):
    json.loads(json_bytes)  # validate before clobbering the file
    payload = json_bytes + trailing
    out = bytearray(header)
    struct.pack_into("<I", out, len(header) - 4, len(payload))
    out += payload
    with open(path, "wb") as f:
        f.write(out)


def unpack(args):
    raw = open(args[0], "rb").read()
    _, json_bytes, _ = _split(raw)
    if len(args) > 1:
        open(args[1], "wb").write(json_bytes)
        print("amxd: wrote %d bytes of JSON to %s" % (len(json_bytes), args[1]))
    else:
        sys.stdout.buffer.write(json_bytes)


def pack(args):
    src_json, dst = args[0], args[1]
    # copy the header (and trailing NUL) verbatim from an existing .amxd —
    # the destination itself, or --from REF.amxd when creating a fresh file
    ref = dst
    if "--from" in args:
        ref = args[args.index("--from") + 1]
    header, _, trailing = _split(open(ref, "rb").read())
    _write_amxd(dst, header, open(src_json, "rb").read(), trailing)
    print("amxd: packed %s -> %s (header from %s)" % (src_json, dst, ref))


def jq(args):
    dst, flt = args[0], args[1]
    header, json_bytes, trailing = _split(open(dst, "rb").read())
    res = subprocess.run(["jq", flt], input=json_bytes, capture_output=True)
    if res.returncode != 0:
        sys.exit("amxd: jq failed:\n" + res.stderr.decode())
    _write_amxd(dst, header, res.stdout.rstrip(b"\n"), trailing)
    print("amxd: applied jq filter to %s" % dst)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    fn = {"unpack": unpack, "pack": pack, "jq": jq}.get(cmd)
    if not fn or len(sys.argv) < 3:
        sys.exit(__doc__)
    fn(sys.argv[2:])
