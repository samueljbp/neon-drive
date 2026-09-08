(function (ND) {
    "use strict";

    // Depende apenas dos utilitários originais e dos contratos de world/modes.
    // position é a posição FÍSICA; o main subtrai cameraOffset só no render.
    ND.createRace = function (world, SPR, settings, sfx) {
        var U = ND.util,
            PI = U.PI,
            clamp = U.clamp,
            lerp = U.lerp;
        var rand = U.rand,
            increase = U.increase;
        settings = settings || {};
        sfx = sfx || {};
        var mode =
            settings.mode === "formula" ? ND.modes.formula : ND.modes.classic;
        var numPlayers = settings.numPlayers === 2 ? 2 : 1;
        var diffIndex = Number.isInteger(settings.difficulty)
            ? clamp(settings.difficulty, 0, 2)
            : 1;
        var livery = Number.isInteger(settings.livery)
            ? ((settings.livery % 3) + 3) % 3
            : 0;
        var physics = mode.configure(world, ND.difficulties[diffIndex]);
        var DF = physics.difficulty,
            maxSpeed = physics.maxSpeed;
        var bestScore = 0,
            finalStandings = null,
            grazed = new Map();
        var race = {
            world: world,
            players: [],
            mode: mode.id,
            maxSpeed: maxSpeed,
            difficulty: DF,
            nitroMax: DF.nitro,
            countdown: mode.countdown,
            elapsed: 0,
            state: "menu",
            reset: reset,
            update: update,
            isOver: isOver,
            standings: standings,
            hudFor: hudFor,
            results: results,
        };

        function sound(name) {
            if (!settings.muted && typeof sfx[name] === "function") sfx[name]();
        }

        function readControl(input) {
            input = input || {};
            var brake = !!input.brake;
            return {
                left: !!input.left,
                right: !!input.right,
                gas: !!input.gas && !brake,
                brake: brake,
                nitro: !!input.nitro,
                drift: !!input.drift,
                gasA: Number.isFinite(input.gasA)
                    ? clamp(input.gasA, 0, 1)
                    : input.gas
                      ? 1
                      : 0,
                brakeA: Number.isFinite(input.brakeA)
                    ? clamp(input.brakeA, 0, 1)
                    : brake
                      ? 1
                      : 0,
            };
        }

        function mkPlayer(index) {
            var angles =
                mode.id === "formula"
                    ? SPR.formulaPlayers[(livery + index) % 3]
                    : SPR.playerAngles;
            return {
                racerID: index,
                playerIndex: index,
                isPlayer: true,
                label: "JOGADOR " + (index + 1),
                spriteAngles: angles,
                sprite: angles[Math.floor(angles.length / 2)],
                position: 0,
                playerX:
                    numPlayers === 2
                        ? index
                            ? 0.46
                            : -0.46
                        : mode.id === "formula"
                          ? -0.46
                          : 0,
                speed: 0,
                driftAngle: 0,
                driftPower: 0,
                boosting: 0,
                boostT: 0,
                nitroCharges: DF.start,
                nitroLatch: 0,
                score: 0,
                combo: 1,
                comboTimer: 0,
                distance: 0,
                laps: 1,
                timeLeft: DF.time,
                checkpoint: 0,
                checkpointFlash: 0,
                dayPhase: world.circuit ? world.circuit.phase : 0.02,
                dead: 0,
                shake: 0,
                flash: 0,
                crashCool: 0,
                railSfx: 0,
                visYaw: 0,
                fovDyn: 0,
                cameraDepth: 1 / Math.tan((50 * PI) / 180),
                bgX: 0,
                bgY: 0,
                sunOffset: 0,
                curBiome: 0,
                horizonY: 0,
                gas: 0,
                particles: [],
                sparks: [],
                floats: [],
                ctrl: readControl(),
                finishTime: null,
                lastLap: 0,
                lapFlash: 0,
                bestLap: 0,
                lapStarted: 0,
                finished: false,
                rank: index + 1,
            };
        }

        function reset() {
            race.players = [];
            race.countdown = mode.countdown;
            race.elapsed = 0;
            race.state = "menu";
            finalStandings = null;
            grazed.clear();
            for (var i = 0; i < numPlayers; i++) race.players.push(mkPlayer(i));
            world.pickups.forEach(function (pk) {
                pk.taken = 0;
                pk.t = 0;
            });
            // world cria 12 - numPlayers IAs no modo Fórmula.
            world.resetTraffic(diffIndex, numPlayers);
            if (mode.id === "formula")
                world.traffic.forEach(function (car, index) {
                    car.racerID = numPlayers + index;
                    car.z = increase(0, Math.max(0, car.z), world.trackLength);
                    car.distance = car.z;
                    car.speed = 0;
                    car.finished = false;
                    car.finishTime = null;
                    car.laps = 1;
                    car.lastLap = 0;
                    car.bestLap = 0;
                    car.lapStarted = 0;
                });
            world.syncTraffic();
            assignRanks();
            return race;
        }

        function autoDrive(p) {
            var seg = world.findSegment(p.position);
            return readControl({
                gas: true,
                gasA: 1,
                left: p.playerX > seg.curve * 0.1 + 0.02,
                right: p.playerX < seg.curve * 0.1 - 0.02,
            });
        }

        function addSmoke(p) {
            p.particles.push({
                x: rand(0.32, 0.68),
                y: rand(0.86, 0.94),
                vx: rand(-0.1, 0.1),
                vy: rand(-0.05, -0.14),
                life: 1,
                size: rand(0.02, 0.055),
                type: 0,
            });
        }
        function addDust(p, side) {
            p.particles.push({
                x: 0.5 + side * rand(0.16, 0.28),
                y: rand(0.87, 0.95),
                vx: side * rand(0.05, 0.22),
                vy: rand(-0.1, -0.24),
                life: 1,
                size: rand(0.012, 0.032),
                type: 1,
            });
        }
        function addSpark(p) {
            p.sparks.push({
                x: 0.5 + rand(-0.1, 0.1),
                y: rand(0.72, 0.86),
                vx: rand(-0.55, 0.55),
                vy: rand(-0.75, 0.15),
                life: 1,
                size: rand(1.5, 4.2),
            });
        }
        function addFloat(p, txt) {
            p.floats.push({
                txt: txt,
                life: 1,
                y: 0.6,
                x: 0.5 + rand(-0.08, 0.08),
            });
        }
        function resetCombo(p) {
            p.combo = 1;
            p.comboTimer = 0;
            p.driftPower = 0;
        }
        function sparks(p, count) {
            for (var i = 0; i < count; i++) addSpark(p);
        }

        function updateParticles(p, dt) {
            var i, particle;
            for (i = p.particles.length - 1; i >= 0; i--) {
                particle = p.particles[i];
                particle.x += particle.vx * dt;
                particle.y += particle.vy * dt;
                particle.vy += dt * 0.06;
                particle.size += dt * 0.045;
                particle.life -= dt * (particle.type ? 1.6 : 1.1);
                if (particle.life <= 0) p.particles.splice(i, 1);
            }
            for (i = p.sparks.length - 1; i >= 0; i--) {
                particle = p.sparks[i];
                particle.x += particle.vx * dt;
                particle.y += particle.vy * dt;
                particle.vy += dt * 1.5;
                particle.life -= dt * 1.5;
                if (particle.life <= 0) p.sparks.splice(i, 1);
            }
            for (i = p.floats.length - 1; i >= 0; i--) {
                p.floats[i].life -= dt * 0.8;
                p.floats[i].y -= dt * 0.05;
                if (p.floats[i].life <= 0) p.floats.splice(i, 1);
            }
            if (p.particles.length > 170)
                p.particles.splice(0, p.particles.length - 170);
        }

        function drive(p, dt, demo) {
            var ctrl = p.ctrl,
                seg = world.findSegment(p.position),
                sp = p.speed / maxSpeed;
            var dx = dt * 2.1 * sp;
            p.curBiome = seg.biome;
            p.gas = ctrl.gas ? ctrl.gasA : 0;
            if (ctrl.nitro) {
                if (
                    !p.nitroLatch &&
                    p.boostT <= 0 &&
                    p.nitroCharges > 0 &&
                    p.speed > maxSpeed * 0.2
                ) {
                    p.nitroCharges--;
                    p.boostT = physics.boostDuration || 2.4;
                }
                p.nitroLatch = 1;
            } else p.nitroLatch = 0;
            if (p.boostT > 0) {
                p.boostT = Math.max(0, p.boostT - dt);
                p.boosting = Math.min(1, p.boosting + dt * 5);
            } else p.boosting = Math.max(0, p.boosting - dt * 2.2);
            var topSpeed = maxSpeed * (1 + p.boosting * 0.35);
            if (ctrl.gas)
                p.speed +=
                    physics.accelRate *
                    dt *
                    (1 + p.boosting * 0.9) *
                    (0.25 + 0.75 * ctrl.gasA);
            else if (ctrl.brake)
                p.speed += physics.brakeRate * dt * (0.25 + 0.75 * ctrl.brakeA);
            else p.speed += physics.decelRate * dt;

            var steer = ctrl.right ? 1 : ctrl.left ? -1 : 0;
            p.playerX +=
                steer *
                dx *
                physics.steerResp *
                DF.grip *
                (ctrl.drift ? 0.55 : 1);
            p.playerX -= dx * sp * seg.curve * DF.cent;
            var wantDrift =
                Math.abs(steer) > 0 &&
                sp > 0.42 &&
                (ctrl.drift || Math.abs(seg.curve) > 3.4);
            if (wantDrift) {
                p.driftPower = Math.min(1, p.driftPower + dt * 1.5);
                p.driftAngle = lerp(
                    p.driftAngle,
                    steer * 0.3 * p.driftPower,
                    Math.min(1, dt * 6),
                );
                if (ctrl.drift) p.speed -= maxSpeed * 0.11 * dt;
            } else {
                p.driftPower = Math.max(0, p.driftPower - dt * 2.2);
                p.driftAngle = lerp(
                    p.driftAngle,
                    -seg.curve * 0.012 * sp,
                    Math.min(1, dt * 5),
                );
            }
            if (Math.abs(p.playerX) > 1 && p.speed > physics.offRoadLimit) {
                p.speed += physics.offRoadDecel * dt;
                p.shake = Math.min(1, p.shake + dt * 3.2);
                if (Math.random() < 0.5) addDust(p, rand(-1, 1));
            }
            p.playerX = clamp(p.playerX, -2.4, 2.4);
            p.railSfx = Math.max(0, p.railSfx - dt);
            if (Math.abs(p.playerX) > 1.12) {
                p.playerX = (p.playerX > 0 ? 1 : -1) * 1.12;
                if (p.speed > maxSpeed * 0.08) {
                    p.speed -= p.speed * Math.min(0.55, dt * 3.4);
                    p.shake = Math.max(p.shake, 0.75);
                    p.flash = Math.max(p.flash, 0.22);
                    if (!demo) resetCombo(p);
                    sparks(p, 3);
                    if (p.railSfx <= 0) {
                        if (!demo) sound("crash");
                        p.railSfx = 0.6;
                    }
                }
            }
            p.speed = clamp(p.speed, 0, topSpeed);
            p.crashCool = Math.max(0, p.crashCool - dt);
            return { seg: seg, sp: sp, moved: p.speed * dt };
        }

        // Diferença circular assinada: inclui veículos logo ATRÁS da linha zero.
        function relative(z, position) {
            var length = world.trackLength;
            return increase(0, z - position + length / 2, length) - length / 2;
        }

        function collisions(p, dt) {
            var win = world.SEGLEN * 1.1 + p.speed * dt;
            var halfWidth = world.vehicleHalfWidth(p.sprite);
            // IAs não sofrem mutações nesta fase; cada humano vê o mesmo tráfego.
            world.traffic.forEach(function (car) {
                if (car.finished) return;
                var rel = relative(car.z, p.position),
                    marks = grazed.get(car);
                if (!marks) {
                    marks = [];
                    grazed.set(car, marks);
                }
                if (Math.abs(rel) > world.SEGLEN * 40) marks[p.racerID] = false;
                if (Math.abs(rel) > win) return;
                var d = Math.abs(p.playerX - car.offset);
                var contactW = halfWidth + world.vehicleHalfWidth(car.sprite);
                if (d < contactW) {
                    if (p.crashCool <= 0 && p.speed > car.speed * 0.55) {
                        p.speed *= DF.crash;
                        p.crashCool = 0.9;
                        p.shake = 1;
                        p.flash = 0.7;
                        resetCombo(p);
                        p.playerX += p.playerX > car.offset ? 0.3 : -0.3;
                        sparks(p, 26);
                        sound("crash");
                    }
                } else if (
                    mode.id === "classic" &&
                    d < contactW + 0.16 &&
                    p.speed > car.speed &&
                    p.crashCool <= 0
                ) {
                    if (!marks[p.racerID]) {
                        marks[p.racerID] = true;
                        p.combo = Math.min(9, p.combo + 1);
                        p.comboTimer = 2.2;
                        p.score += 120 * p.combo;
                        addFloat(p, "QUASE! x" + p.combo);
                    }
                }
                if (d > 0.9) marks[p.racerID] = false;
            });
            var segments = world.segments,
                pSeg = world.findSegment(p.position);
            var span = Math.ceil(win / world.SEGLEN) + 1;
            // Visita cada segmento no máximo uma vez, mesmo em pistas curtas.
            var count = Math.min(segments.length, span * 2 + 1);
            for (var i = 0; i < count; i++) {
                var index =
                    (((pSeg.index - span + i) % segments.length) +
                        segments.length) %
                    segments.length;
                var seg = segments[index];
                if (
                    Math.abs(relative(seg.index * world.SEGLEN, p.position)) >
                    win
                )
                    continue;
                for (var j = 0; j < seg.sprites.length; j++) {
                    var ob = seg.sprites[j];
                    if (ob.pk) {
                        if (
                            !ob.pk.taken &&
                            Math.abs(p.playerX - ob.offset) <
                                halfWidth +
                                    (ob.sprite.worldW * 0.35) / world.ROADW
                        ) {
                            ob.pk.taken = 1;
                            ob.pk.t = 16;
                            p.nitroCharges = Math.min(
                                DF.nitro,
                                p.nitroCharges + 1,
                            );
                            if (mode.id === "classic") p.score += 500;
                            addFloat(p, "NITRO +1");
                            sound("checkpoint");
                        }
                        continue;
                    }
                    if (!ob.hitW || p.crashCool > 0) continue;
                    if (Math.abs(p.playerX - ob.offset) < ob.hitW + halfWidth) {
                        resetCombo(p);
                        if (ob.hard) {
                            p.speed *= DF.crash * 0.65;
                            p.crashCool = 1;
                            p.shake = 1;
                            p.flash = 0.85;
                            p.playerX += p.playerX > 0 ? -0.24 : 0.24;
                            sparks(p, 30);
                            sound("crash");
                        } else {
                            p.speed -= p.speed * 0.32;
                            p.shake = Math.max(p.shake, 0.7);
                            p.flash = Math.max(p.flash, 0.26);
                            p.playerX += p.playerX > 0 ? -0.06 : 0.06;
                            sparks(p, 6);
                            if (p.railSfx <= 0) {
                                sound("crash");
                                p.railSfx = 0.55;
                            }
                        }
                        break;
                    }
                }
                if (p.crashCool > 0) break;
            }
            p.playerX = clamp(p.playerX, -1.12, 1.12);
        }

        function effects(p, dt, step) {
            var ctrl = p.ctrl,
                seg = step.seg,
                sp = step.sp;
            p.visYaw = lerp(
                p.visYaw,
                clamp(
                    (ctrl.right ? 1 : 0) -
                        (ctrl.left ? 1 : 0) +
                        p.driftAngle * 2.6,
                    -1,
                    1,
                ),
                Math.min(1, dt * 8),
            );
            p.shake = Math.max(0, p.shake - dt * 2.4);
            p.flash = Math.max(0, p.flash - dt * 2.6);
            p.checkpointFlash = Math.max(0, p.checkpointFlash - dt);
            p.lapFlash = Math.max(0, p.lapFlash - dt);
            p.fovDyn = lerp(
                p.fovDyn,
                sp * 0.7 + p.boosting * 0.7,
                Math.min(1, dt * 3),
            );
            p.cameraDepth =
                1 / Math.tan((((100 + p.fovDyn * 20) / 2) * PI) / 180);
            p.bgX -= seg.curve * sp * dt * 280;
            p.bgY = lerp(
                p.bgY,
                clamp(seg.p1.world.y / 9000, -1, 1),
                Math.min(1, dt * 2.5),
            );
            p.sunOffset = lerp(
                p.sunOffset,
                clamp(-seg.curve * 0.055 * sp, -0.3, 0.3),
                Math.min(1, dt * 1.5),
            );
            if (p.driftPower > 0.35 && sp > 0.4 && Math.random() < 0.85)
                addSmoke(p);
            updateParticles(p, dt);
        }

        function updateTraffic(dt, demo) {
            // A prévia avança apenas a posição visual, sem reescrever progresso.
            world.updateTraffic(dt, {
                maxSpeed: maxSpeed,
                elapsed: race.elapsed,
                mode: mode.id,
                demo: demo,
                players: mode.id === "formula" && !demo ? race.players : [],
            });
        }

        function update(dt, controls, demo) {
            if (
                !Number.isFinite(dt) ||
                dt <= 0 ||
                race.state === "paused" ||
                race.state === "over"
            )
                return;
            demo = !!demo;
            if (race.state !== "play" && !(race.state === "menu" && demo))
                return;
            if (isOver()) return;
            if (!demo && race.countdown > 0) {
                var waiting = Math.min(dt, race.countdown);
                race.countdown = Math.max(0, race.countdown - waiting);
                dt -= waiting;
                if (dt <= 0) return;
            }
            world.pickups.forEach(function (pk) {
                if (pk.taken) {
                    pk.t = Math.max(0, pk.t - dt);
                    if (pk.t <= 0) pk.taken = 0;
                }
            });
            updateTraffic(dt, demo);
            race.players.forEach(function (p, index) {
                if (p.finished || p.dead) return;
                if (!demo && mode.id === "classic" && p.timeLeft <= 0) {
                    p.timeLeft = 0;
                    p.dead = 1;
                    return;
                }
                var input =
                    typeof controls === "function"
                        ? controls(index)
                        : Array.isArray(controls)
                          ? controls[index]
                          : index === 0
                            ? controls
                            : null;
                p.ctrl = demo ? autoDrive(p) : readControl(input);
                var step = drive(p, dt, demo);
                var progress = demo
                    ? { moved: step.moved, dt: dt, checkpoints: 0, laps: 0 }
                    : mode.advance(p, step.moved, dt, race.elapsed, world, DF);
                // Elimina resíduos de ponto flutuante acumulados nas voltas.
                p.position = p.finished
                    ? world.startLineZ
                    : increase(p.position, progress.moved, world.trackLength);
                p.dayPhase = increase(
                    p.dayPhase,
                    progress.moved / (world.trackLength * 1.85),
                    1,
                );
                if (!demo) {
                    if (!p.finished && !p.dead) collisions(p, progress.dt);
                    if (mode.id === "classic") {
                        p.score +=
                            progress.moved * 0.008 * p.combo * (1 + p.boosting);
                        if (p.comboTimer > 0) {
                            p.comboTimer = Math.max(
                                0,
                                p.comboTimer - progress.dt,
                            );
                            if (p.comboTimer <= 0) p.combo = 1;
                        }
                        if (p.driftPower > 0.5)
                            p.score += progress.dt * 90 * p.driftPower;
                    }
                    for (var cp = 0; cp < progress.checkpoints; cp++)
                        sound("checkpoint");
                    if (progress.laps) {
                        sound("checkpoint");
                        if (mode.id === "formula" && !p.finished)
                            p.lapFlash = 2.4;
                    }
                }
                effects(p, progress.dt, step);
            });
            if (!demo) {
                race.elapsed += dt;
                var table = assignRanks();
                if (isOver()) finalStandings = table;
                race.players.forEach(function (p) {
                    bestScore = Math.max(bestScore, p.score);
                });
            }
        }

        function isOver() {
            return mode.isOver(race.players);
        }

        function entry(r, index, human) {
            return {
                racerID: human ? r.racerID : numPlayers + index,
                playerIndex: human ? r.playerIndex : null,
                isPlayer: human,
                label: human ? r.label : r.name || "PILOTO IA " + (index + 1),
                distance: human ? r.distance : r.progress,
                score: r.score || 0,
                laps: r.laps || 1,
                dead: !!r.dead,
                finished: !!r.finished,
                finishTime: r.finishTime == null ? null : r.finishTime,
                lastLap: r.lastLap || 0,
                bestLap: r.bestLap || 0,
                rank: r.rank,
            };
        }
        function standings() {
            if (finalStandings)
                return finalStandings.map(function (r) {
                    return Object.assign({}, r);
                });
            var racers = race.players.map(function (p, i) {
                return entry(p, i, true);
            });
            if (mode.id === "formula")
                racers = racers.concat(
                    world.traffic.map(function (c, i) {
                        return entry(c, i, false);
                    }),
                );
            return mode.standings(racers);
        }
        function assignRanks() {
            var table = standings();
            table.forEach(function (r) {
                var racer = r.isPlayer
                    ? race.players[r.playerIndex]
                    : world.traffic[r.racerID - numPlayers];
                // A posição de quem chegou só é publicada após ordenar TODAS as
                // chegadas deste passo pela fração de tempo, nunca pela ordem P1/P2.
                if (racer.rank !== r.rank) racer.rank = r.rank;
            });
            return table;
        }
        function hudFor(index) {
            var p = race.players[index];
            if (!p) return null;
            return {
                elapsed: p.finished ? p.finishTime : race.elapsed,
                countdown: race.countdown,
                lapCount: world.lapCount,
                rank: p.rank,
                total: mode.total || numPlayers,
                finished: p.finished,
                finishTime: p.finishTime,
                bestLap: p.bestLap,
                lastLap: p.lastLap,
                sectorName: world.findSegment(p.position).section,
                circuit: world.circuit,
            };
        }
        function results() {
            return mode.results(race, standings(), bestScore);
        }

        return reset();
    };
})(window.NeonDrive);
