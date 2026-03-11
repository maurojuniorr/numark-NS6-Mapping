var NumarkNS6 = {};

NumarkNS6.Decks = [];
NumarkNS6.jogMSB = [0, 0, 0, 0, 0];
NumarkNS6.jogLSB = [0, 0, 0, 0, 0];
NumarkNS6.lastJogValue = [0, 0, 0, 0, 0];
NumarkNS6.blinkState = 0;
NumarkNS6.blinkTimer = 0;
NumarkNS6.scratchSettings = { "alpha": 1.0/4, "beta": 1.0/4/32, "jogResolution": 2500, "vinylSpeed": 33.33 };
// --- 2. MOTOR DE LEDs (O "Coração") ---
NumarkNS6.updatePlayCueLEDs = function(deckNum, midiChannel) {
    var group = "[Channel" + deckNum + "]";
    var statusCC = 0xB0 + midiChannel;
    
    var isPlaying = engine.getValue(group, "play");
    var isLoaded = engine.getValue(group, "track_loaded");
    
    // Lê DIRETAMENTE do Mixxx se o botão Cue está sendo pressionado fisicamente
    var isCueHeld = engine.getValue(group, "cue_default"); 
    
    var blink = NumarkNS6.blinkState;

    if (!isLoaded) {
        midi.sendShortMsg(statusCC, 0x09, 0x00);
        midi.sendShortMsg(statusCC, 0x08, 0x00);
        return;
    }

    // PRIORIDADE ABSOLUTA 1: Dedo no botão Cue (Modo Preview)
    if (isCueHeld > 0) {
        midi.sendShortMsg(statusCC, 0x09, 0x7F); // Play Aceso Fixo
        midi.sendShortMsg(statusCC, 0x08, 0x7F); // Cue Aceso Fixo
        return; // O return trava a função aqui!
    } 
    
    // PRIORIDADE 2: Música Tocando Sozinha (Mão fora do controle)
    if (isPlaying) {
        midi.sendShortMsg(statusCC, 0x09, 0x7F); // Play Aceso Fixo
        midi.sendShortMsg(statusCC, 0x08, 0x00); // Cue Apagado
        return;
    } 
        
    // PRIORIDADE 3: Música Pausada
    var cuePoint = engine.getValue(group, "cue_point");
    var trackSamples = engine.getValue(group, "track_samples");
    var playPos = engine.getValue(group, "playposition");
    
    var atCuePoint = false;
    
    // Lógica Matemática: Calcula se a agulha está em cima do CuePoint gravado
    if (trackSamples > 0 && cuePoint !== -1) {
        var currentSample = playPos * trackSamples;
        if (Math.abs(currentSample - cuePoint) < 5000) {
            atCuePoint = true; // Está no ponto exato
        }
    } else if (playPos <= 0.002) {
        // Se não tem CuePoint gravado, o início da música age como um
        atCuePoint = true; 
    }

    if (atCuePoint) {
        midi.sendShortMsg(statusCC, 0x09, 0x00); // Play OFF
        midi.sendShortMsg(statusCC, 0x08, 0x7F); // Cue Aceso Fixo
    } else {
        midi.sendShortMsg(statusCC, 0x09, blink); // Play Pisca
        midi.sendShortMsg(statusCC, 0x08, blink); // Cue Pisca
    }
};

//perfect dont touch!
NumarkNS6.updateSyncLED = function(deckNum, midiChannel) {
    var group = "[Channel" + deckNum + "]";
    var midiChan = midiChannel;
    
    var isSync = engine.getValue(group, "sync_enabled");
    var isPlaying = engine.getValue(group, "play");
    var beatActive = engine.getValue(group, "beat_active");

    // 1. Se o Sync está desligado -> Apaga tudo
    if (!isSync) {
        midi.sendShortMsg(0xB0 + midiChan, 0x07, 0x00);
        return;
    }

    // 2. Se está ligado E tocando -> Pulsa com a batida
    if (isPlaying) {
        midi.sendShortMsg(0xB0 + midiChan, 0x07, beatActive ? 0x7F : 0x00);
    } 
    // 3. Se está ligado E pausado -> Fica aceso fixo
    else {
        midi.sendShortMsg(0xB0 + midiChan, 0x07, 0x7F);
    }
};

