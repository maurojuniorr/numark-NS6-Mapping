const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

test('X-FADER updates curve and calibration without forcing a mode', () => {
    const writes = [];
    const context = {
        engine: { setValue: (group, key, value) => writes.push({ group, key, value }), makeConnection: () => ({ trigger() {}, disconnect() {} }) },
        midi: {}, print() {},
        components: { Button: function() {}, Encoder: function() {}, Component: function() {},
            ComponentContainer: function() {}, Deck: function() {}, Pot: function() {} },
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('Numark-NS6-scripts.js', 'utf8'), context);
    for (const value of [0, 64, 127]) context.NumarkNS6.applyXfaderCurve(value);
    assert.equal(writes.length, 6);
    assert.ok(writes.every(({ key }) => key !== 'xFaderMode'));
    for (let i = 0; i < writes.length; i += 2) {
        assert.equal(writes[i].key, 'xFaderCurve');
        assert.equal(writes[i + 1].key, 'xFaderCalibration');
        assert.equal(writes[i + 1].value, Math.pow(0.5, 1 / writes[i].value));
    }
    assert.ok(writes[0].value < writes[2].value && writes[2].value < writes[4].value);
});
