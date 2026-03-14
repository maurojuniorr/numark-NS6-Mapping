var NumarkNS6 = {};

NumarkNS6.Decks = [];
NumarkNS6.jogMSB = [0, 0, 0, 0, 0];
NumarkNS6.jogLSB = [0, 0, 0, 0, 0];
NumarkNS6.lastJogValue = [-1, -1, -1, -1, -1];
NumarkNS6.lastJogRingValue = [0, 0, 0, 0, 0];
NumarkNS6.lastTouchStripValue = [null, 0, 0, 0, 0];
NumarkNS6.deckLoopMode = [null, true, true, true, true];
NumarkNS6.harmonicSyncActive = [null, false, false, false, false];
NumarkNS6.isProcessingHarmonic = [null, false, false, false, false];
NumarkNS6.rateRanges = [0.04, 0.08, 0.16, 0.32, 0.64];

NumarkNS6.blinkState = 0;
NumarkNS6.blinkTimer = 0;
NumarkNS6.displayTimer = 0;

NumarkNS6.searchAmplification = 5; 
NumarkNS6.warnAfterTime = 30; 
NumarkNS6.blinkInterval = 1000; 
NumarkNS6.encoderResolution = 0.05; 
NumarkNS6.resetHotCuePageOnTrackLoad = true; 
NumarkNS6.cueReverseRoll = true; 
NumarkNS6.hotcuePageIndexBehavior = true;
NumarkNS6.globalShift = false;

NumarkNS6.scratchSettings = { 
    "alpha": 1.0/4, 
    "beta": 1.0/4/32, 
    "jogResolution": 3500, 
    "vinylSpeed": 33.33 
};

NumarkNS6.SysExInit1 = [0xF0, 0x00, 0x01, 0x3F, 0x7F, 0x79, 0x50, 0x00, 0x10, 0x04, 0x01, 0x00, 0x00, 0x00, 0x04, 0x04, 0x0E, 0x0F, 0x00, 0x00, 0x0E, 0x05, 0x0F, 0x04, 0x0C, 0x06, 0x0B, 0x0F, 0x0D, 0x0C, 0xF7];
NumarkNS6.SysExInit2 = [0xF0, 0x00, 0x01, 0x3F, 0x7F, 0x79, 0x60, 0x00, 0x01, 0x49, 0x01, 0x00, 0x00, 0x00, 0x00, 0xF7];

NumarkNS6.scratchXFader = {
    xFaderMode: 0, 
    xFaderCurve: 999.60,
    xFaderCalibration: 1.0
};

// =======================================================
// 1. MOTOR VISUAL (LEDs de Estado)
// =======================================================

NumarkNS6.updatePlayCueLEDs = function(deckNum, midiChannel) {
    var group = "[Channel" + deckNum + "]";
    var statusCC = 0xB0 + midiChannel;
    var deck = NumarkNS6.Decks[deckNum];
    if (!deck) return;

    var trackLoaded = engine.getValue(group, "track_loaded") > 0;
    if (!trackLoaded) {
        midi.sendShortMsg(statusCC, 0x09, 0x00); 
        midi.sendShortMsg(statusCC, 0x08, 0x00); 
        return; 
    }

    var isPlaying = engine.getValue(group, "play") > 0;
    var isCueing = engine.getValue(group, "cue_default") > 0;

    if (deck && deck.shiftButton && deck.shiftButton.state) {
        midi.sendShortMsg(statusCC, 0x09, isPlaying ? 0x7F : NumarkNS6.blinkState);

        var isIntroActivating = engine.getValue(group, "intro_start_activate") > 0;
        if (isIntroActivating) {
            midi.sendShortMsg(statusCC, 0x08, 0x7F);
        } else if (isPlaying) {
            midi.sendShortMsg(statusCC, 0x08, 0x00);
        } else {
            var atIntro = false;
            var introStartPos = engine.getValue(group, "intro_start_position");
            var trackSamples = engine.getValue(group, "track_samples");
            var playPos = engine.getValue(group, "playposition");

            if (trackSamples > 0 && introStartPos !== -1) {
                if (Math.abs((playPos * trackSamples) - introStartPos) < 5000) atIntro = true;
            }
            midi.sendShortMsg(statusCC, 0x08, atIntro ? 0x7F : 0x00);
        }
        return; 
    }

    midi.sendShortMsg(statusCC, 0x09, isPlaying ? 0x7F : NumarkNS6.blinkState);

    if (isCueing) {
        midi.sendShortMsg(statusCC, 0x08, 0x7F);
    } else if (isPlaying) {
        midi.sendShortMsg(statusCC, 0x08, 0x00);
    } else {
        var atCue = false;
        var playPos = engine.getValue(group, "playposition");
        var cuePoint = engine.getValue(group, "cue_point");
        var trackSamples = engine.getValue(group, "track_samples");

        if (trackSamples > 0 && cuePoint !== -1) {
            if (Math.abs((playPos * trackSamples) - cuePoint) < 5000) atCue = true;
        } else if (playPos <= 0.005) {
            atCue = true;
        }
        
        midi.sendShortMsg(statusCC, 0x08, atCue ? 0x7F : NumarkNS6.blinkState);
    }
};

NumarkNS6.updateSyncLED = function(deckNum, midiChannel) {
    var group = "[Channel" + deckNum + "]";
    var deck = NumarkNS6.Decks[deckNum];
    if (!deck) return;

    // 1. MODO SHIFT (Luz do Quantize: acesa forte se ligado, apagada se desligado)
    if (deck.shiftButton && deck.shiftButton.state) {
        var isQuantize = engine.getValue(group, "quantize") > 0;
        midi.sendShortMsg(0xB0 + midiChannel, 0x07, isQuantize ? 0x7F : 0x00);
        return;
    }

    // 2. MODO NORMAL (Luz do Sync Padrão: pisca com a batida)
    if (!engine.getValue(group, "sync_enabled")) {
        midi.sendShortMsg(0xB0 + midiChannel, 0x07, 0x00);
        return;
    }
    
    var isPlaying = engine.getValue(group, "play") > 0;
    var beatActive = engine.getValue(group, "beat_active") > 0;
    midi.sendShortMsg(0xB0 + midiChannel, 0x07, isPlaying ? (beatActive ? 0x7F : 0x00) : 0x7F);
};

NumarkNS6.updateReverseLED = function(deckNum) {
    if (!NumarkNS6.Decks[deckNum]) return;
    var isReverse = engine.getValue("[Channel" + deckNum + "]", "reverse");
    midi.sendShortMsg(0xB0 + NumarkNS6.Decks[deckNum].midiChannel, 0x16, isReverse ? 0x01 : 0x00);
};

// =======================================================
// 2. MOTOR DO PRATO
// =======================================================

