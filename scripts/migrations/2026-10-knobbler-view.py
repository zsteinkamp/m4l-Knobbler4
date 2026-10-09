"""Knobbler device UI: one Knobbler tab with a page menu + 16 view bpatchers.

    python3 scripts/migrations/2026-10-knobbler-view.py .

Builds Project/knobView-bpatcher.maxpat from knobSlot-bpatcher.maxpat and
rewrites the patcher inside Project/Knobbler4.amxd and Knobbler4-P3SA.amxd.
Every edit asserts the object it touches still holds what it expects, so this
refuses to run twice. Applied 2026-10-09; kept so the patcher change can be
reviewed and re-derived (git checkout the pre-change devices first).
"""
import copy
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import maxjson  # noqa: E402

REPO = sys.argv[1]
PROJECT = os.path.join(REPO, 'Project')
SCRATCH = os.environ.get('TMPDIR', '/tmp')
VIEW_FILE = 'knobView-bpatcher.maxpat'
VIEW_TARGET_BASE = 1000
# The view's min/max numboxes, which stay (Hidden) parameters: id → longname
# suffix, shortname. Registered per view in the device as obj-<view>::obj-<id>.
VIEW_NUMBOXES = {'obj-3': ('targetMax', 'Max'), 'obj-8': ('targetMin', 'Min')}
# Presentation layout of the Knobbler tab content (the device is 169pt tall):
# the page menu on top, then two rows of 72pt views.
MENU_TOP, MENU_HEIGHT = 1.0, 18.0
VIEW_TOPS = (22.0, 96.0)


# The P3SA device has neither the discovery umenu nor the port numbox the main
# device does, so the new widgets are built from these, styled like those.
UMENU = {
    'bgcolor': [0.1411764705882353, 0.1411764705882353, 0.1411764705882353, 1.0],
    'bgfillcolor_angle': 270.0,
    'bgfillcolor_color': [0.1411764705882353, 0.1411764705882353, 0.1411764705882353, 1.0],
    'bgfillcolor_proportion': 0.39,
    'bgfillcolor_type': 'color',
    'fontname': 'Ableton Sans Medium',
    'maxclass': 'umenu',
    'numinlets': 1,
    'numoutlets': 3,
    'outlettype': ['int', '', ''],
    'parameter_enable': 0,
    'presentation': 1,
    'saved_attribute_attributes': {
        'bgfillcolor': {'expression': 'themecolor.live_control_text_bg'},
        'textcolor': {'expression': 'themecolor.live_control_fg'},
    },
}
NUMBOX = {
    'maxclass': 'live.numbox',
    'numinlets': 1,
    'numoutlets': 2,
    'outlettype': ['', 'float'],
    'parameter_enable': 1,
}


class Patch:
    def __init__(self, patcher):
        self.p = patcher
        self.boxes = {b['box']['id']: b['box'] for b in patcher['boxes']}

    def box(self, id, maxclass=None, text=None):
        b = self.boxes[id]
        if maxclass is not None:
            assert b['maxclass'] == maxclass, (id, b['maxclass'], maxclass)
        if text is not None:
            assert b.get('text') == text, (id, b.get('text'), text)
        return b

    def retext(self, id, old, new, outlets=None):
        b = self.box(id, text=old)
        b['text'] = new
        if outlets is not None:
            b['numoutlets'] = outlets
            b['outlettype'] = [''] * outlets

    def add(self, box, before=None):
        """Add a box. `before`: the id it must draw ON TOP of — Max draws a
        patcher's boxes back to front from the END of the list, so a box listed
        later is hidden behind any earlier box it overlaps."""
        assert box['id'] not in self.boxes, box['id']
        entry = {'box': box}
        if before is None:
            self.p['boxes'].append(entry)
        else:
            i = [b['box']['id'] for b in self.p['boxes']].index(before)
            self.p['boxes'].insert(i, entry)
        self.boxes[box['id']] = box
        return box

    def remove(self, id):
        self.p['boxes'] = [b for b in self.p['boxes'] if b['box']['id'] != id]
        del self.boxes[id]
        self.p['lines'] = [
            l for l in self.p['lines']
            if l['patchline']['source'][0] != id
            and l['patchline']['destination'][0] != id
        ]

    def line(self, src, outlet, dst, inlet):
        assert src in self.boxes and dst in self.boxes, (src, dst)
        self.p['lines'].append({'patchline': {
            'destination': [dst, inlet], 'source': [src, outlet]}})

    def unline(self, src, outlet, dst, inlet):
        before = len(self.p['lines'])
        self.p['lines'] = [
            l for l in self.p['lines']
            if not (l['patchline']['source'] == [src, outlet]
                    and l['patchline']['destination'] == [dst, inlet])
        ]
        assert len(self.p['lines']) == before - 1, (src, outlet, dst, inlet)

    def relink_outlet(self, src, old_outlet, new_outlet, dst):
        n = 0
        for l in self.p['lines']:
            pl = l['patchline']
            if pl['source'] == [src, old_outlet] and pl['destination'][0] == dst:
                pl['source'] = [src, new_outlet]
                n += 1
        assert n == 1, (src, old_outlet, dst)


