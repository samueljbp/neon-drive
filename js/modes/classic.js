(function (ND) {
    "use strict";

    // Valores do DIFFS original, sem configuração de UI ou persistência.
    ND.difficulties = [
        {
            name: "FÁCIL",
            time: 95,
            cp: 22,
            cars: 44,
            tmin: 5000,
            tmax: 9000,
            nitro: 4,
            start: 2,
            crash: 0.45,
            cent: 0.24,
            grip: 1.18,
        },
        {
            name: "MÉDIO",
            time: 80,
            cp: 15,
            cars: 62,
            tmin: 6200,
            tmax: 11500,
            nitro: 3,
            start: 1,
            crash: 0.3,
            cent: 0.32,
            grip: 1.0,
        },
        {
            name: "DIFÍCIL",
            time: 62,
            cp: 11,
            cars: 86,
            tmin: 7200,
            tmax: 13500,
            nitro: 2,
            start: 1,
            crash: 0.18,
            cent: 0.4,
            grip: 0.88,
        },
    ];

    function configure(world, difficulty) {
        var maxSpeed = world.SEGLEN * 105;
        return {
            maxSpeed: maxSpeed,
            difficulty: Object.assign({}, difficulty),
            accelRate: maxSpeed / 5.2,
            brakeRate: -maxSpeed / 1.9,
            decelRate: -maxSpeed / 6.5,
            offRoadDecel: -maxSpeed / 2.2,
            offRoadLimit: maxSpeed / 3.6,
            steerResp: 1.65,
        };
    }

    // Consome o relógio em ordem cronológica: um checkpoint posterior à morte
    // não pode ressuscitar o jogador, mesmo num passo que cruza vários setores.
    function advance(p, moved, dt, elapsed, world, difficulty) {
        if (p.dead || p.timeLeft <= 0) {
            p.dead = 1;
            p.timeLeft = 0;
            return { moved: 0, dt: 0, checkpoints: 0, laps: 0 };
        }
        var before = p.distance,
            quarter = world.trackLength / 4;
        var next = Math.max(p.checkpoint + 1, Math.floor(before / quarter) + 1);
        var end = before + moved,
            spent = 0,
            checkpoints = 0;
        while (moved > 0 && next * quarter <= end) {
            var crossing = (dt * (next * quarter - before)) / moved;
            var interval = crossing - spent;
            if (p.timeLeft <= interval) break;
            p.timeLeft += difficulty.cp - interval;
            spent = crossing;
            p.checkpoint = next++;
            p.checkpointFlash = 1.6;
            p.score += 2500;
            checkpoints++;
        }
        var activeDt = dt;
        if (p.timeLeft <= dt - spent) {
            activeDt = spent + p.timeLeft;
            p.timeLeft = 0;
            p.dead = 1;
        } else p.timeLeft -= dt - spent;
        var actual = moved * (activeDt / dt);
        p.distance = before + actual;
        p.laps = Math.floor(p.distance / world.trackLength) + 1;
        return {
            moved: actual,
            dt: activeDt,
            checkpoints: checkpoints,
            laps: 0,
        };
    }

    function standings(racers) {
        return racers
            .map(function (r) {
                return Object.assign({}, r);
            })
            .sort(function (a, b) {
                return b.score - a.score || a.racerID - b.racerID;
            })
            .map(function (r, i) {
                r.rank = i + 1;
                return r;
            });
    }

    function results(race, table, bestScore) {
        var winner = table[0],
            score = Math.floor(winner.score);
        return {
            title: "FIM DE CORRIDA",
            subtitle:
                table.length > 1 ? winner.label + " VENCEU" : "PONTUAÇÃO FINAL",
            headline: String(score).padStart(8, "0"),
            details:
                (winner.distance / 100000).toFixed(2) +
                " km · Volta " +
                winner.laps,
            rows: table
                .map(function (r) {
                    return {
                        label: r.label,
                        value:
                            Math.floor(r.score) +
                            " pontos · " +
                            (r.distance / 100000).toFixed(2) +
                            " km",
                    };
                })
                .concat([
                    {
                        label: "RECORDE DA SESSÃO",
                        value: String(Math.floor(bestScore)),
                    },
                ]),
        };
    }

    ND.modes = ND.modes || {};
    ND.modes.classic = {
        id: "classic",
        countdown: 0,
        lapCount: 0,
        configure: configure,
        advance: advance,
        standings: standings,
        results: results,
        isOver: function (players) {
            return players.every(function (p) {
                return !!p.dead;
            });
        },
    };
})(window.NeonDrive);
