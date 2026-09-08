(function (ND) {
    "use strict";

    // Só este módulo coordena DOM, áudio, simulação e renderização.
    function boot() {
        var settings = {
            mode: "classic",
            circuit: 0,
            livery: 0,
            numPlayers: 1,
            difficulty: 1,
            camera: 0,
            quality: 2,
            muted: false,
        };
        var display = ND.createDisplay(document.getElementById("game"));
        var scene = ND.createSceneRenderer(),
            cockpit = ND.createCockpitRenderer();
        var hud = ND.createHUD(),
            audio = ND.createAudio();
        var SPR = ND.assets.buildSprites(3200),
            race,
            input,
            ui;
        var last = null,
            accumulator = 0,
            pulse = 0,
            bestScore = 0;
        var STEP = 1 / 60,
            REFDEPTH = 1 / Math.tan((50 * Math.PI) / 180);

        function rebuild() {
            if (settings.mode === "formula") ND.assets.buildFormulaSprites(SPR);
            var world = ND.createWorld(SPR, settings);
            race = ND.createRace(world, SPR, settings, {
                crash: function () {
                    audio.crash();
                },
                checkpoint: function () {
                    audio.checkpoint();
                },
            });
            cockpit.invalidate();
            accumulator = 0;
            last = null;
        }
        function start() {
            // A falta de áudio não impede a corrida (WebAudio pode ser bloqueado).
            try {
                audio.start();
            } catch (error) {
                console.warn("Áudio indisponível", error);
            }
            race.reset();
            race.state = "play";
            accumulator = 0;
            last = null;
            ui.show("play");
        }
        function pause() {
            if (race.state !== "play" && race.state !== "paused") return;
            race.state = race.state === "play" ? "paused" : "play";
            accumulator = 0;
            last = null;
            ui.show(race.state);
        }
        function menu() {
            race.state = "menu";
            ui.show("menu");
        }
        function setRaceSetting(key, value, valid) {
            if (race.state !== "menu" || !valid || settings[key] === value)
                return;
            settings[key] = value;
            rebuild();
            if (ui) ui.refresh();
        }
        function integer(v, max, min) {
            return Number.isInteger(v) && v >= (min || 0) && v <= max;
        }
        function camera(value) {
            if (!integer(value, 1)) return;
            settings.camera = value;
            cockpit.invalidate();
            if (ui) ui.refresh();
        }
        function quality(value) {
            if (!integer(value, 2)) return;
            settings.quality = value;
            display.resize(value);
            cockpit.invalidate();
            if (ui) ui.refresh();
        }
        function mute(value) {
            settings.muted = !!value;
            audio.setMuted(settings.muted);
            if (ui) ui.refresh();
        }
        rebuild();
        display.resize(settings.quality);
        input = ND.createInput({
            getState: function () {
                return race.state;
            },
            getNumPlayers: function () {
                return settings.numPlayers;
            },
            start: start,
            pause: pause,
            toggleCamera: function () {
                camera(settings.camera ? 0 : 1);
            },
            toggleQuality: function () {
                quality((settings.quality + 1) % 3);
            },
            toggleMute: function () {
                mute(!settings.muted);
            },
        });
        ui = ND.createUI(
            {
                getSettings: function () {
                    return Object.assign({}, settings);
                },
                setMode: function (v) {
                    setRaceSetting(
                        "mode",
                        v,
                        v === "classic" || v === "formula",
                    );
                },
                setCircuit: function (v) {
                    setRaceSetting(
                        "circuit",
                        v,
                        integer(v, ND.circuits.length - 1),
                    );
                },
                setLivery: function (v) {
                    setRaceSetting("livery", v, integer(v, 2));
                },
                setPlayers: function (v) {
                    setRaceSetting("numPlayers", v, integer(v, 2, 1));
                },
                setDifficulty: function (v) {
                    setRaceSetting("difficulty", v, integer(v, 2));
                },
                setCamera: camera,
                setQuality: quality,
                setMuted: mute,
                start: start,
                pause: pause,
                menu: menu,
            },
            input,
        );

        function render() {
            display.begin();
            var effects = {
                speed: 0,
                maxSpeed: race.maxSpeed,
                boost: 0,
                shake: 0,
                flash: 0,
                quality: settings.quality,
                safeMode: false,
            };
            var numP = settings.numPlayers;
            for (var i = 0; i < numP; i++) {
                var p = race.players[i];
                var vp = ND.util.viewportOf(
                    i,
                    numP,
                    display.width,
                    display.height,
                );
                var pull =
                    1 +
                    ND.util.clamp(vp[3] / Math.max(vp[2], 1) - 0.6, 0, 1.8) *
                        0.48;
                var camDist = (settings.camera ? 740 : 1800) * pull;
                var frame = Object.assign({}, p, {
                    W: vp[2],
                    H: vp[3],
                    sctx: display.sctx,
                    ectx: display.ectx,
                    state: race.state,
                    numP: numP,
                    curP: i,
                    mode: settings.mode,
                    quality: settings.quality,
                    camMode: settings.camera,
                    livery: (settings.livery + i) % 3,
                    camHeight: (settings.camera ? 900 : 2160) * pull,
                    camDist: camDist,
                    camPitch: settings.camera ? 0 : 0.15,
                    REFDEPTH: REFDEPTH,
                    maxSpeed: race.maxSpeed,
                    drawDist: Math.min(
                        race.world.segments.length - 1,
                        Math.round(
                            [190, 280, 370][settings.quality] *
                                (numP === 2 ? 0.72 : 1),
                        ),
                    ),
                    position: ND.util.increase(
                        p.position,
                        -camDist * REFDEPTH,
                        race.world.trackLength,
                    ),
                    playerSprites: p.spriteAngles,
                    otherPlayers: race.players
                        .filter(function (_, j) {
                            return j !== i;
                        })
                        .map(function (other) {
                            return {
                                position: ND.util.increase(
                                    other.position,
                                    -camDist * REFDEPTH,
                                    race.world.trackLength,
                                ),
                                playerX: other.playerX,
                                sprite: other.spriteAngles[3],
                                dead: other.dead || other.finished,
                            };
                        }),
                    sunPulse: pulse,
                    NITRO_MAX: race.nitroMax,
                    pDead: p.dead,
                    SPR: SPR,
                    world: race.world,
                    difficulty: race.difficulty,
                    race: race.hudFor(i),
                    circuit: race.world.circuit,
                });
                display.beginView(vp);
                try {
                    var rendered = scene.render(frame);
                    frame.pal = rendered.pal;
                    p.horizonY = rendered.horizonY;
                    // Instrumentos usam posição física, não a posição da câmera.
                    frame.position = p.position;
                    if (settings.camera) cockpit.render(frame);
                    hud.render(frame);
                } finally {
                    display.endView();
                }
                effects.speed = Math.max(effects.speed, p.speed);
                effects.boost = Math.max(effects.boost, p.boosting);
                effects.shake = Math.max(effects.shake, p.shake);
                effects.flash = Math.max(effects.flash, p.flash);
            }
            if (numP === 2) {
                var g = display.sctx,
                    w = display.width,
                    h = display.height;
                g.fillStyle = "#70e4ec";
                if (h >= w * 0.8) g.fillRect(0, Math.floor(h / 2) - 1, w, 2);
                else g.fillRect(Math.floor(w / 2) - 1, 0, 2, h);
            }
            display.composite(effects);
        }
        function frame(time) {
            try {
                input.poll();
                var dt =
                    last === null ? 0 : Math.min((time - last) / 1000, 0.25);
                last = time;
                accumulator += dt;
                var steps = 0;
                while (accumulator >= STEP && steps++ < 5) {
                    if (race.state !== "paused" && race.state !== "over") {
                        race.update(
                            STEP,
                            race.players.map(function (_, i) {
                                return input.read(i);
                            }),
                            race.state === "menu",
                        );
                        pulse += STEP;
                        if (race.state === "play" && race.isOver()) {
                            race.state = "over";
                            var result = race.results();
                            if (settings.mode === "classic") {
                                bestScore = Math.max(
                                    bestScore,
                                    ...race.players.map(function (p) {
                                        return Math.floor(p.score);
                                    }),
                                );
                                result.details +=
                                    " · Recorde da sessão: " +
                                    bestScore.toLocaleString("pt-BR");
                            }
                            ui.showResults(result);
                        }
                    }
                    accumulator -= STEP;
                }
                if (accumulator > STEP) accumulator = 0;
                render();
                audio.update(dt, {
                    player: race.players[0],
                    maxSpeed: race.maxSpeed,
                    state: race.state,
                    mode: settings.mode,
                });
            } catch (error) {
                window.__err(error);
                return; // Não repetir um erro de execução a cada quadro.
            }
            requestAnimationFrame(frame);
        }
        window.addEventListener("resize", function () {
            if (display.resize(settings.quality)) cockpit.invalidate();
        });
        requestAnimationFrame(frame);
    }
    try {
        boot();
    } catch (error) {
        window.__err(error);
    }
})(window.NeonDrive);
