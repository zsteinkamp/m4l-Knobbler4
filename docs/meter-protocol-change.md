# Meter Protocol Change: Batched Meter Values

## Old Protocol (removed)

Individual OSC messages per meter per strip:

- `/mixer/{N}/meterLeft {float}` — left channel level for strip N
- `/mixer/{N}/meterRight {float}` — right channel level for strip N
- `/mixer/{N}/meterLevel {float}` — combined level for strip N

These fired independently from LiveAPI observers with per-observer throttling (~20ms). With 12 strips × 3 meters = up to 36 individual packets per update cycle.

## New Protocol

A single batched OSC message:

```
/mixer/meters {JSON array}
```

The value is a flat JSON array: `[L0, R0, V0, L1, R1, V1, ...]`

- Each group of 3 values represents one strip: left, right, combined level
- Strip index N's values are at offsets: `N*3` (left), `N*3+1` (right), `N*3+2` (level)
- Array length = `visibleCount × 3`
- Fires every ~30ms when meters are enabled
- Values are floats (0.0–1.0 range, same as before)

### Example

With `visibleCount = 4`:

```json
[0.5, 0.4, 0.45, 0.8, 0.7, 0.75, 0.0, 0.0, 0.0, 0.3, 0.3, 0.3]
```

- Strip 0: L=0.5, R=0.4, V=0.45
- Strip 1: L=0.8, R=0.7, V=0.75
- Strip 2: L=0.0, R=0.0, V=0.0
- Strip 3: L=0.3, R=0.3, V=0.3

### App-side changes needed

Replace the individual meter message handlers with a single handler for `/mixer/meters`:

1. Parse the JSON array
2. Loop over strips: for strip index `i`, read values at `i*3`, `i*3+1`, `i*3+2`
3. Update meter UI for each strip