NumarkNS6.updateJogRing = function (deckNum) {
    if (!NumarkNS6.Decks[deckNum]) return;

    var group = "[Channel" + deckNum + "]";
    var mChan = NumarkNS6.Decks[deckNum].midiChannel;
    var duration = engine.getValue(group, "duration");
    var playPos = engine.getValue(group, "playposition");

    if (duration <= 0 || engine.getValue(group, "track_loaded") === 0) {
        if (NumarkNS6.lastJogRingValue[deckNum] !== 0) {
            midi.sendShortMsg(0xB0 + mChan, 0x3A, 0x00);
            NumarkNS6.lastJogRingValue[deckNum] = 0;
        }
        return;
    }

    var secsPerRev = 1.8;
    var currentSec = playPos * duration;
    
    var revFraction = (currentSec / secsPerRev) % 1;
    var ledIndex = Math.floor(revFraction * 21) + 1;
    ledIndex = Math.max(1, Math.min(21, ledIndex));

    var finalValue = ledIndex;

    var timeRemaining = duration - currentSec;
    if (timeRemaining <= NumarkNS6.warnAfterTime) {
        finalValue = (NumarkNS6.blinkState === 0) ? 0x00 : (ledIndex + 0x40);
    }

    if (NumarkNS6.lastJogRingValue[deckNum] !== finalValue) {
        midi.sendShortMsg(0xB0 + mChan, 0x3A, finalValue);
        NumarkNS6.lastJogRingValue[deckNum] = finalValue;
    }
};

NumarkNS6.updateTouchStrip = function (value, group) {
    var deckNum = script.deckFromGroup(group);
    if (!NumarkNS6.Decks[deckNum]) return;
    
    var ledValue = Math.floor(value * 14) + 1;
    if (ledValue > 15) ledValue = 15;
    
    if (engine.getValue(group, "track_loaded") === 0) ledValue = 0;
    
    if (NumarkNS6.lastTouchStripValue[deckNum] === ledValue) return;
    
    NumarkNS6.lastTouchStripValue[deckNum] = ledValue;
    midi.sendShortMsg(0xB0 + NumarkNS6.Decks[deckNum].midiChannel, 0x4E, ledValue);
};

// =======================================================
// 3. GESTÃO DE TIMERS
// =======================================================

NumarkNS6.startTimers = function () {
    if (NumarkNS6.blinkTimer === 0) {
        NumarkNS6.blinkTimer = engine.beginTimer(500, function () {
            NumarkNS6.blinkState = (NumarkNS6.blinkState === 0) ? 0x7F : 0;
            for (var i = 1; i <= 4; i++) {
                if (NumarkNS6.Decks[i]) {
                    NumarkNS6.updatePlayCueLEDs(i, NumarkNS6.Decks[i].midiChannel);
                    NumarkNS6.updateSyncLED(i, NumarkNS6.Decks[i].midiChannel);
                }
            }
        });
    }

    if (NumarkNS6.displayTimer === 0) {
        NumarkNS6.displayTimer = engine.beginTimer(100, function () {
            for (var i = 1; i <= 4; i++) {
                if (NumarkNS6.Decks[i]) {
                    var group = "[Channel" + i + "]";
                    NumarkNS6.updateJogRing(i);
                    NumarkNS6.updateTouchStrip(engine.getValue(group, "playposition"), group);
                }
            }
        });
    }
};

// =======================================================
// 4. INICIALIZAÇÃO E CLASSES BASES
// =======================================================

components.Encoder.prototype.input = function (_c, _ctrl, value) {
    this.inSetParameter(this.inGetParameter() + ((value === 0x01) ? NumarkNS6.encoderResolution : -NumarkNS6.encoderResolution));
};

components.Component.prototype.send = function (value) {
    if (this.midi === undefined || this.midi[0] === undefined || this.midi[1] === undefined) return;
    if (this.midi[2] === undefined) this.midi[2] = this.midi[0];
    if (this.midi[3] === undefined) this.midi[3] = this.midi[1];
    
    midi.sendShortMsg(this.midi[2], this.midi[3], value);
    if (this.sendShifted) {
        if (this.shiftChannel) midi.sendShortMsg(this.midi[2] + this.shiftOffset, this.midi[3], value);
        else if (this.shiftControl) midi.sendShortMsg(this.midi[2], this.midi[3] + this.shiftOffset, value);
    }
};

NumarkNS6.storedCrossfaderParams = {};
NumarkNS6.crossfaderCallbackConnections = [];
NumarkNS6.CrossfaderChangeCallback = function (value, group, control) {
    this.changed = true;
    NumarkNS6.storedCrossfaderParams[control] = value;
};

NumarkNS6.init = function () {
    midi.sendSysexMsg(NumarkNS6.SysExInit1, NumarkNS6.SysExInit1.length);
    midi.sendSysexMsg(NumarkNS6.SysExInit2, NumarkNS6.SysExInit2.length);

    NumarkNS6.Decks = [];
    for (var i = 1; i <= 4; i++) {
        NumarkNS6.Decks[i] = new NumarkNS6.Deck(i);
        (function (dIdx) {
            var g = "[Channel" + dIdx + "]";
            var mChan = NumarkNS6.Decks[dIdx].midiChannel;
            
            midi.sendShortMsg(0xB0 + mChan, 0x3B, 0x01);
            
            midi.sendShortMsg(0xB0 + dIdx, 0x18, NumarkNS6.deckLoopMode[dIdx] ? 0x01 : 0x02);
            NumarkNS6.updateAutoLoopLEDs(dIdx); 
            midi.sendShortMsg(0xB0 + dIdx, 0x15, engine.getValue(g, "loop_enabled") ? 0x7F : 0x00);
            
            engine.makeConnection(g, "play", function () { 
                NumarkNS6.updatePlayCueLEDs(dIdx, mChan);
                NumarkNS6.updateSyncLED(dIdx, mChan); 
            });
            engine.makeConnection(g, "sync_enabled", function () { NumarkNS6.updateSyncLED(dIdx, mChan); });
            engine.makeConnection(g, "quantize", function () { NumarkNS6.updateSyncLED(dIdx, mChan); });
            engine.makeConnection(g, "track_loaded", function (value) {
                if (value > 0) {
                    NumarkNS6.harmonicSyncActive[dIdx] = false;
                    NumarkNS6.updateAutoLoopLEDs(dIdx);
                    NumarkNS6.updatePlayCueLEDs(dIdx, mChan); 
                }
            });
            engine.makeConnection(g, "cue_default", function () { if (NumarkNS6.Decks[dIdx]) NumarkNS6.updatePlayCueLEDs(dIdx, mChan); });
            engine.makeConnection(g, "beat_active", function () { NumarkNS6.updateSyncLED(dIdx, mChan); });
            
            engine.makeConnection(g, "loop_enabled", function (value) {
                midi.sendShortMsg(0xB0 + dIdx, 0x15, value ? 0x7F : 0x00);
                NumarkNS6.updateAutoLoopLEDs(dIdx);
            });
            engine.makeConnection(g, "beatloop_size", function () { NumarkNS6.updateAutoLoopLEDs(dIdx); });
            engine.makeConnection(g, "loop_start_position", function () { NumarkNS6.updateAutoLoopLEDs(dIdx); });
            engine.makeConnection(g, "loop_end_position", function () { NumarkNS6.updateAutoLoopLEDs(dIdx); });
        })(i);
    }
    engine.makeConnection("[Channel1]", "rate", NumarkNS6.updateBpmMeter);
    engine.makeConnection("[Channel2]", "rate", NumarkNS6.updateBpmMeter);
    engine.makeConnection("[Channel1]", "file_bpm", NumarkNS6.updateBpmMeter);
    engine.makeConnection("[Channel2]", "file_bpm", NumarkNS6.updateBpmMeter);
    
    NumarkNS6.updateBpmMeter();
    
    engine.beginTimer(1000, function () {
        midi.sendShortMsg(0xB0, 0x50, 0x00); 
        midi.sendShortMsg(0xB0, 0x51, 0x00); 
        for (var d = 1; d <= 4; d++) {
            if (NumarkNS6.Decks[d]) midi.sendShortMsg(0xB0 + NumarkNS6.Decks[d].midiChannel, 0x12, 0x7F); 
        }
    }, true);

    Object.keys(NumarkNS6.scratchXFader).forEach(function (control) {
        var value = NumarkNS6.scratchXFader[control];
        var connectionObject = engine.makeConnection("[Mixer Profile]", control, NumarkNS6.CrossfaderChangeCallback.bind(this));
        connectionObject.trigger();
        NumarkNS6.crossfaderCallbackConnections.push(connectionObject);
    }.bind(this));

    NumarkNS6.Mixer = new NumarkNS6.MixerTemplate();
    NumarkNS6.startTimers();
    NumarkNS6.FX.init();
    NumarkNS6.FX.initRouting(); 
};

