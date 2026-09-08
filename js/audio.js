(function () {
    "use strict";

    var ND = (window.NeonDrive = window.NeonDrive || {});

    ND.createAudio = function () {
        var clamp = ND.util.clamp;

        /* ---------- áudio procedural ---------- */
        var AC = null,
            master = null,
            musicGain = null,
            sfxGain = null,
            spaceIn = null,
            eng = null;
        var NB = null,
            muted = false,
            nextNote = 0,
            mstep = 0,
            lastGear = -1,
            shiftT = 0,
            revSm = 0.16;

        function mkNoise(sec) {
            var len = Math.max(64, Math.floor(AC.sampleRate * sec));
            var b = AC.createBuffer(1, len, AC.sampleRate),
                d = b.getChannelData(0);
            for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
            return b;
        }
        function shaperCurve(k) {
            var n = 1024,
                c = new Float32Array(n);
            for (var i = 0; i < n; i++) {
                var x = (i * 2) / n - 1;
                c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
            }
            return c;
        }
        /* onda de pulso de escape: parciais decaindo como 1/n^0.82 — muito mais "motor" que serra pura */
        function engineWave() {
            // Ausência da API usa serra; falhas de síntese chegam ao caller.
            if (typeof AC.createPeriodicWave !== "function") return null;
            var n = 22,
                re = new Float32Array(n),
                im = new Float32Array(n);
            for (var i = 1; i < n; i++)
                im[i] = Math.pow(i, -0.82) * (0.6 + 0.4 * Math.cos(i * 1.15));
            return AC.createPeriodicWave(re, im, {
                disableNormalization: false,
            });
        }
        function loopNoise(buf, dest) {
            var n = AC.createBufferSource();
            n.buffer = buf;
            n.loop = true;
            n.connect(dest);
            n.start();
            return n;
        }

        function initAudio() {
            if (AC) return;
            var Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx)
                throw new Error("Web Audio API não disponível neste ambiente.");
            AC = new Ctx();
            master = AC.createGain();
            master.gain.value = muted ? 0 : 0.5;
            master.connect(AC.destination);
            NB = { s: mkNoise(0.06), m: mkNoise(0.3), l: mkNoise(2.0) };

            /* espaço: delay estéreo realimentado (mais barato que convolução, e dá ar) */
            spaceIn = AC.createGain();
            var dl = AC.createDelay(0.8),
                dr = AC.createDelay(0.8);
            var fb = AC.createGain(),
                damp = AC.createBiquadFilter(),
                wet = AC.createGain();
            dl.delayTime.value = 0.21;
            dr.delayTime.value = 0.29;
            fb.gain.value = 0.34;
            damp.type = "lowpass";
            damp.frequency.value = 2600;
            wet.gain.value = 0.3;
            var mrg = AC.createChannelMerger(2);
            spaceIn.connect(dl);
            dl.connect(dr);
            dr.connect(damp);
            damp.connect(fb);
            fb.connect(dl);
            dl.connect(mrg, 0, 0);
            dr.connect(mrg, 0, 1);
            mrg.connect(wet);
            wet.connect(master);

            musicGain = AC.createGain();
            musicGain.gain.value = 0.24;
            musicGain.connect(master);
            musicGain.connect(spaceIn);
            sfxGain = AC.createGain();
            sfxGain.gain.value = 0.65;
            sfxGain.connect(master);

            /* ── motor ── */
            eng = {};
            eng.pre = AC.createGain();
            eng.pre.gain.value = 0.5;
            eng.shape = AC.createWaveShaper();
            eng.shape.curve = shaperCurve(3.4);
            eng.shape.oversample = "2x";
            eng.body = AC.createBiquadFilter();
            eng.body.type = "bandpass";
            eng.body.frequency.value = 320;
            eng.body.Q.value = 0.9;
            eng.tone = AC.createBiquadFilter();
            eng.tone.type = "lowpass";
            eng.tone.frequency.value = 1800;
            eng.tone.Q.value = 0.8;
            eng.out = AC.createGain();
            eng.out.gain.value = 0;
            eng.pre.connect(eng.shape);
            eng.shape.connect(eng.body);
            eng.body.connect(eng.tone);
            eng.tone.connect(eng.out);
            eng.out.connect(master);
            eng.low = AC.createGain();
            eng.low.gain.value = 0.55;
            eng.low.connect(eng.tone);

            var wave = engineWave();
            eng.o1 = AC.createOscillator();
            eng.o2 = AC.createOscillator();
            eng.sub = AC.createOscillator();
            if (wave) {
                eng.o1.setPeriodicWave(wave);
                eng.o2.setPeriodicWave(wave);
            } else {
                eng.o1.type = "sawtooth";
                eng.o2.type = "sawtooth";
            }
            eng.sub.type = "sine";
            eng.o2.detune.value = 11; // dois bancos levemente fora = batimento
            eng.o1.connect(eng.pre);
            eng.o2.connect(eng.pre);
            eng.sub.connect(eng.low);
            eng.o1.start();
            eng.o2.start();
            eng.sub.start();

            eng.intakeBP = AC.createBiquadFilter();
            eng.intakeBP.type = "bandpass";
            eng.intakeBP.Q.value = 1.5;
            eng.intake = AC.createGain();
            eng.intake.gain.value = 0;
            loopNoise(NB.l, eng.intakeBP);
            eng.intakeBP.connect(eng.intake);
            eng.intake.connect(eng.pre);

            var wf = AC.createBiquadFilter();
            wf.type = "bandpass";
            wf.frequency.value = 1500;
            wf.Q.value = 0.5;
            eng.wind = AC.createGain();
            eng.wind.gain.value = 0;
            loopNoise(NB.l, wf);
            wf.connect(eng.wind);
            eng.wind.connect(master);

            eng.sqBP = AC.createBiquadFilter();
            eng.sqBP.type = "bandpass";
            eng.sqBP.frequency.value = 1700;
            eng.sqBP.Q.value = 9;
            eng.squeal = AC.createGain();
            eng.squeal.gain.value = 0;
            loopNoise(NB.l, eng.sqBP);
            eng.sqBP.connect(eng.squeal);
            eng.squeal.connect(master);
            eng.squeal.connect(spaceIn);

            eng.turbo = AC.createOscillator();
            eng.turbo.type = "sine";
            eng.turbo.frequency.value = 3000;
            eng.turboG = AC.createGain();
            eng.turboG.gain.value = 0;
            eng.turbo.connect(eng.turboG);
            eng.turboG.connect(master);
            eng.turbo.start();

            nextNote = AC.currentTime + 0.1;
        }

        /* rotação em seis marchas no clássico e oito na Fórmula: sobe e cai na troca */
        function updateEngine(dt, snapshot) {
            if (!AC || !eng) return;
            var P0 = snapshot.player,
                maxSpeed = snapshot.maxSpeed,
                state = snapshot.state,
                mode = snapshot.mode,
                boosting = P0.boosting;
            var t = AC.currentTime,
                sp = P0.speed / maxSpeed,
                G = mode === "formula" ? 8 : 6;
            var gi = clamp(Math.floor(sp * G), 0, G - 1),
                frac = clamp(sp * G - gi, 0, 1);
            if (gi !== lastGear) {
                if (lastGear >= 0 && gi > lastGear) shiftT = 0.14;
                lastGear = gi;
            }
            if (shiftT > 0) shiftT -= dt;
            var idle = 0.16;
            var rev =
                sp < 0.012
                    ? idle + 0.035 * Math.sin(t * 9)
                    : idle + (1 - idle) * (0.28 + 0.72 * frac);
            if (shiftT > 0) rev *= 0.7;
            revSm += (rev - revSm) * Math.min(1, dt * 15);
            var f = 30 + revSm * 268,
                load = (P0.gas ? 1 : 0.3) + P0.boosting * 0.5;
            if (mode === "formula") f *= 1.75;
            var pz = state === "paused" ? 0 : 1;

            eng.o1.frequency.setTargetAtTime(f, t, 0.02);
            eng.o2.frequency.setTargetAtTime(f * 1.004, t, 0.02);
            eng.sub.frequency.setTargetAtTime(f * 0.5, t, 0.03);
            eng.body.frequency.setTargetAtTime(f * 3.2 + 180, t, 0.05);
            eng.body.Q.setTargetAtTime(0.8 + load * 1.5, t, 0.08);
            eng.tone.frequency.setTargetAtTime(
                480 + revSm * 3300 * load,
                t,
                0.05,
            );
            eng.intakeBP.frequency.setTargetAtTime(f * 5 + 300, t, 0.05);
            eng.intake.gain.setTargetAtTime(
                0.04 + load * 0.15 * revSm,
                t,
                0.08,
            );
            eng.pre.gain.setTargetAtTime(0.32 + load * 0.46, t, 0.06);
            eng.out.gain.setTargetAtTime(
                pz * (0.15 + revSm * 0.17) * (shiftT > 0 ? 0.55 : 1),
                t,
                0.05,
            );
            eng.wind.gain.setTargetAtTime(
                pz * Math.max(0, sp - 0.3) * 0.11,
                t,
                0.12,
            );
            eng.squeal.gain.setTargetAtTime(
                pz * (P0.driftPower > 0.35 ? (P0.driftPower - 0.35) * 0.3 : 0),
                t,
                0.06,
            );
            eng.sqBP.frequency.setTargetAtTime(
                1400 + P0.driftPower * 1100 + sp * 400,
                t,
                0.08,
            );
            eng.turboG.gain.setTargetAtTime(pz * P0.boosting * 0.035, t, 0.1);
            eng.turbo.frequency.setTargetAtTime(
                2400 + sp * 3000 + boosting * 900,
                t,
                0.08,
            );
        }

        /* ── música ── */
        function burst(buf, t, dur, type, freq, Q, vol) {
            var n = AC.createBufferSource();
            n.buffer = buf;
            var f = AC.createBiquadFilter();
            f.type = type;
            f.frequency.value = freq;
            if (Q) f.Q.value = Q;
            var g = AC.createGain();
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
            n.connect(f);
            f.connect(g);
            g.connect(musicGain);
            n.start(t);
            n.stop(t + dur + 0.02);
        }
        function kick(t) {
            var o = AC.createOscillator();
            o.type = "sine";
            o.frequency.setValueAtTime(190, t);
            o.frequency.exponentialRampToValueAtTime(42, t + 0.09);
            var g = AC.createGain();
            g.gain.setValueAtTime(0.9, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            o.connect(g);
            g.connect(musicGain);
            o.start(t);
            o.stop(t + 0.34);
            burst(NB.s, t, 0.022, "highpass", 2200, 0, 0.26);
        }
        function snare(t) {
            burst(NB.m, t, 0.17, "bandpass", 1900, 0.7, 0.3);
            var o = AC.createOscillator();
            o.type = "triangle";
            o.frequency.setValueAtTime(205, t);
            o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
            var g = AC.createGain();
            g.gain.setValueAtTime(0.17, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
            o.connect(g);
            g.connect(musicGain);
            o.start(t);
            o.stop(t + 0.15);
        }
        function hat(t, open) {
            burst(
                open ? NB.m : NB.s,
                t,
                open ? 0.17 : 0.042,
                "highpass",
                7200,
                0,
                open ? 0.085 : 0.055,
            );
        }
        function bass(f, t, dur) {
            var lp = AC.createBiquadFilter();
            lp.type = "lowpass";
            lp.Q.value = 7;
            lp.frequency.setValueAtTime(f * 9, t);
            lp.frequency.exponentialRampToValueAtTime(f * 2.2, t + dur * 0.85);
            var g = AC.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.24, t + 0.012);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            lp.connect(g);
            g.connect(musicGain);
            var o = AC.createOscillator();
            o.type = "sawtooth";
            o.frequency.value = f;
            var o2 = AC.createOscillator();
            o2.type = "square";
            o2.frequency.value = f * 0.5;
            o.connect(lp);
            o2.connect(lp);
            o.start(t);
            o2.start(t);
            o.stop(t + dur + 0.05);
            o2.stop(t + dur + 0.05);
        }
        function lead(f, t, dur, vol) {
            var lp = AC.createBiquadFilter();
            lp.type = "lowpass";
            lp.frequency.value = 3600;
            lp.Q.value = 1.2;
            var g = AC.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            lp.connect(g);
            g.connect(musicGain);
            g.connect(spaceIn);
            for (var d = 0; d < 2; d++) {
                var o = AC.createOscillator();
                o.type = "sawtooth";
                o.frequency.value = f;
                o.detune.value = d ? 8 : -8;
                o.connect(lp);
                o.start(t);
                o.stop(t + dur + 0.05);
            }
        }
        function pad(fs, t, dur) {
            var lp = AC.createBiquadFilter();
            lp.type = "lowpass";
            lp.frequency.value = 1500;
            var g = AC.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.05, t + 0.35);
            g.gain.linearRampToValueAtTime(0.0001, t + dur);
            lp.connect(g);
            g.connect(musicGain);
            g.connect(spaceIn);
            for (var i = 0; i < fs.length; i++) {
                var o = AC.createOscillator();
                o.type = "sawtooth";
                o.frequency.value = fs[i];
                o.detune.value = i % 2 ? 7 : -7;
                o.connect(lp);
                o.start(t);
                o.stop(t + dur + 0.1);
            }
        }
        /* progressão de 8 compassos: Am · F · C · G · Am · F · G · E
           o E maior no fim é o empurrão da menor harmônica — marca registrada dos anos 80 */
        var ROOTS = [55.0, 43.65, 65.41, 49.0, 55.0, 43.65, 49.0, 41.2];
        var PADS = [
            [220, 261.63, 329.63],
            [174.61, 220, 261.63],
            [261.63, 329.63, 392.0],
            [196.0, 246.94, 293.66],
            [220, 261.63, 329.63],
            [174.61, 220, 261.63],
            [196.0, 246.94, 293.66],
            [164.81, 207.65, 246.94],
        ];
        /* melodia original, 8 compassos de 16 semicolcheias (0 = pausa) */
        var MEL = [
            440, 0, 523.25, 0, 659.25, 0, 587.33, 0, 523.25, 0, 0, 0, 440, 0, 0,
            0, 349.23, 0, 440, 0, 523.25, 0, 440, 0, 392.0, 0, 0, 0, 0, 0, 0, 0,
            659.25, 0, 587.33, 0, 523.25, 0, 392.0, 0, 440, 0, 0, 0, 0, 0, 0, 0,
            587.33, 0, 493.88, 0, 392.0, 0, 493.88, 0, 587.33, 0, 0, 0, 0, 0, 0,
            0, 440, 0, 523.25, 0, 659.25, 0, 880.0, 0, 783.99, 0, 659.25, 0,
            587.33, 0, 0, 0, 698.46, 0, 659.25, 0, 523.25, 0, 440, 0, 349.23, 0,
            0, 0, 0, 0, 0, 0, 392.0, 0, 493.88, 0, 587.33, 0, 783.99, 0, 698.46,
            0, 587.33, 0, 493.88, 0, 0, 0, 659.25, 0, 659.25, 0, 830.61, 0,
            987.77, 0, 659.25, 0, 0, 0, 0, 0, 0, 0,
        ];
        function scheduleMusic(state) {
            if (!AC) return;
            var t = AC.currentTime;
            if (nextNote < t) nextNote = t + 0.05;
            var guard = 0;
            while (nextNote < t + 0.25 && guard++ < 12) {
                var s16 = mstep % 16,
                    bar = Math.floor(mstep / 16) % 8,
                    pos = mstep % 128;
                if (s16 === 0) pad(PADS[bar], nextNote, 1.85);
                if (s16 % 4 === 0) kick(nextNote);
                if (s16 === 4 || s16 === 12) snare(nextNote);
                if (s16 % 2 === 1) hat(nextNote, s16 === 7 || s16 === 15);
                if (s16 % 2 === 0)
                    bass(
                        ROOTS[bar] * (s16 === 6 || s16 === 14 ? 2 : 1),
                        nextNote,
                        0.2,
                    );
                if (s16 % 2 === 1)
                    lead(
                        PADS[bar][(mstep >> 1) % 3] * 2,
                        nextNote,
                        0.09,
                        0.022,
                    ); // arpejo de fundo
                var mn = MEL[pos];
                if (mn)
                    lead(mn, nextNote, 0.3, state === "play" ? 0.078 : 0.05); // melodia
                if (bar === 7 && s16 >= 12)
                    // virada de tom
                    burst(
                        NB.s,
                        nextNote,
                        0.06,
                        "bandpass",
                        380 + (s16 - 12) * 270,
                        1.2,
                        0.24,
                    );
                nextNote += 0.1153;
                mstep++; // ~130 BPM
            }
        }

        function sfxCrash() {
            if (!AC) return;
            var t = AC.currentTime;
            var n = AC.createBufferSource();
            n.buffer = NB.m;
            var f = AC.createBiquadFilter();
            f.type = "lowpass";
            f.frequency.setValueAtTime(2800, t);
            f.frequency.exponentialRampToValueAtTime(180, t + 0.4);
            var g = AC.createGain();
            g.gain.setValueAtTime(0.7, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
            n.connect(f);
            f.connect(g);
            g.connect(sfxGain);
            g.connect(spaceIn);
            n.start(t);
            n.stop(t + 0.5);
            var o = AC.createOscillator();
            o.type = "square";
            o.frequency.setValueAtTime(120, t);
            o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
            var og = AC.createGain();
            og.gain.setValueAtTime(0.35, t);
            og.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
            o.connect(og);
            og.connect(sfxGain);
            o.start(t);
            o.stop(t + 0.32);
        }
        function sfxCheckpoint() {
            if (!AC) return;
            var t = AC.currentTime,
                n = [880, 1174.7, 1760];
            for (var i = 0; i < 3; i++) {
                var o = AC.createOscillator();
                o.type = "square";
                o.frequency.value = n[i];
                var g = AC.createGain();
                g.gain.setValueAtTime(0.0001, t + i * 0.1);
                g.gain.exponentialRampToValueAtTime(0.22, t + i * 0.1 + 0.01);
                g.gain.exponentialRampToValueAtTime(
                    0.0001,
                    t + i * 0.1 + (i === 2 ? 0.34 : 0.16),
                );
                o.connect(g);
                g.connect(sfxGain);
                g.connect(spaceIn);
                o.start(t + i * 0.1);
                o.stop(t + i * 0.1 + 0.4);
            }
        }

        // Chamar em um gesto do usuário; capturar exceções/rejeições no caller.
        function start() {
            initAudio();
            if (AC.state === "suspended") return AC.resume();
        }

        function update(dt, snapshot) {
            if (!AC) return;
            scheduleMusic(snapshot.state);
            updateEngine(dt, snapshot);
        }

        function setMuted(m) {
            muted = !!m;
            if (AC && master)
                master.gain.setTargetAtTime(
                    muted ? 0 : 0.5,
                    AC.currentTime,
                    0.05,
                );
        }

        return {
            start: start,
            update: update,
            setMuted: setMuted,
            crash: sfxCrash,
            checkpoint: sfxCheckpoint,
            get muted() {
                return muted;
            },
        };
    };
})();