NumarkNS6.startBlinkTimer = function() {
    if (NumarkNS6.blinkTimer !== 0) engine.stopTimer(NumarkNS6.blinkTimer);
    NumarkNS6.blinkTimer = engine.beginTimer(500, function() {
        NumarkNS6.blinkState = (NumarkNS6.blinkState === 0) ? 0x7F : 0;
        for (var i = 1; i <= 4; i++) {
            if (NumarkNS6.Decks[i]) { // Trava de segurança
                NumarkNS6.updatePlayCueLEDs(i, NumarkNS6.Decks[i].midiChannel);
                NumarkNS6.updateSyncLED(i, NumarkNS6.Decks[i].midiChannel);
            }
        }
    });
};
NumarkNS6.searchAmplification = 5; // multiplier for the jogwheel when the search button is held down.

NumarkNS6.warnAfterTime = 30; // Acts like the "End of Track warning" setting within the waveform settings.

NumarkNS6.blinkInterval=1000; //blinkInterval for the triangular Leds over the channels in milliseconds.

NumarkNS6.encoderResolution=0.05; // 1/encoderResolution = number of steps going from 0% to 100%

NumarkNS6.resetHotCuePageOnTrackLoad=true; // resets the page of the Hotcue back to 1 after loading a new track.

NumarkNS6.cueReverseRoll=true; // enables the ability to do a reverse roll while shift-pressing the cue button

// true = wrap around => scrolling past 4 will reset the page to the first page and vice versa
// false = clamp the the pages to the [1:4] range
NumarkNS6.hotcuePageIndexBehavior=true;

// possible ranges (0.0..3.0 where 0.06=6%)
NumarkNS6.rateRanges = [0,   // default (gets set via script later; don't modify)
    0.06, // one semitone
    0.24, // for maximum freedom
];

//
// CONSTANTS DO NOT CHANGE (if you don't know what you are doing)
//
NumarkNS6.QueryStatusMessage=[0xF0, 0x00, 0x01, 0x3F, 0x7F, 0x47, 0x60, 0x00, 0x01, 0x54, 0x01, 0x00, 0x00, 0x00, 0x00, 0xF7];
//NumarkNS6.ShutoffSequence=[0xF0,0x00,0x01,0x3F,0x7F,0x47,0xB0,0x39,0x00,0x01,0xF7]; // Invalid Midibyte?

NumarkNS6.vinylTouched = [false, false, false, false];

NumarkNS6.globalShift = false;

NumarkNS6.scratchXFader = {
    xFaderMode: 0, // fast cut (additive)
    xFaderCurve: 999.60,
    xFaderCalibration: 1.0
};

components.Encoder.prototype.input = function(_channel, _control, value, _status, _group) {
    this.inSetParameter(
        this.inGetParameter()+(
            (value===0x01)?
                NumarkNS6.encoderResolution:
                -NumarkNS6.encoderResolution
        )
    );
};

components.Component.prototype.send = function(value) {
    // This Override is supposed to make integration automatic assignment of elements easier.
    // Right now it just allows specifying the input and output bytes (even though the input bytes dont do anything right now.)
    if (this.midi === undefined || this.midi[0] === undefined || this.midi[1] === undefined) {
        return;
    }
    if (this.midi[2]===undefined) { //check if output channel/type not explicitly defined
        this.midi[2]=this.midi[0];
    }
    if (this.midi[3]===undefined) { //check if output control not explicitly defined
        this.midi[3]=this.midi[1];
    }
    midi.sendShortMsg(this.midi[2], this.midi[3], value);
    if (this.sendShifted) {
        if (this.shiftChannel) {
            midi.sendShortMsg(this.midi[2] + this.shiftOffset, this.midi[3], value);
        } else if (this.shiftControl) {
            midi.sendShortMsg(this.midi[2], this.midi[3] + this.shiftOffset, value);
        }
    }
};

// gets filled via trigger of the callbacks in NumarkNS6.crossfaderCallbackConnections
NumarkNS6.storedCrossfaderParams = {};
NumarkNS6.crossfaderCallbackConnections = [];
NumarkNS6.CrossfaderChangeCallback = function(value, group, control) {
    // indicates that the crossfader settings were changed while during session
    this.changed = true;
    NumarkNS6.storedCrossfaderParams[control] = value;
};

