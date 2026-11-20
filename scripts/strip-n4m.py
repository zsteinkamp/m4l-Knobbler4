#!/usr/bin/env python3
"""Remove embedded Max packages (Node for Max) from a frozen .amxd, in place.

Freezing a device that contains a node.script makes Max embed the WHOLE Node for
Max package (docs, examples, npm and its node_modules, ~82 MB) as a `pkg@` entry
named "Node for Max/zipfolder". Live already ships Node for Max (on the Push too),
so the copy is dead weight: it took the P3SA device from 1 MB to 83 MB.

Frozen layout (the parts this touches):

  'ampf' ... 'ptch' <u32 LE length> 'mx@c' <u32 BE 16> <u32 0> <u32 BE dlst offset>
      <file data, back to back> 'dlst' <u32 BE length> 'dire' records...

Offsets in the header and in each record's 'of32' are relative to 'mx@c'. The
script rewrites the data region without the `pkg@` entries, re-points 'of32',
drops their 'dire' records and fixes the three lengths/offsets. Everything else
is copied byte for byte.

Usage:
  strip-n4m.py DEVICE.amxd [...]     # strip in place; no-op if nothing embedded
  strip-n4m.py --check DEVICE.amxd   # exit 1 if any device still embeds a package
"""
import struct
import sys

PKG = b"pkg@"


def _u32be(b, o):
    return struct.unpack(">I", b[o:o + 4])[0]


def _records(raw, dlst):
    """Yield (start, length, fields) for each 'dire' record in the dlst chunk."""
    end = dlst + _u32be(raw, dlst + 4)
    p = dlst + 8
    while p < end:
        if raw[p:p + 4] != b"dire":
            sys.exit("strip-n4m: unexpected chunk %r in dlst" % raw[p:p + 4])
        n = _u32be(raw, p + 4)
        fields, q = {}, p + 8
        while q < p + n:
            tag, ln = raw[q:q + 4], _u32be(raw, q + 4)
            fields[tag] = (q + 8, raw[q + 8:q + ln])
            q += ln
        yield p, n, fields
        p += n


def _layout(raw):
    ptch = raw.find(b"ptch")
    mx = ptch + 8
    if ptch < 0 or raw[mx:mx + 4] != b"mx@c":
        return None  # not a frozen device
    dlst = mx + _u32be(raw, mx + 12)
    if raw[dlst:dlst + 4] != b"dlst":
        sys.exit("strip-n4m: dlst not where the header says")
    return ptch, mx, dlst


def embedded_packages(raw):
    lay = _layout(raw)
    if not lay:
        return []
    return [f[b"fnam"][1].rstrip(b"\0").decode()
            for _, _, f in _records(raw, lay[2]) if f[b"type"][1] == PKG]


def strip(path):
    raw = open(path, "rb").read()
    lay = _layout(raw)
    if not lay:
        print("strip-n4m: %s is not frozen, skipped" % path)
        return
    ptch, mx, dlst = lay
    recs = list(_records(raw, dlst))
    if not any(f[b"type"][1] == PKG for _, _, f in recs):
        print("strip-n4m: %s embeds no packages" % path)
        return

    kept = [(s, n, f) for s, n, f in recs if f[b"type"][1] != PKG]
    header = bytearray(raw[mx:mx + 16])

    # Copy the kept files' data in its original order, noting each new offset.
    data, new_off = bytearray(), {}
    for s, _, f in sorted(kept, key=lambda r: _u32be(r[2][b"of32"][1], 0)):
        off, size = _u32be(f[b"of32"][1], 0), _u32be(f[b"sz32"][1], 0)
        new_off[s] = len(header) + len(data)
        data += raw[mx + off:mx + off + size]

    # Rebuild the index in its original record order, re-pointing each 'of32'.
    index = bytearray()
    for s, n, f in kept:
        rec = bytearray(raw[s:s + n])
        struct.pack_into(">I", rec, f[b"of32"][0] - s, new_off[s])
        index += rec

    dlst_chunk = b"dlst" + struct.pack(">I", 8 + len(index)) + index
    struct.pack_into(">I", header, 12, len(header) + len(data))
    body = bytes(header) + bytes(data) + dlst_chunk
    trailer = raw[dlst + _u32be(raw, dlst + 4):]  # normally empty
    out = bytearray(raw[:ptch + 4]) + struct.pack("<I", len(body) + len(trailer)) + body + trailer
    open(path, "wb").write(out)

    removed = [f[b"fnam"][1].rstrip(b"\0").decode() for _, _, f in recs if f[b"type"][1] == PKG]
    print("strip-n4m: %s: removed %s, %d -> %d bytes"
          % (path, ", ".join(removed), len(raw), len(out)))
    if embedded_packages(bytes(out)):
        sys.exit("strip-n4m: verification failed for %s" % path)


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    if args[0] == "--check":
        bad = [(p, embedded_packages(open(p, "rb").read())) for p in args[1:]]
        bad = [(p, pk) for p, pk in bad if pk]
        for p, pk in bad:
            print("strip-n4m: %s embeds %s; run scripts/strip-n4m.py on it" % (p, ", ".join(pk)))
        sys.exit(1 if bad else 0)
    for p in args:
        strip(p)
