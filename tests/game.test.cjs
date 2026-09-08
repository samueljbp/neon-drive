const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Não remove IIFEs, injeta exports ou reescreve fontes de produção.
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
function attribute(attributes, name) {
    return attributes.match(
        new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"),
    )?.[2];
}
function localFile(reference) {
    assert.ok(
        !/^(?:[a-z]+:|\/\/)/i.test(reference),
        `Referência não local: ${reference}`,
    );
    const file = path.resolve(root, reference.split(/[?#]/)[0]);
    const relative = path.relative(root, file);
    assert.ok(
        relative && !relative.startsWith("..") && !path.isAbsolute(relative),
        reference,
    );
    assert.ok(fs.statSync(file).isFile(), `Arquivo ausente: ${reference}`);
    return file;
}
const scripts = Array.from(
    html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi),
    (match) => {
        const src = attribute(match[1], "src");
        const filename = src ? localFile(src) : "index.html:inline";
        return {
            src,
            filename,
            source: src ? fs.readFileSync(filename, "utf8") : match[2],
        };
    },
);
const syntaxOnly = new Set(["js/main.js", "js/errors.js"]);
const noop = () => {};

// Canvas não rasteriza pixels: registra blits e restaura os estados usados pelo
// render. Métodos desconhecidos não viram no-ops silenciosos via Proxy.
function context2d(canvas) {
    const calls = [],
        stack = [];
    const state = {
        globalAlpha: 1,
        globalCompositeOperation: "source-over",
        filter: "none",
        fillStyle: "#000",
        strokeStyle: "#000",
        lineWidth: 1,
        lineCap: "butt",
        lineJoin: "miter",
        font: "10px sans-serif",
        textAlign: "start",
        textBaseline: "alphabetic",
        shadowBlur: 0,
        shadowColor: "transparent",
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        imageSmoothingEnabled: true,
    };
    const gradient = () => ({ addColorStop: noop });
    const imageData = (width, height) => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
    });
    return {
        ...state,
        canvas,
        calls,
        save() {
            stack.push(
                Object.fromEntries(
                    Object.keys(state).map((key) => [key, this[key]]),
                ),
            );
        },
        restore() {
            if (stack.length) Object.assign(this, stack.pop());
        },
        drawImage(...args) {
            calls.push({
                alpha: this.globalAlpha,
                mode: this.globalCompositeOperation,
                args,
            });
        },
        createLinearGradient: gradient,
        createRadialGradient: gradient,
        createImageData: imageData,
        getImageData: (_x, _y, width, height) => imageData(width, height),
        putImageData: noop,
        createPattern: () => ({}),
        measureText: (text) => ({ width: String(text).length * 8 }),
        beginPath: noop,
        closePath: noop,
        moveTo: noop,
        lineTo: noop,
        arc: noop,
        arcTo: noop,
        ellipse: noop,
        rect: noop,
        roundRect: noop,
        quadraticCurveTo: noop,
        bezierCurveTo: noop,
        fill: noop,
        stroke: noop,
        fillRect: noop,
        strokeRect: noop,
        clearRect: noop,
        clip: noop,
        fillText: noop,
        strokeText: noop,
        translate: noop,
        rotate: noop,
        scale: noop,
        transform: noop,
        setTransform: noop,
        resetTransform: noop,
        setLineDash: noop,
    };
}
function canvas(width = 1280, height = 720) {
    const result = { width, height, clientWidth: width, clientHeight: height };
    const ctx = context2d(result);
    result.getContext = (type) => {
        assert.equal(type, "2d");
        return ctx;
    };
    return result;
}
function randomGenerator(seed) {
    return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 0x100000000;
    };
}
let spriteCatalog;
function setup({ sprites = false, seed = 0x4e454f4e } = {}) {
    const forbidden = () => {
        throw new Error(
            "Boot/DOM/áudio/animação não devem executar nesta suíte",
        );
    };
    const context = vm.createContext({
        console,
        document: {
            createElement(tag) {
                assert.equal(tag, "canvas");
                return canvas();
            },
            getElementById: forbidden,
            addEventListener: forbidden,
        },
        navigator: {},
        addEventListener: forbidden,
        requestAnimationFrame: forbidden,
        setTimeout: forbidden,
        AudioContext: forbidden,
    });
    context.window = context;
    vm.runInContext("Math", context).random = randomGenerator(seed);
    const globalNames = () =>
        Array.from(
            vm.runInContext("Object.getOwnPropertyNames(globalThis)", context),
        );
    const initialGlobals = globalNames();
    const executed = [];
    for (const script of scripts) {
        const compiled = new vm.Script(script.source, {
            filename: script.filename,
        });
        if (syntaxOnly.has(script.src)) continue;
        compiled.runInContext(context);
        executed.push(script.src);
    }
    const ND = context.NeonDrive;
    assert.ok(
        ND?.util,
        "utils.js deve inicializar NeonDrive antes das fábricas",
    );
    let SPR;
    if (sprites) {
        // Cache somente da arte real (cara de gerar); mundos, corridas, namespace
        // e RNG são novos em cada teste. O mundo pode adicionar circuitDecor à cópia.
        if (!spriteCatalog) {
            spriteCatalog = ND.assets.buildSprites(3200);
            ND.assets.buildFormulaSprites(spriteCatalog);
        }
        SPR = { ...spriteCatalog };
    }
    return { ND, context, SPR, executed, initialGlobals, globalNames };
}
function game(settings = {}) {
    settings = {
        mode: "formula",
        circuit: 0,
        difficulty: 1,
        numPlayers: 1,
        ...settings,
    };
    const env = setup({ sprites: true });
    const world = env.ND.createWorld(env.SPR, settings);
    const race = env.ND.createRace(world, env.SPR, settings);
    return { ...env, settings, world, race };
}
function close(actual, expected, message = "valor", epsilon = 1e-8) {
    assert.ok(
        Number.isFinite(actual) && Math.abs(actual - expected) <= epsilon,
        `${message}: esperado ${expected}, recebido ${actual}`,
    );
}
function plain(value) {
    return JSON.parse(JSON.stringify(value));
}
function racerState(racer) {
    return plain(
        Object.fromEntries(
            Object.entries(racer).filter(
                ([key]) => !["sprite", "spriteAngles", "seg"].includes(key),
            ),
        ),
    );
}
function raceState(race) {
    return {
        state: race.state,
        elapsed: race.elapsed,
        countdown: race.countdown,
        players: Array.from(race.players, racerState),
        traffic: Array.from(race.world.traffic, racerState),
        pickups: plain(race.world.pickups),
        membership: Array.from(race.world.segments, (seg) =>
            Array.from(seg.cars, (car) => race.world.traffic.indexOf(car)),
        ),
    };
}
function play(race) {
    race.state = "play";
    race.countdown = 0;
}
const gas = { gas: true, gasA: 1 };
function controls(race) {
    return Array.from(race.players, () => gas);
}
function awayFromFinish(world) {
    // Preparação de estado, não substituição da física: o tráfego continua real.
    world.traffic.forEach((car, i) => {
        car.z = world.trackLength / 2 + i * world.SEGLEN * 2;
        car.progress = car.distance = car.z;
    });
    world.syncTraffic();
}
function beforeLine(race, player, lap, remaining) {
    player.distance = race.world.trackLength * lap - remaining;
    player.position = race.world.trackLength - remaining;
    player.laps = lap;
    player.speed = race.maxSpeed;
    player.playerX = player.playerIndex ? 0.46 : -0.46;
    player.boostT = player.boosting = 0;
}
function renderer() {
    const { ND } = setup();
    const display = ND.createDisplay(canvas());
    return {
        scene: ND.createSceneRenderer(),
        display,
        frame: {
            W: 1000,
            world: { ROADW: 3200 },
            sctx: display.sctx,
            ectx: display.ectx,
        },
    };
}