// =======================================================
// 5. ESTRUTURA DOS CONTAINERS E DECKS
// =======================================================

NumarkNS6.MixerTemplate = function() {
    this.deckChangeL = new components.Button({ midi: [0xB0, 0x50], input: function(_c, _ctrl, value) { this.output(value); } });
    this.deckChangeR = new components.Button({ midi: [0xB0, 0x51], input: function(_c, _ctrl, value) { this.output(value); } });
    this.channelInputSwitcherL = new components.Button({ midi: [0x90, 0x49], group: "[Channel3]", inKey: "mute" });
    this.channelInputSwitcherR = new components.Button({ midi: [0x90, 0x4A], group: "[Channel4]", inKey: "mute" });

    
    
    this.changeCrossfaderContour = new components.Button({
        midi: [0x90, 0x4B], state: false,
        input: function(channel, control, value, status) {
            NumarkNS6.crossfaderCallbackConnections.forEach(function(cb) { cb.disconnect(); });
            NumarkNS6.crossfaderCallbackConnections = [];
            this.state=this.isPress(channel, control, value, status);
            var targetParams = this.state ? NumarkNS6.scratchXFader : NumarkNS6.storedCrossfaderParams;
            
            Object.keys(targetParams).forEach(function(ctrl) {
                var val = targetParams[ctrl];
                engine.setValue("[Mixer Profile]", ctrl, val);
                NumarkNS6.crossfaderCallbackConnections.push(engine.makeConnection("[Mixer Profile]", ctrl, NumarkNS6.CrossfaderChangeCallback.bind(this)));
            }.bind(this));
        }
    });

    this.navigationEncoderTick = new components.Encoder({
        midi: [0xB0, 0x44],
        group: "[Library]",
        input: function (channel, control, value, status, group) {
            var direction = (value < 64) ? 1 : -1;
            engine.setValue("[Library]", "MoveVertical", direction);
        }   
    });
    
    this.autoDjAddButton = new components.Button({
        midi: [0x90, 0x0D], 
        group: "[AutoDJ]",
        input: function (channel, control, value, status, group) {
            if (value === 0) return; 
            engine.setValue("[Library]", "AutoDjAddBottom", 1);
            midi.sendShortMsg(0xB0, 0x0D, 0x7F);
            engine.beginTimer(150, function() {
                midi.sendShortMsg(0xB0, 0x0D, 0x00);
            }, true);
        }
    });

    this.viewButton = new components.Button({
        midi: [0x90, 0x01],
        group: "[Skin]",
        input: function (channel, control, value, status, group) {
            if (value === 0) return;
            var isShifted = false;
            for (var i = 1; i <= 4; i++) {
                if (NumarkNS6.Decks[i] && NumarkNS6.Decks[i].shiftButton && NumarkNS6.Decks[i].shiftButton.state) {
                    isShifted = true; break;
                }
            }
            if (isShifted) {
                var currentWave = engine.getValue("[Skin]", "show_waveforms");
                engine.setValue("[Skin]", "show_waveforms", !currentWave);
            } else {
                var currentLib = engine.getValue("[Skin]", "show_maximized_library");
                engine.setValue("[Skin]", "show_maximized_library", !currentLib);
            }
        }
    });

    this.navigationEncoderButton = new components.Button({
        midi: [0x90, 0x08],
        group: "[Library]",
        input: function (channel, control, value, status, group) {
            if (value === 0) return; 
            var isShifted = false;
            for (var i = 1; i <= 4; i++) {
                if (NumarkNS6.Decks[i] && NumarkNS6.Decks[i].shiftButton && NumarkNS6.Decks[i].shiftButton.state) {
                    isShifted = true; break;
                }
            }
            if (isShifted) {
                var currentState = engine.getValue("[AutoDJ]", "enabled");
                engine.setValue("[AutoDJ]", "enabled", !currentState);
                midi.sendShortMsg(0xB0, 0x08, 0x7F);
                engine.beginTimer(100, function() { midi.sendShortMsg(0xB0, 0x08, 0x00); }, true);
            } else {
                engine.setValue("[Playlist]", "ToggleSelectedSidebarItem", 1);
            }
        }
    });

    this.backButton = new components.Button({
        midi: [0x90, 0x06], 
        group: "[Library]",
        input: function (channel, control, value, status, group) {
            if (value > 0) {
                engine.setValue("[Library]", "MoveFocus", -1);
            }
        }
    });

    this.fwdButton = new components.Button({
        midi: [0x90, 0x07], 
        group: "[Library]",
        input: function (channel, control, value, status, group) {
            if (value > 0) {
                engine.setValue("[Library]", "MoveFocus", 1);
            }
        }
    });
};
NumarkNS6.MixerTemplate.prototype = new components.ComponentContainer();

