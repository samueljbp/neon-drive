(function () {
    "use strict";

    var ND = (window.NeonDrive = window.NeonDrive || {});

    // O caller fornece contextos já transformados/recortados para este viewport.
    // Tempos em segundos; volta começa em 1. Resultados são congelados pelo main.
    ND.createHUD = function () {
        var U = ND.util,
            PI = U.PI,
            clamp = U.clamp,
            css = U.css,
            rr = U.rr;
        var W,
            H,
            sctx,
            ectx,
            state,
            numP,
            curP,
            quality,
            camMode,
            mode,
            pal,
            timeLeft,
            laps,
            score,
            combo,
            speed,
            maxSpeed,
            boosting,
            boostT,
            nitroCharges,
            NITRO_MAX,
            position,
            sunPulse,
            curBiome,
            checkpointFlash,
            pDead,
            trackLength,
            BIOMES,
            difficulty,
            race;
        var QNAME = ["BAIXA", "MÉDIA", "ALTA"];

        function loadFrame(frame) {
            W = frame.W;
            H = frame.H;
            sctx = frame.sctx;
            ectx = frame.ectx;
            state = frame.state;
            numP = frame.numP;
            curP = frame.curP;
            quality = frame.quality;
            camMode = frame.camMode;
            mode = frame.mode;
            pal = frame.pal;
            timeLeft = frame.timeLeft;
            laps = frame.laps;
            score = frame.score;
            combo = frame.combo;
            speed = frame.speed;
            maxSpeed = frame.maxSpeed;
            boosting = frame.boosting;
            boostT = frame.boostT;
            nitroCharges = frame.nitroCharges;
            NITRO_MAX = frame.NITRO_MAX;
            position = frame.position;
            sunPulse = frame.sunPulse;
            curBiome = frame.curBiome;
            checkpointFlash = frame.checkpointFlash;
            pDead = frame.pDead;
            trackLength = frame.world.trackLength;
            BIOMES = frame.world.BIOMES;
            difficulty = frame.difficulty;
            race = frame.race;
        }

        /* ---------- auxiliares do HUD clássico ---------- */
        // maxWidth é opcional: limita o texto nos painéis do modo Fórmula.
        function hudText(txt, x, y, size, color, align, italic, maxWidth) {
            var font =
                (italic ? "italic " : "") +
                "900 " +
                (size | 0) +
                'px "Arial Black",Arial,sans-serif';
            sctx.font = font;
            ectx.font = font;
            sctx.textAlign = align;
            ectx.textAlign = align;
            sctx.textBaseline = "alphabetic";
            ectx.textBaseline = "alphabetic";
            sctx.fillStyle = color;
            ectx.fillStyle = color;
            if (maxWidth === undefined) sctx.fillText(txt, x, y);
            else sctx.fillText(txt, x, y, maxWidth);
        }
        function hudLabel(txt, x, y, size, color, align, maxWidth) {
            var font =
                "700 " +
                Math.max(8, size | 0) +
                'px ui-monospace,"Courier New",monospace';
            sctx.font = font;
            ectx.font = font;
            sctx.textAlign = align;
            ectx.textAlign = align;
            sctx.fillStyle = color;
            ectx.fillStyle = color;
            if (maxWidth === undefined) sctx.fillText(txt, x, y);
            else sctx.fillText(txt, x, y, maxWidth);
        }
        function bar(x, y, w, h, pct, c1, c2) {
            sctx.fillStyle = "rgba(8,4,18,0.55)";
            rr(sctx, x, y, w, h, h / 2);
            sctx.fill();
            sctx.strokeStyle = c2;
            sctx.lineWidth = Math.max(1, h * 0.1);
            rr(sctx, x, y, w, h, h / 2);
            sctx.stroke();
            ectx.strokeStyle = c2;
            ectx.lineWidth = Math.max(1, h * 0.1);
            rr(ectx, x, y, w, h, h / 2);
            ectx.stroke();
            var iw = (w - h * 0.34) * clamp(pct, 0, 1);
            if (iw > 1) {
                sctx.fillStyle = c1;
                rr(sctx, x + h * 0.17, y + h * 0.17, iw, h * 0.66, h * 0.33);
                sctx.fill();
                ectx.fillStyle = c1;
                rr(ectx, x + h * 0.17, y + h * 0.17, iw, h * 0.66, h * 0.33);
                ectx.fill();
            }
        }
        function boltIcon(g, x, y, s) {
            g.beginPath();
            g.moveTo(x + s * 0.58, y);
            g.lineTo(x + s * 0.16, y + s * 0.46);
            g.lineTo(x + s * 0.44, y + s * 0.46);
            g.lineTo(x + s * 0.3, y + s * 1.0);
            g.lineTo(x + s * 0.76, y + s * 0.42);
            g.lineTo(x + s * 0.46, y + s * 0.42);
            g.lineTo(x + s * 0.62, y);
            g.closePath();
            g.fill();
        }
        function hudPanel(x, y, w, h, r) {
            sctx.fillStyle = "rgba(6,12,25,0.90)";
            rr(sctx, x, y, w, h, r);
            sctx.fill();
            ectx.save();
            ectx.globalCompositeOperation = "destination-out";
            ectx.fillStyle = "#000";
            rr(ectx, x, y, w, h, r);
            ectx.fill();
            ectx.restore();
        }

        /* ---------- HUD clássico, extraído do index.html ---------- */
        function renderHUD() {
            if (state === "menu") return;
            var u = Math.min(Math.max(7.5, W * 0.012), H * 0.022),
                m = W * 0.035,
                top = Math.max(H * 0.085, u * 5.1);

            // Painéis instrumentais: leitura nítida mesmo contra o sol e o bloom.
            hudPanel(m - u, top - u * 4.1, W * 0.27, u * 6.5, u * 0.7);
            hudPanel(
                W * 0.5 - u * 6.2,
                top - u * 4.1,
                u * 12.4,
                u * 7.2,
                u * 0.7,
            );
            hudPanel(
                W - m - W * 0.16,
                top - u * 4.1,
                W * 0.16 + u,
                u * 6.5,
                u * 0.7,
            );
            var bottom = H - H * 0.075;
            hudPanel(m - u, bottom - u * 5.2, W * 0.24, u * 8, u * 0.7);
            hudPanel(
                W - m - u * 18,
                bottom - u * 6.1,
                u * 19,
                u * 8.6,
                u * 0.7,
            );
            sctx.fillStyle = "#65dfea";
            sctx.fillRect(m, top - u * 4.1, W * 0.05, Math.max(1, u * 0.13));
            sctx.fillRect(
                W * 0.5 - u * 2,
                top - u * 4.1,
                u * 4,
                Math.max(1, u * 0.13),
            );

            hudLabel(
                numP === 2 ? "JOGADOR " + (curP + 1) : "PONTOS",
                m,
                top - u * 2.4,
                u * 1.05,
                numP === 2 ? css(pal.rumble2, 0.95) : css(pal.sun1, 0.75),
                "left",
            );
            hudText(
                String(Math.floor(score)).padStart(8, "0"),
                m,
                top + u * 0.6,
                u * 2.5,
                "#ffe066",
                "left",
                true,
            );

            var tCol =
                timeLeft < 11
                    ? Math.floor(sunPulse * 6) % 2
                        ? "#ff3355"
                        : "#ffffff"
                    : "#ffffff";
            hudLabel(
                "TEMPO",
                W / 2,
                top - u * 2.4,
                u * 1.05,
                css(pal.sun1, 0.75),
                "center",
            );
            hudText(
                timeLeft.toFixed(1),
                W / 2,
                top + u * 1.4,
                u * 4.0,
                tCol,
                "center",
                true,
            );

            hudLabel(
                "VOLTA",
                W - m,
                top - u * 2.4,
                u * 1.05,
                css(pal.sun1, 0.75),
                "right",
            );
            hudText(
                String(laps),
                W - m,
                top + u * 0.6,
                u * 2.5,
                "#00e5ff",
                "right",
                true,
            );

            // velocímetro
            var kmh = Math.floor((speed / maxSpeed) * 360);
            var by = H - H * 0.075;
            hudText(
                String(kmh),
                W - m,
                by,
                u * 5.2,
                boosting > 0.1 ? "#9df9ff" : "#ffffff",
                "right",
                true,
            );
            hudLabel(
                "KM/H",
                W - m,
                by + u * 1.6,
                u * 1.15,
                css(pal.neon, 0.9),
                "right",
            );

            // marcha
            var gear = Math.min(6, 1 + Math.floor((speed / maxSpeed) * 5.9));
            hudText(
                "M" + gear,
                W - m - u * 9.2,
                by,
                u * 2.6,
                css(pal.rumble2),
                "right",
                true,
            );

            // cargas de nitro
            var bw = W * 0.2;
            hudLabel(
                "NITRO",
                m,
                by - u * 3.3,
                u * 1.05,
                css(pal.sun1, 0.8),
                "left",
            );
            for (var nb = 0; nb < NITRO_MAX; nb++) {
                var onC = nb < nitroCharges,
                    bx0 = m + nb * u * 2.0,
                    by0 = by - u * 2.8;
                sctx.fillStyle = onC
                    ? boostT > 0
                        ? "#ffffff"
                        : "#9df9ff"
                    : "rgba(150,140,190,0.26)";
                boltIcon(sctx, bx0, by0, u * 2.4);
                if (onC) {
                    ectx.fillStyle = boostT > 0 ? "#ffffff" : "#9df9ff";
                    boltIcon(ectx, bx0, by0, u * 2.4);
                }
            }

            // progresso da volta
            var pw = W * 0.2,
                py = by + u * 1.6;
            bar(
                m,
                py,
                pw,
                u * 0.7,
                position / trackLength,
                css(pal.neon),
                css(pal.neon, 0.5),
            );

            // combo
            if (combo > 1) {
                hudText(
                    "x" + combo,
                    m + bw + u * 2.6,
                    by,
                    u * 2.8,
                    "#ffe066",
                    "left",
                    true,
                );
            }

            // Rota em faixa dedicada, separada dos instrumentos inferiores.
            hudLabel(
                BIOMES[curBiome].name + "  /  " + pal.name,
                W / 2,
                top + u * 5.4,
                u * 0.95,
                "#e0d9f0",
                "center",
            );
            hudLabel(
                QNAME[quality] +
                    "  ·  " +
                    (camMode ? "INTERNA" : "EXTERNA") +
                    "  ·  P PAUSA",
                W / 2,
                H - u * 1.2,
                u * 0.85,
                "#a9b6cc",
                "center",
            );

            if (pDead) {
                sctx.fillStyle = "rgba(9,2,16,0.58)";
                sctx.fillRect(0, 0, W, H);
                hudText(
                    "TEMPO ESGOTADO",
                    W / 2,
                    H * 0.52,
                    u * 2.8,
                    "#ff5577",
                    "center",
                    true,
                );
            }

            // aviso de checkpoint
            if (checkpointFlash > 0) {
                var a = clamp(checkpointFlash / 1.6, 0, 1);
                hudText(
                    "CHECKPOINT  +" + difficulty.cp + "s",
                    W / 2,
                    H * 0.4,
                    u * 3.4,
                    "rgba(255,255,255," + a.toFixed(2) + ")",
                    "center",
                    true,
                );
            }
        }

        /* ---------- Fórmula: instrumentos e sinalização da corrida ---------- */
        function raceTime(seconds) {
            if (!Number.isFinite(seconds) || seconds < 0) return "--:--.-";
            var tenths = Math.floor(seconds * 10);
            return (
                Math.floor(tenths / 600) +
                ":" +
                String(Math.floor(tenths / 10) % 60).padStart(2, "0") +
                "." +
                (tenths % 10)
            );
        }

        function renderFormulaHUD() {
            var u = Math.min(Math.max(7.5, W * 0.012), H * 0.022, W / 42),
                m = W * 0.035,
                gap = u * 0.8,
                pad = u,
                width = W - m * 2,
                top = u,
                height = u * 7;
            // Colunas proporcionais, não caixas fixas: também cabem em 390 x 422 (2P).
            var columns = width - gap * 2,
                sideW = columns * 0.27,
                timerW = columns * 0.46,
                timerX = m + sideW + gap,
                lapX = timerX + timerW + gap;
            hudPanel(m, top, sideW, height, u * 0.7);
            hudPanel(timerX, top, timerW, height, u * 0.7);
            hudPanel(lapX, top, sideW, height, u * 0.7);
            sctx.fillStyle = "#65dfea";
            sctx.fillRect(m + pad, top, sideW - pad * 2, Math.max(1, u * 0.13));
            sctx.fillRect(
                timerX + pad,
                top,
                timerW - pad * 2,
                Math.max(1, u * 0.13),
            );
            sctx.fillStyle = "#ff5577";
            sctx.fillRect(
                lapX + pad,
                top,
                sideW - pad * 2,
                Math.max(1, u * 0.13),
            );

            var rank = race.rank + "º/" + race.total,
                lap = clamp(laps, 1, race.lapCount),
                elapsed = race.finished ? race.finishTime : race.elapsed,
                labelY = top + u * 1.8,
                valueY = top + u * 5.65;
            hudLabel(
                numP === 2 ? "POSIÇÃO · J" + (curP + 1) : "POSIÇÃO",
                m + pad,
                labelY,
                u * 1.05,
                "#a9b6cc",
                "left",
                sideW - pad * 2,
            );
            hudText(
                rank,
                m + pad,
                valueY,
                u * 2.8,
                "#ffe066",
                "left",
                true,
                sideW - pad * 2,
            );
            hudLabel(
                "CRONÔMETRO",
                W / 2,
                labelY,
                u * 1.05,
                "#a9b6cc",
                "center",
                timerW - pad * 2,
            );
            hudText(
                raceTime(elapsed),
                W / 2,
                valueY,
                u * 3.6,
                "#ffffff",
                "center",
                true,
                timerW - pad * 2,
            );
            hudLabel(
                "VOLTA",
                W - m - pad,
                labelY,
                u * 1.05,
                "#a9b6cc",
                "right",
                sideW - pad * 2,
            );
            hudText(
                lap + "/" + race.lapCount,
                W - m - pad,
                valueY,
                u * 2.8,
                "#00e5ff",
                "right",
                true,
                sideW - pad * 2,
            );

            // Faixa de circuito/setor e tempos de volta; não representa um mapa.
            var routeY = top + height + gap,
                circuit = race.circuit;
            hudPanel(m, routeY, width, u * 6.8, u * 0.7);
            hudLabel(
                circuit.name + (circuit.country ? " · " + circuit.country : ""),
                W / 2,
                routeY + u * 1.8,
                u * 1.4,
                "#e0f5ff",
                "center",
                width - pad * 2,
            );
            hudLabel(
                race.sectorName,
                W / 2,
                routeY + u * 3.8,
                u * 1.05,
                "#a9b6cc",
                "center",
                width - pad * 2,
            );
            var lapWidth = (width - gap) / 2 - pad * 2;
            hudLabel(
                "ÚLTIMA " + raceTime(race.lastLap > 0 ? race.lastLap : null),
                m + pad,
                routeY + u * 5.8,
                u,
                "#c4cedc",
                "left",
                lapWidth,
            );
            hudLabel(
                "MELHOR " + raceTime(race.bestLap > 0 ? race.bestLap : null),
                W - m - pad,
                routeY + u * 5.8,
                u,
                "#9df9ff",
                "right",
                lapWidth,
            );

            var by = H - H * 0.075,
                speedX = W - m - u * 18;
            hudPanel(speedX, by - u * 6.1, u * 19, u * 8.6, u * 0.7);
            var sp = clamp(speed / maxSpeed, 0, 1.35),
                kmh = Math.floor(sp * 360),
                gear = Math.min(8, 1 + Math.floor(sp * 7.9));
            hudText(
                String(kmh),
                W - m,
                by,
                u * 5.2,
                boosting > 0.1 ? "#9df9ff" : "#ffffff",
                "right",
                true,
                u * 9,
            );
            hudLabel("KM/H", W - m, by + u * 1.6, u * 1.15, "#9df9ff", "right");
            hudText(
                "M" + gear,
                W - m - u * 10,
                by,
                u * 2.6,
                "#ffe066",
                "right",
                true,
                u * 7,
            );

            var nitroW = Math.min(width * 0.36, u * 14),
                chargeStep = Math.min(
                    u * 2,
                    (nitroW - pad * 2) / Math.max(1, NITRO_MAX),
                );
            hudPanel(m - u, by - u * 5.2, nitroW + u, u * 8, u * 0.7);
            hudLabel("NITRO", m, by - u * 3.3, u * 1.05, "#c4cedc", "left");
            for (var nb = 0; nb < NITRO_MAX; nb++) {
                var on = nb < nitroCharges,
                    x = m + nb * chargeStep,
                    color = boostT > 0 ? "#ffffff" : "#9df9ff";
                sctx.fillStyle = on ? color : "rgba(150,140,190,0.26)";
                boltIcon(sctx, x, by - u * 2.8, chargeStep * 1.2);
                if (on) {
                    ectx.fillStyle = color;
                    boltIcon(ectx, x, by - u * 2.8, chargeStep * 1.2);
                }
            }
            bar(
                m,
                by + u * 1.6,
                nitroW - pad,
                u * 0.7,
                nitroCharges / Math.max(1, NITRO_MAX),
                "#9df9ff",
                "rgba(157,249,255,0.5)",
            );
            hudLabel(
                QNAME[quality] +
                    "  ·  " +
                    (camMode ? "INTERNA" : "EXTERNA") +
                    "  ·  P PAUSA",
                W / 2,
                H - u * 1.2,
                u * 0.85,
                "#a9b6cc",
                "center",
                width,
            );

            if (race.finished) renderFinish(u, m, rank);
            else if (race.countdown > 0) renderStartLights(u, m);
            else if (race.elapsed >= 0 && race.elapsed < 0.8) {
                hudPanel(
                    W / 2 - u * 8,
                    H * 0.48 - u * 4.5,
                    u * 16,
                    u * 8,
                    u * 0.7,
                );
                hudText(
                    "VAI!",
                    W / 2,
                    H * 0.48 + u * 1.5,
                    u * 5.2,
                    "#7dffb0",
                    "center",
                    true,
                );
            }
        }

        function renderStartLights(u, m) {
            var cy = H * 0.48,
                width = Math.min(W - m * 2, u * 29);
            hudPanel(W / 2 - width / 2, cy - u * 3.2, width, u * 8.7, u * 0.7);
            // Uma luz a cada 0,6 s; as cinco ficam acesas antes de apagar na largada.
            var lit = clamp(
                1 +
                    Math.floor(
                        ((3 - clamp(race.countdown, 0, 3)) * 5) / 3 + 1e-6,
                    ),
                1,
                5,
            );
            for (var i = 0; i < 5; i++) {
                var x = W / 2 + (i - 2) * u * 4.2;
                sctx.fillStyle = i < lit ? "#ff3355" : "#352333";
                sctx.beginPath();
                sctx.arc(x, cy, u * 1.3, 0, PI * 2);
                sctx.fill();
                if (i < lit) {
                    ectx.fillStyle = "#ff3355";
                    ectx.beginPath();
                    ectx.arc(x, cy, u * 1.3, 0, PI * 2);
                    ectx.fill();
                }
            }
            hudLabel(
                "PREPARE-SE",
                W / 2,
                cy + u * 4.1,
                u * 1.6,
                "#ffffff",
                "center",
                width - u * 2,
            );
        }

        function renderFinish(u, m, rank) {
            sctx.fillStyle = "rgba(9,2,16,0.58)";
            sctx.fillRect(0, 0, W, H);
            var cy = H * 0.47,
                width = Math.min(W - m * 2, u * 38),
                textW = width - u * 2;
            hudPanel(W / 2 - width / 2, cy - u * 4, width, u * 14, u * 0.7);
            hudText(
                "BANDEIRADA",
                W / 2,
                cy,
                u * 3.6,
                "#ffffff",
                "center",
                true,
                textW,
            );
            hudText(
                rank,
                W / 2,
                cy + u * 3.8,
                u * 3.2,
                "#ffe066",
                "center",
                true,
                textW,
            );
            hudLabel(
                "TEMPO " + raceTime(race.finishTime),
                W / 2,
                cy + u * 6.4,
                u * 1.2,
                "#9df9ff",
                "center",
                textW,
            );
            hudLabel(
                numP === 2 && state !== "over"
                    ? "AGUARDANDO OUTRO JOGADOR"
                    : "CORRIDA CONCLUÍDA",
                W / 2,
                cy + u * 8.9,
                u * 1.05,
                "#c4cedc",
                "center",
                textW,
            );
        }

        return {
            render: function (frame) {
                if (frame.state === "menu") return;
                loadFrame(frame);
                sctx.save();
                ectx.save();
                // A cabine pode ter deixado a linha de base em "middle".
                sctx.textBaseline = ectx.textBaseline = "alphabetic";
                try {
                    if (mode === "formula") renderFormulaHUD();
                    else renderHUD();
                } finally {
                    sctx.restore();
                    ectx.restore();
                }
            },
        };
    };
})();
