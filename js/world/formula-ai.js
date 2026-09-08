(function (ND) {
    "use strict";

    var clamp = ND.util.clamp,
        rand = ND.util.rand,
        increase = ND.util.increase;

    function createDrivers(count) {
        var drivers = [];
        for (var i = 0; i < count; i++) {
            // Distribuição estratificada: sempre há estilos distintos, mesmo num
            // sorteio ruim. O embaralhamento desvincula desempenho da posição no grid.
            drivers.push({
                pace:
                    0.59 +
                    (0.25 * i) / Math.max(1, count - 1) +
                    rand(-0.01, 0.01),
                cornerLoss:
                    0.06 + (0.065 * ((i * 7) % count)) / Math.max(1, count - 1),
                acceleration: 1 / rand(2.7, 4.3),
                braking: 1 / rand(1.2, 1.8),
                reaction: rand(0.05, 0.38),
                aggression: rand(0.3, 0.9),
                steering: rand(0.7, 1.0),
                line: rand(-0.65, 0.65),
            });
        }
        for (var j = drivers.length - 1; j > 0; j--) {
            var k = Math.floor(Math.random() * (j + 1));
            var swap = drivers[j];
            drivers[j] = drivers[k];
            drivers[k] = swap;
        }
        return drivers;
    }

    function pace(driver, difficulty, maxSpeed) {
        return maxSpeed * clamp(driver.pace + difficulty * 0.06, 0.55, 0.97);
    }

    // Decisões simultâneas sobre um retrato do início do tick. Nenhuma IA lê
    // a posição já atualizada de outra, nem altera os objetos dos jogadores.
    function plan(world, dt, options) {
        var maxSpeed = options.maxSpeed,
            gap = world.SEGLEN * 3;
        var cars = world.traffic.filter(function (c) {
            return !c.finished;
        });
        // Ordem canônica apenas no retrato local: desempates não dependem da
        // ordenação feita pelo chamador e world.traffic não é reordenado.
        cars.sort(function (a, b) {
            return a.id - b.id;
        });
        var traffic = cars.map(function (c) {
            return {
                car: c,
                z: c.z,
                x: c.offset,
                speed: c.speed,
                half: world.vehicleHalfWidth(c.sprite),
            };
        });
        (options.players || []).forEach(function (p) {
            if (!p.finished && !p.dead)
                traffic.push({
                    car: null,
                    z: p.position,
                    x: p.playerX,
                    speed: p.speed,
                    half: world.vehicleHalfWidth(p.sprite),
                });
        });
        function relative(a, b) {
            return (
                increase(0, a - b + world.trackLength / 2, world.trackLength) -
                world.trackLength / 2
            );
        }
        function lateralContact(a, b) {
            return a.half + b.half + 0.055;
        }
        function crosses(from, to, x, width) {
            return (
                x + width > Math.min(from, to) && x - width < Math.max(from, to)
            );
        }
        var plans = new Map();
        traffic.slice(0, cars.length).forEach(function (self) {
            var c = self.car,
                driver = c.driver;
            var limit = 1 - self.half - 0.06;
            var look = world.SEGLEN * 6 + c.speed * 0.32;
            var curve = world.findSegment(c.z).curve;
            var ahead = world.findSegment(c.z + look).curve;
            var bend = Math.max(
                Math.abs(curve),
                Math.abs(ahead),
                Math.abs(world.findSegment(c.z + look / 2).curve),
            );
            var targetSpeed = pace(driver, options.difficulty, maxSpeed);
            var wanted =
                targetSpeed * Math.max(0.46, 1 - bend * driver.cornerLoss);
            var ideal =
                Math.abs(curve) < 0.4
                    ? driver.line
                    : clamp(curve / 4.8, -1, 1) * 0.5 + driver.line * 0.25;
            if (Math.abs(ahead) > Math.abs(curve) + 0.5)
                ideal = -Math.sign(ahead) * 0.4 + driver.line * 0.2;
            ideal = clamp(ideal, -limit, limit);
            var range = gap * 3 + c.speed * 1.2;
            var nearby = traffic.filter(function (other) {
                return (
                    other !== self && Math.abs(relative(other.z, c.z)) < range
                );
            });
            function laneCost(lane) {
                var cost =
                    Math.abs(lane - ideal) * 0.45 +
                    Math.abs(lane - c.offset) * 0.18;
                for (var n = 0; n < nearby.length; n++) {
                    var other = nearby[n],
                        rel = relative(other.z, c.z);
                    var contact = lateralContact(self, other);
                    // Não cruzar um carro ao lado, nem fechar um que se aproxima atrás.
                    var beside =
                        Math.abs(rel) < gap - 0.001 ||
                        (rel < 0 &&
                            -rel <
                                gap +
                                    Math.max(0, other.speed - c.speed) * 0.65);
                    if (
                        beside &&
                        crosses(c.offset, lane, other.x, contact) &&
                        Math.abs(lane - other.x) <
                            Math.abs(c.offset - other.x) + 0.02
                    )
                        return Infinity;
                    if (rel > 0 && Math.abs(lane - other.x) < contact + 0.03) {
                        var closing =
                            Math.max(0, wanted - other.speed) / maxSpeed;
                        cost += (0.25 + closing * 7) * (1 - rel / range);
                    }
                }
                return cost;
            }
            var lane = clamp(c.lane, -limit, limit),
                laneT = Math.max(0, c.laneT - dt);
            if (laneT === 0 || !Number.isFinite(laneCost(lane))) {
                var candidates = [lane, ideal, -0.74, -0.37, 0, 0.37, 0.74];
                // Procura também corredores estreitos entre carros, não apenas
                // os pontos fixos. Importante com dois humanos parados lado a lado.
                nearby.forEach(function (other) {
                    var clearance = lateralContact(self, other) + 0.04;
                    candidates.push(other.x - clearance, other.x + clearance);
                });
                var best = laneCost(lane);
                candidates.forEach(function (candidate) {
                    candidate = clamp(candidate, -limit, limit);
                    var cost = laneCost(candidate);
                    if (cost + 0.08 < best) {
                        best = cost;
                        lane = candidate;
                    }
                });
                if (!Number.isFinite(best)) lane = c.offset;
                // Compromete-se com a manobra, em vez de ziguezaguear a cada frame.
                laneT = 0.8 + (1 - driver.aggression) * 0.8;
            }
            // Depois da reação de largada, uma manobra lenta continua possível
            // atrás de um carro parado. Multiplicar por zero prendia a fila inteira.
            var steerStep =
                c.launchDelay > 0
                    ? 0
                    : driver.steering * dt * clamp(c.speed / maxSpeed, 0.15, 1);
            var offset =
                c.offset + clamp(lane - c.offset, -steerStep, steerStep);
            var launchDelay = Math.max(0, c.launchDelay - dt);
            var speed =
                c.launchDelay > 0
                    ? 0
                    : c.speed +
                      clamp(
                          wanted - c.speed,
                          -maxSpeed * driver.braking * dt,
                          maxSpeed * driver.acceleration * dt,
                      );

            nearby.forEach(function (other) {
                var rel = relative(other.z, c.z);
                if (
                    rel <= 0 ||
                    !crosses(
                        c.offset,
                        offset,
                        other.x,
                        lateralContact(self, other),
                    )
                )
                    return;
                var headway =
                    gap + c.speed * (0.12 + (1 - driver.aggression) * 0.14);
                var followSpeed = Math.max(
                    0,
                    other.speed + (rel - headway) / 0.7,
                );
                if (followSpeed < speed)
                    speed = Math.max(
                        followSpeed,
                        c.speed - maxSpeed * driver.braking * dt,
                    );
            });
            plans.set(c, {
                speed: speed,
                offset: offset,
                lane: lane,
                laneT: laneT,
                launchDelay: launchDelay,
                targetSpeed: targetSpeed,
            });
        });

        // Duas manobras livres isoladamente podem disputar o mesmo espaço.
        // Limita o movimento lateral pelo estado inicial, antes de aplicar velocidades.
        traffic.slice(0, cars.length).forEach(function (a) {
            var pa = plans.get(a.car);
            traffic.forEach(function (b) {
                if (a === b || Math.abs(relative(b.z, a.z)) >= gap - 0.001)
                    return;
                var pb = b.car && plans.get(b.car),
                    bx = pb ? pb.offset : b.x;
                var contact = lateralContact(a, b);
                if (
                    Math.abs(a.x - b.x) >= contact &&
                    Math.abs(pa.offset - bx) < contact
                ) {
                    pa.offset = a.x;
                    if (pb) pb.offset = b.x;
                }
            });
        });

        // Freio de segurança: não atravessar quem está à frente enquanto a
        // ultrapassagem ainda não abriu espaço lateral. Relaxação propaga a
        // frenagem por uma fila sem depender da ordem dos carros no array.
        for (var pass = 0; pass < cars.length; pass++) {
            var changed = false;
            traffic.slice(0, cars.length).forEach(function (a) {
                var pa = plans.get(a.car);
                traffic.forEach(function (b) {
                    if (a === b) return;
                    var rel = relative(b.z, a.z);
                    if (rel <= 0) return;
                    var pb = b.car && plans.get(b.car),
                        bx = pb ? pb.offset : b.x;
                    var contact = lateralContact(a, b);
                    if (
                        Math.abs(a.x - b.x) >= contact &&
                        Math.abs(pa.offset - bx) >= contact
                    )
                        return;
                    var cap = Math.max(
                        0,
                        (pb ? pb.speed : b.speed) + (rel - gap) / dt,
                    );
                    if (pa.speed > cap) {
                        pa.speed = cap;
                        changed = true;
                    }
                });
            });
            if (!changed) break;
        }
        return plans;
    }

    ND.formulaAI = { createDrivers: createDrivers, pace: pace, plan: plan };
})(window.NeonDrive);
