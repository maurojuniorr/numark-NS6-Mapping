const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function setup(startFactor = 0) {
    const timers = new Map(), scratching = new Set(), ticks = [], nudges = [], disableCalls = [], enableCalls = [];
    const softStarts = [], playWrites = [];
    let nextTimer = 1, playing = 0, scratchRate = 0, dropPlayOnScratchDisable = false, now = 0;
    const engine = {
        makeConnection() { return { disconnect() {}, trigger() {} }; },
        beginTimer(ms, callback) { const id = nextTimer++; timers.set(id, callback); return id; },
        stopTimer(id) { timers.delete(id); },
        isScratching: deck => scratching.has(deck),
        scratchEnable: deck => { enableCalls.push(deck); scratching.add(deck); },
        scratchDisable: (deck, ramp) => { disableCalls.push([deck, ramp]); scratching.delete(deck); if (dropPlayOnScratchDisable) playing = 0; },
        scratchTick: (deck, delta) => ticks.push([deck, delta]),
        softStart: (deck, active, factor) => softStarts.push([deck, active, factor]),
        getSetting: () => startFactor,
        getValue: (group, key) => key === 'scratch2' ? scratchRate : playing,
        setValue: (group, key, value) => { if (key === 'play') { playing = value; playWrites.push(value); } else nudges.push([key, value]); },
    };
    const logs = [];
    const context = { engine, Date: { now: () => now }, midi: { sendShortMsg() {}, sendSysexMsg() {} }, print: (...args) => logs.push(args.join(' ')),
        components: { Encoder: function() {}, Component: function() {}, ComponentContainer: function() {}, Deck: function() {} } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../Numark-NS6-scripts.js'), 'utf8'), context);
    const mapping = context.NumarkNS6;
    for (let i = 1; i <= 4; i++) mapping.Decks[i] = { scratchMode: true };
    function move(value, deck = 1) {
        mapping.jogMove14bit(deck, 0, value >> 7, 0, `[Channel${deck}]`);
        mapping.jogMove14bit(deck, 32, value & 127, 0, `[Channel${deck}]`);
    }
    return { mapping, timers, scratching, ticks, nudges, disableCalls, enableCalls, softStarts, playWrites, logs, move, play() { playing = 1; }, pause() { playing = 0; }, setScratchRate(value) { scratchRate = value; }, advance(ms) { now += ms; }, dropPlayOnScratchDisable() { dropPlayOnScratchDisable = true; } };
}

test('Start Time setting keeps instant default and enables the configured soft start', () => {
    const instant = setup();
    instant.mapping.toggleDeckPlay(1, '[Channel1]');
    assert.deepEqual(instant.softStarts, []);

    const configured = setup(0.75);
    configured.mapping.toggleDeckPlay(1, '[Channel1]');
    assert.deepEqual(configured.softStarts, [[1, true, 0.75]]);
});

test('Cue clears cached Play intent so the first Play press starts the deck', () => {
    const s = setup();
    s.play();
    const deck = s.mapping.Decks[1];
    deck.transportWantsPlay = true;
    deck.scratchResumeIntent = true;
    deck.wasPlayingBeforeScratch = true;
    s.mapping.resetTransportIntentForCue(deck);
    s.pause(); // Mixxx has returned to cue and stopped playback.
    s.mapping.syncTransportIntentAfterCue(deck, '[Channel1]');
    assert.equal(deck.transportWantsPlay, false);
    s.mapping.toggleDeckPlay(1, '[Channel1]');
    assert.deepEqual(s.playWrites, [1]);
    assert.equal(deck.transportWantsPlay, true);
    const syncTimer = deck.cueIntentSyncTimer;
    s.advance(120);
    s.timers.get(syncTimer)();
    assert.equal(deck.transportWantsPlay, true);
});

test('loading a new track resynchronizes cached Play intent before the next button press', () => {
    const s = setup();
    s.play();
    const deck = s.mapping.Decks[1];
    deck.transportWantsPlay = true;
    deck.scratchResumeIntent = true;
    deck.wasPlayingBeforeScratch = true;

    s.pause(); // Mixxx stopped the previous track as the new one loaded.
    s.mapping.syncTransportIntentAfterTrackLoad(deck, '[Channel1]');

    assert.equal(deck.transportWantsPlay, false);
    assert.equal(deck.scratchResumeIntent, false);
    assert.equal(deck.wasPlayingBeforeScratch, false);
    s.mapping.toggleDeckPlay(1, '[Channel1]');
    assert.deepEqual(s.playWrites, [1], 'the first press should start the loaded track');
});

test('each deck has one track_loaded callback that synchronizes transport intent', () => {
    const source = fs.readFileSync(require('node:path').join(__dirname, '../Numark-NS6-scripts.js'), 'utf8');
    const start = source.indexOf('engine.makeConnection(this.group, "track_loaded"');
    const end = source.indexOf('this.pitchBendMinus =', start);
    const callback = source.slice(start, end);
    assert.equal((source.match(/syncTransportIntentAfterTrackLoad\(/g) || []).length, 1,
        'the deck callback should be the sole caller');
    assert.match(callback, /syncTransportIntentAfterTrackLoad\(theDeck, this\.group\)/);
});

test('paused scrub renews its timeout on every movement and stops after inactivity', () => {
    const s = setup();
    s.move(100); s.move(110);
    const first = s.mapping.Decks[1].scrubTimer;
    s.move(120);
    assert.equal(s.timers.has(first), false);
    assert.equal(s.timers.size, 1);
    assert.deepEqual(s.ticks, [[1, 10], [1, 10]]);
    s.timers.get(s.mapping.Decks[1].scrubTimer)();
    assert.equal(s.scratching.has(1), false);
    assert.equal(s.mapping.Decks[1].isAutoScrubbing, false);
});

test('touch takes ownership from paused scrub and does not resume playback on release', () => {
    const s = setup();
    s.move(100); s.move(110);
    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    assert.equal(s.timers.size, 0);
    assert.equal(s.mapping.Decks[1].isAutoScrubbing, false);
    s.move(120);
    assert.equal(s.scratching.has(1), true);
    assert.equal(s.timers.size, 0);
    s.mapping.jogTouch14bit(1, 0, 0, 0, '[Channel1]');
    assert.equal(s.scratching.has(1), false);
    assert.equal(s.mapping.Decks[1].scratchReleasePending, false);
    assert.deepEqual(s.playWrites, []);
    const releaseTimer = s.mapping.Decks[1].scratchReleaseTimer;
    s.move(130);
    assert.equal(s.ticks.length, 2);
    assert.equal(s.timers.size, 1);
    s.timers.get(releaseTimer)();
    assert.equal(s.mapping.Decks[1].ignoreJogTail, false);
    assert.equal(s.scratching.has(1), false);
});

test('repeated positive touch keeps scratch active without a playback resync', () => {
    const s = setup();
    s.play();
    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    // Reproduz o Note On repetido observado no monitor: velocity 0x7D.
    s.mapping.jogTouch14bit(1, 0, 0x7D, 0, '[Channel1]');
    assert.deepEqual(s.enableCalls, [1]);
    assert.deepEqual(s.disableCalls, []);
    assert.equal(s.mapping.Decks[1].jogTouched, true);
    assert.equal(s.scratching.has(1), true);
    assert.equal(s.timers.size, 0); // no watchdog until the platter actually moves

    s.mapping.jogTouch14bit(1, 0, 0, 0, '[Channel1]');
    assert.deepEqual(s.disableCalls, [[1, false]]);
    assert.equal(s.mapping.Decks[1].jogTouched, false);
    assert.equal(s.scratching.has(1), false);
});

test('temporary MIDI diagnostics count jog packets and processed position samples', () => {
    const s = setup();
    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    s.move(100); s.move(110);
    const diag = s.mapping.jogMidiDiag[1];
    assert.equal(diag.msbPackets, 2);
    assert.equal(diag.lsbPackets, 2);
    assert.equal(diag.processedSamples, 2);
    assert.equal(diag.movingSamples, 1);
    assert.equal(diag.zeroSamples, 0);
    assert.equal(diag.maxAbsDelta, 10);
    assert.equal(diag.minDelta, 10);
    assert.equal(diag.maxDelta, 10);
    assert.equal(diag.scratchTickCalls, 1);
    assert.equal(diag.scratchTickAbsSum, 10);
    s.mapping.jogTouch14bit(1, 0, 0, 0, '[Channel1]');
    assert.equal(s.mapping.jogMidiDiag[1], null);
});

test('jog diagnostics preserve forward and backward direction separately', () => {
    const s = setup();
    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    s.move(100); s.move(110); s.move(105);
    const diag = s.mapping.jogMidiDiag[1];
    assert.equal(diag.forwardSamples, 1);
    assert.equal(diag.forwardDelta, 10);
    assert.equal(diag.backwardSamples, 1);
    assert.equal(diag.backwardDelta, 5);
    assert.equal(diag.minDelta, -5);
    assert.equal(diag.maxDelta, 10);
    assert.equal(diag.maxAbsDelta, 10);
    assert.equal(diag.scratchTickCalls, 2);
    assert.equal(diag.scratchTickAbsSum, 15);
});

test('large jog deltas emit a bounded raw MIDI trace around the reconstructed position', () => {
    const s = setup();
    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    s.move(100);
    s.move(300); // Outlier; the trace should retain nearby MSB/LSB and delta values.
    s.move(310); s.move(320); s.move(330);
    const trace = s.logs.find(line => line.includes('NS6 jog raw delta trace deck=1'));
    assert.ok(trace);
    assert.match(trace, /MSB=/);
    assert.match(trace, /LSB=.* d=200/);
    assert.match(trace, /pos=/);
    assert.ok(trace.length < 2000);
});

test('CC 7D 7D during jog movement is not mistaken for touch release', () => {
    const s = setup();
    s.play();
    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    s.move(100); s.move(110);
    // The raw Bn 7D 7D message is intentionally left unmapped; it appears
    // interleaved with jog CC traffic and is not a reliable release edge.
    assert.equal(typeof s.mapping.jogMalformedRelease, 'undefined');
    assert.deepEqual(s.disableCalls, []);
    assert.equal(s.mapping.Decks[1].jogTouched, true);
    assert.equal(s.scratching.has(1), true);
    s.mapping.jogTouch14bit(1, 0, 0, 0, '[Channel1]');
    assert.deepEqual(s.disableCalls, [[1, false]]);
});

test('malformed Note Off 8n 7D 7D repairs a missing jog release after movement', () => {
    const s = setup();
    s.play();
    const deck = s.mapping.Decks[1];
    Object.assign(deck, { deckNum: 1, jogTouched: true, wasPlayingBeforeScratch: true,
        scratchResumeIntent: true, transportWantsPlay: true });
    s.mapping.jogMidiDiag[1] = { movingSamples: 2, startedAt: 0 };
    s.scratching.add(1);

    assert.equal(s.mapping.repairMalformedJogRelease(deck, 0x7D, 0x7D, '[Channel1]'), true);
    assert.equal(deck.jogTouched, false);
    assert.equal(s.scratching.has(1), false);
    assert.deepEqual(s.disableCalls, [[1, false]]);
});

test('malformed Note Off releases a touched jog even before its first movement sample', () => {
    const s = setup();
    const deck = s.mapping.Decks[1];
    Object.assign(deck, { deckNum: 1, jogTouched: true });
    s.mapping.jogMidiDiag[1] = { movingSamples: 0, startedAt: 0 };
    s.scratching.add(1);

    assert.equal(s.mapping.repairMalformedJogRelease(deck, 0x7D, 0x00, '[Channel1]'), true);
    assert.equal(deck.jogTouched, false);
    assert.equal(s.scratching.has(1), false);
    assert.deepEqual(s.disableCalls, [[1, false]]);
});

test('forced Play recovery releases an orphaned scratch without toggling transport itself', () => {
    const s = setup();
    s.play();
    const deck = s.mapping.Decks[1];
    deck.jogTouched = true;
    deck.scratchReleasePending = true;
    deck.wasPlayingBeforeScratch = true;
    s.scratching.add(1);
    s.mapping.forceJogRelease(1, deck, '[Channel1]', 'test');
    assert.deepEqual(s.disableCalls, [[1, false]]);
    assert.equal(deck.jogTouched, false);
    assert.equal(deck.scratchReleasePending, false);
    assert.equal(deck.ignoreJogTail, true);
    assert.deepEqual(s.playWrites, []);
});

test('normal scratch release targets playback rate without issuing a Play command', () => {
    const s = setup();
    s.play();
    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    s.move(100); s.move(110);
    s.mapping.jogTouch14bit(1, 0, 0, 0, '[Channel1]');
    assert.equal(s.scratching.has(1), false);
    assert.deepEqual(s.disableCalls, [[1, false]]);
    assert.deepEqual(s.playWrites, []);
    assert.equal(s.mapping.Decks[1].scratchReleasePending, false);
});

test('scratch started while paused remains paused after the jog is released', () => {
    const s = setup();
    const deck = s.mapping.Decks[1];
    // Simula estado residual no mapping: o Mixxx UI/engine atual informa pausa.
    deck.transportWantsPlay = true;
    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    assert.equal(deck.wasPlayingBeforeScratch, false);
    assert.equal(deck.transportWantsPlay, false);
    s.move(100); s.move(110);
    s.mapping.jogTouch14bit(1, 0, 0, 0, '[Channel1]');
    assert.deepEqual(s.disableCalls, [[1, false]]);
    assert.equal(s.scratching.has(1), false);
    assert.deepEqual(s.playWrites, []);
    assert.equal(Boolean(deck.playbackGuardTimer), false);
});

test('normal scratch release restores playback only if Mixxx loses the already-playing state', () => {
    const s = setup();
    s.play();
    s.dropPlayOnScratchDisable();
    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    s.move(100); s.move(110);
    s.mapping.jogTouch14bit(1, 0, 0, 0, '[Channel1]');
    assert.deepEqual(s.playWrites, []);
    const recoveryTimer = s.mapping.Decks[1].playbackGuardTimer;
    assert.equal(s.timers.has(recoveryTimer), true);
    s.timers.get(recoveryTimer)();
    assert.deepEqual(s.playWrites, [1]);
});

test('holding the jog stationary does not trigger a timed auto-release', () => {
    const s = setup();
    s.play();
    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    s.move(100); s.move(110);
    const deck = s.mapping.Decks[1];
    s.advance(1000); // touch still held; silence alone is not a release
    assert.equal(deck.jogTouched, true);
    assert.equal(s.scratching.has(1), true);
    assert.deepEqual(s.disableCalls, []);

    s.mapping.forceJogRelease(1, deck, '[Channel1]', 'Play press recovery');
    assert.equal(deck.jogTouched, false);
    assert.equal(s.scratching.has(1), false);
    assert.deepEqual(s.disableCalls, [[1, false]]);
});

test('rapid scratch re-grab preserves the pending resume intent when Mixxx briefly reports Play off', () => {
    const s = setup();
    s.play();
    s.dropPlayOnScratchDisable();
    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    s.move(100); s.move(110);
    s.mapping.jogTouch14bit(1, 0, 0, 0, '[Channel1]');
    assert.equal(s.mapping.Decks[1].playbackGuardTimer !== 0, true);
    assert.equal(s.mapping.Decks[1].scratchResumeIntent, true);

    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    assert.equal(s.mapping.Decks[1].wasPlayingBeforeScratch, true);
    s.move(120); s.move(130);
    s.mapping.jogTouch14bit(1, 0, 0, 0, '[Channel1]');
    const recoveryTimer = s.mapping.Decks[1].playbackGuardTimer;
    s.timers.get(recoveryTimer)();
    assert.deepEqual(s.playWrites, [1]);
    assert.equal(s.mapping.Decks[1].scratchResumeIntent, false);
});

test('a deck that was playing resumes after scratch; only an explicit Play/Pause press clears that intent', () => {
    const s = setup();
    s.play();
    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    assert.equal(s.mapping.Decks[1].transportWantsPlay, true);
    s.move(100); s.move(110);
    s.mapping.jogTouch14bit(1, 0, 0, 0, '[Channel1]');
    let recoveryTimer = s.mapping.Decks[1].playbackGuardTimer;
    s.timers.get(recoveryTimer)();
    assert.equal(s.mapping.Decks[1].transportWantsPlay, true);

    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    s.mapping.forceJogRelease(1, s.mapping.Decks[1], '[Channel1]', 'explicit Play/Pause press');
    s.mapping.toggleDeckPlay(1, '[Channel1]');
    assert.equal(s.mapping.Decks[1].transportWantsPlay, false);
    assert.equal(s.playWrites.at(-1), 0);
});

test('fast reverse throw follows real platter inertia until quiet, then hands off once', () => {
    const s = setup();
    s.play();
    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    s.move(100); s.advance(40); s.setScratchRate(-1.2); s.move(110);
    s.advance(40); s.setScratchRate(-2.4); s.move(120);
    s.mapping.jogTouch14bit(1, 0, 0, 0, '[Channel1]');
    assert.equal(s.scratching.has(1), true);
    const firstTimer = s.mapping.Decks[1].scratchReleaseTimer;
    s.advance(40); s.setScratchRate(-1.8); s.move(110);
    assert.equal(s.timers.has(firstTimer), false);
    s.advance(40); s.setScratchRate(-1.0); s.move(100);
    s.advance(40); s.setScratchRate(-0.4); s.move(90);
    s.advance(40); s.setScratchRate(-0.2); s.move(80);
    assert.equal(s.mapping.Decks[1].backspinConfirmed, true);
    assert.deepEqual(s.ticks, [[1, 10], [1, 10], [1, -10], [1, -10], [1, -10], [1, -10]]);
    const quietTimer = s.mapping.Decks[1].scratchReleaseTimer;
    assert.equal(s.timers.has(quietTimer), true);
    s.timers.get(quietTimer)();
    assert.deepEqual(s.disableCalls, [[1, false]]);
    assert.deepEqual(s.playWrites, []);
    assert.equal(s.scratching.has(1), false);
    assert.equal(s.mapping.Decks[1].scratchReleasePending, false);
    assert.equal(s.mapping.Decks[1].wasPlayingBeforeScratch, false);
});

test('a long backward pull without reverse coast after release hands off normally', () => {
    const s = setup();
    s.play();
    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    s.move(100);
    s.advance(40); s.setScratchRate(-4); s.move(60);
    s.advance(40); s.setScratchRate(-8); s.move(20);
    s.mapping.jogTouch14bit(1, 0, 0, 0, '[Channel1]');
    assert.equal(s.mapping.Decks[1].backspinCandidate, true);
    assert.equal(s.mapping.Decks[1].backspinConfirmed, false);
    s.advance(35);
    s.timers.get(s.mapping.Decks[1].scratchReleaseTimer)();
    assert.deepEqual(s.disableCalls, [[1, false]]);
    assert.equal(s.mapping.Decks[1].backspinConfirmed, false);
    assert.equal(s.mapping.Decks[1].scratchReleasePending, false);
});

test('forward platter coast cancels a backward backspin candidate', () => {
    const s = setup();
    s.play();
    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    s.move(100);
    s.advance(40); s.setScratchRate(-4); s.move(90);
    s.advance(40); s.setScratchRate(-8); s.move(80);
    s.mapping.jogTouch14bit(1, 0, 0, 0, '[Channel1]');
    s.advance(5); s.move(90);
    assert.equal(s.mapping.Decks[1].backspinCandidate, false);
    assert.equal(s.mapping.Decks[1].backspinConfirmed, false);
    assert.equal(s.mapping.Decks[1].scratchReleasePending, true);
    s.advance(60);
    s.timers.get(s.mapping.Decks[1].scratchReleaseTimer)();
    assert.deepEqual(s.disableCalls, [[1, false]]);
});

test('gentle reverse scratch releases immediately instead of being classified as backspin', () => {
    const s = setup();
    s.play();
    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    s.move(100);
    s.advance(60); s.setScratchRate(-0.8); s.move(110);
    s.advance(40); s.setScratchRate(-1.4); s.move(120);
    s.mapping.jogTouch14bit(1, 0, 0, 0, '[Channel1]');
    assert.equal(s.scratching.has(1), false);
    assert.equal(s.mapping.Decks[1].scratchReleasePending, false);
});

test('a fast forward movement that is slowing down never enters backspin handoff', () => {
    const s = setup();
    s.play();
    s.mapping.jogTouch14bit(1, 0, 127, 0, '[Channel1]');
    s.move(100);
    s.advance(40); s.setScratchRate(2.4); s.move(110);
    s.advance(40); s.setScratchRate(1.2); s.move(120);
    s.mapping.jogTouch14bit(1, 0, 0, 0, '[Channel1]');
    assert.equal(s.mapping.Decks[1].scratchReleasePending, false);
    assert.deepEqual(s.disableCalls, [[1, false]]);
});

test('playing nudge retains sensitivity and handles 14-bit wrap in both directions', () => {
    const s = setup(); s.play();
    s.move(16380); s.move(4); s.move(16380);
    assert.deepEqual(s.nudges, [['jog', 8 / 30], ['jog', -8 / 30]]);
    assert.equal(s.timers.size, 0);
});

test('an impossible position jump rebases instead of freezing the jog until it catches up', () => {
    const s = setup();
    s.play();
    s.move(100);
    s.move(1000); // Rejected spike / discontinuity (> maxJogDelta)
    assert.deepEqual(s.nudges, []);
    s.move(1010);
    assert.deepEqual(s.nudges, [['jog', 10 / 30]]);
});

test('shutdown cancels scrub timers and releases all four jogs', () => {
    const s = setup();
    for (let i = 1; i <= 4; i++) { s.move(100, i); s.move(110, i); }
    assert.equal(s.timers.size, 4);
    s.mapping.shutdown();
    assert.equal(s.timers.size, 0);
    assert.equal(s.scratching.size, 0);
});
