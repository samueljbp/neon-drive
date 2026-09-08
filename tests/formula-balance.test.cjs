const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const scripts = [
    "core/utils",
    "modes/classic",
    "world/circuits",
    "modes/formula",
    "world/formula-ai",
    "world/track",
    "core/race",
].map((name) => {
    const file = path.join(root, "js", name + ".js");
    return new vm.Script(fs.readFileSync(file, "utf8"), { filename: file });
});
const DT = 1 / 60;

function setup(circuit, difficulty, seed) {
    const context = vm.createContext({ console });
    context.window = context;
    vm.runInContext("Math", context).random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 2 ** 32;
    };
    scripts.forEach((script) => script.runInContext(context));
    const ND = context.NeonDrive;
    const sprite = { bodyW: 900, worldW: 900 };
    const SPR = {
        formulaCars: Array(6).fill(sprite),
        formulaPlayers: Array.from({ length: 3 }, () => Array(7).fill(sprite)),
        pines: [sprite],
        towers: [sprite],
        palms: [sprite],
        lamp: sprite,
        circuitDecor: {
            grandstand: sprite,
            pit: sprite,
            barrier: sprite,
            banner: sprite,
            brakeBoard: { 150: sprite, 100: sprite, 50: sprite },
        },
    };
    const settings = { mode: "formula", circuit, difficulty, numPlayers: 1 };
    const world = ND.createWorld(SPR, settings);
    const referenceWorld = ND.createWorld(SPR, settings);
    const reference = ND.createRace(referenceWorld, SPR, settings);
    // Referência otimista: jogador em pista livre, sem colisões com a IA.
    // Mantém a física real, inclusive direção, nitro, recarga e contagem de voltas.
    referenceWorld.traffic = [];
    referenceWorld.syncTraffic();
    reference.state = "play";
    reference.countdown = 0;
    return { ND, world, reference, referenceWorld };
}

function benchmark(circuit, difficulty, seed, nitro) {
    const { world, reference, referenceWorld } = setup(
        circuit,
        difficulty,
        seed,
    );
    const p = reference.players[0];
    let firstLead = null;
    const ranks = {};
    for (let tick = 0; tick < 5400; tick++) {
        world.updateTraffic(DT, {
            mode: "formula",
            maxSpeed: reference.maxSpeed,
            elapsed: tick * DT,
        });
        reference.update(DT, [
            {
                gas: true,
                gasA: 1,
                left: p.playerX > 0.04,
                right: p.playerX < -0.04,
                nitro:
                    nitro &&
                    p.speed > reference.maxSpeed * 0.2 &&
                    p.boostT <= 0 &&
                    !p.nitroLatch,
            },
        ]);
        assert.ok(
            Math.abs(p.playerX) < 1,
            "Referência não pode perder tempo fora da pista",
        );
        const rank =
            1 +
            world.traffic.filter((car) =>
                car.finished
                    ? !p.finished || car.finishTime < p.finishTime
                    : car.progress > p.distance,
            ).length;
        if (rank === 1 && firstLead === null) firstLead = (tick + 1) * DT;
        if ([180, 300, 600].includes(tick + 1)) ranks[(tick + 1) / 60] = rank;
        if (p.finished && world.traffic.every((car) => car.finished)) break;
    }
    assert.ok(
        p.finished && world.traffic.every((car) => car.finished),
        "Todos devem terminar",
    );
    return {
        firstLead,
        ranks,
        playerTime: p.finishTime,
        leaderTime: Math.min(...world.traffic.map((car) => car.finishTime)),
        lastTime: Math.max(...world.traffic.map((car) => car.finishTime)),
        // Confirma que o circuito e as regras do jogador não foram encurtados.
        distance: p.distance,
        raceLength: referenceWorld.trackLength * 3,
    };
}

for (let circuit = 0; circuit < 4; circuit++) {
    test(`F1 circuito ${circuit}: largada disputada e ritmo competitivo por dificuldade`, (t) => {
        for (const seed of [1, 0x4e454f4e, 0xdeadbeef]) {
            const runs = [0, 1, 2].map((difficulty) =>
                benchmark(circuit, difficulty, seed, false),
            );
            for (const [difficulty, run] of runs.entries()) {
                t.diagnostic(
                    JSON.stringify({ circuit, seed, difficulty, ...run }),
                );
                assert.equal(run.distance, run.raceLength);
                assert.ok(
                    run.ranks[3] >= 3,
                    "Acelerar sozinho não deve varrer o grid na largada",
                );
                assert.ok(
                    run.ranks[5] >= 2,
                    "Deve restar disputa pela liderança após cinco segundos",
                );
                if (difficulty > 0) {
                    assert.ok(
                        run.leaderTime < run.playerTime,
                        "Médio/difícil devem exigir mais que acelerar sem nitro numa volta limpa",
                    );
                    assert.ok(
                        run.leaderTime < runs[difficulty - 1].leaderTime,
                        "Aumentar dificuldade deve melhorar o ritmo do líder, não só mudar o rótulo",
                    );
                }
            }
        }
    });

    test(`F1 circuito ${circuit}: nitro ajuda, mas não elimina toda a disputa imediatamente`, (t) => {
        for (const difficulty of [1, 2]) {
            const run = benchmark(circuit, difficulty, 1, true);
            t.diagnostic(
                JSON.stringify({ circuit, difficulty, nitro: true, ...run }),
            );
            assert.ok(
                run.firstLead === null || run.firstLead > 5,
                "Mesmo uma largada limpa com nitro deve exigir mais de cinco segundos para assumir a ponta",
            );
            assert.ok(
                run.playerTime < run.leaderTime,
                "Piloto sem erros usando as cargas disponíveis ainda deve poder vencer",
            );
        }
    });
}