// =======================================================
// CONTAINER DOS HOTCUES (ACIMA DO TRANSPORT)
// =======================================================
NumarkNS6.HotcuesContainer = function (channel) {
    this.group = "[Channel" + channel + "]";
    var theContainer = this;
    var dChan = channel;

    // 🔴 HOTCUES (1 a 5) COM SISTEMA DE CORES (Branco = 0x7F / Vermelho = 0x01)
    for (var i = 1; i <= 5; i++) {
        this["hotCue" + i] = new components.Button({
            midi: [0x90 + channel, 0x12 + i, 0xB0 + channel, 0x0A + i],
            number: i,
            group: theContainer.group,
            type: components.Button.prototype.types.push,
            shift: function() {
                this.inKey = "hotcue_" + this.number + "_clear";
                // Se existe marcação, muda o LED para Vermelho no modo Shift
                if (engine.getValue(this.group, "hotcue_" + this.number + "_position") !== -1) {
                    midi.sendShortMsg(this.midi[2], this.midi[3], 0x01);
                }
            },
            unshift: function() {
                this.inKey = "hotcue_" + this.number + "_activate";
                // Se existe marcação, volta o LED para Branco no modo Normal
                if (engine.getValue(this.group, "hotcue_" + this.number + "_position") !== -1) {
                    midi.sendShortMsg(this.midi[2], this.midi[3], 0x7F);
                }
            }
        });

        // Ouvinte do Mixxx: Liga/Apaga a luz quando o Hotcue é criado ou deletado
        (function(btn, grp, num) {
            engine.makeConnection(grp, "hotcue_" + num + "_position", function(value) {
                if (value === -1) {
                    midi.sendShortMsg(btn.midi[2], btn.midi[3], 0x00); // Apaga se vazio
                } else {
                    midi.sendShortMsg(btn.midi[2], btn.midi[3], 0x7F); // Acende Branco se tiver marcação
                }
            });
        })(this["hotCue" + i], theContainer.group, i);
    }

    // 🛑 SHUTDOWN: Apaga os 5 botões ao fechar o Mixxx
    this.shutdown = function() {
        for (var i = 1; i <= 5; i++) {
            midi.sendShortMsg(0xB0 + dChan, 0x0A + i, 0x00);
        }
    };
};
NumarkNS6.HotcuesContainer.prototype = new components.ComponentContainer();

