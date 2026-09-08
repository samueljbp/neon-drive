const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const scripts = ["js/core/utils.js", "js/input.js"].map((file) => {
    const filename = path.resolve(__dirname, "..", file);
    return new vm.Script(fs.readFileSync(filename, "utf8"), { filename });
});
const neutral = {
    left: false,
    right: false,
    gas: false,
    brake: false,
    nitro: false,
    drift: false,
    gasA: 0,
    brakeA: 0,
};
function expectInput(h, slot = 0, active = {}) {
    // Copia só os valores públicos, sem comparar protótipos de realms distintos.
    assert.deepEqual({ ...h.input.read(slot) }, { ...neutral, ...active });
}
function active(prop) {
    return {
        [prop]: true,
        ...(prop === "gas"
            ? { gasA: 1 }
            : prop === "brake"
              ? { brakeA: 1 }
              : {}),
    };
}

// Eventos são entregues explicitamente ao alvo; não há bubbling nem DOM genérico.
function eventTarget() {
    const listeners = [];
    const capture = (options) => options === true || !!options?.capture;
    return {
        addEventListener(type, fn, options) {
            if (
                !listeners.some(
                    (l) =>
                        l.type === type &&
                        l.fn === fn &&
                        l.capture === capture(options),
                )
            )
                listeners.push({ type, fn, capture: capture(options) });
        },
        removeEventListener(type, fn, options) {
            const i = listeners.findIndex(
                (l) =>
                    l.type === type &&
                    l.fn === fn &&
                    l.capture === capture(options),
            );
            if (i >= 0) listeners.splice(i, 1);
        },
        listenerCount: () => listeners.length,
        dispatch(type, init = {}) {
            const event = {
                type,
                target: this,
                button: 0,
                defaultPrevented: false,
                preventDefault() {
                    this.defaultPrevented = true;
                },
                ...init,
            };
            for (const l of [...listeners]) if (l.type === type) l.fn(event);
            return event;
        },
    };
}
function element(tag = "div") {
    const classes = new Set(),
        captures = new Set(),
        released = [];
    const node = {
        ...eventTarget(),
        tagName: tag.toUpperCase(),
        hidden: false,
        textContent: "",
        classList: {
            contains: (c) => classes.has(c),
            add: (c) => classes.add(c),
            remove: (c) => classes.delete(c),
        },
        // Apenas tags nativas usadas nos testes de foco, sem motor de seletores.
        closest: (selector) =>
            selector.split(",").some((s) => s.trim() === tag) ? node : null,
        captures,
        released,
        setPointerCapture(id) {
            captures.add(id);
        },
        hasPointerCapture: (id) => captures.has(id),
        releasePointerCapture(id) {
            captures.delete(id);
            released.push(id);
        },
    };
    return node;
}
function pad(index = 0, id = "Controle", values = {}) {
    return {
        index,
        id,
        connected: true,
        mapping: "standard",
        axes: [0, 0],
        buttons: Array.from({ length: 17 }, (_, i) => ({
            value: values[i] ?? 0,
            get pressed() {
                return this.value > 0.5;
            },
        })),
    };
}
function setup(
    t,
    {
        players = 1,
        state = "play",
        stored = {},
        getPads = () => [],
        touch = false,
    } = {},
) {
    const ids = [
        "binds",
        "bindPanel",
        "padRows",
        "btnBindsDef",
        "tC",
        "uL",
        "uR",
        "uB",
        "uN",
        "uA",
        "tL",
        "tR",
        "tB",
        "tN",
        "tA",
    ];
    const nodes = Object.fromEntries(
        ids.map((id) => [
            id,
            element(
                id.startsWith("u") || id.startsWith("t") || id === "btnBindsDef"
                    ? "button"
                    : "div",
            ),
        ]),
    );
    nodes.binds.hidden = true;
    const document = {
        ...eventTarget(),
        hidden: false,
        body: element("body"),
        getElementById: (id) => nodes[id] || null,
    };
    document.activeElement = document.body;
    const storage = new Map(Object.entries(stored));
    const context = vm.createContext({
        ...eventTarget(),
        document,
        navigator: { maxTouchPoints: touch ? 1 : 0, getGamepads: getPads },
        localStorage: {
            getItem: (key) => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, String(value)),
        },
    });
    context.window = context;
    scripts.forEach((script) => script.runInContext(context));
    const calls = { start: 0, pause: 0, mute: 0, quality: 0, camera: 0 };
    let input;
    // Contrato de ui.js: show() limpa entradas ao mudar de estado; não executa UI/modal.
    function transition(next) {
        state = next;
        input.clear();
    }
    input = context.NeonDrive.createInput({
        getState: () => state,
        getNumPlayers: () => players,
        start() {
            calls.start++;
            transition("play");
        },
        pause() {
            calls.pause++;
            transition(state === "paused" ? "play" : "paused");
        },
        toggleMute() {
            calls.mute++;
        },
        toggleQuality() {
            calls.quality++;
        },
        toggleCamera() {
            calls.camera++;
        },
    });
    t.after(() => input.destroy());
    const key = (type, key, code, extra) =>
        context.dispatch(type, {
            key,
            code,
            target: document.activeElement,
            ...extra,
        });
    return {
        input,
        context,
        document,
        nodes,
        calls,
        storage,
        down: (k, code = k, extra = {}) => key("keydown", k, code, extra),
        up: (k, code = k) => key("keyup", k, code),
    };
}

