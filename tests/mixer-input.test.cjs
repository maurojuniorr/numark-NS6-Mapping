const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function loadMapping() {
    const writes = [], midiWrites = [], timers = new Map();
    let nextTimer = 1;
    const values = {};
    const engine = {
        makeConnection() { return { disconnect() {}, trigger() {} }; },
        setValue(group, key, value) { writes.push({ group, key, value }); values[`${group}.${key}`] = value; },
        getValue(group, key) { return values[`${group}.${key}`] || 0; },
        beginTimer(ms, callback) { const id = nextTimer++; timers.set(id, callback); return id; },
        stopTimer(id) { timers.delete(id); },
    };
    const components = {
        Encoder: function() {}, Component: function() {}, ComponentContainer: function() {},
        Deck: function() {}, Pot: function(options) { Object.assign(this, options); },
    };
    const context = { engine, components, midi: { sendShortMsg(...args) { midiWrites.push(args); }, sendSysexMsg() {} }, print() {} };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../Numark-NS6-scripts.js'), 'utf8'), context);
    return { mapping: context.NumarkNS6, writes, values, midiWrites, timers, source: fs.readFileSync(path.join(__dirname, '../Numark-NS6-scripts.js'), 'utf8') };
}

test('PFL buttons map directly to matching Mixxx decks', () => {
    const { mapping, values } = loadMapping();
    for (let channel = 1; channel <= 4; channel++) {
        assert.equal(mapping.pflGroupForChannel(channel), `[Channel${channel}]`);
        mapping.pflButtonInput(channel, 127, 0x90);
        for (let deck = 1; deck <= 4; deck++) {
            assert.equal(values[`[Channel${deck}].pfl`], deck === channel ? 1 : 0);
        }
        assert.equal(mapping.activePFLDeck, channel);
        mapping.pflButtonInput(channel, 0, 0x80);
        assert.equal(values[`[Channel${channel}].pfl`], 0, 'Note Off turns that deck PFL off');
        assert.equal(mapping.activePFLDeck, 0);
    }
});

test('activating a new PFL clears the prior one; Note On velocity zero is off', () => {
    const { mapping, values } = loadMapping();
    mapping.pflButtonInput(1, 127, 0x90);
    mapping.pflButtonInput(2, 127, 0x90);
    assert.equal(values['[Channel1].pfl'], 0);
    assert.equal(values['[Channel2].pfl'], 1);
    mapping.pflButtonInput(2, 0, 0x90);
    assert.equal(values['[Channel2].pfl'], 0);
});

test('PFL LEDs subscribe to the mapped Mixxx deck group', () => {
    const { source } = loadMapping();
    assert.match(source, /group: NumarkNS6\.pflGroupForChannel\(channel\), key: "pfl"/);
});

test('PFL buttons do not send LED feedback MIDI because the NS6 mixer drives its own LEDs', () => {
    const { source } = loadMapping();
    const handler = source.slice(source.indexOf('this.pflButton = new components.Button'), source.indexOf('var loadNote =', source.indexOf('this.pflButton = new components.Button')));
    assert.match(handler, /outConnect:\s*false/);
    assert.match(handler, /shutdown:\s*function\(\)\s*\{\s*\}/);
    assert.doesNotMatch(handler, /sendPFLLED|midi\.sendShortMsg/);
});

test('PFL input consumes Note On and Note Off state transitions', () => {
    const { source } = loadMapping();
    const handler = source.slice(source.indexOf('this.pflButton = new components.Button'), source.indexOf('var loadNote =', source.indexOf('this.pflButton = new components.Button')));
    assert.match(handler, /pflButtonInput\(channel, val, status\)/);
    assert.match(source, /messageType === 0x80/);
});

test('volume fader accepts a large move to zero instead of retaining a stale MSB', () => {
    const { mapping, writes } = loadMapping();
    const fader = mapping.makeVolumeFader(1);
    fader.inputMSB(0, 0, 64);
    fader.inputLSB(0, 0, 127);
    fader.inputMSB(0, 0, 0);
    fader.inputLSB(0, 0, 0);
    assert.equal(writes.at(-1).value, 0);
});