NumarkNS6.init = function() {
midi.sendSysexMsg(NumarkNS6.QueryStatusMessage, NumarkNS6.QueryStatusMessage.length);
    NumarkNS6.rateRanges[0]=engine.getValue("[Channel1]", "rateRange");

    
    NumarkNS6.Decks = [];
    for (var i = 1; i <= 4; i++) {
        NumarkNS6.Decks[i] = new NumarkNS6.Deck(i);
        (function(dIdx) {
            var g = "[Channel" + dIdx + "]";
            var mChan = NumarkNS6.Decks[dIdx].midiChannel;

            // Atualiza Play/Cue/Sync em qualquer mudança de estado importante
            engine.makeConnection(g, "play", function() { 
                NumarkNS6.updatePlayCueLEDs(dIdx, mChan);
                NumarkNS6.updateSyncLED(dIdx, mChan); 
            });
            
            engine.makeConnection(g, "sync_enabled", function() { 
                NumarkNS6.updateSyncLED(dIdx, mChan); 
            });
            
            engine.makeConnection(g, "track_loaded", function() { 
                NumarkNS6.updatePlayCueLEDs(dIdx, mChan); 
            });
            // 🔥 O ATALHO: Atualiza os LEDs assim que o botão Cue é tocado
            engine.makeConnection(g, "cue_default", function() {
                if (NumarkNS6.Decks[dIdx]) {
                    NumarkNS6.updatePlayCueLEDs(dIdx, mChan);
                }
            });
            // O pulso da batida agora chama a função centralizada
            engine.makeConnection(g, "beat_active", function() {
                NumarkNS6.updateSyncLED(dIdx, mChan);
            });
            
        })(i);
    }

    // create xFader callbacks and trigger them to fill NumarkNS6.storedCrossfaderParams
    _.forEach(NumarkNS6.scratchXFader, function(value, control) {
        var connectionObject = engine.makeConnection("[Mixer Profile]", control, NumarkNS6.CrossfaderChangeCallback.bind(this));
        connectionObject.trigger();
        NumarkNS6.crossfaderCallbackConnections.push(connectionObject);
    });

    NumarkNS6.Mixer = new NumarkNS6.MixerTemplate();
 NumarkNS6.startBlinkTimer(); // Inicia o motor de piscagem retornar!
    midi.sendSysexMsg(NumarkNS6.QueryStatusMessage, NumarkNS6.QueryStatusMessage.length);
};


