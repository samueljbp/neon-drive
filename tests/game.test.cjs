const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Exercita o código real do HTML sem dependências e sem iniciar áudio/animação.
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (m) => m[1],
);
const source = scripts[1]
    .replace(
        /try\s*\{\s*boot\(\);\s*\}/,
        "try{ /* inicialização controlada pelo teste */ }",
    )
    .replace(/^\s*\(function\s*\(\)\s*\{/, "")
    .replace(/\}\)\(\);\s*$/, "");

function context2d() {
    const calls = [],
        stack = [];
    const target = {
        calls,
        globalAlpha: 1,
        globalCompositeOperation: "source-over",
        save() {
            stack.push([this.globalAlpha, this.globalCompositeOperation]);
        },
        restore() {
            [this.globalAlpha, this.globalCompositeOperation] = stack.pop();
        },
        drawImage(...args) {
            calls.push({
                alpha: this.globalAlpha,
                mode: this.globalCompositeOperation,
                args,
            });
        },
    };
    return new Proxy(target, {
        get(obj, key) {
            return key in obj ? obj[key] : () => {};
        },
    });
}

function setup() {
    function element() {
        const ctx = context2d();
        return {
            classList: { add() {}, remove() {} },
            addEventListener() {},
            appendChild() {},
            setAttribute() {},
            getContext: () => ctx,
            clientWidth: 1280,
            clientHeight: 720,
        };
    }
    const env = vm.createContext({
        document: {
            createElement: element,
            getElementById: element,
            body: element(),
            addEventListener() {},
        },
        window: { addEventListener() {} },
        navigator: {},
        console,
    });
    vm.runInContext(source, env);
    return env;
}

function run(env, code) {
    return vm.runInContext(code, env);
}

test("todos os scripts inline têm sintaxe válida", () => {
    scripts.forEach((script) => new vm.Script(script));
    new vm.Script(source);
    assert.match(source, /inicialização controlada pelo teste/);
});

test("pista 45% mais larga e quatro centros de faixa simétricos", () => {
    const game = setup();
    assert.equal(game.ROADW, 3200);
    assert.ok(game.ROADW / 2200 > 1.45);
    assert.equal(game.LANES, 4);
    assert.deepEqual(
        Array.from({ length: 4 }, (_, i) => game.laneOffset(i)),
        [-0.75, -0.25, 0.25, 0.75],
    );
});

