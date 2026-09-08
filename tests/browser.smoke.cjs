// Verificação opcional: node tests/browser.smoke.cjs [caminho-do-playwright]
// O jogo não depende do Playwright. Capturas ficam apenas na pasta temporária.
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { chromium } = require(process.argv[2] || "playwright");

(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({
            viewport: { width: 1280, height: 800 },
        });
        const errors = [];
        page.on("pageerror", (error) => errors.push(String(error)));
        page.on("console", (message) => {
            if (message.type() === "error") errors.push(message.text());
        });
        // Relógio e observação exclusivos do teste; nenhum hook no código do jogo.
        await page.addInitScript(() => {
            let callback,
                time = 1000,
                factory;
            const fillText = CanvasRenderingContext2D.prototype.fillText;
            window.__canvasTexts = [];
            CanvasRenderingContext2D.prototype.fillText = function (
                text,
                ...args
            ) {
                window.__canvasTexts.push(String(text));
                return fillText.call(this, text, ...args);
            };
            window.requestAnimationFrame = (next) => {
                callback = next;
                return 1;
            };
            window.__frames = (count) => {
                for (let i = 0; i < count; i++) {
                    window.__canvasTexts.length = 0;
                    time += 1000 / 60;
                    callback(time);
                }
            };
            window.NeonDrive = {};
            Object.defineProperty(window.NeonDrive, "createRace", {
                configurable: true,
                get: () => factory,
                set(value) {
                    factory = (...args) => (window.__race = value(...args));
                },
            });
        });
        await page.goto(
            pathToFileURL(path.resolve(__dirname, "..", "index.html")).href,
        );
        const frames = (n) =>
            page.evaluate((count) => window.__frames(count), n);
        const option = (label) =>
            page
                .locator("#menuPanel")
                .getByRole("button", { name: label, exact: true });
        const snapshot = () =>
            page.evaluate(() => ({
                state: window.__race.state,
                elapsed: window.__race.elapsed,
                countdown: window.__race.countdown,
                mode: window.__race.mode,
                speeds: window.__race.players.map((p) => p.speed),
                distances: window.__race.players.map((p) => p.distance),
                laps: window.__race.players.map((p) => p.laps),
                lapCount: window.__race.world.lapCount,
                hudLapCounts: window.__race.players.map(
                    (_, i) => window.__race.hudFor(i).lapCount,
                ),
                lapFlashes: window.__race.players.map((p) => p.lapFlash),
                finished: window.__race.players.map((p) => p.finished),
                finishTimes: window.__race.players.map((p) => p.finishTime),
                ranks: window.__race.players.map((p) => p.rank),
                nitro: window.__race.players[0].nitroCharges,
            }));
        await frames(3);
        await option("GRÁFICOS: MÉDIA").click();
        await option("SOM: MUDO").click();
        await option("MODO: FÓRMULA 1").click();
        const totalLaps = await page.evaluate(
            () => window.NeonDrive.modes.formula.lapCount,
        );
        assert.ok(
            (await page.locator("#menuEdition").textContent()).includes(
                `${totalLaps} VOLTAS`,
            ),
        );
        assert.ok(
            (await page.locator("#menuRaceHint").textContent()).includes(
                `${totalLaps} voltas`,
            ),
        );
        assert.equal((await snapshot()).lapCount, totalLaps);
        assert.equal(
            await page.locator("#menuPanel-circuit option").count(),
            4,
        );
        await page.locator("#btnStart").click();
        await frames(60);
        let state = await snapshot();
        assert.equal(state.elapsed, 0);
        assert.equal(state.speeds[0], 0);
        await frames(130);
        await page.keyboard.down("ArrowUp");
        await frames(130);
        assert.ok((await snapshot()).speeds[0] > 10000);
        await page.keyboard.down("Space");
        await frames(8);
        await page.keyboard.up("Space");
        assert.equal((await snapshot()).nitro, 2);
        const screenshots = [];
        async function capture(name) {
            const file = path.join(os.tmpdir(), "neon-drive-" + name + ".png");
            await page.screenshot({ path: file });
            screenshots.push(file);
        }
        await capture("formula-exterior");
        await page.keyboard.up("ArrowUp");
        await page.keyboard.press("p");
        const paused = await snapshot();
        assert.equal(paused.state, "paused");
        assert.ok(await page.locator("#pausePanel-circuit").isDisabled());
        await frames(90);
        assert.deepEqual(await snapshot(), paused);
        await page
            .locator("#pausePanel")
            .getByRole("button", { name: "CÂMERA: INTERNA", exact: true })
            .click();
        await page.locator("#btnResume").click();
        await frames(3);
        await capture("formula-cockpit");
        await page.keyboard.press("p");
        await page.locator("#btnPauseMenu").click();
        await option("JOGADORES: 2").click();
        await option("CÂMERA: EXTERNA").click();
        await page.locator("#menuPanel-circuit").selectOption("1");
        await page.locator("#btnStart").click();
        await frames(190);
        await page.keyboard.down("ArrowUp");
        await page.keyboard.down("w");
        await frames(50);
        await page.keyboard.up("ArrowUp");
        await page.keyboard.up("w");
        assert.ok((await snapshot()).speeds.every((speed) => speed > 1000));
        await capture("formula-split");
        // Fixtures pontuais cruzam a linha pela física real do main; não é
        // necessário rasterizar minutos inteiros para verificar cada fronteira.
        async function beforeCrossing(lap, elapsed) {
            await page.evaluate(
                ({ lap, elapsed }) => {
                    const race = window.__race,
                        length = race.world.trackLength;
                    race.elapsed = elapsed;
                    race.world.traffic.forEach((car, i) => {
                        car.z = length / 2 + i * race.world.SEGLEN * 2;
                        car.progress = car.distance = car.z;
                    });
                    race.world.syncTraffic();
                    race.players.forEach((p, i) => {
                        const total = race.world.lapCount,
                            crossingDistance = length * (lap ?? total),
                            remaining = i ? 100 : 200;
                        p.distance = crossingDistance - remaining;
                        p.position = length - remaining;
                        p.speed = race.maxSpeed;
                        p.playerX = i ? 0.46 : -0.46;
                        p.laps = lap ?? total;
                        p.lapStarted = elapsed - 36;
                        p.bestLap = 35;
                        p.nitroCharges = 0;
                        p.boostT = p.boosting = p.lapFlash = 0;
                    });
                },
                { lap, elapsed },
            );
        }
        for (const [lap, elapsed] of [
            [1, 40],
            [3, 120],
            [totalLaps - 1, 160],
        ]) {
            await beforeCrossing(lap, elapsed);
            await frames(3);
            state = await snapshot();
            assert.equal(
                state.state,
                "play",
                `Passagem ${lap} não encerra a corrida`,
            );
            assert.deepEqual(state.laps, [lap + 1, lap + 1]);
            assert.deepEqual(state.finished, [false, false]);
            assert.deepEqual(state.finishTimes, [null, null]);
            assert.deepEqual(state.hudLapCounts, [totalLaps, totalLaps]);
            assert.ok(
                state.lapFlashes.every((flash) => flash > 0 && flash < 2.4),
            );
            assert.equal(state.nitro, 3);
            assert.ok(await page.locator("#over").isHidden());
            const texts = await page.evaluate(() => window.__canvasTexts);
            assert.ok(
                texts.includes(`${lap + 1}/${totalLaps}`),
                "HUD mostra a volta atual/total",
            );
            assert.ok(
                texts.includes(`VOLTA ${lap + 1} / ${totalLaps}`),
                "Canvas desenha o aviso de volta",
            );
            assert.equal(texts.includes("ÚLTIMA VOLTA"), lap + 1 === totalLaps);
            assert.ok(
                !texts.includes("BANDEIRADA"),
                "Passagem intermediária não é chegada",
            );
            await capture(`formula-lap-${lap + 1}`);
        }
        // Última passagem usa a meta do mundo, com P2 antes de P1 e tempo plausível.
        await beforeCrossing(null, 180);
        await frames(3);
        state = await snapshot();
        assert.equal(state.state, "over");
        assert.deepEqual(state.finished, [true, true]);
        assert.deepEqual(state.laps, [totalLaps, totalLaps]);
        assert.deepEqual(state.lapFlashes, [0, 0]);
        assert.deepEqual(state.ranks, [2, 1]);
        assert.ok(
            state.finishTimes.every(
                (time) => time > 180 && time < 180 + 1 / 60,
            ),
        );
        assert.ok(state.finishTimes[1] < state.finishTimes[0]);
        assert.ok(await page.locator("#over").isVisible());
        const finishTexts = await page.evaluate(() => window.__canvasTexts);
        assert.ok(finishTexts.includes("BANDEIRADA"));
        assert.ok(!finishTexts.includes(`VOLTA ${totalLaps} / ${totalLaps}`));
        assert.ok(
            (await page.locator("#finalStats").textContent()).includes(
                `${totalLaps} voltas`,
            ),
        );
        assert.match(
            await page.locator("#overLabel").textContent(),
            /JOGADOR 2/,
        );
        assert.equal(await page.locator("#resultRows .row").count(), 14);
        await capture("formula-results");
        await page.locator("#btnAgain").click();
        state = await snapshot();
        assert.equal(state.countdown, 3);
        assert.equal(state.elapsed, 0);
        assert.ok(state.distances.every((d) => d === 0));
        assert.deepEqual(state.laps, [1, 1]);
        assert.deepEqual(state.lapFlashes, [0, 0]);
        assert.deepEqual(state.finished, [false, false]);
        assert.deepEqual(state.finishTimes, [null, null]);
        await page.keyboard.press("p");
        await page.locator("#btnPauseMenu").click();
        await option("MODO: CLÁSSICO").click();
        await option("JOGADORES: 1").click();
        await page.locator("#btnStart").click();
        await frames(3);
        assert.equal((await snapshot()).mode, "classic");
        await page.keyboard.down("ArrowUp");
        await frames(90);
        await page.keyboard.up("ArrowUp");
        await capture("classic");
        await page.keyboard.press("p");
        await page.locator("#btnPauseMenu").click();
        await option("MODO: FÓRMULA 1").click();
        for (const width of [390, 320]) {
            await page.setViewportSize({ width, height: 844 });
            await frames(2);
            assert.ok(await page.locator("#btnStart").isVisible());
            const layout = await page.locator("#menu").evaluate((menu) => ({
                width: menu.clientWidth,
                scrollWidth: menu.scrollWidth,
                top:
                    menu.firstElementChild.getBoundingClientRect().top +
                    menu.scrollTop,
            }));
            assert.ok(
                layout.scrollWidth <= layout.width + 1,
                "Menu não deve transbordar na horizontal",
            );
            assert.ok(layout.top >= 0, "Topo do menu deve continuar acessível");
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await option("JOGADORES: 2").click();
        await page.locator("#btnStart").click();
        await frames(10);
        await capture("formula-mobile");
        assert.equal(await page.locator("#err").textContent(), "");
        assert.deepEqual(errors, []);
        console.log(
            `Smoke aprovado: file://, 2 modos, controles, largada, nitro, pausa, cockpit, 2P, ${totalLaps} voltas, avisos no canvas, resultado, reset e mobile 320/390.`,
        );
        console.log("Capturas:", screenshots.join("\n"));
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
