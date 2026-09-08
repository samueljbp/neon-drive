/* Carregar após NeonDrive.util; formula requer circuits e SPR.formulaCars pronto. */
(function (ND) {
    "use strict";

    ND.createWorld = function (SPR, settings) {
        settings = settings || {};
        var U = ND.util,
            clamp = U.clamp,
            lerp = U.lerp,
            rand = U.rand,
            randi = U.randi,
            pick = U.pick,
            increase = U.increase,
            easeIn = U.easeIn,
            easeInOut = U.easeInOut;
        var mode = settings.mode === "formula" ? "formula" : "classic";
        var diff = Number.isInteger(settings.difficulty)
            ? clamp(settings.difficulty, 0, 2)
            : 1;
        var numPlayers = settings.numPlayers === 2 ? 2 : 1;
        var circuitIndex = Number.isInteger(settings.circuit)
            ? clamp(settings.circuit, 0, 3)
            : 0;

        /* ---------- construção da pista ---------- */
        var segments = [],
            trackLength = 0;
        var SEGLEN = 200,
            RUMBLE = 3,
            ROADW = mode === "formula" ? 2600 : 3200,
            LANES = 4;
        function laneOffset(lane) {
            return -1 + ((lane + 0.5) * 2) / LANES;
        }
        function vehicleHalfWidth(spr) {
            return ((spr.bodyW || spr.worldW) * 0.46) / ROADW;
        }
        var BIOME_COAST = 0,
            BIOME_CITY = 1,
            BIOME_CANYON = 2,
            BIOME_DESERT = 3,
            BIOME_FOREST = 4,
            BIOME_PORT = 5,
            BIOME_GLACIER = 6,
            BIOME_TUNNEL = 7;
        var BIOMES = [
            { name: "COSTA DOURADA", g: [1.0, 1.0, 1.0] },
            { name: "DISTRITO NEON", g: [0.9, 0.94, 1.14] },
            { name: "DESFILADEIRO", g: [1.22, 0.86, 0.84] },
            { name: "DESERTO DE SAL", g: [1.26, 1.06, 0.78] },
            { name: "MATA ALTA", g: [0.68, 1.06, 0.84] },
            { name: "PORTO VELHO", g: [0.84, 0.94, 1.12] },
            { name: "GELEIRA", g: [0.84, 1.08, 1.34] },
            { name: "TÚNEL 92", g: [0.42, 0.4, 0.56] },
        ];
        function DF() {
            return ND.difficulties[diff];
        }

        // Velocidade nominal para construir o grid; options.maxSpeed é a autoridade
        // durante a corrida e também passa a valer nos próximos resets deste mundo.
        var formulaMaxSpeed = 25000;
        var world = {
            segments: segments,
            trackLength: trackLength,
            ROADW: ROADW,
            SEGLEN: SEGLEN,
            LANES: LANES,
            BIOMES: BIOMES,
            traffic: [],
            pickups: [],
            circuit: mode === "formula" ? ND.circuits[circuitIndex] : null,
            startLineZ: 0,
            laneOffset: laneOffset,
            vehicleHalfWidth: vehicleHalfWidth,
            findSegment: findSegment,
            syncTraffic: syncTraffic,
            resetTraffic: resetTraffic,
            updateTraffic: updateTraffic,
        };

        function lastY() {
            return segments.length === 0
                ? 0
                : segments[segments.length - 1].p2.world.y;
        }

        function addSegment(curve, y) {
            var n = segments.length;
            segments.push({
                index: n,
                p1: {
                    world: { y: lastY(), z: n * SEGLEN },
                    camera: {},
                    screen: {},
                },
                p2: {
                    world: { y: y, z: (n + 1) * SEGLEN },
                    camera: {},
                    screen: {},
                },
                curve: curve,
                sprites: [],
                cars: [],
                looped: false,
                clip: 0,
                biome: 0,
                color: Math.floor(n / RUMBLE) % 2 ? 1 : 0,
            });
        }
        function addRoad(enter, hold, leave, curve, y) {
            var startY = lastY(),
                endY = startY + (y || 0) * SEGLEN,
                total = enter + hold + leave,
                n;
            for (n = 0; n < enter; n++)
                addSegment(
                    easeIn(0, curve, n / enter),
                    easeInOut(startY, endY, n / total),
                );
            for (n = 0; n < hold; n++)
                addSegment(curve, easeInOut(startY, endY, (enter + n) / total));
            for (n = 0; n < leave; n++)
                addSegment(
                    easeInOut(curve, 0, n / leave),
                    easeInOut(startY, endY, (enter + hold + n) / total),
                );
        }
        var L = { S: 24, M: 48, L: 96 },
            C = { E: 2, M: 4, H: 6.5 },
            HL = { L: 22, M: 44, H: 80 };

        function buildTrack() {
            segments = [];
            addRoad(L.M, L.M, L.M, 0, 0); // largada
            addRoad(L.M, L.M, L.M, C.M, HL.M);
            addRoad(L.S, L.M, L.S, -C.H, -HL.M);
            addRoad(L.M, L.L, L.M, 0, HL.H);
            addRoad(L.M, L.M, L.M, -C.M, 0);
            addRoad(L.S, L.S, L.S, C.H, -HL.L);
            addRoad(L.S, L.S, L.S, -C.H, HL.L);
            addRoad(L.M, L.L, L.M, C.E, -HL.H);
            addRoad(L.M, L.M, L.M, 0, 0);
            addRoad(L.M, L.M, L.M, -C.H, HL.M);
            addRoad(L.S, L.M, L.S, C.M, 0);
            addRoad(L.M, L.L, L.M, -C.E, -HL.M);
            addRoad(L.S, L.S, L.S, C.H, HL.L);
            addRoad(L.M, L.M, L.M, -C.M, -HL.L);
            addRoad(L.L, L.L, L.L, C.E, HL.M);
            addRoad(L.M, L.M, L.M, 0, 0);
            addRoad(L.S, L.M, L.S, -C.H, -HL.H);
            addRoad(L.M, L.L, L.M, C.M, HL.M);
            addRoad(L.M, L.M, L.M, -C.E, 0);
            addRoad(L.L, L.L, L.L, 0, -lastY() / SEGLEN); // volta ao nível zero
            trackLength = segments.length * SEGLEN;

            // biomas
            var n,
                total = segments.length;
            for (n = 0; n < total; n++)
                segments[n].biome = Math.min(
                    BIOMES.length - 1,
                    Math.floor((n / total) * BIOMES.length),
                );
            decorate();
            placeTraffic();
        }

        function decorate() {
            var n,
                total = segments.length;
            world.pickups = [];
            function put(sg, spr, off, hitW, hard) {
                sg.sprites.push({
                    sprite: spr,
                    offset: off,
                    hitW: hitW || 0,
                    hard: !!hard,
                });
            }
            for (n = 0; n < total; n++) {
                var s = segments[n],
                    b = s.biome;
                if (b === BIOME_COAST) {
                    if (n % 9 === 0)
                        put(
                            s,
                            pick(SPR.palms),
                            -1.35 - Math.random() * 0.9,
                            0.05,
                            1,
                        );
                    if (n % 9 === 4)
                        put(
                            s,
                            pick(SPR.palms),
                            1.35 + Math.random() * 0.9,
                            0.05,
                            1,
                        );
                    if (n % 23 === 0)
                        put(
                            s,
                            pick(SPR.palms),
                            (Math.random() < 0.5 ? -1 : 1) *
                                (2.4 + Math.random() * 1.8),
                            0.05,
                            1,
                        );
                    if (n % 31 === 12)
                        put(
                            s,
                            SPR.lamp,
                            Math.random() < 0.5 ? -1.16 : 1.16,
                            0.035,
                            1,
                        );
                } else if (b === BIOME_CITY) {
                    if (n % 7 === 0) put(s, SPR.lamp, -1.18, 0.035, 1);
                    if (n % 7 === 3) put(s, SPR.lamp, 1.18, 0.035, 1);
                    if (n % 17 === 0)
                        put(
                            s,
                            pick(SPR.towers),
                            -(2.1 + Math.random() * 2.4),
                            0.6,
                            1,
                        );
                    if (n % 17 === 8)
                        put(
                            s,
                            pick(SPR.towers),
                            2.1 + Math.random() * 2.4,
                            0.6,
                            1,
                        );
                    if (n % 29 === 14)
                        put(
                            s,
                            pick(SPR.palms),
                            Math.random() < 0.5 ? -1.3 : 1.3,
                            0.05,
                            1,
                        );
                    if (n % 8 === 0) {
                        // guarda-corpo: rodovia urbana
                        put(s, SPR.rail, -1.1, 0.075, 0);
                        put(s, SPR.rail, 1.1, 0.075, 0);
                    }
                } else if (b === BIOME_CANYON) {
                    if (n % 11 === 0)
                        put(
                            s,
                            pick(SPR.rocks),
                            -(1.7 + Math.random() * 1.5),
                            0.52,
                            1,
                        );
                    if (n % 11 === 5)
                        put(
                            s,
                            pick(SPR.rocks),
                            1.7 + Math.random() * 1.5,
                            0.52,
                            1,
                        );
                    if (n % 13 === 2)
                        put(
                            s,
                            pick(SPR.palms),
                            (Math.random() < 0.5 ? -1 : 1) *
                                (1.45 + Math.random() * 0.6),
                            0.05,
                            1,
                        );
                } else if (b === BIOME_DESERT) {
                    if (n % 8 === 0)
                        put(
                            s,
                            pick(SPR.cactus),
                            -(1.3 + Math.random() * 1.1),
                            0.06,
                            1,
                        );
                    if (n % 8 === 4)
                        put(
                            s,
                            pick(SPR.cactus),
                            1.3 + Math.random() * 1.1,
                            0.06,
                            1,
                        );
                    if (n % 37 === 10)
                        put(
                            s,
                            pick(SPR.rocks),
                            (Math.random() < 0.5 ? -1 : 1) *
                                (2.6 + Math.random() * 2.0),
                            0.52,
                            1,
                        );
                    if (n % 19 === 6)
                        put(
                            s,
                            SPR.stack,
                            (Math.random() < 0.5 ? -1 : 1) *
                                (3.2 + Math.random() * 1.6),
                            0.3,
                            1,
                        );
                } else if (b === BIOME_FOREST) {
                    if (n % 8 === 0)
                        put(
                            s,
                            pick(SPR.pines),
                            -(1.28 + Math.random() * 1.4),
                            0.06,
                            1,
                        );
                    if (n % 8 === 4)
                        put(
                            s,
                            pick(SPR.pines),
                            1.28 + Math.random() * 1.4,
                            0.06,
                            1,
                        );
                    if (n % 13 === 1)
                        put(
                            s,
                            pick(SPR.pines),
                            (Math.random() < 0.5 ? -1 : 1) *
                                (2.8 + Math.random() * 2.2),
                            0.06,
                            1,
                        );
                    if (n % 41 === 20)
                        put(
                            s,
                            SPR.lamp,
                            Math.random() < 0.5 ? -1.16 : 1.16,
                            0.035,
                            1,
                        );
                } else if (b === BIOME_PORT) {
                    if (n % 23 === 0)
                        put(
                            s,
                            SPR.crane,
                            -(2.3 + Math.random() * 1.6),
                            0.35,
                            1,
                        );
                    if (n % 23 === 11)
                        put(s, SPR.crane, 2.3 + Math.random() * 1.6, 0.35, 1);
                    if (n % 9 === 0)
                        put(
                            s,
                            pick(SPR.conts),
                            -(1.45 + Math.random() * 0.8),
                            0.5,
                            1,
                        );
                    if (n % 9 === 4)
                        put(
                            s,
                            pick(SPR.conts),
                            1.45 + Math.random() * 0.8,
                            0.5,
                            1,
                        );
                    if (n % 31 === 16)
                        put(
                            s,
                            SPR.stack,
                            (Math.random() < 0.5 ? -1 : 1) *
                                (3.4 + Math.random() * 1.4),
                            0.3,
                            1,
                        );
                    if (n % 8 === 0) {
                        put(s, SPR.rail, -1.1, 0.075, 0);
                        put(s, SPR.rail, 1.1, 0.075, 0);
                    }
                } else if (b === BIOME_GLACIER) {
                    if (n % 7 === 0)
                        put(
                            s,
                            pick(SPR.ice),
                            -(1.35 + Math.random() * 1.2),
                            0.42,
                            1,
                        );
                    if (n % 7 === 3)
                        put(
                            s,
                            pick(SPR.ice),
                            1.35 + Math.random() * 1.2,
                            0.42,
                            1,
                        );
                    if (n % 17 === 8)
                        put(
                            s,
                            pick(SPR.ice),
                            (Math.random() < 0.5 ? -1 : 1) *
                                (2.9 + Math.random() * 1.8),
                            0.42,
                            1,
                        );
                } else if (b === BIOME_TUNNEL) {
                    if (n % 12 === 0) {
                        put(s, SPR.rail, -1.06, 0.075, 0);
                        put(s, SPR.rail, 1.06, 0.075, 0);
                    }
                }
                if (n % 61 === 30)
                    put(
                        s,
                        pick(SPR.signs),
                        (Math.random() < 0.5 ? -1 : 1) *
                            (1.62 + Math.random() * 0.4),
                        0.11,
                        1,
                    );
                if (n % 150 === 60) put(s, SPR.arch, 0, 0, 0); // pórtico: passa por baixo
                if (n % 290 === 40) {
                    // ~10 cápsulas de nitro por volta
                    var pk = { taken: 0, t: 0 };
                    world.pickups.push(pk);
                    s.sprites.push({
                        sprite: SPR.nitro,
                        offset: laneOffset(Math.floor(n / 290) % LANES),
                        hitW: 0,
                        pk: pk,
                    });
                }
            }
        }

        /* ---------- circuitos de fórmula ---------- */
        function buildCircuit() {
            var sections = world.circuit.sections;
            for (var i = 0; i < sections.length; i++) {
                var section = sections[i],
                    startY = lastY(),
                    endY =
                        i === sections.length - 1
                            ? 0
                            : startY + section.hill * SEGLEN,
                    total = section.enter + section.hold + section.leave;
                for (var n = 0; n < total; n++) {
                    var curve;
                    if (n < section.enter)
                        curve = easeIn(0, section.curve, n / section.enter);
                    else if (n < section.enter + section.hold)
                        curve = section.curve;
                    else
                        curve = easeInOut(
                            section.curve,
                            0,
                            (n - section.enter - section.hold + 1) /
                                section.leave,
                        );
                    // Diferente da rodovia original, a F1 inclui o extremo da
                    // interpolação: nada de resíduo acumulado na emenda da volta.
                    addSegment(
                        n === total - 1 ? 0 : curve,
                        n === total - 1
                            ? endY
                            : easeInOut(startY, endY, (n + 1) / total),
                    );
                    var seg = segments[segments.length - 1];
                    seg.biome = section.biome;
                    seg.section = section.name;
                }
            }
            trackLength = segments.length * SEGLEN;
            segments[0].startLine = true;
            for (var g = segments.length - 60; g < segments.length; g += 6)
                segments[g].grid = true;
            decorateCircuit();
            placeFormulaTraffic();
        }

        function circuitDecor() {
            if (SPR.circuitDecor) return SPR.circuitDecor;
            var makeSprite = ND.assets.makeSprite;
            var decor = {};
            decor.grandstand = makeSprite(480, 240, 4200, function (g, w, h) {
                g.fillStyle = "#263341";
                g.fillRect(12, h * 0.22, w - 24, h * 0.78);
                var shirts = [
                        "#ea454b",
                        "#f4cb45",
                        "#51aed6",
                        "#efeff3",
                        "#48b883",
                    ],
                    skin = ["#e8b58a", "#b77c52", "#784b38"];
                for (var row = 0; row < 6; row++) {
                    var y = 54 + row * 27;
                    g.fillStyle = row % 2 ? "#6e7c89" : "#526471";
                    g.fillRect(18, y + 16, w - 36, 9);
                    for (var seat = 0; seat < 40; seat++) {
                        var x = 22 + seat * 11;
                        g.fillStyle =
                            shirts[(seat * 7 + row * 3) % shirts.length];
                        g.fillRect(x, y + 7, 7, 10);
                        g.fillStyle = skin[(seat + row) % skin.length];
                        g.fillRect(x + 1, y + 2, 5, 5);
                    }
                }
                g.fillStyle = "#cdd7df";
                g.fillRect(6, 15, w - 12, 15);
                g.fillRect(18, 30, 7, h - 30);
                g.fillRect(w - 25, 30, 7, h - 30);
                g.fillStyle = "#d63740";
                g.fillRect(6, 10, w - 12, 6);
                g.fillStyle = "#9dabb5";
                g.fillRect(12, h - 22, w - 24, 4);
            });
            decor.pit = makeSprite(480, 210, 4000, function (g, w, h) {
                g.fillStyle = "#d9dfe2";
                g.fillRect(8, 30, w - 16, h - 30);
                g.fillStyle = "#344b61";
                g.fillRect(18, 46, w - 36, 40);
                g.fillStyle = "#b4dce9";
                for (var window = 0; window < 12; window++)
                    g.fillRect(23 + window * 36, 51, 29, 28);
                g.font = "bold 16px Arial,sans-serif";
                g.textAlign = "center";
                for (var box = 0; box < 6; box++) {
                    var x = 18 + box * 75;
                    g.fillStyle = "#df3340";
                    g.fillRect(x, 103, 68, 22);
                    g.fillStyle = "#ffffff";
                    g.fillText(String(box + 1), x + 34, 120);
                    g.fillStyle = "#192b3a";
                    g.fillRect(x, 127, 68, h - 127);
                    g.fillStyle = "#465968";
                    g.fillRect(x + 8, 139, 52, 8);
                }
                g.fillStyle = "#243440";
                g.fillRect(2, 21, w - 4, 12);
            });
            decor.brakeBoard = {};
            [150, 100, 50].forEach(function (distance) {
                decor.brakeBoard[distance] = makeSprite(
                    96,
                    160,
                    380,
                    function (g, w, h) {
                        g.fillStyle = "#697580";
                        g.fillRect(w * 0.46, h * 0.5, w * 0.08, h * 0.5);
                        g.fillStyle = "#151c25";
                        g.fillRect(2, 2, w - 4, h * 0.62);
                        g.fillStyle = "#fafaf5";
                        g.fillRect(7, 7, w - 14, h * 0.62 - 10);
                        g.fillStyle = "#111820";
                        g.font = "bold 36px Arial,sans-serif";
                        g.textAlign = "center";
                        g.textBaseline = "middle";
                        g.fillText(String(distance), w / 2, h * 0.33);
                    },
                );
            });
            decor.banner = makeSprite(420, 150, 2400, function (g, w, h) {
                g.fillStyle = "#46515e";
                g.fillRect(25, 15, 8, h - 15);
                g.fillRect(w - 33, 15, 8, h - 15);
                g.fillStyle = "#202c3d";
                g.fillRect(0, 0, w, h * 0.66);
                g.fillStyle = "#e83c48";
                g.fillRect(0, 0, w, 7);
                g.fillStyle = "#ffffff";
                g.font = "italic bold 44px Arial,sans-serif";
                g.textAlign = "center";
                g.textBaseline = "middle";
                g.fillText("GRAND PRIX", w / 2, h * 0.34);
            });
            // Perfil baixo (altura = 0,1 da largura), sem invadir o asfalto.
            decor.barrier = makeSprite(320, 32, 1000, function (g, w, h) {
                for (var block = 0; block < 8; block++) {
                    g.fillStyle = block % 2 ? "#f3f3ed" : "#d72d39";
                    g.fillRect((block * w) / 8, 0, w / 8, h);
                }
                g.fillStyle = "rgba(255,255,255,0.35)";
                g.fillRect(0, 0, w, 4);
                g.fillStyle = "rgba(0,0,0,0.28)";
                g.fillRect(0, h - 7, w, 7);
            });
            SPR.circuitDecor = decor;
            return decor;
        }

        function decorateCircuit() {
            var decor = circuitDecor(),
                total = segments.length;
            function put(index, sprite, side, gap, hitW, hard) {
                // gap é medido da borda da pista à borda INTERNA do sprite.
                segments[(index + total) % total].sprites.push({
                    sprite: sprite,
                    offset: side * (1 + gap + sprite.worldW / (2 * ROADW)),
                    hitW: hitW || 0,
                    hard: !!hard,
                });
            }
            for (var n = 0; n < total; n++) {
                var biome = segments[n].biome;
                if (n % 6 === 0) {
                    put(n, decor.barrier, -1, 0.1, 0.1, false);
                    put(n, decor.barrier, 1, 0.1, 0.1, false);
                }
                if (biome === BIOME_TUNNEL) continue;
                // Mais de 35 segmentos entre arquibancadas, inclusive na emenda.
                if (n % 60 === 30 && n < total - 36)
                    put(
                        n,
                        decor.grandstand,
                        n % 120 === 30 ? -1 : 1,
                        0.4,
                        0.5,
                        true,
                    );
                if (n < 80 && n % 24 === 0)
                    put(n, decor.pit, 1, 0.35, 0.5, true);
                if (biome === BIOME_FOREST && n % 12 === 0) {
                    put(
                        n,
                        pick(SPR.pines),
                        -1,
                        0.7 + Math.random(),
                        0.06,
                        true,
                    );
                    put(n, pick(SPR.pines), 1, 0.7 + Math.random(), 0.06, true);
                } else if (biome === BIOME_CITY) {
                    if (n % 36 === 0)
                        put(
                            n,
                            pick(SPR.towers),
                            n % 72 === 0 ? -1 : 1,
                            1.1,
                            0.6,
                            true,
                        );
                    if (n % 18 === 9)
                        put(
                            n,
                            SPR.lamp,
                            n % 36 === 9 ? -1 : 1,
                            0.35,
                            0.035,
                            true,
                        );
                } else if (biome === BIOME_COAST && n % 18 === 0) {
                    put(n, pick(SPR.palms), 1, 0.65, 0.05, true);
                }
            }
            put(0, decor.banner, -1, 0.4, 0, false);
            var start = 0,
                sections = world.circuit.sections;
            for (var i = 0; i < sections.length; i++) {
                var section = sections[i];
                if (Math.abs(section.curve) >= 3) {
                    var side = section.curve > 0 ? -1 : 1;
                    put(
                        start - 18,
                        decor.brakeBoard[150],
                        side,
                        0.35,
                        0,
                        false,
                    );
                    put(
                        start - 12,
                        decor.brakeBoard[100],
                        side,
                        0.35,
                        0,
                        false,
                    );
                    put(start - 6, decor.brakeBoard[50], side, 0.35, 0, false);
                }
                start += section.enter + section.hold + section.leave;
            }
        }

        /* ---------- tráfego ---------- */
        function placeTraffic() {
            world.traffic = [];
            var count = DF().cars;
            for (var i = 0; i < count; i++) {
                var isTruck = Math.random() < 0.18;
                var lane = randi(0, LANES - 1);
                var ln = laneOffset(lane);
                world.traffic.push({
                    offset: ln,
                    lane: ln,
                    laneIndex: lane,
                    laneT: rand(5, 20),
                    z: Math.floor(Math.random() * segments.length) * SEGLEN,
                    sprite: isTruck ? SPR.truck : pick(SPR.cars),
                    speed: isTruck
                        ? rand(DF().tmin * 0.62, DF().tmin * 0.84)
                        : rand(DF().tmin, DF().tmax),
                    target: 0,
                    seg: null,
                    hit: 0,
                });
            }
            syncTraffic();
        }

        function placeFormulaTraffic() {
            world.traffic = [];
            var count = 12 - numPlayers;
            for (var i = 0; i < count; i++) {
                var offset = i % 2 ? 0.46 : -0.46,
                    z = (12 - numPlayers - i) * SEGLEN * 3 + (i % 2) * SEGLEN;
                world.traffic.push({
                    id: i,
                    kind: "formula",
                    offset: offset,
                    lane: offset,
                    laneIndex: i % 2 ? 2 : 1,
                    laneT: 0,
                    z: z,
                    // Linha de referência única: humanos iniciam em progress=0.
                    // A vantagem positiva do grid conta na distância das três voltas.
                    progress: z,
                    distance: z,
                    laps: 1,
                    lapStarted: 0,
                    lastLap: 0,
                    bestLap: 0,
                    sprite: SPR.formulaCars[i % 6],
                    speed: 0,
                    targetSpeed:
                        formulaMaxSpeed *
                        (0.68 + diff * 0.06 + (i / count) * 0.1),
                    target: 0,
                    seg: null,
                    hit: 0,
                    grazed: [0, 0], // controle por jogador pertence à corrida
                    finished: false,
                    finishTime: null,
                });
            }
            syncTraffic();
        }

        function resetTraffic(difficulty, players) {
            if (Number.isInteger(difficulty)) diff = clamp(difficulty, 0, 2);
            if (players === 1 || players === 2) numPlayers = players;
            if (mode === "formula") placeFormulaTraffic();
            else placeTraffic();
        }

        function syncTraffic() {
            var n;
            for (n = 0; n < segments.length; n++) segments[n].cars.length = 0;
            for (n = 0; n < world.traffic.length; n++) {
                var c = world.traffic[n];
                if (mode === "formula" && c.finished) {
                    c.seg = null; // mantém resultado, mas não vira obstáculo na chegada
                    continue;
                }
                c.seg = findSegment(c.z);
                c.seg.cars.push(c);
            }
        }
        function findSegment(z) {
            var index = Math.floor(z / SEGLEN) % segments.length;
            return segments[index < 0 ? index + segments.length : index];
        }

        // Chamar UMA vez por tick fixo, nunca uma vez por jogador/viewport.
        // elapsed é o instante no INÍCIO do passo; position (clássico) é opcional.
        function updateTraffic(dt, options) {
            if (!Number.isFinite(dt) || dt <= 0) return;
            options = options || {};
            var formula = (options.mode || mode) === "formula";
            if (
                formula &&
                Number.isFinite(options.maxSpeed) &&
                options.maxSpeed > 0
            )
                formulaMaxSpeed = options.maxSpeed;
            var elapsed = Number.isFinite(options.elapsed)
                ? options.elapsed
                : 0;
            var position = Number.isFinite(options.position)
                ? options.position
                : 0;
            for (var i = 0; i < world.traffic.length; i++) {
                var c = world.traffic[i];
                if (formula) {
                    if (c.finished) continue;
                    c.targetSpeed =
                        formulaMaxSpeed *
                        (0.68 + diff * 0.06 + (i / world.traffic.length) * 0.1);
                    var curveFactor = Math.max(
                        0.62,
                        1 - Math.abs(findSegment(c.z).curve) * 0.095,
                    );
                    var wanted = c.targetSpeed * curveFactor;
                    var acceleration = formulaMaxSpeed / 3.6;
                    if (c.speed < wanted)
                        c.speed = Math.min(wanted, c.speed + acceleration * dt);
                    else
                        c.speed = Math.max(
                            wanted,
                            c.speed - acceleration * 2 * dt,
                        );
                    if (c.hit > 0) c.hit -= dt;
                    c.offset = lerp(c.offset, c.lane, Math.min(1, dt * 0.9));
                    if (options.demo) {
                        c.z = increase(c.z, dt * c.speed, trackLength);
                        continue;
                    }
                    var before = c.progress,
                        finish = trackLength * 3;
                    c.progress = Math.min(finish, before + dt * c.speed);
                    c.distance = c.progress;
                    for (
                        var lap = Math.floor(before / trackLength) + 1;
                        lap <= 3 && lap * trackLength <= c.progress;
                        lap++
                    ) {
                        var crossing =
                            elapsed + (lap * trackLength - before) / c.speed;
                        c.lastLap = crossing - c.lapStarted;
                        c.bestLap = c.bestLap
                            ? Math.min(c.bestLap, c.lastLap)
                            : c.lastLap;
                        c.lapStarted = crossing;
                    }
                    c.laps = Math.min(
                        3,
                        Math.floor(c.progress / trackLength) + 1,
                    );
                    c.z = increase(0, c.progress, trackLength);
                    if (c.progress >= finish) {
                        c.finishTime =
                            elapsed +
                            (c.speed > 0
                                ? Math.max(0, finish - before) / c.speed
                                : 0);
                        c.finished = true;
                        c.speed = 0;
                    }
                    continue;
                }

                // Velocidade e mudanças de faixa do clássico, sem simplificação.
                c.z = increase(c.z, dt * c.speed, trackLength);
                if (c.hit > 0) c.hit -= dt;
                // desvio simples do jogador
                var rel = c.z - position;
                if (rel < 0) rel += trackLength;
                if (rel > SEGLEN * 40) c.grazed = 0;
                c.laneT -= dt; // troca de faixa esporádica, própria dele
                if (c.laneT <= 0) {
                    c.laneT = rand(7, 22);
                    c.laneIndex = clamp(
                        c.laneIndex + (Math.random() < 0.5 ? -1 : 1),
                        0,
                        LANES - 1,
                    );
                    c.lane = laneOffset(c.laneIndex);
                }
                c.offset = lerp(c.offset, c.lane, dt * 0.9); // segue a própria faixa; não foge mais de você
            }
            syncTraffic();
        }

        if (mode === "formula") buildCircuit();
        else buildTrack();
        world.segments = segments;
        world.trackLength = trackLength;
        return world;
    };
})((window.NeonDrive = window.NeonDrive || {}));