// Os nove escopos originais, agora acessando APIs encapsuladas em NeonDrive.
test("scripts do index têm sintaxe válida e todas as referências JS/CSS são locais e existentes", () => {
    assert.ok(scripts.length > 0);
    assert.ok(
        scripts.every((script) => script.src),
        "O index modular não deve esconder lógica inline",
    );
    scripts.forEach(
        (script) => new vm.Script(script.source, { filename: script.filename }),
    );
    const refs = scripts.map((script) => script.src);
    assert.equal(
        new Set(refs).size,
        refs.length,
        "Não carregar um módulo duas vezes",
    );
    for (const file of syntaxOnly) assert.ok(refs.includes(file), file);
    function jsFiles(dir) {
        return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
            const file = path.join(dir, entry.name);
            return entry.isDirectory()
                ? jsFiles(file)
                : file.endsWith(".js")
                  ? [file]
                  : [];
        });
    }
    assert.deepEqual(
        scripts.map((script) => script.filename).sort(),
        jsFiles(path.join(root, "js")).sort(),
    );
    const styles = Array.from(html.matchAll(/<link\b([^>]*)>/gi)).filter(
        (match) => attribute(match[1], "rel") === "stylesheet",
    );
    assert.ok(styles.length > 0);
    styles.forEach((match) => localFile(attribute(match[1], "href")));
});

test("pista clássica 45% mais larga e quatro centros de faixa simétricos", () => {
    const { world } = game({ mode: "classic" });
    assert.equal(world.ROADW, 3200);
    assert.ok(world.ROADW / 2200 > 1.45);
    assert.equal(world.LANES, 4);
    assert.deepEqual(
        Array.from({ length: 4 }, (_, i) => world.laneOffset(i)),
        [-0.75, -0.25, 0.25, 0.75],
    );
});

test("tráfego e nitro clássicos usam quatro faixas; pórtico real acompanha a largura", () => {
    const { world, race, SPR } = game({ mode: "classic" });
    assert.equal(world.traffic.length, race.difficulty.cars);
    const trafficLanes = new Set();
    for (const car of world.traffic) {
        trafficLanes.add(car.lane);
        assert.equal(car.lane, world.laneOffset(car.laneIndex));
        assert.ok(
            Math.abs(car.offset) + world.vehicleHalfWidth(car.sprite) < 1,
        );
        assert.equal(car.seg, world.findSegment(car.z));
        assert.ok(car.seg.cars.includes(car));
    }
    const pickups = world.segments.flatMap((seg) =>
        seg.sprites.filter((ob) => ob.pk),
    );
    assert.equal(pickups.length, world.pickups.length);
    assert.ok(
        pickups.every(
            (ob) => world.pickups.includes(ob.pk) && ob.sprite === SPR.nitro,
        ),
    );
    for (const lanes of [trafficLanes, new Set(pickups.map((ob) => ob.offset))])
        assert.deepEqual(
            [...lanes].sort((a, b) => a - b),
            [-0.75, -0.25, 0.25, 0.75],
        );
    assert.equal(SPR.arch.worldW, world.ROADW * 3.1);
    assert.equal(SPR.arch.w, 1000);
    assert.equal(SPR.arch.h, 540);
    assert.ok(
        world.segments.some((seg) =>
            seg.sprites.some((ob) => ob.sprite === SPR.arch && !ob.hitW),
        ),
    );
});

test("larguras de colisão usam carroceria, não margens do atlas; faixas deixam espaço", () => {
    const { world, SPR } = game({ mode: "classic" });
    const player = world.vehicleHalfWidth({ worldW: 840 });
    const car = world.vehicleHalfWidth({ worldW: 760 });
    const truck = world.vehicleHalfWidth({ worldW: 1080 });
    assert.ok(truck > car);
    assert.ok(player + truck < 2 / world.LANES);
    assert.equal(world.vehicleHalfWidth({ worldW: 1400, bodyW: 840 }), player);
    assert.equal(world.vehicleHalfWidth(SPR.player), player);
    assert.equal(world.vehicleHalfWidth(SPR.truck), truck);
});

test("blitSprite sólido ignora fade, oclui emissão e restaura ambos os contextos", () => {
    const { scene, frame } = renderer();
    const sprite = { img: {}, glow: {}, w: 100, h: 60, solid: true };
    scene.blitSprite(frame, sprite, 45, 20, 30, 200, 90, 0.15);
    assert.equal(frame.sctx.calls.length, 1);
    assert.equal(frame.sctx.calls[0].alpha, 1);
    assert.equal(frame.ectx.calls.length, 2);
    assert.equal(frame.ectx.calls[0].mode, "destination-out");
    assert.equal(frame.ectx.calls[0].alpha, 1);
    assert.equal(frame.ectx.calls[1].mode, "source-over");
    assert.equal(frame.ectx.calls[1].args[0], sprite.glow);
    close(frame.ectx.calls[1].alpha, 0.65);
    assert.deepEqual(frame.ectx.calls[0].args, frame.sctx.calls[0].args);
    for (const ctx of [frame.sctx, frame.ectx]) {
        assert.equal(ctx.globalCompositeOperation, "source-over");
        assert.equal(ctx.globalAlpha, 1);
    }
});

