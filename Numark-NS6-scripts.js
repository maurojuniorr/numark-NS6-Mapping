var NumarkNS6 = {};

// =======================================================
// 🛡️ VARIÁVEIS GLOBAIS E BLINDAGEM DE SISTEMA
// =======================================================
NumarkNS6.isBooting = true; // Escudo ativado na partida!
NumarkNS6.animTimer = 0;
NumarkNS6.parachuteTimer = 0;
NumarkNS6.blinkTimer = 0;
NumarkNS6.displayTimer = 0;

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
// Dicionário de alta velocidade para evitar Regex no Jog Wheel
NumarkNS6.groupToDeck = { "[Channel1]": 1, "[Channel2]": 2, "[Channel3]": 3, "[Channel4]": 4 };

NumarkNS6.blinkState = 0;
NumarkNS6.warnAfterTime = 60; 
NumarkNS6.blinkInterval = 1000; 
NumarkNS6.encoderResolution = 0.05; 
NumarkNS6.resetHotCuePageOnTrackLoad = true; 
NumarkNS6.cueReverseRoll = true; 
NumarkNS6.hotcuePageIndexBehavior = true;

NumarkNS6.scratchSettings = { "alpha": 1.0/8, "beta": (1.0/8)/32, "jogResolution": 2048, "vinylSpeed": 33.33 };
NumarkNS6.pitchBendSensitivity = 5; // Quanto menor, mais rápido ele empurra a batida
NumarkNS6.SysExInit1 = [0xF0, 0x00, 0x01, 0x3F, 0x7F, 0x79, 0x50, 0x00, 0x10, 0x04, 0x01, 0x00, 0x00, 0x00, 0x04, 0x04, 0x0E, 0x0F, 0x00, 0x00, 0x0E, 0x05, 0x0F, 0x04, 0x0C, 0x06, 0x0B, 0x0F, 0x0D, 0x0C, 0xF7];
NumarkNS6.SysExInit2 = [0xF0, 0x00, 0x01, 0x3F, 0x7F, 0x79, 0x60, 0x00, 0x01, 0x49, 0x01, 0x00, 0x00, 0x00, 0x00, 0xF7];

NumarkNS6.scratchXFader = { xFaderMode: 0, xFaderCurve: 999.60, xFaderCalibration: 1.0 };


// =======================================================
// 🚥 MOTOR VISUAL (Luzes de Estado de Play, Cue e Sync)
// =======================================================

NumarkNS6.updatePlayCueLEDs = function(deckNum, midiChannel) {
    if (NumarkNS6.isBooting) return; // 🛡️ Bloqueia durante a animação
   // var group = "[Channel" + deckNum + "]";
    
    var deck = NumarkNS6.Decks[deckNum];
    if (!deck) return;
    var group = deck.group;
    var statusCC = 0xB0 + midiChannel;

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
        if (isIntroActivating) midi.sendShortMsg(statusCC, 0x08, 0x7F);
        else if (isPlaying) midi.sendShortMsg(statusCC, 0x08, 0x00);
        else {
            var atIntro = false, introStartPos = engine.getValue(group, "intro_start_position");
            var trackSamples = engine.getValue(group, "track_samples"), playPos = engine.getValue(group, "playposition");
            if (trackSamples > 0 && introStartPos !== -1) if (Math.abs((playPos * trackSamples) - introStartPos) < 5000) atIntro = true;
            midi.sendShortMsg(statusCC, 0x08, atIntro ? 0x7F : 0x00);
        }
        return; 
    }

    midi.sendShortMsg(statusCC, 0x09, isPlaying ? 0x7F : NumarkNS6.blinkState);
    if (isCueing) midi.sendShortMsg(statusCC, 0x08, 0x7F);
    else if (isPlaying) midi.sendShortMsg(statusCC, 0x08, 0x00);
    else {
        var atCue = false, playPos = engine.getValue(group, "playposition");
        var cuePoint = engine.getValue(group, "cue_point"), trackSamples = engine.getValue(group, "track_samples");
        if (trackSamples > 0 && cuePoint !== -1) { if (Math.abs((playPos * trackSamples) - cuePoint) < 5000) atCue = true; } 
        else if (playPos <= 0.005) atCue = true;
        midi.sendShortMsg(statusCC, 0x08, atCue ? 0x7F : NumarkNS6.blinkState);
    }
};

NumarkNS6.updateSyncLED = function(deckNum, midiChannel) {
    if (NumarkNS6.isBooting) return; 
    var group = "[Channel" + deckNum + "]";
    var deck = NumarkNS6.Decks[deckNum];
    if (!deck) return;

    if (deck.shiftButton && deck.shiftButton.state) {
        midi.sendShortMsg(0xB0 + midiChannel, 0x07, engine.getValue(group, "quantize") > 0 ? 0x7F : 0x00);
        return;
    }
    if (!engine.getValue(group, "sync_enabled")) { midi.sendShortMsg(0xB0 + midiChannel, 0x07, 0x00); return; }
    
    var isPlaying = engine.getValue(group, "play") > 0, beatActive = engine.getValue(group, "beat_active") > 0;
    midi.sendShortMsg(0xB0 + midiChannel, 0x07, isPlaying ? (beatActive ? 0x7F : 0x00) : 0x7F);
};

NumarkNS6.updateReverseLED = function(deckNum) {
    if (NumarkNS6.isBooting || !NumarkNS6.Decks[deckNum]) return;
    midi.sendShortMsg(0xB0 + NumarkNS6.Decks[deckNum].midiChannel, 0x16, engine.getValue("[Channel" + deckNum + "]", "reverse") ? 0x01 : 0x00);
};


// =======================================================
// 💿 MOTOR DO PRATO E STRIP SEARCH (Giro do anel LED)
// =======================================================

NumarkNS6.updateJogRing = function (deckNum) {
    if (NumarkNS6.isBooting || !NumarkNS6.Decks[deckNum]) return;

    // 1. Declaramos o 'deck' para o JavaScript saber com quem está falando
    var deck = NumarkNS6.Decks[deckNum]; 
    
    // 2. Pegamos as variáveis já cacheadas direto da memória
    var group = deck.group; 
    var mChan = deck.midiChannel;

    var duration = engine.getValue(group, "duration");
    var playPos = engine.getValue(group, "playposition");

    if (duration <= 0 || engine.getValue(group, "track_loaded") === 0) {
        if (NumarkNS6.lastJogRingValue[deckNum] !== 0) { 
            midi.sendShortMsg(0xB0 + mChan, 0x3A, 0x00); 
            NumarkNS6.lastJogRingValue[deckNum] = 0; 
        }
        return;
    }
    
    // 3. OTIMIZAÇÃO: Trocamos o Math.floor() pelo Bitwise OR (| 0) para poupar CPU
    var calc = (((playPos * duration) / 1.8) % 1 * 21) | 0;
    var ledIndex = Math.max(1, Math.min(21, calc + 1));
    
    var finalValue = (duration - (playPos * duration) <= NumarkNS6.warnAfterTime) ? (NumarkNS6.blinkState === 0 ? 0x00 : (ledIndex + 0x40)) : ledIndex;

    if (NumarkNS6.lastJogRingValue[deckNum] !== finalValue) {
        midi.sendShortMsg(0xB0 + mChan, 0x3A, finalValue);
        NumarkNS6.lastJogRingValue[deckNum] = finalValue;
    }
};

NumarkNS6.updateTouchStrip = function (value, group) {
    if (NumarkNS6.isBooting) return;
    var deckNum = script.deckFromGroup(group);
    if (!NumarkNS6.Decks[deckNum]) return;
    
    var ledValue = Math.min(15, Math.floor(value * 14) + 1);
    if (engine.getValue(group, "track_loaded") === 0) ledValue = 0;
    
    if (NumarkNS6.lastTouchStripValue[deckNum] === ledValue) return;
    NumarkNS6.lastTouchStripValue[deckNum] = ledValue;
    midi.sendShortMsg(0xB0 + NumarkNS6.Decks[deckNum].midiChannel, 0x4E, ledValue);
};