test('volume fader rejects an isolated full-scale spike but accepts subsequent normal values', () => {
    const { mapping, writes } = loadMapping();
    const fader = mapping.makeVolumeFader(3);
    fader.inputMSB(0, 0, 50);
    const beforeSpike = writes.at(-1).value;
    fader.inputMSB(0, 0, 127);
    assert.equal(writes.at(-1).value, beforeSpike);
    fader.inputMSB(0, 0, 49);
    assert.equal(writes.at(-1).value, (49 << 7) / 16383);
});

test('volume fader holds a brief upper-stop rebound but accepts a sustained pullback', () => {
    const { mapping, writes, timers } = loadMapping();
    const fader = mapping.makeVolumeFader(2);
    fader.inputMSB(0, 0, 50);
    fader.inputMSB(0, 0, 127); // candidate endpoint
    fader.inputMSB(0, 0, 127); // confirm endpoint
    assert.equal(writes.at(-1).value, 1);

    fader.inputMSB(0, 0, 126);
    fader.inputMSB(0, 0, 125);
    fader.inputMSB(0, 0, 122);
    fader.inputMSB(0, 0, 125); // quick rebound at the physical stop
    assert.equal(writes.at(-1).value, 1);
    assert.equal(timers.size, 0);

    fader.inputMSB(0, 0, 126);
    fader.inputMSB(0, 0, 123);
    const [timerId, callback] = timers.entries().next().value;
    callback(); // the lower value persisted for the confirmation interval
    timers.delete(timerId); // one-shot timers are removed after firing
    assert.equal(writes.at(-1).value, (123 << 7) / 16383);
    assert.equal(timers.has(timerId), false);
});

test('pitch faders use Mixxx native 14-bit Pot with soft takeover and no interpolation timer', () => {
    const { source } = loadMapping();
    const pitchPot = source.slice(source.indexOf('this.bpmSlider = new components.Pot'), source.indexOf('this.pitchLedHandler'));
    assert.match(pitchPot, /midi: \[0xB0 \+ channel, 0x01, 0xB0 \+ channel, 0x21\]/);
    assert.match(pitchPot, /inKey: "rate", group: theDeck\.group, invert: true/);
    assert.match(pitchPot, /components\.Pot\.prototype\.inSetParameter\.call\(this, value\)/);
    assert.doesNotMatch(source, /precisePitch14Bit|slewTimer/);
});

test('pitch fader keeps Mixxx native precision while the center LED tracks its neutral point', () => {
    const { mapping, source } = loadMapping();
    assert.match(source, /FULL: 0x7F, UP: 0x3C, DOWN: 0x3D/);
    assert.match(source, /midi\.sendShortMsg\(0xB0 \+ channel, 0x37, Math\.abs\(val\) <= 0\.0002 \? 0x7F : 0x00\)/);
    assert.doesNotMatch(source, /pitchSliderPositions/);
});

test('pitch arrows guide each playing deck toward the opposite deck BPM', () => {
    const { mapping, source } = loadMapping();
    const led = mapping.pitchTakeoverLED;
    assert.deepEqual(JSON.parse(JSON.stringify(mapping.pitchSyncArrowValues(119.8, 120))), { up: led.OFF, down: led.FULL });
    assert.deepEqual(JSON.parse(JSON.stringify(mapping.pitchSyncArrowValues(120.2, 120))), { up: led.FULL, down: led.OFF });
    assert.deepEqual(JSON.parse(JSON.stringify(mapping.pitchSyncArrowValues(120.01, 120))), { up: led.OFF, down: led.OFF });
    assert.match(source, /pitchSyncArrowValues\(deck\.deckBpm, deck\.otherBpm\)/);
    assert.match(source, /deckNum: left, deckBpm: bpm1, otherBpm: bpm2/);
    assert.match(source, /deckNum: right, deckBpm: bpm2, otherBpm: bpm1/);
    assert.match(source, /midi\.sendShortMsg\(0xB0 \+ deck\.deckNum, NumarkNS6\.pitchTakeoverLED\.UP, arrows\.up\)/);
    assert.match(source, /midi\.sendShortMsg\(0xB0 \+ deck\.deckNum, NumarkNS6\.pitchTakeoverLED\.DOWN, arrows\.down\)/);
});