test("blitSprite oclui objetos sem luz própria e preserva estado prévio não padrão", () => {
    const { scene, frame } = renderer();
    frame.sctx.globalAlpha = 0.8;
    frame.ectx.globalAlpha = 0.3;
    frame.ectx.globalCompositeOperation = "lighter";
    scene.blitSprite(frame, { img: {}, w: 100, h: 60 }, 60, 0, 0, 100, 60, 0.5);
    assert.equal(frame.ectx.calls.length, 1);
    assert.equal(frame.ectx.calls[0].mode, "destination-out");
    assert.equal(frame.ectx.calls[0].alpha, 0.5);
    assert.equal(frame.sctx.calls[0].alpha, 0.5);
    assert.equal(frame.sctx.globalAlpha, 0.8);
    assert.equal(frame.ectx.globalAlpha, 0.3);
    assert.equal(frame.ectx.globalCompositeOperation, "lighter");
});

test("drawSprite interpola posição/escala e recorta no topo da colina", () => {
    const { scene, frame } = renderer();
    const segment = {
        p1: { screen: { scale: 0.001, x: 500, y: 500 } },
        p2: { screen: { scale: 0.0005, x: 520, y: 400 } },
    };
    const sprite = { img: {}, w: 100, h: 60, worldW: 760, solid: true };
    scene.drawSprite(frame, segment, sprite, 0, 430, 0.1, 0.5);
    assert.equal(frame.sctx.calls.length, 1);
    const args = frame.sctx.calls[0].args;
    close(args[5] + args[7] / 2, 510, "centro interpolado");
    close(args[7], 285, "largura interpolada");
    close(args[6] + args[8], 430, "base recortada");
    assert.ok(args[4] > 0 && args[4] < 60);
    close(
        args[4] / 60,
        args[8] / (285 * 0.6),
        "mesmo recorte na origem e destino",
    );
    assert.equal(frame.sctx.calls[0].alpha, 1);
    scene.drawSprite(frame, segment, sprite, 0, 0, 1, 0.5);
    scene.drawSprite(frame, segment, sprite, 10, 1000, 1, 0.5);
    assert.equal(
        frame.sctx.calls.length,
        1,
        "Sprites ocultos/fora da tela não são desenhados",
    );
});

test("todos os modelos, inclusive F1, cabem nos sete yaws e têm vértices/faces válidos", () => {
    const { ND } = setup();
    const models = ND.models;
    for (const style of ["sport", "gt", "coupe", "sedan", "truck", "formula"]) {
        const mesh =
            style === "truck"
                ? models.buildTruck()
                : style === "formula"
                  ? models.buildFormulaCar(
                        [200, 80, 100],
                        [255, 60, 90],
                        [255, 220, 70],
                    )
                  : models.buildCar([200, 80, 100], [255, 60, 90], style);
        const yaws = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3];
        const fit = models.computeFit(mesh, 640, 400, yaws);
        assert.ok(fit.bodyFraction > 0 && fit.bodyFraction <= 1);
        assert.ok(mesh.f.length > 100);
        assert.ok(mesh.v.every((vertex) => vertex.every(Number.isFinite)));
        assert.ok(
            mesh.f.every(
                (face) =>
                    face.i.length >= 3 &&
                    face.i.every(
                        (index) =>
                            Number.isInteger(index) &&
                            index >= 0 &&
                            index < mesh.v.length,
                    ),
            ),
        );
        for (const yaw of yaws) {
            for (const p of models.projectAll(mesh, yaw).P) {
                const x = p[0] * fit.s + fit.ox,
                    y = p[1] * fit.s + fit.oy;
                assert.ok(Number.isFinite(x) && Number.isFinite(y));
                assert.ok(
                    x >= 0 && x <= 640 && y >= 0 && y <= 400,
                    `${style}/${yaw}: ${x}, ${y}`,
                );
            }
        }
    }
});

test("viewport escolhe divisão vertical/horizontal, cobre pixels ímpares e tela solo", () => {
    const { ND } = setup();
    const view = (...args) => Array.from(ND.util.viewportOf(...args));
    assert.deepEqual(view(1, 2, 1280, 720), [640, 0, 640, 720]);
    assert.deepEqual(view(1, 2, 390, 844), [0, 422, 390, 422]);
    assert.deepEqual(view(0, 1, 391, 845), [0, 0, 391, 845]);
    for (const [w, h] of [
        [1281, 721],
        [391, 845],
        [1000, 800],
    ]) {
        const a = view(0, 2, w, h),
            b = view(1, 2, w, h);
        assert.equal(a[2] * a[3] + b[2] * b[3], w * h);
        assert.equal(b[0] + b[2], w);
        assert.equal(b[1] + b[3], h);
        assert.ok(a[0] + a[2] === b[0] || a[1] + a[3] === b[1]);
    }
});

test("módulos executam na ordem do HTML, sem boot e sem globals além de NeonDrive", () => {
    const env = game();
    env.ND.createSceneRenderer();
    env.ND.createCockpitRenderer();
    env.ND.createHUD();
    assert.deepEqual(
        env.executed,
        scripts
            .filter((script) => !syntaxOnly.has(script.src))
            .map((script) => script.src),
    );
    assert.equal(env.executed[0], "js/core/utils.js");
    assert.equal(env.context.__err, undefined);
    assert.equal(env.context.boot, undefined);
    assert.deepEqual(
        env.globalNames().filter((key) => !env.initialGlobals.includes(key)),
        ["NeonDrive"],
    );
    for (const name of [
        "createWorld",
        "createRace",
        "createInput",
        "createAudio",
        "createUI",
    ])
        assert.equal(typeof env.ND[name], "function", name);
});

test("sprites completos e F1 lazy são gerados de verdade, com atlas consistente e idempotência", () => {
    const { ND } = setup();
    const SPR = ND.assets.buildSprites(3200);
    const player = SPR.player,
        angles = SPR.playerAngles,
        cars = SPR.cars;
    assert.equal(SPR.formulaPlayers.length, 0);
    assert.equal(SPR.formulaCars.length, 0);
    assert.equal(ND.assets.buildFormulaSprites(SPR), SPR);
    assert.equal(SPR.player, player);
    assert.equal(SPR.playerAngles, angles);
    assert.equal(SPR.cars, cars);
    assert.equal(SPR.formulaPlayers.length, 3);
    assert.ok(SPR.formulaPlayers.every((atlas) => atlas.length === 7));
    assert.equal(SPR.formulaCars.length, 6);
    const formulaPlayers = SPR.formulaPlayers,
        formulaCars = SPR.formulaCars;
    ND.assets.buildFormulaSprites(SPR);
    assert.equal(SPR.formulaPlayers, formulaPlayers);
    assert.equal(SPR.formulaCars, formulaCars);
    for (const sprite of [
        ...angles,
        ...cars,
        SPR.truck,
        ...formulaPlayers.flat(),
        ...formulaCars,
    ]) {
        assert.equal(sprite.img.width, sprite.w);
        assert.equal(sprite.img.height, sprite.h);
        assert.equal(sprite.glow.width, sprite.w);
        assert.equal(sprite.solid, true);
        assert.ok(sprite.bodyW > 0 && sprite.worldW >= sprite.bodyW);
    }
});