NumarkNS6.topContainer = function(channel) {
    this.group = "[Channel"+channel+"]";
    var theContainer = this;
var dChan = channel; // Captura o canal para as funções internas

    this.hotCue1 = new components.Button({
        midi: [0x90+channel, 0x2B, 0xB0+channel, 0x0B],
        shift: function() {
            this.group="[EffectRack1_EffectUnit1]";
            this.type=components.Button.prototype.types.toggle;
            this.inKey = "hotcue_1_clear";
            this.outKey = "hotcue_1_enabled";
        },
        unshift: function() {
            this.group=theContainer.group;
            this.type=components.Button.prototype.types.push;
            this.inKey = "hotcue_1_activate";
            this.outKey = "hotcue_1_enabled";
        },
    });
    this.hotCue2 = new components.Button({
        midi: [0x90+channel, 0x14, 0xB0+channel, 0x0C],
        shift: function() {
            this.group="[EffectRack1_EffectUnit2]";
            this.type=components.Button.prototype.types.toggle;
            this.inKey = "hotcue_2_clear";
            this.outKey = "hotcue_2_enabled";
        },
        unshift: function() {
            this.group=theContainer.group;
            this.type=components.Button.prototype.types.push;
            this.inKey = "hotcue_2_activate";
            this.outKey = "hotcue_2_enabled";
        },
    });
    this.hotCue3 = new components.Button({
        midi: [0x90+channel, 0x15, 0xB0+channel, 0x0D],
        shift: function() {
            this.type=components.Button.prototype.types.toggle;
            this.inKey = "hotcue_3_clear";
            this.outKey = "hotcue_3_enabled";
        },
        unshift: function() {
            this.type=components.Button.prototype.types.push;
            this.inKey = "hotcue_3_activate";
            this.outKey = "hotcue_3_enabled";
        },
    });
    this.hotCue4 = new components.Button({
        midi: [0x90+channel, 0x16, 0xB0+channel, 0x0E],
        outKey: "loop_enabled",
        shift: function() {
            this.inKey = "hotcue_4_clear";
            this.outKey = "hotcue_4_enabled";
        },
        unshift: function() {
            this.type=components.Button.prototype.types.push;
            this.inKey = "hotcue_4_activate";
            this.outKey = "hotcue_4_enabled";
        },
    });
    this.hotCue5 = new components.Button({
        midi: [0x90+channel, 0x17, 0xB0+channel, 0x0F],
        outKey: "loop_enabled",
        shift: function() {
            this.inKey = "hotcue_5_clear";
            this.outKey = "hotcue_5_enabled";
        },
        unshift: function() {
            this.type=components.Button.prototype.types.push;
            this.inKey = "hotcue_5_activate";
            this.outKey = "hotcue_5_enabled";
        },
    });

    // custom Hotcue Buttons
    this.hotcueButtons=[];

    for (var counter=0; counter<=3; counter++) {
        this.hotcueButtons[counter] = new components.HotcueButton({
            midi: [0x90+channel, 0x27+counter, 0xB0+channel, 0x18+counter],
            number: counter+1,
        });
    }
    this.encFxParam1 = new components.Encoder({
        midi: [0xB0+channel, 0x57],
        group: "[EffectRack1_EffectUnit1]",
        shift: function() {
            this.inKey="mix";
        },
        unshift: function() {
            this.inKey="super1";
        },
    });
    //Fxparameter
    this.encFxParam2 = new components.Encoder({
        midi: [0xB0+channel, 0x58],
        group: "[EffectRack1_EffectUnit2]",
        shift: function() {
            this.inKey="mix";
        },
        unshift: function() {
            this.inKey="super1";
        },
    });
    this.encSample3 = new components.Encoder({
        midi: [0xB0+channel, 0x5A],
        hotCuePage: 0,
        applyHotcuePage: function(layer, displayFeedback) {
            // ES3 doesn't allow default values in the function signature
            // Could be replaced after migration to QJSEngine by "displayFeedback=true"
            // in the function arguments.
            if (displayFeedback === undefined) {
                displayFeedback = true;
            }
            // when the layer becomes negative, the (layer+4) will force a positive/valid page indexOf
            layer = NumarkNS6.hotcuePageIndexBehavior ? (layer+4)%4 : Math.max(Math.min(layer, 3), 0); // clamp layer value to [0;3] range
            this.hotCuePage = layer;
            if (this.timer !== 0) {
                engine.stopTimer(this.timer);
                this.timer = 0;
            }
            var number = 0;
            for (var i=0; i<theContainer.hotcueButtons.length; ++i) {
                number = (i+1)+theContainer.hotcueButtons.length*this.hotCuePage;
                theContainer.hotcueButtons[i].disconnect();
                theContainer.hotcueButtons[i].number=number;
                theContainer.hotcueButtons[i].outKey="hotcue_" + number + "_enabled";
                theContainer.hotcueButtons[i].unshift(); // for setting inKey based on number property.
                theContainer.hotcueButtons[i].connect();
                theContainer.hotcueButtons[i].trigger();
            }
            //  displays the current hotcuepage index within the upper row of the buttongrid
            if (displayFeedback) {
                for (i=0; i<4; ++i) {
                    midi.sendShortMsg(0xB0+channel, 0x0B+i, (i-this.hotCuePage)?0x00:0x7F);
                }
            }
            this.timer = engine.beginTimer(1000, function() {
                theContainer.reconnectComponents();
                // Aqui não usamos "this.timer" porque o contexto muda dentro da function
                // Mas o timer é parado automaticamente pelo terceiro argumento 'true'
            }, true);
        },
        shift: function() {
            this.group=theContainer.group;
            this.input = function(_channel, _control, value, _status, _group) {
                if (value === 0x01) {
                    engine.setParameter(this.group, "loop_double", 1);
                } else {
                    engine.setParameter(this.group, "loop_halve", 1);
                }
            };
        },
        unshift: function() {
            this.input = function(_channel, _control, value, _status, _group) {
                this.applyHotcuePage(this.hotCuePage+(value===0x01?1:-1));
            };
        },
    });
    //fx mix
    this.encSample4 = new components.Encoder({
        midi: [0xB0+channel, 0x59],
        shift: function() {
            this.inKey="beatjump_size";
            this.input = function(_channel, _control, value, _status, _group) {
                this.inSetValue(this.inGetValue() * (value===0x01 ? 2 : 0.5));
            };
        },
        unshift: function() {
            this.input = function(_channel, _control, value, _status, _group) {
                script.triggerControl(this.group, (value===1)?"beatjump_forward":"beatjump_backward");
            };
        },
    });
    this.shutdown = function() {
    // turn off hotcueButtons
        for (var i=0; i<theContainer.hotcueButtons.length; i++) {
            theContainer.hotcueButtons[i].send(0);
        }
        // turn all remaining LEDS of the topContainer
        theContainer.hotCue1.send(0);
        theContainer.hotCue2.send(0);
        theContainer.hotCue3.send(0);
        theContainer.hotCue4.send(0);
        theContainer.hotCue5.send(0);
    };

    if (NumarkNS6.resetHotCuePageOnTrackLoad) {
        engine.makeConnection(this.group, "track_loaded", function(_value, _group, _control) {
            theContainer.encSample3.applyHotcuePage(0, false);
            // resets the hotcuepage to 0 hidden (without feedback to the user);
        });
    }
};
NumarkNS6.topContainer.prototype = new components.ComponentContainer();