test('NS6 BPM meter points toward the faster deck and farther for a larger mismatch', () => {
    const { mapping } = loadMapping();
    assert.equal(mapping.bpmMeterLedValue(133, 132, 0.08, 0.08), 5, 'left deck faster: meter moves left');
    assert.equal(mapping.bpmMeterLedValue(132, 133, 0.08, 0.08), 7, 'right deck faster: meter moves right');
    assert.equal(mapping.bpmMeterLedValue(120, 120, 0.08, 0.08), 6, 'matched BPMs: center LED');
    assert.ok(mapping.bpmMeterLedValue(125, 120, 0.08, 0.08) < mapping.bpmMeterLedValue(122, 120, 0.08, 0.08), 'larger left-deck lead moves farther left');
    assert.equal(mapping.bpmMeterLedValue(0, 120, 0.08, 0.08), 0, 'missing BPM turns meter off');
});

test('malformed NS6 Play Note Off rearms the next press', () => {
    const { mapping } = loadMapping();
    const deck = { deckNum: 2, playPressed: true };
    mapping.repairPlayRelease(deck, '[Channel2]', 0x7D, 0x7D);
    assert.equal(deck.playPressed, false);
});

test('Play release velocity is not mistaken for another press', () => {
    const { mapping, source } = loadMapping();
    const playHandler = source.slice(source.indexOf('this.playButton = new components.Button'), source.indexOf('this.cueButton = new components.Button'));
    assert.match(playHandler, /\(st & 0xF0\) === 0x80 \|\| val === 0/);
    assert.match(playHandler, /theDeck\.playPressed = false/);
    assert.match(playHandler, /NumarkNS6\.toggleDeckPlay\(deckNum, grp\)/);
});

test('rapid PLAY tap is accepted when the previous Note Off is delayed', () => {
    const { mapping } = loadMapping();
    const deck = { playPressed: false, lastPlayPressAt: 0 };
    assert.equal(mapping.acceptPlayPress(deck, 1000), true);
    assert.equal(mapping.acceptPlayPress(deck, 1040), false, 'filters a near-simultaneous duplicate');
    assert.equal(mapping.acceptPlayPress(deck, 1406), true, 'accepts a real rapid tap before delayed release');
});

test('malformed transport release is dispatched once and repairs every held transport state', () => {
    const { mapping } = loadMapping();
    const calls = [];
    mapping.repairPlayRelease = () => calls.push('play');
    mapping.repairMalformedJogRelease = () => calls.push('jog');
    const deck = {
        deckNum: 1,
        cuePressed: true,
        releaseCue(group, source) { calls.push(`cue:${group}:${source}`); },
    };

    mapping.repairMalformedTransportRelease(deck, '[Channel1]', 0x7D, 0x7D);

    assert.deepEqual(calls, ['cue:[Channel1]:repaired', 'play', 'jog']);
});