test("display resize gera overlays com gradients/imageData e mantém dimensões", () => {
    const { ND } = setup();
    const display = ND.createDisplay(canvas(1000, 600));
    assert.equal(display.resize(2), true);
    assert.equal(display.width, 1000);
    assert.equal(display.height, 600);
    assert.equal(display.resize(2), false);
    display.begin();
    display.beginView([0, 0, 500, 600]);
    display.endView();
    display.composite({
        speed: 0,
        maxSpeed: 25000,
        boost: 0,
        shake: 0,
        flash: 0,
        quality: 2,
    });
});

test("colisão real só reduz velocidade dentro da soma das meias-larguras", () => {
    const { world, race, SPR } = game({ mode: "classic" });
    const contact =
        world.vehicleHalfWidth(SPR.player) + world.vehicleHalfWidth(SPR.truck);
    function speedAfter(offset) {
        race.reset();
        play(race);
        world.traffic.splice(1);
        Object.assign(world.traffic[0], {
            sprite: SPR.truck,
            z: 0,
            speed: 0,
            offset,
            lane: offset,
            laneT: 20,
        });
        world.syncTraffic();
        Object.assign(race.players[0], { speed: race.maxSpeed, playerX: 0 });
        race.update(1 / 60, gas);
        return race.players[0].speed;
    }
    close(speedAfter(contact - 0.001), race.maxSpeed * race.difficulty.crash);
    close(speedAfter(contact + 0.001), race.maxSpeed);
    close(speedAfter(2 / world.LANES), race.maxSpeed);
});

const circuitIDs = ["interlagos", "monaco", "monza", "suzuka"];
for (let circuit = 0; circuit < 4; circuit++) {
    for (let difficulty = 0; difficulty < 3; difficulty++) {
        for (const numPlayers of [1, 2]) {
            test(`F1 integração ${circuitIDs[circuit]} / dificuldade ${difficulty} / ${numPlayers}P: mundo, grid, largada e chegada`, () => {
                const { ND, world, race, SPR } = game({
                    circuit,
                    difficulty,
                    numPlayers,
                });
                assert.equal(race.mode, "formula");
                assert.equal(world.circuit.id, circuitIDs[circuit]);
                assert.equal(world.ROADW, 2600);
                assert.equal(
                    world.trackLength,
                    world.segments.length * world.SEGLEN,
                );
                assert.ok(world.trackLength > 0);
                assert.equal(world.startLineZ, 0);
                assert.equal(world.segments[0].p1.world.y, 0);
                assert.equal(world.segments.at(-1).p2.world.y, 0);
                assert.equal(world.segments[0].curve, 0);
                assert.equal(world.segments.at(-1).curve, 0);
                assert.ok(world.segments.some((seg) => seg.curve < 0));
                assert.ok(world.segments.some((seg) => seg.curve > 0));
                for (let i = 0; i < world.segments.length; i++) {
                    const seg = world.segments[i];
                    assert.equal(seg.index, i);
                    assert.equal(seg.p1.world.z, i * world.SEGLEN);
                    assert.equal(seg.p2.world.z, (i + 1) * world.SEGLEN);
                    assert.ok(
                        Number.isFinite(seg.curve) &&
                            Number.isFinite(seg.p2.world.y),
                    );
                    if (i)
                        assert.equal(
                            seg.p1.world.y,
                            world.segments[i - 1].p2.world.y,
                        );
                }
                const sectionNames = Array.from(
                    new Set(world.segments.map((seg) => seg.section)),
                );
                assert.deepEqual(
                    sectionNames,
                    Array.from(
                        ND.circuits[circuit].sections,
                        (section) => section.name,
                    ),
                );
                assert.equal(
                    world.findSegment(world.trackLength),
                    world.segments[0],
                );
                assert.equal(world.findSegment(-1), world.segments.at(-1));
                assert.equal(
                    world.segments.filter((seg) => seg.startLine).length,
                    1,
                );
                assert.ok(
                    world.segments.filter((seg) => seg.grid).length * 2 >= 12,
                );
                assert.equal(world.pickups.length, 0);
                assert.ok(
                    world.segments.every((seg) =>
                        seg.sprites.every((ob) => !ob.pk),
                    ),
                );
                assert.equal(race.players.length, numPlayers);
                assert.equal(world.traffic.length + race.players.length, 12);
                assert.equal(
                    new Set(world.traffic.map((car) => car.z)).size,
                    12 - numPlayers,
                );
                assert.deepEqual(
                    [...new Set(world.traffic.map((car) => car.offset))].sort(),
                    [-0.46, 0.46],
                );
                for (const car of world.traffic) {
                    assert.equal(car.kind, "formula");
                    assert.equal(car.sprite.kind, "formula");
                    assert.ok(SPR.formulaCars.includes(car.sprite));
                    assert.ok(
                        car.z > world.startLineZ && car.z < world.trackLength,
                    );
                    assert.ok(
                        Math.abs(car.offset) +
                            world.vehicleHalfWidth(car.sprite) <
                            1,
                    );
                    assert.ok(car.seg.cars.includes(car));
                    assert.equal(car.speed, 0);
                }
                race.players.forEach((p, i) => {
                    assert.equal(p.sprite.kind, "formula");
                    assert.equal(p.position, world.startLineZ);
                    assert.equal(p.distance, 0);
                    assert.equal(
                        p.rank,
                        12 - numPlayers + i + 1,
                        "IA do grid começa à frente",
                    );
                });
                if (numPlayers === 2)
                    assert.notEqual(
                        race.players[0].playerX,
                        race.players[1].playerX,
                    );
                const table = race.standings();
                assert.equal(table.length, 12);
                assert.equal(new Set(table.map((r) => r.racerID)).size, 12);
                assert.ok(
                    table.slice(0, 12 - numPlayers).every((r) => !r.isPlayer),
                );
                assert.equal(race.state, "menu");
                assert.equal(race.countdown, 3);
                race.state = "play";
                race.update(3, controls(race));
                assert.equal(race.elapsed, 0);
                assert.ok(
                    race.players.every(
                        (p) => p.speed === 0 && p.distance === 0,
                    ),
                );
                assert.ok(world.traffic.every((car) => car.speed === 0));
                race.update(1 / 60, controls(race));
                close(race.elapsed, 1 / 60);
                assert.ok(race.players.every((p) => p.distance > 0));

                awayFromFinish(world);
                race.elapsed = 60;
                race.players.forEach((p, i) =>
                    beforeLine(race, p, 3, i ? 100 : 300),
                );
                race.update(0.04, controls(race));
                race.players.forEach((p, i) => {
                    assert.equal(p.finished, true);
                    assert.equal(p.distance, world.trackLength * 3);
                    assert.equal(p.position, world.startLineZ);
                    assert.equal(p.laps, 3);
                    close(
                        p.finishTime,
                        60 + (i ? 100 : 300) / race.maxSpeed,
                        "chegada interpolada",
                    );
                    assert.equal(p.rank, numPlayers === 2 && i === 0 ? 2 : 1);
                });
                assert.equal(race.isOver(), true);
            });
        }
    }
}

