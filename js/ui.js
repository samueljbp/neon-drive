(function (ND) {
    "use strict";

    ND.createUI = function (actions, input) {
        var state = null,
            bindsOpen = false,
            bindsTrigger = null,
            rows = [];
        var circuitHints = [];
        var formulaNotice =
            "Monopostos retrô · 3 voltas · 12 pilotos · Circuitos inspirados nos reais";
        var definitions = [
            {
                key: "mode",
                label: "MODO",
                options: ["CLÁSSICO", "FÓRMULA 1"],
                values: ["classic", "formula"],
                set: "setMode",
                race: true,
            },
            {
                key: "circuit",
                label: "CIRCUITO",
                select: true,
                set: "setCircuit",
                race: true,
                formula: true,
            },
            {
                key: "livery",
                label: "PINTURA",
                options: ["RUBI", "OURO", "AZUL"],
                values: [0, 1, 2],
                set: "setLivery",
                race: true,
                formula: true,
            },
            {
                key: "numPlayers",
                label: "JOGADORES",
                options: ["1", "2"],
                values: [1, 2],
                set: "setPlayers",
                race: true,
            },
            {
                key: "difficulty",
                label: "DIFICULDADE",
                options: ["FÁCIL", "MÉDIO", "DIFÍCIL"],
                values: [0, 1, 2],
                set: "setDifficulty",
                race: true,
            },
            {
                key: "camera",
                label: "CÂMERA",
                options: ["EXTERNA", "INTERNA"],
                values: [0, 1],
                set: "setCamera",
            },
            {
                key: "quality",
                label: "GRÁFICOS",
                options: ["BAIXA", "MÉDIA", "ALTA"],
                values: [0, 1, 2],
                set: "setQuality",
            },
            {
                key: "muted",
                label: "SOM",
                options: ["LIGADO", "MUDO"],
                values: [false, true],
                set: "setMuted",
            },
        ];

        function el(id) {
            return document.getElementById(id);
        }
        function text(id, value) {
            var node = el(id),
                content = value == null ? "" : String(value);
            if (node && node.textContent !== content)
                node.textContent = content;
        }
        function visible(node, show) {
            if (!node) return;
            node.classList.toggle("hidden", !show);
            node.hidden = !show;
            node.setAttribute("aria-hidden", String(!show));
        }
        function focus(id) {
            var node = typeof id === "string" ? el(id) : id;
            if (node && !node.disabled) node.focus();
        }
        function allowed(def, paused) {
            if (bindsOpen || (paused ? state !== "paused" : state !== "menu"))
                return false;
            return (
                !(def.race && (paused || state !== "menu")) &&
                (!def.formula || actions.getSettings().mode === "formula")
            );
        }
        function change(def, paused, value) {
            if (!allowed(def, paused)) {
                refresh();
                return;
            }
            if (actions.getSettings()[def.key] === value) return;
            if (def.race) input.clear();
            // Somente o main altera a configuração e faz o reset controlado da corrida.
            actions[def.set](value);
            refresh();
        }
        function makeRow(host, def, paused) {
            var row = document.createElement("div"),
                label = document.createElement("label");
            var group = document.createElement("span"),
                controls = [];
            row.className = "row";
            row.setAttribute("data-setting", def.key);
            label.className = "lbl2";
            label.id = host.id + "-" + def.key + "-label";
            label.textContent = def.label;
            group.className = "seg";
            group.setAttribute("role", "group");
            group.setAttribute("aria-labelledby", label.id);
            if (def.select) {
                var select = document.createElement("select");
                select.className = "opt";
                select.id = host.id + "-" + def.key;
                label.htmlFor = select.id;
                for (var i = 0; i < 4; i++) {
                    var option = document.createElement("option");
                    option.value = String(i);
                    select.appendChild(option);
                }
                select.addEventListener("change", function () {
                    if (!/^[0-3]$/.test(select.value)) {
                        refresh();
                        return;
                    }
                    change(def, paused, Number(select.value));
                });
                group.appendChild(select);
                controls.push(select);
            } else {
                def.options.forEach(function (name, index) {
                    var button = document.createElement("button");
                    button.type = "button";
                    button.className = "opt";
                    button.textContent = name;
                    button.addEventListener("click", function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        change(def, paused, def.values[index]);
                    });
                    group.appendChild(button);
                    controls.push(button);
                });
            }
            row.appendChild(label);
            row.appendChild(group);
            host.appendChild(row);
            rows.push({
                node: row,
                def: def,
                paused: paused,
                controls: controls,
            });
            if (def.select) {
                var hint = document.createElement("div");
                hint.className = "padhint";
                hint.id = host.id + "-circuit-hint";
                controls[0].setAttribute("aria-describedby", hint.id);
                host.appendChild(hint);
                circuitHints.push(hint);
            }
        }
        function buildPanels() {
            ["menuPanel", "pausePanel"].forEach(function (id) {
                var host = el(id),
                    paused = id === "pausePanel";
                if (!host) return;
                host.textContent = "";
                definitions.forEach(function (def) {
                    makeRow(host, def, paused);
                });
                if (paused) {
                    var hint = document.createElement("div");
                    hint.id = "pauseSettingsHint";
                    hint.className = "padhint";
                    hint.textContent = "Troque modo/circuito no menu";
                    host.appendChild(hint);
                }
            });
        }
        function circuitLabel(circuit) {
            return (
                circuit.name + (circuit.country ? " · " + circuit.country : "")
            );
        }
        function refresh() {
            var settings = actions.getSettings(),
                formula = settings.mode === "formula";
            document.body.classList.toggle("two", settings.numPlayers === 2);
            text("menuTagline", formula ? "O GRID É SEU." : "A NOITE É SUA.");
            text(
                "menuEdition",
                formula
                    ? "4 CIRCUITOS · 3 VOLTAS · 12 PILOTOS"
                    : "8 CENÁRIOS · 4 FAIXAS · 1–2 PILOTOS",
            );
            text(
                "menuRaceHint",
                formula
                    ? formulaNotice
                    : "Desvie do tráfego · Cruze checkpoints · Corra contra o tempo",
            );
            rows.forEach(function (entry) {
                var def = entry.def,
                    enabled = allowed(def, entry.paused);
                visible(entry.node, !def.formula || formula);
                entry.node.setAttribute("aria-disabled", String(!enabled));
                entry.controls.forEach(function (control, index) {
                    control.disabled = !enabled;
                    if (entry.paused && def.race)
                        control.setAttribute(
                            "aria-describedby",
                            "pauseSettingsHint",
                        );
                    if (def.select) {
                        for (var i = 0; i < 4; i++) {
                            var circuit = ND.circuits[i],
                                option = control.options[i];
                            option.textContent = circuitLabel(circuit);
                            option.label = option.textContent;
                            option.title = circuit.description;
                            option.selected = settings.circuit === i;
                        }
                        control.value = String(settings.circuit);
                        control.setAttribute(
                            "aria-label",
                            def.label +
                                ": " +
                                circuitLabel(ND.circuits[settings.circuit]),
                        );
                        control.title =
                            ND.circuits[settings.circuit].description;
                    } else {
                        var selected = settings[def.key] === def.values[index];
                        control.className = "opt" + (selected ? " on" : "");
                        control.setAttribute("aria-pressed", String(selected));
                        control.setAttribute(
                            "aria-label",
                            def.label + ": " + def.options[index],
                        );
                    }
                });
            });
            circuitHints.forEach(function (hint) {
                var circuit = ND.circuits[settings.circuit];
                hint.textContent =
                    circuit.shortName + " · " + circuit.description;
                visible(hint, formula);
            });
        }
        function updateLayers() {
            visible(el("menu"), !bindsOpen && state === "menu");
            visible(el("pause"), !bindsOpen && state === "paused");
            visible(el("over"), !bindsOpen && state === "over");
            visible(el("binds"), bindsOpen);
        }
        function show(nextState) {
            if (["menu", "play", "paused", "over"].indexOf(nextState) < 0)
                return;
            var changed = state !== nextState;
            if (changed) {
                input.clear();
                bindsOpen = false;
                bindsTrigger = null;
            }
            state = nextState;
            updateLayers();
            refresh();
            if (changed) {
                if (state === "menu") focus("btnStart");
                else if (state === "paused") focus("btnResume");
                else if (state === "over") focus("btnAgain");
                else if (
                    document.activeElement &&
                    document.activeElement !== document.body
                )
                    document.activeElement.blur();
            }
        }
        function openBindings(trigger) {
            if ((state !== "menu" && state !== "paused") || !el("binds"))
                return;
            input.clear();
            bindsOpen = true;
            bindsTrigger = trigger;
            var modal = el("binds");
            modal.setAttribute("role", "dialog");
            modal.setAttribute("aria-modal", "true");
            modal.setAttribute("aria-label", "Mapear controle");
            updateLayers();
            input.renderBindings();
            refresh();
            focus("btnBindsBack");
        }
        function closeBindings() {
            if (!bindsOpen) return;
            input.clear();
            bindsOpen = false;
            updateLayers();
            refresh();
            focus(bindsTrigger);
            bindsTrigger = null;
        }
        function bindButton(id, fn) {
            var button = el(id);
            if (!button) return;
            button.type = "button";
            button.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                fn();
            });
        }
        function showResults(result) {
            text("overTitle", result.title);
            text("overLabel", result.subtitle);
            text("finalScore", result.headline);
            text("finalStats", result.details);
            var host = el("resultRows");
            if (host) {
                host.textContent = "";
                var results = Array.isArray(result.rows) ? result.rows : [];
                results.forEach(function (entry) {
                    var row = document.createElement("div"),
                        label = document.createElement("span");
                    var value = document.createElement("span");
                    row.className = "row";
                    label.className = "lbl2";
                    label.textContent = String(entry.label);
                    value.textContent = String(entry.value);
                    row.appendChild(label);
                    row.appendChild(value);
                    host.appendChild(row);
                });
                visible(host, results.length > 0);
            }
            show("over");
        }

        buildPanels();
        ["btnStart", "btnRestart", "btnAgain"].forEach(function (id) {
            bindButton(id, function () {
                input.clear();
                actions.start();
            });
        });
        bindButton("btnResume", function () {
            input.clear();
            actions.pause();
        });
        ["btnMenu", "btnPauseMenu"].forEach(function (id) {
            bindButton(id, function () {
                input.clear();
                actions.menu();
            });
        });
        ["btnBinds", "btnBinds2"].forEach(function (id) {
            bindButton(id, function () {
                openBindings(el(id));
            });
        });
        bindButton("btnBindsBack", closeBindings);
        var modal = el("binds");
        if (modal)
            modal.addEventListener("keydown", function (e) {
                if (!bindsOpen) return;
                if (e.key === "Escape" && !e.repeat) {
                    e.preventDefault();
                    e.stopPropagation();
                    closeBindings();
                } else if (e.key === "Tab") {
                    var buttons = modal.querySelectorAll(
                        "button:not(:disabled), select:not(:disabled)",
                    );
                    var first = buttons[0],
                        last = buttons[buttons.length - 1];
                    if (e.shiftKey && document.activeElement === first) {
                        e.preventDefault();
                        focus(last);
                    } else if (!e.shiftKey && document.activeElement === last) {
                        e.preventDefault();
                        focus(first);
                    }
                }
            });
        show("menu");
        return { refresh: refresh, show: show, showResults: showResults };
    };
})(window.NeonDrive);