test("teclado 1P: WASD maiúsculo é alias das setas e soltar uma tecla preserva a outra", (t) => {
    const h = setup(t);
    for (const [letter, arrow, prop] of [
        ["A", "ArrowLeft", "left"],
        ["D", "ArrowRight", "right"],
        ["W", "ArrowUp", "gas"],
        ["S", "ArrowDown", "brake"],
    ]) {
        h.down(arrow);
        assert.equal(h.down(letter, "Key" + letter).defaultPrevented, true);
        expectInput(h, 0, active(prop));
        h.up(arrow);
        expectInput(h, 0, active(prop));
        h.up(letter.toLowerCase(), "Key" + letter);
        expectInput(h);
        expectInput(h, 1);
    }
});

test("teclado 2P: setas/Space/Shift no slot 0 e WASD/F/G no slot 1", (t) => {
    const h = setup(t, { players: 2 });
    for (const [key, slot, prop] of [
        ["ArrowLeft", 0, "left"],
        ["ArrowRight", 0, "right"],
        ["ArrowUp", 0, "gas"],
        ["ArrowDown", 0, "brake"],
        [" ", 0, "nitro"],
        ["Shift", 0, "drift"],
        ["a", 1, "left"],
        ["d", 1, "right"],
        ["w", 1, "gas"],
        ["s", 1, "brake"],
        ["f", 1, "nitro"],
        ["g", 1, "drift"],
    ]) {
        h.down(key);
        expectInput(h, slot, active(prop));
        expectInput(h, 1 - slot);
        h.up(key);
        expectInput(h, slot);
    }
    h.down("ArrowUp");
    for (const slot of [-1, 2, "0"]) expectInput(h, slot);
});

test("freio tem prioridade sem apagar o acelerador ainda pressionado", (t) => {
    const h = setup(t);
    h.down("ArrowUp");
    h.down("ArrowDown");
    expectInput(h, 0, { brake: true, gasA: 1, brakeA: 1 });
    h.up("ArrowDown");
    expectInput(h, 0, { gas: true, gasA: 1 });
    h.up("ArrowUp");
    expectInput(h);
});

test("repeat não repete pausa nem ressuscita tecla segurada ao retomar", (t) => {
    const h = setup(t);
    h.down("w", "KeyW");
    expectInput(h, 0, active("gas"));
    h.down("p");
    h.down("p", "p", { repeat: true });
    assert.equal(h.calls.pause, 1);
    expectInput(h);
    h.up("p");
    h.down("p");
    assert.equal(h.calls.pause, 2);
    h.down("w", "KeyW", { repeat: true });
    expectInput(h);
    h.up("w", "KeyW");
    h.down("w", "KeyW");
    expectInput(h, 0, active("gas"));
    h.up("w", "KeyW");
    expectInput(h);
});

test("clear libera teclado e todas as capturas dos dois jogadores", (t) => {
    const h = setup(t, { players: 2 });
    h.down("w");
    h.nodes.uN.dispatch("pointerdown", { pointerId: 1 });
    h.nodes.tA.dispatch("pointerdown", { pointerId: 2 });
    expectInput(h, 0, active("nitro"));
    expectInput(h, 1, active("gas"));
    h.input.clear();
    for (const slot of [0, 1]) expectInput(h, slot);
    assert.deepEqual(h.nodes.uN.released, [1]);
    assert.deepEqual(h.nodes.tA.released, [2]);
    h.down("w", "w", { repeat: true });
    expectInput(h, 1);
});

for (const event of ["blur", "visibilitychange"]) {
    test(`${event}: limpa entradas, bloqueia durante suspensão e volta sem sticky`, (t) => {
        const h = setup(t);
        h.down("w");
        h.nodes.tN.dispatch("pointerdown", { pointerId: 3 });
        expectInput(h, 0, { ...active("gas"), nitro: true });
        if (event === "visibilitychange") h.document.hidden = true;
        (event === "blur" ? h.context : h.document).dispatch(event);
        expectInput(h);
        assert.deepEqual(h.nodes.tN.released, [3]);
        assert.equal(h.calls.pause, event === "visibilitychange" ? 1 : 0);
        h.down("ArrowUp");
        h.nodes.tA.dispatch("pointerdown", { pointerId: 4 });
        expectInput(h);
        if (event === "visibilitychange") {
            h.document.hidden = false;
            h.document.dispatch(event);
            h.down("p");
        } else h.context.dispatch("focus");
        expectInput(h);
        h.down("ArrowUp");
        expectInput(h, 0, active("gas"));
    });
}