test("tráfego e nitro usam as quatro faixas e o pórtico acompanha a largura", () => {
    const game = setup();
    run(
        game,
        `
    var placeholder={worldW:760};
    SPR={player:{worldW:840},cars:[placeholder],truck:{worldW:1080},palms:[placeholder],
      towers:[placeholder],rocks:[placeholder],cactus:[placeholder],pines:[placeholder],
      conts:[placeholder],ice:[placeholder],signs:[placeholder],lamp:placeholder,
      rail:placeholder,crane:placeholder,stack:placeholder,arch:placeholder,nitro:placeholder};
    buildTrack();
  `,
    );
    assert.equal(game.traffic.length, game.DF().cars);
    for (const car of game.traffic) {
        assert.equal(car.lane, game.laneOffset(car.laneIndex));
        assert.ok(Math.abs(car.offset) + game.vehicleHalfWidth(car.sprite) < 1);
        assert.ok(car.seg.cars.includes(car));
    }
    const lanes = new Set();
    for (const segment of game.segments) {
        for (const object of segment.sprites)
            if (object.pk) lanes.add(object.offset);
    }
    assert.deepEqual(
        [...lanes].sort((a, b) => a - b),
        [-0.75, -0.25, 0.25, 0.75],
    );
    assert.match(source, /makeSprite\(\s*1000,\s*540,\s*ROADW\s*\*\s*3\.10?/);
});

test("colisões respeitam largura do veículo e deixam espaço entre faixas", () => {
    const game = setup();
    const player = game.vehicleHalfWidth({ worldW: 840 });
    const car = game.vehicleHalfWidth({ worldW: 760 });
    const truck = game.vehicleHalfWidth({ worldW: 1080 });
    assert.ok(truck > car);
    assert.ok(player + truck < 2 / game.LANES);
    assert.equal(game.vehicleHalfWidth({ worldW: 1400, bodyW: 840 }), player);
    assert.match(source, /d < contactW/);
});

test("carro sólido ignora fade, apaga emissão atrás e restaura o contexto", () => {
    const game = setup();
    const sprite = { img: {}, glow: {}, w: 100, h: 60, solid: true };
    game.blitSprite(sprite, 45, 20, 30, 200, 90, 0.15);
    assert.equal(game.sctx.calls[0].alpha, 1);
    assert.equal(game.ectx.calls[0].mode, "destination-out");
    assert.equal(game.ectx.calls[0].alpha, 1);
    assert.equal(game.ectx.calls[1].mode, "source-over");
    assert.deepEqual(
        game.ectx.calls[0].args.slice(1),
        game.sctx.calls[0].args.slice(1),
    );
    assert.equal(game.ectx.globalCompositeOperation, "source-over");
    assert.equal(game.ectx.globalAlpha, 1);
});

test("oclusão também funciona em objetos sem luz própria", () => {
    const game = setup();
    game.blitSprite({ img: {}, w: 100, h: 60 }, 60, 0, 0, 100, 60, 0.5);
    assert.equal(game.ectx.calls.length, 1);
    assert.equal(game.ectx.calls[0].mode, "destination-out");
    assert.equal(game.sctx.calls[0].alpha, 0.5);
});

test("posição do carro é interpolada dentro do segmento e recortada no topo da colina", () => {
    const game = setup();
    game.W = 1000;
    const segment = {
        p1: { screen: { scale: 0.001, x: 500, y: 500 } },
        p2: { screen: { scale: 0.0005, x: 520, y: 400 } },
    };
    game.drawSprite(
        segment,
        { img: {}, w: 100, h: 60, worldW: 760, solid: true },
        0,
        430,
        0.1,
        0.5,
    );
    const args = game.sctx.calls[0].args;
    assert.ok(Math.abs(args[5] + args[7] / 2 - 510) < 0.001);
    assert.ok(Math.abs(args[6] + args[8] - 430) < 0.001);
    assert.ok(args[4] < 60);
    assert.equal(game.sctx.calls[0].alpha, 1);
});

test("todos os modelos e ângulos cabem no sprite, sem vértices inválidos", () => {
    const game = setup();
    for (const style of ["sport", "gt", "coupe", "sedan", "truck"]) {
        const mesh =
            style === "truck"
                ? game.buildTruck()
                : game.buildCar([200, 80, 100], [255, 60, 90], style);
        const yaws = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3];
        const fit = game.computeFit(mesh, 640, 400, yaws);
        assert.ok(fit.bodyFraction > 0 && fit.bodyFraction <= 1);
        assert.ok(mesh.f.length > 100);
        for (const yaw of yaws) {
            for (const p of game.projectAll(mesh, yaw).P) {
                const x = p[0] * fit.s + fit.ox,
                    y = p[1] * fit.s + fit.oy;
                assert.ok(Number.isFinite(x) && Number.isFinite(y));
                assert.ok(
                    x >= 0 && x <= 640 && y >= 0 && y <= 400,
                    `${style}: ${x}, ${y}`,
                );
            }
        }
    }
});

test("split-screen escolhe divisão vertical ou horizontal conforme a tela", () => {
    const game = setup();
    game.numP = 2;
    game.W = 1280;
    game.H = 720;
    assert.deepEqual(Array.from(game.viewportOf(1)), [640, 0, 640, 720]);
    game.W = 390;
    game.H = 844;
    assert.deepEqual(Array.from(game.viewportOf(1)), [0, 422, 390, 422]);
});
