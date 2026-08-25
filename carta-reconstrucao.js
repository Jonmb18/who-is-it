/*
 * CartaReconstruida
 * Transicao de tela cheia: pedacos rasgados de uma carta voando
 * e se encaixando, com a porcentagem subindo.
 *
 * Uso:
 *   await CartaReconstruida.transicao({ de: 64, para: 76 });
 *   await CartaReconstruida.transicao({ de: 88, para: 100, final: true });
 *
 * Nao depende de nada. Injeta o proprio CSS na primeira chamada.
 */
(function (global) {
  'use strict';

  var CFG = {
    colunas: 5,
    linhas: 5,
    semente: 20260214,

    corFundo: '#14100F',
    corPapel: '#F2E8D8',
    corTinta: '#2B3A55',
    corVinho: '#6E1E2E',
    corOuro: '#C99A4E',

    fonteTitulo: "'Iowan Old Style', Georgia, 'Times New Roman', serif",
    fonteCorpo: "'Iowan Old Style', Georgia, serif",

    entrada: 560,      // fade in do overlay
    voo: 880,          // tempo de voo de cada pedaco
    intervalo: 150,    // atraso entre um pedaco e o proximo
    respiro: 950,      // pausa depois do ultimo pedaco
    saida: 560,        // fade out do overlay

    zIndex: 99999
  };

  var estilosProntos = false;
  var geometria = null;
  var ordemPecas = null;
  var fundoCarta = null;

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

  /* ---------- desenho da carta ---------- */

  function linhaManuscrita(x0, y, largura, rand) {
    var d = 'M' + x0 + ' ' + y.toFixed(1);
    var x = x0, fim = x0 + largura, passo = 9;
    while (x < fim) {
      var nx = Math.min(x + passo, fim);
      var cy = y + (rand() - 0.5) * 7.5;
      d += ' Q' + ((x + nx) / 2).toFixed(1) + ' ' + cy.toFixed(1) +
           ' ' + nx.toFixed(1) + ' ' + (y + (rand() - 0.5) * 2.4).toFixed(1);
      x = nx;
    }
    return d;
  }

  // Carta ilustrativa: rabiscos ilegiveis de proposito, para nao
  // entregar nada do texto real antes da revelacao.
  function montarSvgCarta() {
    var rand = mulberry32(CFG.semente + 77);
    var W = 420, H = 560;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">';

    s += '<defs>' +
         '<linearGradient id="pp" x1="0" y1="0" x2="1" y2="1">' +
         '<stop offset="0" stop-color="#F6EEE0"/>' +
         '<stop offset="0.55" stop-color="' + CFG.corPapel + '"/>' +
         '<stop offset="1" stop-color="#E4D5BC"/>' +
         '</linearGradient></defs>';

    s += '<rect width="' + W + '" height="' + H + '" fill="url(#pp)"/>';

    // manchas suaves de papel envelhecido
    for (var m = 0; m < 7; m++) {
      s += '<ellipse cx="' + (rand() * W).toFixed(0) + '" cy="' + (rand() * H).toFixed(0) +
           '" rx="' + (40 + rand() * 70).toFixed(0) + '" ry="' + (30 + rand() * 55).toFixed(0) +
           '" fill="#C9A87A" opacity="0.055"/>';
    }

    var tinta = CFG.corTinta;
    var g = '<g fill="none" stroke="' + tinta + '" stroke-linecap="round" stroke-linejoin="round">';

    // data no alto, curta
    g += '<path d="' + linhaManuscrita(258, 58, 104, rand) + '" stroke-width="1.9" opacity="0.62"/>';

    // corpo em blocos
    var y = 104;
    var blocos = [6, 5, 7, 4, 5];
    for (var b = 0; b < blocos.length; b++) {
      var n = blocos[b];
      for (var i = 0; i < n; i++) {
        var ultima = (i === n - 1);
        var larg = ultima ? (120 + rand() * 120) : (300 + rand() * 32);
        var x0 = 52 + (i === 0 ? 16 : 0);
        if (x0 + larg > W - 42) larg = W - 42 - x0;
        g += '<path d="' + linhaManuscrita(x0, y, larg, rand) +
             '" stroke-width="' + (1.9 + rand() * 0.7).toFixed(2) +
             '" opacity="' + (0.72 + rand() * 0.2).toFixed(2) + '"/>';
        y += 19.5;
      }
      y += 13;
      if (y > 470) break;
    }

    // assinatura maior, embaixo a direita
    g += '<path d="' + linhaManuscrita(236, 508, 128, rand) +
         '" stroke-width="2.9" opacity="0.9"/>';
    g += '</g>';
    s += g;

    // coracaozinho discreto ao lado da assinatura
    s += '<path d="M210 502 c-6-7-16-3-16 5 0 9 12 15 16 19 4-4 16-10 16-19 0-8-10-12-16-5z" ' +
         'fill="' + CFG.corVinho + '" opacity="0.5"/>';

    s += '</svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(s) + '")';
  }

  /* ---------- recorte dos pedacos ---------- */

  function montarGeometria() {
    var cols = CFG.colunas, rows = CFG.linhas;
    var rand = mulberry32(CFG.semente);
    var jx = (100 / cols) * 0.34, jy = (100 / rows) * 0.34;

    var pts = [];
    for (var r = 0; r <= rows; r++) {
      pts[r] = [];
      for (var c = 0; c <= cols; c++) {
        var x = (c / cols) * 100, y = (r / rows) * 100;
        if (c > 0 && c < cols) x += (rand() - 0.5) * jx;
        if (r > 0 && r < rows) y += (rand() - 0.5) * jy;
        pts[r][c] = { x: x, y: y };
      }
    }

    // pontos intermediarios das bordas, compartilhados entre vizinhos,
    // e por isso as pecas encaixam sem folga
    var eH = [], eV = [];
    var ts = [0.26, 0.5, 0.74];

    for (r = 0; r <= rows; r++) {
      eH[r] = [];
      for (c = 0; c < cols; c++) {
        var arr = [];
        var interior = (r > 0 && r < rows);
        for (var k = 0; k < ts.length; k++) {
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
        var arr2 = [];
        var interior2 = (c > 0 && c < cols);
        for (var k2 = 0; k2 < ts.length; k2++) {
          var p2 = interp(pts[r][c], pts[r + 1][c], ts[k2]);
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

        var poly = v.map(function (p) {
          return p.x.toFixed(2) + '% ' + p.y.toFixed(2) + '%';
        }).join(',');

        pecas.push({
          poly: 'polygon(' + poly + ')',
          cx: ((c + 0.5) / cols) * 100,
          cy: ((r + 0.5) / rows) * 100
        });
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
      'flex-direction:column;align-items:center;justify-content:center;gap:clamp(18px,4vh,34px);',
      'background:radial-gradient(120% 90% at 50% 34%,#241A16 0%,' + CFG.corFundo + ' 62%,#0B0808 100%);',
      'opacity:0;transition:opacity ' + CFG.entrada + 'ms ease;padding:24px;',
      'font-family:' + CFG.fonteCorpo + ';-webkit-font-smoothing:antialiased;}',
      '.cr-overlay.cr-visivel{opacity:1;}',

      '.cr-palco{position:relative;width:min(300px,62vw);aspect-ratio:3/4;',
      'filter:drop-shadow(0 26px 44px rgba(0,0,0,.62));}',

      '.cr-halo{position:absolute;inset:-34%;border-radius:50%;pointer-events:none;',
      'background:radial-gradient(circle,rgba(201,154,78,.20) 0%,rgba(201,154,78,0) 68%);',
      'opacity:.5;transition:opacity 900ms ease;}',
      '.cr-palco.cr-inteira .cr-halo{opacity:1;}',

      '.cr-peca{position:absolute;inset:0;background-size:100% 100%;background-repeat:no-repeat;',
      'will-change:transform,opacity;',
      'filter:drop-shadow(0 0 .7px rgba(43,32,24,.55)) drop-shadow(0 3px 5px rgba(0,0,0,.32));',
      'transition:filter 700ms ease;}',

      '.cr-peca.cr-voando{opacity:0;}',
      '.cr-peca.cr-encaixada{opacity:1;transform:none;}',
      '.cr-peca.cr-anim{transition:transform ' + CFG.voo + 'ms cubic-bezier(.16,.86,.24,1.06),',
      'opacity ' + Math.round(CFG.voo * 0.55) + 'ms ease-out;}',

      '.cr-palco.cr-inteira .cr-peca{',
      'filter:drop-shadow(0 0 0 rgba(0,0,0,0)) drop-shadow(0 10px 22px rgba(0,0,0,.4));}',

      '.cr-info{text-align:center;color:' + CFG.corPapel + ';}',
      '.cr-num{font-family:' + CFG.fonteTitulo + ';font-weight:400;',
      'font-size:clamp(44px,9vw,72px);line-height:1;letter-spacing:-.02em;',
      'color:' + CFG.corPapel + ';font-variant-numeric:tabular-nums;}',
      '.cr-num span{font-size:.44em;margin-left:.08em;color:' + CFG.corOuro + ';}',

      '.cr-trilho{width:min(260px,54vw);height:1px;margin:14px auto 0;',
      'background:rgba(242,232,216,.16);position:relative;overflow:hidden;}',
      '.cr-barra{position:absolute;left:0;top:0;bottom:0;width:0%;',
      'background:linear-gradient(90deg,' + CFG.corVinho + ',' + CFG.corOuro + ');}',

      '.cr-legenda{margin-top:14px;font-size:clamp(12px,2.6vw,14px);letter-spacing:.16em;',
      'text-transform:uppercase;color:rgba(242,232,216,.55);}',
      '.cr-legenda.cr-final{color:' + CFG.corOuro + ';letter-spacing:.2em;}',

      '@media (prefers-reduced-motion: reduce){',
      '.cr-peca.cr-anim{transition:opacity 320ms ease;}',
      '}'
    ].join('');

    var tag = document.createElement('style');
    tag.setAttribute('data-cr', 'carta-reconstruida');
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  /* ---------- preparo ---------- */

  function preparar() {
    injetarEstilos();
    if (!geometria) {
      geometria = montarGeometria();
      ordemPecas = montarOrdem(geometria.length);
    }
    if (!fundoCarta) fundoCarta = montarSvgCarta();
    return { pecas: geometria.length };
  }

  function contarPecas(pct) {
    var total = geometria.length;
    var n = Math.round((pct / 100) * total);
    return Math.max(0, Math.min(total, n));
  }

  /* ---------- contador ---------- */

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
    var final = !!opcoes.final || para >= 100;
    var reduzido = movimentoReduzido();

    preparar();

    var nDe = contarPecas(de);
    var nPara = contarPecas(para);
    var rand = mulberry32(CFG.semente + Math.round(para * 13));

    var overlay = document.createElement('div');
    overlay.className = 'cr-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.setAttribute('aria-label', 'Reconstruindo a carta, ' + Math.round(para) + ' por cento');

    var palco = document.createElement('div');
    palco.className = 'cr-palco';

    var halo = document.createElement('div');
    halo.className = 'cr-halo';
    palco.appendChild(halo);

    var estiloFundo = opcoes.imagem
      ? 'url("' + opcoes.imagem + '")'
      : fundoCarta;

    var nodes = [];
    for (var i = 0; i < geometria.length; i++) {
      var d = document.createElement('div');
      d.className = 'cr-peca';
      d.style.clipPath = geometria[i].poly;
      d.style.webkitClipPath = geometria[i].poly;
      d.style.backgroundImage = estiloFundo;
      if (opcoes.imagem) d.style.filter = 'blur(3px) saturate(.9)';
      d.style.opacity = '0';
      palco.appendChild(d);
      nodes.push(d);
    }

    // ja encaixadas
    for (var a = 0; a < nDe; a++) {
      nodes[ordemPecas[a]].style.opacity = '1';
    }
    // ainda fora do lugar
    var novas = [];
    for (var b = nDe; b < nPara; b++) {
      var idx = ordemPecas[b];
      var el = nodes[idx];
      var ang = rand() * Math.PI * 2;
      var dist = 150 + rand() * 190;
      var dx = Math.cos(ang) * dist;
      var dy = Math.sin(ang) * dist * 0.8 - 40;
      var rot = (rand() - 0.5) * 46;
      if (!reduzido) {
        el.style.transform = 'translate(' + dx.toFixed(0) + 'px,' + dy.toFixed(0) +
          'px) rotate(' + rot.toFixed(1) + 'deg) scale(.86)';
      }
      novas.push(el);
    }
    // as que ainda nao chegaram nessa fase ficam invisiveis
    overlay.appendChild(palco);

    var info = document.createElement('div');
    info.className = 'cr-info';

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

    var intervalo = reduzido ? 70 : CFG.intervalo;
    var voo = reduzido ? 320 : CFG.voo;
    var respiro = reduzido ? 420 : CFG.respiro;

    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          overlay.classList.add('cr-visivel');
        });
      });

      esperar(CFG.entrada + 120).then(function () {
        novas.forEach(function (el, k) {
          setTimeout(function () {
            el.classList.add('cr-anim');
            el.style.opacity = '1';
            el.style.transform = 'none';
          }, k * intervalo);
        });

        var tempoPecas = novas.length ? (novas.length - 1) * intervalo + voo : 0;

        animarContador(num, barra, de, para, Math.max(600, tempoPecas));

        return esperar(tempoPecas + 60);
      }).then(function () {
        if (final) {
          palco.classList.add('cr-inteira');
          legenda.classList.add('cr-final');
          legenda.textContent = opcoes.legendaFinal || 'carta inteira';
          return esperar(respiro + 500);
        }
        return esperar(respiro);
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

  global.CartaReconstruida = {
    transicao: transicao,
    preparar: preparar,
    config: CFG
  };

})(window);
