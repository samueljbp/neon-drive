const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const skipped = new Set(["js/main.js", "js/errors.js"]);
// Mesma ordem do navegador, sem reescrever fontes nem expor funções privadas.
// Só os scripts compilados são compartilhados; cada cenário recebe uma VM nova.
const scripts = Array.from(
    html.matchAll(
        /<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>\s*<\/script\s*>/gi,
    ),
    (match) => match[2],
)
    .filter((src) => !skipped.has(src))
    .map((src) => {
        assert.ok(!/^(?:[a-z]+:|\/\/)/i.test(src), `Script não local: ${src}`);
        const filename = path.resolve(root, src.split(/[?#]/)[0]);
        const relative = path.relative(root, filename);
        assert.ok(
            relative &&
                !relative.startsWith("..") &&
                !path.isAbsolute(relative),
        );
        return new vm.Script(fs.readFileSync(filename, "utf8"), { filename });
    });
const DT = 1 / 60;
const MAX_SPEED = 25000;
const EPSILON = 1e-7;
const CIRCUITS = ["interlagos", "monaco", "monza", "suzuka"];

function randomGenerator(seed) {
    return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 0x100000000;
    };
}
function stubSprites() {
    const sprite = { bodyW: 900, worldW: 900, kind: "formula" };
    return {
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
}
function setup({ seed = 0x4e454f4e, ...overrides } = {}) {
    const forbidden = () => {
        throw new Error(
            "Suíte de IA não pode executar DOM, rasterização, áudio ou timers",
        );
    };
    const context = vm.createContext({
        console,
        document: {
            createElement: forbidden,
            getElementById: forbidden,
            addEventListener: forbidden,
        },
        navigator: {},
        addEventListener: forbidden,
        requestAnimationFrame: forbidden,
        setTimeout: forbidden,
        setInterval: forbidden,
        AudioContext: forbidden,
    });
    context.window = context;
    const math = vm.runInContext("Math", context);
    math.random = randomGenerator(seed);
    scripts.forEach((script) => script.runInContext(context));
    const ND = context.NeonDrive;
    assert.equal(
        typeof ND?.formulaAI?.plan,
        "function",
        "index deve carregar formula-ai.js",
    );
    const SPR = stubSprites();
    const settings = {
        mode: "formula",
        circuit: 0,
        difficulty: 1,
        numPlayers: 1,
        ...overrides,
    };
    const world = ND.createWorld(SPR, settings);
    return { ND, world, SPR, settings, math };
}
function plain(value) {
    return JSON.parse(JSON.stringify(value));
}
function carState(car) {
    return plain(
        Object.fromEntries(
            Object.entries(car).filter(
                ([key]) => !["sprite", "seg"].includes(key),
            ),
        ),
    );
}
function carsState(world) {
    return Array.from(world.traffic, carState).sort((a, b) => a.id - b.id);
}
function worldState(world) {
    return {
        cars: carsState(world),
        order: Array.from(world.traffic, (car) => car.id),
        membership: Array.from(world.segments, (seg) =>
            Array.from(seg.cars, (car) => car.id),
        ),
    };
}
function plansState(plans) {
    return Array.from(plans, ([car, value]) => ({ id: car.id, ...value })).sort(
        (a, b) => a.id - b.id,
    );
}
function plan(env, dt = DT, options = {}) {
    return env.ND.formulaAI.plan(env.world, dt, {
        maxSpeed: MAX_SPEED,
        difficulty: env.settings.difficulty,
        ...options,
    });
}
function tick(world, index, options = {}) {
    world.updateTraffic(DT, {
        mode: "formula",
        maxSpeed: MAX_SPEED,
        elapsed: index * DT,
        ...options,
    });
}
function close(actual, expected, label) {
    assert.ok(
        Number.isFinite(actual) && Math.abs(actual - expected) <= EPSILON,
        `${label}: esperado=${expected}; recebido=${actual}`,
    );
}
function spread(values) {
    return Math.max(...values) - Math.min(...values);
}
function relative(world, a, b) {
    const length = world.trackLength;
    return (
        ((((b.z - a.z + length / 2) % length) + length) % length) - length / 2
    );
}
function contact(world, a, b) {
    return (
        world.vehicleHalfWidth(a.sprite) +
        world.vehicleHalfWidth(b.sprite) +
        0.055
    );
}
function noOverlap(world, a, b, label) {
    const longitudinal = Math.abs(relative(world, a, b));
    const lateral = Math.abs(a.offset - b.offset);
    const width = contact(world, a, b);
    assert.ok(
        longitudinal >= world.SEGLEN * 3 - EPSILON ||
            lateral >= width - EPSILON,
        `${label}: sobreposição ${a.id}/${b.id}; gapZ=${longitudinal}; gapX=${lateral}; mínimoX=${width}; mínimoZ=600`,
    );
}
function continuous(world, car, before, label) {
    const bound =
        before.launchDelay > 0
            ? 0
            : car.driver.steering *
              DT *
              Math.min(1, Math.max(0.15, before.speed / MAX_SPEED));
    assert.ok(
        Math.abs(car.offset - before.offset) <= bound + EPSILON,
        `${label}: salto lateral; delta=${car.offset - before.offset}; limite=${bound}`,
    );
    assert.ok(
        car.progress >= before.progress,
        `${label}: progresso retrocedeu de ${before.progress} para ${car.progress}`,
    );
    close(
        car.progress,
        before.progress + car.speed * DT,
        `${label}: avanço físico, sem teleporte`,
    );
    close(car.distance, car.progress, `${label}: distance acompanha progress`);
    assert.ok(
        Number.isFinite(car.speed) && car.speed >= 0,
        `${label}: velocidade=${car.speed}`,
    );
    assert.ok(
        Math.abs(car.offset) + world.vehicleHalfWidth(car.sprite) <=
            0.94 + EPSILON,
        `${label}: carro saiu da pista; offset=${car.offset}`,
    );
}
function place(
    world,
    car,
    { progress = 10000, offset = 0, speed = 0, driver = {}, ...rest } = {},
) {
    Object.assign(car, {
        progress,
        distance: progress,
        z:
            ((progress % world.trackLength) + world.trackLength) %
            world.trackLength,
        offset,
        lane: offset,
        laneT: 0,
        speed,
        launchDelay: 0,
        hit: 0,
        finished: false,
        finishTime: null,
        driver: {
            pace: 0.7,
            acceleration: 1 / 3,
            braking: 1 / 1.35,
            cornerLoss: 0.09,
            reaction: 0,
            aggression: 0.7,
            steering: 1,
            line: 0,
            ...driver,
        },
        ...rest,
    });
    return car;
}
function straight(env, count) {
    // Fixture de pista: geometria real, sem substituir findSegment, plan ou updateTraffic.
    env.world.segments.forEach((seg) => {
        seg.curve = 0;
    });
    env.world.traffic.splice(count);
    env.world.traffic.forEach((car, i) =>
        place(env.world, car, { progress: 10000 + i * 3000 }),
    );
    env.world.syncTraffic();
    return env;
}
function overtaking() {
    const env = straight(setup(), 2);
    const [fast, slow] = env.world.traffic;
    // Mesmo estado inicial e mesma linha; só o ritmo permite alcançar o líder.
    const speed = MAX_SPEED * (0.55 + 0.08);
    place(env.world, fast, { speed, driver: { pace: 0.9 } });
    place(env.world, slow, { progress: 13000, speed, driver: { pace: 0.55 } });
    env.world.syncTraffic();
    return { ...env, fast, slow };
}

test("perfis gerados têm spread de pace entre 0.10 e 0.15, estilos distintos e os dois melhores na primeira fila", () => {
    for (const seed of [1, 0x4e454f4e, 0xdeadbeef]) {
        for (const numPlayers of [1, 2]) {
            const { ND, world } = setup({ seed, numPlayers });
            for (const drivers of [
                world.traffic.map((car) => car.driver),
                ND.formulaAI.createDrivers(12 - numPlayers),
            ]) {
                const paces = Array.from(drivers, (driver) => driver.pace);
                const label = `seed=${seed}/${numPlayers}P; paces=${paces.join(",")}`;
                assert.ok(spread(paces) > 0.1 && spread(paces) < 0.15, label);
                assert.deepEqual(
                    paces.slice(0, 2),
                    [...paces].sort((a, b) => b - a).slice(0, 2),
                    `Primeira fila deve reunir os dois melhores ritmos: ${label}`,
                );
                const remaining = paces.slice(2);
                assert.ok(
                    remaining.some(
                        (pace, i) => i > 0 && pace > remaining[i - 1],
                    ) &&
                        remaining.some(
                            (pace, i) => i > 0 && pace < remaining[i - 1],
                        ),
                    `Ritmo do restante do grid não pode ser monotônico: ${label}`,
                );
                for (const field of ["acceleration", "braking", "cornerLoss"]) {
                    const values = Array.from(
                        drivers,
                        (driver) => driver[field],
                    );
                    assert.ok(
                        values.every(
                            (value) => Number.isFinite(value) && value > 0,
                        ),
                        `${field}: ${label}`,
                    );
                    assert.ok(
                        new Set(values).size >= drivers.length / 2,
                        `${field} precisa variar entre pilotos: ${values.join(",")}`,
                    );
                }
                assert.equal(
                    new Set(drivers).size,
                    drivers.length,
                    "Perfis não podem compartilhar o mesmo objeto",
                );
            }
        }
    }
});

test("pace aplica dificuldade e maxSpeed sem apagar diferenças individuais", () => {
    const { ND, world } = setup();
    for (const car of world.traffic) {
        const before = plain(car.driver);
        const speeds = [0, 1, 2].map((difficulty) =>
            ND.formulaAI.pace(car.driver, difficulty, MAX_SPEED),
        );
        assert.ok(
            speeds[0] < speeds[1] && speeds[1] < speeds[2],
            `id=${car.id}; velocidades=${speeds}`,
        );
        speeds.forEach((speed, difficulty) => {
            assert.ok(
                speed >= MAX_SPEED * 0.89 && speed <= MAX_SPEED * 1.14,
                `velocidade=${speed}`,
            );
            close(
                ND.formulaAI.pace(car.driver, difficulty, MAX_SPEED * 0.8),
                speed * 0.8,
                "escala de maxSpeed",
            );
        });
        assert.deepEqual(
            plain(car.driver),
            before,
            "pace não modifica o perfil",
        );
    }
});

test("aceleração, frenagem e capacidade de curva alteram a dinâmica real, não só metadados", () => {
    const env = straight(setup(), 1);
    const car = env.world.traffic[0];
    const measured = [];
    for (const driver of [
        { acceleration: 0.25, braking: 0.55, cornerLoss: 0.125 },
        { acceleration: 0.37, braking: 0.82, cornerLoss: 0.06 },
    ]) {
        env.world.segments.forEach((seg) => {
            seg.curve = 0;
        });
        place(env.world, car, { driver });
        close(
            plan(env).get(car).speed,
            MAX_SPEED * driver.acceleration * 1.4 * DT,
            "aceleração planejada",
        );
        tick(env.world, 0);
        const acceleration = car.speed;
        close(
            acceleration,
            MAX_SPEED * driver.acceleration * 1.4 * DT,
            "aceleração aplicada",
        );
        car.speed = MAX_SPEED;
        tick(env.world, 1);
        const braking = MAX_SPEED - car.speed;
        close(braking, MAX_SPEED * driver.braking * DT, "frenagem aplicada");
        env.world.segments.forEach((seg) => {
            seg.curve = 4;
        });
        for (let i = 0; i < 120; i++) tick(env.world, i + 2);
        const cornerSpeed = car.speed;
        close(
            cornerSpeed,
            env.ND.formulaAI.pace(car.driver, 1, MAX_SPEED) *
                (1 - 4 * driver.cornerLoss * 0.8),
            "ritmo em curva",
        );
        measured.push({ acceleration, braking, cornerSpeed });
    }
    for (const key of ["acceleration", "braking", "cornerSpeed"])
        assert.ok(
            measured[1][key] > measured[0][key],
            `${key}: ${JSON.stringify(measured)}`,
        );
});

for (const [circuit, id] of CIRCUITS.entries()) {
    test(`${id}: ritmos e trajetórias reais se separam aos 10s e 20s`, (t) => {
        const { world } = setup({ circuit });
        assert.equal(world.circuit.id, id);
        const initial = new Map(
            world.traffic.map((car) => [car.id, car.progress]),
        );
        const initialSpan = spread([...initial.values()]);
        const crossingTimes = new Map();
        const checkpoint = 50000;
        for (let i = 0; i < 1200; i++) {
            const before = Array.from(world.traffic, (car) => car.progress);
            tick(world, i);
            world.traffic.forEach((car, index) => {
                assert.ok(
                    car.progress >= before[index],
                    `${id}: id=${car.id} retrocedeu no tick=${i}`,
                );
                if (before[index] < checkpoint && car.progress >= checkpoint)
                    crossingTimes.set(
                        car.id,
                        i * DT + (checkpoint - before[index]) / car.speed,
                    );
            });
            if (i !== 599 && i !== 1199) continue;
            const seconds = (i + 1) * DT;
            const metrics = {
                seconds,
                span: spread(Array.from(world.traffic, (car) => car.progress)),
                gainedSpan: spread(
                    Array.from(
                        world.traffic,
                        (car) => car.progress - initial.get(car.id),
                    ),
                ),
                trajectories: new Set(
                    world.traffic.map((car) => car.offset.toFixed(1)),
                ).size,
                speedGroups: new Set(
                    world.traffic.map((car) => Math.round(car.speed / 100)),
                ).size,
            };
            const label = `${id}: ${JSON.stringify(metrics)}`;
            t.diagnostic(label);
            assert.ok(
                metrics.trajectories > 2,
                `Não manter duas filas: ${label}`,
            );
            assert.ok(
                metrics.speedGroups > 2,
                `Não manter velocidade única: ${label}`,
            );
            assert.ok(
                metrics.span > initialSpan + 6000,
                `Separação deve superar o grid inicial: ${label}`,
            );
            assert.ok(
                metrics.gainedSpan > MAX_SPEED * seconds * 0.05,
                `Diferença de distância percorrida deve superar 5% do ritmo máximo: ${label}`,
            );
        }
        assert.equal(
            crossingTimes.size,
            world.traffic.length,
            `${id}: todos precisam passar pelo marco de 50000`,
        );
        const times = [...crossingTimes.values()].sort((a, b) => a - b);
        const gaps = times.slice(1).map((time, i) => time - times[i]);
        t.diagnostic(
            `${id}: tempos no mesmo marco=${times.map((time) => time.toFixed(3)).join(", ")}s`,
        );
        assert.ok(
            spread(times) > 0.5,
            `${id}: passagens sincronizadas; tempos=${times}`,
        );
        assert.ok(
            gaps.filter((gap) => gap >= 0.1).length >= 3,
            `${id}: exigir ao menos quatro grupos temporais separados por 100ms; gaps=${gaps}`,
        );
    });
}

test("rápido alcança e ultrapassa lento na faixa livre, sem saltos, retrocesso ou sobreposição", (t) => {
    const { world, fast, slow } = overtaking();
    assert.equal(slow.progress - fast.progress, 3000);
    assert.equal(fast.offset, slow.offset);
    let passedAt = null,
        minGap = 3000,
        maxLateral = 0;
    for (let i = 0; i < 360; i++) {
        const before = [carState(fast), carState(slow)];
        tick(world, i);
        continuous(world, fast, before[0], `rápido/tick=${i}`);
        continuous(world, slow, before[1], `lento/tick=${i}`);
        noOverlap(world, fast, slow, `ultrapassagem/tick=${i}`);
        minGap = Math.min(minGap, Math.abs(slow.progress - fast.progress));
        maxLateral = Math.max(maxLateral, Math.abs(fast.offset - slow.offset));
        if (
            before[0].progress <= before[1].progress &&
            fast.progress > slow.progress
        )
            passedAt ??= (i + 1) * DT;
    }
    const metrics = {
        passedAt,
        minGap,
        maxLateral,
        advantage: fast.progress - slow.progress,
    };
    t.diagnostic(JSON.stringify(metrics));
    assert.ok(
        minGap < 600,
        `Precisa efetivamente alcançar o líder: ${JSON.stringify(metrics)}`,
    );
    assert.ok(
        maxLateral >= contact(world, fast, slow),
        `Precisa abrir espaço lateral: ${JSON.stringify(metrics)}`,
    );
    assert.notEqual(
        passedAt,
        null,
        `Trocar lane NÃO basta: progress precisa inverter a ordem; ${JSON.stringify(metrics)}`,
    );
    assert.ok(
        metrics.advantage > 600,
        `Ultrapassagem precisa ser concluída: ${JSON.stringify(metrics)}`,
    );
});

for (const side of [-1, 1]) {
    test(`bloqueador à ${side < 0 ? "esquerda" : "direita"}: respeita o lado ocupado e não atravessa carro adjacente`, () => {
        const env = straight(setup(), 3);
        const [fast, slow, blocker] = env.world.traffic;
        const speed = MAX_SPEED * 0.61;
        place(env.world, fast, {
            speed,
            driver: { pace: 0.9, line: side * 0.74 },
        });
        place(env.world, slow, {
            progress: 13000,
            speed,
            driver: { pace: 0.55 },
        });
        place(env.world, blocker, {
            progress: 10100,
            offset: side * 0.42,
            speed,
            driver: { pace: 0.9, line: side * 0.42 },
        });
        env.world.syncTraffic();
        const decision = plan(env).get(fast);
        assert.ok(
            decision.lane * side < 0,
            `Deve escolher o lado livre, não o bloqueador; lado=${side}; plano=${JSON.stringify(decision)}`,
        );
        let besideTicks = 0,
            passed = false;
        for (let i = 0; i < 360; i++) {
            const before = Array.from(env.world.traffic, carState);
            tick(env.world, i);
            env.world.traffic.forEach((car, index) =>
                continuous(
                    env.world,
                    car,
                    before[index],
                    `id=${car.id}/tick=${i}`,
                ),
            );
            for (const [a, b] of [
                [fast, slow],
                [fast, blocker],
                [slow, blocker],
            ])
                noOverlap(env.world, a, b, `lado=${side}/tick=${i}`);
            if (Math.abs(relative(env.world, fast, blocker)) < 600) {
                besideTicks++;
                assert.ok(
                    side * (blocker.offset - fast.offset) >=
                        contact(env.world, fast, blocker) - EPSILON,
                    `Cruzou o lado ocupado; tick=${i}; fastX=${fast.offset}; blockerX=${blocker.offset}`,
                );
            }
            if (fast.progress > slow.progress) passed = true;
        }
        assert.ok(
            besideTicks >= 5,
            `Fixture deve exercitar disputa lado a lado; ticks=${besideTicks}`,
        );
        assert.ok(
            passed,
            `Lado livre precisa permitir ultrapassagem real; vantagem=${fast.progress - slow.progress}`,
        );
    });
}

test("líder parado após a emenda da volta provoca desvio ou frenagem antes da colisão", () => {
    const env = straight(setup(), 2);
    const [follower, leader] = env.world.traffic;
    place(env.world, follower, {
        progress: env.world.trackLength - 450,
        speed: 20000,
        driver: { pace: 0.9 },
    });
    place(env.world, leader, {
        progress: env.world.trackLength + 150,
        speed: 0,
    });
    env.world.syncTraffic();
    close(
        relative(env.world, follower, leader),
        600,
        "gap físico através do zero",
    );
    const decision = plan(env).get(follower);
    assert.ok(
        Math.abs(decision.offset) > EPSILON || decision.speed < follower.speed,
        `Líder speed=0 deve ser percebido na emenda: ${JSON.stringify(decision)}`,
    );
    for (let i = 0; i < 120; i++) {
        const before = carState(follower);
        tick(env.world, i);
        continuous(env.world, follower, before, `emenda/tick=${i}`);
        noOverlap(env.world, follower, leader, `emenda/tick=${i}`);
    }
});

test("humano à frente é lido por p.position e respeitado sem mutar o jogador", () => {
    const env = setup();
    const race = env.ND.createRace(env.world, env.SPR, env.settings);
    straight(env, 1);
    const car = env.world.traffic[0];
    place(env.world, car, { speed: 20000, driver: { pace: 0.9 } });
    const player = race.players[0];
    Object.assign(player, {
        position: 10650,
        playerX: 0,
        speed: 0,
        // Distância acumulada e campos de IA NÃO são a posição física do humano.
        distance: env.world.trackLength * 2 + 10650,
        z: env.world.trackLength / 2,
        progress: env.world.trackLength / 2,
    });
    const before = plain(player);
    Object.freeze(player);
    const players = Object.freeze([player]);
    const free = plan(env).get(car);
    const blocked = plan(env, DT, { players }).get(car);
    assert.ok(
        blocked.speed < free.speed ||
            Math.abs(blocked.offset - free.offset) > EPSILON,
        `Humano precisa influenciar a IA: livre=${JSON.stringify(free)}; bloqueado=${JSON.stringify(blocked)}`,
    );
    for (let i = 0; i < 120; i++) {
        tick(env.world, i, { players });
        noOverlap(
            env.world,
            car,
            {
                id: "humano",
                z: player.position,
                offset: player.playerX,
                sprite: player.sprite,
            },
            `humano/tick=${i}`,
        );
    }
    assert.deepEqual(
        plain(player),
        before,
        "Planejamento e tráfego não alteram posição, velocidade nem estado do humano",
    );
});

test("IA parada atrás de humano consegue sair da fila, ultrapassar e continuar a prova", () => {
    const env = straight(setup(), 1),
        car = env.world.traffic[0];
    place(env.world, car, { progress: 10000, speed: 0 });
    const player = Object.freeze({
        position: 10600,
        playerX: 0,
        speed: 0,
        sprite: car.sprite,
    });
    for (let i = 0; i < 720; i++) {
        const before = carState(car);
        tick(env.world, i, { players: [player] });
        continuous(env.world, car, before, `desvio lento/tick=${i}`);
        noOverlap(
            env.world,
            car,
            {
                id: "humano",
                z: player.position,
                offset: player.playerX,
                sprite: player.sprite,
            },
            `desvio lento/tick=${i}`,
        );
    }
    assert.ok(
        car.progress > player.position + 10000,
        "Não deve ficar preso atrás do jogador parado",
    );
});

test("IAs finalizadas e humanos finalizados/mortos são excluídos dos obstáculos", () => {
    const env = straight(setup(), 2);
    const [active, finished] = env.world.traffic;
    place(env.world, active, {
        progress: env.world.trackLength - 800,
        speed: 18000,
    });
    place(env.world, finished, {
        progress: env.world.lapCount * env.world.trackLength,
        laps: env.world.lapCount,
        finished: true,
        finishTime: 30,
    });
    env.world.syncTraffic();
    const before = carState(finished);
    const free = env.ND.formulaAI.plan(
        { ...env.world, traffic: [active] },
        DT,
        { maxSpeed: MAX_SPEED, difficulty: 1 },
    );
    const plans = plan(env, DT, {
        players: [
            {
                position: 0,
                playerX: 0,
                speed: 0,
                sprite: active.sprite,
                finished: true,
            },
            {
                position: active.z + 650,
                playerX: 0,
                speed: 0,
                sprite: active.sprite,
                dead: 1,
            },
        ],
    });
    assert.equal(plans.has(finished), false);
    assert.equal(plans.size, 1);
    assert.deepEqual(
        plansState(plans),
        plansState(free),
        "Finalizados/mortos não desviam nem freiam a IA ativa",
    );
    const progress = active.progress;
    for (let i = 0; i < 120; i++) tick(env.world, i);
    assert.ok(
        active.progress > progress + 10000,
        `Finalizado não pode bloquear a linha; avanço=${active.progress - progress}`,
    );
    assert.deepEqual(
        carState(finished),
        before,
        "IA finalizada fica congelada",
    );
    assert.equal(finished.seg, null);
    assert.ok(env.world.segments.every((seg) => !seg.cars.includes(finished)));
});

test("Math.random é necessário só na inicialização, nunca no planejamento ou no tick de F1", () => {
    const env = setup();
    const drivers = Array.from(env.world.traffic, (car) => plain(car.driver));
    const initial = Array.from(env.world.traffic, (car) => car.progress);
    env.math.random = () => {
        throw new Error("Sorteio por frame na IA de F1");
    };
    for (let i = 0; i < 180; i++) {
        plan(env);
        tick(env.world, i);
    }
    assert.deepEqual(
        Array.from(env.world.traffic, (car) => plain(car.driver)),
        drivers,
    );
    assert.ok(
        env.world.traffic.every((car, i) => car.progress > initial[i]),
        "Teste precisa realmente movimentar as IAs",
    );
});

test("inverter traffic preserva planos simultâneos e progresso por id, inclusive em disputa lateral", () => {
    for (const scenario of ["grid", "disputa lateral"]) {
        const a = setup(),
            b = setup();
        if (scenario === "disputa lateral") {
            for (const env of [a, b]) {
                straight(env, 3);
                const [left, right, leader] = env.world.traffic;
                place(env.world, left, {
                    progress: 10000,
                    offset: -0.4,
                    speed: 18000,
                    driver: { pace: 0.9, line: 0.4 },
                });
                place(env.world, right, {
                    progress: 10100,
                    offset: 0.4,
                    speed: 18000,
                    driver: { pace: 0.9, line: -0.4 },
                });
                place(env.world, leader, {
                    progress: 13000,
                    speed: 14000,
                    driver: { pace: 0.55 },
                });
                env.world.syncTraffic();
            }
        }
        b.world.traffic.reverse();
        b.world.syncTraffic();
        assert.deepEqual(
            carsState(a.world),
            carsState(b.world),
            `${scenario}: estados iniciais equivalentes`,
        );
        for (let i = 0; i < 180; i++) {
            assert.deepEqual(
                plansState(plan(a)),
                plansState(plan(b)),
                `${scenario}/tick=${i}: planos dependem da ordem do array`,
            );
            tick(a.world, i);
            tick(b.world, i);
            assert.deepEqual(
                carsState(a.world),
                carsState(b.world),
                `${scenario}/tick=${i}: física depende da ordem do array`,
            );
        }
    }
});

test("world rejeita dt inválido sem avançar carros, timers, segmentos ou maxSpeed", () => {
    const env = setup(),
        control = setup();
    const before = worldState(env.world);
    for (const dt of [
        0,
        -DT,
        -1,
        NaN,
        Infinity,
        -Infinity,
        undefined,
        null,
        "0.1",
        {},
        [],
    ]) {
        env.world.updateTraffic(dt, {
            mode: "formula",
            maxSpeed: 99999,
            elapsed: 900,
        });
        assert.deepEqual(
            worldState(env.world),
            before,
            `dt=${String(dt)} não pode alterar o mundo`,
        );
    }
    // Sem options.maxSpeed: detecta inclusive alteração indevida do valor fechado no mundo.
    env.world.updateTraffic(DT, { elapsed: 0 });
    control.world.updateTraffic(DT, { elapsed: 0 });
    assert.deepEqual(worldState(env.world), worldState(control.world));
});

test("escolhas de faixa permanecem estáveis sob pressão, sem ziguezague constante", (t) => {
    const { world, fast, slow } = overtaking();
    const transitions = new Map(world.traffic.map((car) => [car.id, []]));
    for (let i = 0; i < 600; i++) {
        const lanes = Array.from(world.traffic, (car) => car.lane);
        tick(world, i);
        world.traffic.forEach((car, index) => {
            if (Math.abs(car.lane - lanes[index]) > 0.02)
                transitions.get(car.id).push(i);
        });
        noOverlap(world, fast, slow, `estabilidade/tick=${i}`);
    }
    assert.ok(
        transitions.get(fast.id).length > 0,
        "Precisa haver manobra, não imobilidade que mascara ziguezague",
    );
    for (const [id, ticks] of transitions) {
        t.diagnostic(
            `id=${id}: transições de lane em segundos=${ticks.map((tick) => (tick * DT).toFixed(3)).join(",")}`,
        );
        assert.ok(
            ticks.length <= 10,
            `id=${id}: mais de uma troca por segundo em média; ticks=${ticks}`,
        );
        for (const start of ticks) {
            const count = ticks.filter(
                (tick) => tick >= start && tick < start + 60,
            ).length;
            assert.ok(
                count <= 2,
                `id=${id}: ${count} trocas na janela de 1s iniciada em ${start * DT}s`,
            );
        }
    }
    assert.ok(
        fast.progress > slow.progress + 600,
        "Estabilidade não pode impedir ultrapassagem real",
    );
});

test("plan produz snapshot repetível sem modificar carros, perfis ou associação aos segmentos", () => {
    const env = overtaking();
    const before = worldState(env.world);
    const first = plan(env),
        second = plan(env);
    assert.equal(first.size, env.world.traffic.length);
    assert.deepEqual(plansState(first), plansState(second));
    assert.deepEqual(
        worldState(env.world),
        before,
        "Planejar não aplica decisões ao mundo",
    );
    for (const car of env.world.traffic) {
        assert.ok(
            first.has(car),
            `Plano deve usar a identidade real do carro ${car.id}`,
        );
        assert.notEqual(first.get(car), car);
        for (const key of [
            "speed",
            "offset",
            "lane",
            "laneT",
            "launchDelay",
            "targetSpeed",
        ])
            assert.ok(
                Number.isFinite(first.get(car)[key]),
                `id=${car.id}/${key}: ${first.get(car)[key]}`,
            );
    }
    tick(env.world, 0);
    for (const car of env.world.traffic) {
        for (const [key, value] of Object.entries(first.get(car)))
            close(
                car[key],
                value,
                `world deve aplicar o plano real: id=${car.id}/${key}`,
            );
    }
});

// Pausa/countdown, grid completo e conclusão da meta já são cobertos em
// game.test.cjs; aqui só há simulação focada, finita, sem timers ou rasterização.

test("grid completo encontra passagem entre dois humanos parados e termina todas as voltas", () => {
    const { world } = setup({ seed: 1, difficulty: 0, numPlayers: 2 });
    const players = [-0.46, 0.46].map((playerX) =>
        Object.freeze({
            position: 0,
            playerX,
            speed: 0,
            sprite: world.traffic[0].sprite,
        }),
    );
    // Distância total a 50% da velocidade nominal + 30s para largada/desvios.
    // O passo e as margens de colisão continuam iguais; só o horizonte cresce.
    const limit = Math.ceil(
        ((world.trackLength * world.lapCount) / (MAX_SPEED * 0.5)) * 60 +
            30 * 60,
    );
    for (let i = 0; i < limit && world.traffic.some((c) => !c.finished); i++) {
        tick(world, i, { players });
        const active = world.traffic.filter((c) => !c.finished);
        active.forEach((a, index) => {
            for (let j = index + 1; j < active.length; j++)
                noOverlap(world, a, active[j], `grid completo/tick=${i}`);
        });
    }
    assert.ok(
        world.traffic.every((c) => c.finished),
        `Não pode formar fila presa na chegada: ${JSON.stringify(carsState(world))}`,
    );
    for (const car of world.traffic) {
        assert.equal(car.laps, world.lapCount);
        assert.equal(car.progress, world.trackLength * world.lapCount);
        assert.ok(car.finishTime > 0 && car.finishTime <= limit * DT);
    }
});
