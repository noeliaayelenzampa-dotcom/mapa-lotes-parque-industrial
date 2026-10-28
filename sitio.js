// Página de inicio: arma el plano chico, la lista de lotes disponibles y el directorio de empresas
// a partir de los mismos archivos que usa el mapa (data/lotes.csv, data/geometria.json, data/empresas.csv).
(function () {
  "use strict";
  var CFG = window.PARQUE_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function parseCSV(text) {
    var rows = [], row = [], f = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
      else f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    var head = rows.shift().map(function (h) { return h.trim(); });
    return rows.filter(function (r) { return r.length > 1 || r[0]; }).map(function (r) {
      var o = {}; head.forEach(function (h, j) { o[h] = (r[j] || "").trim(); }); return o;
    });
  }
  function num(v) {
    v = String(v == null ? "" : v).trim();
    if (!v) return 0;
    if (v.indexOf(",") >= 0) v = v.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, "");
    return parseFloat(v) || 0;
  }
  function fmtM2(n) {
    if (n >= 10000) return (n / 10000).toLocaleString("es-AR", { maximumFractionDigits: 2 }) + " ha";
    return Math.round(n).toLocaleString("es-AR") + " m²";
  }
  function traer(url, tipo) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(url); return tipo === "json" ? r.json() : r.text(); });
  }

  // ---------- lotes ----------
  function tipoLote(l) {
    var e = (l["Estado"] || "").toLowerCase();
    if (/pulm[oó]n\s+verde/i.test((l["Razón social (público)"] || "") + " " + (l["Tipo"] || ""))) return "v";
    if (/^disponible.*municipalidad/.test(e) || e === "disponible") return "d";
    if (/^disponible.*privado/.test(e) || e === "libre privado") return "p";
    if (oferta(l)) return "p"; // lote privado con oferta de venta o alquiler
    return "o";
  }
  function oferta(l) { return /^(vende|alquila)/i.test(l["Observaciones (públicas)"] || "") ? (/^alquila/i.test(l["Observaciones (públicas)"]) ? "En alquiler" : "En venta") : ""; }
  function sup(l) { var o = num(l["Superficie oficial (m²)"]); return o ? { v: o, aprox: false } : { v: num(l["Superficie medida en plano (m²)"]), aprox: true }; }

  function pintarPlano(geo, porId) {
    var svg = $("mini-plano"), minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, partes = [];
    geo.lotes.forEach(function (g) {
      var l = porId[g.id]; if (!l) return;
      var pts = g.ll.map(function (p) { var x = p[1], y = -p[0]; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); return x.toFixed(1) + " " + y.toFixed(1); });
      var t = tipoLote(l), d = '<path class="' + t + '" d="M' + pts.join("L") + 'Z"><title>' + esc(g.id) + "</title></path>";
      partes.push({ t: t, html: t === "d" || t === "p" ? '<a href="mapa.html#lote-' + encodeURIComponent(g.id) + '">' + d + "</a>" : d });
    });
    // Primero los grises, encima los resaltados.
    partes.sort(function (a, b) { return (a.t === "o" ? 0 : 1) - (b.t === "o" ? 0 : 1); });
    var pad = 8;
    svg.setAttribute("viewBox", (minX - pad) + " " + (minY - pad) + " " + (maxX - minX + 2 * pad) + " " + (maxY - minY + 2 * pad));
    svg.style.aspectRatio = ((maxX - minX + 2 * pad) / (maxY - minY + 2 * pad)).toFixed(3);
    svg.innerHTML = partes.map(function (p) { return p.html; }).join("");
  }

  function pintarLotes(lotes) {
    var disp = lotes.filter(function (l) { var t = tipoLote(l); return t === "d" || t === "p"; });
    disp.sort(function (a, b) { return (tipoLote(a) === "d" ? 0 : 1) - (tipoLote(b) === "d" ? 0 : 1) || sup(b).v - sup(a).v; });
    var mun = disp.filter(function (l) { return tipoLote(l) === "d"; }), priv = disp.length - mun.length;
    var total = mun.reduce(function (s, l) { return s + sup(l).v; }, 0);
    $("lotes-resumen").textContent = mun.length + " lotes municipales disponibles (" + fmtM2(total) + " en total)" +
      (priv ? " y " + priv + " lotes de titulares privados disponibles o en oferta." : ".") + " Tocá un lote para verlo en el mapa.";
    $("lotes-grid").innerHTML = disp.map(function (l) {
      var s = sup(l), t = tipoLote(l), of = oferta(l), obs = (l["Observaciones (públicas)"] || "").replace(/^(vende|alquila)\.?\s*/i, "");
      return '<a class="lote" style="--c:var(' + (t === "d" ? "--st-disponible" : "--st-libreprivado") + ')" href="mapa.html#lote-' + encodeURIComponent(l["ID lote"]) + '">' +
        (of ? '<span class="badge">' + of + "</span>" : "") +
        '<span class="sup">' + (s.aprox ? "≈ " : "") + fmtM2(s.v) + "</span>" +
        '<span class="tit">' + (t === "d" ? "Disponible · titular Municipalidad" : (/^disponible|libre/i.test(l["Estado"]) ? "Disponible · titular privado" : "Titular privado")) + "</span>" +
        '<span class="cod">' + esc(l["ID lote"]) + (l["Manzana"] ? " · Manzana " + esc(l["Manzana"]) : "") + "</span>" +
        (obs ? '<span class="obs">' + esc(obs) + "</span>" : "") +
        '<span class="ver">Ver en el mapa →</span></a>';
    }).join("");
    return mun.length;
  }

  // ---------- empresas ----------
  var EMP = [], filtro = "", q = "";
  function pintarEmpresas() {
    var vis = EMP.filter(function (e) {
      if (filtro && e.Sector !== filtro) return false;
      if (q && (e.Empresa + " " + e.Actividad + " " + e.Sector).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    $("emp-grid").innerHTML = vis.length ? vis.map(function (e) {
      var url = e.Web ? (/^https?:/.test(e.Web) ? e.Web : "https://" + e.Web) : "";
      var ini = e.Empresa.replace(/\(.*?\)/g, "").split(/\s+/).filter(function (w) { return /^[A-ZÁÉÍÓÚÑ]/i.test(w) && !/^(sa|srl|s\.a\.?|s\.r\.l\.?|y|e|de|del)$/i.test(w); }).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase();
      var logo = e.Logo ? '<img src="img/logos/' + esc(e.Logo) + '" alt="Logo de ' + esc(e.Empresa) + '" loading="lazy">' : '<span class="mono-l" aria-hidden="true">' + esc(ini) + "</span>";
      var lote = (e.Lotes || "").split(",")[0].trim();
      return "<li>" + (url ? '<a class="logo" href="' + esc(url) + '" target="_blank" rel="noopener" title="Ir a la web de ' + esc(e.Empresa) + '">' + logo + "</a>" : '<div class="logo">' + logo + "</div>") +
        '<div class="info"><span class="sector">' + esc(e.Sector) + "</span><b>" + esc(e.Empresa) + "</b>" +
        (e.Actividad ? '<span class="act">' + esc(e.Actividad) + "</span>" : "") +
        (/construcci/.test(e["Situación"] || "") ? '<span class="tag">En construcción</span>' : "") +
        '<span class="acc">' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">Sitio web ↗</a>' : "") +
        (lote ? '<a href="mapa.html#lote-' + encodeURIComponent(lote) + '">Ver en el mapa</a>' : "") + "</span></div></li>";
    }).join("") : '<li class="emp-vacio">Ninguna empresa coincide con la búsqueda.</li>';
  }
  function pintarChips() {
    var cont = {};
    EMP.forEach(function (e) { cont[e.Sector] = (cont[e.Sector] || 0) + 1; });
    var sectores = Object.keys(cont).sort(function (a, b) { return cont[b] - cont[a]; });
    $("emp-chips").innerHTML = '<button type="button" class="chip" data-s="" aria-pressed="' + !filtro + '">Todas<span class="n">' + EMP.length + "</span></button>" +
      sectores.map(function (s) { return '<button type="button" class="chip" data-s="' + esc(s) + '" aria-pressed="' + (filtro === s) + '">' + esc(s) + '<span class="n">' + cont[s] + "</span></button>"; }).join("");
  }

  // ---------- contacto y cifras ----------
  function pintarFijos(nDisp) {
    var cif = (CFG.cifras || []).slice();
    if (nDisp != null) cif.push({ valor: String(nDisp), texto: "lotes municipales disponibles" });
    $("cifras").innerHTML = cif.map(function (c) { return "<div><dt>" + esc(c.valor) + "</dt><dd>" + esc(c.texto) + "</dd></div>"; }).join("");
    var c = CFG.contacto || {};
    $("con-area").textContent = "Municipalidad de Paraná. Te asesoramos sobre lotes disponibles, beneficios y el trámite de radicación.";
    // "0343 430-1050" -> +543434301050 ; "0343 15-405-8296" (celular) -> +5493434058296
    var tel = function (t) {
      var d = t.replace(/\D/g, "").replace(/^0/, ""), cel = /^343(15)/.test(d);
      var n = cel ? "+549343" + d.slice(5) : "+54" + d;
      return '<a href="tel:' + n + '">' + esc(t) + "</a>";
    };
    $("con-datos").innerHTML = [
      c.direccion ? "<li><span>Oficinas</span><b>" + esc(c.direccion) + "</b></li>" : "",
      c.telefono ? "<li><span>Teléfono</span>" + tel(c.telefono) + "</li>" : "",
      c.telefono2 ? "<li><span>Celular</span>" + tel(c.telefono2) + "</li>" : "",
      c.email ? '<li><span>Correo</span><a href="mailto:' + esc(c.email) + '">' + esc(c.email) + "</a></li>" : ""
    ].join("");
  }

  function init() {
    pintarFijos(null);
    Promise.all([traer("data/lotes.csv"), traer("data/geometria.json", "json")]).then(function (r) {
      var lotes = parseCSV(r[0]), porId = {};
      lotes.forEach(function (l) { porId[l["ID lote"]] = l; });
      pintarPlano(r[1], porId);
      pintarFijos(pintarLotes(lotes));
    }).catch(function () { $("lotes-resumen").textContent = "No se pudieron cargar los lotes. Probá abrir el mapa."; });

    traer("data/empresas.csv").then(function (t) {
      EMP = parseCSV(t).sort(function (a, b) { return (b.Logo ? 1 : 0) - (a.Logo ? 1 : 0) || a.Empresa.localeCompare(b.Empresa, "es"); });
      pintarChips(); pintarEmpresas();
    }).catch(function () { $("emp-grid").innerHTML = '<li class="emp-vacio">No se pudo cargar el listado de empresas.</li>'; });

    $("emp-chips").addEventListener("click", function (e) {
      var b = e.target.closest(".chip"); if (!b) return;
      filtro = b.dataset.s; pintarChips(); pintarEmpresas();
    });
    $("emp-q").addEventListener("input", function () { q = this.value.trim().toLowerCase(); pintarEmpresas(); });
  }
  document.addEventListener("DOMContentLoaded", init);
})();
