"""Serialize JSON the way Max writes .maxpat / .amxd patchers, so a load → edit
→ dump round trip only diffs what was edited."""
import json


def _scalar(v):
    return json.dumps(v, ensure_ascii=False)


def _is_scalar(v):
    return not isinstance(v, (dict, list))


def dumps(obj, indent=0, step='    '):
    pad = step * indent
    if isinstance(obj, dict):
        if not obj:
            return '{' + pad + '}'
        parts = []
        for k, v in obj.items():
            parts.append(pad + step + json.dumps(k, ensure_ascii=False) + ': ' + dumps(v, indent + 1, step))
        return '{\n' + ',\n'.join(parts) + '\n' + pad + '}'
    if isinstance(obj, list):
        if all(_is_scalar(v) for v in obj):
            if not obj:
                return '[ ]'
            return '[ ' + ', '.join(_scalar(v) for v in obj) + ' ]'
        parts = [pad + step + dumps(v, indent + 1, step) for v in obj]
        return '[\n' + ',\n'.join(parts) + '\n' + pad + ']'
    return _scalar(obj)


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def save(obj, path):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(dumps(obj))


if __name__ == '__main__':
    import sys
    for path in sys.argv[1:]:
        raw = open(path, encoding='utf-8').read()
        out = dumps(json.loads(raw))
        if out == raw:
            print('IDENTICAL', path)
        else:
            for i, (a, b) in enumerate(zip(raw, out)):
                if a != b:
                    print('DIFF at', i, repr(raw[i - 80:i + 80]), '\nvs\n', repr(out[i - 80:i + 80]))
                    break
            else:
                print('LENGTH DIFF', len(raw), len(out))
