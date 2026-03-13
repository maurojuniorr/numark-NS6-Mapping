var NumarkNS6 = {};

NumarkNS6.Decks = [];
NumarkNS6.jogMSB = [0, 0, 0, 0, 0];
NumarkNS6.jogLSB = [0, 0, 0, 0, 0];
NumarkNS6.lastJogValue = [-1, -1, -1, -1, -1];
NumarkNS6.lastJogRingValue = [0, 0, 0, 0, 0];

NumarkNS6.harmonicSyncActive = [null, false, false, false, false];
NumarkNS6.isProcessingHarmonic = [null, false, false, false, false];

NumarkNS6.blinkState = 0;
NumarkNS6.blinkTimer = 0;
NumarkNS6.displayTimer = 0;

NumarkNS6.scratchSettings = { 
    "alpha": 1.0/4, 
    "beta": 1.0/4/32, 
    "jogResolution": 3500, 
    "vinylSpeed": 33.33 
};

// =======================================================
// 1. MOTOR VISUAL (LEDs de Estado)
// =======================================================

NumarkNS6.updatePlayCueLEDs = function(deckNum, midiChannel) {
    var group = "[Channel" + deckNum + "]";
    var statusCC = 0xB0 + midiChannel;
    
    if (engine.getValue(group, "track_loaded") === 0) {
        midi.sendShortMsg(statusCC, 0x09, 0x00);
        midi.sendShortMsg(statusCC, 0x08, 0x00);
        return;
    }

    if (engine.getValue(group, "cue_default") > 0) {
        midi.sendShortMsg(statusCC, 0x09, 0x7F); 
        midi.sendShortMsg(statusCC, 0x08, 0x7F); 
        return; 
    } 
    
    if (engine.getValue(group, "play") > 0) {
        midi.sendShortMsg(statusCC, 0x09, 0x7F); 
        midi.sendShortMsg(statusCC, 0x08, 0x00); 
        return;
    } 
        
    var cuePoint = engine.getValue(group, "cue_point");
    var trackSamples = engine.getValue(group, "track_samples");
    var playPos = engine.getValue(group, "playposition");
    var atCuePoint = false;
    
    if (trackSamples > 0 && cuePoint !== -1) {
        if (Math.abs((playPos * trackSamples) - cuePoint) < 5000) atCuePoint = true;
    } else if (playPos <= 0.002) {
        atCuePoint = true; 
    }

    if (atCuePoint) {
        midi.sendShortMsg(statusCC, 0x09, 0x00); 
        midi.sendShortMsg(statusCC, 0x08, 0x7F); 
    } else {
        midi.sendShortMsg(statusCC, 0x09, NumarkNS6.blinkState); 
        midi.sendShortMsg(statusCC, 0x08, NumarkNS6.blinkState); 
    }
};

NumarkNS6.updateSyncLED = function(deckNum, midiChannel) {
    var group = "[Channel" + deckNum + "]";
    if (!engine.getValue(group, "sync_enabled")) {
        midi.sendShortMsg(0xB0 + midiChannel, 0x07, 0x00);
        return;
    }
    var isPlaying = engine.getValue(group, "play");
    var beatActive = engine.getValue(group, "beat_active");
    midi.sendShortMsg(0xB0 + midiChannel, 0x07, isPlaying ? (beatActive ? 0x7F : 0x00) : 0x7F);
};

NumarkNS6.updateReverseLED = function(deckNum) {
    if (!NumarkNS6.Decks[deckNum]) return;
    var isReverse = engine.getValue("[Channel" + deckNum + "]", "reverse");
    midi.sendShortMsg(0xB0 + NumarkNS6.Decks[deckNum].midiChannel, 0x16, isReverse ? 0x01 : 0x00);
};