test("os quatro circuitos têm perfis e trechos característicos distintos", () => {
    const characteristic = [
        "S do Senna — entrada",
        "Túnel",
        "Parabolica",
        "130R",
    ];
    const signatures = circuitIDs.map((id, circuit) => {
        const { world } = game({ circuit });
        assert.equal(world.circuit.id, id);
        assert.ok(
            world.segments.some(
                (seg) => seg.section === characteristic[circuit],
            ),
        );
        assert.ok(world.segments.some((seg) => seg.p2.world.y !== 0));
        return JSON.stringify(
            world.segments.map((seg) => [seg.curve, seg.p2.world.y]),
        );
    });
    assert.equal(new Set(signatures).size, 4);
});

test("F1 ranking integrado muda quando a IA ultrapassa um humano por progresso real", () => {
    const { world, race } = game();
    play(race);
    const p = race.players[0];
    p.distance = p.position = 12000;
    p.playerX = 0;
    race.update(0.01, {});
    assert.equal(p.rank, 1);
    const before = world.traffic.map((car) => car.progress);
    for (let tick = 0; tick < 30; tick++) race.update(0.1, {});
    assert.ok(world.traffic.every((car, i) => car.progress > before[i]));
    const ahead = world.traffic.filter((car) => car.progress > p.distance);
    assert.ok(ahead.length > 0, "A ultrapassagem ocorreu fisicamente");
    assert.equal(
        p.rank,
        ahead.length + 1,
        "Ranking não pode ler distance inicial enquanto a IA avança progress",
    );
    const table = race.standings();
    for (const car of world.traffic) {
        const entry = table.find((r) => r.racerID === car.racerID);
        close(entry.distance, car.progress, "distância publicada da IA");
    }
});

for (const numPlayers of [1, 2]) {
    test(`F1 countdown congela física, tráfego e relógio (${numPlayers}P)`, () => {
        const { race } = game({ numPlayers });
        race.state = "play";
        const before = raceState(race);
        let reads = 0;
        for (const dt of [0.75, 0.75, 1.5])
            race.update(dt, () => {
                reads++;
                return gas;
            });
        assert.equal(
            reads,
            0,
            "Controles não devem alimentar física durante a contagem",
        );
        assert.equal(race.countdown, 0);
        assert.deepEqual(raceState(race), { ...before, countdown: 0 });
    });
}

test("fim parcial do countdown usa somente o restante do dt para clock, física e IA", () => {
    const partial = game(),
        direct = game();
    partial.race.state = "play";
    partial.race.countdown = 0.1;
    play(direct.race);
    partial.race.update(0.25, gas);
    direct.race.update(0.15, gas);
    close(partial.race.elapsed, 0.15);
    close(partial.race.players[0].speed, direct.race.players[0].speed);
    close(partial.race.players[0].distance, direct.race.players[0].distance);
    close(partial.world.traffic[0].progress, direct.world.traffic[0].progress);
    assert.equal(partial.race.countdown, 0);
    assert.ok(partial.race.players[0].speed > 0);
});