def obj(id, text, rect, inlets, outlets):
    return {
        'id': id, 'maxclass': 'newobj', 'numinlets': inlets,
        'numoutlets': outlets, 'outlettype': [''] * outlets,
        'patching_rect': rect, 'text': text,
    }


def msg(id, text, rect):
    return {
        'id': id, 'maxclass': 'message', 'numinlets': 2, 'numoutlets': 1,
        'outlettype': [''], 'patching_rect': rect, 'text': text,
    }


# --- the view bpatcher ------------------------------------------------------

def build_view():
    src = maxjson.load(os.path.join(PROJECT, 'knobSlot-bpatcher.maxpat'))
    v = Patch(src['patcher'])

    # No path persistence and no 'unmap' reset in a view: the slot's config
    # lives in the settings dict, and a view is only ever told what to show.
    for id in ('obj-86', 'obj-20', 'obj-32', 'obj-21', 'obj-5',
               'obj-66', 'obj-58', 'obj-65', 'obj-11'):
        v.remove(id)

    # 'path' → 'range <min> <max>', shown in the numboxes without output.
    v.retext('obj-31', 'route mapped unmap param device track color path',
             'route mapped unmap param device track color range')
    x, y = 640.0, 260.0
    v.add(obj('obj-100', 'unpack 0 0', [x, y, 61.0, 22.0], 1, 2))
    v.add(obj('obj-101', 'prepend set', [x, y + 34, 70.0, 22.0], 1, 1))
    v.add(obj('obj-102', 'prepend set', [x + 80, y + 34, 70.0, 22.0], 1, 1))
    v.line('obj-31', 6, 'obj-100', 0)
    v.line('obj-100', 0, 'obj-101', 0)
    v.line('obj-100', 1, 'obj-102', 0)
    v.line('obj-101', 0, 'obj-8', 0)
    v.line('obj-102', 0, 'obj-3', 0)

    # Listen on ---<1000 + position>-SLOT (the device forwarder's numeric
    # targets; the legacy importers keep 1..32).
    v.box('obj-10', 'message', '#1')
    pak = v.box('obj-188', 'newobj', 'pak s i')
    v.add(obj('obj-103', '+ %d' % VIEW_TARGET_BASE,
              [pak['patching_rect'][0] + 60, pak['patching_rect'][1] - 30,
               50.0, 22.0], 2, 1))
    v.unline('obj-10', 0, 'obj-188', 1)
    v.line('obj-10', 0, 'obj-103', 0)
    v.line('obj-103', 0, 'obj-188', 1)

    # Edits go out by POSITION; knobblerCore maps them to slots.
    v.retext('obj-44', 'setMin #1 $1', 'viewMin #1 $1')
    v.retext('obj-43', 'setMax #1 $1', 'viewMax #1 $1')
    v.retext('obj-19', 'setCustomName #1 $1', 'viewName #1 $1')
    v.retext('obj-16', 'clearCustomName #1', 'viewClearName #1')
    v.retext('obj-47', 'clearPath #1', 'viewUnmap #1')

    # A view stores nothing. The name field and X need no parameter mode; the
    # min/max live.numboxes DO — with it off they don't render at all — so they
    # keep it as Hidden parameters (parameter_invisible 2: neither stored with
    # the set nor automatable), under view-specific names.
    for id in ('obj-1', 'obj-28', 'obj-3', 'obj-8'):
        b = v.box(id)
        valueof = b.get('saved_attribute_attributes', {}).get('valueof')
        if valueof:
            valueof['parameter_longname'] = valueof['parameter_longname'].replace(
                '#1_', '#1_view_')
        if id in VIEW_NUMBOXES:
            valueof['parameter_invisible'] = 2
        else:
            b['parameter_enable'] = 0
    v.p['parameters'] = {
        id: ['#1_view_' + field, short, 0]
        for id, (field, short) in VIEW_NUMBOXES.items()
    }
    v.p['parameters']['inherited_shortname'] = 1

    # 72pt tall instead of 82, to make room for the page menu above the views:
    # everything moves up 4pt and the color bar shortens to match.
    for b in v.boxes.values():
        r = b.get('presentation_rect')
        if b.get('presentation') and r:
            b['presentation_rect'] = [r[0], r[1] - 4, r[2], r[3]]
    bar = v.box('obj-25', 'live.line')
    r = bar['presentation_rect']
    bar['presentation_rect'] = [r[0], r[1], r[2], 70.0]

    v.box('obj-6', 'comment')['text'] = (
        'A view of ONE slot on the Knobbler page showing. Argument 1 (#1) is '
        'its position on the page, 1-16. It listens on ---<1000 + #1>-SLOT '
        'and reports edits by position (viewMin/viewMax/viewName/'
        'viewClearName/viewUnmap); knobblerCore maps positions to slots. It '
        'has no Live parameters: slot config lives in the settings dict.')

    maxjson.save(src, os.path.join(PROJECT, VIEW_FILE))


