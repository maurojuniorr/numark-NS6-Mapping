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
        components: { Button: function() {}, Encoder: function() {}, Component: function() {}, ComponentContainer: function() {}, Deck: function() {} },
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../Numark-NS6-scripts.js'), 'utf8'), context);
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

test('startup zero preamble does not mask the NS6 volume positions that follow', () => {
    const { context, values, fireTimers } = loadMapping();
    const ch1 = context.NumarkNS6.makeVolumeFader(1);
    const ch2 = context.NumarkNS6.makeVolumeFader(2);

    ch1.inputMSB(1, 8, 0);
    ch1.inputLSB(1, 40, 0);
    ch2.inputMSB(1, 13, 0);
    ch2.inputLSB(1, 45, 0);

    ch1.inputMSB(1, 8, 127);
    ch1.inputLSB(1, 40, 127);
    ch2.inputMSB(1, 13, 55);
    ch2.inputLSB(1, 45, 96);
    fireTimers();

    const lastValue = (channel) => values.filter((entry) => entry.group === `[Channel${channel}]`).at(-1).value;
    assert.equal(lastValue(1), 1);
    assert.equal(lastValue(2), ((55 << 7) | 96) / 16383);
});

test('a fader physically at minimum still initializes to zero', () => {
    const { context, values, fireTimers } = loadMapping();
    const ch1 = context.NumarkNS6.makeVolumeFader(1);

    ch1.inputMSB(1, 8, 0);
    ch1.inputLSB(1, 40, 0);
    fireTimers();

    assert.equal(values.at(-1).value, 0);
});

test('controller restart zero preamble does not leave an initialized fader at minimum', () => {
    const { context, values, fireTimers } = loadMapping();
    const ch1 = context.NumarkNS6.makeVolumeFader(1);
    ch1.inputMSB(1, 8, 127);
    ch1.inputLSB(1, 40, 127);
    fireTimers();

    ch1.inputMSB(1, 8, 0);
    ch1.inputLSB(1, 40, 0);
    ch1.inputMSB(1, 8, 127);
    ch1.inputLSB(1, 40, 127);
    fireTimers();

    assert.equal(values.filter((entry) => entry.group === '[Channel1]').at(-1).value, 1);
});
