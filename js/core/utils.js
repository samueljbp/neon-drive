(function () {
    "use strict";

    var ND = (window.NeonDrive = window.NeonDrive || {});
    var PI = Math.PI;
    function clamp(v, a, b) {
        return v < a ? a : v > b ? b : v;
    }
    function lerp(a, b, t) {
        return a + (b - a) * t;
    }
    function rand(a, b) {
        return a + Math.random() * (b - a);
    }
    function randi(a, b) {
        return Math.floor(a + Math.random() * (b - a + 1));
    }
    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }
    function easeIn(a, b, p) {
        return a + (b - a) * Math.pow(p, 2);
    }
    function easeOut(a, b, p) {
        return a + (b - a) * (1 - Math.pow(1 - p, 2));
    }
    function easeInOut(a, b, p) {
        return a + (b - a) * (0.5 - Math.cos(p * PI) / 2);
    }
    function increase(start, inc, max) {
        return (((start + inc) % max) + max) % max;
    }
    function hexRgb(h) {
        h = h.replace("#", "");
        return [
            parseInt(h.substr(0, 2), 16),
            parseInt(h.substr(2, 2), 16),
            parseInt(h.substr(4, 2), 16),
        ];
    }
    function mixRgb(a, b, t) {
        return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    }
    function css(c, a) {
        if (!c) throw new Error("Cor indefinida na paleta");
        var rgb = (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0);
        return a === undefined
            ? "rgb(" + rgb + ")"
            : "rgba(" + rgb + "," + a + ")";
    }
    function shade(c, f) {
        return c.map(function (v) {
            return clamp(v * f, 0, 255);
        });
    }
    function cv(w, h) {
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, w | 0);
        canvas.height = Math.max(1, h | 0);
        return canvas;
    }
    function rr(g, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        g.beginPath();
        g.moveTo(x + r, y);
        g.arcTo(x + w, y, x + w, y + h, r);
        g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r);
        g.arcTo(x, y, x + w, y, r);
        g.closePath();
    }
    function viewportOf(i, numPlayers, w, h) {
        if (numPlayers === 1) return [0, 0, w, h];
        if (h >= w * 0.8) {
            var hh = Math.floor(h / 2);
            return [0, i * hh, w, i ? h - hh : hh];
        }
        var ww = Math.floor(w / 2);
        return [i * ww, 0, i ? w - ww : ww, h];
    }
    ND.util = {
        PI: PI,
        clamp: clamp,
        lerp: lerp,
        rand: rand,
        randi: randi,
        pick: pick,
        easeIn: easeIn,
        easeOut: easeOut,
        easeInOut: easeInOut,
        increase: increase,
        hexRgb: hexRgb,
        mixRgb: mixRgb,
        css: css,
        shade: shade,
        cv: cv,
        rr: rr,
        viewportOf: viewportOf,
    };
})();
