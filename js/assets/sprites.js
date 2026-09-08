/* Scripts clássicos: carregar depois de NeonDrive.util e NeonDrive.models. */
(function (ND) {
    "use strict";

    var PI = ND.util.PI,
        lerp = ND.util.lerp,
        cv = ND.util.cv,
        rr = ND.util.rr;
    var buildCar = ND.models.buildCar,
        buildTruck = ND.models.buildTruck,
        buildFormulaCar = ND.models.buildFormulaCar,
        carSprites = ND.models.carSprites;

    /* ---------- sprites pré-renderizados ---------- */
    function makeSprite(w, h, worldW, drawBase, drawGlow) {
        var base = cv(w, h);
        drawBase(base.getContext("2d"), w, h);
        var glow = null;
        if (drawGlow) {
            glow = cv(w, h);
            drawGlow(glow.getContext("2d"), w, h);
        }
        return {
            img: base,
            glow: glow,
            w: w,
            h: h,
            worldW: worldW,
        };
    }

    function buildSprites(ROADW) {
        var SPR = {};
        var i, k;
        function bez(A, B, C, t) {
            var u = 1 - t;
            return [
                u * u * A[0] + 2 * u * t * B[0] + t * t * C[0],
                u * u * A[1] + 2 * u * t * B[1] + t * t * C[1],
            ];
        }

        /* ── palmeiras: tronco segmentado, folíolos individuais, cocos, contraluz ── */
        function palmSprite(seed) {
            return makeSprite(340, 640, 1400, function (g, w, h) {
                var lean = ((seed % 3) - 1) * 0.17,
                    j;
                var base = [w * 0.54, h],
                    mid = [w * (0.52 + lean * 0.45), h * 0.62],
                    top = [w * (0.5 + lean * 0.95), h * 0.325];
                var pts = [];
                for (j = 0; j <= 28; j++) {
                    var t = j / 28,
                        q = bez(base, mid, top, t);
                    pts.push([
                        q[0],
                        q[1],
                        lerp(w * 0.062, w * 0.024, t) *
                            (1 + 0.09 * Math.sin(t * 26)),
                    ]);
                }
                for (j = 1; j < pts.length; j++) {
                    var A2 = pts[j - 1],
                        B2 = pts[j];
                    g.fillStyle = j % 2 ? "#241634" : "#180d28";
                    g.beginPath();
                    g.moveTo(A2[0] - A2[2], A2[1]);
                    g.lineTo(A2[0] + A2[2], A2[1]);
                    g.lineTo(B2[0] + B2[2], B2[1]);
                    g.lineTo(B2[0] - B2[2], B2[1]);
                    g.closePath();
                    g.fill();
                    g.fillStyle = "rgba(255,120,200,0.26)";
                    g.fillRect(
                        B2[0] + B2[2] - w * 0.011,
                        B2[1],
                        w * 0.011,
                        A2[1] - B2[1] + 1,
                    );
                }
                var bx = top[0],
                    by = top[1],
                    nf = 10 + (seed % 3);
                for (var f = 0; f < nf; f++) {
                    var a0 =
                        -PI * 0.5 +
                        (f - (nf - 1) / 2) * ((PI * 1.06) / nf) +
                        (seed % 2 ? 0.06 : -0.06);
                    var L =
                        h *
                        0.3 *
                        (0.74 + 0.32 * Math.cos((f - (nf - 1) / 2) * 0.38));
                    var A3 = [bx, by];
                    var B3 = [
                        bx + Math.cos(a0) * L * 0.56,
                        by + Math.sin(a0) * L * 0.44,
                    ];
                    var C3 = [
                        bx + Math.cos(a0) * L * 1.04,
                        by + Math.sin(a0) * L * 0.7 + L * 0.5,
                    ];
                    var up = [],
                        dn = [],
                        spine = [];
                    for (k = 0; k <= 12; k++) {
                        var tt = k / 12,
                            q1 = bez(A3, B3, C3, tt),
                            q2 = bez(A3, B3, C3, Math.min(1, tt + 0.02));
                        var dx = q2[0] - q1[0],
                            dy = q2[1] - q1[1],
                            dl = Math.sqrt(dx * dx + dy * dy) || 1;
                        var nx = -dy / dl,
                            ny = dx / dl;
                        var ww =
                            L * 0.27 * Math.sin(tt * PI) * (1 - tt * 0.22) +
                            w * 0.01;
                        spine.push(q1);
                        up.push([q1[0] + nx * ww, q1[1] + ny * ww]);
                        dn.push([q1[0] - nx * ww, q1[1] - ny * ww]);
                    }
                    g.fillStyle = f % 2 ? "#1d1130" : "#170c28";
                    g.beginPath();
                    g.moveTo(up[0][0], up[0][1]);
                    for (k = 1; k < up.length; k++)
                        g.lineTo(up[k][0], up[k][1]);
                    for (k = dn.length - 1; k >= 0; k--)
                        g.lineTo(dn[k][0], dn[k][1]);
                    g.closePath();
                    g.fill();
                    g.strokeStyle = "rgba(5,2,10,0.85)";
                    g.lineWidth = 1.7;
                    for (k = 2; k < up.length; k++) {
                        g.beginPath();
                        g.moveTo(up[k][0], up[k][1]);
                        g.lineTo(spine[k - 1][0], spine[k - 1][1]);
                        g.stroke();
                        g.beginPath();
                        g.moveTo(dn[k][0], dn[k][1]);
                        g.lineTo(spine[k - 1][0], spine[k - 1][1]);
                        g.stroke();
                    }
                    g.strokeStyle = "rgba(255,130,208,0.34)";
                    g.lineWidth = 2.6;
                    g.beginPath();
                    g.moveTo(up[0][0], up[0][1]);
                    for (k = 1; k < up.length; k++)
                        g.lineTo(up[k][0], up[k][1]);
                    g.stroke();
                    g.strokeStyle = "#0d0619";
                    g.lineWidth = 2.8;
                    g.beginPath();
                    g.moveTo(A3[0], A3[1]);
                    g.quadraticCurveTo(B3[0], B3[1], C3[0], C3[1]);
                    g.stroke();
                }
                g.fillStyle = "#0f0820";
                for (j = 0; j < 5; j++) {
                    g.beginPath();
                    g.arc(
                        bx + Math.cos(j * 1.3) * w * 0.04,
                        by + h * 0.02 + Math.sin(j * 1.3) * h * 0.012,
                        w * 0.023,
                        0,
                        PI * 2,
                    );
                    g.fill();
                }
            });
        }
        SPR.palms = [palmSprite(0), palmSprite(1), palmSprite(2)];
        SPR.palm = SPR.palms[0];

        /* ── poste com braço curvo, cone de luz e faixa de neon ── */
        SPR.lamp = makeSprite(
            180,
            520,
            720,
            function (g, w, h) {
                g.fillStyle = "#150e28";
                g.fillRect(w * 0.455, h * 0.17, w * 0.075, h * 0.83);
                g.fillStyle = "#1d1436";
                rr(g, w * 0.39, h * 0.945, w * 0.22, h * 0.055, 4);
                g.fill();
                g.strokeStyle = "#150e28";
                g.lineWidth = w * 0.068;
                g.lineCap = "round";
                g.beginPath();
                g.moveTo(w * 0.49, h * 0.205);
                g.quadraticCurveTo(w * 0.49, h * 0.08, w * 0.255, h * 0.092);
                g.stroke();
                g.fillStyle = "#221838";
                rr(g, w * 0.095, h * 0.072, w * 0.31, h * 0.038, 7);
                g.fill();
                g.fillStyle = "#fff3c4";
                rr(g, w * 0.115, h * 0.104, w * 0.27, h * 0.017, 4);
                g.fill();
                g.fillStyle = "#ff2f87";
                g.fillRect(w * 0.47, h * 0.32, w * 0.03, h * 0.28);
                g.fillStyle = "#2a1f45";
                rr(g, w * 0.4, h * 0.66, w * 0.19, h * 0.1, 3);
                g.fill();
            },
            function (g, w, h) {
                g.fillStyle = "rgba(255,232,168,0.95)";
                rr(g, w * 0.105, h * 0.096, w * 0.29, h * 0.03, 6);
                g.fill();
                var cg = g.createLinearGradient(0, h * 0.1, 0, h * 0.74);
                cg.addColorStop(0, "rgba(255,215,140,0.44)");
                cg.addColorStop(1, "rgba(255,180,90,0)");
                g.fillStyle = cg;
                g.beginPath();
                g.moveTo(w * 0.11, h * 0.11);
                g.lineTo(w * 0.39, h * 0.11);
                g.lineTo(w * 0.76, h * 0.74);
                g.lineTo(-w * 0.14, h * 0.74);
                g.closePath();
                g.fill();
                g.fillStyle = "#ff2f87";
                g.fillRect(w * 0.47, h * 0.32, w * 0.03, h * 0.28);
            },
        );

        /* ── outdoors com pernas treliçadas e balizamento ── */
        function sign(text, frame, ink) {
            function panel(g, w, h) {
                g.strokeStyle = frame;
                g.lineWidth = 7;
                rr(g, w * 0.075, h * 0.085, w * 0.85, h * 0.325, 10);
                g.stroke();
                g.fillStyle = ink;
                g.font =
                    "italic 900 " +
                    ((h * 0.165) | 0) +
                    'px "Arial Black",Arial,sans-serif';
                g.textAlign = "center";
                g.textBaseline = "middle";
                g.fillText(text, w * 0.5, h * 0.248);
                g.fillStyle = "#ffd166";
                for (var d = 0; d < 5; d++) {
                    g.beginPath();
                    g.arc(
                        w * (0.13 + d * 0.185),
                        h * 0.468,
                        w * 0.016,
                        0,
                        PI * 2,
                    );
                    g.fill();
                }
            }
            return makeSprite(
                340,
                370,
                1850,
                function (g, w, h) {
                    var py = h * 0.45,
                        t;
                    g.strokeStyle = "#141026";
                    g.lineWidth = w * 0.026;
                    g.beginPath();
                    g.moveTo(w * 0.4, py);
                    g.lineTo(w * 0.355, h);
                    g.stroke();
                    g.beginPath();
                    g.moveTo(w * 0.6, py);
                    g.lineTo(w * 0.645, h);
                    g.stroke();
                    g.lineWidth = w * 0.012;
                    for (t = 0; t < 6; t++) {
                        var u0 = t / 6,
                            u1 = (t + 1) / 6,
                            y0 = py + (h - py) * u0,
                            y1 = py + (h - py) * u1;
                        var xa0 = lerp(w * 0.4, w * 0.355, u0),
                            xb0 = lerp(w * 0.6, w * 0.645, u0);
                        var xa1 = lerp(w * 0.4, w * 0.355, u1),
                            xb1 = lerp(w * 0.6, w * 0.645, u1);
                        g.beginPath();
                        g.moveTo(xa0, y0);
                        g.lineTo(xb1, y1);
                        g.stroke();
                        g.beginPath();
                        g.moveTo(xb0, y0);
                        g.lineTo(xa1, y1);
                        g.stroke();
                        g.beginPath();
                        g.moveTo(xa1, y1);
                        g.lineTo(xb1, y1);
                        g.stroke();
                    }
                    g.fillStyle = "rgba(9,5,18,0.95)";
                    rr(g, w * 0.04, h * 0.05, w * 0.92, h * 0.395, 14);
                    g.fill();
                    g.strokeStyle = "#2a1f45";
                    g.lineWidth = 3;
                    rr(g, w * 0.04, h * 0.05, w * 0.92, h * 0.395, 14);
                    g.stroke();
                    panel(g, w, h);
                },
                panel,
            );
        }
        SPR.signs = [
            sign("NEON", "#ff2f87", "#ffd9ec"),
            sign("92", "#00e5ff", "#d6fbff"),
            sign("TURBO", "#ffe066", "#fff6d0"),
            sign("DRIVE", "#7b2fff", "#e6d9ff"),
            sign("COSTA", "#ff6b35", "#ffe0d0"),
        ];

        /* ── pórtico treliçado sobre a pista ── */
        function archParts(g, w, h, glow) {
            var t;
            if (!glow) {
                for (var s2 = 0; s2 < 2; s2++) {
                    var x0 = s2 ? w * 0.918 : w * 0.022;
                    g.fillStyle = "#100b1e";
                    g.fillRect(x0, h * 0.135, w * 0.06, h * 0.865);
                    g.strokeStyle = "#241a40";
                    g.lineWidth = 3;
                    for (t = 0; t < 10; t++) {
                        var y0 = h * 0.135 + (h * 0.865 * t) / 10,
                            y1 = h * 0.135 + (h * 0.865 * (t + 1)) / 10;
                        g.beginPath();
                        g.moveTo(x0, y0);
                        g.lineTo(x0 + w * 0.06, y1);
                        g.stroke();
                        g.beginPath();
                        g.moveTo(x0 + w * 0.06, y0);
                        g.lineTo(x0, y1);
                        g.stroke();
                    }
                }
                g.fillStyle = "#120c22";
                g.fillRect(w * 0.022, h * 0.052, w * 0.956, h * 0.14);
                g.strokeStyle = "#241a40";
                g.lineWidth = 3;
                for (t = 0; t < 24; t++) {
                    var xa = w * 0.022 + (w * 0.956 * t) / 24,
                        xb = w * 0.022 + (w * 0.956 * (t + 1)) / 24;
                    g.beginPath();
                    g.moveTo(xa, h * 0.052);
                    g.lineTo(xb, h * 0.192);
                    g.stroke();
                    g.beginPath();
                    g.moveTo(xb, h * 0.052);
                    g.lineTo(xa, h * 0.192);
                    g.stroke();
                }
                g.fillStyle = "rgba(6,3,14,0.93)";
                rr(g, w * 0.1, h * 0.066, w * 0.8, h * 0.11, 8);
                g.fill();
            }
            g.strokeStyle = "#00e5ff";
            g.lineWidth = 6;
            rr(g, w * 0.1, h * 0.066, w * 0.8, h * 0.11, 8);
            g.stroke();
            g.fillStyle = "#d9fbff";
            g.font =
                "italic 900 " +
                ((h * 0.08) | 0) +
                'px "Arial Black",Arial,sans-serif';
            g.textAlign = "center";
            g.textBaseline = "middle";
            g.fillText("NEON DRIVE", w * 0.5, h * 0.121);
            g.fillStyle = "#7b2fff";
            g.fillRect(w * 0.086, h * 0.19, w * 0.009, h * 0.81);
            g.fillRect(w * 0.905, h * 0.19, w * 0.009, h * 0.81);
            g.fillStyle = "#ff2f87";
            for (t = 0; t < 3; t++) {
                g.fillRect(
                    w * 0.03,
                    h * (0.3 + t * 0.24),
                    w * 0.044,
                    h * 0.009,
                );
                g.fillRect(
                    w * 0.926,
                    h * (0.3 + t * 0.24),
                    w * 0.044,
                    h * 0.009,
                );
            }
        }
        SPR.arch = makeSprite(
            1000,
            540,
            ROADW * 3.1,
            function (g, w, h) {
                archParts(g, w, h, false);
            },
            function (g, w, h) {
                archParts(g, w, h, true);
            },
        );

        /* ── torres urbanas: recuos, caixa d'água, antena com baliza, letreiro vertical ── */
        function towerSprite(seed) {
            var LIT = ["#ffd98a", "#8fe6ff", "#ff9ecb"];
            function windows(g, w, h, top, glow) {
                for (var y = top + 22; y < h - 30; y += 34) {
                    for (var x = w * 0.2; x < w * 0.8; x += 28) {
                        if ((x * 7 + y * 3 + seed * 97) % 13 < 6) {
                            g.fillStyle = LIT[(((x + y) / 7 + seed) | 0) % 3];
                            g.globalAlpha = glow
                                ? 0.8
                                : 0.45 + ((x * y) % 5) * 0.1;
                            g.fillRect(x, y, 14, 17);
                        }
                    }
                }
                g.globalAlpha = 1;
            }
            function roof(g, w, h, top, glow) {
                if (!glow) {
                    g.fillStyle = "#0d0920";
                    g.fillRect(w * 0.28, top - h * 0.038, w * 0.2, h * 0.038);
                    g.fillStyle = "#160e2c";
                    rr(g, w * 0.55, top - h * 0.05, w * 0.17, h * 0.05, 4);
                    g.fill();
                    g.fillStyle = "#0b0718";
                    g.fillRect(w * 0.44, top - h * 0.115, 5, h * 0.115);
                }
                g.fillStyle = "#ff3b6b";
                g.beginPath();
                g.arc(w * 0.445, top - h * 0.118, glow ? 8 : 5, 0, PI * 2);
                g.fill();
                if (seed % 2 === 0) {
                    g.fillStyle = seed % 4 ? "#00e5ff" : "#ff2f87";
                    g.fillRect(w * 0.845, top + h * 0.06, w * 0.03, h * 0.3);
                }
            }
            return makeSprite(
                340,
                820,
                2700,
                function (g, w, h) {
                    var top = h * (0.05 + (seed % 4) * 0.055);
                    var fg = g.createLinearGradient(0, top, 0, h);
                    fg.addColorStop(0, "#221542");
                    fg.addColorStop(0.45, "#120a24");
                    fg.addColorStop(1, "#07040f");
                    g.fillStyle = fg;
                    g.fillRect(w * 0.155, top, w * 0.69, h - top);
                    g.fillStyle = "rgba(0,0,0,0.40)";
                    for (var fy = top + 30; fy < h; fy += 34)
                        g.fillRect(w * 0.155, fy, w * 0.69, 3);
                    g.fillStyle = "rgba(90,55,120,0.35)";
                    g.fillRect(w * 0.155, top, w * 0.075, h - top);
                    g.fillStyle = "#0e0921";
                    g.fillRect(w * 0.79, top, w * 0.055, h - top);
                    if (seed % 3 === 0) {
                        g.fillStyle = "#0a0617";
                        g.fillRect(w * 0.1, h * 0.52, w * 0.8, h * 0.48);
                    }
                    g.strokeStyle = "rgba(255,120,200,0.16)";
                    g.lineWidth = 3;
                    g.beginPath();
                    g.moveTo(w * 0.845, top);
                    g.lineTo(w * 0.845, h);
                    g.stroke();
                    windows(g, w, h, top, false);
                    roof(g, w, h, top, false);
                },
                function (g, w, h) {
                    var top = h * (0.05 + (seed % 4) * 0.055);
                    windows(g, w, h, top, true);
                    roof(g, w, h, top, true);
                },
            );
        }
        SPR.towers = [];
        for (i = 0; i < 6; i++) SPR.towers.push(towerSprite(i));

        /* ── mesas rochosas com estratos ── */
        function rockSprite(seed) {
            return makeSprite(440, 360, 2500, function (g, w, h) {
                var lay = [
                    [0.0, 1.0, 0.3],
                    [0.1, 0.86, 0.52],
                    [0.24, 0.7, 0.72],
                ];
                for (var L = 0; L < 3; L++) {
                    var x0 = w * lay[L][0],
                        x1 = w * lay[L][1],
                        yt = h * lay[L][2];
                    var rg = g.createLinearGradient(0, yt, 0, h);
                    rg.addColorStop(0, ["#5b3560", "#472a4e", "#35203c"][L]);
                    rg.addColorStop(0.55, ["#2e1a40", "#251534", "#1b0f28"][L]);
                    rg.addColorStop(1, ["#170d26", "#12091e", "#0d0617"][L]);
                    g.fillStyle = rg;
                    g.beginPath();
                    g.moveTo(x0, h);
                    g.lineTo(x0 + w * 0.06, yt + h * 0.1);
                    g.lineTo(
                        x0 + (x1 - x0) * (0.3 + 0.1 * ((seed + L) % 3)),
                        yt,
                    );
                    g.lineTo(x1 - w * 0.09, yt + h * 0.06);
                    g.lineTo(x1, h);
                    g.closePath();
                    g.fill();
                    g.strokeStyle = "rgba(255,165,140,0.22)";
                    g.lineWidth = 2.4;
                    for (var b2 = 1; b2 <= 3; b2++) {
                        var yy = yt + ((h - yt) * b2) / 4.2;
                        g.beginPath();
                        g.moveTo(x0 + w * 0.03, yy);
                        g.lineTo(x1 - w * 0.04, yy + h * 0.012);
                        g.stroke();
                    }
                    g.strokeStyle = "rgba(255,160,200,0.42)";
                    g.lineWidth = 3.4;
                    g.beginPath();
                    g.moveTo(x0 + w * 0.06, yt + h * 0.1);
                    g.lineTo(
                        x0 + (x1 - x0) * (0.3 + 0.1 * ((seed + L) % 3)),
                        yt,
                    );
                    g.lineTo(x1 - w * 0.09, yt + h * 0.06);
                    g.stroke();
                }
            });
        }
        SPR.rocks = [rockSprite(0), rockSprite(1), rockSprite(2)];
        SPR.rock = SPR.rocks[0];

        /* ── DESERTO: cacto saguaro ── */
        function cactusSprite(seed) {
            return makeSprite(240, 480, 1000, function (g, w, h) {
                g.lineCap = "round";
                function arm(x0, y0, cx, cy, x1, y1, wd) {
                    g.strokeStyle = "#1d2f26";
                    g.lineWidth = wd;
                    g.beginPath();
                    g.moveTo(x0, y0);
                    g.quadraticCurveTo(cx, cy, x1, y1);
                    g.stroke();
                    g.strokeStyle = "rgba(255,150,200,0.30)";
                    g.lineWidth = wd * 0.13;
                    g.beginPath();
                    g.moveTo(x0 + wd * 0.41, y0);
                    g.quadraticCurveTo(cx + wd * 0.41, cy, x1 + wd * 0.41, y1);
                    g.stroke();
                }
                arm(w * 0.5, h, w * 0.5, h * 0.55, w * 0.5, h * 0.14, w * 0.21);
                if (seed % 3 !== 2)
                    arm(
                        w * 0.5,
                        h * 0.64,
                        w * 0.22,
                        h * 0.62,
                        w * 0.22,
                        h * 0.32,
                        w * 0.13,
                    );
                if (seed % 3 !== 1)
                    arm(
                        w * 0.5,
                        h * 0.52,
                        w * 0.78,
                        h * 0.5,
                        w * 0.78,
                        h * 0.24,
                        w * 0.13,
                    );
                g.strokeStyle = "rgba(0,0,0,0.45)";
                g.lineWidth = 2;
                for (var i = 0; i < 13; i++) {
                    var y = h * (0.18 + i * 0.06);
                    g.beginPath();
                    g.moveTo(w * 0.43, y);
                    g.lineTo(w * 0.57, y);
                    g.stroke();
                }
            });
        }
        SPR.cactus = [cactusSprite(0), cactusSprite(1), cactusSprite(2)];

        /* ── MATA ALTA: conífera em camadas ── */
        function pineSprite(seed) {
            return makeSprite(300, 700, 1600, function (g, w, h) {
                g.fillStyle = "#101d1a";
                g.fillRect(w * 0.455, h * 0.82, w * 0.09, h * 0.18);
                var lay = 9 + (seed % 3),
                    i;
                for (i = 0; i < lay; i++) {
                    var t = i / lay,
                        y = h * (0.05 + t * 0.74),
                        ww = w * (0.09 + t * 0.4),
                        hh = h * 0.115;
                    g.fillStyle = i % 2 ? "#132823" : "#0e1e1b";
                    g.beginPath();
                    g.moveTo(w * 0.5, y);
                    g.lineTo(w * 0.5 + ww, y + hh);
                    g.lineTo(w * 0.5 + ww * 0.62, y + hh);
                    g.lineTo(w * 0.5 + ww * 0.8, y + hh * 1.5);
                    g.lineTo(w * 0.5 - ww * 0.8, y + hh * 1.5);
                    g.lineTo(w * 0.5 - ww * 0.62, y + hh);
                    g.lineTo(w * 0.5 - ww, y + hh);
                    g.closePath();
                    g.fill();
                    g.strokeStyle = "rgba(255,140,205,0.18)";
                    g.lineWidth = 2.4;
                    g.beginPath();
                    g.moveTo(w * 0.5, y);
                    g.lineTo(w * 0.5 + ww, y + hh);
                    g.stroke();
                }
            });
        }
        SPR.pines = [pineSprite(0), pineSprite(1), pineSprite(2)];

        /* ── PORTO: guindaste, contêineres, chaminé ── */
        SPR.crane = makeSprite(
            460,
            780,
            3400,
            function (g, w, h) {
                var i;
                g.fillStyle = "#141026";
                g.fillRect(w * 0.38, h * 0.24, w * 0.16, h * 0.76);
                g.fillStyle = "#1d1638";
                g.fillRect(w * 0.38, h * 0.24, w * 0.035, h * 0.76);
                g.strokeStyle = "#2c2050";
                g.lineWidth = 4;
                for (i = 0; i < 13; i++) {
                    var y0 = h * 0.24 + (h * 0.76 * i) / 13,
                        y1 = h * 0.24 + (h * 0.76 * (i + 1)) / 13;
                    g.beginPath();
                    g.moveTo(w * 0.38, y0);
                    g.lineTo(w * 0.54, y1);
                    g.stroke();
                    g.beginPath();
                    g.moveTo(w * 0.54, y0);
                    g.lineTo(w * 0.38, y1);
                    g.stroke();
                }
                g.fillStyle = "#1a1434";
                g.fillRect(w * 0.04, h * 0.17, w * 0.92, h * 0.075); // lança
                g.strokeStyle = "#2c2050";
                g.lineWidth = 3;
                for (i = 0; i < 18; i++) {
                    var x0 = w * 0.04 + (w * 0.92 * i) / 18,
                        x1 = w * 0.04 + (w * 0.92 * (i + 1)) / 18;
                    g.beginPath();
                    g.moveTo(x0, h * 0.17);
                    g.lineTo(x1, h * 0.245);
                    g.stroke();
                }
                g.fillStyle = "#241a44";
                g.fillRect(w * 0.03, h * 0.15, w * 0.94, h * 0.022);
                g.fillStyle = "#120d24";
                g.fillRect(w * 0.02, h * 0.13, w * 0.16, h * 0.135); // contrapeso
                g.fillStyle = "#2a1f4c";
                g.fillRect(w * 0.02, h * 0.13, w * 0.16, h * 0.02);
                g.fillStyle = "#141026";
                g.fillRect(w * 0.42, h * 0.04, w * 0.08, h * 0.135); // torre da cabine
                g.strokeStyle = "#2c2050";
                g.lineWidth = 3;
                g.beginPath();
                g.moveTo(w * 0.46, h * 0.04);
                g.lineTo(w * 0.08, h * 0.15);
                g.stroke();
                g.beginPath();
                g.moveTo(w * 0.46, h * 0.04);
                g.lineTo(w * 0.9, h * 0.15);
                g.stroke();
                g.fillStyle = "#0f0b20";
                g.fillRect(w * 0.55, h * 0.245, w * 0.1, h * 0.19); // cabine
                g.strokeStyle = "#241a40";
                g.lineWidth = 2;
                g.beginPath();
                g.moveTo(w * 0.8, h * 0.245);
                g.lineTo(w * 0.8, h * 0.6);
                g.stroke();
                g.fillStyle = "#8f2f3f";
                g.fillRect(w * 0.71, h * 0.6, w * 0.18, h * 0.085); // contêiner suspenso
                g.fillStyle = "rgba(0,0,0,0.35)";
                for (i = 1; i < 5; i++)
                    g.fillRect(
                        w * 0.71 + (w * 0.18 * i) / 5,
                        h * 0.6,
                        2,
                        h * 0.085,
                    );
            },
            function (g, w, h) {
                g.fillStyle = "#ff3b6b";
                g.beginPath();
                g.arc(w * 0.46, h * 0.035, 8, 0, PI * 2);
                g.fill();
                g.fillStyle = "#ffd166";
                g.fillRect(w * 0.55, h * 0.255, w * 0.1, h * 0.045);
            },
        );
        function contSprite(seed) {
            var C = [
                ["#8f2f3f", "#5e1f2a"],
                ["#2f6f8f", "#1f4a5e"],
                ["#8f7a2f", "#5e501f"],
            ];
            return makeSprite(360, 300, 2400, function (g, w, h) {
                var rows = [
                        [0.62, 0.38, 3],
                        [0.34, 0.28, 2],
                        [0.08, 0.26, 1],
                    ],
                    r,
                    i;
                for (r = 0; r < rows.length; r++) {
                    for (i = 0; i < rows[r][2]; i++) {
                        var cw = w / 3.1,
                            x = w * 0.03 + i * cw * 1.02,
                            y = h * rows[r][0],
                            hh = h * rows[r][1] * 0.72;
                        var cc = C[(seed + r + i) % 3];
                        var lg = g.createLinearGradient(0, y, 0, y + hh);
                        lg.addColorStop(0, cc[0]);
                        lg.addColorStop(1, cc[1]);
                        g.fillStyle = lg;
                        g.fillRect(x, y, cw, hh);
                        g.fillStyle = "rgba(0,0,0,0.32)";
                        for (var v = 1; v < 6; v++)
                            g.fillRect(x + (cw * v) / 6, y, 3, hh);
                        g.fillStyle = "rgba(255,150,200,0.20)";
                        g.fillRect(x, y, cw, 3);
                    }
                }
            });
        }
        SPR.conts = [contSprite(0), contSprite(1), contSprite(2)];
        SPR.stack = makeSprite(
            200,
            720,
            1300,
            function (g, w, h) {
                var lg = g.createLinearGradient(0, 0, w, 0);
                lg.addColorStop(0, "#241a36");
                lg.addColorStop(0.45, "#3a2a52");
                lg.addColorStop(1, "#150f24");
                g.fillStyle = lg;
                g.beginPath();
                g.moveTo(w * 0.3, h * 0.04);
                g.lineTo(w * 0.7, h * 0.04);
                g.lineTo(w * 0.82, h);
                g.lineTo(w * 0.18, h);
                g.closePath();
                g.fill();
                g.fillStyle = "rgba(255,80,110,0.35)";
                for (var i = 0; i < 4; i++)
                    g.fillRect(
                        w * 0.2,
                        h * (0.16 + i * 0.2),
                        w * 0.6,
                        h * 0.03,
                    );
            },
            function (g, w, h) {
                g.fillStyle = "#ff3b6b";
                g.beginPath();
                g.arc(w * 0.5, h * 0.055, 7, 0, PI * 2);
                g.fill();
            },
        );

        /* ── GELEIRA: pilar de gelo ── */
        function iceSprite(seed) {
            return makeSprite(300, 420, 1900, function (g, w, h) {
                var pk = [
                        [0.16, 0.3],
                        [0.46, 0.1],
                        [0.76, 0.36],
                    ],
                    i;
                for (i = 0; i < 3; i++) {
                    var cx = w * pk[(i + seed) % 3][0],
                        ty = h * pk[(i + seed) % 3][1],
                        bw = w * (0.16 + i * 0.045);
                    var lg = g.createLinearGradient(cx - bw, ty, cx + bw, h);
                    lg.addColorStop(0, "#7fd8ee");
                    lg.addColorStop(0.45, "#3a7fa8");
                    lg.addColorStop(1, "#152a44");
                    g.fillStyle = lg;
                    g.beginPath();
                    g.moveTo(cx, ty);
                    g.lineTo(cx + bw, h);
                    g.lineTo(cx - bw, h);
                    g.closePath();
                    g.fill();
                    g.strokeStyle = "rgba(200,245,255,0.45)";
                    g.lineWidth = 2.6;
                    g.beginPath();
                    g.moveTo(cx, ty);
                    g.lineTo(cx - bw * 0.35, h);
                    g.stroke();
                    g.strokeStyle = "rgba(255,150,205,0.22)";
                    g.lineWidth = 2;
                    g.beginPath();
                    g.moveTo(cx, ty);
                    g.lineTo(cx + bw, h);
                    g.stroke();
                }
            });
        }
        SPR.ice = [iceSprite(0), iceSprite(1), iceSprite(2)];

        /* ── cápsula de nitro (coletável) ── */
        function boltPath(g, w, h) {
            g.beginPath();
            g.moveTo(w * 0.6, h * 0.26);
            g.lineTo(w * 0.34, h * 0.54);
            g.lineTo(w * 0.51, h * 0.54);
            g.lineTo(w * 0.4, h * 0.8);
            g.lineTo(w * 0.68, h * 0.48);
            g.lineTo(w * 0.5, h * 0.48);
            g.lineTo(w * 0.63, h * 0.26);
            g.closePath();
        }
        function hexPath(g, w, h) {
            g.beginPath();
            g.moveTo(w * 0.5, h * 0.14);
            g.lineTo(w * 0.87, h * 0.33);
            g.lineTo(w * 0.87, h * 0.71);
            g.lineTo(w * 0.5, h * 0.9);
            g.lineTo(w * 0.13, h * 0.71);
            g.lineTo(w * 0.13, h * 0.33);
            g.closePath();
        }
        SPR.nitro = makeSprite(
            200,
            280,
            620,
            function (g, w, h) {
                g.fillStyle = "rgba(0,229,255,0.22)";
                g.beginPath();
                g.ellipse(w * 0.5, h * 0.95, w * 0.4, h * 0.05, 0, 0, PI * 2);
                g.fill();
                g.fillStyle = "rgba(6,20,30,0.92)";
                hexPath(g, w, h);
                g.fill();
                g.strokeStyle = "#00e5ff";
                g.lineWidth = 8;
                hexPath(g, w, h);
                g.stroke();
                g.fillStyle = "#d9fbff";
                boltPath(g, w, h);
                g.fill();
            },
            function (g, w, h) {
                g.strokeStyle = "#00e5ff";
                g.lineWidth = 8;
                hexPath(g, w, h);
                g.stroke();
                g.fillStyle = "#d9fbff";
                boltPath(g, w, h);
                g.fill();
                var rg = g.createRadialGradient(
                    w * 0.5,
                    h * 0.5,
                    h * 0.05,
                    w * 0.5,
                    h * 0.5,
                    h * 0.55,
                );
                rg.addColorStop(0, "rgba(0,229,255,0.45)");
                rg.addColorStop(1, "rgba(0,229,255,0)");
                g.fillStyle = rg;
                g.fillRect(0, 0, w, h);
            },
        );

        /* ── guarda-corpo com olho-de-gato: dá noção de velocidade ── */
        SPR.rail = makeSprite(
            120,
            140,
            320,
            function (g, w, h) {
                g.fillStyle = "#171029";
                g.fillRect(w * 0.42, h * 0.34, w * 0.16, h * 0.66);
                g.fillStyle = "#241a40";
                rr(g, 0, h * 0.16, w, h * 0.2, 4);
                g.fill();
                g.fillStyle = "#3a2c5e";
                g.fillRect(0, h * 0.175, w, h * 0.045);
                g.fillStyle = "#ff2f87";
                g.beginPath();
                g.arc(w * 0.5, h * 0.26, w * 0.085, 0, PI * 2);
                g.fill();
            },
            function (g, w, h) {
                g.fillStyle = "#ff2f87";
                g.beginPath();
                g.arc(w * 0.5, h * 0.26, w * 0.1, 0, PI * 2);
                g.fill();
            },
        );

        /* ── carros: malhas 3D pré-renderizadas com iluminação ── */
        SPR.playerAngles = carSprites(
            buildCar([236, 42, 128], [255, 58, 90], "sport"),
            640,
            400,
            840,
            [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3],
        );
        SPR.player = SPR.playerAngles[3];

        var TCOL = [
            [63, 169, 245],
            [245, 201, 63],
            [228, 228, 238],
            [157, 78, 221],
            [46, 204, 113],
            [255, 107, 53],
        ];
        SPR.cars = [];
        for (var ci = 0; ci < TCOL.length; ci++) {
            var angles = carSprites(
                buildCar(
                    TCOL[ci],
                    [255, 59, 92],
                    ["gt", "coupe", "sedan"][ci % 3],
                ),
                420,
                270,
                760,
                [-0.2, 0, 0.2],
            );
            for (var ai = 0; ai < angles.length; ai++)
                angles[ai].angles = angles;
            SPR.cars.push(angles[1]);
        }
        SPR.truck = carSprites(buildTruck(), 420, 380, 1080, [0])[0];

        // Catálogos F1 vazios até a primeira solicitação: boot clássico inalterado.
        SPR.formulaPlayers = [];
        SPR.formulaCars = [];
        return SPR;
    }

    /* Geração síncrona sob demanda, uma vez por catálogo; nunca troca o clássico. */
    function buildFormulaSprites(SPR) {
        if (
            SPR.formulaPlayers &&
            SPR.formulaPlayers.length === 3 &&
            SPR.formulaCars &&
            SPR.formulaCars.length === 6
        )
            return SPR;

        // Pinturas geométricas originais: carroceria, contraste, capacete.
        var colors = [
            [
                [222, 38, 48],
                [242, 240, 230],
                [255, 211, 68],
            ], // vermelho/branco
            [
                [206, 161, 64],
                [20, 22, 29],
                [238, 238, 246],
            ], // dourado/preto
            [
                [34, 88, 210],
                [255, 218, 55],
                [242, 242, 250],
            ], // azul/amarelo
            [
                [37, 157, 126],
                [238, 238, 218],
                [255, 157, 58],
            ],
            [
                [233, 112, 40],
                [40, 49, 70],
                [102, 222, 244],
            ],
            [
                [145, 66, 192],
                [221, 226, 242],
                [255, 220, 74],
            ],
        ];
        var players = [],
            cars = [];
        for (var i = 0; i < colors.length; i++) {
            var mesh = buildFormulaCar(
                colors[i][0],
                colors[i][1],
                colors[i][2],
            );
            if (i < 3) {
                var playerAngles = carSprites(
                    mesh,
                    640,
                    400,
                    900,
                    [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3],
                );
                for (var p = 0; p < playerAngles.length; p++)
                    playerAngles[p].kind = "formula";
                players.push(playerAngles);
            }
            var angles = carSprites(mesh, 420, 270, 900, [-0.2, 0, 0.2]);
            for (var a = 0; a < angles.length; a++) {
                angles[a].kind = "formula";
                angles[a].angles = angles;
            }
            cars.push(angles[1]);
        }
        // Publica os dois conjuntos completos juntos, preservando player/playerAngles.
        SPR.formulaPlayers = players;
        SPR.formulaCars = cars;
        return SPR;
    }

    ND.assets = {
        makeSprite: makeSprite,
        buildSprites: buildSprites,
        buildFormulaSprites: buildFormulaSprites,
    };
})(window.NeonDrive);
