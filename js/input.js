(function (ND) {
    "use strict";

    var clamp = ND.util.clamp;
    var PADACT = [
        { k: "gas", n: "ACELERAR" },
        { k: "brake", n: "FREAR" },
        { k: "left", n: "ESQUERDA" },
        { k: "right", n: "DIREITA" },
        { k: "nitro", n: "NITRO" },
        { k: "drift", n: "DERRAPAR" },
        { k: "pause", n: "PAUSAR" },
    ];
    var PADNAMES = [
        "A / ✕",
        "B / ○",
        "X / □",
        "Y / △",
        "L1",
        "R1",
        "L2",
        "R2",
        "SELECT",
        "START",
        "L3",
        "R3",
        "D↑",
        "D↓",
        "D←",
        "D→",
        "HOME",
    ];

    function defaultMap() {
        return {
            gas: [
                { t: "b", i: 7 },
                { t: "b", i: 0 },
            ],
            brake: [
                { t: "b", i: 6 },
                { t: "b", i: 1 },
            ],
            left: [
                { t: "a", i: 0, d: -1 },
                { t: "b", i: 14 },
            ],
            right: [
                { t: "a", i: 0, d: 1 },
                { t: "b", i: 15 },
            ],
            nitro: [
                { t: "b", i: 2 },
                { t: "b", i: 5 },
            ],
            drift: [
                { t: "b", i: 4 },
                { t: "b", i: 3 },
            ],
            pause: [{ t: "b", i: 9 }],
        };
    }

    function validBinding(b) {
        if (
            !b ||
            typeof b !== "object" ||
            Array.isArray(b) ||
            !Number.isInteger(b.i) ||
            b.i < 0
        )
            return null;
        if (b.t === "b" && b.i <= 63) return { t: "b", i: b.i };
        if (b.t === "a" && b.i <= 15 && (b.d === -1 || b.d === 1))
            return { t: "a", i: b.i, d: b.d };
        return null;
    }

    function neutral() {
        return {
            left: false,
            right: false,
            gas: false,
            brake: false,
            nitro: false,
            drift: false,
            gasA: 0,
            brakeA: 0,
        };
    }

    ND.createInput = function (actions) {
        var padMap = defaultMap(),
            padAssign = [null, null],
            padAssignId = ["", ""];
        var held = Object.create(null),
            pointers = new Map(),
            listeners = [];
        var capturing = null,
            captureBlock = new Map(),
            padSysLatch = false;
        var gamepadOK = true,
            destroyed = false,
            suspended = !!document.hidden;
        var padActive = -1,
            rowsSignature = "",
            assignmentButtons = [];
        var bindingButtons = Object.create(null);
        var isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
        var addedTouch = isTouch && !document.body.classList.contains("touch");

        function el(id) {
            return document.getElementById(id);
        }
        function listen(target, type, fn, options) {
            if (!target) return;
            target.addEventListener(type, fn, options);
            listeners.push(function () {
                target.removeEventListener(type, fn, options);
            });
        }
        function save(key, value) {
            try {
                window.localStorage.setItem(key, JSON.stringify(value));
            } catch (e) {
                /* Armazenamento privado/bloqueado: mantém a escolha na sessão. */
            }
        }
        function load(key) {
            try {
                return JSON.parse(window.localStorage.getItem(key));
            } catch (e) {
                return null;
            }
        }
        function loadSettings() {
            var map = load("nd_padmap"),
                assignment = load("nd_padassign");
            // Copia somente ações e campos permitidos; não mescla o objeto salvo.
            if (map && typeof map === "object" && !Array.isArray(map)) {
                PADACT.forEach(function (act) {
                    if (
                        !Object.prototype.hasOwnProperty.call(map, act.k) ||
                        !Array.isArray(map[act.k])
                    )
                        return;
                    var bindings = map[act.k]
                        .slice(0, 96)
                        .map(validBinding)
                        .filter(Boolean);
                    if (bindings.length) padMap[act.k] = bindings;
                });
            }
            if (
                !assignment ||
                !Array.isArray(assignment.a) ||
                assignment.a.length !== 2
            )
                return;
            for (var i = 0; i < 2; i++) {
                var index = assignment.a[i];
                if (!Number.isSafeInteger(index) || index < 0) continue;
                var id =
                    Array.isArray(assignment.d) &&
                    typeof assignment.d[i] === "string"
                        ? assignment.d[i]
                        : "";
                // Índices antigos podem coincidir após uma desconexão; IDs distintos
                // continuam sendo atribuições fixas, não uma escolha AUTO implícita.
                if (
                    i === 1 &&
                    index === padAssign[0] &&
                    (!id || !padAssignId[0] || id === padAssignId[0])
                )
                    continue;
                padAssign[i] = index;
                padAssignId[i] = id;
            }
        }
        function saveAssign() {
            save("nd_padassign", { a: padAssign, d: padAssignId });
        }
        function padList() {
            if (!gamepadOK || typeof navigator.getGamepads !== "function")
                return [];
            try {
                return Array.from(navigator.getGamepads() || [])
                    .filter(function (gp) {
                        return (
                            gp &&
                            gp.connected !== false &&
                            Number.isSafeInteger(gp.index) &&
                            gp.index >= 0
                        );
                    })
                    .sort(function (a, b) {
                        return a.index - b.index;
                    });
            } catch (e) {
                gamepadOK = false;
                return [];
            }
        }
        function matches(gp, slot) {
            return (
                gp.index === padAssign[slot] &&
                (!padAssignId[slot] ||
                    String(gp.id || "") === padAssignId[slot])
            );
        }
        function reanchorAssign(list) {
            var reserved = new Set(),
                resolved = [null, null],
                changed = false;
            // Primeiro conserva as correspondências exatas, inclusive IDs de modelos iguais.
            for (var i = 0; i < 2; i++) {
                if (padAssign[i] === null) continue;
                for (var j = 0; j < list.length; j++) {
                    if (matches(list[j], i) && !reserved.has(list[j].index)) {
                        resolved[i] = list[j];
                        reserved.add(list[j].index);
                        break;
                    }
                }
            }
            for (var s = 0; s < 2; s++) {
                if (resolved[s] || padAssign[s] === null || !padAssignId[s])
                    continue;
                for (var n = 0; n < list.length; n++) {
                    var gp = list[n];
                    if (
                        reserved.has(gp.index) ||
                        String(gp.id || "") !== padAssignId[s]
                    )
                        continue;
                    resolved[s] = gp;
                    reserved.add(gp.index);
                    padAssign[s] = gp.index;
                    changed = true;
                    break;
                }
            }
            if (changed) saveAssign();
            return resolved;
        }
        function padForSlot(slot, list) {
            var fixed = reanchorAssign(list);
            if (padAssign[slot] !== null) return fixed[slot];
            var free = list.filter(function (gp) {
                return !fixed.some(function (assigned) {
                    return assigned && assigned.index === gp.index;
                });
            });
            var rank = slot === 1 && padAssign[0] === null ? 1 : 0;
            return free[rank] || null;
        }
        function setPadAssign(slot, index) {
            var list = padList(),
                fixed = reanchorAssign(list);
            if (index !== null) {
                var gp = list.find(function (pad) {
                    return pad.index === index;
                });
                if (!gp || (fixed[1 - slot] && fixed[1 - slot].index === index))
                    return;
                // Libera uma referência antiga ao mesmo índice, nunca um controle conectado.
                if (padAssign[1 - slot] === index) {
                    padAssign[1 - slot] = null;
                    padAssignId[1 - slot] = "";
                }
                padAssignId[slot] = String(gp.id || "");
            } else padAssignId[slot] = "";
            padAssign[slot] = index;
            saveAssign();
            renderPadRows(list);
        }
        function buttonValue(gp, index) {
            var b = gp.buttons && gp.buttons[index];
            if (b && typeof b === "object") {
                if (typeof b.value === "number" && Number.isFinite(b.value))
                    return clamp(b.value, 0, 1);
                return b.pressed ? 1 : 0;
            }
            if (typeof b === "number" && Number.isFinite(b))
                return clamp(b, 0, 1);
            return b === true ? 1 : 0;
        }
        function axisValue(gp, index) {
            var v = gp.axes && gp.axes[index];
            return typeof v === "number" && Number.isFinite(v)
                ? clamp(v, -1, 1)
                : 0;
        }
        function actVal(gp, action) {
            var value = 0;
            padMap[action].forEach(function (b) {
                var v =
                    b.t === "b"
                        ? buttonValue(gp, b.i)
                        : axisValue(gp, b.i) * b.d;
                if (b.t === "a")
                    v = v > 0.22 ? Math.min(1, (v - 0.22) / 0.62) : 0;
                value = Math.max(value, v);
            });
            return value;
        }
        function modalOpen() {
            var modal = el("binds");
            return (
                !!modal && !modal.hidden && !modal.classList.contains("hidden")
            );
        }
        function keyboardBinding(key) {
            var alternate = actions.getNumPlayers() === 2 ? 1 : 0;
            switch (key) {
                case "arrowleft":
                    return [0, "left"];
                case "arrowright":
                    return [0, "right"];
                case "arrowup":
                    return [0, "gas"];
                case "arrowdown":
                    return [0, "brake"];
                case " ":
                    return [0, "nitro"];
                case "shift":
                    return [0, "drift"];
                case "a":
                    return [alternate, "left"];
                case "d":
                    return [alternate, "right"];
                case "w":
                    return [alternate, "gas"];
                case "s":
                    return [alternate, "brake"];
                case "f":
                    return [1, "nitro"];
                case "g":
                    return [1, "drift"];
                default:
                    return null;
            }
        }
        function onKey(e, down) {
            var key = String(e.key || "").toLowerCase(),
                code = e.code || key;
            if (!down) {
                delete held[code];
                return;
            }
            if (
                destroyed ||
                suspended ||
                document.hidden ||
                e.defaultPrevented ||
                e.ctrlKey ||
                e.altKey ||
                e.metaKey ||
                modalOpen()
            )
                return;
            var state = actions.getState(),
                target = e.target || document.activeElement;
            var interactive =
                target &&
                target.closest &&
                target.closest(
                    "button, select, input, textarea, a[href], [contenteditable], [role=button], [role=combobox]",
                );
            // Deixa Enter/Espaço e as setas com seus elementos nativos no menu/pausa.
            if (
                interactive &&
                (state !== "play" ||
                    interactive.isContentEditable ||
                    /^(INPUT|TEXTAREA|SELECT)$/.test(interactive.tagName))
            )
                return;
            var binding = keyboardBinding(key);
            if (binding && state === "play") {
                if (!e.repeat) held[code] = binding;
                e.preventDefault();
            }
            if (e.repeat) return;
            if (key === "p" && (state === "play" || state === "paused")) {
                e.preventDefault();
                actions.pause();
            } else if (key === "m") actions.toggleMute();
            else if (key === "q") actions.toggleQuality();
            else if (key === "c") actions.toggleCamera();
            else if (
                (state === "menu" || state === "over") &&
                (key === "enter" || key === " ")
            ) {
                e.preventDefault();
                actions.start();
            }
        }
        function releasePointer(id) {
            var entry = pointers.get(id);
            if (!entry) return;
            pointers.delete(id);
            try {
                if (
                    entry.el.hasPointerCapture &&
                    entry.el.hasPointerCapture(id)
                )
                    entry.el.releasePointerCapture(id);
            } catch (e) {
                /* O navegador pode já ter cancelado a captura. */
            }
        }
        function bindTouch(id, prop, upper) {
            var button = el(id);
            listen(
                button,
                "pointerdown",
                function (e) {
                    if (
                        destroyed ||
                        suspended ||
                        document.hidden ||
                        modalOpen() ||
                        actions.getState() !== "play" ||
                        e.button > 0
                    )
                        return;
                    e.preventDefault();
                    pointers.set(e.pointerId, {
                        el: button,
                        prop: prop,
                        slot: upper ? 0 : actions.getNumPlayers() === 2 ? 1 : 0,
                    });
                    try {
                        button.setPointerCapture(e.pointerId);
                    } catch (error) {
                        /* pointerup global ainda libera a entrada. */
                    }
                },
                { passive: false },
            );
            ["pointerup", "pointercancel", "lostpointercapture"].forEach(
                function (type) {
                    listen(button, type, function (e) {
                        releasePointer(e.pointerId);
                    });
                },
            );
        }
        function clear() {
            held = Object.create(null);
            Array.from(pointers.keys()).forEach(releasePointer);
            capturing = null;
            captureBlock.clear();
            // Uma tecla START ainda segurada não deve reiniciar/pausar de novo.
            padSysLatch = true;
            updateBindingButtons();
        }
        function read(slot) {
            var ctrl = neutral();
            if (
                destroyed ||
                suspended ||
                document.hidden ||
                modalOpen() ||
                capturing ||
                (slot !== 0 && slot !== 1) ||
                slot >= actions.getNumPlayers()
            )
                return ctrl;
            Object.keys(held).forEach(function (code) {
                var binding = held[code];
                if (binding[0] === slot) ctrl[binding[1]] = true;
            });
            pointers.forEach(function (entry) {
                if (entry.slot === slot) ctrl[entry.prop] = true;
            });
            ctrl.gasA = ctrl.gas ? 1 : 0;
            ctrl.brakeA = ctrl.brake ? 1 : 0;
            var gp = padForSlot(slot, padList());
            if (gp) {
                var gas = actVal(gp, "gas"),
                    brake = actVal(gp, "brake");
                if (gas > 0.06) {
                    ctrl.gas = true;
                    ctrl.gasA = Math.max(ctrl.gasA, gas);
                }
                if (brake > 0.06) {
                    ctrl.brake = true;
                    ctrl.brakeA = Math.max(ctrl.brakeA, brake);
                }
                ctrl.left = ctrl.left || actVal(gp, "left") > 0.3;
                ctrl.right = ctrl.right || actVal(gp, "right") > 0.3;
                ctrl.nitro = ctrl.nitro || actVal(gp, "nitro") > 0.5;
                ctrl.drift = ctrl.drift || actVal(gp, "drift") > 0.5;
            }
            // No original, freio tem prioridade quando as duas entradas estão ativas.
            if (ctrl.brake) ctrl.gas = false;
            return ctrl;
        }
        function blockHeld(gp) {
            var block = { id: String(gp.id || ""), b: [], a: [] };
            for (var i = 0; i < 64; i++) block.b[i] = buttonValue(gp, i) > 0.3;
            for (var j = 0; j < 16; j++)
                block.a[j] = Math.abs(axisValue(gp, j)) > 0.4;
            captureBlock.set(gp.index, block);
            return block;
        }
        function beginCapture(action) {
            capturing = capturing === action ? null : action;
            captureBlock.clear();
            if (capturing) padList().forEach(blockHeld);
            padSysLatch = true;
            updateBindingButtons();
        }
        function assignBinding(binding) {
            padMap[capturing] = [binding];
            capturing = null;
            captureBlock.clear();
            padSysLatch = true;
            save("nd_padmap", padMap);
            updateBindingButtons();
        }
        function pollCapture(list) {
            for (var n = 0; n < list.length; n++) {
                var gp = list[n],
                    block = captureBlock.get(gp.index);
                if (!block || block.id !== String(gp.id || ""))
                    block = blockHeld(gp);
                for (
                    var i = 0;
                    i < Math.min(64, (gp.buttons || []).length);
                    i++
                ) {
                    var v = buttonValue(gp, i);
                    if (block.b[i]) {
                        if (v < 0.25) block.b[i] = false;
                    } else if (v > 0.65) {
                        assignBinding({ t: "b", i: i });
                        return;
                    }
                }
                for (var j = 0; j < Math.min(16, (gp.axes || []).length); j++) {
                    var axis = axisValue(gp, j);
                    if (block.a[j]) {
                        if (Math.abs(axis) < 0.3) block.a[j] = false;
                    } else if (Math.abs(axis) > 0.72) {
                        assignBinding({ t: "a", i: j, d: axis > 0 ? 1 : -1 });
                        return;
                    }
                }
            }
        }
        function setText(id, text) {
            var node = el(id);
            if (node && node.textContent !== text) node.textContent = text;
        }
        function updateStatus(list) {
            var unavailable = !gamepadOK
                ? "CONTROLE BLOQUEADO NESTE AMBIENTE"
                : typeof navigator.getGamepads !== "function"
                  ? "CONTROLE NÃO SUPORTADO"
                  : "";
            setText(
                "padName",
                unavailable ||
                    (list.length
                        ? String(list[0].id || "CONTROLE")
                              .substring(0, 40)
                              .toUpperCase()
                        : "NENHUM CONTROLE DETECTADO"),
            );
            setText(
                "padStatus",
                unavailable ||
                    (list.length
                        ? list.length +
                          " CONTROLE" +
                          (list.length > 1 ? "S" : "") +
                          (padActive >= 0
                              ? "  ·  RECEBENDO ENTRADA"
                              : "  ·  SEM ENTRADA")
                        : "NENHUM CONTROLE — APERTE UM BOTÃO NELE"),
            );
        }
        function makeRow(label) {
            var row = document.createElement("div"),
                lb = document.createElement("span");
            var group = document.createElement("span");
            row.className = "row";
            lb.className = "lbl2";
            lb.textContent = label;
            group.className = "seg";
            group.setAttribute("role", "group");
            group.setAttribute("aria-label", label);
            row.appendChild(lb);
            row.appendChild(group);
            return { row: row, group: group };
        }
        function assignmentSignature(list) {
            return JSON.stringify([
                actions.getNumPlayers(),
                padAssign,
                padAssignId,
                list.map(function (gp) {
                    return [gp.index, gp.id];
                }),
            ]);
        }
        function updateAssignmentButtons() {
            assignmentButtons.forEach(function (item) {
                var selected =
                    padAssign[item.slot] === item.index &&
                    (item.index === null ||
                        !padAssignId[item.slot] ||
                        padAssignId[item.slot] === item.id);
                var active = item.index !== null && item.index === padActive;
                item.button.className =
                    "opt" + (selected ? " on" : "") + (active ? " live" : "");
                item.button.textContent = item.label + (active ? " •" : "");
                item.button.setAttribute("aria-pressed", String(selected));
            });
        }
        function renderPadRows(list) {
            var host = el("padRows");
            if (!host) return;
            var focused = host.contains(document.activeElement)
                ? document.activeElement.id
                : "";
            host.textContent = "";
            assignmentButtons = [];
            var fixed = reanchorAssign(list);
            if (!list.length) {
                var message = document.createElement("div");
                message.className = "lbl2";
                message.textContent = !gamepadOK
                    ? "CONTROLE BLOQUEADO NESTE AMBIENTE"
                    : typeof navigator.getGamepads !== "function"
                      ? "CONTROLE NÃO SUPORTADO"
                      : "NENHUM CONTROLE CONECTADO";
                host.appendChild(message);
            }
            for (
                var slot = 0;
                list.length && slot < actions.getNumPlayers();
                slot++
            ) {
                var row = makeRow("JOGADOR " + (slot + 1));
                var choices = [
                    { index: null, label: "AUTO", id: "AUTOMÁTICO" },
                ].concat(
                    list.map(function (gp, n) {
                        return {
                            index: gp.index,
                            label: "C" + (n + 1),
                            id: String(gp.id || "CONTROLE"),
                        };
                    }),
                );
                for (var i = 0; i < choices.length; i++) {
                    var choice = choices[i],
                        button = document.createElement("button");
                    button.type = "button";
                    button.id =
                        "nd-pad-" +
                        slot +
                        "-" +
                        (choice.index === null ? "auto" : choice.index);
                    button.setAttribute("data-pad-slot", String(slot));
                    button.setAttribute(
                        "data-pad-index",
                        choice.index === null ? "auto" : String(choice.index),
                    );
                    button.setAttribute(
                        "aria-label",
                        "JOGADOR " +
                            (slot + 1) +
                            ": " +
                            choice.label +
                            " · " +
                            choice.id,
                    );
                    button.disabled =
                        choice.index !== null &&
                        !!fixed[1 - slot] &&
                        fixed[1 - slot].index === choice.index;
                    assignmentButtons.push({
                        button: button,
                        slot: slot,
                        index: choice.index,
                        id: choice.id,
                        label: choice.label,
                    });
                    row.group.appendChild(button);
                }
                host.appendChild(row.row);
                var effective = padForSlot(slot, list),
                    hint = document.createElement("div");
                hint.className = "padhint";
                hint.textContent = effective
                    ? String(effective.id || "CONTROLE")
                          .substring(0, 34)
                          .toUpperCase()
                    : "SEM CONTROLE";
                host.appendChild(hint);
            }
            rowsSignature = assignmentSignature(list);
            updateAssignmentButtons();
            var previous = focused && el(focused);
            if (previous && !previous.disabled) previous.focus();
        }
        function updateBindingButtons() {
            PADACT.forEach(function (act) {
                var button = bindingButtons[act.k];
                if (!button) return;
                var active = capturing === act.k;
                button.className = "opt" + (active ? " on" : "");
                button.textContent = active
                    ? "PRESSIONE..."
                    : padMap[act.k]
                          .map(function (b) {
                              return b.t === "a"
                                  ? "EIXO " + b.i + (b.d > 0 ? " +" : " -")
                                  : PADNAMES[b.i] || "BOTÃO " + b.i;
                          })
                          .join(" / ");
                button.setAttribute("aria-pressed", String(active));
                button.setAttribute(
                    "aria-label",
                    act.n + ": " + button.textContent,
                );
            });
        }
        function renderBindings() {
            if (destroyed) return;
            var host = el("bindPanel"),
                list = padList();
            if (host) {
                host.textContent = "";
                bindingButtons = Object.create(null);
                PADACT.forEach(function (act) {
                    var row = makeRow(act.n),
                        button = document.createElement("button");
                    button.type = "button";
                    button.setAttribute("data-bind-action", act.k);
                    bindingButtons[act.k] = button;
                    row.group.appendChild(button);
                    host.appendChild(row.row);
                });
                updateBindingButtons();
            }
            renderPadRows(list);
            updateStatus(list);
        }
        function poll() {
            if (destroyed) return;
            var list = padList(),
                blocked = suspended || document.hidden,
                open = modalOpen();
            padActive = -1;
            if (!blocked)
                list.some(function (gp) {
                    var active = false;
                    for (
                        var i = 0;
                        i < Math.min(64, (gp.buttons || []).length);
                        i++
                    )
                        if (buttonValue(gp, i) > 0.5) {
                            active = true;
                            break;
                        }
                    for (
                        var j = 0;
                        !active && j < Math.min(16, (gp.axes || []).length);
                        j++
                    )
                        if (Math.abs(axisValue(gp, j)) > 0.6) active = true;
                    if (active) padActive = gp.index;
                    return active;
                });
            reanchorAssign(list);
            updateStatus(list);
            if (open) {
                if (rowsSignature !== assignmentSignature(list))
                    renderPadRows(list);
                else updateAssignmentButtons();
            } else if (capturing) {
                capturing = null;
                captureBlock.clear();
                updateBindingButtons();
            }
            var wasCapturing = !!capturing;
            if (capturing && !blocked) pollCapture(list);
            var pressed = list.some(function (gp) {
                return actVal(gp, "pause") > 0.5;
            });
            if (blocked || open || wasCapturing) {
                padSysLatch = pressed || wasCapturing;
                return;
            }
            var rising = pressed && !padSysLatch;
            padSysLatch = pressed;
            if (!rising) return;
            var state = actions.getState();
            if (state === "play" || state === "paused") actions.pause();
            else if (state === "menu" || state === "over") actions.start();
        }
        function destroy() {
            if (destroyed) return;
            clear();
            destroyed = true;
            listeners.forEach(function (remove) {
                remove();
            });
            listeners = [];
            assignmentButtons = [];
            bindingButtons = Object.create(null);
            if (addedTouch) document.body.classList.remove("touch");
        }

        loadSettings();
        if (addedTouch) document.body.classList.add("touch");
        listen(
            window,
            "keydown",
            function (e) {
                onKey(e, true);
            },
            { passive: false },
        );
        listen(
            window,
            "keyup",
            function (e) {
                onKey(e, false);
            },
            { passive: false },
        );
        listen(window, "blur", function () {
            suspended = true;
            clear();
        });
        listen(window, "focus", function () {
            suspended = !!document.hidden;
        });
        listen(document, "visibilitychange", function () {
            suspended = !!document.hidden;
            clear();
            if (document.hidden && actions.getState() === "play")
                actions.pause();
        });
        ["pointerup", "pointercancel"].forEach(function (type) {
            listen(window, type, function (e) {
                releasePointer(e.pointerId);
            });
        });
        [
            ["tL", "left"],
            ["tR", "right"],
            ["tB", "brake"],
            ["tN", "nitro"],
            ["tA", "gas"],
        ].forEach(function (b) {
            bindTouch(b[0], b[1], false);
        });
        [
            ["uL", "left"],
            ["uR", "right"],
            ["uB", "brake"],
            ["uN", "nitro"],
            ["uA", "gas"],
        ].forEach(function (b) {
            bindTouch(b[0], b[1], true);
        });
        listen(
            el("tC"),
            "pointerdown",
            function (e) {
                if (
                    destroyed ||
                    suspended ||
                    document.hidden ||
                    modalOpen() ||
                    actions.getState() !== "play" ||
                    e.button > 0
                )
                    return;
                e.preventDefault();
                actions.toggleCamera();
            },
            { passive: false },
        );
        listen(el("bindPanel"), "click", function (e) {
            var button =
                e.target.closest && e.target.closest("[data-bind-action]");
            if (!button || !el("bindPanel").contains(button) || !modalOpen())
                return;
            var action = button.getAttribute("data-bind-action");
            if (
                !PADACT.some(function (act) {
                    return act.k === action;
                })
            )
                return;
            e.preventDefault();
            e.stopPropagation();
            beginCapture(action);
        });
        listen(el("padRows"), "click", function (e) {
            var button =
                e.target.closest && e.target.closest("[data-pad-slot]");
            if (
                !button ||
                button.disabled ||
                !el("padRows").contains(button) ||
                !modalOpen()
            )
                return;
            var slot = Number(button.getAttribute("data-pad-slot"));
            var raw = button.getAttribute("data-pad-index"),
                index = raw === "auto" ? null : Number(raw);
            if (
                (slot !== 0 && slot !== 1) ||
                slot >= actions.getNumPlayers() ||
                (index !== null && (!Number.isSafeInteger(index) || index < 0))
            )
                return;
            e.preventDefault();
            e.stopPropagation();
            setPadAssign(slot, index);
        });
        listen(el("btnBindsDef"), "click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            clear();
            padMap = defaultMap();
            save("nd_padmap", padMap);
            renderBindings();
        });
        updateStatus(padList());
        return {
            read: read,
            poll: poll,
            clear: clear,
            renderBindings: renderBindings,
            isTouch: isTouch,
            destroy: destroy,
        };
    };
})(window.NeonDrive);
