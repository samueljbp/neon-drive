(function () {
    "use strict";

    var ND = (window.NeonDrive = window.NeonDrive || {});

    ND.createCockpitRenderer = function () {
        var U = ND.util,
            PI = U.PI,
            clamp = U.clamp,
            css = U.css,
            cv = U.cv,
            rr = U.rr;
        var W,
            H,
            sctx,
            ectx,
            pal,
            speed,
            maxSpeed,
            boosting,
            ctrl,
            sunPulse,
            nitroCharges,
            NITRO_MAX,
            distance,
            laps,
            score,
            position,
            trackLength,
            visYaw,
            driftAngle,
            quality;
        var COCK = null;
        // Base e faixa seguem buildFormulaSprites; demais tons dão volume ao bico.
        var FORMULA_PAINTS = [
            {
                dark: "#691f31",
                base: "#de2630",
                light: "#ff8690",
                edge: "#92263b",
                stripe: "#f2f0e6",
            }, // RUBI
            {
                dark: "#654f1f",
                base: "#cea140",
                light: "#ffe297",
                edge: "#8d6d2c",
                stripe: "#14161d",
            }, // OURO
            {
                dark: "#112c69",
                base: "#2258d2",
                light: "#84a5ff",
                edge: "#183e93",
                stripe: "#ffda37",
            }, // AZUL
        ];

        function loadFrame(frame) {
            if (W !== frame.W || H !== frame.H) COCK = null;
            W = frame.W;
            H = frame.H;
            sctx = frame.sctx;
            ectx = frame.ectx;
            pal = frame.pal;
            speed = frame.speed;
            maxSpeed = frame.maxSpeed;
            boosting = frame.boosting;
            ctrl = frame.ctrl;
            sunPulse = frame.sunPulse;
            nitroCharges = frame.nitroCharges;
            NITRO_MAX = frame.NITRO_MAX;
            distance = frame.distance;
            laps = frame.laps;
            score = frame.score;
            position = frame.position;
            trackLength = frame.world.trackLength;
            visYaw = frame.visYaw;
            driftAngle = frame.driftAngle;
            quality = frame.quality;
        }

        /* ---------- cabine clássica (câmera interna) ---------- */
        function wheelR() {
            return Math.min(W * 0.315, H * 0.355);
        }
        function wheelCY() {
            return H * 1.0;
        }

        /* volante pré-renderizado: aro de fundo chato perfurado, raios em carbono,
           cubo com emblema e borboletas de troca */
        function buildWheel() {
            var R = wheelR(),
                S = Math.ceil(R * 2.5),
                c = cv(S, S),
                g = c.getContext("2d");
            var eC = cv(S, S),
                e = eC.getContext("2d");
            var cx = S / 2,
                cy = S / 2,
                th = R * 0.15,
                i,
                j,
                a,
                r2;
            var A0 = PI * 0.7,
                A1 = PI * 0.3;
            var bx = cx + Math.cos(A0) * R,
                by = cy + Math.sin(A0) * R;

            function rimPath(gg, r) {
                gg.beginPath();
                gg.arc(cx, cy, r, A0, A1, false);
                gg.lineTo(cx + Math.cos(A0) * r, cy + Math.sin(A0) * r);
            }
            // sombra externa do aro
            g.save();
            g.strokeStyle = "rgba(0,0,0,0.55)";
            g.lineWidth = th * 1.34;
            g.lineJoin = "round";
            g.lineCap = "round";
            rimPath(g, R);
            g.stroke();
            g.restore();

            // aro: couro com volume (escuro embaixo, realce em cima)
            var rg = g.createLinearGradient(0, cy - R, 0, cy + R);
            rg.addColorStop(0, "#3a2d55");
            rg.addColorStop(0.3, "#241a3c");
            rg.addColorStop(0.62, "#150e28");
            rg.addColorStop(1, "#0c0818");
            g.strokeStyle = rg;
            g.lineWidth = th;
            g.lineJoin = "round";
            g.lineCap = "round";
            rimPath(g, R);
            g.stroke();

            // brilho especular no topo do aro
            g.save();
            g.strokeStyle = "rgba(198,176,255,0.30)";
            g.lineWidth = th * 0.26;
            g.lineCap = "round";
            g.beginPath();
            g.arc(cx, cy, R - th * 0.3, PI * 1.2, PI * 1.8, false);
            g.stroke();
            g.strokeStyle = "rgba(255,255,255,0.13)";
            g.lineWidth = th * 0.12;
            g.beginPath();
            g.arc(cx, cy, R - th * 0.33, PI * 1.28, PI * 1.72, false);
            g.stroke();
            g.restore();

            // couro perfurado nas zonas de pega (9h e 3h)
            var zones = [
                [PI * 0.84, PI * 1.18],
                [PI * 1.82, PI * 2.16],
            ];
            for (i = 0; i < 2; i++) {
                var za = zones[i][0],
                    zb = zones[i][1];
                for (j = 0; j <= 26; j++) {
                    a = za + (zb - za) * (j / 26);
                    for (r2 = 0; r2 < 2; r2++) {
                        var pr = R + (r2 ? th * 0.2 : -th * 0.2);
                        var px = cx + Math.cos(a) * pr,
                            py = cy + Math.sin(a) * pr;
                        g.fillStyle = "rgba(4,2,10,0.62)";
                        g.beginPath();
                        g.arc(px, py, Math.max(0.7, R * 0.009), 0, PI * 2);
                        g.fill();
                        g.fillStyle = "rgba(190,170,240,0.10)";
                        g.beginPath();
                        g.arc(
                            px - R * 0.003,
                            py - R * 0.003,
                            Math.max(0.5, R * 0.0045),
                            0,
                            PI * 2,
                        );
                        g.fill();
                    }
                }
            }

            // apoios de polegar em 10 e 2 horas
            for (i = 0; i < 2; i++) {
                a = i ? PI * 1.72 : PI * 1.28;
                g.save();
                g.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
                g.rotate(a + PI / 2);
                var tg = g.createLinearGradient(0, -th * 0.9, 0, th * 0.9);
                tg.addColorStop(0, "#4a3a6e");
                tg.addColorStop(0.5, "#2b1f49");
                tg.addColorStop(1, "#150e28");
                g.fillStyle = tg;
                rr(g, -th * 0.62, -R * 0.155, th * 1.24, R * 0.31, th * 0.44);
                g.fill();
                g.strokeStyle = "rgba(255,110,190,0.20)";
                g.lineWidth = Math.max(1, R * 0.006);
                rr(g, -th * 0.62, -R * 0.155, th * 1.24, R * 0.31, th * 0.44);
                g.stroke();
                g.restore();
            }

            // costura vermelha ao longo do aro
            g.strokeStyle = "rgba(255,90,150,0.42)";
            g.lineWidth = Math.max(1, R * 0.0085);
            for (i = 0; i < 64; i++) {
                a = A0 + (2 * PI - (A0 - A1)) * (i / 63);
                var cs = Math.cos(a),
                    sn = Math.sin(a);
                g.beginPath();
                g.moveTo(cx + cs * (R - th * 0.16), cy + sn * (R - th * 0.16));
                g.lineTo(cx + cs * (R + th * 0.16), cy + sn * (R + th * 0.16));
                g.stroke();
            }
            // costura no trecho reto de baixo
            g.beginPath();
            g.moveTo(bx, by);
            g.lineTo(cx + Math.cos(A1) * R, cy + Math.sin(A1) * R);
            g.setLineDash([R * 0.028, R * 0.03]);
            g.strokeStyle = "rgba(255,90,150,0.34)";
            g.lineWidth = Math.max(1, R * 0.01);
            g.stroke();
            g.setLineDash([]);

            // marca de centro em 12h (referência de esterço)
            for (r2 = 0; r2 < 2; r2++) {
                var gm = r2 ? e : g;
                gm.strokeStyle = r2
                    ? "rgba(255,240,255,0.85)"
                    : "rgba(255,240,255,0.70)";
                gm.lineWidth = th * 0.34;
                gm.lineCap = "butt";
                gm.beginPath();
                gm.arc(cx, cy, R, PI * 1.478, PI * 1.522, false);
                gm.stroke();
            }

            // raios (9h, 3h, 6h) em carbono
            var spk = [PI, 0, PI * 0.5];
            for (i = 0; i < 3; i++) {
                a = spk[i];
                var len = i === 2 ? R * 0.8 : R * 0.92;
                g.save();
                g.translate(cx, cy);
                g.rotate(a);
                var sg = g.createLinearGradient(0, -R * 0.1, 0, R * 0.1);
                sg.addColorStop(0, "#39304f");
                sg.addColorStop(0.35, "#221a38");
                sg.addColorStop(0.7, "#171029");
                sg.addColorStop(1, "#0d0918");
                g.fillStyle = sg;
                g.beginPath();
                g.moveTo(R * 0.12, -R * 0.115);
                g.lineTo(len, -R * 0.062);
                g.lineTo(len, R * 0.062);
                g.lineTo(R * 0.12, R * 0.115);
                g.closePath();
                g.save();
                g.clip();
                g.fill();
                // trama de fibra de carbono
                g.strokeStyle = "rgba(120,105,165,0.11)";
                g.lineWidth = Math.max(0.6, R * 0.0035);
                for (j = -14; j < 40; j++) {
                    g.beginPath();
                    g.moveTo(R * 0.1 + j * R * 0.026, -R * 0.13);
                    g.lineTo(R * 0.1 + j * R * 0.026 + R * 0.26, R * 0.13);
                    g.stroke();
                    g.beginPath();
                    g.moveTo(R * 0.1 + j * R * 0.026, R * 0.13);
                    g.lineTo(R * 0.1 + j * R * 0.026 + R * 0.26, -R * 0.13);
                    g.stroke();
                }
                g.restore();
                g.strokeStyle = "rgba(160,140,220,0.16)";
                g.lineWidth = Math.max(1, R * 0.005);
                g.stroke();
                // rasgo aliviado no meio do raio
                if (i !== 2) {
                    g.fillStyle = "rgba(6,3,14,0.85)";
                    rr(
                        g,
                        R * 0.34,
                        -R * 0.03,
                        len - R * 0.52,
                        R * 0.06,
                        R * 0.028,
                    );
                    g.fill();
                    g.strokeStyle = "rgba(0,229,255,0.10)";
                    g.lineWidth = Math.max(1, R * 0.004);
                    rr(
                        g,
                        R * 0.34,
                        -R * 0.03,
                        len - R * 0.52,
                        R * 0.06,
                        R * 0.028,
                    );
                    g.stroke();
                }
                g.restore();
            }

            // botões nos raios laterais
            var btn = [
                [-1, -1],
                [-1, 1],
                [1, -1],
                [1, 1],
            ];
            for (i = 0; i < 4; i++) {
                var bxp = cx + btn[i][0] * R * 0.5,
                    byp = cy + btn[i][1] * R * 0.052;
                g.fillStyle = "#0a0716";
                rr(
                    g,
                    bxp - R * 0.052,
                    byp - R * 0.03,
                    R * 0.104,
                    R * 0.06,
                    R * 0.018,
                );
                g.fill();
                g.fillStyle = "#2a2048";
                rr(
                    g,
                    bxp - R * 0.045,
                    byp - R * 0.024,
                    R * 0.09,
                    R * 0.048,
                    R * 0.015,
                );
                g.fill();
                g.fillStyle =
                    i % 2 ? "rgba(0,229,255,0.55)" : "rgba(255,110,190,0.55)";
                g.beginPath();
                g.arc(bxp, byp, R * 0.013, 0, PI * 2);
                g.fill();
            }

            // cubo central
            var hr = R * 0.215;
            g.fillStyle = "rgba(0,0,0,0.5)";
            g.beginPath();
            g.arc(cx, cy + R * 0.012, hr * 1.06, 0, PI * 2);
            g.fill();
            // anel cromado do cubo
            var cr = g.createLinearGradient(cx - hr, cy - hr, cx + hr, cy + hr);
            cr.addColorStop(0, "#6a5a92");
            cr.addColorStop(0.35, "#2b2048");
            cr.addColorStop(0.62, "#8878b8");
            cr.addColorStop(1, "#231a3c");
            g.strokeStyle = cr;
            g.lineWidth = Math.max(1.5, R * 0.02);
            g.beginPath();
            g.arc(cx, cy, hr * 1.02, 0, PI * 2);
            g.stroke();
            var hg = g.createRadialGradient(
                cx - hr * 0.34,
                cy - hr * 0.44,
                hr * 0.1,
                cx,
                cy,
                hr,
            );
            hg.addColorStop(0, "#332651");
            hg.addColorStop(0.55, "#181030");
            hg.addColorStop(1, "#0a0616");
            g.fillStyle = hg;
            g.beginPath();
            g.arc(cx, cy, hr, 0, PI * 2);
            g.fill();
            g.strokeStyle = "rgba(255,110,190,0.34)";
            g.lineWidth = Math.max(1, R * 0.008);
            g.beginPath();
            g.arc(cx, cy, hr * 0.93, 0, PI * 2);
            g.stroke();
            e.strokeStyle = "rgba(255,110,190,0.55)";
            e.lineWidth = Math.max(1, R * 0.008);
            e.beginPath();
            e.arc(cx, cy, hr * 0.93, 0, PI * 2);
            e.stroke();

            // emblema: raio estilizado
            for (r2 = 0; r2 < 2; r2++) {
                var gg2 = r2 ? e : g;
                gg2.fillStyle = r2 ? "#9df9ff" : "#cfefff";
                gg2.save();
                gg2.translate(cx, cy);
                gg2.beginPath();
                gg2.moveTo(hr * 0.1, -hr * 0.52);
                gg2.lineTo(-hr * 0.34, hr * 0.06);
                gg2.lineTo(-hr * 0.05, hr * 0.06);
                gg2.lineTo(-hr * 0.2, hr * 0.54);
                gg2.lineTo(hr * 0.34, -hr * 0.04);
                gg2.lineTo(hr * 0.02, -hr * 0.04);
                gg2.closePath();
                gg2.fill();
                gg2.restore();
            }

            // borboletas de troca atrás do aro
            for (i = 0; i < 2; i++) {
                var sgn = i ? 1 : -1;
                g.save();
                g.translate(cx + sgn * R * 0.7, cy - R * 0.16);
                g.rotate(sgn * 0.2);
                var pgd = g.createLinearGradient(0, -R * 0.2, 0, R * 0.2);
                pgd.addColorStop(0, "#4b3a70");
                pgd.addColorStop(1, "#150e28");
                g.fillStyle = pgd;
                rr(g, -R * 0.045, -R * 0.2, R * 0.09, R * 0.4, R * 0.03);
                g.fill();
                g.strokeStyle = "rgba(0,229,255,0.30)";
                g.lineWidth = Math.max(1, R * 0.006);
                rr(g, -R * 0.045, -R * 0.2, R * 0.09, R * 0.4, R * 0.03);
                g.stroke();
                g.fillStyle = "rgba(0,229,255,0.16)";
                g.font =
                    "900 " +
                    Math.max(6, (R * 0.048) | 0) +
                    'px "Arial Black",Arial,sans-serif';
                g.textAlign = "center";
                g.textBaseline = "middle";
                g.fillText(sgn > 0 ? "+" : "-", 0, -R * 0.1);
                g.restore();
            }
            return { img: c, glow: eC, size: S, R: R };
        }

        /* mostrador analógico estático (aro, marcações, números) */
        function gaugeFace(g, e, cx, cy, r, maxN, step, redFrom, label) {
            var A0 = PI * 0.75,
                SW = PI * 1.5,
                i,
                a,
                t,
                n;
            // poço do mostrador
            var bgg = g.createRadialGradient(
                cx,
                cy - r * 0.3,
                r * 0.1,
                cx,
                cy,
                r * 1.05,
            );
            bgg.addColorStop(0, "#191131");
            bgg.addColorStop(0.62, "#0e0920");
            bgg.addColorStop(1, "#05030d");
            g.fillStyle = bgg;
            g.beginPath();
            g.arc(cx, cy, r, 0, PI * 2);
            g.fill();
            // bisel duplo com realce metálico
            var bez = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
            bez.addColorStop(0, "rgba(180,160,235,0.42)");
            bez.addColorStop(0.45, "rgba(90,76,140,0.22)");
            bez.addColorStop(0.7, "rgba(200,182,255,0.34)");
            bez.addColorStop(1, "rgba(60,50,100,0.20)");
            g.strokeStyle = bez;
            g.lineWidth = Math.max(1.5, r * 0.062);
            g.beginPath();
            g.arc(cx, cy, r * 0.982, 0, PI * 2);
            g.stroke();
            g.strokeStyle = "rgba(255,255,255,0.10)";
            g.lineWidth = Math.max(1, r * 0.016);
            g.beginPath();
            g.arc(cx, cy, r * 0.938, PI * 1.1, PI * 1.9);
            g.stroke();
            // textura de guilhoché no fundo
            g.save();
            g.beginPath();
            g.arc(cx, cy, r * 0.9, 0, PI * 2);
            g.clip();
            g.strokeStyle = "rgba(150,130,205,0.055)";
            g.lineWidth = Math.max(0.6, r * 0.006);
            for (i = 0; i < 30; i++) {
                a = PI * 2 * (i / 30);
                g.beginPath();
                g.moveTo(cx, cy);
                g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
                g.stroke();
            }
            for (i = 1; i <= 4; i++) {
                g.beginPath();
                g.arc(cx, cy, r * 0.18 * i, 0, PI * 2);
                g.stroke();
            }
            g.restore();

            // faixa vermelha
            if (redFrom !== null) {
                var ra = A0 + SW * redFrom;
                g.strokeStyle = "rgba(255,45,90,0.80)";
                g.lineWidth = r * 0.062;
                g.beginPath();
                g.arc(cx, cy, r * 0.845, ra, A0 + SW, false);
                g.stroke();
                e.strokeStyle = "rgba(255,45,90,0.75)";
                e.lineWidth = r * 0.062;
                e.beginPath();
                e.arc(cx, cy, r * 0.845, ra, A0 + SW, false);
                e.stroke();
            }
            // marcações
            for (i = 0; i <= maxN * step; i++) {
                t = i / (maxN * step);
                a = A0 + SW * t;
                var maj = i % step === 0;
                var r1 = r * (maj ? 0.7 : 0.78),
                    r0 = r * 0.885;
                g.strokeStyle = maj
                    ? "rgba(255,236,255,0.88)"
                    : "rgba(190,170,235,0.42)";
                g.lineWidth = maj
                    ? Math.max(1.6, r * 0.036)
                    : Math.max(1, r * 0.016);
                g.beginPath();
                g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
                g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
                g.stroke();
                if (maj) {
                    n = i / step;
                    g.font =
                        "900 " +
                        Math.max(7, (r * 0.2) | 0) +
                        'px "Arial Black",Arial,sans-serif';
                    g.textAlign = "center";
                    g.textBaseline = "middle";
                    g.fillStyle =
                        redFrom !== null && t >= redFrom
                            ? "#ff6b8a"
                            : "rgba(238,228,255,0.90)";
                    g.fillText(
                        String(n),
                        cx + Math.cos(a) * r * 0.575,
                        cy + Math.sin(a) * r * 0.575,
                    );
                }
            }
            if (label) {
                g.font =
                    "900 " +
                    Math.max(6, (r * 0.135) | 0) +
                    'px "Arial Black",Arial,sans-serif';
                g.textAlign = "center";
                g.textBaseline = "middle";
                g.fillStyle = "rgba(0,229,255,0.55)";
                g.fillText(label, cx, cy + r * 0.5);
            }
            // reflexo de vidro
            g.save();
            g.beginPath();
            g.arc(cx, cy, r * 0.94, 0, PI * 2);
            g.clip();
            var gl = g.createLinearGradient(
                cx - r * 0.7,
                cy - r * 0.9,
                cx + r * 0.2,
                cy + r * 0.2,
            );
            gl.addColorStop(0, "rgba(226,238,255,0.10)");
            gl.addColorStop(1, "rgba(226,238,255,0)");
            g.fillStyle = gl;
            g.fillRect(cx - r, cy - r, r * 2, r * 2);
            g.restore();
        }

        /* barra vertical segmentada (temperatura, energia) — moldura estática */
        function barFrame(g, x, y, w, h, label) {
            var i;
            g.fillStyle = "rgba(5,3,12,0.90)";
            rr(g, x, y, w, h, w * 0.3);
            g.fill();
            g.strokeStyle = "rgba(150,130,205,0.24)";
            g.lineWidth = Math.max(1, w * 0.075);
            rr(g, x, y, w, h, w * 0.3);
            g.stroke();
            for (i = 0; i < 9; i++) {
                var yy = y + h * (0.1 + i * 0.0975);
                g.strokeStyle =
                    i < 2 ? "rgba(255,70,110,0.55)" : "rgba(190,172,235,0.28)";
                g.lineWidth = Math.max(1, h * 0.008);
                g.beginPath();
                g.moveTo(x - w * 0.3, yy);
                g.lineTo(x - w * 0.05, yy);
                g.stroke();
            }
            g.font =
                "900 " +
                Math.max(6, (w * 0.62) | 0) +
                'px "Arial Black",Arial,sans-serif';
            g.textAlign = "center";
            g.textBaseline = "middle";
            g.fillStyle = "rgba(0,229,255,0.55)";
            g.fillText(label, x + w * 0.5, y + h + w * 0.85);
        }

        /* grade de alto-falante em pontos */
        function speakerGrille(g, cx, cy, rad) {
            var ring, k, n, a, d;
            g.fillStyle = "rgba(3,2,8,0.75)";
            g.beginPath();
            g.arc(cx, cy, rad, 0, PI * 2);
            g.fill();
            g.strokeStyle = "rgba(150,130,205,0.20)";
            g.lineWidth = Math.max(1, rad * 0.045);
            g.beginPath();
            g.arc(cx, cy, rad * 0.97, 0, PI * 2);
            g.stroke();
            for (ring = 1; ring <= 4; ring++) {
                d = rad * 0.2 * ring;
                n = 6 * ring;
                for (k = 0; k < n; k++) {
                    a = PI * 2 * (k / n) + ring * 0.22;
                    g.fillStyle = "rgba(140,124,190,0.16)";
                    g.beginPath();
                    g.arc(
                        cx + Math.cos(a) * d,
                        cy + Math.sin(a) * d,
                        Math.max(0.7, rad * 0.036),
                        0,
                        PI * 2,
                    );
                    g.fill();
                }
            }
        }

        function buildCockpit() {
            var c = cv(W, H),
                g = c.getContext("2d");
            var eC = cv(W, H),
                e = eC.getContext("2d");
            var hoodY = H * 0.6,
                dashY = H * 0.72,
                v,
                i,
                j;
            var R = wheelR();
            var binHalf = Math.min(R * 1.0, W * 0.305);
            var binL = W * 0.5 - binHalf,
                binR = W * 0.5 + binHalf;
            var binY = dashY + H * 0.03,
                binH = H * 0.245;

            /* ---- vidro: banda de tinta no topo e reflexos ---- */
            var tint = g.createLinearGradient(0, 0, 0, H * 0.3);
            tint.addColorStop(0, "rgba(24,6,44,0.80)");
            tint.addColorStop(0.55, "rgba(24,6,44,0.22)");
            tint.addColorStop(1, "rgba(24,6,44,0)");
            g.fillStyle = tint;
            g.fillRect(0, 0, W, H * 0.3);
            g.save();
            g.globalAlpha = 0.055;
            g.fillStyle = "#dcefff";
            g.beginPath();
            g.moveTo(W * 0.1, 0);
            g.lineTo(W * 0.3, 0);
            g.lineTo(W * 0.02, H * 0.62);
            g.lineTo(-W * 0.1, H * 0.62);
            g.closePath();
            g.fill();
            g.globalAlpha = 0.03;
            g.beginPath();
            g.moveTo(W * 0.42, 0);
            g.lineTo(W * 0.5, 0);
            g.lineTo(W * 0.24, H * 0.62);
            g.lineTo(W * 0.16, H * 0.62);
            g.closePath();
            g.fill();
            g.restore();

            // marcas finas de limpador no vidro
            g.save();
            g.globalAlpha = 0.03;
            g.strokeStyle = "#cfe4ff";
            g.lineWidth = Math.max(1, H * 0.0022);
            for (i = 0; i < 5; i++) {
                g.beginPath();
                g.arc(
                    W * 0.34,
                    H * 0.86,
                    H * (0.3 + i * 0.052),
                    PI * 1.16,
                    PI * 1.72,
                );
                g.stroke();
            }
            g.restore();

            /* ---- capô ---- */
            var hg = g.createLinearGradient(0, hoodY, 0, H * 0.8);
            hg.addColorStop(0, "#8d1252");
            hg.addColorStop(0.34, "#5c0833");
            hg.addColorStop(0.72, "#31051c");
            hg.addColorStop(1, "#1a0310");
            g.fillStyle = hg;
            g.beginPath();
            g.moveTo(-W * 0.05, H * 0.9);
            g.lineTo(W * 0.05, hoodY + H * 0.052);
            g.quadraticCurveTo(
                W * 0.5,
                hoodY - H * 0.03,
                W * 0.95,
                hoodY + H * 0.052,
            );
            g.lineTo(W * 1.05, H * 0.9);
            g.closePath();
            g.fill();

            // reflexo do céu na pintura
            g.save();
            g.beginPath();
            g.moveTo(-W * 0.05, H * 0.9);
            g.lineTo(W * 0.05, hoodY + H * 0.052);
            g.quadraticCurveTo(
                W * 0.5,
                hoodY - H * 0.03,
                W * 0.95,
                hoodY + H * 0.052,
            );
            g.lineTo(W * 1.05, H * 0.9);
            g.closePath();
            g.clip();
            var refl = g.createLinearGradient(0, hoodY, 0, hoodY + H * 0.075);
            refl.addColorStop(0, "rgba(255,190,235,0.30)");
            refl.addColorStop(1, "rgba(255,190,235,0)");
            g.fillStyle = refl;
            g.fillRect(0, hoodY - H * 0.02, W, H * 0.12);
            // frisos de painel do capô
            g.strokeStyle = "rgba(10,2,8,0.45)";
            g.lineWidth = Math.max(1, W * 0.002);
            for (i = 0; i < 2; i++) {
                var lx = i ? W * 0.735 : W * 0.265;
                g.beginPath();
                g.moveTo(lx, hoodY);
                g.lineTo(lx + (i ? 1 : -1) * W * 0.055, H * 0.92);
                g.stroke();
            }
            g.restore();

            // aresta neon do capô
            for (v = 0; v < 2; v++) {
                var gg = v ? e : g;
                gg.strokeStyle = v
                    ? "rgba(255,190,235,0.85)"
                    : "rgba(255,190,235,0.50)";
                gg.lineWidth = Math.max(2, W * 0.003);
                gg.beginPath();
                gg.moveTo(W * 0.05, hoodY + H * 0.052);
                gg.quadraticCurveTo(
                    W * 0.5,
                    hoodY - H * 0.03,
                    W * 0.95,
                    hoodY + H * 0.052,
                );
                gg.stroke();
            }
            // vinco central
            g.strokeStyle = "rgba(255,175,222,0.16)";
            g.lineWidth = Math.max(1, W * 0.0022);
            g.beginPath();
            g.moveTo(W * 0.5, hoodY - H * 0.014);
            g.lineTo(W * 0.5, H * 0.9);
            g.stroke();

            // entradas de ar com aletas
            for (i = 0; i < 2; i++) {
                var vx = i ? W * 0.575 : W * 0.285,
                    vy = hoodY + H * 0.04,
                    vw = W * 0.14,
                    vh = H * 0.036;
                g.fillStyle = "rgba(6,2,12,0.80)";
                rr(g, vx, vy, vw, vh, H * 0.01);
                g.fill();
                g.strokeStyle = "rgba(255,175,222,0.22)";
                g.lineWidth = Math.max(1, W * 0.0018);
                rr(g, vx, vy, vw, vh, H * 0.01);
                g.stroke();
                g.fillStyle = "rgba(120,60,110,0.35)";
                for (v = 0; v < 4; v++)
                    g.fillRect(
                        vx + vw * 0.1,
                        vy + vh * (0.2 + v * 0.185),
                        vw * 0.8,
                        vh * 0.075,
                    );
            }

            /* ---- braços do limpador repousados na base do vidro ---- */
            for (i = 0; i < 2; i++) {
                var wax = i ? W * 0.62 : W * 0.18,
                    way = hoodY + H * 0.044;
                g.save();
                g.translate(wax, way);
                g.rotate(i ? -0.1 : -0.055);
                g.strokeStyle = "rgba(8,4,16,0.80)";
                g.lineWidth = Math.max(1.6, H * 0.0055);
                g.lineCap = "round";
                g.beginPath();
                g.moveTo(0, 0);
                g.lineTo(W * 0.215, -H * 0.014);
                g.stroke();
                g.strokeStyle = "rgba(40,28,66,0.85)";
                g.lineWidth = Math.max(1, H * 0.0028);
                g.beginPath();
                g.moveTo(W * 0.02, -H * 0.003);
                g.lineTo(W * 0.205, -H * 0.016);
                g.stroke();
                g.restore();
            }

            /* ---- painel ---- */
            var dg = g.createLinearGradient(0, dashY, 0, H);
            dg.addColorStop(0, "#2e2150");
            dg.addColorStop(0.18, "#180f2c");
            dg.addColorStop(0.55, "#0d0819");
            dg.addColorStop(1, "#05030c");
            g.fillStyle = dg;
            g.beginPath();
            g.moveTo(-W * 0.05, H * 1.02);
            g.lineTo(-W * 0.05, dashY + H * 0.03);
            g.quadraticCurveTo(
                W * 0.5,
                dashY - H * 0.052,
                W * 1.05,
                dashY + H * 0.03,
            );
            g.lineTo(W * 1.05, H * 1.02);
            g.closePath();
            g.fill();

            // grão de couro no painel
            g.save();
            g.beginPath();
            g.moveTo(-W * 0.05, H * 1.02);
            g.lineTo(-W * 0.05, dashY + H * 0.03);
            g.quadraticCurveTo(
                W * 0.5,
                dashY - H * 0.052,
                W * 1.05,
                dashY + H * 0.03,
            );
            g.lineTo(W * 1.05, H * 1.02);
            g.closePath();
            g.clip();
            for (i = 0; i < 520; i++) {
                var gx = Math.random() * W,
                    gy = dashY - H * 0.05 + Math.random() * H * 0.34;
                g.fillStyle =
                    "rgba(160,142,210," +
                    (0.02 + Math.random() * 0.03).toFixed(3) +
                    ")";
                g.fillRect(
                    gx,
                    gy,
                    Math.max(1, W * 0.0016),
                    Math.max(1, W * 0.0016),
                );
            }
            g.restore();

            // costura e filete neon no topo do painel
            for (v = 0; v < 2; v++) {
                var g2 = v ? e : g;
                g2.strokeStyle = v
                    ? "rgba(255,47,135,0.85)"
                    : "rgba(255,47,135,0.60)";
                g2.lineWidth = Math.max(2, W * 0.0034);
                g2.beginPath();
                g2.moveTo(-W * 0.05, dashY + H * 0.03);
                g2.quadraticCurveTo(
                    W * 0.5,
                    dashY - H * 0.052,
                    W * 1.05,
                    dashY + H * 0.03,
                );
                g2.stroke();
            }
            g.setLineDash([W * 0.01, W * 0.011]);
            g.strokeStyle = "rgba(255,150,200,0.30)";
            g.lineWidth = Math.max(1, W * 0.0016);
            g.beginPath();
            g.moveTo(-W * 0.05, dashY + H * 0.046);
            g.quadraticCurveTo(
                W * 0.5,
                dashY - H * 0.036,
                W * 1.05,
                dashY + H * 0.046,
            );
            g.stroke();
            // segunda carreira de costura
            g.strokeStyle = "rgba(255,150,200,0.18)";
            g.lineWidth = Math.max(1, W * 0.0014);
            g.beginPath();
            g.moveTo(-W * 0.05, dashY + H * 0.064);
            g.quadraticCurveTo(
                W * 0.5,
                dashY - H * 0.018,
                W * 1.05,
                dashY + H * 0.064,
            );
            g.stroke();
            g.setLineDash([]);

            // difusores de ar com moldura cromada
            for (i = 0; i < 2; i++) {
                var ax = i ? W * 0.795 : W * 0.07,
                    ay = dashY + H * 0.07,
                    aw = W * 0.135,
                    ah = H * 0.042;
                g.fillStyle = "rgba(2,1,6,0.80)";
                rr(
                    g,
                    ax - W * 0.006,
                    ay - H * 0.005,
                    aw + W * 0.012,
                    ah + H * 0.01,
                    H * 0.014,
                );
                g.fill();
                var cg = g.createLinearGradient(ax, ay, ax + aw, ay + ah);
                cg.addColorStop(0, "rgba(170,150,220,0.34)");
                cg.addColorStop(0.5, "rgba(70,58,110,0.18)");
                cg.addColorStop(1, "rgba(190,172,240,0.28)");
                g.strokeStyle = cg;
                g.lineWidth = Math.max(1, W * 0.0026);
                rr(
                    g,
                    ax - W * 0.006,
                    ay - H * 0.005,
                    aw + W * 0.012,
                    ah + H * 0.01,
                    H * 0.014,
                );
                g.stroke();
                g.fillStyle = "#0a0716";
                rr(g, ax, ay, aw, ah, H * 0.011);
                g.fill();
                g.fillStyle = "#221838";
                for (v = 0; v < 5; v++)
                    g.fillRect(
                        ax + aw * 0.06,
                        ay + ah * (0.14 + v * 0.16),
                        aw * 0.88,
                        ah * 0.072,
                    );
                g.fillStyle = "rgba(0,229,255,0.20)";
                g.fillRect(
                    ax + aw * 0.06,
                    ay + ah * 0.14,
                    aw * 0.88,
                    ah * 0.02,
                );
                // rodinha de ajuste
                g.fillStyle = "#2b2048";
                rr(
                    g,
                    ax + aw * 0.4,
                    ay + ah * 1.05,
                    aw * 0.2,
                    ah * 0.16,
                    ah * 0.07,
                );
                g.fill();
            }

            /* ---- montantes A ---- */
            var pg = g.createLinearGradient(0, 0, W * 0.2, H);
            pg.addColorStop(0, "#171029");
            pg.addColorStop(1, "#07040e");
            g.fillStyle = pg;
            g.beginPath();
            g.moveTo(0, 0);
            g.lineTo(W * 0.09, 0);
            g.lineTo(W * 0.2, H);
            g.lineTo(0, H);
            g.closePath();
            g.fill();
            g.beginPath();
            g.moveTo(W, 0);
            g.lineTo(W * 0.91, 0);
            g.lineTo(W * 0.8, H);
            g.lineTo(W, H);
            g.closePath();
            g.fill();
            // debrum costurado nos montantes
            for (i = 0; i < 2; i++) {
                var x0 = i ? W * 0.91 : W * 0.09,
                    x1 = i ? W * 0.8 : W * 0.2;
                g.strokeStyle = "rgba(255,110,190,0.26)";
                g.lineWidth = Math.max(1, W * 0.0022);
                g.beginPath();
                g.moveTo(x0, 0);
                g.lineTo(x1, H);
                g.stroke();
                g.setLineDash([H * 0.016, H * 0.018]);
                g.strokeStyle = "rgba(255,150,200,0.20)";
                g.lineWidth = Math.max(1, W * 0.0014);
                g.beginPath();
                g.moveTo(x0 - (i ? -1 : 1) * W * 0.016, 0);
                g.lineTo(x1 - (i ? -1 : 1) * W * 0.016, H);
                g.stroke();
                g.setLineDash([]);
            }
            // tweeters na base dos montantes
            speakerGrille(g, W * 0.055, H * 0.4, Math.min(W * 0.026, H * 0.03));
            speakerGrille(g, W * 0.945, H * 0.4, Math.min(W * 0.026, H * 0.03));

            /* ---- teto, quebra-sol, luz de cortesia e retrovisor ---- */
            g.fillStyle = "#08050f";
            g.fillRect(0, 0, W, H * 0.044);
            // quebra-sóis
            for (i = 0; i < 2; i++) {
                var svx = i ? W * 0.56 : W * 0.062,
                    svw = W * 0.378;
                var svg = g.createLinearGradient(0, H * 0.03, 0, H * 0.086);
                svg.addColorStop(0, "#140e26");
                svg.addColorStop(1, "#0a0618");
                g.fillStyle = svg;
                rr(g, svx, H * 0.03, svw, H * 0.054, H * 0.01);
                g.fill();
                g.strokeStyle = "rgba(150,130,205,0.16)";
                g.lineWidth = Math.max(1, W * 0.0016);
                rr(g, svx, H * 0.03, svw, H * 0.054, H * 0.01);
                g.stroke();
                g.setLineDash([W * 0.008, W * 0.009]);
                g.strokeStyle = "rgba(255,150,200,0.14)";
                g.lineWidth = Math.max(1, W * 0.0012);
                g.beginPath();
                g.moveTo(svx + W * 0.01, H * 0.076);
                g.lineTo(svx + svw - W * 0.01, H * 0.076);
                g.stroke();
                g.setLineDash([]);
            }
            // luz de cortesia
            g.fillStyle = "#0d0a1a";
            g.beginPath();
            g.moveTo(W * 0.46, H * 0.044);
            g.lineTo(W * 0.54, H * 0.044);
            g.lineTo(W * 0.535, H * 0.06);
            g.lineTo(W * 0.465, H * 0.06);
            g.closePath();
            g.fill();
            g.fillStyle = "rgba(190,175,240,0.10)";
            rr(g, W * 0.478, H * 0.046, W * 0.044, H * 0.01, H * 0.004);
            g.fill();
            // corpo do retrovisor
            g.fillStyle = "#0e0a1c";
            rr(g, W * 0.37, H * 0.056, W * 0.26, H * 0.056, H * 0.016);
            g.fill();
            g.strokeStyle = "rgba(150,130,205,0.22)";
            g.lineWidth = Math.max(1, W * 0.0018);
            rr(g, W * 0.37, H * 0.056, W * 0.26, H * 0.056, H * 0.016);
            g.stroke();
            var mg = g.createLinearGradient(0, H * 0.062, 0, H * 0.106);
            mg.addColorStop(0, "#241a42");
            mg.addColorStop(0.5, "#120c24");
            mg.addColorStop(1, "#0a0618");
            g.fillStyle = mg;
            rr(g, W * 0.379, H * 0.063, W * 0.242, H * 0.042, H * 0.01);
            g.fill();
            // câmera de bordo colada ao vidro
            g.fillStyle = "#0a0716";
            rr(g, W * 0.64, H * 0.062, W * 0.042, H * 0.026, H * 0.007);
            g.fill();
            g.fillStyle = "#1b1334";
            g.beginPath();
            g.arc(W * 0.661, H * 0.075, H * 0.0072, 0, PI * 2);
            g.fill();
            g.fillStyle = "rgba(0,229,255,0.30)";
            g.beginPath();
            g.arc(W * 0.661, H * 0.075, H * 0.003, 0, PI * 2);
            g.fill();
            // alça de apoio no montante direito
            g.save();
            g.translate(W * 0.878, H * 0.15);
            g.rotate(0.16);
            g.strokeStyle = "#1a1230";
            g.lineWidth = Math.max(2, W * 0.009);
            g.lineCap = "round";
            g.beginPath();
            g.moveTo(0, 0);
            g.lineTo(0, H * 0.085);
            g.stroke();
            g.strokeStyle = "rgba(150,130,205,0.18)";
            g.lineWidth = Math.max(1, W * 0.003);
            g.beginPath();
            g.moveTo(0, H * 0.006);
            g.lineTo(0, H * 0.079);
            g.stroke();
            g.restore();

            /* ---- porta do motorista (canto inferior esquerdo) ---- */
            var doorR = Math.max(W * 0.1, binL - W * 0.02);
            g.save();
            g.beginPath();
            g.moveTo(0, H * 0.76);
            g.lineTo(doorR, H * 0.84);
            g.lineTo(doorR, H * 1.02);
            g.lineTo(0, H * 1.02);
            g.closePath();
            g.clip();
            var dgd = g.createLinearGradient(0, H * 0.78, 0, H);
            dgd.addColorStop(0, "#221739");
            dgd.addColorStop(0.42, "#140d26");
            dgd.addColorStop(1, "#07040f");
            g.fillStyle = dgd;
            g.fillRect(0, H * 0.74, doorR, H * 0.3);
            // fita de luz ambiente
            for (v = 0; v < 2; v++) {
                var ga = v ? e : g;
                ga.strokeStyle = v
                    ? "rgba(255,47,135,0.55)"
                    : "rgba(255,47,135,0.38)";
                ga.lineWidth = Math.max(1.5, H * 0.0032);
                ga.beginPath();
                ga.moveTo(0, H * 0.8);
                ga.lineTo(doorR, H * 0.878);
                ga.stroke();
            }
            // apoio de braço
            g.fillStyle = "#1a1230";
            rr(g, doorR * 0.1, H * 0.898, doorR * 0.86, H * 0.04, H * 0.012);
            g.fill();
            g.strokeStyle = "rgba(150,130,205,0.18)";
            g.lineWidth = Math.max(1, W * 0.0016);
            rr(g, doorR * 0.1, H * 0.898, doorR * 0.86, H * 0.04, H * 0.012);
            g.stroke();
            // botões de vidro elétrico
            for (i = 0; i < 2; i++) {
                g.fillStyle = "#0a0716";
                rr(
                    g,
                    doorR * (0.2 + i * 0.3),
                    H * 0.909,
                    doorR * 0.2,
                    H * 0.018,
                    H * 0.005,
                );
                g.fill();
                g.fillStyle = "rgba(0,229,255,0.22)";
                rr(
                    g,
                    doorR * (0.23 + i * 0.3),
                    H * 0.913,
                    doorR * 0.14,
                    H * 0.005,
                    H * 0.002,
                );
                g.fill();
            }
            speakerGrille(
                g,
                doorR * 0.52,
                H * 0.968,
                Math.min(doorR * 0.3, H * 0.042),
            );
            g.restore();

            /* ---- console à direita: tela e comandos ---- */
            var stackL = binR + W * 0.014;
            var stackR = Math.min(W * 0.98, stackL + W * 0.285);
            var stackW = stackR - stackL;
            var hasStack = stackW > W * 0.08;
            var scx = 0,
                scy = 0,
                scw = 0,
                sch = 0;
            if (hasStack) {
                scx = stackL;
                scy = dashY + H * 0.056;
                scw = stackW;
                sch = H * 0.086;
                // moldura da tela
                g.fillStyle = "#070411";
                rr(
                    g,
                    scx - W * 0.008,
                    scy - H * 0.008,
                    scw + W * 0.016,
                    sch + H * 0.016,
                    H * 0.014,
                );
                g.fill();
                g.strokeStyle = "rgba(0,229,255,0.26)";
                g.lineWidth = Math.max(1, W * 0.0018);
                rr(
                    g,
                    scx - W * 0.008,
                    scy - H * 0.008,
                    scw + W * 0.016,
                    sch + H * 0.016,
                    H * 0.014,
                );
                g.stroke();
                // vidro da tela
                var sgl = g.createLinearGradient(
                    scx,
                    scy,
                    scx + scw,
                    scy + sch,
                );
                sgl.addColorStop(0, "#0b0a1e");
                sgl.addColorStop(1, "#05040f");
                g.fillStyle = sgl;
                rr(g, scx, scy, scw, sch, H * 0.008);
                g.fill();
                g.strokeStyle = "rgba(255,255,255,0.05)";
                g.lineWidth = Math.max(1, W * 0.0012);
                g.beginPath();
                g.moveTo(scx + scw * 0.06, scy + H * 0.004);
                g.lineTo(scx + scw * 0.52, scy + H * 0.004);
                g.stroke();
                // botões físicos sob a tela
                for (i = 0; i < 3; i++) {
                    g.fillStyle = "#160f2b";
                    rr(
                        g,
                        scx + scw * (0.06 + i * 0.33),
                        scy + sch + H * 0.016,
                        scw * 0.26,
                        H * 0.017,
                        H * 0.006,
                    );
                    g.fill();
                    g.strokeStyle = "rgba(150,130,205,0.16)";
                    g.lineWidth = Math.max(1, W * 0.0012);
                    rr(
                        g,
                        scx + scw * (0.06 + i * 0.33),
                        scy + sch + H * 0.016,
                        scw * 0.26,
                        H * 0.017,
                        H * 0.006,
                    );
                    g.stroke();
                }
                // botões giratórios de climatização
                for (i = 0; i < 2; i++) {
                    var kx = scx + scw * (0.26 + i * 0.48),
                        ky = scy + sch + H * 0.06,
                        kr = Math.min(scw * 0.15, H * 0.026);
                    g.fillStyle = "rgba(2,1,6,0.80)";
                    g.beginPath();
                    g.arc(kx, ky, kr * 1.16, 0, PI * 2);
                    g.fill();
                    var kg = g.createLinearGradient(
                        kx - kr,
                        ky - kr,
                        kx + kr,
                        ky + kr,
                    );
                    kg.addColorStop(0, "#3a2c5e");
                    kg.addColorStop(0.55, "#1a1230");
                    kg.addColorStop(1, "#0b0718");
                    g.fillStyle = kg;
                    g.beginPath();
                    g.arc(kx, ky, kr, 0, PI * 2);
                    g.fill();
                    g.strokeStyle = i
                        ? "rgba(0,229,255,0.30)"
                        : "rgba(255,110,190,0.30)";
                    g.lineWidth = Math.max(1, kr * 0.1);
                    g.beginPath();
                    g.arc(kx, ky, kr * 0.86, PI * 0.75, PI * 1.85);
                    g.stroke();
                    g.strokeStyle = "rgba(230,220,255,0.45)";
                    g.lineWidth = Math.max(1, kr * 0.09);
                    g.beginPath();
                    g.moveTo(kx, ky);
                    g.lineTo(
                        kx + Math.cos(PI * 1.3) * kr * 0.66,
                        ky + Math.sin(PI * 1.3) * kr * 0.66,
                    );
                    g.stroke();
                }
            }

            /* ---- capela do instrumento ---- */
            g.fillStyle = "rgba(4,2,10,0.94)";
            g.beginPath();
            g.moveTo(binL, binY + binH);
            g.lineTo(binL + W * 0.01, binY + H * 0.024);
            g.quadraticCurveTo(
                W * 0.5,
                binY - H * 0.038,
                binR - W * 0.01,
                binY + H * 0.024,
            );
            g.lineTo(binR, binY + binH);
            g.closePath();
            g.fill();
            // pestana com sombra interna
            g.strokeStyle = "rgba(150,130,205,0.22)";
            g.lineWidth = Math.max(1, W * 0.0022);
            g.beginPath();
            g.moveTo(binL + W * 0.01, binY + H * 0.024);
            g.quadraticCurveTo(
                W * 0.5,
                binY - H * 0.038,
                binR - W * 0.01,
                binY + H * 0.024,
            );
            g.stroke();
            var hood2 = g.createLinearGradient(
                0,
                binY - H * 0.03,
                0,
                binY + H * 0.07,
            );
            hood2.addColorStop(0, "rgba(0,0,0,0.72)");
            hood2.addColorStop(1, "rgba(0,0,0,0)");
            g.save();
            g.beginPath();
            g.moveTo(binL, binY + binH);
            g.lineTo(binL + W * 0.01, binY + H * 0.024);
            g.quadraticCurveTo(
                W * 0.5,
                binY - H * 0.038,
                binR - W * 0.01,
                binY + H * 0.024,
            );
            g.lineTo(binR, binY + binH);
            g.closePath();
            g.clip();
            g.fillStyle = hood2;
            g.fillRect(binL, binY - H * 0.04, binR - binL, H * 0.12);
            g.restore();

            var gr = Math.min(binHalf * 0.4, H * 0.104);
            var tachoX = binL + binHalf * 0.46,
                speedoX = binR - binHalf * 0.46,
                gaugeY = binY + H * 0.104;
            gaugeFace(g, e, tachoX, gaugeY, gr, 8, 2, 0.8, "RPM x1000");
            gaugeFace(g, e, speedoX, gaugeY, gr, 6, 2, 0.84, "KM/H x60");
            // barras de temperatura e energia nas bordas da capela
            var bw = Math.max(3, binHalf * 0.055),
                bh = H * 0.105;
            var tempX = binL + binHalf * 0.1,
                nrgX = binR - binHalf * 0.1 - bw,
                barY = binY + H * 0.052;
            barFrame(g, tempX, barY, bw, bh, "TMP");
            barFrame(g, nrgX, barY, bw, bh, "NRG");

            return {
                img: c,
                glow: eC,
                hoodY: hoodY,
                dashY: dashY,
                binY: binY,
                binH: binH,
                binL: binL,
                binR: binR,
                binHalf: binHalf,
                gr: gr,
                tachoX: tachoX,
                speedoX: speedoX,
                gaugeY: gaugeY,
                tempX: tempX,
                nrgX: nrgX,
                barY: barY,
                barW: bw,
                barH: bh,
                hasStack: hasStack,
                scx: scx,
                scy: scy,
                scw: scw,
                sch: sch,
                doorR: doorR,
                wheel: buildWheel(),
            };
        }

        function needle(g, cx, cy, len, ang, w, col) {
            g.save();
            g.translate(cx, cy);
            g.rotate(ang);
            g.fillStyle = col;
            g.beginPath();
            g.moveTo(-len * 0.2, -w * 0.55);
            g.lineTo(len, -w * 0.18);
            g.lineTo(len, w * 0.18);
            g.lineTo(-len * 0.2, w * 0.55);
            g.closePath();
            g.fill();
            g.restore();
        }

        /* preenchimento animado das barras verticais */
        function drawBar(g, e, x, y, w, h, v, col, hot) {
            var segs = 9,
                i,
                on = Math.round(clamp(v, 0, 1) * segs);
            for (i = 0; i < segs; i++) {
                var sy = y + h - (i + 1) * (h / segs) + h * 0.01;
                var lit = i < on;
                g.fillStyle = lit
                    ? hot && i > 6
                        ? "#ff4466"
                        : col
                    : "rgba(46,38,74,0.55)";
                rr(
                    g,
                    x + w * 0.16,
                    sy,
                    w * 0.68,
                    h / segs - h * 0.02,
                    w * 0.16,
                );
                g.fill();
                if (lit) {
                    e.fillStyle = hot && i > 6 ? "#ff4466" : col;
                    rr(
                        e,
                        x + w * 0.16,
                        sy,
                        w * 0.68,
                        h / segs - h * 0.02,
                        w * 0.16,
                    );
                    e.fill();
                }
            }
        }

        /* luva do piloto agarrando o aro; gira junto com o volante */
        function drawGlove(g, e, cxw, cyw, R, ang, side, flex) {
            var ha = ang + (side < 0 ? PI : 0);
            var hx = cxw + Math.cos(ha) * R,
                hy = cyw + Math.sin(ha) * R;
            var ax = cxw + side * R * 0.98,
                ay = cyw + R * 0.78;
            var j;
            /* ---- antebraço e manga ---- */
            var dx = hx - ax,
                dy = hy - ay,
                L = Math.sqrt(dx * dx + dy * dy) || 1,
                fa = Math.atan2(dy, dx);
            g.save();
            g.translate(ax, ay);
            g.rotate(fa);
            var sg = g.createLinearGradient(0, -R * 0.16, 0, R * 0.16);
            sg.addColorStop(0, "#31264f");
            sg.addColorStop(0.4, "#1a1230");
            sg.addColorStop(0.78, "#100a1f");
            sg.addColorStop(1, "#080512");
            g.fillStyle = sg;
            g.beginPath();
            g.moveTo(0, -R * 0.15);
            g.lineTo(L, -R * 0.092);
            g.lineTo(L, R * 0.092);
            g.lineTo(0, R * 0.15);
            g.closePath();
            g.fill();
            g.strokeStyle = "rgba(0,0,0,0.50)";
            g.lineWidth = Math.max(1, R * 0.006);
            g.beginPath();
            g.moveTo(0, R * 0.15);
            g.lineTo(L, R * 0.092);
            g.stroke();
            // faixa neon do macacão
            for (j = 0; j < 2; j++) {
                var gp = j ? e : g;
                gp.strokeStyle = j
                    ? "rgba(0,229,255,0.42)"
                    : "rgba(0,229,255,0.28)";
                gp.lineWidth = Math.max(1, R * 0.01);
                gp.save();
                gp.translate(ax, ay);
                gp.rotate(fa);
                gp.beginPath();
                gp.moveTo(L * 0.3, -R * 0.115);
                gp.lineTo(L * 0.94, -R * 0.078);
                gp.stroke();
                gp.restore();
            }
            // punho da luva
            g.fillStyle = "#241a3f";
            rr(g, L - R * 0.185, -R * 0.108, R * 0.15, R * 0.216, R * 0.042);
            g.fill();
            g.strokeStyle = "rgba(0,229,255,0.32)";
            g.lineWidth = Math.max(1, R * 0.007);
            rr(g, L - R * 0.185, -R * 0.108, R * 0.15, R * 0.216, R * 0.042);
            g.stroke();
            g.restore();

            /* ---- mão ---- */
            g.save();
            g.translate(hx, hy);
            g.rotate(ha);
            if (side < 0) g.scale(1, -1);
            // dedos curvando por cima do aro (para dentro = -x local)
            for (j = 0; j < 4; j++) {
                var fy = -R * 0.108 + j * R * 0.072;
                var fl =
                    R * (0.152 - Math.abs(j - 1.5) * 0.013) * (1 + flex * 0.05);
                g.save();
                g.translate(-R * 0.062, fy);
                g.rotate(flex * 0.09 * (j - 1.5));
                var fg = g.createLinearGradient(0, -R * 0.03, 0, R * 0.03);
                fg.addColorStop(0, "#4a3670");
                fg.addColorStop(0.5, "#2a1e47");
                fg.addColorStop(1, "#140d24");
                g.fillStyle = fg;
                rr(g, -fl, -R * 0.03, fl, R * 0.06, R * 0.025);
                g.fill();
                g.strokeStyle = "rgba(0,0,0,0.55)";
                g.lineWidth = Math.max(1, R * 0.005);
                rr(g, -fl, -R * 0.03, fl, R * 0.06, R * 0.025);
                g.stroke();
                g.fillStyle = "rgba(226,214,255,0.07)";
                rr(
                    g,
                    -fl + R * 0.012,
                    -R * 0.019,
                    R * 0.028,
                    R * 0.038,
                    R * 0.013,
                );
                g.fill();
                g.restore();
            }
            // dorso da mão
            var pgr = g.createLinearGradient(-R * 0.07, 0, R * 0.11, 0);
            pgr.addColorStop(0, "#1b1330");
            pgr.addColorStop(0.42, "#3d2c60");
            pgr.addColorStop(1, "#221838");
            g.fillStyle = pgr;
            rr(g, -R * 0.068, -R * 0.146, R * 0.176, R * 0.292, R * 0.052);
            g.fill();
            g.strokeStyle = "rgba(0,0,0,0.55)";
            g.lineWidth = Math.max(1, R * 0.007);
            rr(g, -R * 0.068, -R * 0.146, R * 0.176, R * 0.292, R * 0.052);
            g.stroke();
            // nervuras e costura do dorso
            g.strokeStyle = "rgba(196,178,245,0.13)";
            g.lineWidth = Math.max(1, R * 0.0045);
            for (j = 0; j < 3; j++) {
                var yy = -R * 0.078 + j * R * 0.078;
                g.beginPath();
                g.moveTo(-R * 0.048, yy);
                g.lineTo(R * 0.088, yy);
                g.stroke();
            }
            // faixa neon nas costas da luva
            g.fillStyle = "rgba(255,47,135,0.30)";
            rr(g, -R * 0.04, -R * 0.146, R * 0.028, R * 0.292, R * 0.012);
            g.fill();
            e.save();
            e.translate(hx, hy);
            e.rotate(ha);
            if (side < 0) e.scale(1, -1);
            e.fillStyle = "rgba(255,47,135,0.45)";
            rr(e, -R * 0.04, -R * 0.146, R * 0.028, R * 0.292, R * 0.012);
            e.fill();
            e.restore();
            // polegar seguindo o aro para cima
            g.save();
            g.translate(R * 0.026, -R * 0.128);
            g.rotate(-0.52);
            var tg2 = g.createLinearGradient(0, -R * 0.028, 0, R * 0.028);
            tg2.addColorStop(0, "#4e3a76");
            tg2.addColorStop(1, "#191130");
            g.fillStyle = tg2;
            rr(g, -R * 0.022, -R * 0.029, R * 0.15, R * 0.058, R * 0.025);
            g.fill();
            g.strokeStyle = "rgba(0,0,0,0.5)";
            g.lineWidth = Math.max(1, R * 0.005);
            rr(g, -R * 0.022, -R * 0.029, R * 0.15, R * 0.058, R * 0.025);
            g.stroke();
            g.restore();
            g.restore();
        }

        /* conteúdo vivo do retrovisor: pista fugindo para trás */
        function drawMirror(g, e, mx, my, mw, mh, spN) {
            var i, t;
            g.save();
            rr(g, mx, my, mw, mh, mh * 0.22);
            g.clip();
            var sky = g.createLinearGradient(0, my, 0, my + mh);
            sky.addColorStop(0, css(pal.skyMid, 0.85));
            sky.addColorStop(0.44, css(pal.horizon, 0.55));
            sky.addColorStop(0.46, "rgba(10,6,20,0.95)");
            sky.addColorStop(1, "rgba(4,2,10,0.98)");
            g.fillStyle = sky;
            g.fillRect(mx, my, mw, mh);
            // asfalto fugindo
            var vy = my + mh * 0.46,
                cxm = mx + mw * 0.5;
            g.fillStyle = "rgba(22,14,38,0.92)";
            g.beginPath();
            g.moveTo(cxm - mw * 0.055, vy);
            g.lineTo(cxm + mw * 0.055, vy);
            g.lineTo(cxm + mw * 0.62, my + mh);
            g.lineTo(cxm - mw * 0.62, my + mh);
            g.closePath();
            g.fill();
            // faixas centrais correndo
            for (i = 0; i < 5; i++) {
                t = (sunPulse * (0.55 + spN * 2.4) + i * 0.2) % 1;
                var tt = t * t;
                var ly = vy + mh * 0.54 * tt,
                    lw = mw * (0.012 + 0.055 * tt),
                    lh = mh * (0.02 + 0.075 * tt);
                g.fillStyle =
                    "rgba(255,236,255," + (0.2 + 0.55 * tt).toFixed(2) + ")";
                g.fillRect(cxm - lw * 0.5, ly, lw, lh);
            }
            // guias de neon nas bordas
            for (i = 0; i < 2; i++) {
                var sgn = i ? 1 : -1;
                var grd = g.createLinearGradient(
                    cxm,
                    vy,
                    cxm + sgn * mw * 0.62,
                    my + mh,
                );
                grd.addColorStop(0, css(pal.neon, 0.0));
                grd.addColorStop(1, css(pal.neon, 0.55));
                g.strokeStyle = grd;
                g.lineWidth = Math.max(1, mh * 0.045);
                g.beginPath();
                g.moveTo(cxm + sgn * mw * 0.055, vy);
                g.lineTo(cxm + sgn * mw * 0.62, my + mh);
                g.stroke();
            }
            g.restore();
            // brilho do próprio escapamento quando no nitro
            if (boosting > 0.05) {
                e.save();
                rr(e, mx, my, mw, mh, mh * 0.22);
                e.clip();
                e.fillStyle =
                    "rgba(120,220,255," + (boosting * 0.3).toFixed(2) + ")";
                e.fillRect(mx, my + mh * 0.5, mw, mh * 0.5);
                e.restore();
            }
            // vidro do espelho
            g.save();
            rr(g, mx, my, mw, mh, mh * 0.22);
            g.clip();
            var mgl = g.createLinearGradient(mx, my, mx + mw * 0.6, my + mh);
            mgl.addColorStop(0, "rgba(220,232,255,0.13)");
            mgl.addColorStop(0.5, "rgba(220,232,255,0.02)");
            mgl.addColorStop(1, "rgba(220,232,255,0)");
            g.fillStyle = mgl;
            g.fillRect(mx, my, mw, mh);
            g.restore();
        }

        function drawCockpit() {
            if (!COCK) COCK = buildCockpit();
            sctx.drawImage(COCK.img, 0, 0);
            ectx.save();
            ectx.globalCompositeOperation = "destination-out";
            ectx.drawImage(COCK.img, 0, 0);
            ectx.restore();
            ectx.drawImage(COCK.glow, 0, 0);

            var spN = clamp(speed / maxSpeed, 0, 1);
            var gf = spN * 5.9,
                gear = Math.min(6, 1 + Math.floor(gf)),
                frac = gf - Math.floor(gf);
            var rpm =
                speed > 1
                    ? clamp(
                          0.16 +
                              frac * 0.76 +
                              boosting * 0.14 +
                              (ctrl.gasA || 0) * 0.04,
                          0,
                          1,
                      )
                    : 0.1 + Math.sin(sunPulse * 7) * 0.014;
            var vib =
                (0.0016 + spN * 0.004 + boosting * 0.006) *
                H *
                Math.sin(sunPulse * 47);
            var binY = COCK.binY,
                gr = COCK.gr,
                i;
            var A0 = PI * 0.75,
                SW = PI * 1.5;

            /* ---- conta-giros ---- */
            var tx = COCK.tachoX,
                ty = COCK.gaugeY + vib,
                ta = A0 + SW * rpm;
            if (rpm > 0.8) {
                ectx.save();
                ectx.globalCompositeOperation = "lighter";
                ectx.strokeStyle =
                    "rgba(255,45,90," + ((rpm - 0.8) * 3.2).toFixed(2) + ")";
                ectx.lineWidth = gr * 0.1;
                ectx.beginPath();
                ectx.arc(tx, ty, gr * 0.845, A0 + SW * 0.8, ta, false);
                ectx.stroke();
                ectx.restore();
            }
            needle(sctx, tx, ty, gr * 0.8, ta, gr * 0.085, "rgba(0,0,0,0.55)");
            needle(
                sctx,
                tx,
                ty,
                gr * 0.78,
                ta,
                gr * 0.06,
                rpm > 0.8 ? "#ff3355" : "#ff5f9e",
            );
            needle(
                ectx,
                tx,
                ty,
                gr * 0.78,
                ta,
                gr * 0.06,
                rpm > 0.8 ? "#ff3355" : "#ff5f9e",
            );
            sctx.fillStyle = "#1a1233";
            sctx.beginPath();
            sctx.arc(tx, ty, gr * 0.1, 0, PI * 2);
            sctx.fill();
            sctx.fillStyle = "#3d2f63";
            sctx.beginPath();
            sctx.arc(tx, ty, gr * 0.055, 0, PI * 2);
            sctx.fill();

            /* ---- velocímetro analógico ---- */
            var vx2 = COCK.speedoX,
                vy2 = COCK.gaugeY + vib,
                va = A0 + SW * spN;
            needle(
                sctx,
                vx2,
                vy2,
                gr * 0.8,
                va,
                gr * 0.085,
                "rgba(0,0,0,0.55)",
            );
            needle(sctx, vx2, vy2, gr * 0.78, va, gr * 0.06, "#9df9ff");
            needle(ectx, vx2, vy2, gr * 0.78, va, gr * 0.06, "#9df9ff");
            sctx.fillStyle = "#1a1233";
            sctx.beginPath();
            sctx.arc(vx2, vy2, gr * 0.1, 0, PI * 2);
            sctx.fill();
            sctx.fillStyle = "#3d2f63";
            sctx.beginPath();
            sctx.arc(vx2, vy2, gr * 0.055, 0, PI * 2);
            sctx.fill();

            /* ---- barras de temperatura e energia ---- */
            var temp = clamp(0.3 + spN * 0.26 + boosting * 0.34, 0, 1);
            var nrg = clamp(nitroCharges / NITRO_MAX, 0, 1);
            drawBar(
                sctx,
                ectx,
                COCK.tempX,
                COCK.barY + vib,
                COCK.barW,
                COCK.barH,
                temp,
                "#ffd166",
                true,
            );
            drawBar(
                sctx,
                ectx,
                COCK.nrgX,
                COCK.barY + vib,
                COCK.barW,
                COCK.barH,
                nrg,
                "#9df9ff",
                false,
            );

            /* ---- leitura digital de velocidade, marcha e hodômetro ---- */
            var dx = W * 0.5,
                dy = binY + H * 0.086 + vib;
            var kmh = Math.floor(spN * 360);
            var dcol = boosting > 0.1 ? "#9df9ff" : "#ffffff";
            var fs = Math.min(W * 0.052, H * 0.064) | 0;
            sctx.font = ectx.font =
                "italic 900 " + fs + 'px "Arial Black",Arial,sans-serif';
            sctx.textAlign = ectx.textAlign = "center";
            sctx.textBaseline = ectx.textBaseline = "alphabetic";
            sctx.fillStyle = ectx.fillStyle = dcol;
            sctx.fillText(String(kmh), dx, dy);
            ectx.fillText(String(kmh), dx, dy);
            var ls = Math.max(7, (fs * 0.26) | 0);
            sctx.font = "900 " + ls + 'px "Arial Black",Arial,sans-serif';
            sctx.fillStyle = "rgba(0,229,255,0.75)";
            sctx.fillText("KM/H", dx, dy + ls * 1.8);
            // marcha, com a trilha de marchas ao redor
            sctx.font = ectx.font =
                "italic 900 " +
                ((fs * 0.62) | 0) +
                'px "Arial Black",Arial,sans-serif';
            sctx.fillStyle = ectx.fillStyle = "#ffe066";
            sctx.fillText(String(gear), dx, dy - fs * 0.94);
            ectx.fillText(String(gear), dx, dy - fs * 0.94);
            sctx.font =
                "900 " +
                Math.max(6, (fs * 0.22) | 0) +
                'px "Arial Black",Arial,sans-serif';
            for (i = 1; i <= 6; i++) {
                var gxp = dx + (i - 3.5) * fs * 0.3;
                sctx.fillStyle =
                    i === gear
                        ? "rgba(255,224,102,0.95)"
                        : "rgba(120,104,170,0.45)";
                sctx.fillText(String(i), gxp, dy - fs * 1.44);
            }
            // hodômetro
            sctx.font =
                "900 " +
                Math.max(6, (fs * 0.24) | 0) +
                'px "Arial Black",Arial,sans-serif';
            sctx.fillStyle = "rgba(190,172,240,0.60)";
            sctx.fillText(
                (distance / 1000).toFixed(1) + " KM",
                dx,
                dy + ls * 3.4,
            );

            /* ---- luzes de aviso ---- */
            var wy = binY + H * 0.2 + vib,
                ws = Math.min(W * 0.01, H * 0.012);
            var steer = Math.abs(visYaw);
            var blink = Math.sin(sunPulse * 11) > 0;
            var warn = [
                [
                    dx - ws * 7.6,
                    steer > 0.3 && visYaw < 0 && blink ? 1 : 0,
                    "#7dffb0",
                ],
                [dx - ws * 3.8, ctrl.brake ? 1 : 0, "#ff3355"],
                [dx, boosting > 0.05 ? 1 : 0, "#00e5ff"],
                [dx + ws * 3.8, nitroCharges > 0 ? 1 : 0, "#ffe066"],
                [
                    dx + ws * 7.6,
                    steer > 0.3 && visYaw > 0 && blink ? 1 : 0,
                    "#7dffb0",
                ],
            ];
            for (i = 0; i < warn.length; i++) {
                var on = warn[i][1];
                sctx.fillStyle = on ? warn[i][2] : "rgba(70,60,105,0.55)";
                sctx.beginPath();
                sctx.arc(warn[i][0], wy, ws, 0, PI * 2);
                sctx.fill();
                if (on) {
                    ectx.fillStyle = warn[i][2];
                    ectx.beginPath();
                    ectx.arc(warn[i][0], wy, ws * 1.15, 0, PI * 2);
                    ectx.fill();
                }
            }

            /* ---- tela do console: volta, pontos e progresso ---- */
            if (COCK.hasStack) {
                var scx = COCK.scx,
                    scy = COCK.scy,
                    scw = COCK.scw,
                    sch = COCK.sch;
                sctx.save();
                rr(sctx, scx, scy, scw, sch, H * 0.008);
                sctx.clip();
                sctx.font =
                    "900 " +
                    Math.max(7, (H * 0.019) | 0) +
                    'px "Arial Black",Arial,sans-serif';
                sctx.textAlign = "left";
                sctx.textBaseline = "alphabetic";
                sctx.fillStyle = "rgba(0,229,255,0.85)";
                sctx.fillText(
                    "VOLTA " + laps,
                    scx + scw * 0.07,
                    scy + sch * 0.3,
                );
                sctx.fillStyle = "rgba(255,224,102,0.90)";
                sctx.fillText(
                    String(Math.floor(score)).padStart(6, "0"),
                    scx + scw * 0.07,
                    scy + sch * 0.62,
                );
                // barra de progresso da volta
                var pw = scw * 0.86 * clamp(position / trackLength, 0, 1);
                sctx.fillStyle = "rgba(60,48,96,0.70)";
                sctx.fillRect(
                    scx + scw * 0.07,
                    scy + sch * 0.76,
                    scw * 0.86,
                    H * 0.005,
                );
                sctx.fillStyle = "rgba(255,47,135,0.85)";
                sctx.fillRect(
                    scx + scw * 0.07,
                    scy + sch * 0.76,
                    pw,
                    H * 0.005,
                );
                ectx.fillStyle = "rgba(255,47,135,0.85)";
                ectx.fillRect(
                    scx + scw * 0.07,
                    scy + sch * 0.76,
                    pw,
                    H * 0.005,
                );
                // equalizador reagindo à rotação
                for (i = 0; i < 7; i++) {
                    var eh =
                        sch *
                        0.4 *
                        (0.2 +
                            0.8 *
                                Math.abs(
                                    Math.sin(sunPulse * (5 + i * 1.7) + i),
                                ) *
                                rpm);
                    sctx.fillStyle =
                        "rgba(0,229,255," +
                        (0.25 + 0.45 * rpm).toFixed(2) +
                        ")";
                    sctx.fillRect(
                        scx + scw * (0.62 + i * 0.05),
                        scy + sch * 0.56 - eh,
                        scw * 0.03,
                        eh,
                    );
                }
                sctx.restore();
                sctx.textAlign = "center";
            }

            /* ---- volante ---- */
            var Wl = COCK.wheel,
                R = Wl.R,
                cxw = W * 0.5,
                cyw = wheelCY() + vib * 1.6;
            var ang = visYaw * 0.92 + driftAngle * 0.16;
            sctx.save();
            sctx.translate(cxw, cyw);
            sctx.rotate(ang);
            sctx.drawImage(Wl.img, -Wl.size / 2, -Wl.size / 2);
            // fita de LEDs de troca no topo do aro
            var lit = Math.floor(clamp((rpm - 0.34) / 0.6, 0, 1) * 9);
            for (var li = 0; li < 9; li++) {
                var la = PI * 1.5 + (li - 4) * 0.062;
                var lx = Math.cos(la) * R * 0.845,
                    ly = Math.sin(la) * R * 0.845;
                var onL = li < lit;
                var lc = li > 6 ? "#ff2f55" : li > 3 ? "#ffe066" : "#7dffb0";
                sctx.save();
                sctx.translate(lx, ly);
                sctx.rotate(la + PI / 2);
                sctx.fillStyle = onL ? lc : "rgba(48,40,78,0.75)";
                rr(sctx, -R * 0.017, -R * 0.01, R * 0.034, R * 0.02, R * 0.006);
                sctx.fill();
                sctx.restore();
                if (onL) {
                    ectx.save();
                    ectx.translate(cxw, cyw);
                    ectx.rotate(ang);
                    ectx.translate(lx, ly);
                    ectx.rotate(la + PI / 2);
                    ectx.fillStyle = lc;
                    rr(
                        ectx,
                        -R * 0.02,
                        -R * 0.012,
                        R * 0.04,
                        R * 0.024,
                        R * 0.007,
                    );
                    ectx.fill();
                    ectx.restore();
                }
            }
            sctx.restore();
            ectx.save();
            ectx.translate(cxw, cyw);
            ectx.rotate(ang);
            ectx.drawImage(Wl.glow, -Wl.size / 2, -Wl.size / 2);
            ectx.restore();

            /* ---- mãos do piloto no aro ---- */
            if (quality > 0) {
                var flex = clamp(
                    Math.abs(visYaw) * 1.3 + Math.abs(driftAngle) * 0.8,
                    0,
                    1,
                );
                drawGlove(sctx, ectx, cxw, cyw, R, ang, -1, flex);
                drawGlove(sctx, ectx, cxw, cyw, R, ang, 1, flex);
            }
            /* ---- retrovisor com a pista fugindo ---- */
            if (quality > 0)
                drawMirror(
                    sctx,
                    ectx,
                    W * 0.379,
                    H * 0.063,
                    W * 0.242,
                    H * 0.042,
                    spN,
                );

            /* ---- pingente balançando com a força lateral ---- */
            if (quality > 0) {
                var sw = -(visYaw * 0.62 + driftAngle * 0.34);
                var px = W * 0.5 + Math.sin(sw) * H * 0.03,
                    py = H * 0.112 + Math.cos(sw) * H * 0.03;
                sctx.strokeStyle = "rgba(190,172,240,0.35)";
                sctx.lineWidth = Math.max(1, H * 0.0016);
                sctx.beginPath();
                sctx.moveTo(W * 0.5, H * 0.112);
                sctx.lineTo(px, py);
                sctx.stroke();
                sctx.fillStyle = "rgba(255,47,135,0.70)";
                sctx.beginPath();
                sctx.moveTo(px, py - H * 0.01);
                sctx.lineTo(px + H * 0.009, py);
                sctx.lineTo(px, py + H * 0.012);
                sctx.lineTo(px - H * 0.009, py);
                sctx.closePath();
                sctx.fill();
                ectx.fillStyle = "rgba(255,47,135,0.55)";
                ectx.beginPath();
                ectx.moveTo(px, py - H * 0.01);
                ectx.lineTo(px + H * 0.009, py);
                ectx.lineTo(px, py + H * 0.012);
                ectx.lineTo(px - H * 0.009, py);
                ectx.closePath();
                ectx.fill();
            }

            /* ---- reflexo no para-brisa acompanhando o volante ---- */
            if (quality > 0) {
                var glx = W * 0.5 - visYaw * W * 0.16;
                var gl = sctx.createLinearGradient(
                    glx - W * 0.3,
                    0,
                    glx + W * 0.3,
                    COCK.hoodY,
                );
                gl.addColorStop(0, "rgba(190,225,255,0)");
                gl.addColorStop(
                    0.5,
                    "rgba(190,225,255," +
                        (0.03 + boosting * 0.045).toFixed(3) +
                        ")",
                );
                gl.addColorStop(1, "rgba(190,225,255,0)");
                sctx.fillStyle = gl;
                sctx.fillRect(0, 0, W, COCK.hoodY);
                // reflexo do painel na base do vidro
                var dr = sctx.createLinearGradient(
                    0,
                    COCK.hoodY - H * 0.1,
                    0,
                    COCK.hoodY + H * 0.02,
                );
                dr.addColorStop(0, "rgba(255,47,135,0)");
                dr.addColorStop(
                    1,
                    "rgba(255,47,135," + (0.045 + rpm * 0.05).toFixed(3) + ")",
                );
                sctx.fillStyle = dr;
                sctx.fillRect(0, COCK.hoodY - H * 0.1, W, H * 0.12);
            }
        }

        /* Fórmula: desenho procedural original, aberto, sem vidro/teto/montantes.
           A máscara de cada superfície também recorta a emissão da pista. */
        function renderFormulaCockpit(frame) {
            var g = sctx,
                e = ectx,
                S = Math.min(W, H * 1.45);
            var sp = clamp(speed / maxSpeed, 0, 1.35);
            var gear = Math.min(8, 1 + Math.floor(sp * 7.9));
            var rev =
                speed > 1
                    ? clamp(
                          0.3 + ((sp * 7.9) % 1) * 0.65 + boosting * 0.16,
                          0,
                          1,
                      )
                    : 0.12;
            var vib = Math.sin(sunPulse * 47) * H * (0.0008 + sp * 0.002);
            function surface(path, color) {
                path(g);
                g.fillStyle = color;
                g.fill();
                e.save();
                e.globalCompositeOperation = "destination-out";
                e.fillStyle = "#000";
                path(e);
                e.fill();
                e.restore();
            }
            function panel(points, color) {
                surface(function (ctx) {
                    ctx.beginPath();
                    ctx.moveTo(points[0], points[1]);
                    for (var p = 2; p < points.length; p += 2)
                        ctx.lineTo(points[p], points[p + 1]);
                    ctx.closePath();
                }, color);
            }
            g.save();
            e.save();
            g.translate(W / 2, vib);
            e.translate(W / 2, vib);
            // Triângulos de suspensão independentes, pneus dianteiros expostos.
            for (var side = -1; side <= 1; side += 2) {
                panel(
                    [
                        side * S * 0.05,
                        H * 0.69,
                        side * S * 0.3,
                        H * 0.73,
                        side * S * 0.3,
                        H * 0.747,
                        side * S * 0.06,
                        H * 0.71,
                    ],
                    "#262b31",
                );
                panel(
                    [
                        side * S * 0.09,
                        H * 0.84,
                        side * S * 0.3,
                        H * 0.745,
                        side * S * 0.3,
                        H * 0.763,
                        side * S * 0.11,
                        H * 0.855,
                    ],
                    "#11151b",
                );
                g.save();
                e.save();
                g.translate(side * S * 0.3, H * 0.73);
                e.translate(side * S * 0.3, H * 0.73);
                g.rotate(visYaw * 0.08);
                e.rotate(visYaw * 0.08);
                var tire = g.createLinearGradient(-S * 0.065, 0, S * 0.065, 0);
                tire.addColorStop(0, "#080a0c");
                tire.addColorStop(0.3, "#30343a");
                tire.addColorStop(0.55, "#202429");
                tire.addColorStop(1, "#07090b");
                surface(function (ctx) {
                    rr(
                        ctx,
                        -S * 0.065,
                        -H * 0.115,
                        S * 0.13,
                        H * 0.23,
                        S * 0.025,
                    );
                }, tire);
                g.strokeStyle = "#c8b94c";
                g.lineWidth = Math.max(1, S * 0.003);
                rr(g, -S * 0.054, -H * 0.099, S * 0.108, H * 0.198, S * 0.025);
                g.stroke();
                if (quality > 0) {
                    g.strokeStyle = "rgba(160,170,180,0.13)";
                    g.lineWidth = Math.max(0.6, S * 0.001);
                    for (var t = 0; t < 10; t++) {
                        var ty =
                            -H * 0.086 +
                            ((t + sunPulse * sp * 15) % 10) * H * 0.0172;
                        g.beginPath();
                        g.moveTo(-S * 0.037, ty);
                        g.lineTo(S * 0.037, ty - H * 0.005);
                        g.stroke();
                    }
                }
                g.restore();
                e.restore();
            }
            // Bico estreito em perspectiva e carenagem abaixo do campo de visão.
            var colors =
                FORMULA_PAINTS[
                    frame.livery === 1 || frame.livery === 2 ? frame.livery : 0
                ];
            var paint = g.createLinearGradient(-S * 0.12, 0, S * 0.12, 0);
            paint.addColorStop(0, colors.dark);
            paint.addColorStop(0.42, colors.base);
            paint.addColorStop(0.53, colors.light);
            paint.addColorStop(1, colors.edge);
            panel(
                [
                    -S * 0.025,
                    H * 0.565,
                    S * 0.025,
                    H * 0.565,
                    S * 0.15,
                    H * 1.02,
                    -S * 0.15,
                    H * 1.02,
                ],
                paint,
            );
            panel(
                [
                    -S * 0.009,
                    H * 0.575,
                    S * 0.009,
                    H * 0.575,
                    S * 0.037,
                    H * 0.91,
                    -S * 0.037,
                    H * 0.91,
                ],
                colors.stripe,
            );
            panel(
                [
                    -S * 0.12,
                    H * 0.8,
                    -S * 0.27,
                    H,
                    S * 0.27,
                    H,
                    S * 0.12,
                    H * 0.8,
                    S * 0.095,
                    H * 0.83,
                    -S * 0.095,
                    H * 0.83,
                ],
                "#171b22",
            );
            panel(
                [
                    -S * 0.095,
                    H * 0.83,
                    S * 0.095,
                    H * 0.83,
                    S * 0.21,
                    H * 1.02,
                    -S * 0.21,
                    H * 1.02,
                ],
                "#080b10",
            );

            // Volante retangular com pegas laterais, tela e LEDs de troca.
            var R = Math.min(W * 0.22, H * 0.24);
            var ang = clamp(visYaw, -1, 1) * 0.65 + driftAngle * 0.12;
            g.translate(0, H * 0.91);
            e.translate(0, H * 0.91);
            g.rotate(ang);
            e.rotate(ang);
            surface(function (ctx) {
                rr(ctx, -R, -R * 0.43, R * 2, R * 0.86, R * 0.16);
            }, "#292e38");
            surface(function (ctx) {
                rr(ctx, -R * 0.96, -R * 0.39, R * 1.92, R * 0.78, R * 0.13);
            }, "#10151d");
            for (var grip = -1; grip <= 1; grip += 2) {
                surface(function (ctx) {
                    rr(
                        ctx,
                        grip * R * 0.86 - R * 0.13,
                        -R * 0.35,
                        R * 0.26,
                        R * 0.7,
                        R * 0.095,
                    );
                }, "#3b424e");
                g.fillStyle = grip < 0 ? "#e94c60" : "#51d8c0";
                g.beginPath();
                g.arc(grip * R * 0.61, R * 0.08, R * 0.055, 0, PI * 2);
                g.fill();
            }
            surface(function (ctx) {
                rr(ctx, -R * 0.44, -R * 0.2, R * 0.88, R * 0.44, R * 0.035);
            }, "#050b10");
            g.textAlign = e.textAlign = "center";
            g.textBaseline = e.textBaseline = "middle";
            g.font = e.font =
                "900 " +
                Math.max(8, (R * 0.26) | 0) +
                'px "Arial Black",Arial,sans-serif';
            g.fillStyle = e.fillStyle = "#edfaff";
            g.fillText(String(gear), -R * 0.25, R * 0.005);
            e.fillText(String(gear), -R * 0.25, R * 0.005);
            g.font =
                "700 " +
                Math.max(7, (R * 0.14) | 0) +
                "px ui-monospace,monospace";
            g.fillText(String(Math.floor(sp * 360)), R * 0.15, -R * 0.035);
            g.font =
                "700 " +
                Math.max(5, (R * 0.065) | 0) +
                "px ui-monospace,monospace";
            g.fillStyle = "#78a4b6";
            g.fillText("KM/H", R * 0.15, R * 0.09);
            g.fillText("LAP " + laps, 0, R * 0.31);
            var energy = clamp(nitroCharges / Math.max(1, NITRO_MAX), 0, 1);
            g.fillStyle = "#25353d";
            g.fillRect(-R * 0.35, R * 0.17, R * 0.7, R * 0.026);
            g.fillStyle = "#57e6c1";
            g.fillRect(-R * 0.35, R * 0.17, R * 0.7 * energy, R * 0.026);
            for (var led = 0; led < 12; led++) {
                var lit = led < Math.floor(rev * 12),
                    lx = (led - 5.5) * R * 0.112;
                var color =
                    led < 5 ? "#4feeaa" : led < 9 ? "#ffe36b" : "#ed668e";
                g.fillStyle = lit ? color : "#30333d";
                rr(
                    g,
                    lx - R * 0.033,
                    -R * 0.34,
                    R * 0.066,
                    R * 0.046,
                    R * 0.01,
                );
                g.fill();
                if (lit) {
                    e.fillStyle = color;
                    rr(
                        e,
                        lx - R * 0.033,
                        -R * 0.34,
                        R * 0.066,
                        R * 0.046,
                        R * 0.01,
                    );
                    e.fill();
                }
            }
            if (frame.circuit && frame.circuit.name) {
                g.fillStyle = "#8794a6";
                g.fillText(String(frame.circuit.name), 0, -R * 0.49, R * 1.7);
            }
            g.restore();
            e.restore();
        }

        return {
            render: function (frame) {
                loadFrame(frame);
                if (frame.mode === "formula") renderFormulaCockpit(frame);
                else drawCockpit();
            },
            invalidate: function () {
                COCK = null;
            },
        };
    };
})();