test("menu: foco em button/select preserva Space, Enter e setas sem iniciar corrida", (t) => {
    const h = setup(t, { state: "menu" });
    for (const tag of ["button", "select"]) {
        h.document.activeElement = element(tag);
        for (const key of [" ", "Enter", "ArrowUp"])
            assert.equal(h.down(key).defaultPrevented, false, `${tag}: ${key}`);
        assert.equal(h.calls.start, 0);
        expectInput(h);
    }
    h.document.activeElement = h.document.body;
    assert.equal(h.down(" ", "Space").defaultPrevented, true);
    assert.equal(h.calls.start, 1);
    h.down(" ", "Space", { repeat: true });
    expectInput(h);
});

test("gamepad padrão: R2 analógico, L2 prioritário e nitro por X/R1", (t) => {
    const gp = pad(0, "Padrão", { 7: 0.75 });
    const h = setup(t, { getPads: () => [gp] });
    expectInput(h, 0, { gas: true, gasA: 0.75 });
    gp.buttons[6].value = 0.4;
    expectInput(h, 0, { brake: true, gasA: 0.75, brakeA: 0.4 });
    gp.buttons[6].value = gp.buttons[7].value = 0;
    for (const button of [2, 5]) {
        gp.buttons[button].value = 1;
        expectInput(h, 0, active("nitro"));
        gp.buttons[button].value = 0;
        expectInput(h);
    }
});

test("gamepad START exige nova borda após iniciar, clear e pausar", (t) => {
    const gp = pad(0, "Padrão", { 9: 1 });
    const h = setup(t, { state: "menu", getPads: () => [gp] });
    h.input.poll();
    h.input.clear();
    h.input.poll();
    assert.equal(h.calls.start, 1);
    assert.equal(h.calls.pause, 0);
    for (let presses = 1; presses <= 2; presses++) {
        gp.buttons[9].value = 0;
        h.input.poll();
        gp.buttons[9].value = 1;
        h.input.poll();
        h.input.poll();
        assert.equal(h.calls.pause, presses);
    }
});

test("localStorage corrompido/inválido preserva mapa padrão e atribuição AUTO", (t) => {
    for (const raw of [
        "{",
        "null",
        "[]",
        '{"gas":[null,{"t":"b","i":-1}],"a":[-1,"0"]}',
    ]) {
        const h = setup(t, {
            stored: { nd_padmap: raw, nd_padassign: raw },
            getPads: () => [pad(0, "Padrão", { 7: 0.6 })],
        });
        expectInput(h, 0, { gas: true, gasA: 0.6 });
    }
});

test("remap salvo aceita bindings seguros e ignora campos maliciosos/índices inválidos", (t) => {
    const nd_padmap = `{
        "gas":[{"t":"b","i":12,"extra":"ignorar","__proto__":{"polluted":true}},
            {"t":"b","i":"7"},{"t":"b","i":64},null,[]],
        "brake":[{"t":"b","i":-1}],
        "left":[{"t":"a","i":1,"d":-1},{"t":"a","i":0,"d":0}],
        "nitro":[{"t":"b","i":13}],
        "unknown":[{"t":"b","i":7}],
        "__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}
    }`;
    const gp = pad(0, "Remapeado", { 7: 1 });
    const h = setup(t, { stored: { nd_padmap }, getPads: () => [gp] });
    expectInput(h); // R2 não vaza pelo índice string nem por uma ação desconhecida.
    gp.buttons[12].value = 0.8;
    gp.buttons[13].value = 1;
    gp.axes[1] = -1;
    expectInput(h, 0, { gas: true, gasA: 0.8, left: true, nitro: true });
    gp.buttons[6].value = 0.5;
    expectInput(h, 0, {
        brake: true,
        brakeA: 0.5,
        gasA: 0.8,
        left: true,
        nitro: true,
    });
    assert.equal(vm.runInContext("({}).polluted", h.context), undefined);
});

test("nd_padassign: ausente não toma outro ID; reconexão em novo índice preserva os slots", (t) => {
    const pads = [
        null,
        pad(1, "Outro", { 7: 1 }),
        null,
        null,
        pad(4, "Segundo", { 6: 0.5 }),
    ];
    const h = setup(t, {
        players: 2,
        getPads: () => pads,
        stored: {
            nd_padassign: JSON.stringify({
                a: [1, 4],
                d: ["Primeiro", "Segundo"],
            }),
        },
    });
    expectInput(h, 0);
    expectInput(h, 1, { brake: true, brakeA: 0.5 });
    pads[7] = pad(7, "Primeiro", { 7: 0.8 });
    expectInput(h, 0, { gas: true, gasA: 0.8 });
    expectInput(h, 1, { brake: true, brakeA: 0.5 });
    assert.deepEqual(JSON.parse(h.storage.get("nd_padassign")), {
        a: [7, 4],
        d: ["Primeiro", "Segundo"],
    });
});