NumarkNS6.Deck = function(channel) {
    components.Deck.call(this, channel);
    var groupName = "[Channel" + channel + "]";
    this.deckNum = channel;
    this.midiChannel = channel;
    this.group = groupName;
    this.rateRangeEntry = 0;
    var theDeck = this;
    this.hotcuesContainer = new NumarkNS6.HotcuesContainer(channel);
    this.gridSlipMode = false;
    this.gridAdjustMode = false;
    this.skipMode = false; 
    this.scratchMode = true; 
    this.isSearching = false;

    this.eqKnobs = [];
    for (var i = 1; i <= 3; i++) {
        this.eqKnobs[i] = new components.Pot({
            midi: [0xB0, 0x29 + i + 5 * (channel - 1)], group: "[EqualizerRack1_" + theDeck.group + "_Effect1]", inKey: "parameter" + i,
            inValueScale: function (value) {
                if (value > this.max * 0.46997 && value < this.max * 0.50659) return (value + this.max * 0.015625) / this.max;
                else return value / this.max;
            }
        });
    }
    this.gainKnob = new components.Pot({
        midi: [0xB0, 0x2C + 5 * (channel - 1)],
        shift: function () { this.group = "[QuickEffectRack1_" + theDeck.group + "]"; this.inKey = "super1"; },
        unshift: function () { this.group = theDeck.group; this.inKey = "pregain"; }
    });

    // ==========================================
    // 🔴 HOTCUES (1 a 5) - NATIVOS DA NS6
    // ==========================================
    this.hotcues = [];
    for (var i = 1; i <= 5; i++) {
        this.hotcues[i] = new components.HotcueButton({
            midi: [0x90 + channel, 0x12 + i], // Mapeia as notas 0x13 até 0x17 automaticamente
            number: i,
            group: this.group
        });
    }

    this.playButton = new components.Button({
        midi: [0x90 + channel, 0x11, 0xB0 + channel, 0x09], 
        group: groupName, 
        output: function() {}, 
        input: function (channel, control, value, status, group) { 
            if (value > 0) script.toggleControl(group, "play");
        }
    });

    this.cueButton = new components.Button({ 
        midi: [0x90 + channel, 0x10, 0xB0 + channel, 0x08], 
        group: groupName, 
        output: function() {}, 
        input: function (channel, control, value, status, group) {
            var deck = NumarkNS6.Decks[theDeck.deckNum];

            if (deck.shiftButton && deck.shiftButton.state) {
                if (value > 0) {
                    engine.setValue(group, "intro_start_activate", 1);  
                } else {
                    engine.setValue(group, "intro_start_activate", 0);
                }
                NumarkNS6.updatePlayCueLEDs(theDeck.deckNum, theDeck.midiChannel);
                return;
            }

            if (value > 0) { 
                var isPlaying = engine.getValue(group, "play") > 0;
                if (isPlaying) {
                    deck.isFlashingCue = true;
                    midi.sendShortMsg(0xB0 + deck.midiChannel, 0x08, 0x7F);
                    engine.beginTimer(80, function() {
                        deck.isFlashingCue = false;
                        NumarkNS6.updatePlayCueLEDs(theDeck.deckNum, theDeck.midiChannel);
                    }, true);
                }
                engine.setValue(group, "cue_default", 1);
            } else {
                engine.setValue(group, "cue_default", 0);
            }
            NumarkNS6.updatePlayCueLEDs(theDeck.deckNum, theDeck.midiChannel);
        }
    });

   // ==========================================
    // ⬆️ BOTÃO SHIFT (Integrado com Hotcues e Sync)
    // ==========================================
    this.shiftButton = new components.Button({
        midi: [0x90 + channel, 0x12, 0xB0 + channel, 0x0A], 
        type: components.Button.prototype.types.powerWindow, 
        state: false,
        inToggle: function () {
            this.state = !this.state;
            if (this.state) { 
                theDeck.shift(); NumarkNS6.Mixer.shift(); 
                for(var h=1; h<=5; h++) theDeck.hotcues[h].shift(); // Avisa os Hotcues
            } else { 
                theDeck.unshift(); NumarkNS6.Mixer.unshift(); 
                for(var h=1; h<=5; h++) theDeck.hotcues[h].unshift(); // Desavisa os Hotcues
            }
            this.output(this.state);
            
            try {
                NumarkNS6.updatePlayCueLEDs(theDeck.deckNum, theDeck.midiChannel);
                NumarkNS6.updateSyncLED(theDeck.deckNum, theDeck.midiChannel);
                NumarkNS6.FX.updateLEDs();
            } catch(e) {}
        }
    });

    // BOTÃO SYNC 100% ORIGINAL (Isso traz os Hotcues de volta à vida)
    this.syncButton = new components.Button({ 
        midi: [0x90 + channel, 0x0F], 
        group: groupName, 
        input: function (channel, control, value, status, group) {
            if (value === 0) return; // Só age quando aperta o botão
            var deck = NumarkNS6.Decks[theDeck.deckNum];
            
            if (deck.shiftButton && deck.shiftButton.state) {
                // MODO SHIFT: Liga/Desliga Quantize
                var q = engine.getValue(group, "quantize");
                engine.setValue(group, "quantize", !q);
            } else {
                // MODO NORMAL: Liga/Desliga Sync
                var s = engine.getValue(group, "sync_enabled");
                engine.setValue(group, "sync_enabled", !s);
            }
            // Força a luz a atualizar na hora
            NumarkNS6.updateSyncLED(theDeck.deckNum, theDeck.midiChannel);
        }
    });
    this.gridSetClearInput = function (ch, ctrl, value, status, grp) {
        if (value > 0) {
            if (theDeck.shiftButton.state) {
                engine.setValue(grp, "beats_delete_marker", 1);
                engine.beginTimer(100, function() { engine.setValue(grp, "beats_delete_marker", 0); }, true);
            } else {
                engine.setValue(grp, "beats_translate_curpos", 1);
                engine.beginTimer(100, function() { engine.setValue(grp, "beats_translate_curpos", 0); }, true);
            }
        }
    };

    this.gridSlipAdjustInput = function (ch, ctrl, value, status, grp) {
        if (value > 0) {
            if (theDeck.shiftButton.state) {
                theDeck.gridAdjustMode = true;
                theDeck.gridSlipMode = false;
            } else {
                theDeck.gridSlipMode = true;
                theDeck.gridAdjustMode = false;
            }
        } else {
            theDeck.gridSlipMode = false;
            theDeck.gridAdjustMode = false;
        }
    };

    this.orientationButtonLeft = new components.Button({
        midi: [0x90, 0x32+channel*2, 0xB0, 0x42+channel*2], key: "orientation",
        input: function(_c, _ctrl, value) {
            if (!this.ignoreNext) {
                if (value===0x7F) { this.inSetValue(0); theDeck.orientationButtonRight.ignoreNextOff = true; this.ignoreNextOff=false; }
                else if (!this.ignoreNextOff && value===0x00) this.inSetValue(1);
            } else this.ignoreNext=false;
        },
        output: function(value) { this.send(value===0?0x7F:0x00); this.ignoreNext=true; if (value===0) theDeck.orientationButtonRight.ignoreNextOff = true; }
    });

    this.skipButtonInput = function(ch, ctrl, value) {
        theDeck.skipMode = (value > 0);
        if (value === 0) theDeck.skipAccumulator = 0;
    };

    this.orientationButtonRight = new components.Button({
        midi: [0x90, 0x33+channel*2, 0xB0, 0x43+channel*2], key: "orientation",
        input: function(_c, _ctrl, value) {
            if (!this.ignoreNext) {
                if (value===0x7F) { this.inSetValue(2); theDeck.orientationButtonLeft.ignoreNextOff = true; this.ignoreNextOff=false; }
                else if (!this.ignoreNextOff && value===0x00) this.inSetValue(1);
            } else this.ignoreNext=false;
        },
        output: function(value) { this.send(value===2?0x7F:0x00); if (value===2) theDeck.orientationButtonLeft.ignoreNextOff = true; this.ignoreNext=true; }
    });

    this.pflButton = new components.Button({
        midi: [0x90, 0x30+channel, 0xB0, 0x3F+channel], key: "pfl", flickerSafetyTimeout: true,
        input: function(_c, _ctrl, value) {
            if (this.flickerSafetyTimeout) {
                this.flickerSafetyTimeout=false;
                if (this.inGetParameter()!==(value/0x7F)) this.inSetParameter(value/0x7F);
                engine.beginTimer(100, () => { this.flickerSafetyTimeout=true; }, true);
            }
        }
    });

    var loadNote = (channel === 1 || channel === 3) ? 0x0C : 0x0E;

    this.loadButton = new components.Button({ 
        midi: [0x90 + channel, loadNote],
        group: groupName,
        input: function (ch, control, value, status, group) {
            if (value === 0) return; 

            var deckNum = script.deckFromGroup(group);
            var deck = NumarkNS6.Decks[deckNum];

            if (deck && deck.shiftButton && deck.shiftButton.state) {
                engine.setValue(group, "eject", 1);
            } else {
                engine.setValue(group, "LoadSelectedTrack", 1);
            }
        }
    });

    this.manageChannelIndicator = () => {
        this.duration=engine.getParameter(theDeck.group, "duration");
        if (engine.getParameter(theDeck.group, "playposition") * this.duration > (this.duration - NumarkNS6.warnAfterTime)) {
            this.alternating=!this.alternating; 
            midi.sendShortMsg(0xB0, 0x1D+channel, this.alternating?0x7F:0x0);
        } else {
            midi.sendShortMsg(0xB0, 0x1D+channel, 0x7F);
        }
    };
    engine.makeConnection(this.group, "track_loaded", function(value) {
        if (value === 0) { engine.stopTimer(theDeck.blinkTimer); theDeck.blinkTimer=0; return; }
        if (!this.previouslyLoaded) theDeck.blinkTimer=engine.beginTimer(NumarkNS6.blinkInterval, theDeck.manageChannelIndicator.bind(this), true);
        this.previouslyLoaded=value;
    }.bind(this));

    this.pitchBendMinus = new components.Button({ 
        midi: [0x90+channel, 0x18, 0xB0+channel, 0x3D], 
        key: "rate_temp_down", 
        shift: function() { this.inkey = "rate_temp_down_small"; }, 
        unshift: function() { this.inkey = "rate_temp_down"; } 
    });
    this.pitchBendPlus = new components.Button({ midi: [0x90+channel, 0x19, 0xB0+channel, 0x3C], key: "rate_temp_up", shift: function() { this.inkey = "rate_temp_up_small"; }, unshift: function() { this.inkey = "rate_temp_up"; } });
    this.keylockButton = new components.Button({ midi: [0x90+channel, 0x1B, 0xB0+channel, 0x10], type: components.Button.prototype.types.toggle, shift: function() { this.inKey="sync_key"; this.outKey="sync_key"; }, unshift: function() { this.inKey="keylock"; this.outKey="keylock"; } });
    this.bpmSlider = new components.Pot({ midi: [0xB0+channel, 0x01, 0xB0+channel, 0x37], inKey: "rate", group: theDeck.group, invert: true });
    
    this.pitchLedHandler = engine.makeConnection(this.group, "rate", function(value) { midi.sendShortMsg(0xB0+channel, 0x37, value===0 ? 0x7F : 0x00); }.bind(this));
    this.pitchLedHandler.trigger();

    this.pitchRange = new components.Button({
        midi: [0x90 + channel, 0x1A, 0xB0 + channel, 0x1E],
        key: "rateRange",
        input: function () {
            theDeck.rateRangeEntry = (theDeck.rateRangeEntry + 1) % NumarkNS6.rateRanges.length;
            var newRange = NumarkNS6.rateRanges[theDeck.rateRangeEntry];
            engine.setValue(this.group, "rateRange", newRange);
            this.send(0x7F);
            engine.beginTimer(50, () => this.send(0x00), true);
        },
        output: function (value) {
            this.send(value !== 0.08 ? 0x7F : 0x00);
        }
    });

    this.reconnectComponents(function(c) { if (c.group === undefined || c.group === "") c.group = groupName; });
    this.shutdown = function() {
        this.pitchLedHandler.disconnect();
        midi.sendShortMsg(0xB0+channel, 0x37, 0); 
        this.pitchRange.send(0); this.keylockButton.send(0); this.syncButton.send(0);
        this.pitchBendPlus.send(0); this.pitchBendMinus.send(0); this.cueButton.send(0);
        this.playButton.send(0); this.shiftButton.send(0); 
        if (theDeck.blinkTimer !== 0) engine.stopTimer(theDeck.blinkTimer);
        midi.sendShortMsg(0xB0, 0x1D+channel, 0); 
    };
};

