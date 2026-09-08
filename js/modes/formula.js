(function (ND) {
    "use strict";

    var LAP_COUNT = 3,
        TOTAL = 12;

    function configure(world, difficulty) {
        var maxSpeed = 25000;
        return {
            maxSpeed: maxSpeed,
            difficulty: Object.assign({}, difficulty, {
                time: 0,
                nitro: 3,
                start: 3,
                grip: 1.2,
                cent: 0.2,
            }),
            accelRate: maxSpeed / 3.4,
            brakeRate: -maxSpeed / 1.35,
            decelRate: -maxSpeed / 6.5,
            offRoadDecel: -maxSpeed / 2.2,
            offRoadLimit: maxSpeed / 3.6,
            steerResp: 1.65,
        };
    }

    // elapsed é SEMPRE o início do passo, não o relógio já incrementado.
    function advance(p, moved, dt, elapsed, world) {
        if (p.finished) return { moved: 0, dt: 0, checkpoints: 0, laps: 0 };
        var length = world.trackLength,
            finish = length * LAP_COUNT;
        var before = p.distance,
            actual = Math.min(moved, Math.max(0, finish - before));
        var end = Math.min(finish, before + actual),
            crossed = 0;
        for (
            var lap = Math.floor(before / length) + 1;
            lap <= LAP_COUNT && lap * length <= end;
            lap++
        ) {
            var crossing =
                elapsed +
                (moved > 0 ? (dt * (lap * length - before)) / moved : 0);
            p.lastLap = crossing - p.lapStarted;
            if (!p.bestLap || p.lastLap < p.bestLap) p.bestLap = p.lastLap;
            p.lapStarted = crossing;
            p.nitroCharges = Math.min(3, p.nitroCharges + 1);
            crossed++;
        }
        p.distance = end;
        p.laps = Math.min(LAP_COUNT, Math.floor(end / length) + 1);
        var activeDt = moved > 0 ? (dt * actual) / moved : dt;
        if (end >= finish) {
            p.finished = true;
            p.finishTime = elapsed + (moved > 0 ? activeDt : 0);
        }
        return { moved: actual, dt: activeDt, checkpoints: 0, laps: crossed };
    }

    function formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return "--:--.---";
        var ms = Math.floor(seconds * 1000);
        return (
            Math.floor(ms / 60000) +
            ":" +
            String(Math.floor(ms / 1000) % 60).padStart(2, "0") +
            "." +
            String(ms % 1000).padStart(3, "0")
        );
    }

    // Puro: não ordena o array do caller nem atribui rank nos objetos de física.
    function standings(racers) {
        return racers
            .map(function (r) {
                return Object.assign({}, r);
            })
            .sort(function (a, b) {
                if (a.finished !== b.finished) return a.finished ? -1 : 1;
                if (a.finished)
                    return a.finishTime - b.finishTime || a.racerID - b.racerID;
                return b.distance - a.distance || a.racerID - b.racerID;
            })
            .map(function (r, i) {
                r.rank = i + 1;
                r.status = r.finished ? formatTime(r.finishTime) : "EM PISTA";
                return r;
            });
    }

    function results(race, table) {
        var humans = table.filter(function (r) {
                return r.isPlayer;
            }),
            winner = humans[0];
        var circuit = race.world.circuit;
        var rows = table.map(function (r) {
            return {
                label: r.finished ? r.rank + "º · " + r.label : r.label,
                value: r.finished
                    ? formatTime(r.finishTime) +
                      " · Melhor " +
                      formatTime(r.bestLap > 0 ? r.bestLap : null)
                    : "EM PISTA",
            };
        });
        humans.forEach(function (r) {
            rows.push({
                label: r.label + " · ÚLTIMA VOLTA",
                value: formatTime(r.lastLap > 0 ? r.lastLap : null),
            });
        });
        return {
            title: "BANDEIRADA",
            subtitle:
                winner.label +
                (humans.length > 1
                    ? " · VENCEDOR ENTRE JOGADORES"
                    : " · RESULTADO"),
            headline: winner.rank + "º / " + TOTAL,
            details:
                (circuit ? circuit.name + " · " : "") +
                "Tempo " +
                formatTime(winner.finishTime) +
                " · Melhor volta " +
                formatTime(winner.bestLap > 0 ? winner.bestLap : null),
            rows: rows,
        };
    }

    ND.modes = ND.modes || {};
    ND.modes.formula = {
        id: "formula",
        countdown: 3,
        lapCount: LAP_COUNT,
        total: TOTAL,
        configure: configure,
        advance: advance,
        formatTime: formatTime,
        standings: standings,
        results: results,
        isOver: function (players) {
            return players.every(function (p) {
                return p.finished;
            });
        },
    };
})(window.NeonDrive);