// =======================================================
// 2. MOTOR DO PRATO (Matemática Clássica e Segura)
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

    // Matemática original restaurada (Livre de bugs do QtScript)
    var currentSecs = playPos * duration;
    var revsPerSec = 33.33333 / 60.0;
    var currentRev = currentSecs * revsPerSec;
    var revFraction = currentRev - Math.floor(currentRev);

    // Multiplica pelos 21 LEDs
    var ledIndex = Math.floor(revFraction * 21) + 1;

    // TRAVA DE SEGURANÇA
    if (ledIndex > 21) ledIndex = 21;
    if (ledIndex < 1) ledIndex = 1;

    var finalValue = ledIndex;

    // Alerta de fim de música (Pisca ou fica Vermelho)
    var timeRemaining = duration - currentSecs;
    if (duration > 0 && timeRemaining <= NumarkNS6.warnAfterTime) {
        if (NumarkNS6.blinkState === 0) {
            finalValue = 0x00;
        } else {
            finalValue = ledIndex + 0x40; // 64 (0x40) acende a luz vermelha
        }
    }

    // Só envia se mudar
    if (NumarkNS6.lastJogRingValue[deckNum] !== finalValue) {
        midi.sendShortMsg(0xB0 + mChan, 0x3A, finalValue);
        NumarkNS6.lastJogRingValue[deckNum] = finalValue;
    }
};

// =======================================================
// 3. GESTÃO DE TIMERS (Igualado ao Serato)
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
        // 🔥 O SEGREDO ESTÁ AQUI: 100ms em vez de 40ms.
        // Dá tempo para o hardware da Numark desligar o LED anterior!
        NumarkNS6.displayTimer = engine.beginTimer(100, function () {
            for (var i = 1; i <= 4; i++) {
                if (NumarkNS6.Decks[i]) {
                    NumarkNS6.updateJogRing(i);
                }
            }
        });
    }
};

// =======================================================
// 4. CONFIGURAÇÕES GERAIS E INICIALIZAÇÃO
// =======================================================

NumarkNS6.searchAmplification = 5; 
NumarkNS6.warnAfterTime = 30; 
NumarkNS6.blinkInterval = 1000; 
NumarkNS6.encoderResolution = 0.05; 
NumarkNS6.resetHotCuePageOnTrackLoad = true; 
NumarkNS6.cueReverseRoll = true; 
NumarkNS6.hotcuePageIndexBehavior = true;
NumarkNS6.rateRanges = [0, 0.06, 0.24];
NumarkNS6.QueryStatusMessage = [0xF0, 0x00, 0x01, 0x3F, 0x7F, 0x47, 0x60, 0x00, 0x01, 0x54, 0x01, 0x00, 0x00, 0x00, 0x00, 0xF7];
NumarkNS6.globalShift = false;

