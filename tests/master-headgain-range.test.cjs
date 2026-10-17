const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function loadMapping() {
    const parameters = [];
    const engine = {
        makeConnection() { return { trigger() {}, disconnect() {} }; },
        setValue() {},
        setParameter(group, key, value) { parameters.push({ group, key, value }); },
        getValue() { return 0; },
        getParameter() { return 0; },
        beginTimer() { return 1; },
        stopTimer() {},
        scratchDisable() {},
    };
    const context = {
        engine,
        midi: { sendShortMsg() {}, sendSysexMsg() {} },
        print() {},
        components: {
            Button: function() {}, Encoder: function() {}, Component: function() {},
            ComponentContainer: function() {}, Deck: function() {}, Pot: function() {},
        },
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../Numark-NS6-scripts.js'), 'utf8'), context);
    return { context, parameters };
}

test('master and headphone gain map MIDI endpoints and center to the full taper-pot range', () => {
    for (const [handler, cc, key] of [
        ['masterGain', 0x43, 'gain'],
        ['headGain', 0x42, 'headGain'],
    ]) {
        const { context, parameters } = loadMapping();
        for (const value of [0, 64, 127]) context.NumarkNS6[handler](0, cc, value);

        assert.deepEqual(parameters, [
            { group: '[Master]', key, value: 0 },
            { group: '[Master]', key, value: 0.5 },
            { group: '[Master]', key, value: 1 },
        ]);
    }
});

test('master and headphone gain inputs use their guarded script handlers', () => {
    const xml = fs.readFileSync(path.join(__dirname, '../Numark NS6.midi.xml'), 'utf8');
    assert.match(xml, /<key>NumarkNS6\.masterGain<\/key>[\s\S]*?<midino>0x43<\/midino>[\s\S]*?<script-binding\s*\/>/);
    assert.match(xml, /<key>NumarkNS6\.headGain<\/key>[\s\S]*?<midino>0x42<\/midino>[\s\S]*?<script-binding\s*\/>/);
});