test('navigation button addresses agree with the XML and have no overwritten duplicates', () => {
    const { source } = loadMapping();
    const xml = fs.readFileSync(path.join(__dirname, '../Numark NS6.midi.xml'), 'utf8');
    assert.match(source, /this\.prepareButton = new components\.Button\(\s*\{\s*midi: \[0x90, 0x09\]/);
    assert.match(source, /this\.filesButton = new components\.Button\(\s*\{\s*midi: \[0x90, 0x0A\]/);
    assert.match(source, /this\.cratesButton = new components\.Button\(\s*\{\s*midi: \[0x90, 0x0B\]/);
    assert.match(source, /this\.autoDjAddButton = new components\.Button\(\s*\{\s*midi: \[0x90, 0x0D\]/);
    assert.equal((source.match(/this\.viewButton = new components\.Button/g) || []).length, 1);
    assert.equal((source.match(/this\.navigationEncoderButton = new components\.Button/g) || []).length, 1);
    assert.match(xml, /prepareButton\.input<\/key>\s*<status>0x90<\/status><midino>0x09<\/midino>/);
    assert.match(xml, /filesButton\.input<\/key>\s*<status>0x90<\/status><midino>0x0A<\/midino>/);
    assert.match(xml, /cratesButton\.input<\/key>\s*<status>0x90<\/status><midino>0x0B<\/midino>/);
});

test('each deck maps the malformed transport Note Off to one unified handler', () => {
    const xml = fs.readFileSync(path.join(__dirname, '../Numark NS6.midi.xml'), 'utf8');
    for (let deck = 1; deck <= 4; deck++) {
        const entries = [...xml.matchAll(new RegExp(`<key>NumarkNS6\\.Decks\\[${deck}\\]\\.(?:cueMalformedRelease|playMalformedRelease|transportMalformedRelease)<\\/key>`, 'g'))];
        assert.equal(entries.length, 1, `deck ${deck} should have exactly one malformed-release binding`);
        assert.match(entries[0][0], /transportMalformedRelease/);
    }
});

test('PREPARE toggles the Big Library skin state', () => {
    const { mapping, values, writes } = loadMapping();
    values['[Skin].show_maximized_library'] = 0;
    mapping.toggleBigLibrary();
    assert.equal(writes.at(-1).value, 1);
    values['[Skin].show_maximized_library'] = 1;
    mapping.toggleBigLibrary();
    assert.equal(writes.at(-1).value, 0);
});

test('VIEW toggles Mixxx between two-deck and four-deck layouts', () => {
    const { mapping, values, writes } = loadMapping();
    values['[Skin].show_4decks'] = 0;
    mapping.toggleDeckLayout();
    assert.deepEqual(writes.at(-1), { group: '[Skin]', key: 'show_4decks', value: 1 });
    values['[Skin].show_4decks'] = 1;
    mapping.toggleDeckLayout();
    assert.deepEqual(writes.at(-1), { group: '[Skin]', key: 'show_4decks', value: 0 });
});

test('PREPARE never writes the unverified CC 0x0D that lights the FILES button', () => {
    const { mapping, midiWrites, source } = loadMapping();
    assert.equal(typeof mapping.updatePrepareLED, 'undefined');
    assert.doesNotMatch(source, /makeConnection\("\[Skin\]", "show_maximized_library"/);
    assert.doesNotMatch(source, /sendShortMsg\(0xB0, 0x0D/);
    const autoDj = source.slice(source.indexOf('this.autoDjAddButton ='), source.indexOf('this.navigationEncoderTick ='));
    assert.doesNotMatch(autoDj, /sendShortMsg\(0xB0, 0x0D/);
    assert.equal(midiWrites.length, 0);
});

test('CRATES and FILES focus the matching library pane', () => {
    const { mapping, writes, values } = loadMapping();
    values['[Skin].show_maximized_library'] = 0;
    values['[Skin].show_samplers'] = 1;
    mapping.focusLibraryWidget(2);
    assert.deepEqual(writes, [{ group: '[Library]', key: 'focused_widget', value: 2 }]);
    assert.equal(values['[Skin].show_maximized_library'], 0, 'Crates must not enable Big Library');
    assert.equal(values['[Skin].show_samplers'], 1, 'Crates must preserve the current skin mode');
    writes.length = 0;
    values['[Skin].show_maximized_library'] = 1;
    mapping.focusLibraryWidget(1);
    assert.deepEqual(writes, [{ group: '[Library]', key: 'focused_widget', value: 1 }]);
    assert.equal(values['[Skin].show_maximized_library'], 1, 'Files must preserve the current skin mode');
});

test('navigation LEDs follow tree/search focus while PREPARE has its own LED', () => {
    const { mapping, values, midiWrites } = loadMapping();
    values['[Skin].show_maximized_library'] = 1;
    values['[Library].focused_widget'] = 2;
    mapping.updateNavLEDs();
    assert.deepEqual(midiWrites.slice(-4), [
        [0xB0, 0x01, 0x7F], [0xB0, 0x03, 0x7F],
        [0xB0, 0x04, 0x7F], [0xB0, 0x05, 0x00],
    ]);

    midiWrites.length = 0;
    values['[Library].focused_widget'] = 1;
    values['[Skin].show_maximized_library'] = 0;
    mapping.toggleBigLibrary();
    mapping.updateNavLEDs();
    assert.deepEqual(midiWrites.slice(-4), [
        [0xB0, 0x01, 0x7F], [0xB0, 0x03, 0x00],
        [0xB0, 0x04, 0x7F], [0xB0, 0x05, 0x7F],
    ]);

    mapping.focusLibraryWidget(2);
    mapping.updateNavLEDs();
    assert.deepEqual(midiWrites.slice(-4), [
        [0xB0, 0x01, 0x7F], [0xB0, 0x03, 0x7F],
        [0xB0, 0x04, 0x7F], [0xB0, 0x05, 0x00],
    ]);

    values['[Skin].show_maximized_library'] = 0;
    mapping.updateNavLEDs();
    assert.equal(midiWrites.at(-2)[2], 0x00, 'Prepare LED turns off only when Big Library is closed');
});

test('NS6 MASTER knob CC 67 controls the Mixxx Master volume', () => {
    const xml = fs.readFileSync(path.join(__dirname, '../Numark NS6.midi.xml'), 'utf8');
    const matches = [...xml.matchAll(/<control>\s*<group>\[Master\]<\/group>\s*<key>gain<\/key>\s*<status>0xB0<\/status>\s*<midino>0x43<\/midino>/g)];
    assert.equal(matches.length, 1, 'CC 67 should be mapped exactly once to [Master],gain');
});

test('NS6 headphone level knob CC 66 controls Mixxx headphone volume', () => {
    const xml = fs.readFileSync(path.join(__dirname, '../Numark NS6.midi.xml'), 'utf8');
    const matches = [...xml.matchAll(/<control>\s*<group>\[Master\]<\/group>\s*<key>headGain<\/key>\s*<status>0xB0<\/status>\s*<midino>0x42<\/midino>/g)];
    assert.equal(matches.length, 1, 'CC 66 should be mapped exactly once to [Master],headGain');
});

test('NS6 CUE/MIX knob maps its 14-bit CC 18/50 pair to Mixxx headphone mix', () => {
    const xml = fs.readFileSync(path.join(__dirname, '../Numark NS6.midi.xml'), 'utf8');
    const controls = [...xml.matchAll(/<control>([\s\S]*?)<\/control>/g)].map(match => match[1]);
    const msb = controls.filter(control => /<group>\[Master\]<\/group>/.test(control) && /<key>headMix<\/key>/.test(control) && /<status>0xB0<\/status>/.test(control) && /<midino>0x12<\/midino>/.test(control) && /<fourteen-bit-msb\s*\/>/.test(control));
    const lsb = controls.filter(control => /<group>\[Master\]<\/group>/.test(control) && /<key>headMix<\/key>/.test(control) && /<status>0xB0<\/status>/.test(control) && /<midino>0x32<\/midino>/.test(control) && /<fourteen-bit-lsb\s*\/>/.test(control));
    assert.equal(msb.length, 1, 'CC 18 should be the headMix MSB');
    assert.equal(lsb.length, 1, 'CC 50 should be the headMix LSB');
});

test('NS6 X-Fader slope knob CC 85 sets Mixxx curve from smooth to sharp', () => {
    const { mapping, writes, source } = loadMapping();
    const xml = fs.readFileSync(path.join(__dirname, '../Numark NS6.midi.xml'), 'utf8');
    mapping.setXfaderCurve(0, 0x55, 0);
    assert.deepEqual(writes.slice(-2), [
        { group: '[Mixer Profile]', key: 'xFaderMode', value: 1 },
        { group: '[Mixer Profile]', key: 'xFaderCurve', value: 0.6 },
    ]);
    mapping.setXfaderCurve(0, 0x55, 127);
    assert.deepEqual(writes.slice(-2), [
        { group: '[Mixer Profile]', key: 'xFaderMode', value: 1 },
        { group: '[Mixer Profile]', key: 'xFaderCurve', value: 1000 },
    ]);
    assert.match(xml, /<group>\[Mixer Profile\]<\/group>\s*<key>NumarkNS6\.setXfaderCurve<\/key>\s*<status>0xB0<\/status>\s*<midino>0x55<\/midino>/);
    assert.ok(mapping.xFaderCurveForMidiValue(64) > 0.6);
    assert.ok(mapping.xFaderCurveForMidiValue(64) < 1000);
    assert.equal(mapping.xFaderCurveForMidiValue(-5), 0.6);
    assert.equal(mapping.xFaderCurveForMidiValue(200), 1000);
});

test('crossfader position keeps working on its separate 14-bit CC 7/39 pair', () => {
    const { mapping, writes } = loadMapping();
    mapping.crossfaderMSB(0, 0x07, 64);
    mapping.crossfaderLSB(0, 0x27, 0);
    assert.equal(writes.at(-1).group, '[Master]');
    assert.equal(writes.at(-1).key, 'crossfader');
    assert.ok(Math.abs(writes.at(-1).value) < 0.001);

    const left = loadMapping();
    left.mapping.crossfaderMSB(0, 0x07, 0);
    left.mapping.crossfaderLSB(0, 0x27, 0);
    assert.equal(left.writes.at(-1).value, -1);

    const right = loadMapping();
    right.mapping.crossfaderMSB(0, 0x07, 127);
    right.mapping.crossfaderLSB(0, 0x27, 127);
    assert.equal(right.writes.at(-1).value, 1);
});