NumarkNS6.scratchXFader = {
    xFaderMode: 0, 
    xFaderCurve: 999.60,
    xFaderCalibration: 1.0
};

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
    midi.sendSysexMsg(NumarkNS6.QueryStatusMessage, NumarkNS6.QueryStatusMessage.length);
    NumarkNS6.rateRanges[0] = engine.getValue("[Channel1]", "rateRange");

    NumarkNS6.Decks = [];
    for (var i = 1; i <= 4; i++) {
        NumarkNS6.Decks[i] = new NumarkNS6.Deck(i);
        
        (function (dIdx) {
            var g = "[Channel" + dIdx + "]";
            var mChan = NumarkNS6.Decks[dIdx].midiChannel;
            
            engine.makeConnection(g, "play", function () { 
                NumarkNS6.updatePlayCueLEDs(dIdx, mChan);
                NumarkNS6.updateSyncLED(dIdx, mChan); 
            });
            engine.makeConnection(g, "sync_enabled", function () { NumarkNS6.updateSyncLED(dIdx, mChan); });
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
};

// =======================================================
// 5. ESTRUTURA DOS CONTAINERS E DECKS
// =======================================================

NumarkNS6.topContainer = function (channel) {
    this.group = "[Channel" + channel + "]";
    var theContainer = this;
    var dChan = channel; 

    for (var i = 1; i <= 5; i++) {
        this["hotCue" + i] = new components.Button({
            midi: [0x90 + channel, 0x12 + i, 0xB0 + channel, 0x0A + i], 
            number: i,
            group: theContainer.group, 
            type: components.Button.prototype.types.push,
            shift: function() {
                this.inKey = "hotcue_" + this.number + "_clear"; 
                if (engine.getValue(this.group, "hotcue_" + this.number + "_position") !== -1) midi.sendShortMsg(this.midi[2], this.midi[3], 0x01); 
            },
            unshift: function() {
                this.inKey = "hotcue_" + this.number + "_activate"; 
                if (engine.getValue(this.group, "hotcue_" + this.number + "_position") !== -1) midi.sendShortMsg(this.midi[2], this.midi[3], 0x7F); 
            }
        });

        (function(btn, grp, num) {
            engine.makeConnection(grp, "hotcue_" + num + "_position", function(value) {
                if (value === -1) midi.sendShortMsg(btn.midi[2], btn.midi[3], 0x00); 
                else midi.sendShortMsg(btn.midi[2], btn.midi[3], 0x7F); 
            });
        })(this["hotCue" + i], theContainer.group, i);
    }

    this.encFxParam1 = new components.Encoder({
        midi: [0xB0+channel, 0x57], group: "[EffectRack1_EffectUnit1]",
        shift: function() { this.inKey="mix"; }, unshift: function() { this.inKey="super1"; }
    });
    
    this.encFxParam2 = new components.Encoder({
        midi: [0xB0+channel, 0x58], group: "[EffectRack1_EffectUnit2]",
        shift: function() { this.inKey="mix"; }, unshift: function() { this.inKey="super1"; }
    });
    
    this.encSample3 = new components.Encoder({
        midi: [0xB0+channel, 0x5A], hotCuePage: 0,
        applyHotcuePage: function(layer, displayFeedback) {
            if (displayFeedback === undefined) displayFeedback = true;
            layer = NumarkNS6.hotcuePageIndexBehavior ? (layer+4)%4 : Math.max(Math.min(layer, 3), 0); 
            this.hotCuePage = layer;
            if (this.timer !== 0) { engine.stopTimer(this.timer); this.timer = 0; }
            if (displayFeedback) {
                for (var i=0; i<4; ++i) midi.sendShortMsg(0xB0+channel, 0x0B+i, (i-this.hotCuePage)?0x00:0x7F);
            }
            this.timer = engine.beginTimer(1000, function() { theContainer.reconnectComponents(); }, true);
        },
        shift: function() {
            this.group=theContainer.group;
            this.input = function(_c, _ctrl, value) {
                if (value === 0x01) engine.setParameter(this.group, "loop_double", 1);
                else engine.setParameter(this.group, "loop_halve", 1);
            };
        },
        unshift: function() {
            this.input = function(_c, _ctrl, value) {
                this.applyHotcuePage(this.hotCuePage+(value===0x01?1:-1));
            };
        }
    });
    
    this.encSample4 = new components.Encoder({
        midi: [0xB0+channel, 0x59],
        shift: function() {
            this.inKey="beatjump_size";
            this.input = function(_c, _ctrl, value) { this.inSetValue(this.inGetValue() * (value===0x01 ? 2 : 0.5)); };
        },
        unshift: function() {
            this.input = function(_c, _ctrl, value) { script.triggerControl(this.group, (value===1)?"beatjump_forward":"beatjump_backward"); };
        }
    });
    
    this.shutdown = function() {
        for (var i = 1; i <= 5; i++) midi.sendShortMsg(0xB0 + dChan, 0x0A + i, 0x00);
    };

    if (NumarkNS6.resetHotCuePageOnTrackLoad) {
        engine.makeConnection(this.group, "track_loaded", function() { theContainer.encSample3.applyHotcuePage(0, false); });
    }
};
NumarkNS6.topContainer.prototype = new components.ComponentContainer();

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
        midi: [0xB0, 0x44], group: "[Library]", stepsize: 1,
        shift: function() { this.inKey="MoveFocus"; }, unshift: function() { this.inKey="MoveVertical"; },
        input: function(_c, _ctrl, value) { this.inSetValue(value===0x01?this.stepsize:-this.stepsize); }
    });
    this.navigationEncoderButton = new components.Button({
        shift: function() { this.type=components.Button.prototype.types.toggle; this.group="[Skin]"; this.inKey="show_maximized_library"; },
        unshift: function() { this.type=components.Button.prototype.types.push; this.group="[Library]"; this.inKey="GoToItem"; }
    });
};
NumarkNS6.MixerTemplate.prototype = new components.ComponentContainer();