// =======================================================
// ⏱️ GESTÃO DE TIMERS (Coração do Mapeamento)
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
// ⚙️ CLASSES BASES DE COMPONENTES MIDI
// =======================================================

components.Encoder.prototype.input = function (_c, _ctrl, value) { this.inSetParameter(this.inGetParameter() + ((value === 0x01) ? NumarkNS6.encoderResolution : -NumarkNS6.encoderResolution)); };
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
NumarkNS6.CrossfaderChangeCallback = function (value, group, control) { this.changed = true; NumarkNS6.storedCrossfaderParams[control] = value; };


// =======================================================
// 🚀 INIT PADRÃO FIFA (AGORA COM APAGÃO DE NOTAS)
// =======================================================

NumarkNS6.init = function () {
    NumarkNS6.isBooting = true; // Escudo Levantado!

    midi.sendSysexMsg(NumarkNS6.SysExInit1, NumarkNS6.SysExInit1.length);
    midi.sendSysexMsg(NumarkNS6.SysExInit2, NumarkNS6.SysExInit2.length);

    
    // Tiro de misericórdia garantido nos Layers
    midi.sendShortMsg(0x80, 0x31, 0x00); 
    midi.sendShortMsg(0x80, 0x32, 0x00); 
    midi.sendShortMsg(0x80, 0x33, 0x00); 
    midi.sendShortMsg(0x80, 0x34, 0x00); 

    NumarkNS6.Decks = [];
    for (var i = 1; i <= 4; i++) {
        NumarkNS6.Decks[i] = new NumarkNS6.Deck(i);
        (function (dIdx) {
            var g = "[Channel" + dIdx + "]";
            var mChan = NumarkNS6.Decks[dIdx].midiChannel;
            
            engine.makeConnection(g, "play", function () { NumarkNS6.updatePlayCueLEDs(dIdx, mChan); });
            engine.makeConnection(g, "sync_enabled", function () { NumarkNS6.updateSyncLED(dIdx, mChan); });
            engine.makeConnection(g, "quantize", function () { NumarkNS6.updateSyncLED(dIdx, mChan); });
            engine.makeConnection(g, "beat_active", function () { NumarkNS6.updateSyncLED(dIdx, mChan); });
            engine.makeConnection(g, "track_loaded", function (v) { 
                if (v > 0) { 
                    NumarkNS6.updatePlayCueLEDs(dIdx, mChan); 
                    NumarkNS6.updateAutoLoopLEDs(dIdx); 
                    NumarkNS6.updateBpmMeter();
                
                }
            });
            engine.makeConnection(g, "loop_enabled", function (v) { 
                if (!NumarkNS6.isBooting) midi.sendShortMsg(0xB0 + dIdx, 0x15, v ? 0x7F : 0x00); 
                NumarkNS6.updateAutoLoopLEDs(dIdx);
            });
        })(i);
    }

    // Agora o Mixxx avisa a régua de LED se QUALQUER um dos 4 decks sofrer alteração de pitch/bpm
    engine.makeConnection("[Channel1]", "bpm", NumarkNS6.updateBpmMeter);
    engine.makeConnection("[Channel2]", "bpm", NumarkNS6.updateBpmMeter);
    engine.makeConnection("[Channel3]", "bpm", NumarkNS6.updateBpmMeter);
    engine.makeConnection("[Channel4]", "bpm", NumarkNS6.updateBpmMeter);
    
    Object.keys(NumarkNS6.scratchXFader).forEach(function (control) {
        var connectionObject = engine.makeConnection("[Mixer Profile]", control, NumarkNS6.CrossfaderChangeCallback.bind(this));
        connectionObject.trigger();
        NumarkNS6.crossfaderCallbackConnections.push(connectionObject);
    }.bind(this));

    NumarkNS6.FX.RoutingTable.forEach(function (cfg) {
        engine.setValue("[EffectRack1_EffectUnit" + cfg.unit + "]", "group_" + cfg.target + "_enable", 0); 
    });

    NumarkNS6.Mixer = new NumarkNS6.MixerTemplate();
    NumarkNS6.FX.init();
    NumarkNS6.FX.initRouting(); 
    
    NumarkNS6.bootAnimation();
    print("Numark NS6: Inicialização escura com bloqueio de notas. Lançando animação...");
};

// =======================================================
// 🎇 VEGAS MODE: ANIMAÇÃO BLINDADA COM SUPRESSÃO ATIVA
// =======================================================

// =======================================================
// 🎇 VEGAS MODE: ANIMAÇÃO BLINDADA COM SUPRESSÃO ATIVA
// =======================================================

NumarkNS6.bootAnimation = function () {
    var step = 0;
    
    NumarkNS6.animTimer = engine.beginTimer(50, function () {
        step++;
        
        // 🛡️ SUPRESSÃO ATIVA: Enquanto tiver show, cala a boca do Layer e do Auto Loop!
        midi.sendShortMsg(0x80, 0x31, 0x00); midi.sendShortMsg(0x80, 0x32, 0x00); 
        midi.sendShortMsg(0x80, 0x33, 0x00); midi.sendShortMsg(0x80, 0x34, 0x00);
        for (var d = 1; d <= 4; d++) midi.sendShortMsg(0xB0 + d, 0x18, 0x00);

        if (step > 30) {
            engine.stopTimer(NumarkNS6.animTimer);
            NumarkNS6.animTimer = 0;
            return;
        }
        for (var i = 1; i <= 4; i++) {
            var deck = NumarkNS6.Decks[i];
            if (!deck) continue;
            var cc = 0xB0 + deck.midiChannel;
            
            var stripVal = (step <= 15) ? step : (30 - step);
            if (stripVal >= 1 && stripVal <= 15) midi.sendShortMsg(cc, 0x4E, stripVal);
            
            midi.sendShortMsg(cc, 0x3A, Math.min(21, step));
            
            if (step % 3 === 0) {
                var cueIndex = Math.floor(step / 3);
                if (cueIndex >= 1 && cueIndex <= 5) midi.sendShortMsg(cc, 0x0A + cueIndex, 0x7F);
            }
        }
    });

    NumarkNS6.parachuteTimer = engine.beginTimer(1600, function () {
        NumarkNS6.isBooting = false; 
        NumarkNS6.parachuteTimer = 0;

        for (var d = 1; d <= 4; d++) {
            if (!NumarkNS6.Decks[d]) continue;
            var mChan = NumarkNS6.Decks[d].midiChannel;
            
            midi.sendShortMsg(0xB0 + mChan, 0x4E, 0x00); 
            midi.sendShortMsg(0xB0 + mChan, 0x3A, 0x00); 
            for (var h = 1; h <= 5; h++) midi.sendShortMsg(0xB0 + mChan, 0x0A + h, 0x00); 
            
            for (var hc = 1; hc <= 5; hc++) {
                if (engine.getValue("[Channel" + d + "]", "hotcue_" + hc + "_position") !== -1) {
                    midi.sendShortMsg(0xB0 + mChan, 0x0A + hc, 0x7F);
                }
            }
            NumarkNS6.updatePlayCueLEDs(d, mChan);
            NumarkNS6.updateSyncLED(d, mChan);
        }
        NumarkNS6.updateBpmMeter();

        // 3. 🎭 O ATRASO DRAMÁTICO (O Grande Despertar Real)
        engine.beginTimer(300, function() {
            
            // Reacende os Layers
            midi.sendShortMsg(0xB0, 0x50, 0x00); 
            midi.sendShortMsg(0xB0, 0x51, 0x00);

            for (var dIdx = 1; dIdx <= 4; dIdx++) {
                if (!NumarkNS6.Decks[dIdx]) continue;
                var mc = NumarkNS6.Decks[dIdx].midiChannel;
                
                // 1. Liga o sensor de toque do hardware
                midi.sendShortMsg(0xB0 + mc, 0x3B, 0x01); 
                // 2. Acende o LED do Loop
                midi.sendShortMsg(0xB0 + dIdx, 0x18, NumarkNS6.deckLoopMode[dIdx] ? 0x01 : 0x02); 
                
                // 🎯 3. Acende o LED do Scratch corretamente no 0x12!
                midi.sendShortMsg(0xB0 + mc, 0x12, 0x7F); 
                NumarkNS6.Decks[dIdx].scratchMode = true;
            }

            NumarkNS6.startTimers(); 
            print("Numark NS6: Acendimento sincronizado! A pista é sua!");
        }, true);

    }, true);
};