for (const mode of ["classic", "formula"]) {
    test(`${mode}: elapsed e tráfego consomem dt uma vez, não uma vez por jogador`, () => {
        const one = game({ mode }),
            two = game({ mode, numPlayers: 2 });
        const formulaDriver =
            mode === "formula"
                ? {
                      ...one.world.traffic[0].driver,
                      acceleration: 0.5,
                      pace: 0.9,
                  }
                : null;
        const movements = [];
        for (const { world, race } of [one, two]) {
            play(race);
            if (mode === "classic") {
                assert.ok(world.pickups.length > 0);
                world.pickups[0].taken = 1;
                world.pickups[0].t = 5;
            }
            const car = world.traffic[0],
                before = mode === "formula" ? car.progress : car.z;
            if (mode === "formula") {
                // Mesmo perfil em 1P/2P; reação de largada não pode mascarar dt duplicado.
                car.launchDelay = 0;
                car.driver = { ...formulaDriver };
            }
            race.update(0.125, []);
            close(race.elapsed, 0.125);
            const moved =
                mode === "formula"
                    ? car.progress - before
                    : (car.z - before + world.trackLength) % world.trackLength;
            assert.ok(
                moved > 0,
                `${race.players.length}P: tráfego precisa realmente se mover`,
            );
            close(moved, car.speed * 0.125, "tráfego atualizado uma vez");
            movements.push(moved);
            if (mode === "classic") {
                close(world.pickups[0].t, 4.875, "cooldown do pickup uma vez");
                assert.equal(world.pickups[0].taken, 1);
            }
        }
        close(movements[0], movements[1], "mesmo passo de tráfego em 1P e 2P");
    });

    test(`${mode}: pausa congela todos os estados e retoma sem compensar tempo pausado`, () => {
        const { world, race } = game({ mode, numPlayers: 2 });
        play(race);
        race.update(0.1, controls(race));
        if (world.pickups.length)
            Object.assign(world.pickups[0], { taken: 1, t: 4 });
        race.state = "paused";
        const before = raceState(race);
        race.update(30, controls(race));
        race.update(30, controls(race), true);
        assert.deepEqual(raceState(race), before);
        race.state = "play";
        race.update(0.1, controls(race));
        close(race.elapsed, before.elapsed + 0.1);
    });

    test(`${mode}: reset limpa resultados, física, relógios, efeitos e pickups`, () => {
        const { world, race } = game({ mode, numPlayers: 2 });
        play(race);
        if (mode === "formula") {
            awayFromFinish(world);
            race.players.forEach((p) => beforeLine(race, p, 3, 100));
            race.update(0.1, controls(race));
        } else {
            race.players.forEach((p) => {
                p.timeLeft = 0.01;
            });
            race.update(0.1, controls(race));
        }
        assert.equal(race.isOver(), true);
        const previousPlayers = race.players,
            previousTraffic = world.traffic;
        race.players.forEach((p) => {
            p.score = 1234;
            p.bestLap = 12;
            p.lastLap = 13;
            p.lapStarted = 25;
            p.boostT = 2;
            p.combo = 5;
            p.nitroCharges = 0;
            p.particles.push({ life: 1 });
            p.sparks.push({ life: 1 });
            p.floats.push({ life: 1 });
        });
        world.pickups.forEach((pk) => {
            pk.taken = 1;
            pk.t = 16;
        });
        assert.equal(race.reset(), race);
        assert.notEqual(race.players, previousPlayers);
        assert.notEqual(world.traffic, previousTraffic);
        assert.equal(race.state, "menu");
        assert.equal(race.elapsed, 0);
        assert.equal(race.countdown, mode === "formula" ? 3 : 0);
        assert.equal(race.isOver(), false);
        for (const p of race.players) {
            for (const key of [
                "distance",
                "position",
                "speed",
                "score",
                "bestLap",
                "lastLap",
                "lapStarted",
                "boostT",
                "dead",
            ])
                assert.equal(p[key], 0, key);
            assert.equal(p.finished, false);
            assert.equal(p.finishTime, null);
            assert.equal(p.laps, 1);
            assert.equal(p.combo, 1);
            assert.equal(p.nitroCharges, race.difficulty.start);
            assert.equal(
                p.particles.length + p.sparks.length + p.floats.length,
                0,
            );
        }
        assert.ok(world.pickups.every((pk) => pk.taken === 0 && pk.t === 0));
        assert.ok(world.traffic.every((car) => car.seg.cars.includes(car)));
        assert.ok(
            world.segments.every((seg) =>
                seg.cars.every((car) => !previousTraffic.includes(car)),
            ),
        );
        assert.ok(race.standings().every((r) => !r.finished && !r.dead));
        if (mode === "formula") {
            assert.ok(
                world.traffic.every(
                    (car) =>
                        car.speed === 0 &&
                        car.progress === car.z &&
                        car.finishTime === null,
                ),
            );
            assert.equal(
                race.players[0].rank,
                11,
                "Classificação final não vaza para nova corrida",
            );
        }
    });
}

test("pickup clássico expira exatamente uma vez e volta a ficar disponível", () => {
    const { world, race } = game({ mode: "classic", numPlayers: 2 });
    play(race);
    const pk = world.pickups[0];
    Object.assign(pk, { taken: 1, t: 0.25 });
    race.update(0.125, []);
    assert.equal(pk.taken, 1);
    close(pk.t, 0.125);
    race.update(0.125, []);
    assert.equal(pk.taken, 0);
    assert.equal(pk.t, 0);
});

test("F1 não termina antes da linha; terceira volta limita distância e interpola o instante", () => {
    const { world, race } = game();
    play(race);
    awayFromFinish(world);
    race.elapsed = 42;
    const p = race.players[0];
    beforeLine(race, p, 3, 1000);
    p.lapStarted = 30;
    race.update(0.03, gas);
    assert.equal(p.finished, false);
    assert.equal(race.isOver(), false);
    close(p.distance, 3 * world.trackLength - 250);
    race.update(0.02, gas);
    assert.equal(p.finished, true);
    assert.equal(p.distance, 3 * world.trackLength);
    assert.equal(p.position, world.startLineZ);
    assert.equal(p.laps, 3);
    close(p.finishTime, 42.04);
    close(p.lastLap, 12.04);
    close(p.bestLap, 12.04);
    close(race.elapsed, 42.05);
});

test("F1 P2 cruza antes de P1 no mesmo tick: ranks e resultado seguem frações de tempo", () => {
    const { world, race } = game({ numPlayers: 2 });
    play(race);
    awayFromFinish(world);
    race.elapsed = 60;
    const [p1, p2] = race.players;
    beforeLine(race, p1, 3, 1800);
    beforeLine(race, p2, 3, 600);
    race.update(0.1, controls(race));
    close(p1.finishTime, 60.072);
    close(p2.finishTime, 60.024);
    assert.equal(p1.rank, 2);
    assert.equal(p2.rank, 1);
    assert.deepEqual(
        Array.from(race.standings().slice(0, 2), (r) => r.playerIndex),
        [1, 0],
    );
    const results = race.results();
    assert.ok(results.subtitle.includes(p2.label));
    assert.equal(results.headline, "1º / 12");
    assert.ok(results.rows[0].label.includes(p2.label));
});

test("F1 piloto finalizado fica congelado até o outro terminar; fim é imutável", () => {
    const { world, race } = game({ numPlayers: 2 });
    play(race);
    awayFromFinish(world);
    race.elapsed = 50;
    const [p1, p2] = race.players;
    beforeLine(race, p1, 3, 100);
    beforeLine(race, p2, 3, 10000);
    race.update(0.02, controls(race));
    assert.equal(p1.finished, true);
    assert.equal(p2.finished, false);
    assert.equal(race.isOver(), false);
    const frozen = racerState(p1),
        elapsed = race.elapsed,
        secondDistance = p2.distance;
    race.update(0.02, [{ ...gas, nitro: true, right: true, drift: true }, gas]);
    assert.deepEqual(racerState(p1), frozen);
    assert.ok(p2.distance > secondDistance);
    close(race.elapsed, elapsed + 0.02);
    close(race.hudFor(0).elapsed, p1.finishTime);
    beforeLine(race, p2, 3, 100);
    race.update(0.02, controls(race));
    assert.equal(race.isOver(), true);
    assert.deepEqual(racerState(p1), frozen);
    const final = raceState(race),
        standings = plain(race.standings());
    race.update(5, controls(race));
    assert.deepEqual(raceState(race), final);
    const detached = race.standings();
    detached[0].rank = 99;
    detached.reverse();
    assert.deepEqual(plain(race.standings()), standings);
});

