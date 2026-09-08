/* Scripts clássicos: carregar depois de NeonDrive.util, inclusive por file://. */
(function (ND) {
    "use strict";

    var PI = ND.util.PI,
        clamp = ND.util.clamp,
        cv = ND.util.cv;

    /* ---------- mini-renderizador 3D: modela e ilumina os carros na inicialização ---------- */
    function Mesh() {
        this.v = [];
        this.f = [];
    }
    Mesh.prototype.vert = function (x, y, z) {
        this.v.push([x, y, z]);
        return this.v.length - 1;
    };
    Mesh.prototype.quad = function (a, b, c, d, m) {
        this.f.push({ i: [a, b, c, d], m: m });
    };
    Mesh.prototype.poly = function (idx, m) {
        this.f.push({ i: idx, m: m });
    };

    function M(col, spec, shin, rim, emis) {
        return {
            col: col,
            spec: spec === undefined ? 0.5 : spec,
            shin: shin || 24,
            rim: rim === undefined ? 0.6 : rim,
            emis: !!emis,
        };
    }

    /* ambiente de luz: sol quente à frente-esquerda, céu violeta acima, contraluz magenta */
    var ENV = (function () {
        var L = [-0.4, 0.66, 0.64],
            n = Math.sqrt(L[0] * L[0] + L[1] * L[1] + L[2] * L[2]);
        return {
            L: [L[0] / n, L[1] / n, L[2] / n],
            amb: [0.3, 0.28, 0.34],
            sky: [0.42, 0.48, 0.62],
            gnd: [0.09, 0.06, 0.12],
            key: [1.0, 0.86, 0.74],
            spc: [0.82, 0.94, 1.0],
            rimc: [255, 105, 180],
        };
    })();

    function shadeCol(n, mat) {
        var nd = Math.max(
            0,
            n[0] * ENV.L[0] + n[1] * ENV.L[1] + n[2] * ENV.L[2],
        );
        var hemi = 0.5 + 0.5 * n[1];
        var rimF = Math.pow(1 - Math.abs(n[2]), 3.2) * mat.rim;
        var hx = ENV.L[0],
            hy = ENV.L[1],
            hz = ENV.L[2] - 1;
        var hl = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
        var sd = Math.max(0, (n[0] * hx + n[1] * hy + n[2] * hz) / hl);
        var spf = Math.pow(sd, mat.shin) * mat.spec;
        var o = [0, 0, 0];
        for (var i = 0; i < 3; i++) {
            o[i] = clamp(
                mat.col[i] *
                    (ENV.amb[i] +
                        hemi * ENV.sky[i] +
                        (1 - hemi) * ENV.gnd[i] +
                        nd * ENV.key[i]) +
                    spf * 225 * ENV.spc[i] +
                    rimF * ENV.rimc[i] * 0.28 +
                    Math.pow(Math.max(0, n[1]), 8) * mat.spec * 38 * ENV.spc[i],
                0,
                255,
            );
        }
        return o;
    }

    /* seção transversal em superelipse — dá o arredondado de carroceria */
    function sectionPts(hw, yb, yt, n, pw, ph) {
        var cy = (yb + yt) * 0.5,
            hh = (yt - yb) * 0.5,
            pts = [],
            i;
        for (i = 0; i < n; i++) {
            var t = (i / n) * PI * 2,
                c = Math.cos(t),
                sn = Math.sin(t);
            pts.push([
                (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), 2 / pw) * hw,
                cy + (sn < 0 ? -1 : 1) * Math.pow(Math.abs(sn), 2 / ph) * hh,
            ]);
        }
        return pts;
    }
    function resample(secs, count) {
        var out = [],
            n = secs.length,
            i,
            c;
        for (i = 0; i < count; i++) {
            var t = (i / (count - 1)) * (n - 1),
                k = Math.min(n - 2, Math.floor(t)),
                f = t - k;
            var p0 = secs[Math.max(0, k - 1)],
                p1 = secs[k],
                p2 = secs[k + 1],
                p3 = secs[Math.min(n - 1, k + 2)];
            var f2 = f * f,
                f3 = f2 * f,
                row = [0, 0, 0, 0];
            for (c = 0; c < 4; c++) {
                var m0 = (p2[c] - p0[c]) * 0.5,
                    m1 = (p3[c] - p1[c]) * 0.5;
                row[c] =
                    (2 * f3 - 3 * f2 + 1) * p1[c] +
                    (f3 - 2 * f2 + f) * m0 +
                    (-2 * f3 + 3 * f2) * p2[c] +
                    (f3 - f2) * m1;
            }
            out.push(row);
        }
        return out;
    }
    function loft(mesh, secs, n, pw, ph, mat, capA, capB) {
        var rings = [],
            i,
            k;
        for (i = 0; i < secs.length; i++) {
            var pts = sectionPts(secs[i][1], secs[i][2], secs[i][3], n, pw, ph),
                r = [];
            for (k = 0; k < n; k++)
                r.push(mesh.vert(pts[k][0], pts[k][1], secs[i][0]));
            rings.push(r);
        }
        for (i = 0; i < rings.length - 1; i++)
            for (k = 0; k < n; k++)
                mesh.quad(
                    rings[i][k],
                    rings[i][(k + 1) % n],
                    rings[i + 1][(k + 1) % n],
                    rings[i + 1][k],
                    mat,
                );
        if (capA) mesh.poly(rings[0].slice(), mat);
        if (capB) mesh.poly(rings[rings.length - 1].slice(), mat);
        return rings;
    }
    function box(mesh, x0, x1, y0, y1, z0, z1, mat) {
        var v = [
            mesh.vert(x0, y0, z0),
            mesh.vert(x1, y0, z0),
            mesh.vert(x1, y1, z0),
            mesh.vert(x0, y1, z0),
            mesh.vert(x0, y0, z1),
            mesh.vert(x1, y0, z1),
            mesh.vert(x1, y1, z1),
            mesh.vert(x0, y1, z1),
        ];
        mesh.quad(v[0], v[1], v[2], v[3], mat);
        mesh.quad(v[5], v[4], v[7], v[6], mat);
        mesh.quad(v[4], v[0], v[3], v[7], mat);
        mesh.quad(v[1], v[5], v[6], v[2], mat);
        mesh.quad(v[3], v[2], v[6], v[7], mat);
        mesh.quad(v[4], v[5], v[1], v[0], mat);
    }
    function wheel(mesh, cx, cz, r, hw, matA, matB, matRim) {
        var n = 24,
            A = [],
            B = [],
            i,
            a;
        for (i = 0; i < n; i++) {
            a = (i / n) * PI * 2;
            A.push(
                mesh.vert(cx - hw, r + Math.sin(a) * r, cz + Math.cos(a) * r),
            );
            B.push(
                mesh.vert(cx + hw, r + Math.sin(a) * r, cz + Math.cos(a) * r),
            );
        }
        for (i = 0; i < n; i++)
            mesh.quad(
                A[i],
                A[(i + 1) % n],
                B[(i + 1) % n],
                B[i],
                i % 2 ? matA : matB,
            );
        mesh.poly(A.slice(), matA);
        mesh.poly(B.slice(), matA);
        // Jantes nas DUAS faces: aro usinado, disco, pinça e cinco raios duplos.
        for (var side = -1; side <= 1; side += 2) {
            var faceX = cx + side * hw * 1.04,
                outer = [],
                inner = [],
                disc = [];
            for (i = 0; i < n; i++) {
                a = (i / n) * PI * 2;
                outer.push(
                    mesh.vert(
                        faceX,
                        r + Math.sin(a) * r * 0.76,
                        cz + Math.cos(a) * r * 0.76,
                    ),
                );
                inner.push(
                    mesh.vert(
                        faceX,
                        r + Math.sin(a) * r * 0.64,
                        cz + Math.cos(a) * r * 0.64,
                    ),
                );
                disc.push(
                    mesh.vert(
                        faceX - side * 0.008,
                        r + Math.sin(a) * r * 0.59,
                        cz + Math.cos(a) * r * 0.59,
                    ),
                );
            }
            mesh.poly(disc, M([58, 66, 79], 0.65, 32, 0.2));
            for (i = 0; i < n; i++)
                mesh.quad(
                    outer[i],
                    outer[(i + 1) % n],
                    inner[(i + 1) % n],
                    inner[i],
                    matRim,
                );
            box(
                mesh,
                faceX - 0.008,
                faceX + 0.008,
                r * 0.8,
                r * 1.33,
                cz + r * 0.34,
                cz + r * 0.52,
                M([238, 66, 54], 0.6, 28, 0.2),
            );
            for (i = 0; i < 10; i++) {
                a = (Math.floor(i / 2) * PI * 2) / 5 + (i % 2) * 0.13;
                var spoke = [];
                for (var j = 0; j < 4; j++) {
                    var rad = r * (j < 2 ? 0.16 : 0.65),
                        ang = a + (j === 0 || j === 3 ? -0.04 : 0.04);
                    spoke.push(
                        mesh.vert(
                            faceX + side * 0.012,
                            r + Math.sin(ang) * rad,
                            cz + Math.cos(ang) * rad,
                        ),
                    );
                }
                mesh.poly(spoke, matRim);
            }
        }
    }

    var SPORT = [
        [-2.25, 0.86, 0.4, 0.86],
        [-2.05, 0.98, 0.34, 0.9],
        [-1.55, 1.04, 0.3, 0.92],
        [-0.8, 1.0, 0.28, 0.9],
        [0.1, 0.95, 0.28, 0.88],
        [1.0, 0.96, 0.3, 0.84],
        [1.75, 0.9, 0.34, 0.76],
        [2.25, 0.7, 0.4, 0.66],
    ];
    var SEDAN = [
        [-2.1, 0.84, 0.36, 0.94],
        [-1.9, 0.9, 0.32, 1.02],
        [-1.3, 0.92, 0.3, 1.04],
        [-0.4, 0.92, 0.3, 1.02],
        [0.6, 0.9, 0.3, 0.98],
        [1.5, 0.86, 0.32, 0.9],
        [2.1, 0.7, 0.38, 0.78],
    ];
    var CANOPY = [
        [-1.45, 0.66, 0.8, 0.92],
        [-1.05, 0.7, 0.8, 1.14],
        [-0.3, 0.72, 0.8, 1.28],
        [0.5, 0.68, 0.8, 1.26],
        [1.1, 0.58, 0.8, 1.04],
        [1.45, 0.44, 0.8, 0.88],
    ];
    var CABIN = [
        [-1.35, 0.74, 0.94, 1.06],
        [-1.0, 0.78, 0.94, 1.34],
        [-0.2, 0.78, 0.94, 1.46],
        [0.7, 0.74, 0.94, 1.44],
        [1.25, 0.62, 0.94, 1.12],
    ];

    /* ponteira de escape: cilindro curto com boca escura */
    function tube(mesh, cx, cy, z0, z1, r, matOut, matIn) {
        var n = 10,
            A = [],
            B = [],
            i,
            a;
        for (i = 0; i < n; i++) {
            a = (i / n) * PI * 2;
            A.push(mesh.vert(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z1));
            B.push(
                mesh.vert(
                    cx + Math.cos(a) * r * 0.74,
                    cy + Math.sin(a) * r * 0.74,
                    z0,
                ),
            );
        }
        for (i = 0; i < n; i++)
            mesh.quad(A[i], A[(i + 1) % n], B[(i + 1) % n], B[i], matOut);
        mesh.poly(B.slice(), matIn);
    }

    function buildCar(bodyCol, accent, style) {
        var m = new Mesh(),
            i;
        var paint = M(bodyCol, 0.95, 48, 0.65),
            glass = M([26, 58, 79], 1.0, 90, 0.65);
        var dark = M([30, 35, 46], 0.55, 32, 0.25),
            slot = M([8, 12, 19], 0.15, 10, 0.12);
        var tire = M([17, 14, 28], 0.18, 10, 0.35),
            tread = M([9, 7, 16], 0.12, 8, 0.28);
        var rim = M([132, 130, 164], 0.95, 44, 0.85),
            chrome = M([208, 208, 232], 1.0, 70, 1.0);
        var light = M(accent, 0.6, 20, 0.4, true),
            plate = M([214, 211, 228], 0.4, 18, 0.3);
        var neon = M([0, 229, 255], 0.7, 26, 0.5, true);
        var sport = style === "sport" || style === "gt";
        var coupe = style === "coupe";
        var secs = sport ? SPORT : SEDAN,
            cab = sport ? CANOPY : CABIN;
        var zr = secs[0][0],
            zf = secs[secs.length - 1][0];
        var top = secs[0][3];

        var f0 = m.f.length;
        loft(m, resample(secs, 24), 28, 4.2, 3.4, paint, true, true); // carroceria suavizada
        if (sport) {
            // faixa de corrida no capô
            var stripe = M([238, 238, 248], 0.9, 36, 0.8);
            for (i = f0; i < m.f.length; i++) {
                var fc = m.f[i],
                    sx = 0,
                    sy = 0,
                    cn = fc.i.length,
                    q;
                for (q = 0; q < cn; q++) {
                    sx += m.v[fc.i[q]][0];
                    sy += m.v[fc.i[q]][1];
                }
                if (Math.abs(sx / cn) < 0.145 && sy / cn > 0.8) fc.m = stripe;
            }
        }
        loft(m, resample(cab, 15), 24, 3.4, 2.6, glass, true, true);

        /* Teto pintado, colunas e frisos: vidro escuro não é uma cabine transparente. */
        var roofY = sport ? 1.275 : 1.455,
            roofW = sport ? 0.56 : 0.62;
        loft(
            m,
            [
                [-0.48, roofW * 0.9, roofY - 0.055, roofY],
                [-0.2, roofW, roofY - 0.025, roofY + 0.022],
                [0.46, roofW * 0.94, roofY - 0.045, roofY + 0.005],
            ],
            12,
            4,
            3,
            paint,
            true,
            true,
        );
        for (var side = -1; side <= 1; side += 2) {
            var sx = side * (sport ? 0.71 : 0.77);
            box(
                m,
                sx - 0.025,
                sx + 0.025,
                0.86,
                roofY - 0.12,
                0.12,
                0.21,
                dark,
            );
            box(
                m,
                side * 0.88 - 0.055,
                side * 0.88 + 0.055,
                0.9,
                0.945,
                0.62,
                0.91,
                dark,
            );
            box(
                m,
                side * 1.02 - 0.13,
                side * 1.02 + 0.13,
                0.92,
                1.02,
                0.58,
                0.86,
                paint,
            );
            box(
                m,
                side * 0.96 - 0.018,
                side * 0.96 + 0.018,
                0.34,
                0.41,
                -1.32,
                1.25,
                dark,
            );
            box(
                m,
                side * 0.94 - 0.02,
                side * 0.94 + 0.02,
                0.72,
                0.756,
                -0.56,
                -0.24,
                chrome,
            );
        }
        // Persianas do vidro traseiro e grade de ventilação do motor.
        for (i = 0; i < (sport ? 6 : 3); i++) {
            var lz = -1.32 + i * 0.115,
                ly2 = (sport ? 0.96 : 1.16) + i * 0.04;
            box(m, -0.6, 0.6, ly2, ly2 + 0.027, lz, lz + 0.038, dark);
        }
        for (i = 0; i < 7; i++)
            box(
                m,
                -0.62,
                0.62,
                top + 0.012,
                top + 0.025,
                zr + 0.32 + i * 0.065,
                zr + 0.35 + i * 0.065,
                slot,
            );

        var wr = sport ? 0.38 : 0.36,
            ww = sport ? 0.17 : 0.15,
            wx = sport ? 0.9 : 0.84;
        wheel(m, -wx, zr + 0.82, wr, ww, tire, tread, rim);
        wheel(m, wx, zr + 0.82, wr, ww, tire, tread, rim);
        wheel(m, -wx, zf - 0.88, wr, ww, tire, tread, rim);
        wheel(m, wx, zf - 0.88, wr, ww, tire, tread, rim);

        /* Painel preto e assinatura LED segmentada, com duas lentes externas. */
        var ly = sport ? 0.62 : 0.68,
            lw = sport ? 0.79 : 0.72,
            ln = sport ? 12 : 8;
        box(
            m,
            -0.84,
            0.84,
            ly - 0.035,
            ly + 0.14,
            zr - 0.038,
            zr + 0.018,
            slot,
        );
        for (i = 0; i < ln; i++) {
            var x0 = -lw + i * ((lw * 2) / ln),
                bw2 = ((lw * 2) / ln) * 0.76;
            box(
                m,
                x0,
                x0 + bw2,
                ly + 0.036,
                ly + 0.087,
                zr - 0.05,
                zr - 0.04,
                light,
            );
        }
        for (i = -1; i <= 1; i += 2) {
            box(
                m,
                i * 0.76 - 0.055,
                i * 0.76 + 0.055,
                ly + 0.01,
                ly + 0.12,
                zr - 0.054,
                zr - 0.04,
                light,
            );
            box(
                m,
                i * 0.57 - 0.18,
                i * 0.57 + 0.18,
                0.56,
                0.64,
                zf - 0.01,
                zf + 0.026,
                M([198, 240, 255], 0.7, 24, 0.3, true),
            );
        }
        box(
            m,
            -0.08,
            0.08,
            ly + 0.15,
            ly + 0.18,
            zr - 0.033,
            zr - 0.026,
            chrome,
        );
        /* para-choque, placa e escapes */
        box(m, -0.78, 0.78, 0.26, 0.44, zr - 0.02, zr + 0.3, dark);
        box(m, -0.17, 0.17, 0.3, 0.42, zr - 0.035, zr - 0.015, plate);
        for (i = 0; i < 5; i++)
            box(
                m,
                -0.115 + i * 0.05,
                -0.092 + i * 0.05,
                0.335,
                0.385,
                zr - 0.041,
                zr - 0.036,
                slot,
            );
        tube(m, -0.36, 0.32, zr + 0.02, zr - 0.07, 0.105, chrome, slot);
        tube(m, 0.36, 0.32, zr + 0.02, zr - 0.07, 0.105, chrome, slot);

        /* difusor com canaletas escuras */
        box(m, -0.7, 0.7, 0.13, 0.28, zr - 0.01, zr + 0.42, dark);
        for (i = 0; i < 6; i++) {
            var fx = -0.58 + i * 0.225;
            box(m, fx, fx + 0.075, 0.14, 0.26, zr - 0.03, zr - 0.005, slot);
        }
        if (sport) {
            /* asa: plataforma baixa sobre o capô traseiro, com fita de neon */
            box(
                m,
                -0.3,
                -0.22,
                top + 0.02,
                top + 0.16,
                zr + 0.12,
                zr + 0.26,
                dark,
            );
            box(
                m,
                0.22,
                0.3,
                top + 0.02,
                top + 0.16,
                zr + 0.12,
                zr + 0.26,
                dark,
            );
            box(
                m,
                -0.99,
                0.99,
                top + 0.15,
                top + 0.2,
                zr - 0.04,
                zr + 0.34,
                dark,
            );
            box(
                m,
                -0.96,
                0.96,
                top + 0.155,
                top + 0.17,
                zr - 0.052,
                zr - 0.042,
                neon,
            );
            box(
                m,
                -1.03,
                -0.97,
                top - 0.02,
                top + 0.3,
                zr - 0.08,
                zr + 0.38,
                dark,
            );
            box(
                m,
                0.97,
                1.03,
                top - 0.02,
                top + 0.3,
                zr - 0.08,
                zr + 0.38,
                dark,
            );
            /* tomadas de ar laterais */
            box(m, -1.02, -0.97, 0.46, 0.68, -0.35, 0.5, slot);
            box(m, 0.97, 1.02, 0.46, 0.68, -0.35, 0.5, slot);
        } else {
            box(
                m,
                -0.78,
                0.78,
                top + 0.01,
                top + (coupe ? 0.14 : 0.06),
                zr + 0.04,
                zr + 0.26,
                paint,
            );
        }
        if (style === "gt") {
            // GT larga; o sedã e o cupê conservam silhuetas próprias.
            for (i = 0; i < m.v.length; i++) m.v[i][0] *= 1.09;
        } else if (coupe) {
            for (i = 0; i < m.v.length; i++) {
                m.v[i][2] *= 0.94;
                if (m.v[i][1] > 0.9) m.v[i][1] = 0.9 + (m.v[i][1] - 0.9) * 0.72;
            }
        }
        return m;
    }

    function buildTruck() {
        var m = new Mesh(),
            i;
        var body = M([206, 210, 226], 0.55, 22, 0.7),
            panel = M([170, 175, 196], 0.5, 20, 0.6);
        var dark = M([28, 24, 46], 0.3, 14, 0.45),
            glass = M([32, 28, 58], 1.0, 60, 1.0);
        var light = M([255, 59, 92], 0.6, 20, 0.4, true);
        var tire = M([17, 14, 28], 0.18, 10, 0.35),
            tread = M([9, 7, 16], 0.12, 8, 0.28);
        var rim = M([128, 126, 158], 0.9, 40, 0.8);
        box(m, -1.22, 1.22, 0.66, 2.62, -2.6, 1.1, body); // baú
        for (i = 0; i < 3; i++)
            box(
                m,
                -1.24,
                1.24,
                0.9 + i * 0.6,
                0.96 + i * 0.6,
                -2.63,
                1.12,
                panel,
            );
        box(m, -1.26, 1.26, 2.54, 2.66, -2.64, 1.14, panel); // friso do teto
        var trim = M([67, 80, 99], 0.65, 32, 0.3),
            stripe = M([20, 160, 193], 0.7, 36, 0.4);
        box(m, -1.23, 1.23, 1.12, 1.38, -2.65, 1.11, stripe);
        box(m, -0.025, 0.025, 0.72, 2.53, -2.67, -2.64, trim);
        for (i = -1; i <= 1; i += 2) {
            box(
                m,
                i * 0.7 - 0.026,
                i * 0.7 + 0.026,
                0.82,
                2.42,
                -2.7,
                -2.66,
                trim,
            );
            box(m, i * 0.7 - 0.1, i * 0.7 + 0.1, 1.04, 1.1, -2.73, -2.7, panel);
            box(
                m,
                i * 1.08 - 0.06,
                i * 1.08 + 0.06,
                2.42,
                2.49,
                -2.68,
                -2.64,
                M([255, 178, 65], 0.3, 16, 0.2, true),
            );
        }
        box(m, -1.24, 1.24, 0.42, 0.7, -2.66, -2.5, dark); // para-choque
        box(m, -1.16, 1.16, 1.24, 2.24, 1.1, 1.92, glass); // cabine
        box(m, -1.2, 1.2, 0.58, 1.28, 1.05, 2.06, body);
        for (i = 0; i < 2; i++) {
            var x = i ? 0.74 : -1.02;
            box(m, x, x + 0.28, 0.74, 0.98, -2.68, -2.62, light);
        }
        wheel(m, -1.14, -1.9, 0.44, 0.2, tire, tread, rim);
        wheel(m, 1.14, -1.9, 0.44, 0.2, tire, tread, rim);
        wheel(m, -1.14, 1.35, 0.44, 0.2, tire, tread, rim);
        wheel(m, 1.14, 1.35, 0.44, 0.2, tire, tread, rim);
        return m;
    }

    /* ---------- monoposto original: proporções dos anos 80/90, sem marcas ---------- */
    function buildFormulaCar(bodyCol, accent, helmetCol) {
        // +z é o bico; a câmera original observa a traseira em -z.
        var m = new Mesh();
        var paint = M(bodyCol, 0.95, 48, 0.65),
            trim = M(accent, 0.8, 40, 0.5),
            carbon = M([18, 22, 30], 0.35, 22, 0.25),
            recess = M([6, 9, 15], 0.12, 12, 0.12),
            metal = M([100, 112, 130], 0.85, 48, 0.4),
            tire = M([20, 20, 27], 0.18, 12, 0.25),
            tread = M([12, 12, 18], 0.12, 8, 0.2),
            rim = M([174, 156, 104], 0.85, 44, 0.55),
            helmet = M(helmetCol, 0.85, 58, 0.5),
            visor = M([14, 36, 50], 1.0, 80, 0.5);

        // Cilindros orientados: braços triangulados de suspensão e arco de proteção.
        function rod(A, B, radius, mat) {
            var dx = B[0] - A[0],
                dy = B[1] - A[1],
                dz = B[2] - A[2];
            var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (len < 1e-9) return;
            dx /= len;
            dy /= len;
            dz /= len;
            var ux = -dz,
                uy = 0,
                uz = dx;
            var ul = Math.sqrt(ux * ux + uz * uz);
            if (ul < 1e-9) {
                ux = 1;
                uz = 0;
            } else {
                ux /= ul;
                uz /= ul;
            }
            var vx = dy * uz - dz * uy,
                vy = dz * ux - dx * uz,
                vz = dx * uy - dy * ux;
            var a = [],
                b = [];
            for (var j = 0; j < 8; j++) {
                var t = (j / 8) * PI * 2,
                    c = Math.cos(t) * radius,
                    s = Math.sin(t) * radius;
                var x = ux * c + vx * s,
                    y = uy * c + vy * s,
                    z = uz * c + vz * s;
                a.push(m.vert(A[0] + x, A[1] + y, A[2] + z));
                b.push(m.vert(B[0] + x, B[1] + y, B[2] + z));
            }
            for (var k = 0; k < 8; k++)
                m.quad(a[k], a[(k + 1) % 8], b[(k + 1) % 8], b[k], mat);
            m.poly(a, mat);
            m.poly(b, mat);
        }

        // Assoalho estreito e fundo do cockpit: nenhum teto ou vidro sobre o piloto.
        box(m, -0.79, 0.79, 0.1, 0.16, -1.95, 1.17, carbon);
        box(m, -0.37, 0.37, 0.16, 0.4, -1.85, 1.7, paint);
        box(m, -0.31, 0.31, 0.405, 0.445, -0.43, 0.79, recess);
        loft(
            m,
            resample(
                [
                    [0.69, 0.37, 0.3, 0.77],
                    [1.15, 0.29, 0.26, 0.67],
                    [1.92, 0.17, 0.22, 0.46],
                    [2.66, 0.09, 0.2, 0.29],
                ],
                16,
            ),
            16,
            3.4,
            3.0,
            paint,
            true,
            true,
        );
        // Faixa contrastante sobre o bico, desenhada sem textura nem logo.
        loft(
            m,
            [
                [0.81, 0.052, 0.741, 0.777],
                [1.15, 0.05, 0.656, 0.69],
                [1.92, 0.043, 0.452, 0.486],
                [2.6, 0.031, 0.286, 0.32],
            ],
            8,
            3,
            3,
            trim,
            true,
            true,
        );

        loft(
            m,
            resample(
                [
                    [-2.05, 0.17, 0.23, 0.43],
                    [-1.51, 0.31, 0.22, 0.61],
                    [-0.91, 0.28, 0.25, 0.93],
                    [-0.46, 0.22, 0.3, 1.02],
                ],
                14,
            ),
            16,
            3.2,
            2.5,
            paint,
            true,
            true,
        );

        for (var side = -1; side <= 1; side += 2) {
            var x = side * 0.6;
            // Sidepods separados do casco e das rodas, com entradas de ar escuras.
            var start = m.v.length;
            loft(
                m,
                resample(
                    [
                        [-1.35, 0.14, 0.18, 0.43],
                        [-0.8, 0.23, 0.18, 0.56],
                        [0.35, 0.23, 0.18, 0.61],
                        [0.84, 0.18, 0.2, 0.55],
                    ],
                    12,
                ),
                12,
                4,
                3.4,
                paint,
                true,
                true,
            );
            for (var v = start; v < m.v.length; v++) m.v[v][0] += x;
            box(m, x - 0.145, x + 0.145, 0.28, 0.48, 0.844, 0.854, recess);
            box(m, x - 0.15, x + 0.15, 0.565, 0.597, -0.63, 0.31, trim);
            for (var vent = 0; vent < 4; vent++)
                box(
                    m,
                    x - 0.13,
                    x + 0.13,
                    0.551,
                    0.57,
                    -0.69 + vent * 0.14,
                    -0.65 + vent * 0.14,
                    recess,
                );

            // Bordas altas delimitam uma abertura real ao redor do assento.
            box(
                m,
                side * 0.35 - 0.055,
                side * 0.35 + 0.055,
                0.4,
                0.74,
                -0.46,
                0.79,
                paint,
            );
            box(
                m,
                side * 0.34 - 0.025,
                side * 0.34 + 0.025,
                0.743,
                0.766,
                -0.38,
                0.69,
                trim,
            );
            rod(
                [side * 0.36, 0.69, 0.57],
                [side * 0.61, 0.87, 0.64],
                0.022,
                metal,
            );
            box(
                m,
                side * 0.63 - 0.11,
                side * 0.63 + 0.11,
                0.84,
                0.93,
                0.55,
                0.72,
                paint,
            );
            box(
                m,
                side * 0.63 - 0.075,
                side * 0.63 + 0.075,
                0.855,
                0.908,
                0.54,
                0.55,
                metal,
            );

            for (var axle = 0; axle < 2; axle++) {
                var z = axle ? 1.67 : -1.6,
                    r = axle ? 0.35 : 0.4,
                    wx = axle ? 1.0 : 1.04,
                    hw = axle ? 0.21 : 0.27;
                // Quatro pneus slick largos e expostos, sem para-lamas.
                wheel(m, side * wx, z, r, hw, tire, tread, rim);
                for (var level = 0; level < 2; level++) {
                    var y = level ? 0.52 : 0.23;
                    for (var arm = -1; arm <= 1; arm += 2)
                        rod(
                            [side * 0.29, y, z + arm * 0.34],
                            [side * (wx - hw), r + (level ? 0.09 : -0.08), z],
                            0.026,
                            metal,
                        );
                }
                rod(
                    [side * 0.33, 0.65, z - 0.16],
                    [side * (wx - hw), r - 0.06, z],
                    0.027,
                    carbon,
                );
            }

            // Endplates e suportes das duas asas de época.
            box(
                m,
                side * 1.1 - 0.027,
                side * 1.1 + 0.027,
                0.12,
                0.35,
                2.17,
                2.72,
                paint,
            );
            box(
                m,
                side * 1.13 - 0.032,
                side * 1.13 + 0.032,
                0.78,
                1.2,
                -2.66,
                -2.08,
                paint,
            );
            box(
                m,
                side * 0.25 - 0.028,
                side * 0.25 + 0.028,
                0.37,
                1.07,
                -2.33,
                -2.21,
                metal,
            );
            tube(m, side * 0.28, 0.3, -1.86, -2.16, 0.063, metal, recess);
        }
        box(m, -1.1, 1.1, 0.15, 0.21, 2.34, 2.71, trim);
        box(m, -1.06, 1.06, 0.22, 0.285, 2.18, 2.34, carbon);
        box(m, -1.13, 1.13, 0.91, 0.98, -2.36, -2.09, carbon);
        box(m, -1.13, 1.13, 1.055, 1.14, -2.63, -2.34, trim);
        box(m, -0.12, 0.12, 0.29, 0.42, -2.08, -2.03, carbon);
        box(
            m,
            -0.06,
            0.06,
            0.32,
            0.395,
            -2.091,
            -2.081,
            M([255, 48, 64], 0.4, 20, 0.3, true),
        );

        // Assento, ombros, arco traseiro e capacete deixam o cockpit reconhecível.
        box(m, -0.25, 0.25, 0.44, 0.83, -0.35, -0.22, recess);
        loft(
            m,
            [
                [-0.19, 0.18, 0.49, 0.79],
                [0.08, 0.26, 0.47, 0.93],
                [0.47, 0.2, 0.48, 0.81],
            ],
            12,
            3,
            2.4,
            trim,
            true,
            true,
        );
        rod([-0.2, 0.76, -0.36], [-0.14, 1.34, -0.3], 0.037, metal);
        rod([-0.14, 1.34, -0.3], [0.14, 1.34, -0.3], 0.037, metal);
        rod([0.14, 1.34, -0.3], [0.2, 0.76, -0.36], 0.037, metal);
        loft(
            m,
            resample(
                [
                    [-0.03, 0.09, 1.02, 1.2],
                    [0.06, 0.19, 0.97, 1.34],
                    [0.24, 0.21, 0.95, 1.39],
                    [0.4, 0.18, 0.97, 1.31],
                    [0.47, 0.08, 1.04, 1.19],
                ],
                12,
            ),
            16,
            2,
            2,
            helmet,
            true,
            true,
        );
        loft(
            m,
            [
                [0.26, 0.212, 1.12, 1.22],
                [0.39, 0.19, 1.11, 1.23],
                [0.48, 0.085, 1.11, 1.19],
            ],
            12,
            3,
            3,
            visor,
            false,
            true,
        );
        return m;
    }

    /* projeção + rasterização por pintor, com normais viradas para a câmera */
    var CAM_H = 2.65,
        CAM_D = 8.6,
        FOCAL = 1000;
    function projectAll(mesh, yaw) {
        var cy = Math.cos(yaw),
            sy = Math.sin(yaw),
            P = [],
            Q = [],
            i;
        for (i = 0; i < mesh.v.length; i++) {
            var p = mesh.v[i];
            var x = p[0] * cy + p[2] * sy,
                z = -p[0] * sy + p[2] * cy,
                y = p[1];
            Q.push([x, y, z]);
            var zc = z + CAM_D,
                iz = FOCAL / Math.max(zc, 0.05);
            P.push([x * iz, -(y - CAM_H) * iz, zc]);
        }
        return { P: P, Q: Q };
    }
    function computeFit(mesh, cw, ch, yaws) {
        var P = [],
            i;
        for (i = 0; i < yaws.length; i++)
            P = P.concat(projectAll(mesh, yaws[i]).P);
        var mnx = 1e9,
            mxx = -1e9,
            mny = 1e9,
            mxy = -1e9;
        for (i = 0; i < P.length; i++) {
            if (P[i][0] < mnx) mnx = P[i][0];
            if (P[i][0] > mxx) mxx = P[i][0];
            if (P[i][1] < mny) mny = P[i][1];
            if (P[i][1] > mxy) mxy = P[i][1];
        }
        var s = Math.min(
            (cw * 0.9) / Math.max(mxx - mnx, 1e-6),
            (ch * 0.88) / Math.max(mxy - mny, 1e-6),
        );
        var neutral = projectAll(mesh, 0).P,
            left = Infinity,
            right = -Infinity;
        for (i = 0; i < neutral.length; i++) {
            left = Math.min(left, neutral[i][0]);
            right = Math.max(right, neutral[i][0]);
        }
        return {
            s: s,
            ox: cw / 2 - ((mnx + mxx) / 2) * s,
            oy: ch * 0.962 - mxy * s,
            bodyFraction: ((right - left) * s) / cw,
        };
    }
    function renderMesh(mesh, cw, ch, yaw, fit) {
        var base = cv(cw, ch),
            g = base.getContext("2d");
        var glowC = cv(cw, ch),
            e = glowC.getContext("2d");
        var pr = projectAll(mesh, yaw),
            P = pr.P,
            Q = pr.Q,
            i,
            k;

        g.fillStyle = "rgba(0,0,0,0.50)";
        g.beginPath();
        g.ellipse(
            cw * 0.5,
            ch * 0.962,
            cw * fit.bodyFraction * 0.52,
            ch * 0.028,
            0,
            0,
            PI * 2,
        );
        g.fill();

        /* passe de silhueta: preenche a área toda opaca ANTES do sombreamento,
     senão as arestas antialiasadas entre faces deixam o carro translúcido */
        var order = [];
        for (i = 0; i < mesh.f.length; i++) {
            var f = mesh.f[i],
                d = 0;
            for (k = 0; k < f.i.length; k++) d += P[f.i[k]][2];
            order.push({ f: f, d: d / f.i.length });
        }
        order.sort(function (a, b) {
            return b.d - a.d;
        });

        g.fillStyle = "#120e20";
        g.strokeStyle = "#120e20";
        g.lineWidth = 2.6;
        for (i = 0; i < order.length; i++) {
            var sil = order[i].f.i;
            g.beginPath();
            for (k = 0; k < sil.length; k++) {
                var qx0 = P[sil[k]][0] * fit.s + fit.ox,
                    qy0 = P[sil[k]][1] * fit.s + fit.oy;
                if (k === 0) g.moveTo(qx0, qy0);
                else g.lineTo(qx0, qy0);
            }
            g.closePath();
            g.fill();
            g.stroke();
        }

        for (i = 0; i < order.length; i++) {
            var fc = order[i].f,
                idx = fc.i,
                mat = fc.m;
            var a = Q[idx[0]],
                b = Q[idx[1]],
                c = Q[idx[2]];
            var ux = b[0] - a[0],
                uy = b[1] - a[1],
                uz = b[2] - a[2];
            var vx = c[0] - a[0],
                vy = c[1] - a[1],
                vz = c[2] - a[2];
            var nx = uy * vz - uz * vy,
                ny = uz * vx - ux * vz,
                nz = ux * vy - uy * vx;
            var nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
            if (nl < 1e-9) continue;
            nx /= nl;
            ny /= nl;
            nz /= nl;
            var ccx = 0,
                ccy = 0,
                ccz = 0;
            for (k = 0; k < idx.length; k++) {
                ccx += Q[idx[k]][0];
                ccy += Q[idx[k]][1];
                ccz += Q[idx[k]][2];
            }
            ccx /= idx.length;
            ccy /= idx.length;
            ccz /= idx.length;
            var vwx = -ccx,
                vwy = CAM_H - ccy,
                vwz = -CAM_D - ccz;
            if (nx * vwx + ny * vwy + nz * vwz < 0) {
                nx = -nx;
                ny = -ny;
                nz = -nz;
            }

            var col = mat.emis ? mat.col : shadeCol([nx, ny, nz], mat);
            var st =
                "rgb(" +
                (col[0] | 0) +
                "," +
                (col[1] | 0) +
                "," +
                (col[2] | 0) +
                ")";
            g.fillStyle = st;
            g.strokeStyle = st;
            g.lineWidth = 2;
            g.beginPath();
            for (k = 0; k < idx.length; k++) {
                var px = P[idx[k]][0] * fit.s + fit.ox,
                    py = P[idx[k]][1] * fit.s + fit.oy;
                if (k === 0) g.moveTo(px, py);
                else g.lineTo(px, py);
            }
            g.closePath();
            g.fill();
            g.stroke();

            // Toda face oclui a emissão anterior, inclusive lanternas do lado oposto.
            e.globalCompositeOperation = mat.emis
                ? "source-over"
                : "destination-out";
            {
                e.fillStyle = st;
                e.strokeStyle = st;
                e.lineWidth = 1;
                e.beginPath();
                for (k = 0; k < idx.length; k++) {
                    var qx = P[idx[k]][0] * fit.s + fit.ox,
                        qy = P[idx[k]][1] * fit.s + fit.oy;
                    if (k === 0) e.moveTo(qx, qy);
                    else e.lineTo(qx, qy);
                }
                e.closePath();
                e.fill();
                e.stroke();
            }
        }
        e.globalCompositeOperation = "source-over";
        return { img: base, glow: glowC };
    }
    function carSprites(mesh, cw, ch, worldW, yaws) {
        var fit = computeFit(mesh, cw, ch, yaws),
            out = [],
            i;
        // worldW mede a carroceria, não as margens transparentes do atlas de ângulos.
        var canvasWorldW = worldW / fit.bodyFraction;
        for (i = 0; i < yaws.length; i++) {
            var r = renderMesh(mesh, cw, ch, yaws[i], fit);
            out.push({
                img: r.img,
                glow: r.glow,
                w: cw,
                h: ch,
                worldW: canvasWorldW,
                bodyW: worldW,
                solid: true,
            });
        }
        return out;
    }

    ND.models = {
        Mesh: Mesh,
        M: M,
        box: box,
        loft: loft,
        wheel: wheel,
        tube: tube,
        resample: resample,
        buildCar: buildCar,
        buildTruck: buildTruck,
        buildFormulaCar: buildFormulaCar,
        projectAll: projectAll,
        computeFit: computeFit,
        renderMesh: renderMesh,
        carSprites: carSprites,
    };
})(window.NeonDrive);
