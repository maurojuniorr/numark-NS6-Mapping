const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function loadMapping() {
    const values = [];
    const timers = new Map();
    let nextTimer = 1;
    const engine = {
        makeConnection() { return { trigger() {}, disconnect() {} }; },
        setValue(group, key, value) { values.push({ group, key, value }); },
        getValue() { return 0; },
        getParameter() { return 0; },
        setParameter(group, key, value) { values.push({ group, key, value, parameter: true }); },
        scratchDisable() {},
        beginTimer(_interval, callback) {
            const id = nextTimer++;
            timers.set(id, callback);
            return id;
        },
        stopTimer(id) { timers.delete(id); },
    };
    const context = {
        engine,
        midi: { sendShortMsg() {}, sendSysexMsg() {} },
        print() {},
        components: { Button: function() {}, Encoder: function() {}, Component: function() {}, ComponentContainer: function() {}, Deck: function() {}, Pot: function() {} },
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../Numark-NS6.scripts.js'), 'utf8'), context);
    return {
        context,
        values,
        fireTimers() {
            const callbacks = Array.from(timers.values());
            timers.clear();
            callbacks.forEach((callback) => callback());
        },
    };
}

test('pitch slider ignores reset zeros and applies the restored 14-bit position', () => {
    const { context, fireTimers } = loadMapping();
    const events = [];
    const pot = {
        inputMSB(ch, cc, value) { events.push(['msb', ch, cc, value]); },
        inputLSB(ch, cc, value) { events.push(['lsb', ch, cc, value]); },
    };
    context.NumarkNS6.protectPotStartupState(pot);

    pot.inputMSB(2, 1, 0, 0xB2);
    pot.inputLSB(2, 33, 0, 0xB2);
    pot.inputMSB(2, 1, 64, 0xB2);
    pot.inputLSB(2, 33, 0, 0xB2);
    fireTimers();

    assert.deepEqual(events, [['msb', 2, 1, 64], ['lsb', 2, 33, 0]]);
});

test('headphone mix reaches the restored position', () => {
    const { context, values, fireTimers } = loadMapping();

    context.NumarkNS6.headMixMSB(0, 0x12, 0);
    context.NumarkNS6.headMixLSB(0, 0x32, 0);
    context.NumarkNS6.headMixMSB(0, 0x12, 127);
    context.NumarkNS6.headMixLSB(0, 0x32, 127);
    fireTimers();

    const positions = values.filter((entry) => entry.key === 'headMix').map((entry) => entry.value);
    assert.equal(positions[positions.length - 1], 1);
});

test('mapping routes headphone mix MIDI through the startup-safe handlers', () => {
    const xml = fs.readFileSync(path.join(__dirname, '../Numark NS6.midi.xml'), 'utf8');
    assert.match(xml, /<key>NumarkNS6\.headMixMSB<\/key>[\s\S]*?<midino>0x12<\/midino>[\s\S]*?<script-binding\s*\/>/);
    assert.match(xml, /<key>NumarkNS6\.headMixLSB<\/key>[\s\S]*?<midino>0x32<\/midino>[\s\S]*?<script-binding\s*\/>/);
});

test('a multi-control zero burst is deferred while later nonzero positions win', () => {
    const { context, values, fireTimers } = loadMapping();
    const guard = context.NumarkNS6.reconnectBurst;
    guard.handle('baseline', 65, () => values.push({ key: 'baseline', value: 65 }));
    values.length = 0;

    for (let control = 0; control < 8; control++) {
        guard.handle(`cc${control}`, 0, () => values.push({ key: `cc${control}`, value: 0 }));
    }
    assert.equal(values.length, 0);
    assert.equal(guard.isActive(), true);

    guard.handle('cc0', 64, () => values.push({ key: 'cc0', value: 64 }));
    guard.handle('masterGain', 0, () => values.push({ key: 'masterGain', value: 0 }));
    assert.deepEqual(values, [{ key: 'cc0', value: 64 }]);

    fireTimers();
    assert.equal(guard.isActive(), false);
    assert.deepEqual(values[0], { key: 'cc0', value: 64 });
    assert.equal(values.filter((entry) => entry.key === 'cc0').length, 1);
    assert.deepEqual(values.slice(1), [
        ...Array.from({ length: 7 }, (_, i) => ({ key: `cc${i + 1}`, value: 0 })),
        { key: 'masterGain', value: 0 },
    ]);
    guard.handle('masterGain', 0, () => values.push({ key: 'masterGain', value: 0 }));
    fireTimers();
    assert.equal(values.filter((entry) => entry.key === 'masterGain').length, 1);
});

test('initial all-zero controls remain valid before a position has been observed', () => {
    const { context, values, fireTimers } = loadMapping();
    const guard = context.NumarkNS6.reconnectBurst;
    for (let control = 0; control < 8; control++) {
        guard.handle(`cc${control}`, 0, () => values.push(control));
    }
    assert.equal(guard.isActive(), false);
    fireTimers();
    assert.deepEqual(values, [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('master gain, headphone gain and crossfader curve ignore reconnect resets', () => {
    const { context, values } = loadMapping();
    const mapping = context.NumarkNS6;
    mapping.masterGain(0, 0x43, 65);
    mapping.headGain(0, 0x42, 32);
    mapping.storedCrossfaderParams = {};
    mapping.setXfaderCurve(0, 0x55, 65);
    values.length = 0;

    for (let control = 0; control < 8; control++) {
        mapping.guardAnalogInput(`reset:${control}`, 0, () => {});
    }
    mapping.masterGain(0, 0x43, 0);
    mapping.headGain(0, 0x42, 0);
    mapping.setXfaderCurve(0, 0x55, 0);
    assert.deepEqual(values, []);

    mapping.masterGain(0, 0x43, 65);
    mapping.headGain(0, 0x42, 32);
    mapping.setXfaderCurve(0, 0x55, 65);
    assert.deepEqual(values.filter((entry) => entry.value === 0), []);
    assert.equal(values.find((entry) => entry.key === 'gain').value, 64 / 126);
    assert.equal(values.find((entry) => entry.key === 'headGain').value, 32 / 128);
});

test('master and headphone gain MIDI uses the guarded script handlers', () => {
    const xml = fs.readFileSync(path.join(__dirname, '../Numark NS6.midi.xml'), 'utf8');
    assert.match(xml, /<key>NumarkNS6\.masterGain<\/key>[\s\S]*?<midino>0x43<\/midino>[\s\S]*?<script-binding\s*\/>/);
    assert.match(xml, /<key>NumarkNS6\.headGain<\/key>[\s\S]*?<midino>0x42<\/midino>[\s\S]*?<script-binding\s*\/>/);
});

test('master and headphone knobs use the full Mixxx taper-pot position range', () => {
    for (const [handler, cc, key] of [
        ['masterGain', 0x43, 'gain'],
        ['headGain', 0x42, 'headGain'],
    ]) {
        const { context, values } = loadMapping();
        context.NumarkNS6[handler](0, cc, 0);
        context.NumarkNS6[handler](0, cc, 64);
        context.NumarkNS6[handler](0, cc, 127);

        assert.deepEqual(values.map(({ group, key: actualKey, value, parameter }) => ({
            group,
            key: actualKey,
            value,
            parameter,
        })), [
            { group: '[Master]', key, value: 0, parameter: true },
            { group: '[Master]', key, value: 0.5, parameter: true },
            { group: '[Master]', key, value: 1, parameter: true },
        ]);
    }
});