NumarkNS6.Deck.prototype = new components.Deck();

NumarkNS6.shutdown = function () {
    for (var i = 1; i <= 4; i++) NumarkNS6.Decks[i].shutdown();
    if (!NumarkNS6.CrossfaderChangeCallback.changed || NumarkNS6.changeCrossfaderContour.state) {
        Object.keys(NumarkNS6.storedCrossfaderParams).forEach(function (ctrl) {
            engine.setValue("[Mixer Profile]", ctrl, NumarkNS6.storedCrossfaderParams[ctrl]);
        });
    }
    if (NumarkNS6.displayTimer !== 0) engine.stopTimer(NumarkNS6.displayTimer);
    if (NumarkNS6.blinkTimer !== 0) engine.stopTimer(NumarkNS6.blinkTimer);
};

// =======================================================
// 6. FUNÇÕES DE PROCESSAMENTO DO JOG E LOOPS
// =======================================================

NumarkNS6.jogMove14bit = function(channel, control, value, status, group) {
    var deckNum = script.deckFromGroup(group);

    if (control === 0x00) NumarkNS6.jogMSB[deckNum] = value;
    if (control === 0x20) NumarkNS6.jogLSB[deckNum] = value;
    if (control !== 0x20) return; 

    var fullValue = (NumarkNS6.jogMSB[deckNum] << 7) | NumarkNS6.jogLSB[deckNum];

    if (NumarkNS6.lastJogValue[deckNum] === -1) {
        NumarkNS6.lastJogValue[deckNum] = fullValue;
        return;
    }

    var delta = fullValue - NumarkNS6.lastJogValue[deckNum];
    NumarkNS6.lastJogValue[deckNum] = fullValue;
    
    if (delta > 8192) delta -= 16384; 
    else if (delta < -8192) delta += 16384;

    var deck = NumarkNS6.Decks[deckNum];
    if (!deck) return;

    if (deck.skipMode) {
        if (deck.skipAccumulator === undefined) deck.skipAccumulator = 0;
        deck.skipAccumulator += delta;
        var skipSensitivity = 30; 
        if (deck.skipAccumulator > skipSensitivity) { 
            engine.setValue(group, "beatjump_1_forward", 1); 
            deck.skipAccumulator = 0; 
        }
        else if (deck.skipAccumulator < -skipSensitivity) { 
            engine.setValue(group, "beatjump_1_backward", 1); 
            deck.skipAccumulator = 0; 
        }
        return; 
    }

    if (deck.gridSlipMode) { 
        var slipCmd = (delta > 0) ? "beats_translate_later" : "beats_translate_earlier"; 
        engine.setValue(group, slipCmd, 1); 
        engine.setValue(group, slipCmd, 0); 
        return; 
    }

    if (deck.gridAdjustMode) { 
        var adjustCmd = (delta > 0) ? "beats_adjust_slower" : "beats_adjust_faster"; 
        engine.setValue(group, adjustCmd, 1); 
        engine.setValue(group, adjustCmd, 0); 
        return; 
    }

    if (engine.isScratching(deckNum)) {
        engine.scratchTick(deckNum, delta);
    } else {
        engine.setValue(group, "jog", delta / 15);
    }
};

NumarkNS6.scratchButtonInput = function (channel, control, value, status, group) {
    if (value === 0) return;
    var deckNum = script.deckFromGroup(group);
    if (!NumarkNS6.Decks[deckNum]) return;
    var deck = NumarkNS6.Decks[deckNum];
    if (deck.scratchMode === undefined) deck.scratchMode = true;
    deck.scratchMode = !deck.scratchMode;
    midi.sendShortMsg(0xB0 + channel, 0x12, deck.scratchMode ? 0x7F : 0x00); 
};

NumarkNS6.jogTouch14bit = function (channel, control, value, status, group) {
    var deckNum = script.deckFromGroup(group);
    if (!NumarkNS6.Decks[deckNum]) return;
    if ((value > 0) && NumarkNS6.Decks[deckNum].scratchMode) engine.scratchEnable(deckNum, NumarkNS6.scratchSettings.jogResolution, 33.33, NumarkNS6.scratchSettings.alpha, NumarkNS6.scratchSettings.beta);
    else engine.scratchDisable(deckNum);
};

NumarkNS6.reverseButtonInput = function (channel, control, value, status, group) {
    var deckNum = script.deckFromGroup(group);
    var deck = NumarkNS6.Decks[deckNum];
    if (!deck) return;

    if (deck.shiftButton.state) {
        if (value > 0) {
            engine.setValue(group, "reverseroll", 1);
            midi.sendShortMsg(0xB0 + deck.midiChannel, 0x16, 0x7F); 
        } else {
            engine.setValue(group, "reverseroll", 0);
            midi.sendShortMsg(0xB0 + deck.midiChannel, 0x16, 0x00); 
        }
        return;
    }

    if (value > 0) {
        var currentState = engine.getValue(group, "reverse");
        engine.setValue(group, "reverse", !currentState ? 1 : 0);
        NumarkNS6.updateReverseLED(deckNum);
    }
};

NumarkNS6.loopHalveInput = function (c, ctrl, val, s, grp) { if (val > 0) script.triggerControl(grp, "loop_halve", 1); };
NumarkNS6.loopDoubleInput = function (c, ctrl, val, s, grp) { if (val > 0) script.triggerControl(grp, "loop_double", 1); };
NumarkNS6.loopMoveLeftInput = function (c, ctrl, val, s, grp) { if (val > 0) script.triggerControl(grp, "beatjump_1_backward", 1); };
NumarkNS6.loopMoveRightInput = function (c, ctrl, val, s, grp) { if (val > 0) script.triggerControl(grp, "beatjump_1_forward", 1); };

if (NumarkNS6.deckLoopMode === undefined) NumarkNS6.deckLoopMode = [null, true, true, true, true];

NumarkNS6.updateAutoLoopLEDs = function (deckNum) {
    var group = "[Channel" + deckNum + "]";
    var isAuto = NumarkNS6.deckLoopMode[deckNum];
    var isEnabled = engine.getValue(group, "loop_enabled");
    var currentSize = Math.round(engine.getValue(group, "beatloop_size"));

    if (isAuto) {
        midi.sendShortMsg(0xB0 + deckNum, 0x19, (currentSize === 1) ? 0x01 : 0x00);
        midi.sendShortMsg(0xB0 + deckNum, 0x1A, (currentSize === 2) ? 0x01 : 0x00);
        midi.sendShortMsg(0xB0 + deckNum, 0x1B, (currentSize === 4) ? 0x01 : 0x00);
        midi.sendShortMsg(0xB0 + deckNum, 0x1C, (currentSize === 8) ? 0x01 : 0x00);
    } else {
        if (NumarkNS6.isProcessingHarmonic[deckNum]) return; 
        var hasIn = engine.getValue(group, "loop_start_position") !== -1;
        var isHarmSync = NumarkNS6.harmonicSyncActive[deckNum];
        
        midi.sendShortMsg(0xB0 + deckNum, 0x19, hasIn ? 0x02 : 0x00); 
        midi.sendShortMsg(0xB0 + deckNum, 0x1A, isEnabled ? 0x02 : 0x00);
        midi.sendShortMsg(0xB0 + deckNum, 0x1C, isEnabled ? 0x02 : 0x00);
        midi.sendShortMsg(0xB0 + deckNum, 0x1B, isHarmSync ? 0x02 : 0x00);
    }
};

