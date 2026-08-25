/*
 * CartaReconstruida
 * Transicao curta entre fases: pedacos de papel se encaixando
 * enquanto a porcentagem sobe.
 *
 * E decoracao de passagem. Nao revela nada, nao completa a carta.
 *
 * Uso:
 *   await CartaReconstruida.transicao({ de: 64, para: 76 });
 */
(function (global) {
  'use strict';

  var CFG = {
    colunas: 5,
    linhas: 5,
    semente: 20260214,

    corFundo: '#14100F',
    corPapel: '#F2E8D8',
    corVinho: '#6E1E2E',
    corOuro: '#C99A4E',

    fonteTitulo: "'Iowan Old Style', Georgia, 'Times New Roman', serif",

    entrada: 380,     // fade in
    voo: 680,         // voo de cada peca
    intervalo: 110,   // atraso entre uma peca e a proxima
    respiro: 460,     // pausa depois da ultima peca
    saida: 400,       // fade out

    zIndex: 99999
  };

  var estilosProntos = false;
  var geometria = null;
  var ordemPecas = null;
  var fundoPapel = null;

  /* ---------- utilidades ---------- */

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function interp(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function movimentoReduzido() {
    return global.matchMedia &&
      global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function esperar(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  /* ---------- papel ---------- */

  // Papel envelhecido com marcas de tinta apagadas.
  // De proposito nao ha nada legivel nem parecido com texto:
  // o objetivo e so a silhueta de uma carta se remontando.
  function montarSvgPapel() {
    var rand = mulberry32(CFG.semente + 77);
    var W = 420, H = 560;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">';

    s += '<defs><linearGradient id="pp" x1="0" y1="0" x2="1" y2="1">' +
         '<stop offset="0" stop-color="#F6EEE0"/>' +
         '<stop offset="0.55" stop-color="' + CFG.corPapel + '"/>' +
         '<stop offset="1" stop-color="#E2D2B8"/>' +
         '</linearGradient></defs>';

    s += '<rect width="' + W + '" height="' + H + '" fill="url(#pp)"/>';

    // manchas de papel guardado ha tempo
    for (var m = 0; m < 9; m++) {
      s += '<ellipse cx="' + (rand() * W).toFixed(0) + '" cy="' + (rand() * H).toFixed(0) +
           '" rx="' + (40 + rand() * 80).toFixed(0) + '" ry="' + (30 + rand() * 60).toFixed(0) +
           '" fill="#C9A87A" opacity="0.06"/>';
    }

    // vincos de carta dobrada, so um respiro de sombra
    s += '<rect x="0" y="' + (H / 3).toFixed(0) + '" width="' + W + '" height="1.5" fill="#B79C74" opacity="0.16"/>';
    s += '<rect x="0" y="' + ((H / 3) * 2).toFixed(0) + '" width="' + W + '" height="1.5" fill="#B79C74" opacity="0.16"/>';

    // marcas de tinta bem apagadas, sem forma de palavra
    for (var i = 0; i < 14; i++) {
      var x = 54 + rand() * 250;
      var y = 90 + rand() * 400;
      var l = 22 + rand() * 90;
      s += '<rect x="' + x.toFixed(0) + '" y="' + y.toFixed(0) +
           '" width="' + l.toFixed(0) + '" height="' + (1.4 + rand() * 1.2).toFixed(1) +
           '" rx="1" fill="#3A4A63" opacity="' + (0.05 + rand() * 0.06).toFixed(3) + '"/>';
    }

    s += '</svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(s) + '")';
  }

  /* ---------- recorte dos pedacos ---------- */

  function montarGeometria() {
    var cols = CFG.colunas, rows = CFG.linhas;
    var rand = mulberry32(CFG.semente);
    var jx = (100 / cols) * 0.34, jy = (100 / rows) * 0.34;

    var pts = [], r, c;
    for (r = 0; r <= rows; r++) {
      pts[r] = [];
      for (c = 0; c <= cols; c++) {
        var x = (c / cols) * 100, y = (r / rows) * 100;
        if (c > 0 && c < cols) x += (rand() - 0.5) * jx;
        if (r > 0 && r < rows) y += (rand() - 0.5) * jy;
        pts[r][c] = { x: x, y: y };
      }
    }

    // pontos intermediarios compartilhados entre vizinhos,
    // por isso as pecas encaixam sem folga
    var eH = [], eV = [], ts = [0.26, 0.5, 0.74], k;

    for (r = 0; r <= rows; r++) {
      eH[r] = [];
      for (c = 0; c < cols; c++) {
        var arr = [], interior = (r > 0 && r < rows);
        for (k = 0; k < ts.length; k++) {
          var p = interp(pts[r][c], pts[r][c + 1], ts[k]);
          if (interior) p.y += (rand() - 0.5) * jy * 0.9;
          arr.push(p);
        }
        eH[r][c] = arr;
      }
    }

    for (r = 0; r < rows; r++) {
      eV[r] = [];
      for (c = 0; c <= cols; c++) {
        var arr2 = [], interior2 = (c > 0 && c < cols);
        for (k = 0; k < ts.length; k++) {
          var p2 = interp(pts[r][c], pts[r + 1][c], ts[k]);
          if (interior2) p2.x += (rand() - 0.5) * jx * 0.9;
          arr2.push(p2);
        }
        eV[r][c] = arr2;
      }
    }

    var pecas = [];
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        var v = [];
        v.push(pts[r][c]);
        v = v.concat(eH[r][c]);
        v.push(pts[r][c + 1]);
        v = v.concat(eV[r][c + 1]);
        v.push(pts[r + 1][c + 1]);
        v = v.concat(eH[r + 1][c].slice().reverse());
        v.push(pts[r + 1][c]);
        v = v.concat(eV[r][c].slice().reverse());

        pecas.push('polygon(' + v.map(function (p) {
          return p.x.toFixed(2) + '% ' + p.y.toFixed(2) + '%';
        }).join(',') + ')');
      }
    }
    return pecas;
  }

  function montarOrdem(total) {
    var rand = mulberry32(CFG.semente + 999);
    var idx = [];
    for (var i = 0; i < total; i++) idx.push(i);
    for (var j = total - 1; j > 0; j--) {
      var k = Math.floor(rand() * (j + 1));
      var t = idx[j]; idx[j] = idx[k]; idx[k] = t;
    }
    return idx;
  }

  /* ---------- CSS ---------- */

  function injetarEstilos() {
    if (estilosProntos) return;
    estilosProntos = true;

    var css = [
      '.cr-overlay{position:fixed;inset:0;z-index:' + CFG.zIndex + ';display:flex;',
      'flex-direction:column;align-items:center;justify-content:center;gap:clamp(16px,4vh,30px);',
      'background:radial-gradient(120% 90% at 50% 34%,#241A16 0%,' + CFG.corFundo + ' 62%,#0B0808 100%);',
      'opacity:0;transition:opacity ' + CFG.entrada + 'ms ease;padding:24px;',
      'font-family:' + CFG.fonteTitulo + ';-webkit-font-smoothing:antialiased;}',
      '.cr-overlay.cr-visivel{opacity:1;}',

      '.cr-palco{position:relative;width:min(230px,50vw);aspect-ratio:3/4;',
      'filter:drop-shadow(0 20px 36px rgba(0,0,0,.6));}',

      '.cr-peca{position:absolute;inset:0;background-size:100% 100%;background-repeat:no-repeat;',
      'will-change:transform,opacity;opacity:0;',
      'filter:drop-shadow(0 0 .7px rgba(43,32,24,.5)) drop-shadow(0 3px 5px rgba(0,0,0,.3));}',

      '.cr-peca.cr-anim{transition:transform ' + CFG.voo + 'ms cubic-bezier(.16,.86,.24,1.05),',
      'opacity ' + Math.round(CFG.voo * 0.5) + 'ms ease-out;}',

      '.cr-num{font-size:clamp(34px,7.5vw,54px);line-height:1;letter-spacing:-.02em;',
      'color:' + CFG.corPapel + ';font-variant-numeric:tabular-nums;text-align:center;}',
      '.cr-num span{font-size:.44em;margin-left:.08em;color:' + CFG.corOuro + ';}',

      '.cr-trilho{width:min(220px,48vw);height:1px;margin:12px auto 0;',
      'background:rgba(242,232,216,.16);position:relative;overflow:hidden;}',
      '.cr-barra{position:absolute;left:0;top:0;bottom:0;width:0%;',
      'background:linear-gradient(90deg,' + CFG.corVinho + ',' + CFG.corOuro + ');}',

      '.cr-legenda{margin-top:12px;font-size:clamp(11px,2.4vw,13px);letter-spacing:.16em;',
      'text-transform:uppercase;color:rgba(242,232,216,.5);text-align:center;}',

      '@media (prefers-reduced-motion: reduce){.cr-peca.cr-anim{transition:opacity 300ms ease;}}'
    ].join('');

    var tag = document.createElement('style');
    tag.setAttribute('data-cr', 'carta-reconstruida');
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function preparar() {
    injetarEstilos();
    if (!geometria) {
      geometria = montarGeometria();
      ordemPecas = montarOrdem(geometria.length);
    }
    if (!fundoPapel) fundoPapel = montarSvgPapel();
  }

  function contarPecas(pct) {
    var n = Math.round((pct / 100) * geometria.length);
    return Math.max(0, Math.min(geometria.length, n));
  }

  function animarContador(elNum, elBarra, de, para, ms) {
    var t0 = performance.now();
    return new Promise(function (resolve) {
      function passo(t) {
        var p = Math.min(1, (t - t0) / ms);
        var e = 1 - Math.pow(1 - p, 3);
        var v = de + (para - de) * e;
        elNum.firstChild.nodeValue = String(Math.round(v));
        elBarra.style.width = v.toFixed(2) + '%';
        if (p < 1) requestAnimationFrame(passo); else resolve();
      }
      requestAnimationFrame(passo);
    });
  }

  /* ---------- transicao ---------- */

  function transicao(opcoes) {
    opcoes = opcoes || {};
    var de = typeof opcoes.de === 'number' ? opcoes.de : 0;
    var para = typeof opcoes.para === 'number' ? opcoes.para : de;
    var reduzido = movimentoReduzido();

    preparar();

    var nDe = contarPecas(de);
    var nPara = contarPecas(para);
    var rand = mulberry32(CFG.semente + Math.round(para * 13));

    var overlay = document.createElement('div');
    overlay.className = 'cr-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.setAttribute('aria-label', 'Carta reconstruída, ' + Math.round(para) + ' por cento');

    var palco = document.createElement('div');
    palco.className = 'cr-palco';

    var nodes = [];
    for (var i = 0; i < geometria.length; i++) {
      var d = document.createElement('div');
      d.className = 'cr-peca';
      d.style.clipPath = geometria[i];
      d.style.webkitClipPath = geometria[i];
      d.style.backgroundImage = fundoPapel;
      palco.appendChild(d);
      nodes.push(d);
    }

    // pecas que ja estavam no lugar na fase anterior
    for (var a = 0; a < nDe; a++) nodes[ordemPecas[a]].style.opacity = '1';

    // pecas que entram nesta transicao
    var novas = [];
    for (var b = nDe; b < nPara; b++) {
      var el = nodes[ordemPecas[b]];
      if (!reduzido) {
        var ang = rand() * Math.PI * 2;
        var dist = 140 + rand() * 170;
        el.style.transform =
          'translate(' + (Math.cos(ang) * dist).toFixed(0) + 'px,' +
          (Math.sin(ang) * dist * 0.8 - 30).toFixed(0) + 'px) rotate(' +
          ((rand() - 0.5) * 44).toFixed(1) + 'deg) scale(.86)';
      }
      novas.push(el);
    }

    overlay.appendChild(palco);

    var info = document.createElement('div');

    var num = document.createElement('div');
    num.className = 'cr-num';
    num.appendChild(document.createTextNode(String(Math.round(de))));
    var pc = document.createElement('span');
    pc.textContent = '%';
    num.appendChild(pc);

    var trilho = document.createElement('div');
    trilho.className = 'cr-trilho';
    var barra = document.createElement('div');
    barra.className = 'cr-barra';
    barra.style.width = de.toFixed(2) + '%';
    trilho.appendChild(barra);

    var legenda = document.createElement('div');
    legenda.className = 'cr-legenda';
    legenda.textContent = opcoes.legenda || 'da carta reconstruída';

    info.appendChild(num);
    info.appendChild(trilho);
    info.appendChild(legenda);
    overlay.appendChild(info);

    document.body.appendChild(overlay);

    var scrollAntes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    var intervalo = reduzido ? 60 : CFG.intervalo;
    var voo = reduzido ? 300 : CFG.voo;

    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { overlay.classList.add('cr-visivel'); });
      });

      esperar(CFG.entrada + 90).then(function () {
        novas.forEach(function (el, k) {
          setTimeout(function () {
            el.classList.add('cr-anim');
            el.style.opacity = '1';
            el.style.transform = 'none';
          }, k * intervalo);
        });

        var tempoPecas = novas.length ? (novas.length - 1) * intervalo + voo : 0;
        animarContador(num, barra, de, para, Math.max(520, tempoPecas));
        return esperar(tempoPecas + 40);
      }).then(function () {
        return esperar(reduzido ? 260 : CFG.respiro);
      }).then(function () {
        overlay.classList.remove('cr-visivel');
        return esperar(CFG.saida + 40);
      }).then(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        document.body.style.overflow = scrollAntes;
        resolve();
      });
    });
  }

  global.CartaReconstruida = { transicao: transicao, preparar: preparar, config: CFG };

})(window);
