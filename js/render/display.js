(function () {
    "use strict";

    var ND = (window.NeonDrive = window.NeonDrive || {});

    ND.createDisplay = function (canvas) {
        var cv = ND.util.cv,
            clamp = ND.util.clamp,
            rand = ND.util.rand;

        /* ---------- canvas e buffers ---------- */
        var view = canvas;
        var vctx = view.getContext("2d");
        var scene = cv(2, 2),
            sctx = scene.getContext("2d"); // cena principal
        var emis = cv(2, 2),
            ectx = emis.getContext("2d"); // camada emissiva (metade da resolução)
        var bloom = cv(2, 2),
            bctx = bloom.getContext("2d"); // bloom (1/9)
        var caR = cv(2, 2),
            rctx = caR.getContext("2d"); // canal vermelho
        var caC = cv(2, 2),
            cctx = caC.getContext("2d"); // canal ciano
        var grain = null,
            scan = null,
            vign = null;

        var W = 0,
            H = 0,
            EW = 0,
            EH = 0,
            BW = 0,
            BH = 0,
            CW = 0,
            CH = 0;
        var renderQuality = 2; // 0 baixo · 1 médio · 2 alto
        var hasFilter = typeof sctx.filter === "string";

        // O caller atualiza a câmera quando o tamanho muda.
        function resize(quality) {
            if (quality === undefined) quality = renderQuality;
            renderQuality = quality;
            var cw = view.clientWidth || window.innerWidth;
            var ch = view.clientHeight || window.innerHeight;
            var dpr = Math.min(
                window.devicePixelRatio || 1,
                quality === 2 ? 2 : 1.25,
            );
            if (!cw || !ch) {
                // Sem medidas CSS, o bitmap já está em pixels: não reaplicar DPR.
                cw = cw || view.width;
                ch = ch || view.height;
                dpr = 1;
            }
            var maxW = quality === 2 ? 1680 : quality === 1 ? 1180 : 820;
            var nW = Math.round(Math.min(cw * dpr, maxW));
            if (!isFinite(nW) || nW < 64) nW = 960;
            var nH = Math.round((nW * ch) / cw);
            if (!isFinite(nH) || nH < 64) nH = Math.round(nW * 0.62);
            if (nW === W && nH === H && grain) return false;
            W = nW;
            H = nH;
            view.width = W;
            view.height = H;
            scene.width = W;
            scene.height = H;
            EW = Math.ceil(W / 2);
            EH = Math.ceil(H / 2);
            emis.width = EW;
            emis.height = EH;
            BW = Math.ceil(W / 9);
            BH = Math.ceil(H / 9);
            bloom.width = BW;
            bloom.height = BH;
            CW = Math.ceil(W / 2);
            CH = Math.ceil(H / 2);
            caR.width = CW;
            caR.height = CH;
            caC.width = CW;
            caC.height = CH;
            buildOverlays();
            return true;
        }

        /* texturas de pós-processamento */
        function buildOverlays() {
            // grão de filme
            grain = cv(160, 160);
            var g = grain.getContext("2d"),
                id = g.createImageData(160, 160),
                d = id.data;
            for (var i = 0; i < d.length; i += 4) {
                var n = (200 + Math.random() * 55) | 0;
                d[i] = d[i + 1] = d[i + 2] = n;
                d[i + 3] = 26;
            }
            g.putImageData(id, 0, 0);
            // scanlines
            scan = cv(2, 4);
            var s = scan.getContext("2d");
            s.fillStyle = "rgba(0,0,0,0.30)";
            s.fillRect(0, 0, 2, 2);
            s.fillStyle = "rgba(0,0,0,0.00)";
            s.fillRect(0, 2, 2, 2);
            // vinheta
            vign = cv(Math.max(2, W >> 1), Math.max(2, H >> 1));
            var v = vign.getContext("2d");
            var vg = v.createRadialGradient(
                vign.width / 2,
                vign.height / 2,
                vign.height * 0.18,
                vign.width / 2,
                vign.height / 2,
                vign.height * 0.82,
            );
            vg.addColorStop(0, "rgba(0,0,0,0)");
            vg.addColorStop(0.62, "rgba(10,0,20,0.12)");
            vg.addColorStop(1, "rgba(6,0,14,0.46)");
            v.fillStyle = vg;
            v.fillRect(0, 0, vign.width, vign.height);
        }

        function begin() {
            sctx.setTransform(1, 0, 0, 1, 0, 0);
            sctx.globalAlpha = 1;
            sctx.globalCompositeOperation = "source-over";
            sctx.clearRect(0, 0, W, H);
            ectx.setTransform(0.5, 0, 0, 0.5, 0, 0);
            ectx.globalAlpha = 1;
            ectx.globalCompositeOperation = "source-over";
            ectx.clearRect(0, 0, W, H);
        }

        function beginView(viewport) {
            var vx = viewport[0],
                vy = viewport[1],
                vw = viewport[2],
                vh = viewport[3];
            sctx.save();
            sctx.translate(vx, vy);
            sctx.beginPath();
            sctx.rect(0, 0, vw, vh);
            sctx.clip();
            ectx.save();
            ectx.translate(vx, vy);
            ectx.beginPath();
            ectx.rect(0, 0, vw, vh);
            ectx.clip();
        }

        function endView() {
            sctx.restore();
            ectx.restore();
        }

        /* ---------- pós-processamento ---------- */
        function composite(effects) {
            var gSpd = effects.speed,
                maxSpeed = effects.maxSpeed,
                gBoost = effects.boost,
                gShake = effects.shake,
                gFlash = effects.flash,
                quality =
                    effects.quality === undefined
                        ? renderQuality
                        : effects.quality,
                safeMode = effects.safeMode;
            var shakeX, shakeY;
            if (safeMode) {
                vctx.setTransform(1, 0, 0, 1, 0, 0);
                vctx.globalAlpha = 1;
                vctx.globalCompositeOperation = "source-over";
                vctx.clearRect(0, 0, W, H);
                vctx.drawImage(scene, 0, 0, W, H);
                vctx.globalCompositeOperation = "lighter";
                vctx.drawImage(emis, 0, 0, W, H);
                vctx.globalCompositeOperation = "source-over";
                return;
            }
            var sp = gSpd / maxSpeed;
            var caAmt =
                (clamp((sp - 0.6) / 0.4, 0, 1) * 0.8 +
                    gBoost * 2.4 +
                    gFlash * 4) *
                (W / 1200);

            vctx.setTransform(1, 0, 0, 1, 0, 0);
            vctx.globalCompositeOperation = "source-over";
            vctx.globalAlpha = 1;

            // tremor de câmera
            var sh = gShake * W * 0.01 + gBoost * W * 0.0016;
            shakeX = rand(-sh, sh);
            shakeY = rand(-sh, sh);
            var over = 1 + (sh > 0.2 ? (sh / W) * 2.6 : 0);
            vctx.save();
            vctx.translate(W / 2 + shakeX, H / 2 + shakeY);
            vctx.scale(over, over);
            vctx.translate(-W / 2, -H / 2);

            if (caAmt > 0.8 && quality >= 1) {
                rctx.setTransform(1, 0, 0, 1, 0, 0);
                rctx.globalCompositeOperation = "source-over";
                rctx.clearRect(0, 0, CW, CH);
                rctx.drawImage(scene, 0, 0, CW, CH);
                rctx.globalCompositeOperation = "multiply";
                rctx.fillStyle = "#ff0000";
                rctx.fillRect(0, 0, CW, CH);
                cctx.setTransform(1, 0, 0, 1, 0, 0);
                cctx.globalCompositeOperation = "source-over";
                cctx.clearRect(0, 0, CW, CH);
                cctx.drawImage(scene, 0, 0, CW, CH);
                cctx.globalCompositeOperation = "multiply";
                cctx.fillStyle = "#00ffff";
                cctx.fillRect(0, 0, CW, CH);
                vctx.drawImage(caR, -caAmt, 0, W, H);
                vctx.globalCompositeOperation = "lighter";
                vctx.drawImage(caC, caAmt, 0, W, H);
                vctx.globalCompositeOperation = "source-over";
            } else {
                vctx.drawImage(scene, 0, 0, W, H);
            }

            // bloom
            bctx.setTransform(1, 0, 0, 1, 0, 0);
            bctx.clearRect(0, 0, BW, BH);
            if (hasFilter) bctx.filter = "blur(1.4px)";
            bctx.drawImage(emis, 0, 0, BW, BH);
            if (hasFilter) bctx.filter = "none";

            vctx.globalCompositeOperation = "lighter";
            vctx.globalAlpha = 0.55;
            vctx.drawImage(bloom, 0, 0, W, H);
            vctx.globalAlpha = 0.24;
            vctx.drawImage(emis, 0, 0, W, H);
            vctx.globalAlpha = 1;
            vctx.globalCompositeOperation = "source-over";
            vctx.restore();

            // flash de impacto
            if (gFlash > 0.01) {
                vctx.globalCompositeOperation = "lighter";
                vctx.fillStyle =
                    "rgba(255,120,150," + (gFlash * 0.35).toFixed(3) + ")";
                vctx.fillRect(0, 0, W, H);
                vctx.globalCompositeOperation = "source-over";
            }

            if (quality >= 1) {
                // scanlines
                var pat = vctx.createPattern(scan, "repeat");
                if (pat) {
                    vctx.save();
                    vctx.scale(1, Math.max(1, H / 600));
                    vctx.fillStyle = pat;
                    vctx.globalAlpha = 0.12;
                    vctx.fillRect(0, 0, W, H);
                    vctx.restore();
                    vctx.globalAlpha = 1;
                }
                // grão
                var gp = vctx.createPattern(grain, "repeat");
                if (gp) {
                    vctx.save();
                    vctx.translate(
                        (Math.random() * 160) | 0,
                        (Math.random() * 160) | 0,
                    );
                    vctx.globalCompositeOperation = "overlay";
                    vctx.globalAlpha = 0.09;
                    vctx.fillStyle = gp;
                    vctx.fillRect(-160, -160, W + 320, H + 320);
                    vctx.restore();
                    vctx.globalAlpha = 1;
                    vctx.globalCompositeOperation = "source-over";
                }
            }
            // vinheta
            vctx.drawImage(vign, 0, 0, W, H);
        }

        return {
            resize: resize,
            begin: begin,
            beginView: beginView,
            endView: endView,
            composite: composite,
            get width() {
                return W;
            },
            get height() {
                return H;
            },
            get sctx() {
                return sctx;
            },
            get ectx() {
                return ectx;
            },
        };
    };
})();