NumarkNS6.Deck = function(channel) {
    components.Deck.call(this, channel);
    var groupName = "[Channel" + channel + "]";
    this.deckNum = channel;
    this.midiChannel = channel;
    this.group = groupName;
    this.rateRangeEntry = 0;
    var theDeck = this;
    
    this.gridSlipMode = false;
    this.gridAdjustMode = false;
    this.skipMode = false; 
    this.scratchMode = true; 
    this.isSearching = false;

    this.topContainer = new NumarkNS6.topContainer(channel);
    this.topContainer.reconnectComponents(function (component) { if (component.group === undefined) component.group = this.group; }.bind(this));
    
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

    this.playButton = new components.PlayButton({
        midi: [0x90 + channel, 0x11, 0xB0 + channel, 0x09], group: groupName, outKey: null,
        input: function () { components.PlayButton.prototype.input.apply(this, arguments); NumarkNS6.updatePlayCueLEDs(theDeck.deckNum, theDeck.midiChannel); }
    });

    this.cueButton = new components.CueButton({ midi: [0x90 + channel, 0x10, 0xB0 + channel, 0x08], group: groupName, outKey: null, reverseRollOnShift: NumarkNS6.cueReverseRoll });
    this.syncButton = new components.SyncButton({ midi: [0x90 + channel, 0x0F], group: groupName, outKey: null });
    
    this.shiftButton = new components.Button({
        midi: [0x90 + channel, 0x12, 0xB0 + channel, 0x0A], type: components.Button.prototype.types.powerWindow, state: false,
        inToggle: function () {
            this.state = !this.state;
            if (this.state) { theDeck.shift(); NumarkNS6.Mixer.shift(); } else { theDeck.unshift(); NumarkNS6.Mixer.unshift(); }
            this.output(this.state);
            theDeck.topContainer.reconnectComponents(function(c) { if (c.group === undefined) c.group = this.group; }.bind(this));
        }
    });

    this.gridSetClearInput = function(ch, ctrl, value, status, grp) {
        if (value > 0) { 
            if (theDeck.shiftButton.state) {
                engine.setValue(grp, "beats_translate_earlier", 1);
                engine.beginTimer(100, function() { engine.setValue(grp, "beats_translate_earlier", 0); }, true);
            } else {
                engine.setValue(grp, "beats_translate_curpos", 1);
                engine.beginTimer(100, function() { engine.setValue(grp, "beats_translate_curpos", 0); }, true);
            }
        }
    };

    this.gridSlipAdjustInput = function(ch, ctrl, value, status, grp) {
        if (value > 0) {
            if (theDeck.shiftButton.state) {
                engine.setValue(grp, "beats_translate_later", 1);
                engine.beginTimer(100, function() { engine.setValue(grp, "beats_translate_later", 0); }, true);
                theDeck.gridSlipMode = false; 
            } else {
                theDeck.gridSlipMode = true;
            }
        } else {
            theDeck.gridSlipMode = false;
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

    this.loadButton = new components.Button({ midi: [0x90+channel, 0x06], shift: function() { this.inKey="eject"; }, unshift: function() { this.inKey="LoadSelectedTrack"; } });

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
        shift: function() { 
            this.inkey = "rate_temp_down_small"; 
        }, 
        unshift: function() { 
            this.inkey = "rate_temp_down"; 
        } 
    });
    this.pitchBendPlus = new components.Button({ midi: [0x90+channel, 0x19, 0xB0+channel, 0x3C], key: "rate_temp_up", shift: function() { this.inkey = "rate_temp_up_small"; }, unshift: function() { this.inkey = "rate_temp_up"; } });
    this.keylockButton = new components.Button({ midi: [0x90+channel, 0x1B, 0xB0+channel, 0x10], type: components.Button.prototype.types.toggle, shift: function() { this.inKey="sync_key"; this.outKey="sync_key"; }, unshift: function() { this.inKey="keylock"; this.outKey="keylock"; } });
    this.bpmSlider = new components.Pot({ midi: [0xB0+channel, 0x01, 0xB0+channel, 0x37], inKey: "rate", group: theDeck.group, invert: true });
    
    this.pitchLedHandler = engine.makeConnection(this.group, "rate", function(value) { midi.sendShortMsg(0xB0+channel, 0x37, value===0 ? 0x7F : 0x00); }.bind(this));
    this.pitchLedHandler.trigger();

    this.pitchRange = new components.Button({
        midi: [0x90+channel, 0x1A, 0xB0+channel, 0x1E], key: "rateRange", ledState: false,
        input: function() {
            if (theDeck.rateRangeEntry===NumarkNS6.rateRanges.length) theDeck.rateRangeEntry=0;
            this.inSetValue(NumarkNS6.rateRanges[theDeck.rateRangeEntry++]);
        },
        output: function() { this.send(this.ledState); this.ledState=!this.ledState; }
    });

    this.tapButton = new components.Button({
        midi: [0x90+channel, 0x1E, 0xB0+channel, 0x16],
        input: function(c, ctrl, val, s, grp) {
            if (val > 0) {
                script.triggerControl(theDeck.group, "bpm_tap", 1);
                midi.sendShortMsg(0xB0 + channel, 0x17, 0x7F);
                engine.beginTimer(100, function() { midi.sendShortMsg(0xB0 + channel, 0x17, 0x00); }, true);
            }
        },
    });

    this.reconnectComponents(function(c) { if (c.group === undefined || c.group === "") c.group = groupName; });
    this.shutdown = function() {
        this.topContainer.shutdown();
        this.pitchLedHandler.disconnect();
        midi.sendShortMsg(0xB0+channel, 0x37, 0); 
        this.pitchRange.send(0); this.keylockButton.send(0); this.syncButton.send(0);
        this.pitchBendPlus.send(0); this.pitchBendMinus.send(0); this.cueButton.send(0);
        this.playButton.send(0); this.shiftButton.send(0); this.tapButton.send(0);
        if (theDeck.blinkTimer !== 0) engine.stopTimer(theDeck.blinkTimer);
        midi.sendShortMsg(0xB0, 0x1D + channel, 0); 
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
// 7. FUNÇÕES DE PROCESSAMENTO DO JOG / PERFORMANCE
// =======================================================

NumarkNS6.jogMove14bit = function(channel, control, value, status, group) {
    var deckNum = script.deckFromGroup(group);
    if (control === 0x00) NumarkNS6.jogMSB[deckNum] = value;
    if (control === 0x20) NumarkNS6.jogLSB[deckNum] = value;
    if (control !== 0x20) return;

    var fullValue = (NumarkNS6.jogMSB[deckNum] << 7) | NumarkNS6.jogLSB[deckNum];
    if (NumarkNS6.lastJogValue[deckNum] === -1) { NumarkNS6.lastJogValue[deckNum] = fullValue; return; }

    var delta = fullValue - NumarkNS6.lastJogValue[deckNum];
    NumarkNS6.lastJogValue[deckNum] = fullValue;
    
    if (delta > 8192) delta -= 16384; else if (delta < -8192) delta += 16384;

    var deck = NumarkNS6.Decks[deckNum];
    if (!deck) return;

    if (deck.skipMode) {
        if (deck.skipAccumulator === undefined) deck.skipAccumulator = 0;
        deck.skipAccumulator += delta;
        var skipSensitivity = 30; 
        if (deck.skipAccumulator > skipSensitivity) { engine.setValue(group, "beatjump_1_forward", 1); deck.skipAccumulator = 0; }
        else if (deck.skipAccumulator < -skipSensitivity) { engine.setValue(group, "beatjump_1_backward", 1); deck.skipAccumulator = 0; }
        return; 
    }

    if (deck.gridSlipMode) { var slipCmd = (delta > 0) ? "beats_translate_later" : "beats_translate_earlier"; engine.setValue(group, slipCmd, 1); engine.setValue(group, slipCmd, 0); return; }
    if (deck.gridAdjustMode) { var adjustCmd = (delta > 0) ? "beats_adjust_slower" : "beats_adjust_faster"; engine.setValue(group, adjustCmd, 1); engine.setValue(group, adjustCmd, 0); return; }

    if (engine.isScratching(deckNum)) engine.scratchTick(deckNum, delta);
    else engine.setValue(group, "jog", delta / 15);
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
    if (value === 0) return; 
    var currentState = engine.getValue(group, "reverse");
    engine.setValue(group, "reverse", !currentState);
    NumarkNS6.updateReverseLED(script.deckFromGroup(group));
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
    var currentSize = engine.getValue(group, "beatloop_size");

    if (isAuto) {
        midi.sendShortMsg(0xB0 + deckNum, 0x19, (isEnabled && currentSize === 1) ? 0x01 : 0x00);
        midi.sendShortMsg(0xB0 + deckNum, 0x1A, (isEnabled && currentSize === 2) ? 0x01 : 0x00);
        midi.sendShortMsg(0xB0 + deckNum, 0x1B, (isEnabled && currentSize === 4) ? 0x01 : 0x00);
        midi.sendShortMsg(0xB0 + deckNum, 0x1C, (isEnabled && currentSize === 8) ? 0x01 : 0x00);
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

NumarkNS6.loopOnOffInput = function (ch, ctrl, val, st, grp) { if (val > 0) engine.setValue(grp, "loop_enabled", engine.getValue(grp, "loop_enabled") ? 0 : 1); };

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