NumarkNS6.loopModeInput = function (channel, control, value, status, group) {
    if (value > 0) {
        var deckNum = status & 0x0F; 
        NumarkNS6.deckLoopMode[deckNum] = !NumarkNS6.deckLoopMode[deckNum];
        midi.sendShortMsg(0xB0 + deckNum, 0x18, NumarkNS6.deckLoopMode[deckNum] ? 0x01 : 0x02); 
        engine.setValue(group, "loop_clear", 1);
        NumarkNS6.updateAutoLoopLEDs(deckNum);
    }
};

NumarkNS6.loopOnOffInput = function (ch, ctrl, val, st, grp) { 
    if (val > 0) { 
        var isEnabled = engine.getValue(grp, "loop_enabled");
        if (isEnabled) {
            engine.setValue(grp, "reloop_toggle", 1);
            engine.setValue(grp, "reloop_toggle", 0);
        } else {
            engine.setValue(grp, "beatloop_activate", 1);
            engine.setValue(grp, "beatloop_activate", 0);
        }
    } 
};

NumarkNS6.loopButtonInput = function (channel, control, value, status, group) {
    var deckNum = status & 0x0F;
    var btnIdx = control - 0x27; 
    if (value > 0) { 
        if (NumarkNS6.deckLoopMode[deckNum]) {
            var sizes = [0, 1, 2, 4, 8]; 
            var selSize = sizes[btnIdx];
            if (engine.getValue(group, "loop_enabled") && engine.getValue(group, "beatloop_size") === selSize) engine.setValue(group, "loop_enabled", 0);
            else { engine.setValue(group, "beatloop_size", selSize); engine.setValue(group, "beatloop_" + selSize + "_activate", 1); }
        } else {
            var isLoopActive = engine.getValue(group, "loop_enabled");
            var totSamples = engine.getValue(group, "track_samples");
            switch (btnIdx) {
                case 1:
                    if (isLoopActive) { var startPos = engine.getValue(group, "loop_start_position"); if (startPos !== -1 && totSamples > 0) engine.setValue(group, "playposition", startPos / totSamples); } 
                    else { engine.setValue(group, "loop_in", 1); engine.setValue(group, "loop_in", 0); }
                    break;
                case 2:
                    if (isLoopActive) { var endPos = engine.getValue(group, "loop_end_position"); if (endPos !== -1 && totSamples > 0) engine.setValue(group, "playposition", endPos / totSamples); } 
                    else { engine.setValue(group, "loop_out", 1); engine.setValue(group, "loop_out", 0); if (engine.getValue(group, "loop_start_position") !== -1) engine.setValue(group, "loop_enabled", 1); }
                    break;
                case 3:
                    NumarkNS6.isProcessingHarmonic[deckNum] = true;
                    engine.setValue(group, "sync_key", 1);
                    midi.sendShortMsg(0xB0 + deckNum, 0x1B, 0x01);
                    engine.beginTimer(300, function () {
                        NumarkNS6.isProcessingHarmonic[deckNum] = false;
                        NumarkNS6.harmonicSyncActive[deckNum] = true;
                        NumarkNS6.updateAutoLoopLEDs(deckNum);
                    }, true);
                    return; 
                case 4:
                    engine.setValue(group, "reloop_exit", 1); engine.setValue(group, "reloop_exit", 0);
                    break;
            }
        }
        NumarkNS6.updateAutoLoopLEDs(deckNum);
    }
};

// =======================================================
// 8. SENSOR DA BARRA DE BUSCA (TOUCH STRIP INPUT)
// =======================================================
NumarkNS6.touchStripInput = function (channel, control, value, status, group) {
    var position = value / 127.0;
    engine.setValue(group, "playposition", position);
};

// =======================================================
// 9. BOTÃO TAP
// =======================================================
NumarkNS6.tapButtonInput = function (channel, control, value, status, group) {
    if (value === 0) return; 
    script.triggerControl(group, "bpm_tap", 1);
    var deckNum = script.deckFromGroup(group);
    midi.sendShortMsg(0xB0 + deckNum, 0x17, 0x7F);
    engine.beginTimer(100, function() {
        midi.sendShortMsg(0xB0 + deckNum, 0x17, 0x00);
    }, true);
};

// ==========================================
// 🎛️ MÓDULO DE EFEITOS DINÂMICO
// ==========================================
NumarkNS6.FX = {};

NumarkNS6.FX.updateLEDs = function() {
    var shiftL = (NumarkNS6.Decks[1].shiftButton.state || NumarkNS6.Decks[3].shiftButton.state);
    var slotL = shiftL ? "2" : "1";
    var stateL = engine.getValue("[EffectRack1_EffectUnit1_Effect" + slotL + "]", "enabled");
    midi.sendShortMsg(0xB0, 0x17, stateL > 0 ? 0x01 : 0x00);

    var shiftR = (NumarkNS6.Decks[2].shiftButton.state || NumarkNS6.Decks[4].shiftButton.state);
    var slotR = shiftR ? "2" : "1";
    var stateR = engine.getValue("[EffectRack1_EffectUnit2_Effect" + slotR + "]", "enabled");
    midi.sendShortMsg(0xB0, 0x2E, stateR > 0 ? 0x01 : 0x00);
};