test("F1 calcula última/melhor volta e repõe nitro em cada uma das três passagens", () => {
    const { world, race } = game();
    play(race);
    awayFromFinish(world);
    const p = race.players[0];
    p.nitroCharges = 0;
    const crossings = [12.01, 22.01, 35.01];
    for (let lap = 1; lap <= 3; lap++) {
        race.elapsed = crossings[lap - 1] - 0.01;
        beforeLine(race, p, lap, 250);
        race.update(0.02, gas);
        close(p.lastLap, crossings[lap - 1] - (crossings[lap - 2] || 0));
        close(p.bestLap, lap === 1 ? 12.01 : 10);
        close(p.lapStarted, crossings[lap - 1]);
        assert.equal(p.nitroCharges, lap);
        assert.equal(p.finished, lap === 3);
        assert.equal(p.dead, 0, "F1 não morre com timeLeft = 0");
        assert.equal(p.timeLeft, 0);
    }
    close(race.hudFor(0).bestLap, 10);
    close(race.standings()[0].bestLap, 10);
    close(race.standings()[0].lastLap, 13);
});

test("F1 advance aceita múltiplas voltas no passo sem overshoot nem quarta volta", () => {
    const { ND, world, race } = game();
    const p = race.players[0];
    p.nitroCharges = 0;
    const step = ND.modes.formula.advance(
        p,
        world.trackLength * 3.5,
        7,
        0,
        world,
    );
    assert.equal(step.laps, 3);
    assert.equal(step.moved, world.trackLength * 3);
    close(step.dt, 6);
    close(p.finishTime, 6);
    close(p.lastLap, 2);
    close(p.bestLap, 2);
    assert.equal(p.nitroCharges, 3);
    assert.equal(p.laps, 3);
    const frozen = racerState(p);
    const after = ND.modes.formula.advance(p, world.trackLength, 5, 7, world);
    assert.equal(after.moved, 0);
    assert.equal(after.dt, 0);
    assert.deepEqual(racerState(p), frozen);
});

test("F1 classificação pura ordena por chegada/progresso sem mutar entradas", () => {
    const { ND } = setup();
    const racers = [
        { racerID: 0, finished: false, distance: 200 },
        { racerID: 1, finished: true, finishTime: 12, distance: 100 },
        { racerID: 2, finished: true, finishTime: 11, distance: 100 },
        { racerID: 3, finished: false, distance: 300 },
    ];
    const before = plain(racers);
    const table = ND.modes.formula.standings(racers);
    assert.deepEqual(
        Array.from(table, (r) => r.racerID),
        [2, 1, 3, 0],
    );
    assert.deepEqual(
        Array.from(table, (r) => r.rank),
        [1, 2, 3, 4],
    );
    assert.deepEqual(racers, before);
    assert.notEqual(table[0], racers[2]);
});

test("formatação de voltas trata minutos, milissegundos e tempos indisponíveis", () => {
    const { ND } = setup();
    assert.equal(ND.modes.formula.formatTime(0), "0:00.000");
    assert.equal(ND.modes.formula.formatTime(61.234), "1:01.234");
    for (const value of [null, undefined, -1, NaN, Infinity])
        assert.equal(ND.modes.formula.formatTime(value), "--:--.---");
});

for (let difficulty = 0; difficulty < 3; difficulty++) {
    test(`dificuldade ${difficulty}: preserva clássico e aplica regras próprias da F1`, () => {
        const classic = game({ mode: "classic", difficulty });
        const formula = game({ difficulty });
        const expected = [
            { time: 95, cp: 22, cars: 44, start: 2, nitro: 4, crash: 0.45 },
            { time: 80, cp: 15, cars: 62, start: 1, nitro: 3, crash: 0.3 },
            { time: 62, cp: 11, cars: 86, start: 1, nitro: 2, crash: 0.18 },
        ][difficulty];
        for (const [key, value] of Object.entries(expected))
            assert.equal(classic.race.difficulty[key], value, key);
        assert.equal(classic.world.traffic.length, expected.cars);
        assert.equal(classic.race.players[0].timeLeft, expected.time);
        assert.equal(classic.race.players[0].nitroCharges, expected.start);
        assert.equal(formula.race.difficulty.crash, expected.crash);
        assert.equal(formula.race.players[0].timeLeft, 0);
        assert.equal(formula.race.nitroMax, 3);
        assert.equal(formula.race.players[0].nitroCharges, 3);
        assert.equal(formula.world.traffic.length, 11);
        assert.equal(
            formula.ND.difficulties[difficulty].time,
            expected.time,
            "configure não deve mutar dificuldade compartilhada",
        );
        // Isola a dificuldade usando o MESMO piloto, já após a reação de largada.
        // A nova IA não tem velocidade/aceleração definidas pelo índice do grid.
        formula.world.traffic.splice(1);
        formula.world.traffic[0].launchDelay = 0;
        formula.world.traffic[0].driver.pace = 0.68;
        formula.world.traffic[0].driver.acceleration = 0.5;
        formula.world.updateTraffic(3, {
            mode: "formula",
            maxSpeed: formula.race.maxSpeed,
            elapsed: 0,
        });
        close(
            formula.world.traffic[0].speed / formula.race.maxSpeed,
            [0.68, 0.76, 0.78][difficulty],
        );
    });
}

for (let circuit = 0; circuit < 4; circuit++) {
    test(`F1 IA ${circuitIDs[circuit]}: todas terminam com elapsed absoluto em 3 dificuldades e 1–2P`, () => {
        for (const difficulty of [0, 1, 2]) {
            for (const numPlayers of [1, 2]) {
                const { world, race } = game({
                    circuit,
                    difficulty,
                    numPlayers,
                });
                const epoch = 123,
                    dt = 0.25;
                let elapsed = epoch;
                // Limite generoso, mas finito: impede hangs se uma IA não chega.
                const limit = Math.ceil(
                    ((3 * world.trackLength) / (race.maxSpeed * 0.3) + 10) / dt,
                );
                for (
                    let tick = 0;
                    tick < limit && world.traffic.some((car) => !car.finished);
                    tick++
                ) {
                    const before = world.traffic.map((car) => ({
                        progress: car.progress,
                        finished: car.finished,
                    }));
                    world.updateTraffic(dt, {
                        mode: "formula",
                        maxSpeed: race.maxSpeed,
                        elapsed,
                    });
                    world.traffic.forEach((car, i) => {
                        assert.ok(
                            car.progress >= before[i].progress &&
                                car.progress <= world.trackLength * 3,
                        );
                        if (car.finished && !before[i].finished) {
                            assert.ok(
                                car.finishTime >= elapsed &&
                                    car.finishTime <= elapsed + dt,
                                `d${difficulty}/${numPlayers}P: chegada deve usar elapsed no início do passo`,
                            );
                        }
                    });
                    elapsed += dt;
                }
                assert.ok(
                    world.traffic.every((car) => car.finished),
                    `d${difficulty}/${numPlayers}P: todas devem terminar`,
                );
                for (const car of world.traffic) {
                    assert.equal(car.progress, world.trackLength * 3);
                    assert.equal(car.z, world.startLineZ);
                    assert.equal(car.speed, 0);
                    assert.equal(car.seg, null);
                    assert.ok(
                        car.finishTime > epoch && car.finishTime <= elapsed,
                    );
                }
                assert.ok(world.segments.every((seg) => seg.cars.length === 0));
                const frozen = Array.from(world.traffic, racerState);
                world.updateTraffic(10, {
                    mode: "formula",
                    maxSpeed: race.maxSpeed,
                    elapsed,
                });
                assert.deepEqual(Array.from(world.traffic, racerState), frozen);
            }
        }
    });
}

