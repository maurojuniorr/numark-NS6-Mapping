const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

test('mapping startup replays the two NS6 initialization SysEx messages', () => {
    const shortMessages = [];
    const sysexMessages = [];
    let nextTimer = 1;
    const engine = {
        makeConnection() {
            return { trigger() {}, disconnect() {} };
        },
        setValue() {},
        getValue() { return 0; },
        beginTimer() { return nextTimer++; },
        stopTimer() {},
    };
    const context = {
        engine,
        midi: {
            sendShortMsg(...message) { shortMessages.push(message); },
            sendSysexMsg(message, length) { sysexMessages.push([Array.from(message), length]); },
        },
        print() {},
        components: { Button: function() {}, Encoder: function() {}, Component: function() {}, ComponentContainer: function() {}, Deck: function() {} },
    };
    vm.createContext(context);
    const scriptPath = process.env.NS6_SCRIPT || path.join(__dirname, '../Numark-NS6-scripts.js');
    vm.runInContext(fs.readFileSync(scriptPath, 'utf8'), context);

    context.NumarkNS6.Deck = function(channel) { this.midiChannel = channel; };
    context.NumarkNS6.MixerTemplate = function() {};
    context.NumarkNS6.FX.RoutingTable = [];
    context.NumarkNS6.FX.init = function() {};
    context.NumarkNS6.FX.initRouting = function() {};
    context.NumarkNS6.bootAnimation = function() {};
    context.NumarkNS6.init();

    assert.deepEqual(sysexMessages, [
        [[0xF0, 0x00, 0x01, 0x3F, 0x7F, 0x79, 0x50, 0x00, 0x10, 0x04, 0x01, 0x00, 0x00, 0x00, 0x04, 0x04, 0x0E, 0x0F, 0x00, 0x00, 0x0E, 0x05, 0x0F, 0x04, 0x0C, 0x06, 0x0B, 0x0F, 0x0D, 0x0C, 0xF7], 31],
        [[0xF0, 0x00, 0x01, 0x3F, 0x7F, 0x79, 0x60, 0x00, 0x01, 0x49, 0x01, 0x00, 0x00, 0x00, 0x00, 0xF7], 16],
    ]);
    assert.equal(shortMessages.length >= 4, true);
});