NumarkNS6.FX.init = function() {
    NumarkNS6.FX.toggleLeft = new components.Button({
        midi: [0x90, 0x2D],
        input: function (channel, control, value, status, group) {
            var shift = (NumarkNS6.Decks[1].shiftButton.state || NumarkNS6.Decks[3].shiftButton.state);
            var target = "[EffectRack1_EffectUnit1_Effect" + (shift ? "2" : "1") + "]";
            if (value > 0) engine.setValue(target, "enabled", !engine.getValue(target, "enabled"));
        }
    });

    NumarkNS6.FX.toggleRight = new components.Button({
        midi: [0x90, 0x2F],
        input: function (channel, control, value, status, group) {
            var shift = (NumarkNS6.Decks[2].shiftButton.state || NumarkNS6.Decks[4].shiftButton.state);
            var target = "[EffectRack1_EffectUnit2_Effect" + (shift ? "2" : "1") + "]";
            if (value > 0) engine.setValue(target, "enabled", !engine.getValue(target, "enabled"));
        }
    });

    NumarkNS6.FX.mixLeft = new components.Pot({ midi: [0xB0, 0x57], group: "[EffectRack1_EffectUnit1]", key: "mix" });
    NumarkNS6.FX.mixRight = new components.Pot({ midi: [0xB0, 0x59], group: "[EffectRack1_EffectUnit2]", key: "mix" });

    NumarkNS6.FX.selectLeft = new components.Button({
        midi: [0xB0, 0x56],
        group: "[EffectRack1_EffectUnit1_Effect1]",
        input: function(channel, control, value, status, group) {
            var shift = (NumarkNS6.Decks[1].shiftButton.state || NumarkNS6.Decks[3].shiftButton.state);
            var target = "[EffectRack1_EffectUnit1_Effect" + (shift ? "2" : "1") + "]";
            var direction = (value === 0x01 || value < 64) ? 0.05 : -0.05;
            var current = engine.getValue(target, "meta");
            engine.setValue(target, "meta", Math.max(0, Math.min(1, current + direction)));
        }
    });

    NumarkNS6.FX.selectRight = new components.Button({
        midi: [0xB0, 0x58],
        group: "[EffectRack1_EffectUnit2_Effect1]",
        input: function(channel, control, value, status, group) {
            var shift = (NumarkNS6.Decks[2].shiftButton.state || NumarkNS6.Decks[4].shiftButton.state);
            var target = "[EffectRack1_EffectUnit2_Effect" + (shift ? "2" : "1") + "]";
            var direction = (value === 0x01 || value < 64) ? 0.05 : -0.05;
            var current = engine.getValue(target, "meta");
            engine.setValue(target, "meta", Math.max(0, Math.min(1, current + direction)));
        }
    });

    NumarkNS6.FX.encoderLeft = new components.Button({
        midi: [0xB0, 0x5A],
        group: "[EffectRack1_EffectUnit1_Effect1]", 
        input: function(channel, control, value, status, group) {
            var shift = (NumarkNS6.Decks[1].shiftButton.state || NumarkNS6.Decks[3].shiftButton.state);
            var target = "[EffectRack1_EffectUnit1_Effect" + (shift ? "2" : "1") + "]";
            var direction = (value === 0x01 || value < 64) ? 1 : -1;
            engine.setValue(target, "effect_selector", direction);
        }
    });

    NumarkNS6.FX.encoderRight = new components.Button({
        midi: [0xB0, 0x5B],
        group: "[EffectRack1_EffectUnit2_Effect1]", 
        input: function(channel, control, value, status, group) {
            var shift = (NumarkNS6.Decks[2].shiftButton.state || NumarkNS6.Decks[4].shiftButton.state);
            var target = "[EffectRack1_EffectUnit2_Effect" + (shift ? "2" : "1") + "]";
            var direction = (value === 0x01 || value < 64) ? 1 : -1;
            engine.setValue(target, "effect_selector", direction);
        }
    });

    engine.makeConnection("[EffectRack1_EffectUnit1_Effect1]", "enabled", NumarkNS6.FX.updateLEDs);
    engine.makeConnection("[EffectRack1_EffectUnit1_Effect2]", "enabled", NumarkNS6.FX.updateLEDs);
    engine.makeConnection("[EffectRack1_EffectUnit2_Effect1]", "enabled", NumarkNS6.FX.updateLEDs);
    engine.makeConnection("[EffectRack1_EffectUnit2_Effect2]", "enabled", NumarkNS6.FX.updateLEDs);
    
    NumarkNS6.FX.updateLEDs(); 
};

// ==========================================
// 🧭 MATRIZ DE ROTEAMENTO DE EFEITOS
// ==========================================
NumarkNS6.FX.Assign = {};

NumarkNS6.FX.RoutingTable = [
    { note: 0x3D, led: 0x44, unit: 1, target: "[Channel1]" },
    { note: 0x3E, led: 0x45, unit: 2, target: "[Channel1]" },
    { note: 0x3F, led: 0x46, unit: 1, target: "[Channel2]" },
    { note: 0x40, led: 0x47, unit: 2, target: "[Channel2]" },
    { note: 0x41, led: 0x48, unit: 1, target: "[Channel3]" },
    { note: 0x42, led: 0x49, unit: 2, target: "[Channel3]" },
    { note: 0x43, led: 0x4A, unit: 1, target: "[Channel4]" },
    { note: 0x44, led: 0x4B, unit: 2, target: "[Channel4]" },
    { note: 0x45, led: 0x4C, unit: 1, target: "[Master]" },
    { note: 0x46, led: 0x4D, unit: 2, target: "[Master]" }
];

NumarkNS6.FX.initRouting = function() {
    NumarkNS6.FX.RoutingTable.forEach(function(config) {
        var group = "[EffectRack1_EffectUnit" + config.unit + "]";
        var key = "group_" + config.target + "_enable";
        var componentName = "btn_" + config.unit + "_" + config.target.replace(/[\[\]]/g, "");

        NumarkNS6.FX.Assign[componentName] = new components.Button({
            midi: [0x90, config.note],
            group: group,
            key: key,
            input: function (channel, control, value, status, group) {
                if (value > 0) {
                    var currentState = engine.getValue(group, key);
                    engine.setValue(group, key, !currentState);
                }
            }
        });

        engine.makeConnection(group, key, function(value) {
            midi.sendShortMsg(0xB0, config.led, value > 0 ? 0x7F : 0x00);
        }).trigger();
    });
};

NumarkNS6.btnEfeitos = function(ch, ctrl, val) {
    if (val > 0) engine.setValue("[Skin]", "show_effectrack", !engine.getValue("[Skin]", "show_effectrack"));
};

NumarkNS6.btnMixer = function(ch, ctrl, val) {
    if (val > 0) engine.setValue("[Skin]", "show_mixer", !engine.getValue("[Skin]", "show_mixer"));
};

NumarkNS6.btnSamplers = function(ch, ctrl, val) {
    if (val > 0) engine.setValue("[Skin]", "show_samplers", !engine.getValue("[Skin]", "show_samplers"));
};

// ==========================================================
// 🚀 MOTOR DO BPM METER ABSOLUTO
// ==========================================================

NumarkNS6.lastBpmLed = -1;

NumarkNS6.updateBpmMeter = function() {
    var bpm1 = engine.getValue("[Channel1]", "bpm");
    var bpm2 = engine.getValue("[Channel2]", "bpm");

    if (bpm1 <= 0 || bpm2 <= 0) {
        if (NumarkNS6.lastBpmLed !== 0) {
            midi.sendShortMsg(0xB0, 0x36, 0x00);
            NumarkNS6.lastBpmLed = 0;
        }
        return;
    }

    var diff = bpm1 - bpm2;
    var divisor = 0.5; 
    
    var center = 6;
    var ledOffset = Math.round(diff / divisor);
    var ledValue = center + ledOffset;

    if (ledValue < 1) ledValue = 1;
    if (ledValue > 11) ledValue = 11;

    if (ledValue !== NumarkNS6.lastBpmLed) {
        midi.sendShortMsg(0xB0, 0x36, ledValue);
        NumarkNS6.lastBpmLed = ledValue;
    }
};