// =======================================================
// 🎚️ ESTRUTURA DO MIXER E CONTAINERS GERAIS
// =======================================================

// Variáveis globais para a régua de BPM saber quem está visível
NumarkNS6.leftDeck = 1;
NumarkNS6.rightDeck = 2;

NumarkNS6.MixerTemplate = function() {
    
    // 🎧 Botões de Layer (Deck Change) com rastreamento para o BPM Meter
    this.deckChangeL = new components.Button({ 
        midi: [0xB0, 0x50], 
        input: function(_c, _ctrl, value) { 
            this.output(value); // Acende/Apaga o LED
            NumarkNS6.leftDeck = (value > 0) ? 3 : 1; // Se apertou, estamos no Deck 3. Senão, 1.
            if (typeof NumarkNS6.updateBpmMeter === "function") NumarkNS6.updateBpmMeter(); 
        } 
    });
    
    this.deckChangeR = new components.Button({ 
        midi: [0xB0, 0x51], 
        input: function(_c, _ctrl, value) { 
            this.output(value); 
            NumarkNS6.rightDeck = (value > 0) ? 4 : 2; // Se apertou, estamos no Deck 4. Senão, 2.
            if (typeof NumarkNS6.updateBpmMeter === "function") NumarkNS6.updateBpmMeter(); 
        } 
    });
    
    this.channelInputSwitcher1 = new components.Button({ midi: [0x90, 0x47], group: "[Channel1]", inKey: "mute", type: components.Button.prototype.types.powerWindow });
    this.channelInputSwitcher2 = new components.Button({ midi: [0x90, 0x48], group: "[Channel2]", inKey: "mute", type: components.Button.prototype.types.powerWindow });
    this.channelInputSwitcher3 = new components.Button({ midi: [0x90, 0x49], group: "[Channel3]", inKey: "mute", type: components.Button.prototype.types.powerWindow });
    this.channelInputSwitcher4 = new components.Button({ midi: [0x90, 0x4A], group: "[Channel4]", inKey: "mute", type: components.Button.prototype.types.powerWindow });    
    
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

    this.navigationEncoderTick = new components.Encoder({ midi: [0xB0, 0x44], group: "[Library]", input: function (ch, ctrl, val) { engine.setValue("[Library]", "MoveVertical", val < 64 ? 1 : -1); } });
    this.autoDjAddButton = new components.Button({ midi: [0x90, 0x0D], group: "[AutoDJ]", input: function (ch, ctrl, val) { if (val === 0) return; engine.setValue("[Library]", "AutoDjAddBottom", 1); midi.sendShortMsg(0xB0, 0x0D, 0x7F); engine.beginTimer(150, function() { midi.sendShortMsg(0xB0, 0x0D, 0x00); }, true); } });

    this.viewButton = new components.Button({
        midi: [0x90, 0x01], group: "[Skin]",
        input: function (ch, ctrl, val) {
            if (val === 0) return;
            var isShifted = false;
            for (var i = 1; i <= 4; i++) { if (NumarkNS6.Decks[i] && NumarkNS6.Decks[i].shiftButton && NumarkNS6.Decks[i].shiftButton.state) { isShifted = true; break; } }
            if (isShifted) engine.setValue("[Skin]", "show_waveforms", !engine.getValue("[Skin]", "show_waveforms"));
            else engine.setValue("[Skin]", "show_maximized_library", !engine.getValue("[Skin]", "show_maximized_library"));
        }
    });

    this.navigationEncoderButton = new components.Button({
        midi: [0x90, 0x08], group: "[Library]",
        input: function (ch, ctrl, val) {
            if (val === 0) return; 
            var isShifted = false;
            for (var i = 1; i <= 4; i++) { if (NumarkNS6.Decks[i] && NumarkNS6.Decks[i].shiftButton && NumarkNS6.Decks[i].shiftButton.state) { isShifted = true; break; } }
            if (isShifted) { engine.setValue("[AutoDJ]", "enabled", !engine.getValue("[AutoDJ]", "enabled")); midi.sendShortMsg(0xB0, 0x08, 0x7F); engine.beginTimer(100, function() { midi.sendShortMsg(0xB0, 0x08, 0x00); }, true); } 
            else engine.setValue("[Playlist]", "ToggleSelectedSidebarItem", 1);
        }
    });

    this.backButton = new components.Button({ midi: [0x90, 0x06], group: "[Library]", input: function (ch, ctrl, value) { if (value > 0) engine.setValue("[Library]", "MoveFocus", -1); } });
    this.fwdButton = new components.Button({ midi: [0x90, 0x07], group: "[Library]", input: function (ch, ctrl, value) { if (value > 0) engine.setValue("[Library]", "MoveFocus", 1); } });
};
NumarkNS6.MixerTemplate.prototype = new components.ComponentContainer();

// =======================================================
// 🔥 GESTÃO DE HOTCUES (Versão Definitiva Padrão Ouro)
// =======================================================

NumarkNS6.HotcuesContainer = function (channel) {
    components.ComponentContainer.call(this); // Garante a herança para o Shift funcionar
    this.group = "[Channel" + channel + "]";
    var theContainer = this;

    for (var i = 1; i <= 5; i++) {
        this["hotCue" + i] = new components.Button({
            midi: [0x90 + channel, 0x12 + i, 0xB0 + channel, 0x0A + i], 
            number: i,
            group: theContainer.group, 
            
            // 1. O Motor Nativo: "push" repassa o aperto (1) e a soltura (0) pro Mixxx
            type: components.Button.prototype.types.push,
            
            // 2. Estado Inicial: O botão nasce sabendo que é um gatilho de tocar/preview
            inKey: "hotcue_" + i + "_activate", 
            
            // 3. Ao segurar o SHIFT: Troca a função para Apagar e muda a cor pra vermelho
            shift: function() {
                this.inKey = "hotcue_" + this.number + "_clear"; 
                if (engine.getValue(this.group, "hotcue_" + this.number + "_position") !== -1 && !NumarkNS6.isBooting) {
                    midi.sendShortMsg(this.midi[2], this.midi[3], 0x01); 
                }
            },
            
            // 4. Ao soltar o SHIFT: Volta pra função normal e cor branca
            unshift: function() {
                this.inKey = "hotcue_" + this.number + "_activate"; 
                if (engine.getValue(this.group, "hotcue_" + this.number + "_position") !== -1 && !NumarkNS6.isBooting) {
                    midi.sendShortMsg(this.midi[2], this.midi[3], 0x7F); 
                }
            }
        });

        // 5. O Olheiro Visual: Monitora se o Cue foi criado ou apagado pelo mouse/PC
        (function(btn, grp, num) {
            engine.makeConnection(grp, "hotcue_" + num + "_position", function(value) {
                if (NumarkNS6.isBooting) return; // Blinda a animação Vegas Mode

                if (value === -1) {
                    midi.sendShortMsg(btn.midi[2], btn.midi[3], 0x00); // Apagado
                } else {
                    // Se o Cue existe, verifica se o Shift tá apertado pra decidir a cor
                    var deckNum = script.deckFromGroup(grp);
                    var isShifted = NumarkNS6.Decks[deckNum].shiftButton.state;
                    midi.sendShortMsg(btn.midi[2], btn.midi[3], isShifted ? 0x01 : 0x7F); 
                }
            });
        })(this["hotCue" + i], theContainer.group, i);
    }
};
NumarkNS6.HotcuesContainer.prototype = new components.ComponentContainer();