test("nd_padassign: controles de mesmo ID conservam matches exatos antes de reancorar", (t) => {
    const pads = [null, null, null, null, pad(4, "Mesmo modelo", { 6: 0.5 })];
    const h = setup(t, {
        players: 2,
        getPads: () => pads,
        stored: {
            nd_padassign: JSON.stringify({
                a: [1, 4],
                d: ["Mesmo modelo", "Mesmo modelo"],
            }),
        },
    });
    expectInput(h, 0);
    expectInput(h, 1, { brake: true, brakeA: 0.5 });
    pads[7] = pad(7, "Mesmo modelo", { 7: 0.6 });
    expectInput(h, 0, { gas: true, gasA: 0.6 });
    expectInput(h, 1, { brake: true, brakeA: 0.5 });
    assert.deepEqual(JSON.parse(h.storage.get("nd_padassign")).a, [7, 4]);
    pads[1] = pads[4];
    pads[1].index = 1;
    pads[4] = null;
    expectInput(h, 1, { brake: true, brakeA: 0.5 });
    expectInput(h, 0, { gas: true, gasA: 0.6 });
    assert.deepEqual(JSON.parse(h.storage.get("nd_padassign")).a, [7, 1]);
});

test("pointer 2P: u* no primeiro, t* no segundo, capturas e liberações independentes", (t) => {
    const h = setup(t, { players: 2 });
    for (const [suffix, prop] of [
        ["L", "left"],
        ["R", "right"],
        ["B", "brake"],
        ["N", "nitro"],
        ["A", "gas"],
    ]) {
        const upper = h.nodes["u" + suffix],
            lower = h.nodes["t" + suffix];
        upper.dispatch("pointerdown", { pointerId: 10 });
        assert.equal(
            lower.dispatch("pointerdown", { pointerId: 20 }).defaultPrevented,
            true,
        );
        for (const slot of [0, 1]) expectInput(h, slot, active(prop));
        assert.equal(upper.hasPointerCapture(10), true);
        assert.equal(lower.hasPointerCapture(20), true);
        h.context.dispatch("pointerup", { pointerId: 10 });
        expectInput(h, 0);
        expectInput(h, 1, active(prop));
        lower.dispatch("pointerup", { pointerId: 20 });
        expectInput(h, 1);
        assert.deepEqual(upper.released, [10]);
        assert.deepEqual(lower.released, [20]);
    }
});

test("pointercancel/lostpointercapture e captura indisponível não deixam entrada presa", (t) => {
    const h = setup(t),
        button = h.nodes.tA;
    for (const type of ["pointercancel", "lostpointercapture"]) {
        button.dispatch("pointerdown", { pointerId: 1 });
        expectInput(h, 0, active("gas"));
        if (type === "lostpointercapture") button.captures.delete(1);
        button.dispatch(type, { pointerId: 1 });
        expectInput(h);
        assert.equal(button.hasPointerCapture(1), false);
    }
    button.setPointerCapture = () => {
        throw new Error("Captura indisponível");
    };
    button.dispatch("pointerdown", { pointerId: 2 });
    expectInput(h, 0, active("gas"));
    h.context.dispatch("pointercancel", { pointerId: 2 });
    expectInput(h);
});

test("destroy remove listeners, libera capturas e é idempotente", (t) => {
    const h = setup(t, { touch: true });
    const targets = [h.context, h.document, ...Object.values(h.nodes)];
    assert.ok(
        targets.reduce((total, target) => total + target.listenerCount(), 0) >
            0,
    );
    assert.equal(h.document.body.classList.contains("touch"), true);
    h.down("w");
    h.nodes.tA.dispatch("pointerdown", { pointerId: 9 });
    expectInput(h, 0, active("gas"));
    h.input.destroy();
    h.input.destroy();
    for (const target of targets) assert.equal(target.listenerCount(), 0);
    assert.deepEqual(h.nodes.tA.released, [9]);
    assert.equal(h.document.body.classList.contains("touch"), false);
    for (const key of ["p", "m", "q", "c", " "]) h.down(key);
    h.nodes.tC.dispatch("pointerdown", { pointerId: 10 });
    h.input.poll();
    expectInput(h);
    assert.deepEqual(h.calls, {
        start: 0,
        pause: 0,
        mute: 0,
        quality: 0,
        camera: 0,
    });
});