test("F1 world interpola chegadas de todas as IAs dentro do mesmo tick", () => {
    const { world, race } = game({ numPlayers: 2 });
    world.updateTraffic(0.01, {
        mode: "formula",
        maxSpeed: race.maxSpeed,
        elapsed: 0,
    });
    // Cada piloto em pista livre: empilhar dez carros no mesmo ponto agora
    // corretamente aciona frenagem, não é uma fixture válida de cronometragem.
    const cars = Array.from(world.traffic);
    cars.forEach((car, i) => {
        const remaining = 100 + i * 50;
        car.progress = car.distance = 3 * world.trackLength - remaining;
        car.z = world.trackLength - remaining;
        car.speed = car.targetSpeed;
        car.launchDelay = 0;
        const expected = 80 + remaining / car.speed;
        world.traffic = [car];
        world.syncTraffic();
        world.updateTraffic(0.1, {
            mode: "formula",
            maxSpeed: race.maxSpeed,
            elapsed: 80,
        });
        assert.equal(car.finished, true);
        close(car.finishTime, expected, `IA ${i}`);
        assert.equal(car.seg, null);
    });
});

test("F1 integração publica voltas e melhor volta das IAs no HUD/resultados", () => {
    const { world, race } = game();
    play(race);
    // Humano parado mantém a corrida aberta enquanto o pelotão completa a prova.
    for (
        let tick = 0;
        tick < 1000 && world.traffic.some((car) => !car.finished);
        tick++
    )
        race.update(0.25, {});
    assert.ok(world.traffic.every((car) => car.finished));
    const table = race.standings().filter((entry) => !entry.isPlayer);
    assert.equal(table.length, 11);
    for (const entry of table) {
        assert.equal(
            entry.laps,
            3,
            "Voltas da IA devem acompanhar o progresso físico",
        );
        assert.ok(
            entry.lastLap > 0 && entry.bestLap > 0,
            "Cronometragem de voltas da IA deve ser publicada",
        );
        assert.ok(entry.bestLap <= entry.lastLap);
        close(
            entry.distance,
            3 * world.trackLength,
            "distância final publicada da IA",
        );
    }
    assert.equal(race.hudFor(0).rank, 12);
    assert.ok(
        race
            .results()
            .rows.filter((row) => row.label.includes("PILOTO IA"))
            .every((row) => !row.value.includes("--:--.---")),
    );
});

test("clássico continua cronometrado: morte limita movimento à fração de tempo restante", () => {
    const { world, race } = game({ mode: "classic" });
    play(race);
    awayFromFinish(world);
    const p = race.players[0];
    p.speed = race.maxSpeed;
    p.timeLeft = 0.05;
    race.update(0.1, gas);
    assert.equal(p.dead, 1);
    assert.equal(p.timeLeft, 0);
    assert.equal(p.finished, false);
    assert.equal(p.finishTime, null);
    close(p.distance, race.maxSpeed * 0.05);
    close(p.position, p.distance);
    assert.equal(race.isOver(), true);
});

test("clássico não encerra na terceira volta e recompensa checkpoint antes de consumir o restante", () => {
    const { world, race } = game({ mode: "classic" });
    play(race);
    awayFromFinish(world);
    const p = race.players[0];
    beforeLine(race, p, 3, 210);
    p.checkpoint = 11;
    p.timeLeft = 1;
    race.update(0.02, gas);
    assert.equal(p.finished, false);
    assert.equal(p.dead, 0);
    assert.equal(race.isOver(), false);
    assert.equal(p.laps, 4);
    assert.equal(p.checkpoint, 12);
    close(p.distance, world.trackLength * 3 + 210);
    close(p.timeLeft, 1 + race.difficulty.cp - 0.02);
    assert.ok(p.score >= 2500);
});

test("checkpoint clássico posterior à morte não ressuscita o jogador", () => {
    const { world, race } = game({ mode: "classic" });
    play(race);
    awayFromFinish(world);
    const p = race.players[0],
        quarter = world.trackLength / 4;
    p.position = p.distance = quarter - 210;
    p.playerX = 0;
    p.speed = race.maxSpeed;
    p.timeLeft = 0.005;
    race.update(0.02, gas);
    assert.equal(p.dead, 1);
    assert.equal(p.checkpoint, 0);
    assert.equal(p.timeLeft, 0);
    close(p.distance, quarter - 105);
    assert.ok(p.score < 2500);
});

test("dt inválido e estados menu/over não avançam a simulação", () => {
    const { race } = game({ numPlayers: 2 });
    for (const state of ["menu", "over", "play"]) {
        race.state = state;
        const before = raceState(race);
        for (const dt of [0, -1, NaN, Infinity, undefined])
            race.update(dt, controls(race));
        if (state !== "play") race.update(10, controls(race));
        assert.deepEqual(raceState(race), before);
    }
});

test("prévia F1 avança IA continuamente sem consumir progresso, voltas ou largada", () => {
    const { race, world } = game();
    const car = world.traffic[0],
        initial = car.progress;
    for (let i = 0; i < 90; i++) race.update(1 / 60, [], true);
    const z = car.z;
    race.update(1 / 60, [], true);
    close((car.z - z + world.trackLength) % world.trackLength, car.speed / 60);
    assert.ok(z > initial + world.SEGLEN);
    assert.equal(car.progress, initial);
    assert.equal(car.distance, initial);
    assert.equal(car.laps, 1);
    assert.equal(car.bestLap, 0);
    assert.equal(race.elapsed, 0);
    assert.equal(race.countdown, 3);
    assert.ok(car.seg.cars.includes(car));
    race.reset();
    assert.equal(world.traffic[0].z, initial);
});