// ==========================================================
// 🚀 FADER START INTELIGENTE (Motor Padrão FIFA)
// ==========================================================

NumarkNS6.faderStartLeft = false; NumarkNS6.faderStartRight = false; NumarkNS6.prevCrossfader = 0;
NumarkNS6.toggleFaderStartLeft = function(ch, ctrl, val) { if (val > 0) { NumarkNS6.faderStartLeft = !NumarkNS6.faderStartLeft; midi.sendShortMsg(0x90, 0x02, NumarkNS6.faderStartLeft ? 0x7F : 0x00); } };
NumarkNS6.toggleFaderStartRight = function(ch, ctrl, val) { if (val > 0) { NumarkNS6.faderStartRight = !NumarkNS6.faderStartRight; midi.sendShortMsg(0x90, 0x03, NumarkNS6.faderStartRight ? 0x7F : 0x00); } };

engine.makeConnection("[Master]", "crossfader", function(value) {
    if (NumarkNS6.faderStartLeft && value > -0.95 && NumarkNS6.prevCrossfader <= -0.95) for (var i = 1; i <= 4; i++) { if (engine.getValue("[Channel" + i + "]", "orientation") === 0) engine.setValue("[Channel" + i + "]", "play", 1); }
    else if (NumarkNS6.faderStartLeft && value <= -0.95 && NumarkNS6.prevCrossfader > -0.95) for (var i = 1; i <= 4; i++) { if (engine.getValue("[Channel" + i + "]", "orientation") === 0) engine.setValue("[Channel" + i + "]", "cue_gotoandstop", 1); }

    if (NumarkNS6.faderStartRight && value < 0.95 && NumarkNS6.prevCrossfader >= 0.95) for (var i = 1; i <= 4; i++) { if (engine.getValue("[Channel" + i + "]", "orientation") === 2) engine.setValue("[Channel" + i + "]", "play", 1); }
    else if (NumarkNS6.faderStartRight && value >= 0.95 && NumarkNS6.prevCrossfader < 0.95) for (var i = 1; i <= 4; i++) { if (engine.getValue("[Channel" + i + "]", "orientation") === 2) engine.setValue("[Channel" + i + "]", "cue_gotoandstop", 1); }
    NumarkNS6.prevCrossfader = value;
});


// =======================================================
// 🎧 ESTRUTURA DO DECK INDIVIDUAL
// =======================================================

