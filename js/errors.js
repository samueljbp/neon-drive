(function () {
    "use strict";
    var shown = false;
    window.__err = function (error) {
        if (shown) return;
        shown = true;
        console.error(error);
        var host = document.getElementById("err");
        if (!host) return;
        host.style.display = "block";
        host.textContent =
            "Não foi possível executar o jogo. Recarregue a página. " +
            "Se abriu um arquivo local, mantenha as pastas css e js junto do index.html. " +
            "Detalhes técnicos no console do navegador.";
    };
    window.addEventListener("error", function (ev) {
        window.__err(ev.error || ev.message);
    });
    window.addEventListener("unhandledrejection", function (ev) {
        window.__err(ev.reason);
    });
})();