# --- the device patcher -----------------------------------------------------

def transform_device(amxd):
    work = os.path.join(SCRATCH, os.path.basename(amxd) + '.json')
    subprocess.check_call(['python3', os.path.join(REPO, 'scripts', 'amxd.py'),
                           'unpack', amxd, work])
    d = maxjson.load(work)
    m = Patch(d['patcher'])

    # 1. One Knobbler entry. The Page parameter keeps its name, so existing
    #    Page automation shifts by one entry (accepted).
    pages = ['Knobbler', 'Bluhand', 'Clips', 'Mixer', 'Session']
    for id in ('obj-49', 'obj-98'):
        tab = m.box(id, 'live.tab')
        valueof = tab['saved_attribute_attributes']['valueof']
        assert valueof['parameter_enum'][:2] == ['Knobbler 1', 'Knobbler 2']
        valueof['parameter_enum'] = pages
        valueof['parameter_mmax'] = len(pages) - 1
        tab['num_lines_patching'] = len(pages)
        tab['num_lines_presentation'] = len(pages)
    panel = m.box('obj-78', 'panel')
    content = panel['presentation_rect']  # the tab content area

    # 2. Tab → app.
    m.retext('obj-131', 'route 0 1 2 3 4 5', 'route 0 1 2 3 4', outlets=6)
    m.box('obj-133', 'message', '/page/knobbler1')['text'] = '/page/knobbler'
    m.box('obj-134', 'message', '/page/knobbler2')['text'] = '/page/bluhand'
    m.box('obj-135', 'message', '/page/bluhand')['text'] = '/page/clips'
    m.box('obj-251', 'message', '/page/clips')['text'] = '/page/mixer'
    m.box('obj-254', 'message', '/page/mixer')['text'] = '/page/session'
    m.box('obj-247', 'message', '/page/session')
    m.remove('obj-247')
    m.relink_outlet('obj-131', 6, 5, 'obj-132')

    # 3. App → tab. An older app still names knobbler1/knobbler2.
    m.retext('obj-142', 'route knobbler1 knobbler2 bluhand clips mixer session',
             'route knobbler bluhand clips mixer session knobbler1 knobbler2',
             outlets=8)
    m.box('obj-259', 'message', '5')['text'] = '0'
    m.box('obj-143', 'message', '0')
    m.line('obj-142', 6, 'obj-143', 0)

    # 4. Show/hide: Bluhand's shortcuts and the blank cover move up one index.
    m.retext('obj-64', 'if $i1 == 2 then show else hide',
             'if $i1 == 1 then show else hide')
    m.retext('obj-906', 'if $i1 >= 3 then show else hide',
             'if $i1 >= 2 then show else hide')

    # 5. The Knobbler tab shows the 16 views and the page menu.
    m.retext('obj-67', 'uzi 32', 'uzi 16')
    m.retext('obj-68',
             'if ($i2 == 0 && $i1 < 17) || ($i2 == 1 && $i1 > 16) then show else hide',
             'if $i2 == 0 && $i1 > 0 then show else hide')
    m.retext('obj-73', 'sprintf "script %s bpatcher%d"',
             'sprintf "script %s view%d"')
    r = m.box('obj-73')['patching_rect']
    m.add(obj('obj-2000', 'sprintf "script %s kPageMenu"',
              [r[0] + 200, r[1], 170.0, 20.0], 1, 1))
    m.line('obj-68', 0, 'obj-2000', 0)
    m.line('obj-2000', 0, 'obj-226', 0)

    # 6. The 32 knob-slot bpatchers become hidden legacy importers (remove
    #    after 2028-05-21 — see knobblerCore "Legacy importers").
    legacy = {}
    for b in m.boxes.values():
        if b['maxclass'] == 'bpatcher' and b.get('name') == 'knobSlot-bpatcher.maxpat':
            legacy[b['args'][0]] = b
            b['hidden'] = 1
            b['presentation'] = 0
    assert sorted(legacy) == list(range(1, 33)), sorted(legacy)

    # 7. 16 view bpatchers where slots 1-16 used to sit.
    for pos in range(1, 17):
        v = copy.deepcopy(legacy[pos])
        v['id'] = 'obj-%d' % (2000 + pos)
        v['name'] = VIEW_FILE
        v['args'] = [pos]
        v['varname'] = 'view%d' % pos
        v['presentation'] = 1
        v['hidden'] = 0
        r = legacy[pos]['presentation_rect']
        v['presentation_rect'] = [r[0], VIEW_TOPS[(pos - 1) // 8], r[2], 72.0]
        v['patching_rect'] = [21.0 + ((pos - 1) % 8) * 150.0,
                              2000.0 + ((pos - 1) // 8) * 90.0, 141.0, 76.0]
        m.add(v, before='obj-78')
        for id, (field, short) in VIEW_NUMBOXES.items():
            m.p['parameters']['%s::%s' % (v['id'], id)] = [
                '%d_view_%s' % (pos, field), short, 0]

    # 8. The page menu, under the tab, filled by knobblerCore ("kmenu …").
    m.retext('obj-183', 'route page', 'route page kmenu kparam', outlets=4)
    menu = copy.deepcopy(UMENU)
    menu.update({
        'id': 'obj-2020',
        'varname': 'kPageMenu',
        'hint': 'Knobbler page',
        'annotation': 'The Knobbler page shown here, kept in step with the app.',
        'patching_rect': [2036.0, 2000.0, 100.0, 20.0],
        'presentation_rect': [content[0] + 8, MENU_TOP, 160.0, MENU_HEIGHT],
    })
    m.add(menu, before='obj-78')
    m.add(obj('obj-2021', 'prepend uiPage', [2036.0, 2040.0, 90.0, 20.0], 1, 1))
    m.box('obj-260', 'newobj', 'v8 knobbler')
    m.line('obj-183', 1, 'obj-2020', 0)
    m.line('obj-2020', 0, 'obj-2021', 0)
    m.line('obj-2021', 0, 'obj-260', 0)

    # 9. The automatable page: a hidden "Knobbler Page" parameter, written and
    #    read only while Automate Page Chg is on (as the Page tab is).
    numbox = copy.deepcopy(NUMBOX)
    numbox.update({
        'id': 'obj-2022',
        'varname': 'knobblerPage',
        'patching_rect': [2200.0, 2080.0, 44.0, 15.0],
        'presentation': 0,
        'hidden': 1,
    })
    numbox['saved_attribute_attributes'] = {}
    numbox['saved_attribute_attributes']['valueof'] = {
        'parameter_initial': [1],
        'parameter_initial_enable': 1,
        'parameter_longname': 'Knobbler Page',
        'parameter_mmax': 16,
        'parameter_mmin': 1,
        'parameter_modmode': 0,
        'parameter_shortname': 'Knob Page',
        'parameter_type': 1,
        'parameter_unitstyle': 0,
    }
    m.add(numbox)
    m.p['parameters']['obj-2022'] = ['Knobbler Page', 'Knob Page', 0]
    m.box('obj-196', 'live.text')
    m.add(obj('obj-2023', 'gate 1', [2200.0, 2000.0, 40.0, 20.0], 2, 1))
    m.add(msg('obj-2024', 'set $1', [2200.0, 2040.0, 45.0, 20.0]))
    m.add(obj('obj-2025', 'gate 1', [2200.0, 2120.0, 40.0, 20.0], 2, 1))
    m.add(obj('obj-2026', '- 1', [2200.0, 2160.0, 30.0, 20.0], 2, 1))
    m.line('obj-183', 2, 'obj-2023', 1)
    m.line('obj-196', 0, 'obj-2023', 0)
    m.line('obj-2023', 0, 'obj-2024', 0)
    m.line('obj-2024', 0, 'obj-2022', 0)
    m.line('obj-2022', 0, 'obj-2025', 1)
    m.line('obj-196', 0, 'obj-2025', 0)
    m.line('obj-2025', 0, 'obj-2026', 0)
    m.line('obj-2026', 0, 'obj-2021', 0)
    bank = m.p['parameters']['parameterbanks']['0']['parameters']
    bank[bank.index('-')] = 'Knobbler Page'

    # 10. Ship the view bpatcher with the device.
    m.p['project']['contents']['patchers'][VIEW_FILE] = {'kind': 'patcher'}

    maxjson.save(d, work)
    subprocess.check_call(['python3', os.path.join(REPO, 'scripts', 'amxd.py'),
                           'pack', work, amxd])


if __name__ == '__main__':
    build_view()
    for name in ('Knobbler4.amxd', 'Knobbler4-P3SA.amxd'):
        transform_device(os.path.join(PROJECT, name))
    print('done')