NumarkNS6.Deck = function(channel) {
    components.Deck.call(this, channel);
    var groupName = "[Channel" + channel + "]";
    this.deckNum = channel; this.midiChannel = channel; this.group = groupName; this.rateRangeEntry = 0;
    var theDeck = this;
    this.hotcuesContainer = new NumarkNS6.HotcuesContainer(channel);
    this.gridSlipMode = false; this.gridAdjustMode = false; this.skipMode = false; this.scratchMode = true; this.isSearching = false;

    this.eqKnobs = [];
    for (var i = 1; i <= 3; i++) {
        this.eqKnobs[i] = new components.Pot({
            midi: [0xB0, 0x29 + i + 5 * (channel - 1)], group: "[EqualizerRack1_" + theDeck.group + "_Effect1]", inKey: "parameter" + i,
            inValueScale: function (v) { return (v > this.max * 0.46997 && v < this.max * 0.50659) ? (v + this.max * 0.015625) / this.max : v / this.max; }
        });
    }
    this.gainKnob = new components.Pot({
        midi: [0xB0, 0x2C + 5 * (channel - 1)], shift: function () { this.group = "[QuickEffectRack1_" + theDeck.group + "]"; this.inKey = "super1"; }, unshift: function () { this.group = theDeck.group; this.inKey = "pregain"; }
    });

   
    this.playButton = new components.Button({ 
        midi: [0x90 + channel, 0x11, 0xB0 + channel, 0x09], 
        group: groupName, 
        output: function() {}, 
        input: function (ch, ctrl, val, st, grp) { 
            if (val > 0) {
                // 🎯 O TIRO DE MISERICÓRDIA:
                // Se você acabou de girar o prato, vamos abortar o timer e o scratch AGORA.
                // var deck = NumarkNS6.Decks[theDeck.deckNum];
                var deckNum = script.deckFromGroup(grp);
                var deck = NumarkNS6.Decks[deckNum];

                if (deck.scrubTimer !== undefined && deck.scrubTimer !== 0) {
                    engine.stopTimer(deck.scrubTimer);
                    deck.scrubTimer = 0;
                }
                if (deck.isAutoScrubbing) {
                    engine.scratchDisable(deckNum);
                    deck.isAutoScrubbing = false;
                }

                // Agora sim, solta o som sem nenhuma "embreagem" presa!
                script.toggleControl(grp, "play"); 
            }
        } 
    });
    
    this.cueButton = new components.Button({ 
        midi: [0x90 + channel, 0x10, 0xB0 + channel, 0x08], group: groupName, output: function() {}, 
        input: function (ch, ctrl, val, st, grp) {
            var deck = NumarkNS6.Decks[theDeck.deckNum];
            if (deck.shiftButton && deck.shiftButton.state) { engine.setValue(grp, "intro_start_activate", val > 0 ? 1 : 0); NumarkNS6.updatePlayCueLEDs(theDeck.deckNum, theDeck.midiChannel); return; }
            if (val > 0) { 
                if (engine.getValue(grp, "play") > 0) {
                    deck.isFlashingCue = true; midi.sendShortMsg(0xB0 + deck.midiChannel, 0x08, 0x7F);
                    engine.beginTimer(80, function() { deck.isFlashingCue = false; NumarkNS6.updatePlayCueLEDs(theDeck.deckNum, theDeck.midiChannel); }, true);
                }
                engine.setValue(grp, "cue_default", 1);
            } else engine.setValue(grp, "cue_default", 0);
            NumarkNS6.updatePlayCueLEDs(theDeck.deckNum, theDeck.midiChannel);
        }
    });

    this.shiftButton = new components.Button({
        midi: [0x90 + channel, 0x12, 0xB0 + channel, 0x0A], type: components.Button.prototype.types.powerWindow, state: false,
        inToggle: function () {
            this.state = !this.state;
            
            if (this.state) { 
                // O "theDeck" propaga a ordem em cascata para TUDO que pertence a ele, incluindo os Hotcues!
                theDeck.shift(); 
                NumarkNS6.Mixer.shift(); 
            } else { 
                // O "theDeck" desfaz a ordem em cascata para TUDO que pertence a ele.
                theDeck.unshift(); 
                NumarkNS6.Mixer.unshift(); 
            }
            
            this.output(this.state);
            try { NumarkNS6.updatePlayCueLEDs(theDeck.deckNum, theDeck.midiChannel); NumarkNS6.updateSyncLED(theDeck.deckNum, theDeck.midiChannel); NumarkNS6.FX.updateLEDs(); } catch(e) {}
        }
    });

    this.syncButton = new components.Button({ 
        midi: [0x90 + channel, 0x0F], group: groupName, 
        input: function (ch, ctrl, val, st, grp) {
            if (val === 0) return; 
            var deck = NumarkNS6.Decks[theDeck.deckNum];
            if (deck.shiftButton && deck.shiftButton.state) engine.setValue(grp, "quantize", !engine.getValue(grp, "quantize"));
            else engine.setValue(grp, "sync_enabled", !engine.getValue(grp, "sync_enabled"));
            NumarkNS6.updateSyncLED(theDeck.deckNum, theDeck.midiChannel);
        }
    });
    
    this.gridSetClearInput = function (ch, ctrl, val, st, grp) { if (val > 0) { var action = theDeck.shiftButton.state ? "beats_delete_marker" : "beats_translate_curpos"; engine.setValue(grp, action, 1); engine.beginTimer(100, function() { engine.setValue(grp, action, 0); }, true); } };
    this.gridSlipAdjustInput = function (ch, ctrl, val) { if (val > 0) { theDeck.gridAdjustMode = theDeck.shiftButton.state; theDeck.gridSlipMode = !theDeck.shiftButton.state; } else { theDeck.gridSlipMode = false; theDeck.gridAdjustMode = false; } };
    this.skipButtonInput = function(ch, ctrl, val) { theDeck.skipMode = (val > 0); if (val === 0) theDeck.skipAccumulator = 0; };

    this.crossfaderAssignLeft = new components.Button({ midi: [0x90, 0x33 + (this.deckNum * 2)], group: groupName, input: function (ch, ctrl, val, st, grp) { if (val > 0) engine.setValue(grp, "orientation", 0); else if (engine.getValue(grp, "orientation") === 0) engine.setValue(grp, "orientation", 1); } });
    this.crossfaderAssignRight = new components.Button({ midi: [0x90, 0x34 + (this.deckNum * 2)], group: groupName, input: function (ch, ctrl, val, st, grp) { if (val > 0) engine.setValue(grp, "orientation", 2); else if (engine.getValue(grp, "orientation") === 2) engine.setValue(grp, "orientation", 1); } });

    this.pflButton = new components.Button({
        midi: [0x90, 0x30+channel, 0xB0, 0x3F+channel], key: "pfl", flickerSafetyTimeout: true,
        input: function(_c, _ctrl, val) {
            if (this.flickerSafetyTimeout) {
                this.flickerSafetyTimeout=false;
                if (this.inGetParameter()!==(val/0x7F)) this.inSetParameter(val/0x7F);
                engine.beginTimer(100, () => { this.flickerSafetyTimeout=true; }, true);
            }
        }
    });

    var loadNote = (channel === 1 || channel === 3) ? 0x0C : 0x0E;
    this.loadButton = new components.Button({ 
        midi: [0x90 + channel, loadNote], group: groupName,
        input: function (ch, control, val, st, grp) {
            if (val === 0) return; 
            var deck = NumarkNS6.Decks[script.deckFromGroup(grp)];
            if (deck && deck.shiftButton && deck.shiftButton.state) engine.setValue(grp, "eject", 1);
            else engine.setValue(grp, "LoadSelectedTrack", 1);
        }
    });

    this.manageChannelIndicator = () => {
        this.duration=engine.getParameter(theDeck.group, "duration");
        if (engine.getParameter(theDeck.group, "playposition") * this.duration > (this.duration - NumarkNS6.warnAfterTime)) {
            this.alternating=!this.alternating; midi.sendShortMsg(0xB0, 0x1D+channel, this.alternating?0x7F:0x0);
        } else midi.sendShortMsg(0xB0, 0x1D+channel, 0x7F);
    };
    engine.makeConnection(this.group, "track_loaded", function(val) {
        if (val === 0) { engine.stopTimer(theDeck.blinkTimer); theDeck.blinkTimer=0; return; }
        if (!this.previouslyLoaded) theDeck.blinkTimer=engine.beginTimer(NumarkNS6.blinkInterval, theDeck.manageChannelIndicator.bind(this), true);
        this.previouslyLoaded=val;
    }.bind(this));

    this.pitchBendMinus = new components.Button({ midi: [0x90+channel, 0x18, 0xB0+channel, 0x3D], key: "rate_temp_down", shift: function() { this.inkey = "rate_temp_down_small"; }, unshift: function() { this.inkey = "rate_temp_down"; } });
    this.pitchBendPlus = new components.Button({ midi: [0x90+channel, 0x19, 0xB0+channel, 0x3C], key: "rate_temp_up", shift: function() { this.inkey = "rate_temp_up_small"; }, unshift: function() { this.inkey = "rate_temp_up"; } });
    this.keylockButton = new components.Button({ midi: [0x90+channel, 0x1B, 0xB0+channel, 0x10], type: components.Button.prototype.types.toggle, shift: function() { this.inKey="sync_key"; this.outKey="sync_key"; }, unshift: function() { this.inKey="keylock"; this.outKey="keylock"; } });
    this.bpmSlider = new components.Pot({ midi: [0xB0+channel, 0x01, 0xB0+channel, 0x37], inKey: "rate", group: theDeck.group, invert: true });
    
    this.pitchLedHandler = engine.makeConnection(this.group, "rate", function(val) { if(!NumarkNS6.isBooting) midi.sendShortMsg(0xB0+channel, 0x37, val===0 ? 0x7F : 0x00); }.bind(this));
    this.pitchLedHandler.trigger();

    this.pitchRange = new components.Button({
        midi: [0x90 + channel, 0x1A, 0xB0 + channel, 0x1E], key: "rateRange",
        input: function () {
            theDeck.rateRangeEntry = (theDeck.rateRangeEntry + 1) % NumarkNS6.rateRanges.length;
            engine.setValue(this.group, "rateRange", NumarkNS6.rateRanges[theDeck.rateRangeEntry]);
            this.send(0x7F); engine.beginTimer(50, () => this.send(0x00), true);
        },
        output: function (val) { this.send(val !== 0.08 ? 0x7F : 0x00); }
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


// =======================================================
// 🎛️ PROCESSAMENTO DO JOG (COM ENGRENAGEM PESADA DE CDJ)
// =======================================================
// ===== CONFIGURAÇÕES DE SENSIBILIDADE - NS6 ORIGINAL =====
// =======================================================
// 🎛️ PROCESSAMENTO DO JOG (COM ENGRENAGEM PESADA DE CDJ)
// =======================================================

NumarkNS6.cdjScrubWeight = 10; 
// Mantemos a sensibilidade original para botões, mas pro prato de 14 bits usaremos 60!
NumarkNS6.pitchBendSensitivity = 5; 

NumarkNS6.jogMove14bit = function(ch, ctrl, val, st, grp) {
    // var deckNum = script.deckFromGroup(grp);
    // Substitua var deckNum = script.deckFromGroup(grp); por:
    var deckNum = NumarkNS6.groupToDeck[grp];

    if (ctrl === 0x00) NumarkNS6.jogMSB[deckNum] = val;
    if (ctrl === 0x20) NumarkNS6.jogLSB[deckNum] = val;
    if (ctrl !== 0x20) return; 
    
    var fullValue = (NumarkNS6.jogMSB[deckNum] << 7) | NumarkNS6.jogLSB[deckNum];
    if (NumarkNS6.lastJogValue[deckNum] === -1) { NumarkNS6.lastJogValue[deckNum] = fullValue; return; }
    
    var delta = fullValue - NumarkNS6.lastJogValue[deckNum];
    NumarkNS6.lastJogValue[deckNum] = fullValue;
    if (delta > 8192) delta -= 16384; else if (delta < -8192) delta += 16384;
    
    var deck = NumarkNS6.Decks[deckNum];
    if (!deck) return;
    
    // 1. MODO SKIP (Beatjump via Prato - Protegido!)
    if (deck.skipMode) {
        if (deck.skipAccumulator === undefined) deck.skipAccumulator = 0;
        deck.skipAccumulator += delta;
        if (deck.skipAccumulator > 30) { engine.setValue(grp, "beatjump_1_forward", 1); deck.skipAccumulator = 0; }
        else if (deck.skipAccumulator < -30) { engine.setValue(grp, "beatjump_1_backward", 1); deck.skipAccumulator = 0; }
        return; 
    }
    
    // 2. MODO SLIP (Ajuste de Grade)
    if (deck.gridSlipMode) { 
        if (deck.gridSlipAccumulator === undefined) deck.gridSlipAccumulator = 0;
        deck.gridSlipAccumulator += delta;
        var slipThreshold = 25; 
        if (deck.gridSlipAccumulator > slipThreshold) {
            engine.setValue(grp, "beats_translate_later", 1); 
            engine.setValue(grp, "beats_translate_later", 0); 
            deck.gridSlipAccumulator = 0;
        } else if (deck.gridSlipAccumulator < -slipThreshold) {
            engine.setValue(grp, "beats_translate_earlier", 1); 
            engine.setValue(grp, "beats_translate_earlier", 0); 
            deck.gridSlipAccumulator = 0;
        }
        return; 
    }

    // 3. MODO ADJUST (Esticar Grade)
    if (deck.gridAdjustMode) { 
        if (deck.gridAdjustAccumulator === undefined) deck.gridAdjustAccumulator = 0;
        deck.gridAdjustAccumulator += delta;
        var adjustThreshold = 30; 
        if (deck.gridAdjustAccumulator > adjustThreshold) {
            engine.setValue(grp, "beats_adjust_slower", 1); 
            engine.setValue(grp, "beats_adjust_slower", 0); 
            deck.gridAdjustAccumulator = 0;
        } else if (deck.gridAdjustAccumulator < -adjustThreshold) {
            engine.setValue(grp, "beats_adjust_faster", 1); 
            engine.setValue(grp, "beats_adjust_faster", 0); 
            deck.gridAdjustAccumulator = 0;
        }
        return; 
    }
    
    // --------------------------------------------------------
    // 4. A MÁGICA DA SEPARAÇÃO (SCRATCH vs NUDGE)
    // --------------------------------------------------------
    
    // Se o Sensor de Toque (jogTouch14bit) ligou o motor...
    if (engine.isScratching(deckNum)) {
        // ...Nós arrastamos a música! (Modo Scratch)
        engine.scratchTick(deckNum, delta);
    } else {
        // Se a mão NÃO está no prato (ou o modo Scratch está desligado)...
        if (engine.getValue(grp, "play") > 0) {
            // NUDGE: Divisor de 60 devolvido para domar os 14 Bits!
            engine.setValue(grp, "jog", delta / 60); 
        } else {
            // MÚSICA PAUSADA: Scrubbing com o motor CDJ "Timer Sniper"
            if (!deck.isAutoScrubbing) {
                var heavyResolution = NumarkNS6.scratchSettings.jogResolution * NumarkNS6.cdjScrubWeight;
                engine.scratchEnable(deckNum, heavyResolution, 33.33, NumarkNS6.scratchSettings.alpha, NumarkNS6.scratchSettings.beta);
                deck.isAutoScrubbing = true;
            }
            engine.scratchTick(deckNum, delta);
            
            // O timer que limpa o áudio quando você para de girar
            if (deck.scrubTimer !== undefined && deck.scrubTimer !== 0) engine.stopTimer(deck.scrubTimer);
            deck.scrubTimer = engine.beginTimer(100, function() {
                engine.scratchDisable(deckNum);
                deck.isAutoScrubbing = false;
                deck.scrubTimer = 0;
            }, true);
        }
    }
};

NumarkNS6.scratchButtonInput = function (ch, ctrl, val, st, grp) {
    if (val === 0) return;
    
    var deckNum = script.deckFromGroup(grp);
    var deck = NumarkNS6.Decks[deckNum];
    if (!deck) return;
    
    // Alterna o modo na cabeça do Mixxx
    deck.scratchMode = !deck.scratchMode;
    
    // 🎯 Devolvemos o LED para o endereço correto (0x12)
    midi.sendShortMsg(0xB0 + deck.midiChannel, 0x12, deck.scratchMode ? 0x7F : 0x00); 
};

NumarkNS6.jogTouch14bit = function (ch, ctrl, val, st, grp) {
    //var deckNum = script.deckFromGroup(grp);
    // Substitua var deckNum = script.deckFromGroup(grp); por:
    var deckNum = NumarkNS6.groupToDeck[grp];
    if (!NumarkNS6.Decks[deckNum]) return;
    if ((val > 0) && NumarkNS6.Decks[deckNum].scratchMode) engine.scratchEnable(deckNum, NumarkNS6.scratchSettings.jogResolution, 33.33, NumarkNS6.scratchSettings.alpha, NumarkNS6.scratchSettings.beta);
    else engine.scratchDisable(deckNum);
};

NumarkNS6.reverseButtonInput = function (ch, ctrl, val, st, grp) {
    var deckNum = script.deckFromGroup(grp), deck = NumarkNS6.Decks[deckNum];
    if (!deck) return;
    if (deck.shiftButton.state) { engine.setValue(grp, "reverseroll", val > 0 ? 1 : 0); midi.sendShortMsg(0xB0 + deck.midiChannel, 0x16, val > 0 ? 0x7F : 0x00); return; }
    if (val > 0) { engine.setValue(grp, "reverse", !engine.getValue(grp, "reverse") ? 1 : 0); NumarkNS6.updateReverseLED(deckNum); }
};

NumarkNS6.loopHalveInput = function (c, ctrl, val, s, grp) { if (val > 0) script.triggerControl(grp, "loop_halve", 1); };
NumarkNS6.loopDoubleInput = function (c, ctrl, val, s, grp) { if (val > 0) script.triggerControl(grp, "loop_double", 1); };
NumarkNS6.loopMoveLeftInput = function (c, ctrl, val, s, grp) { if (val > 0) script.triggerControl(grp, "beatjump_1_backward", 1); };
NumarkNS6.loopMoveRightInput = function (c, ctrl, val, s, grp) { if (val > 0) script.triggerControl(grp, "beatjump_1_forward", 1); };

NumarkNS6.updateAutoLoopLEDs = function (deckNum) {
    if (NumarkNS6.isBooting) return; // 🛡️ Bloqueia durante a animação
    var group = "[Channel" + deckNum + "]", isAuto = NumarkNS6.deckLoopMode[deckNum];
    var isEnabled = engine.getValue(group, "loop_enabled"), currentSize = Math.round(engine.getValue(group, "beatloop_size"));
    if (isAuto) {
        midi.sendShortMsg(0xB0 + deckNum, 0x19, (currentSize === 1) ? 0x01 : 0x00);
        midi.sendShortMsg(0xB0 + deckNum, 0x1A, (currentSize === 2) ? 0x01 : 0x00);
        midi.sendShortMsg(0xB0 + deckNum, 0x1B, (currentSize === 4) ? 0x01 : 0x00);
        midi.sendShortMsg(0xB0 + deckNum, 0x1C, (currentSize === 8) ? 0x01 : 0x00);
    } else {
        if (NumarkNS6.isProcessingHarmonic[deckNum]) return; 
        var hasIn = engine.getValue(group, "loop_start_position") !== -1, isHarmSync = NumarkNS6.harmonicSyncActive[deckNum];
        midi.sendShortMsg(0xB0 + deckNum, 0x19, hasIn ? 0x02 : 0x00); 
        midi.sendShortMsg(0xB0 + deckNum, 0x1A, isEnabled ? 0x02 : 0x00);
        midi.sendShortMsg(0xB0 + deckNum, 0x1C, isEnabled ? 0x02 : 0x00);
        midi.sendShortMsg(0xB0 + deckNum, 0x1B, isHarmSync ? 0x02 : 0x00);
    }
};

NumarkNS6.loopModeInput = function (ch, ctrl, val, st, grp) {
    if (val > 0) { var deckNum = st & 0x0F; NumarkNS6.deckLoopMode[deckNum] = !NumarkNS6.deckLoopMode[deckNum]; midi.sendShortMsg(0xB0 + deckNum, 0x18, NumarkNS6.deckLoopMode[deckNum] ? 0x01 : 0x02); engine.setValue(grp, "loop_clear", 1); NumarkNS6.updateAutoLoopLEDs(deckNum); }
};

NumarkNS6.loopOnOffInput = function (ch, ctrl, val, st, grp) { 
    if (val > 0) { if (engine.getValue(grp, "loop_enabled")) { engine.setValue(grp, "reloop_toggle", 1); engine.setValue(grp, "reloop_toggle", 0); } else { engine.setValue(grp, "beatloop_activate", 1); engine.setValue(grp, "beatloop_activate", 0); } } 
};

NumarkNS6.loopButtonInput = function (ch, ctrl, val, st, grp) {
    var deckNum = st & 0x0F, btnIdx = ctrl - 0x27; 
    if (val > 0) { 
        if (NumarkNS6.deckLoopMode[deckNum]) {
            var selSize = [0, 1, 2, 4, 8][btnIdx];
            if (engine.getValue(grp, "loop_enabled") && engine.getValue(grp, "beatloop_size") === selSize) engine.setValue(grp, "loop_enabled", 0);
            else { engine.setValue(grp, "beatloop_size", selSize); engine.setValue(grp, "beatloop_" + selSize + "_activate", 1); }
        } else {
            var isLoopActive = engine.getValue(grp, "loop_enabled"), totSamples = engine.getValue(grp, "track_samples");
            switch (btnIdx) {
                case 1: if (isLoopActive) { var sPos = engine.getValue(grp, "loop_start_position"); if (sPos !== -1 && totSamples > 0) engine.setValue(grp, "playposition", sPos / totSamples); } else { engine.setValue(grp, "loop_in", 1); engine.setValue(grp, "loop_in", 0); } break;
                case 2: if (isLoopActive) { var ePos = engine.getValue(grp, "loop_end_position"); if (ePos !== -1 && totSamples > 0) engine.setValue(grp, "playposition", ePos / totSamples); } else { engine.setValue(grp, "loop_out", 1); engine.setValue(grp, "loop_out", 0); if (engine.getValue(grp, "loop_start_position") !== -1) engine.setValue(grp, "loop_enabled", 1); } break;
                case 3: NumarkNS6.isProcessingHarmonic[deckNum] = true; engine.setValue(grp, "sync_key", 1); midi.sendShortMsg(0xB0 + deckNum, 0x1B, 0x01); engine.beginTimer(300, function () { NumarkNS6.isProcessingHarmonic[deckNum] = false; NumarkNS6.harmonicSyncActive[deckNum] = true; NumarkNS6.updateAutoLoopLEDs(deckNum); }, true); return; 
                case 4: engine.setValue(grp, "reloop_exit", 1); engine.setValue(grp, "reloop_exit", 0); break;
            }
        }
        NumarkNS6.updateAutoLoopLEDs(deckNum);
    }
};

NumarkNS6.touchStripInput = function (ch, ctrl, val, st, grp) { engine.setValue(grp, "playposition", val / 127.0); };
NumarkNS6.tapButtonInput = function (ch, ctrl, val, st, grp) { if (val === 0) return; script.triggerControl(grp, "bpm_tap", 1); var deckNum = script.deckFromGroup(grp); midi.sendShortMsg(0xB0 + deckNum, 0x17, 0x7F); engine.beginTimer(100, function() { midi.sendShortMsg(0xB0 + deckNum, 0x17, 0x00); }, true); };

// ==========================================================
// 🚀 MOTOR DO BPM METER ABSOLUTO (Visão 4 Decks)
// ==========================================================
NumarkNS6.lastBpmLed = -1;

NumarkNS6.updateBpmMeter = function() {
    if (NumarkNS6.isBooting) return; // 🛡️ Bloqueia durante a animação do Vegas Mode!

    // Pega o número exato dos decks que estão nas camadas visíveis
    var left = NumarkNS6.leftDeck || 1;
    var right = NumarkNS6.rightDeck || 2;

    // Pega o BPM efetivo (já com o pitch aplicado) dinamicamente
    var bpm1 = engine.getValue("[Channel" + left + "]", "bpm");
    var bpm2 = engine.getValue("[Channel" + right + "]", "bpm");

    // Se um dos decks ativos estiver vazio ou parado em 0, desliga o LED
    if (bpm1 <= 0 || bpm2 <= 0) {
        if (NumarkNS6.lastBpmLed !== 0) {
            midi.sendShortMsg(0xB0, 0x36, 0x00);
            NumarkNS6.lastBpmLed = 0;
        }
        return;
    }

    var diff = bpm1 - bpm2;
    var divisor = 0.5; // Sensibilidade: cada LED = 0.5 BPM de diferença
    
    var center = 6;
    var ledOffset = Math.round(diff / divisor);
    var ledValue = center + ledOffset;

    // Trava os limites entre o LED 1 (Ponta de baixo) e 11 (Ponta de cima)
    if (ledValue < 1) ledValue = 1;
    if (ledValue > 11) ledValue = 11;

    // Só envia o comando se o LED realmente precisar mudar de lugar (Poupa a CPU)
    if (ledValue !== NumarkNS6.lastBpmLed) {
        midi.sendShortMsg(0xB0, 0x36, ledValue);
        NumarkNS6.lastBpmLed = ledValue;
    }
};


// =======================================================
// 🎛️ MÓDULO DE EFEITOS DINÂMICOS (FX)
// =======================================================

NumarkNS6.FX = {};
NumarkNS6.FX.updateLEDs = function() {
    if (NumarkNS6.isBooting) return; // 🛡️ Bloqueia durante a animação
    var shiftL = (NumarkNS6.Decks[1].shiftButton.state || NumarkNS6.Decks[3].shiftButton.state);
    midi.sendShortMsg(0xB0, 0x17, engine.getValue("[EffectRack1_EffectUnit1_Effect" + (shiftL ? "2" : "1") + "]", "enabled") > 0 ? 0x01 : 0x00);
    var shiftR = (NumarkNS6.Decks[2].shiftButton.state || NumarkNS6.Decks[4].shiftButton.state);
    midi.sendShortMsg(0xB0, 0x2E, engine.getValue("[EffectRack1_EffectUnit2_Effect" + (shiftR ? "2" : "1") + "]", "enabled") > 0 ? 0x01 : 0x00);
};

NumarkNS6.FX.init = function() {
    NumarkNS6.FX.toggleLeft = new components.Button({ midi: [0x90, 0x2D], input: function (ch, ctrl, val) { if (val > 0) { var t = "[EffectRack1_EffectUnit1_Effect" + ((NumarkNS6.Decks[1].shiftButton.state || NumarkNS6.Decks[3].shiftButton.state) ? "2" : "1") + "]"; engine.setValue(t, "enabled", !engine.getValue(t, "enabled")); } } });
    NumarkNS6.FX.toggleRight = new components.Button({ midi: [0x90, 0x2F], input: function (ch, ctrl, val) { if (val > 0) { var t = "[EffectRack1_EffectUnit2_Effect" + ((NumarkNS6.Decks[2].shiftButton.state || NumarkNS6.Decks[4].shiftButton.state) ? "2" : "1") + "]"; engine.setValue(t, "enabled", !engine.getValue(t, "enabled")); } } });
    NumarkNS6.FX.mixLeft = new components.Pot({ midi: [0xB0, 0x57], group: "[EffectRack1_EffectUnit1]", key: "mix" });
    NumarkNS6.FX.mixRight = new components.Pot({ midi: [0xB0, 0x59], group: "[EffectRack1_EffectUnit2]", key: "mix" });
    NumarkNS6.FX.selectLeft = new components.Button({ midi: [0xB0, 0x56], group: "[EffectRack1_EffectUnit1_Effect1]", input: function(ch, ctrl, val) { var t = "[EffectRack1_EffectUnit1_Effect" + ((NumarkNS6.Decks[1].shiftButton.state || NumarkNS6.Decks[3].shiftButton.state) ? "2" : "1") + "]"; engine.setValue(t, "meta", Math.max(0, Math.min(1, engine.getValue(t, "meta") + ((val === 0x01 || val < 64) ? 0.05 : -0.05)))); } });
    NumarkNS6.FX.selectRight = new components.Button({ midi: [0xB0, 0x58], group: "[EffectRack1_EffectUnit2_Effect1]", input: function(ch, ctrl, val) { var t = "[EffectRack1_EffectUnit2_Effect" + ((NumarkNS6.Decks[2].shiftButton.state || NumarkNS6.Decks[4].shiftButton.state) ? "2" : "1") + "]"; engine.setValue(t, "meta", Math.max(0, Math.min(1, engine.getValue(t, "meta") + ((val === 0x01 || val < 64) ? 0.05 : -0.05)))); } });
    NumarkNS6.FX.encoderLeft = new components.Button({ midi: [0xB0, 0x5A], group: "[EffectRack1_EffectUnit1_Effect1]", input: function(ch, ctrl, val) { var t = "[EffectRack1_EffectUnit1_Effect" + ((NumarkNS6.Decks[1].shiftButton.state || NumarkNS6.Decks[3].shiftButton.state) ? "2" : "1") + "]"; engine.setValue(t, "effect_selector", (val === 0x01 || val < 64) ? 1 : -1); } });
    NumarkNS6.FX.encoderRight = new components.Button({ midi: [0xB0, 0x5B], group: "[EffectRack1_EffectUnit2_Effect1]", input: function(ch, ctrl, val) { var t = "[EffectRack1_EffectUnit2_Effect" + ((NumarkNS6.Decks[2].shiftButton.state || NumarkNS6.Decks[4].shiftButton.state) ? "2" : "1") + "]"; engine.setValue(t, "effect_selector", (val === 0x01 || val < 64) ? 1 : -1); } });

    engine.makeConnection("[EffectRack1_EffectUnit1_Effect1]", "enabled", NumarkNS6.FX.updateLEDs);
    engine.makeConnection("[EffectRack1_EffectUnit1_Effect2]", "enabled", NumarkNS6.FX.updateLEDs);
    engine.makeConnection("[EffectRack1_EffectUnit2_Effect1]", "enabled", NumarkNS6.FX.updateLEDs);
    engine.makeConnection("[EffectRack1_EffectUnit2_Effect2]", "enabled", NumarkNS6.FX.updateLEDs);
};

NumarkNS6.FX.Assign = {};
NumarkNS6.FX.RoutingTable = [
    { note: 0x3D, led: 0x44, unit: 1, target: "[Channel1]" }, { note: 0x3E, led: 0x45, unit: 2, target: "[Channel1]" },
    { note: 0x3F, led: 0x46, unit: 1, target: "[Channel2]" }, { note: 0x40, led: 0x47, unit: 2, target: "[Channel2]" },
    { note: 0x41, led: 0x48, unit: 1, target: "[Channel3]" }, { note: 0x42, led: 0x49, unit: 2, target: "[Channel3]" },
    { note: 0x43, led: 0x4A, unit: 1, target: "[Channel4]" }, { note: 0x44, led: 0x4B, unit: 2, target: "[Channel4]" },
    { note: 0x45, led: 0x4C, unit: 1, target: "[Master]" }, { note: 0x46, led: 0x4D, unit: 2, target: "[Master]" }
];

NumarkNS6.FX.initRouting = function() {
    NumarkNS6.FX.RoutingTable.forEach(function(cfg) {
        var group = "[EffectRack1_EffectUnit" + cfg.unit + "]", key = "group_" + cfg.target + "_enable";
        NumarkNS6.FX.Assign["btn_" + cfg.unit + "_" + cfg.target.replace(/[\[\]]/g, "")] = new components.Button({
            midi: [0x90, cfg.note], group: group, key: key,
            input: function (ch, ctrl, val, st, grp) { if (val > 0) engine.setValue(grp, key, !engine.getValue(grp, key)); }
        });
        engine.makeConnection(group, key, function(v) { if (!NumarkNS6.isBooting) midi.sendShortMsg(0xB0, cfg.led, v > 0 ? 0x7F : 0x00); }).trigger();
    });
};

NumarkNS6.btnEfeitos = function(ch, ctrl, val) { if (val > 0) engine.setValue("[Skin]", "show_effectrack", !engine.getValue("[Skin]", "show_effectrack")); };
NumarkNS6.btnMixer = function(ch, ctrl, val) { if (val > 0) engine.setValue("[Skin]", "show_mixer", !engine.getValue("[Skin]", "show_mixer")); };
NumarkNS6.btnSamplers = function(ch, ctrl, val) { if (val > 0) engine.setValue("[Skin]", "show_samplers", !engine.getValue("[Skin]", "show_samplers")); };


// =======================================================
// 🌙 FUNÇÃO SHUTDOWN (O APAGÃO FINAL)
// =======================================================

NumarkNS6.shutdown = function () {
    // 1. Mata todos os timers na hora
    if (NumarkNS6.displayTimer !== 0) engine.stopTimer(NumarkNS6.displayTimer);
    if (NumarkNS6.blinkTimer !== 0) engine.stopTimer(NumarkNS6.blinkTimer);
    if (NumarkNS6.animTimer !== 0) engine.stopTimer(NumarkNS6.animTimer);
    if (NumarkNS6.parachuteTimer !== 0) engine.stopTimer(NumarkNS6.parachuteTimer);

    // 2. Apaga luzes mecânicas varrendo a placa inteira
    for (var i = 0; i <= 4; i++) {
        for (var cc = 0x00; cc <= 0x51; cc++) midi.sendShortMsg(0xB0 + i, cc, 0x00);
        for (var note = 0x00; note <= 0x50; note++) midi.sendShortMsg(0x80 + i, note, 0x00);
    }
    midi.sendShortMsg(0x80, 0x31, 0x00); midi.sendShortMsg(0x80, 0x32, 0x00); 
    midi.sendShortMsg(0x80, 0x33, 0x00); midi.sendShortMsg(0x80, 0x34, 0x00); 

    // 3. Devolve a curva original de Crossfader ao Mixxx
    if (!NumarkNS6.CrossfaderChangeCallback.changed || (NumarkNS6.Mixer && NumarkNS6.Mixer.changeCrossfaderContour && NumarkNS6.Mixer.changeCrossfaderContour.state)) {
        Object.keys(NumarkNS6.storedCrossfaderParams).forEach(function (ctrl) { engine.setValue("[Mixer Profile]", ctrl, NumarkNS6.storedCrossfaderParams[ctrl]); });
    }

    // 4. Sinal Final SysEx (Fim de Festa)
    midi.sendSysexMsg([0xF0, 0x00, 0x01, 0x3F, 0x7F, 0x79, 0x60, 0x00, 0x01, 0x49, 0x01, 0x00, 0x00, 0x00, 0x00, 0xF7], 16);
    print("Numark NS6: Shutdown RC3 Concluído com Sucesso.");
};