(function () {
    "use strict";

    var ND = (window.NeonDrive = window.NeonDrive || {});

    // Contextos já transformados/recortados pelo caller (inclusive a emissiva).
    // frame.horizonY é o horizonte anterior DESTE viewport; render retorna o novo.
    ND.createSceneRenderer = function () {
        var U = ND.util;
        var PI = U.PI,
            clamp = U.clamp,
            lerp = U.lerp,
            rand = U.rand,
            increase = U.increase,
            hexRgb = U.hexRgb,
            mixRgb = U.mixRgb,
            css = U.css,
            cv = U.cv;
        var W,
            H,
            sctx,
            ectx,
            position,
            playerX,
            speed,
            maxSpeed,
            driftAngle,
            boosting,
            visYaw,
            sunPulse,
            cameraDepth,
            camPitch,
            camHeight,
            camDist,
            REFDEPTH,
            drawDist,
            quality,
            sunOffset,
            bgX,
            curBiome,
            particles,
            sparks,
            floats,
            ctrl,
            camMode,
            mode,
            world,
            segments,
            trackLength,
            ROADW,
            SEGLEN,
            LANES,
            BIOMES,
            playerSprites,
            otherPlayers,
            horizonY;
        var BIOME_COAST = 0,
            BIOME_CITY = 1,
            BIOME_PORT = 5,
            BIOME_GLACIER = 6,
            BIOME_TUNNEL = 7;
        var sunCv = cv(560, 560),
            sunFrame = 0;

        function loadFrame(frame) {
            W = frame.W;
            H = frame.H;
            sctx = frame.sctx;
            ectx = frame.ectx;
            position = frame.position;
            playerX = frame.playerX;
            speed = frame.speed;
            maxSpeed = frame.maxSpeed;
            driftAngle = frame.driftAngle;
            boosting = frame.boosting;
            visYaw = frame.visYaw;
            sunPulse = frame.sunPulse;
            cameraDepth = frame.cameraDepth;
            camPitch = frame.camPitch;
            camHeight = frame.camHeight;
            camDist = frame.camDist;
            REFDEPTH = frame.REFDEPTH;
            drawDist = frame.drawDist;
            quality = frame.quality;
            sunOffset = frame.sunOffset;
            bgX = frame.bgX;
            curBiome = frame.curBiome;
            particles = frame.particles;
            sparks = frame.sparks;
            floats = frame.floats;
            ctrl = frame.ctrl;
            camMode = frame.camMode;
            mode = frame.mode;
            world = frame.world;
            segments = world.segments;
            trackLength = world.trackLength;
            ROADW = world.ROADW;
            SEGLEN = world.SEGLEN;
            LANES = world.LANES;
            BIOMES = world.BIOMES;
            playerSprites = frame.playerSprites;
            otherPlayers = frame.otherPlayers || [];
            // Não reutilizar o horizonte de outro jogador ao alternar viewports.
            horizonY = frame.horizonY || 0;
        }

        function playerZ() {
            return camDist * REFDEPTH;
        }
        function findSegment(z) {
            return world.findSegment(z);
        }
        function laneOffset(lane) {
            return world.laneOffset(lane);
        }

        /* ---------- paletas do ciclo dia/noite ---------- */
        var PALETTES = [
            {
                name: "HORA DOURADA",
                skyTop: "#3a1163",
                skyMid: "#8e2b7e",
                skyLow: "#ff5f6d",
                horizon: "#ffc16b",
                sun1: "#fff7a8",
                sun2: "#ff2f87",
                mount1: "#2e1149",
                mount2: "#4d1c63",
                mount3: "#6b2a72",
                g1: "#1c1136",
                g2: "#241645",
                road1: "#191325",
                road2: "#1f1930",
                rumble1: "#ff2f87",
                rumble2: "#ffe066",
                lane: "#ffeaf5",
                neon: "#ff2f87",
                fog: "#8e2b7e",
                star: 0,
            },
            {
                name: "CREPÚSCULO",
                skyTop: "#160a3d",
                skyMid: "#3d1470",
                skyLow: "#a8267e",
                horizon: "#ff6f61",
                sun1: "#ffd166",
                sun2: "#e01a72",
                mount1: "#1b0c39",
                mount2: "#2d1252",
                mount3: "#421a63",
                g1: "#120a2a",
                g2: "#180f36",
                road1: "#130f20",
                road2: "#171326",
                rumble1: "#00e5ff",
                rumble2: "#ff2f87",
                lane: "#dff8ff",
                neon: "#00e5ff",
                fog: "#3d1470",
                star: 0.45,
            },
            {
                name: "MEIA-NOITE",
                skyTop: "#03030f",
                skyMid: "#0a0a2b",
                skyLow: "#161a55",
                horizon: "#3b2a8c",
                sun1: "#9ad8ff",
                sun2: "#4a3aa8",
                mount1: "#070722",
                mount2: "#0d0d33",
                mount3: "#141446",
                g1: "#07061a",
                g2: "#0b0a24",
                road1: "#0c0b16",
                road2: "#100e1c",
                rumble1: "#7b2fff",
                rumble2: "#00e5ff",
                lane: "#cfe6ff",
                neon: "#7b2fff",
                fog: "#0a0a2b",
                star: 1,
            },
            {
                name: "AMANHECER",
                skyTop: "#0e2050",
                skyMid: "#3f5aa8",
                skyLow: "#ff9d7a",
                horizon: "#ffd9a0",
                sun1: "#fffbe0",
                sun2: "#ff8a5c",
                mount1: "#1a2350",
                mount2: "#2b3468",
                mount3: "#3f4a86",
                g1: "#152040",
                g2: "#1b284d",
                road1: "#161824",
                road2: "#1b1e2c",
                rumble1: "#ffe066",
                rumble2: "#ff5f6d",
                lane: "#ffffff",
                neon: "#ffb36b",
                fog: "#3f5aa8",
                star: 0.25,
            },
        ];
        var PKEYS = [
            "skyTop",
            "skyMid",
            "skyLow",
            "horizon",
            "sun1",
            "sun2",
            "mount1",
            "mount2",
            "mount3",
            "g1",
            "g2",
            "road1",
            "road2",
            "rumble1",
            "rumble2",
            "lane",
            "neon",
            "fog",
        ];
        for (var pi = 0; pi < PALETTES.length; pi++) {
            PALETTES[pi]._ = {};
            for (var pk = 0; pk < PKEYS.length; pk++)
                PALETTES[pi]._[PKEYS[pk]] = hexRgb(PALETTES[pi][PKEYS[pk]]);
        }
        var pal = {};
        function updatePalette(phase) {
            var t = phase * PALETTES.length;
            var i = Math.floor(t) % PALETTES.length,
                j = (i + 1) % PALETTES.length,
                f = t - Math.floor(t);
            f = f * f * (3 - 2 * f);
            var A = PALETTES[i],
                B = PALETTES[j];
            for (var k = 0; k < PKEYS.length; k++)
                pal[PKEYS[k]] = mixRgb(A._[PKEYS[k]], B._[PKEYS[k]], f);
            pal.star = lerp(A.star, B.star, f);
            pal.name = f < 0.5 ? A.name : B.name;
        }

        /* ---------- montanhas do fundo ---------- */
        var ridges = [];
        function buildRidges() {
            ridges = [];
            for (var l = 0; l < 3; l++) {
                var pts = [],
                    n = 54,
                    y = 0;
                for (var i = 0; i <= n; i++) {
                    y += rand(-1, 1) * (0.12 - l * 0.028);
                    y = clamp(y, -1, 1);
                    pts.push({
                        x: i / n,
                        y: Math.abs(y) * (0.85 - l * 0.2) + (l === 0 ? 0.1 : 0),
                    });
                }
                pts[n].y = pts[0].y;
                ridges.push(pts);
            }
        }
        var stars = [];
        function buildStars() {
            stars = [];
            for (var i = 0; i < 220; i++)
                stars.push({
                    x: Math.random(),
                    y: Math.random() * 0.62,
                    s: rand(0.6, 2.1),
                    t: Math.random() * 7,
                });
        }

        function project(p, camX, camY, camZ) {
            p.camera.x = 0 - camX;
            p.camera.y = p.world.y - camY;
            p.camera.z = p.world.z - camZ;
            var sc = cameraDepth / Math.max(p.camera.z, 1);
            p.screen.scale = sc;
            p.screen.x = W / 2 + (sc * p.camera.x * W) / 2;
            p.screen.y = H * (0.5 - camPitch) - (sc * p.camera.y * H) / 2;
            p.screen.w = (sc * ROADW * W) / 2;
        }

        /* ---------- desenho da pista ---------- */
        function poly(g, x1, y1, x2, y2, x3, y3, x4, y4, color) {
            g.fillStyle = color;
            g.beginPath();
            g.moveTo(x1, y1);
            g.lineTo(x2, y2);
            g.lineTo(x3, y3);
            g.lineTo(x4, y4);
            g.closePath();
            g.fill();
        }

        var Ccol = { g1: [], g2: [] },
            tunH = 1;
        function frameColors() {
            var bi, tt;
            for (bi = 0; bi < BIOMES.length; bi++) {
                tt = BIOMES[bi].g;
                Ccol.g1[bi] = css([
                    clamp(pal.g1[0] * tt[0], 0, 255),
                    clamp(pal.g1[1] * tt[1], 0, 255),
                    clamp(pal.g1[2] * tt[2], 0, 255),
                ]);
                Ccol.g2[bi] = css([
                    clamp(pal.g2[0] * tt[0], 0, 255),
                    clamp(pal.g2[1] * tt[1], 0, 255),
                    clamp(pal.g2[2] * tt[2], 0, 255),
                ]);
            }
            // Circuitos podem ter menos biomas que a rodovia clássica.
            tt = BIOMES[BIOME_TUNNEL]
                ? BIOMES[BIOME_TUNNEL].g
                : [0.42, 0.4, 0.56];
            Ccol.wall = css([
                clamp(pal.g1[0] * tt[0] * 1.7, 0, 255),
                clamp(pal.g1[1] * tt[1] * 1.7, 0, 255),
                clamp(pal.g1[2] * tt[2] * 1.9, 0, 255),
            ]);
            Ccol.ceil = css([
                clamp(pal.g1[0] * tt[0] * 0.7, 0, 255),
                clamp(pal.g1[1] * tt[1] * 0.7, 0, 255),
                clamp(pal.g1[2] * tt[2] * 0.8, 0, 255),
            ]);
            Ccol.tneon = css(pal.neon, 0.95);
            Ccol.tlight = css(pal.sun1, 0.9);
            tunH = (1.2 * H) / Math.max(W, 1);
            Ccol.road1 = css(pal.road1);
            Ccol.road2 = css(pal.road2);
            Ccol.rumbleA = css(pal.rumble1);
            Ccol.rumbleB = css(pal.rumble2);
            Ccol.lane = css(pal.lane, 0.55);
            Ccol.neon = css(pal.neon);
            Ccol.fog = css(pal.fog);
            Ccol.horizon = css(pal.horizon);
            Ccol.shoulder = css(mixRgb(pal.road2, pal.mount2, 0.4));
            Ccol.water = css(mixRgb(pal.skyMid, [12, 72, 94], 0.64));
            Ccol.waterAlt = css(mixRgb(pal.skyMid, [18, 91, 110], 0.58));
            Ccol.rail = css(mixRgb(pal.mount2, [97, 116, 141], 0.4));
        }

        function renderRoad() {
            var pZ = playerZ();
            var baseSeg = findSegment(position);
            var basePct = (position % SEGLEN) / SEGLEN;
            var pSeg = findSegment(position + pZ);
            var pPct = ((position + pZ) % SEGLEN) / SEGLEN;
            var playerY = lerp(pSeg.p1.world.y, pSeg.p2.world.y, pPct);
            var maxy = H,
                x = 0,
                dxc = -(baseSeg.curve * basePct);
            var n, seg;

            for (n = 0; n < drawDist; n++) {
                seg = segments[(baseSeg.index + n) % segments.length];
                seg.looped = seg.index < baseSeg.index;
                seg.clip = maxy;
                var camZ = position - (seg.looped ? trackLength : 0);
                project(seg.p1, playerX * ROADW - x, playerY + camHeight, camZ);
                project(
                    seg.p2,
                    playerX * ROADW - x - dxc,
                    playerY + camHeight,
                    camZ,
                );
                x += dxc;
                dxc += seg.curve;
                if (
                    seg.p1.camera.z <= cameraDepth ||
                    seg.p2.screen.y >= seg.p1.screen.y ||
                    seg.p2.screen.y >= maxy
                )
                    continue;
                drawSegment(seg, n);
                maxy = seg.p2.screen.y;
            }
            horizonY = maxy;

            // névoa atmosférica no horizonte
            var fg = sctx.createLinearGradient(
                0,
                horizonY - 2,
                0,
                horizonY + H * 0.3,
            );
            fg.addColorStop(0, css(pal.fog, 0.72));
            fg.addColorStop(0.45, css(pal.fog, 0.16));
            fg.addColorStop(1, css(pal.fog, 0));
            sctx.fillStyle = fg;
            sctx.fillRect(0, horizonY - 2, W, H * 0.3);

            // objetos e carros, do fundo para a frente
            for (n = drawDist - 1; n > 0; n--) {
                seg = segments[(baseSeg.index + n) % segments.length];
                if (seg.p1.camera.z <= cameraDepth) continue;
                var fade = clamp((1 - n / drawDist) * 2.4, 0, 1);
                if (fade <= 0.02) continue;
                if (seg.biome === BIOME_TUNNEL) drawTunnel(seg);
                var si, sp3;
                for (si = 0; si < seg.sprites.length; si++) {
                    sp3 = seg.sprites[si];
                    if (sp3.pk && sp3.pk.taken) continue;
                    drawSprite(seg, sp3.sprite, sp3.offset, seg.clip, fade);
                }
                var cars = seg.cars;
                // position é da câmera também para o adversário humano.
                // Não insere jogadores nas listas persistentes do world.
                for (var op = 0; op < otherPlayers.length; op++) {
                    var other = otherPlayers[op];
                    if (other.dead || !other.sprite) continue;
                    var otherZ = increase(other.position, pZ, trackLength);
                    if (findSegment(otherZ) !== seg) continue;
                    if (cars === seg.cars) cars = cars.slice();
                    cars.push({
                        z: otherZ,
                        offset: other.playerX,
                        lane: other.playerX,
                        sprite: other.sprite,
                    });
                }
                cars.sort(function (a, b) {
                    return b.z - a.z;
                });
                for (si = 0; si < cars.length; si++) {
                    var car = cars[si];
                    var carSpr = car.sprite;
                    if (carSpr.angles) {
                        var yaw = clamp(
                            (car.offset - playerX) * 0.1 -
                                seg.curve * 0.018 +
                                (car.lane - car.offset) * 0.5,
                            -0.2,
                            0.2,
                        );
                        carSpr =
                            carSpr.angles[
                                clamp(Math.round(yaw / 0.2) + 1, 0, 2)
                            ];
                    }
                    drawSprite(
                        seg,
                        carSpr,
                        car.offset,
                        seg.clip,
                        1,
                        (car.z % SEGLEN) / SEGLEN,
                    );
                }
            }
        }

        function drawSegment(seg, n) {
            if (mode === "formula") {
                drawFormulaSegment(seg, n);
                return;
            }
            var p1 = seg.p1.screen,
                p2 = seg.p2.screen;
            var y1 = p1.y,
                y2 = p2.y,
                hgt = Math.ceil(y1 - y2) + 1;
            var alt = seg.color === 1;

            // terreno
            sctx.fillStyle = alt ? Ccol.g2[seg.biome] : Ccol.g1[seg.biome];
            sctx.fillRect(0, y2, W, hgt);

            // Litoral e porto: água, reflexos quebrados e margem acompanhando a pista.
            if (seg.biome === BIOME_COAST || seg.biome === BIOME_PORT) {
                var shore1 = p1.x - p1.w * 1.36,
                    shore2 = p2.x - p2.w * 1.36;
                poly(
                    sctx,
                    0,
                    y1,
                    shore1,
                    y1,
                    shore2,
                    y2,
                    0,
                    y2,
                    alt ? Ccol.water : Ccol.waterAlt,
                );
                if (seg.index % 4 === 0 && shore1 > 0) {
                    sctx.fillStyle = css(pal.sun1, 0.1);
                    sctx.fillRect(
                        shore2 * 0.16,
                        y2,
                        shore2 * 0.58,
                        Math.max(0.6, hgt * 0.1),
                    );
                }
                poly(
                    sctx,
                    shore1,
                    y1,
                    shore1 + p1.w * 0.055,
                    y1,
                    shore2 + p2.w * 0.055,
                    y2,
                    shore2,
                    y2,
                    css(pal.horizon, 0.26),
                );
            }

            // grade neon no chão (bioma noturno / cidade)
            if (pal.star > 0.35 && seg.index % 4 === 0) {
                sctx.fillStyle = css(pal.neon, 0.1 * pal.star);
                sctx.fillRect(0, y2, W, Math.max(1, hgt * 0.5));
            }
            // Acostamentos largos antes do asfalto.
            poly(
                sctx,
                p1.x - p1.w * 1.14,
                y1,
                p1.x + p1.w * 1.14,
                y1,
                p2.x + p2.w * 1.14,
                y2,
                p2.x - p2.w * 1.14,
                y2,
                Ccol.shoulder,
            );
            // pista
            poly(
                sctx,
                p1.x - p1.w,
                y1,
                p1.x + p1.w,
                y1,
                p2.x + p2.w,
                y2,
                p2.x - p2.w,
                y2,
                alt ? Ccol.road2 : Ccol.road1,
            );

            if (n < 150 && quality > 0) {
                // Trilhas de rodagem e reflexo acetinado; tudo ancorado no mundo, sem cintilar.
                for (var lane = 0; lane < LANES; lane++) {
                    var center = laneOffset(lane);
                    for (var tire = -1; tire <= 1; tire += 2) {
                        var tx = center + tire * 0.075;
                        poly(
                            sctx,
                            p1.x + p1.w * (tx - 0.024),
                            y1,
                            p1.x + p1.w * (tx + 0.024),
                            y1,
                            p2.x + p2.w * (tx + 0.024),
                            y2,
                            p2.x + p2.w * (tx - 0.024),
                            y2,
                            "rgba(2,5,13,0.18)",
                        );
                    }
                    poly(
                        sctx,
                        p1.x + p1.w * (center - 0.1),
                        y1,
                        p1.x + p1.w * (center + 0.1),
                        y1,
                        p2.x + p2.w * (center + 0.1),
                        y2,
                        p2.x + p2.w * (center - 0.1),
                        y2,
                        css(pal.skyLow, 0.035),
                    );
                }
                if (n < 65) {
                    sctx.fillStyle = "rgba(196,213,231,0.10)";
                    for (var grit = 0; grit < 8; grit++) {
                        var gx =
                            (((seg.index * 73 + grit * 137) % 997) / 997) *
                                1.94 -
                            0.97;
                        sctx.fillRect(
                            p2.x + p2.w * gx,
                            y2 + (((grit * 17) % 7) / 7) * hgt,
                            Math.max(0.6, p2.w * 0.0015),
                            Math.max(0.6, hgt * 0.025),
                        );
                    }
                }
            }

            // zebra / rumble
            var r1 = p1.w * 0.045,
                r2 = p2.w * 0.045;
            var rc = alt ? Ccol.rumbleA : Ccol.rumbleB;
            poly(
                sctx,
                p1.x - p1.w - r1,
                y1,
                p1.x - p1.w,
                y1,
                p2.x - p2.w,
                y2,
                p2.x - p2.w - r2,
                y2,
                rc,
            );
            poly(
                sctx,
                p1.x + p1.w + r1,
                y1,
                p1.x + p1.w,
                y1,
                p2.x + p2.w,
                y2,
                p2.x + p2.w + r2,
                y2,
                rc,
            );

            // fita de neon nas bordas (cena + emissiva)
            var e1 = p1.w * 0.009,
                e2 = p2.w * 0.009;
            var neon = css(pal.neon, 0.95);
            poly(
                sctx,
                p1.x - p1.w,
                y1,
                p1.x - p1.w + e1,
                y1,
                p2.x - p2.w + e2,
                y2,
                p2.x - p2.w,
                y2,
                neon,
            );
            poly(
                sctx,
                p1.x + p1.w,
                y1,
                p1.x + p1.w - e1,
                y1,
                p2.x + p2.w - e2,
                y2,
                p2.x + p2.w,
                y2,
                neon,
            );
            if (n < 170) {
                poly(
                    ectx,
                    p1.x - p1.w,
                    y1,
                    p1.x - p1.w + e1,
                    y1,
                    p2.x - p2.w + e2,
                    y2,
                    p2.x - p2.w,
                    y2,
                    neon,
                );
                poly(
                    ectx,
                    p1.x + p1.w,
                    y1,
                    p1.x + p1.w - e1,
                    y1,
                    p2.x + p2.w - e2,
                    y2,
                    p2.x + p2.w,
                    y2,
                    neon,
                );
            }
            if (alt && n < 110) {
                poly(
                    ectx,
                    p1.x - p1.w - r1,
                    y1,
                    p1.x - p1.w,
                    y1,
                    p2.x - p2.w,
                    y2,
                    p2.x - p2.w - r2,
                    y2,
                    css(pal.rumble1, 0.5),
                );
                poly(
                    ectx,
                    p1.x + p1.w + r1,
                    y1,
                    p1.x + p1.w,
                    y1,
                    p2.x + p2.w,
                    y2,
                    p2.x + p2.w + r2,
                    y2,
                    css(pal.rumble1, 0.5),
                );
            }

            // faixas centrais
            if (alt) {
                var l1 = p1.w * 0.007,
                    l2 = p2.w * 0.007,
                    lw1 = (p1.w * 2) / LANES,
                    lw2 = (p2.w * 2) / LANES;
                var lx1 = p1.x - p1.w + lw1,
                    lx2 = p2.x - p2.w + lw2;
                for (var l = 1; l < LANES; l++) {
                    poly(
                        sctx,
                        lx1 - l1,
                        y1,
                        lx1 + l1,
                        y1,
                        lx2 + l2,
                        y2,
                        lx2 - l2,
                        y2,
                        Ccol.lane,
                    );
                    lx1 += lw1;
                    lx2 += lw2;
                }
            }

            // Guarda-corpo contínuo com face metálica e refletores pontuais.
            if (seg.biome !== BIOME_TUNNEL) {
                var rh1 = (p1.w * 0.055 * H) / W,
                    rh2 = (p2.w * 0.055 * H) / W;
                for (var side = -1; side <= 1; side += 2) {
                    var rx1 = p1.x + side * p1.w * 1.12,
                        rx2 = p2.x + side * p2.w * 1.12;
                    poly(
                        sctx,
                        rx1,
                        y1 - rh1,
                        rx1,
                        y1 - rh1 * 1.7,
                        rx2,
                        y2 - rh2 * 1.7,
                        rx2,
                        y2 - rh2,
                        Ccol.rail,
                    );
                    if (seg.index % 3 === 0) {
                        sctx.fillStyle = "#0c1424";
                        sctx.fillRect(
                            rx2,
                            y2 - rh2 * 1.6,
                            Math.max(1, p2.w * 0.005),
                            rh2 * 1.6,
                        );
                        sctx.fillStyle = ectx.fillStyle =
                            side < 0 ? "#ff7fa7" : "#87edff";
                        sctx.fillRect(
                            rx2,
                            y2 - rh2 * 1.5,
                            Math.max(1, p2.w * 0.006),
                            Math.max(1, rh2 * 0.35),
                        );
                        ectx.fillRect(
                            rx2,
                            y2 - rh2 * 1.5,
                            Math.max(1, p2.w * 0.006),
                            Math.max(1, rh2 * 0.35),
                        );
                    }
                }
            }
        }

        // Pintura sobre o plano projetado; sem linhas de rodovia e sem emissão.
        function roadMark(seg, left, right, from, to, color) {
            var a = seg.p1.screen,
                b = seg.p2.screen;
            var x1 = lerp(a.x, b.x, from),
                x2 = lerp(a.x, b.x, to),
                y1 = lerp(a.y, b.y, from),
                y2 = lerp(a.y, b.y, to),
                w1 = lerp(a.w, b.w, from),
                w2 = lerp(a.w, b.w, to);
            poly(
                sctx,
                x1 + left * w1,
                y1,
                x1 + right * w1,
                y1,
                x2 + right * w2,
                y2,
                x2 + left * w2,
                y2,
                color,
            );
        }

        function drawFormulaSegment(seg, n) {
            var a = seg.p1.screen,
                b = seg.p2.screen;
            var hgt = Math.ceil(a.y - b.y) + 1,
                alt = seg.color === 1;
            sctx.fillStyle = alt ? "#368448" : "#307840";
            sctx.fillRect(0, b.y, W, hgt);
            roadMark(seg, -1.14, 1.14, 0, 1, "#8b897c");
            roadMark(seg, -1, 1, 0, 1, alt ? "#56595c" : "#525558");
            if (quality > 0 && n < 65) {
                sctx.fillStyle = "rgba(210,215,220,0.10)";
                for (var grit = 0; grit < 8; grit++) {
                    var gx =
                        (((seg.index * 73 + grit * 137) % 997) / 997) * 1.94 -
                        0.97;
                    sctx.fillRect(
                        b.x + b.w * gx,
                        b.y + (((grit * 17) % 7) / 7) * hgt,
                        Math.max(0.6, b.w * 0.0015),
                        Math.max(0.6, hgt * 0.025),
                    );
                }
            }
            var curb = alt ? "#d82f36" : "#f3f3ef";
            roadMark(seg, -1.065, -1, 0, 1, curb);
            roadMark(seg, 1, 1.065, 0, 1, curb);
            roadMark(seg, -1, -0.989, 0, 1, "#ffffff");
            roadMark(seg, 0.989, 1, 0, 1, "#ffffff");
            if (seg.grid) {
                for (var side = -1; side <= 1; side += 2) {
                    var center = side * 0.46,
                        from = side < 0 ? 0.14 : 0.38;
                    roadMark(
                        seg,
                        center - 0.17,
                        center + 0.17,
                        from,
                        from + 0.045,
                        "#eeeeea",
                    );
                    roadMark(
                        seg,
                        center - 0.17,
                        center - 0.16,
                        from,
                        from + 0.44,
                        "#eeeeea",
                    );
                    roadMark(
                        seg,
                        center + 0.16,
                        center + 0.17,
                        from,
                        from + 0.44,
                        "#eeeeea",
                    );
                }
            }
            if (seg.startLine) {
                for (var row = 0; row < 2; row++)
                    for (var col = 0; col < 32; col++)
                        roadMark(
                            seg,
                            -0.989 + col * (1.978 / 32),
                            -0.989 + (col + 1) * (1.978 / 32),
                            row / 2,
                            (row + 1) / 2,
                            (row + col) % 2 ? "#191b1d" : "#ffffff",
                        );
            }
        }

        function drawTunnel(seg) {
            var p1 = seg.p1.screen,
                p2 = seg.p2.screen;
            if (p1.y <= p2.y) return;
            var h1 = p1.w * tunH,
                h2 = p2.w * tunH;
            poly(
                sctx,
                p1.x - p1.w,
                p1.y,
                p1.x - p1.w,
                p1.y - h1,
                p2.x - p2.w,
                p2.y - h2,
                p2.x - p2.w,
                p2.y,
                Ccol.wall,
            );
            poly(
                sctx,
                p1.x + p1.w,
                p1.y,
                p1.x + p1.w,
                p1.y - h1,
                p2.x + p2.w,
                p2.y - h2,
                p2.x + p2.w,
                p2.y,
                Ccol.wall,
            );
            poly(
                sctx,
                p1.x - p1.w,
                p1.y - h1,
                p1.x + p1.w,
                p1.y - h1,
                p2.x + p2.w,
                p2.y - h2,
                p2.x - p2.w,
                p2.y - h2,
                Ccol.ceil,
            );
            if (seg.index % 3 === 0) {
                var t1 = p1.w * 0.075,
                    t2 = p2.w * 0.075,
                    yA = p1.y - h1 * 0.86,
                    yB = p2.y - h2 * 0.86;
                poly(
                    sctx,
                    p1.x - p1.w,
                    yA,
                    p1.x - p1.w,
                    yA + t1,
                    p2.x - p2.w,
                    yB + t2,
                    p2.x - p2.w,
                    yB,
                    Ccol.tneon,
                );
                poly(
                    ectx,
                    p1.x - p1.w,
                    yA,
                    p1.x - p1.w,
                    yA + t1,
                    p2.x - p2.w,
                    yB + t2,
                    p2.x - p2.w,
                    yB,
                    Ccol.tneon,
                );
                poly(
                    sctx,
                    p1.x + p1.w,
                    yA,
                    p1.x + p1.w,
                    yA + t1,
                    p2.x + p2.w,
                    yB + t2,
                    p2.x + p2.w,
                    yB,
                    Ccol.tneon,
                );
                poly(
                    ectx,
                    p1.x + p1.w,
                    yA,
                    p1.x + p1.w,
                    yA + t1,
                    p2.x + p2.w,
                    yB + t2,
                    p2.x + p2.w,
                    yB,
                    Ccol.tneon,
                );
                var c1 = p1.w * 0.16,
                    c2 = p2.w * 0.16;
                poly(
                    sctx,
                    p1.x - c1,
                    p1.y - h1,
                    p1.x + c1,
                    p1.y - h1,
                    p2.x + c2,
                    p2.y - h2,
                    p2.x - c2,
                    p2.y - h2,
                    Ccol.tlight,
                );
                poly(
                    ectx,
                    p1.x - c1,
                    p1.y - h1,
                    p1.x + c1,
                    p1.y - h1,
                    p2.x + c2,
                    p2.y - h2,
                    p2.x - c2,
                    p2.y - h2,
                    Ccol.tlight,
                );
            }
        }

        /* A camada emissiva precisa da MESMA oclusão da cena, não apenas somar luz.
           Recortar com a imagem opaca impede faixas, postes e lanternas através do carro. */
        function blitSprite(spr, srcH, x, y, w, h, alpha) {
            var opacity = spr.solid ? 1 : alpha;
            sctx.save();
            sctx.globalAlpha = opacity;
            sctx.drawImage(spr.img, 0, 0, spr.w, srcH, x, y, w, h);
            sctx.restore();
            ectx.save();
            ectx.globalAlpha = opacity;
            ectx.globalCompositeOperation = "destination-out";
            ectx.drawImage(spr.img, 0, 0, spr.w, srcH, x, y, w, h);
            ectx.globalCompositeOperation = "source-over";
            if (spr.glow) {
                ectx.globalAlpha = opacity * 0.65;
                ectx.drawImage(spr.glow, 0, 0, spr.w, srcH, x, y, w, h);
            }
            ectx.restore();
        }
        function drawSprite(seg, spr, offset, clipY, alpha, pct) {
            pct = pct || 0;
            var sc = lerp(seg.p1.screen.scale, seg.p2.screen.scale, pct);
            var destW = (sc * spr.worldW * W) / 2;
            if (destW < 1.2) return;
            var destH = destW * (spr.h / spr.w);
            var destX =
                lerp(seg.p1.screen.x, seg.p2.screen.x, pct) +
                (sc * offset * ROADW * W) / 2 -
                destW * 0.5;
            var destY = lerp(seg.p1.screen.y, seg.p2.screen.y, pct) - destH;
            if (destX > W || destX + destW < 0) return;
            var clipH = destY + destH - clipY;
            if (clipH < 0) clipH = 0;
            if (clipH >= destH) return;
            var srcH = spr.h - (spr.h * clipH) / destH;
            blitSprite(spr, srcH, destX, destY, destW, destH - clipH, alpha);
        }

        /* ---------- céu ---------- */
        function renderSky() {
            var hy =
                horizonY > H * 0.12 && horizonY < H * 0.94 ? horizonY : H * 0.5;
            var g = sctx.createLinearGradient(0, 0, 0, hy);
            g.addColorStop(0, css(pal.skyTop));
            g.addColorStop(0.45, css(pal.skyMid));
            g.addColorStop(0.82, css(pal.skyLow));
            g.addColorStop(1, css(pal.horizon));
            sctx.fillStyle = g;
            sctx.fillRect(0, 0, W, hy + 2);
            sctx.fillStyle = css(pal.horizon);
            sctx.fillRect(0, hy - 1, W, H - hy + 1);

            // Halo difuso preserva o degradê do sol, sem estourar o disco em branco.
            var halo = sctx.createRadialGradient(
                W * (0.5 + sunOffset),
                hy - H * 0.1,
                0,
                W * (0.5 + sunOffset),
                hy - H * 0.1,
                Math.min(W, H) * 0.53,
            );
            halo.addColorStop(0, css(pal.sun2, 0.24));
            halo.addColorStop(1, css(pal.sun2, 0));
            sctx.fillStyle = halo;
            sctx.fillRect(0, 0, W, hy);
            // Nuvens finas em planos de paralaxe.
            for (var cloud = 0; cloud < 9; cloud++) {
                var cy = hy * (0.17 + (cloud % 4) * 0.14),
                    cw = W * (0.17 + (cloud % 3) * 0.09);
                var cx =
                    increase(cloud * W * 0.283 + bgX * 0.035, W * 0.2, W + cw) -
                    cw;
                var mist = sctx.createLinearGradient(
                    0,
                    cy - H * 0.012,
                    0,
                    cy + H * 0.014,
                );
                mist.addColorStop(0, css(pal.sun1, 0));
                mist.addColorStop(
                    0.5,
                    css(pal.sun1, (1 - pal.star * 0.75) * 0.1),
                );
                mist.addColorStop(1, css(pal.sun1, 0));
                sctx.fillStyle = mist;
                sctx.beginPath();
                sctx.ellipse(cx, cy, cw, H * 0.014, -0.025, 0, PI * 2);
                sctx.fill();
            }
            // estrelas
            if (pal.star > 0.02) {
                for (var i = 0; i < stars.length; i++) {
                    var st = stars[i];
                    var tw = 0.55 + 0.45 * Math.sin(sunPulse * 1.6 + st.t);
                    sctx.fillStyle =
                        "rgba(255,255,255," +
                        (pal.star * tw * 0.85).toFixed(3) +
                        ")";
                    sctx.fillRect(st.x * W, st.y * hy, st.s, st.s);
                }
            }
            // sol
            var sunX = W * (0.5 + sunOffset);
            var sunY = hy - H * 0.055;
            var sunR = Math.min(W, H) * 0.165;
            drawSun(sunR);
            sctx.drawImage(sunCv, sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);

            // raios de luz
            sctx.save();
            sctx.globalCompositeOperation = "lighter";
            sctx.translate(sunX, sunY);
            for (var r = 0; r < 9; r++) {
                var a = sunPulse * 0.05 + r * ((PI * 2) / 9);
                var rg = sctx.createLinearGradient(
                    0,
                    0,
                    Math.cos(a) * sunR * 4,
                    Math.sin(a) * sunR * 4,
                );
                rg.addColorStop(0, css(pal.sun1, 0.045));
                rg.addColorStop(1, css(pal.sun1, 0));
                sctx.fillStyle = rg;
                sctx.beginPath();
                sctx.moveTo(0, 0);
                sctx.lineTo(
                    Math.cos(a - 0.05) * sunR * 4,
                    Math.sin(a - 0.05) * sunR * 4,
                );
                sctx.lineTo(
                    Math.cos(a + 0.05) * sunR * 4,
                    Math.sin(a + 0.05) * sunR * 4,
                );
                sctx.closePath();
                sctx.fill();
            }
            sctx.restore();

            // serras
            var layers = [
                { i: 0, par: 0.16, amp: 0.13, base: 0.02 },
                { i: 1, par: 0.28, amp: 0.17, base: 0.012 },
                { i: 2, par: 0.42, amp: 0.21, base: 0.004 },
            ];
            for (var li = 0; li < 3; li++) {
                var L2 = layers[li],
                    pts = ridges[L2.i];
                var col = css(
                    li === 0 ? pal.mount3 : li === 1 ? pal.mount2 : pal.mount1,
                );
                var off = (bgX * L2.par) % W;
                sctx.fillStyle = col;
                for (var rep = -1; rep <= 1; rep++) {
                    var ox = off + rep * W;
                    sctx.beginPath();
                    sctx.moveTo(ox, hy + 2);
                    for (var i2 = 0; i2 < pts.length; i2++)
                        sctx.lineTo(
                            ox + pts[i2].x * W,
                            hy - pts[i2].y * H * L2.amp - H * L2.base,
                        );
                    sctx.lineTo(ox + W, hy + 2);
                    sctx.closePath();
                    sctx.fill();
                }
            }
            if (curBiome === BIOME_CITY || curBiome === BIOME_PORT) {
                // Skyline distante, independente dos prédios que passam ao lado da pista.
                for (var tower = 0; tower < 48; tower++) {
                    var tw = W * (0.009 + ((tower * 7) % 9) * 0.002),
                        th = H * (0.018 + ((tower * 13) % 17) * 0.004);
                    var bx =
                        increase((tower * W) / 44 + bgX * 0.09, 0, W + tw) - tw;
                    sctx.fillStyle = css(mixRgb(pal.mount1, pal.skyMid, 0.18));
                    sctx.fillRect(bx, hy - th, tw, th);
                    sctx.fillRect(
                        bx + tw * 0.43,
                        hy - th - H * 0.012,
                        Math.max(1, tw * 0.08),
                        H * 0.012,
                    );
                    if (quality > 0) {
                        sctx.fillStyle = css(pal.sun1, 0.35 + pal.star * 0.3);
                        for (var wy = hy - th + 4; wy < hy - 3; wy += 7)
                            sctx.fillRect(
                                bx + tw * 0.25,
                                wy,
                                Math.max(1, tw * 0.16),
                                2,
                            );
                    }
                }
            }
            if (curBiome === BIOME_GLACIER && quality > 0) {
                for (var aurora = 0; aurora < 3; aurora++) {
                    sctx.beginPath();
                    for (var ax = 0; ax <= 40; ax++) {
                        var ay =
                            hy * (0.32 + aurora * 0.13) +
                            Math.sin(ax * 0.17 + sunPulse * 0.08 + aurora) *
                                H *
                                0.035;
                        if (ax === 0) sctx.moveTo(0, ay);
                        else sctx.lineTo((ax * W) / 40, ay);
                    }
                    sctx.strokeStyle =
                        aurora % 2
                            ? "rgba(125,109,255,0.12)"
                            : "rgba(90,255,199,0.12)";
                    sctx.lineWidth = H * 0.022;
                    sctx.stroke();
                }
            }
            return hy;
        }

        function drawSun(R) {
            sunFrame++;
            if (sunFrame % 2 !== 1 && sunCv.width === Math.ceil(R * 2)) return;
            var size = Math.max(80, Math.ceil(R * 2));
            if (sunCv.width !== size) {
                sunCv.width = size;
                sunCv.height = size;
            }
            var g = sunCv.getContext("2d");
            g.clearRect(0, 0, size, size);
            g.save();
            g.beginPath();
            g.arc(size / 2, size / 2, size / 2 - 2, 0, PI * 2);
            g.clip();
            var lg = g.createLinearGradient(0, 0, 0, size);
            lg.addColorStop(0, css(mixRgb(pal.sun1, pal.sun2, 0.18)));
            lg.addColorStop(0.42, css(mixRgb(pal.sun1, pal.sun2, 0.55)));
            lg.addColorStop(1, css(pal.sun2));
            g.fillStyle = lg;
            g.fillRect(0, 0, size, size);
            g.restore();
            // faixas horizontais
            g.globalCompositeOperation = "destination-out";
            var bands = 11,
                phase = (sunPulse * 7) % 14;
            for (var b = 0; b < bands; b++) {
                var y = size * 0.46 + b * (size * 0.052) + phase * 0.6;
                var th = size * 0.006 + b * size * 0.0038;
                if (y > size) continue;
                g.fillStyle = "#000";
                g.fillRect(0, y, size, th);
            }
            g.globalCompositeOperation = "source-over";
        }

        /* ---------- carro do jogador ---------- */
        function groundScreenY() {
            var sc = cameraDepth / Math.max(playerZ(), 1);
            return Math.min(
                H * 0.995,
                H * (0.5 - camPitch) + sc * camHeight * H * 0.5,
            );
        }
        function renderPlayer() {
            var na = playerSprites.length;
            var spr =
                playerSprites[
                    clamp(
                        Math.round(((clamp(visYaw, -1, 1) + 1) / 2) * (na - 1)),
                        0,
                        na - 1,
                    )
                ];
            var sc = cameraDepth / playerZ();
            var destW = (sc * spr.worldW * W) / 2;
            var destH = destW * (spr.h / spr.w);
            var bob =
                Math.sin(sunPulse * 13) * destH * 0.006 * (speed / maxSpeed);
            var destX = W / 2 - destW / 2 + playerX * 0.06 * destW;
            var destY = groundScreenY() - destH + bob;
            var tilt = driftAngle * 0.34;

            // Reflexo de luz sob o chassi, atrás da carroceria opaca.
            var groundY = destY + destH * 0.96;
            sctx.save();
            sctx.translate(W / 2, groundY);
            sctx.scale(1, 0.22);
            var underLocal = sctx.createRadialGradient(
                0,
                0,
                0,
                0,
                0,
                destW * 0.34,
            );
            underLocal.addColorStop(0, "rgba(0,210,255,0.22)");
            underLocal.addColorStop(1, "rgba(0,210,255,0)");
            sctx.fillStyle = underLocal;
            sctx.fillRect(-destW * 0.4, -destW * 0.4, destW * 0.8, destW * 0.8);
            sctx.restore();

            // chamas do nitro
            if (boosting > 0.05) {
                sctx.save();
                ectx.save();
                var fx = [destX + destW * 0.415, destX + destW * 0.585],
                    fy = destY + destH * 0.872;
                for (var f = 0; f < 2; f++) {
                    var len = destH * (0.1 + boosting * 0.3) * rand(0.75, 1.2);
                    var g1 = sctx.createLinearGradient(
                        fx[f],
                        fy,
                        fx[f],
                        fy + len,
                    );
                    g1.addColorStop(0, "rgba(255,255,255,0.95)");
                    g1.addColorStop(0.35, "rgba(120,220,255,0.75)");
                    g1.addColorStop(1, "rgba(255,47,135,0)");
                    sctx.fillStyle = g1;
                    ectx.fillStyle = g1;
                    sctx.beginPath();
                    sctx.ellipse(
                        fx[f],
                        fy + len * 0.45,
                        destW * 0.03,
                        len * 0.55,
                        0,
                        0,
                        PI * 2,
                    );
                    sctx.fill();
                    ectx.beginPath();
                    ectx.ellipse(
                        fx[f],
                        fy + len * 0.45,
                        destW * 0.03,
                        len * 0.55,
                        0,
                        0,
                        PI * 2,
                    );
                    ectx.fill();
                }
                sctx.restore();
                ectx.restore();
            }
            sctx.save();
            ectx.save();
            sctx.translate(destX + destW / 2, destY + destH * 0.72);
            ectx.translate(destX + destW / 2, destY + destH * 0.72);
            sctx.rotate(tilt);
            ectx.rotate(tilt);
            blitSprite(spr, spr.h, -destW / 2, -destH * 0.72, destW, destH, 1);
            if (ctrl.brake && spr.glow) {
                ectx.globalAlpha = 0.65;
                ectx.drawImage(
                    spr.glow,
                    -destW / 2,
                    -destH * 0.72,
                    destW,
                    destH,
                );
            }
            sctx.restore();
            ectx.restore();
            if (ctrl.brake && spr.glow) {
                sctx.save();
                sctx.translate(destX + destW / 2, destY + destH * 0.72);
                sctx.rotate(tilt);
                sctx.drawImage(
                    spr.glow,
                    -destW / 2,
                    -destH * 0.72,
                    destW,
                    destH,
                );
                sctx.restore();
            }
        }

        /* ---------- partículas e efeitos de velocidade ---------- */
        function renderParticles() {
            var i;
            for (i = 0; i < particles.length; i++) {
                var p = particles[i];
                var a = p.life * (p.type ? 0.32 : 0.24);
                var col = p.type
                    ? css(pal.horizon, a)
                    : "rgba(255,235,255," + a.toFixed(3) + ")";
                sctx.fillStyle = col;
                sctx.beginPath();
                sctx.arc(p.x * W, p.y * H, p.size * W, 0, PI * 2);
                sctx.fill();
            }
            for (i = 0; i < sparks.length; i++) {
                var s = sparks[i];
                var c =
                    "rgba(255," +
                    ((160 + 90 * s.life) | 0) +
                    ",80," +
                    s.life.toFixed(2) +
                    ")";
                sctx.fillStyle = c;
                ectx.fillStyle = c;
                sctx.fillRect(s.x * W, s.y * H, s.size, s.size);
                ectx.fillRect(s.x * W, s.y * H, s.size * 1.6, s.size * 1.6);
            }
            for (i = 0; i < floats.length; i++) {
                var fl = floats[i];
                var a2 = clamp(fl.life, 0, 1);
                ectx.font =
                    "italic 900 " +
                    ((W * 0.03) | 0) +
                    'px "Arial Black",Arial,sans-serif';
                ectx.textAlign = "center";
                ectx.fillStyle = "rgba(255,224,102," + a2.toFixed(2) + ")";
                ectx.fillText(fl.txt, fl.x * W, fl.y * H);
                sctx.font = ectx.font;
                sctx.textAlign = "center";
                sctx.fillStyle = "rgba(255,240,190," + a2.toFixed(2) + ")";
                sctx.fillText(fl.txt, fl.x * W, fl.y * H);
            }
        }
        function renderSpeedLines() {
            var sp = speed / maxSpeed;
            var intensity =
                clamp((sp - 0.55) / 0.45, 0, 1) * 0.55 + boosting * 0.75;
            if (intensity <= 0.02) return;
            var cxp = W / 2,
                cyp = horizonY;
            ectx.save();
            ectx.globalCompositeOperation = "lighter";
            for (var i = 0; i < 26; i++) {
                var a = (i / 26) * PI * 2 + sunPulse * 0.4;
                var r0 = Math.min(W, H) * rand(0.3, 0.48),
                    r1 = r0 + Math.min(W, H) * rand(0.16, 0.45) * intensity;
                ectx.strokeStyle =
                    "rgba(200,230,255," +
                    (0.06 + 0.16 * intensity) * Math.random() +
                    ")";
                ectx.lineWidth = rand(1, 3.4);
                ectx.beginPath();
                ectx.moveTo(
                    cxp + Math.cos(a) * r0,
                    cyp + Math.sin(a) * r0 * 0.8,
                );
                ectx.lineTo(
                    cxp + Math.cos(a) * r1,
                    cyp + Math.sin(a) * r1 * 0.8,
                );
                ectx.stroke();
            }
            ectx.restore();
        }

        buildRidges();
        buildStars();
        return {
            render: function (frame) {
                loadFrame(frame);
                // O resultado pertence ao frame, não à próxima vista renderizada.
                pal = {};
                updatePalette(frame.dayPhase);
                frameColors();
                renderSky();
                renderRoad();
                renderParticles();
                if (camMode !== 1) renderPlayer();
                renderSpeedLines();
                return { pal: pal, horizonY: horizonY };
            },
            blitSprite: function (frame, spr, srcH, x, y, w, h, alpha) {
                sctx = frame.sctx;
                ectx = frame.ectx;
                blitSprite(spr, srcH, x, y, w, h, alpha);
            },
            drawSprite: function (frame, seg, spr, offset, clipY, alpha, pct) {
                W = frame.W;
                ROADW = frame.world.ROADW;
                sctx = frame.sctx;
                ectx = frame.ectx;
                drawSprite(seg, spr, offset, clipY, alpha, pct);
            },
        };
    };
})();
