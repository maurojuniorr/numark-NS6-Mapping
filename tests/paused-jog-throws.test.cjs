const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function setup() {
    const timers = new Map();
    const timerDelays = new Map();
    const scratching = new Set();
    const ticks = [];
    const disableCalls = [];
    const playWrites = [];
    const jogWrites = [];
    let nextTimer = 1;
    let scratchRate = 0;
    let playing = 0;

    const engine = {
        makeConnection() { return { disconnect() {}, trigger() {} }; },
        beginTimer(ms, callback) { const id = nextTimer++; timers.set(id, callback); timerDelays.set(id, ms); return id; },
        stopTimer(id) { timers.delete(id); },
        isScratching: deck => scratching.has(deck),
        scratchEnable(deck) { scratching.add(deck); },
        scratchDisable(deck, ramp) { disableCalls.push([deck, ramp]); scratching.delete(deck); },
        scratchTick(deck, delta) { ticks.push([deck, delta]); },
        getValue(_group, key) { return key === 'scratch2' ? scratchRate : (key === 'play' ? playing : 0); },
        setValue(group, key, value) {
            if (key === 'play') playWrites.push(value);
            if (key === 'jog') jogWrites.push([group, value]);
        },
    };
    const context = {
        engine,
        Date: { now: () => 1000 },
        midi: { sendShortMsg() {}, sendSysexMsg() {} },
        print() {},
        components: { Encoder: function() {}, Component: function() {}, ComponentContainer: function() {}, Deck: function() {} },
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../Numark-NS6.scripts.js'), 'utf8'), context);

    const mapping = context.NumarkNS6;
    mapping.Decks[1] = { scratchMode: true };
    function move(value) {
        mapping.jogMove14bit(1, 0, value >> 7, 0, '[Channel1]');
        mapping.jogMove14bit(1, 32, value & 127, 0, '[Channel1]');
    }
    return { mapping, timers, timerDelays, scratching, ticks, disableCalls, playWrites, jogWrites, move, setScratchRate(value) { scratchRate = value; }, setPlaying(value) { playing = value; } };
}

test('playing backspin follows the reverse platter tail before handoff', () => {
    const s = setup();
    s.setPlaying(1);
    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    s.move(1000); // establish encoder position
    s.move(990); // backward scratch movement
    s.setScratchRate(-3);
    s.mapping.jogTouch14bit(1, 0, 0, 0, '[Channel1]');

    assert.deepEqual(s.disableCalls, []);
    assert.equal(s.mapping.Decks[1].scratchReleasePending, true);
    assert.equal(s.scratching.has(1), true);
    assert.deepEqual(s.playWrites, []);
    s.move(980); // continue applying the reverse platter tail as scratch
    assert.deepEqual(s.ticks, [[1, -5], [1, -5]]);

    const handoffTimer = s.mapping.Decks[1].scratchReleaseTimer;
    assert.equal(s.timerDelays.get(handoffTimer), s.mapping.spinCandidateQuietMs);
    s.timers.get(handoffTimer)();
    assert.deepEqual(s.disableCalls, [[1, false]]);
    assert.equal(s.scratching.has(1), false);
});

test('paused reverse throw follows real platter tail and stops without starting playback', () => {
    const s = setup();
    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    s.move(1000); // establish encoder position
    s.move(990); // real reverse scratch movement while paused
    s.setScratchRate(-3);
    s.mapping.jogTouch14bit(1, 0, 0, 0, '[Channel1]');

    assert.equal(s.mapping.Decks[1].scratchReleasePending, true);
    assert.equal(s.scratching.has(1), true);
    s.move(980); // continue following the real platter after touch-off
    assert.deepEqual(s.ticks, [[1, -5], [1, -5]]);

    const handoffTimer = s.mapping.Decks[1].scratchReleaseTimer;
    s.timers.get(handoffTimer)();
    assert.deepEqual(s.disableCalls, [[1, false]]);
    assert.deepEqual(s.playWrites, []);
    assert.equal(s.scratching.has(1), false);
});

test('paused forward throw follows real platter tail and stops without starting playback', () => {
    const s = setup();
    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    s.move(1000); // establish encoder position
    s.move(1010); // real forward scratch movement while paused
    s.setScratchRate(3);
    s.mapping.jogTouch14bit(1, 0, 0, 0, '[Channel1]');

    assert.equal(s.mapping.Decks[1].scratchReleasePending, true);
    assert.equal(s.scratching.has(1), true);
    s.move(1020); // continue following the real platter after touch-off
    assert.deepEqual(s.ticks, [[1, 5], [1, 5]]);

    const handoffTimer = s.mapping.Decks[1].scratchReleaseTimer;
    s.timers.get(handoffTimer)();
    assert.deepEqual(s.disableCalls, [[1, false]]);
    assert.deepEqual(s.playWrites, []);
    assert.equal(s.scratching.has(1), false);
});