NumarkNS6.MixerTemplate = function() {
    //channel will always be 0 it can be "hardcoded" into the components
    this.deckChangeL = new components.Button({
        midi: [0xB0, 0x50],
        input: function(_channel, _control, value, _status, _group) {
            this.output(value);
            //just "echos" the midi since the controller knows the deck its on itself but doesn't update the corresponding leds.
        },
    });
    this.deckChangeR = new components.Button({
        midi: [0xB0, 0x51],
        input: function(_channel, _control, value, _status, _group) {
            this.output(value);
        },
    });

    this.channelInputSwitcherL = new components.Button({
        midi: [0x90, 0x49],
        group: "[Channel3]",
        inKey: "mute",
    });
    this.channelInputSwitcherR = new components.Button({
        midi: [0x90, 0x4A],
        group: "[Channel4]",
        inKey: "mute",
    });

    this.changeCrossfaderContour = new components.Button({
        midi: [0x90, 0x4B],
        state: false,
        input: function(channel, control, value, status, _group) {
            _.forEach(NumarkNS6.crossfaderCallbackConnections, function(callbackObject) {
                callbackObject.disconnect();
            });
            NumarkNS6.crossfaderCallbackConnections = [];
            this.state=this.isPress(channel, control, value, status);
            if (this.state) {
                _.forEach(NumarkNS6.scratchXFader, function(value, control) {
                    engine.setValue("[Mixer Profile]", control, value);
                    NumarkNS6.crossfaderCallbackConnections.push(
                        engine.makeConnection("[Mixer Profile]", control, NumarkNS6.CrossfaderChangeCallback.bind(this))
                    );
                });
            } else {
                _.forEach(NumarkNS6.storedCrossfaderParams, function(value, control) {
                    engine.setValue("[Mixer Profile]", control, value);
                    NumarkNS6.crossfaderCallbackConnections.push(
                        engine.makeConnection("[Mixer Profile]", control, NumarkNS6.CrossfaderChangeCallback.bind(this))
                    );
                });
            }
        }
    });

    this.navigationEncoderTick = new components.Encoder({
        midi: [0xB0, 0x44],
        group: "[Library]",
        stepsize: 1,
        shift: function() {
            this.inKey="MoveFocus";
        },
        unshift: function() {
            this.inKey="MoveVertical";
        },
        input: function(_midiChannel, _control, value, _status, _group) {
            this.inSetValue(value===0x01?this.stepsize:-this.stepsize); // value "rescaling"; possibly inefficient.
        },
    });
    this.navigationEncoderButton = new components.Button({
        shift: function() {
            this.type=components.Button.prototype.types.toggle;
            this.group="[Skin]";
            this.inKey="show_maximized_library";
        },
        unshift: function() {
            this.type=components.Button.prototype.types.push;
            this.group="[Library]";
            this.inKey="GoToItem";
        },
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
    

        
    // --- VARIÁVEIS DE ESTADO ---
    this.scratchMode = true; 
    this.isSearching = false;

    this.topContainer = new NumarkNS6.topContainer(channel);
    this.topContainer.reconnectComponents(function(component) {
        if (component.group === undefined) {
            component.group = this.group;
        }
    });
    this.eqKnobs = [];

    for (var i = 1; i <= 3; i++) {
        this.eqKnobs[i] = new components.Pot({
            midi: [0xB0, 0x29 + i + 5*(channel-1)],
            group: "[EqualizerRack1_"+theDeck.group+"_Effect1]",
            inKey: "parameter" + i,

            // The exact center of the Pots on my N4 are roughly around 0x3e instead of 0x40
            // This is a Hack which adds that offset back when the pot is in the center range.
            // The Pot snaps physically between values of 7700 and 8300.
            // 0.469970703125=7700/(1<<14) 0.506591796875=8300/(1<<14)
            // 0.015625=(0x40-0x3e)/0x80 => normalized offset
            inValueScale: function(value) {
                if (value > this.max*0.469970703125 && value < this.max*0.506591796875) {
                    return (value + this.max*0.015625) / this.max;
                } else {
                    return value / this.max;
                }
            },
        });
    }
    // for some reason the gainKnobs don't suffer the same issues as the EQKnobs
    this.gainKnob = new components.Pot({
        midi: [0xB0, 0x2C + 5*(channel-1)],
        shift: function() {
            this.group="[QuickEffectRack1_"+theDeck.group+"]";
            this.inKey="super1";
        },
        unshift: function() {
            this.group=theDeck.group;
            this.inKey="pregain";
        }
    });

    // --- PLAY, CUE E SYNC ---
    this.playButton = new components.PlayButton({
        midi: [0x90 + channel, 0x11, 0xB0 + channel, 0x09],
        group: groupName,
        outKey: null,
        input: function(ch, ct, val, status) {
            components.PlayButton.prototype.input.apply(this, arguments);
            NumarkNS6.updatePlayCueLEDs(theDeck.deckNum, theDeck.midiChannel);
        }
    });

    this.cueButton = new components.CueButton({
        midi: [0x90 + channel, 0x10, 0xB0 + channel, 0x08],
        group: groupName,
        outKey: null,
        reverseRollOnShift: NumarkNS6.cueReverseRoll
    });

    // --- BOTÃO SYNC (Com atualização de LED manual) ---
    this.syncButton = new components.SyncButton({
        midi: [0x90 + channel, 0x0F], // Apenas entrada
        group: groupName,
        outKey: null // Deixa a conexão beat_active lá do init mandar no LED
    });

    this.shiftButton = new components.Button({
        midi: [0x90+channel, 0x12, 0xB0+channel, 0x0A],
        type: components.Button.prototype.types.powerWindow,
        state: false, //custom property
        inToggle: function() {
            this.state=!this.state;
            if (this.state) {
                theDeck.shift();
                NumarkNS6.Mixer.shift();
            } else {
                theDeck.unshift();
                NumarkNS6.Mixer.unshift();
            }
            this.output(this.state);
            theDeck.topContainer.reconnectComponents(function(component) {
                if (component.group === undefined) {
                    component.group = this.group;
                }
            });
        },
    });

    // NOTE: THE ORIENTATION BUTTONS BEHAVE REALLY WEIRD AND THE FOLLOWING IS REALLY CONFUSING BUT WORKS!
    this.orientationButtonLeft = new components.Button({
        midi: [0x90, 0x32+channel*2, 0xB0, 0x42+channel*2],
        key: "orientation",
        input: function(_channel, _control, value, _status, _group) {
            if (!this.ignoreNext) {
                if (value===0x7F) {
                    this.inSetValue(0);
                    theDeck.orientationButtonRight.ignoreNextOff = true;
                    this.ignoreNextOff=false;
                } else if (!this.ignoreNextOff && value===0x00) {
                    this.inSetValue(1);
                }
            } else { this.ignoreNext=false; }
        },
        output: function(value, _group, _control) {
            this.send(value===0?0x7F:0x00);
            this.ignoreNext=true;
            if (value===0) { theDeck.orientationButtonRight.ignoreNextOff = true; }
        },
    });
    this.orientationButtonRight = new components.Button({
        midi: [0x90, 0x33+channel*2, 0xB0, 0x43+channel*2],
        key: "orientation",
        input: function(_channel, _control, value, _status, _group) {
            if (!this.ignoreNext) {
                if (value===0x7F) {
                    this.inSetValue(2);
                    theDeck.orientationButtonLeft.ignoreNextOff = true;
                    this.ignoreNextOff=false;
                } else if (!this.ignoreNextOff && value===0x00) {
                    this.inSetValue(1);
                }
            } else { this.ignoreNext=false; }
        },
        output: function(value, _group, _control) {
            this.send(value===2?0x7F:0x00);
            if (value===2) { theDeck.orientationButtonLeft.ignoreNextOff = true; }
            this.ignoreNext=true;
        },
    });

    this.pflButton = new components.Button({
        midi: [0x90, 0x30+channel, 0xB0, 0x3F+channel],
        key: "pfl",
        // The controller echos every change to the pfl lights which would cause
        // an infinite feedback loop (flicker)
        // this workaround uses a timer (100ms) to ignore the echoing messages.
        flickerSafetyTimeout: true,
        input: function(_channel, _control, value, _status, _group) {
            if (this.flickerSafetyTimeout) {
                this.flickerSafetyTimeout=false;
                value/=0x7F;
                if (this.inGetParameter()!==value) {
                    this.inSetParameter(value);
                }
                engine.beginTimer(100, () => {
                    this.flickerSafetyTimeout=true;
                }, true);
            }
        },
    });
    this.loadButton = new components.Button({
        midi: [0x90+channel, 0x06],
        shift: function() { this.inKey="eject"; },
        unshift: function() { this.inKey="LoadSelectedTrack"; },
    });



    this.manageChannelIndicator = () => {
        this.duration=engine.getParameter(theDeck.group, "duration");
        // checks if the playposition is in the warnTimeFrame
        if (engine.getParameter(theDeck.group, "playposition") * this.duration > (this.duration - NumarkNS6.warnAfterTime)) {
            this.alternating=!this.alternating; //mimics a static variable
            midi.sendShortMsg(0xB0, 0x1D+channel, this.alternating?0x7F:0x0);
        } else {
            midi.sendShortMsg(0xB0, 0x1D+channel, 0x7F);
        }
    };
    engine.makeConnection(this.group, "track_loaded", function(value) {
        if (value === 0) {
            // track ejected, stop timer and manager
            engine.stopTimer(theDeck.blinkTimer);
            theDeck.blinkTimer=0;
            return; // return early so no new timer gets created.
        }
        // this previouslyLoaded guard is needed because every time a new track gets
        // loaded into a deck without previously ejecting, a new timer would get
        // spawned which conflicted with the old (still running) timers.
        if (!this.previouslyLoaded) {
            //timer is more efficient is this case than a callback because it would be called too often.
            theDeck.blinkTimer=engine.beginTimer(NumarkNS6.blinkInterval, theDeck.manageChannelIndicator.bind(this), true);
        }
        this.previouslyLoaded=value;
    }.bind(this));
    //do not touch
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
    //do not touch
    this.pitchBendPlus = new components.Button({
        midi: [0x90+channel, 0x19, 0xB0+channel, 0x3C],
        key: "rate_temp_up",
        shift: function() {
            this.inkey = "rate_temp_up_small";
        },
        unshift: function() {
            this.inkey = "rate_temp_up";
        }
    });


    this.tapButton = new components.Button({
        midi: [0x90+channel, 0x1E, 0xB0+channel, 0x16],
        bpm: [],
        input: function(channelmidi, control, value, status, _group) {
            if (this.isPress(channelmidi, control, value, status)) {
                bpm.tapButton(channel);
            }
            this.output(value);
        },
    });
    //do not touch
    this.keylockButton = new components.Button({
        midi: [0x90+channel, 0x1B, 0xB0+channel, 0x10],
        type: components.Button.prototype.types.toggle,
        shift: function() {
            // quantize is already handled by the components syncButton
            this.inKey="sync_key";
            this.outKey="sync_key";
        },
        unshift: function() {
            this.inKey="keylock";
            this.outKey="keylock";
        }
    });
    //do not touch
    this.bpmSlider = new components.Pot({
        midi: [0xB0+channel, 0x01, 0xB0+channel, 0x37], //only specifying input MSB
        inKey: "rate",
        group: theDeck.group,
        invert: true,
    });
    //do not touch
    this.pitchLedHandler = engine.makeConnection(this.group, "rate", function(value) {
    // Turns on when rate slider is centered
        midi.sendShortMsg(0xB0+channel, 0x37, value===0 ? 0x7F : 0x00);
    }.bind(this));
    this.pitchLedHandler.trigger();

    //Do not touch!
    this.pitchRange = new components.Button({
        midi: [0x90+channel, 0x1A, 0xB0+channel, 0x1E],
        key: "rateRange",
        ledState: false,
        input: function() {
            if (theDeck.rateRangeEntry===NumarkNS6.rateRanges.length) {
                theDeck.rateRangeEntry=0;
            }
            this.inSetValue(NumarkNS6.rateRanges[theDeck.rateRangeEntry++]);
        },
        // NOTE: Just toggles to provide some visual Feedback.
        output: function() {
            this.send(this.ledState);
            this.ledState=!this.ledState;
        },
    });

    this.reconnectComponents(function(c) {
        if (c.group === undefined || c.group === "") {
            c.group = groupName;
        }
    });
    this.shutdown = function() {
        this.topContainer.shutdown();
        this.pitchLedHandler.disconnect();
        midi.sendShortMsg(0xB0+channel, 0x37, 0); // turn off pitchLED
        this.pitchRange.send(0);
        this.keylockButton.send(0);
        // this.scratchButton.send(0);
        this.tapButton.send(0);
        this.syncButton.send(0);
        this.pitchBendPlus.send(0);
        this.pitchBendMinus.send(0);
        this.cueButton.send(0);
        this.playButton.send(0);
        this.shiftButton.send(0);
        if (theDeck.blinkTimer !== 0) {
            engine.stopTimer(theDeck.blinkTimer);
        }
        midi.sendShortMsg(0xB0, 0x1D+channel, 0); // turn off small triangle above LOAD button.
    };
};

NumarkNS6.Deck.prototype = new components.Deck();

NumarkNS6.shutdown = function() {
    for (var i=1; i<=4; i++) {
    // View Definition of Array for explanation.
        NumarkNS6.Decks[i].shutdown();
    }
    // revert the crossfader parameters only if they haven't been changed by the
    // user and if they are currently set to scratch
    if (!NumarkNS6.CrossfaderChangeCallback.changed || NumarkNS6.changeCrossfaderContour.state) {
        _.forEach(NumarkNS6.storedCrossfaderParams, function(value, control) {
            engine.setValue("[Mixer Profile]", control, value);
        });
    }
    // midi.sendSysexMsg(NumarkNS6.ShutoffSequence,NumarkNS6.ShutoffSequence.length);
};

NumarkNS6.jogMove14bit = function(channel, control, value, status, group) {
    var deckNum = script.deckFromGroup(group);
    if (control === 0x00) NumarkNS6.jogMSB[deckNum] = value;
    if (control === 0x20) NumarkNS6.jogLSB[deckNum] = value;
    if (control !== 0x20) return;

    var fullValue = (NumarkNS6.jogMSB[deckNum] << 7) | NumarkNS6.jogLSB[deckNum];
    if (NumarkNS6.lastJogValue[deckNum] === undefined) NumarkNS6.lastJogValue[deckNum] = fullValue;
    var delta = fullValue - NumarkNS6.lastJogValue[deckNum];
    NumarkNS6.lastJogValue[deckNum] = fullValue;
    
    if (delta > 8192) delta -= 16384;
    else if (delta < -8192) delta += 16384;

    if (engine.isScratching(deckNum)) {
        engine.scratchTick(deckNum, delta);
    } else {
        engine.setValue(group, "jog", delta / 15);
    }
};

NumarkNS6.scratchButtonInput = function(channel, control, value, status, group) {
    // Ignora quando tira o dedo do botão
    if (value === 0) return;

    var deckNum = script.deckFromGroup(group);
    if (!NumarkNS6.Decks[deckNum]) return;

    var deck = NumarkNS6.Decks[deckNum];
    
    // Trava de segurança da variável
    if (deck.scratchMode === undefined) {
        deck.scratchMode = true;
    }
    
    // Inverte a lógica (True = Scratch, False = Move)
    deck.scratchMode = !deck.scratchMode;

    var ledState = deck.scratchMode ? 0x7F : 0x00;

    // O SEGREDO REVELADO PELA N4: O LED responde na porta CC 0x12!
    midi.sendShortMsg(0xB0 + channel, 0x12, ledState); 
};

NumarkNS6.jogTouch14bit = function(channel, control, value, status, group) {
    var deckNum = script.deckFromGroup(group);
    
    if (!NumarkNS6.Decks[deckNum]) return;

    var isTouched = (value > 0);
    
    // A MÁGICA DO BOTÃO: Só ativa o Scratch se o botão estiver ligado!
    if (isTouched && NumarkNS6.Decks[deckNum].scratchMode) {
        engine.scratchEnable(deckNum, NumarkNS6.scratchSettings.jogResolution, 33.33, NumarkNS6.scratchSettings.alpha, NumarkNS6.scratchSettings.beta);
    } else {
        // Se soltar o prato OU se o botão estiver desligado, libera o prato para Pitch Bend (Move)
        engine.scratchDisable(deckNum);
    }
};

