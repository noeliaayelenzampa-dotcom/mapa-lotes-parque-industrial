// Página de inicio: arma el plano chico, la lista de lotes disponibles y el directorio de empresas
// a partir de los mismos archivos que usa el mapa (data/lotes.csv, data/geometria.json, data/empresas.csv).
(function () {
  "use strict";
  var CFG = window.PARQUE_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  // Idioma de la página: index.html en español, en.html en inglés.
  var EN = (document.documentElement.lang || "es").slice(0, 2) === "en";
  var LOC = EN ? "en-US" : "es-AR";
  var TR = { sectores: {}, actividades: {}, observaciones: {} }; // traducciones de datos (data/en.json)
  function t(es, en) { return EN ? en : es; }
  function tr(grupo, clave, porDefecto) { return (EN && TR[grupo] && TR[grupo][clave]) || porDefecto; }

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
    if (n >= 10000) return (n / 10000).toLocaleString(LOC, { maximumFractionDigits: 2 }) + " ha";
    return Math.round(n).toLocaleString(LOC) + " m²";
  }
  function traer(url, tipo) {
    return fetch(url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(url); return tipo === "json" ? r.json() : r.text(); });
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

  function linkWa(texto) {
    var c = CFG.contacto || {};
    return c.whatsapp ? "https://wa.me/" + esc(c.whatsapp) + "?text=" + encodeURIComponent(texto) : "";
  }
  function pintarLotes(lotes) {
    var disp = lotes.filter(function (l) { var t = tipoLote(l); return t === "d" || t === "p"; });
    disp.sort(function (a, b) { return (tipoLote(a) === "d" ? 0 : 1) - (tipoLote(b) === "d" ? 0 : 1) || sup(b).v - sup(a).v; });
    var p = CFG.precioM2;
    var txtPrecio = p ? t(" Precio de referencia de los lotes municipales: $" + p.min.toLocaleString(LOC) + " a $" + p.max.toLocaleString(LOC) + " por m², según ubicación.",
      " Reference price for municipal lots: ARS " + p.min.toLocaleString(LOC) + " to " + p.max.toLocaleString(LOC) + " per m², depending on location.") : "";
    $("lotes-resumen").textContent = t("Lotes municipales y lotes de titulares privados, disponibles o en oferta.", "Municipal lots and privately owned lots, available or on offer.") +
      txtPrecio + t(" Tocá un lote para verlo en el mapa o consultar por él.", " Select a lot to see it on the map or ask about it.");
    $("lotes-grid").innerHTML = disp.map(function (l) {
      var s = sup(l), tp = tipoLote(l), of = oferta(l), obs = (l["Observaciones (públicas)"] || "").replace(/^(vende|alquila)\.?\s*/i, "");
      var id = l["ID lote"], medida = (s.aprox ? "≈ " : "") + fmtM2(s.v);
      var wa = linkWa(t("Hola, quiero consultar por el lote " + id + " (" + medida + ") del Parque Industrial.", "Hello, I would like to ask about lot " + id + " (" + medida + ") at Parque Industrial General Manuel Belgrano, Paraná."));
      if (of && EN) of = of === "En alquiler" ? "For rent" : "For sale";
      return '<div class="lote" style="--c:var(' + (tp === "d" ? "--st-disponible" : "--st-libreprivado") + ')">' +
        (of ? '<span class="badge">' + of + "</span>" : "") +
        '<span class="sup">' + medida + "</span>" +
        '<span class="tit">' + (tp === "d" ? t("Disponible · titular Municipalidad", "Available · owned by the Municipality") : (/^disponible|libre/i.test(l["Estado"]) ? t("Disponible · titular privado", "Available · privately owned") : t("Titular privado", "Privately owned"))) + "</span>" +
        '<span class="cod">' + esc(id) + (l["Manzana"] ? " · " + t("Manzana ", "Block ") + esc(l["Manzana"]) : "") + "</span>" +
        (obs ? '<span class="obs">' + esc(tr("observaciones", obs, obs)) + "</span>" : "") +
        '<span class="lote-acc"><a class="ver" href="mapa.html#lote-' + encodeURIComponent(id) + '">' + t("Ver en el mapa", "See on the map") + " →</a>" +
        (wa ? '<a class="consultar" target="_blank" rel="noopener" href="' + wa + '">' + t("Consultar", "Ask about it") + "</a>" : "") + "</span></div>";
    }).join("");
  }

  // ---------- empresas ----------
  var EMP = [], filtro = "", q = "", verTodas = false;
  // Sin filtro ni búsqueda se muestran las primeras; el resto, con el botón "Ver todas".
  function limiteEmp() { return window.matchMedia("(max-width: 640px)").matches ? 6 : 10; }
  function pintarEmpresas() {
    var vis = EMP.filter(function (e) {
      if (filtro && e.Sector !== filtro) return false;
      if (q && (e.Empresa + " " + e.Actividad + " " + e.Sector).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var lim = limiteEmp(), recorta = !verTodas && !filtro && !q && vis.length > lim;
    var total = vis.length;
    if (recorta) vis = vis.slice(0, lim);
    var mas = $("emp-mas");
    if (mas) {
      mas.hidden = !recorta;
      mas.textContent = t("Ver las " + total + " empresas", "See all " + total + " companies");
    }
    $("emp-grid").innerHTML = vis.length ? vis.map(function (e) {
      var url = e.Web ? (/^https?:/.test(e.Web) ? e.Web : "https://" + e.Web) : "";
      var ini = e.Empresa.replace(/\(.*?\)/g, "").split(/\s+/).filter(function (w) { return /^[A-ZÁÉÍÓÚÑ]/i.test(w) && !/^(sa|srl|s\.a\.?|s\.r\.l\.?|y|e|de|del)$/i.test(w); }).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase();
      var logo = e.Logo ? '<img src="img/logos/' + esc(e.Logo) + '" alt="' + t("Logo de ", "Logo of ") + esc(e.Empresa) + '" loading="lazy">' : '<span class="mono-l" aria-hidden="true">' + esc(ini) + "</span>";
      var lote = (e.Lotes || "").split(",")[0].trim();
      return "<li>" + (url ? '<a class="logo" href="' + esc(url) + '" target="_blank" rel="noopener" title="' + t("Ir a la web de ", "Visit the website of ") + esc(e.Empresa) + '">' + logo + "</a>" : '<div class="logo">' + logo + "</div>") +
        '<div class="info"><span class="sector">' + esc(tr("sectores", e.Sector, e.Sector)) + "</span><b>" + esc(e.Empresa) + "</b>" +
        (e.Actividad ? '<span class="act">' + esc(tr("actividades", e.Empresa, e.Actividad)) + "</span>" : "") +
        (/construcci/.test(e["Situación"] || "") ? '<span class="tag">' + t("En construcción", "Under construction") + "</span>" : "") +
        '<span class="acc">' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + t("Sitio web", "Website") + " ↗</a>" : "") +
        (lote ? '<a href="mapa.html#lote-' + encodeURIComponent(lote) + '">' + t("Ver en el mapa", "See on the map") + "</a>" : "") + "</span></div></li>";
    }).join("") : '<li class="emp-vacio">' + t("Ninguna empresa coincide con la búsqueda.", "No company matches your search.") + "</li>";
  }
  function pintarChips() {
    var cont = {};
    EMP.forEach(function (e) { cont[e.Sector] = (cont[e.Sector] || 0) + 1; });
    var sectores = Object.keys(cont).sort(function (a, b) { return cont[b] - cont[a]; });
    $("emp-chips").innerHTML = '<button type="button" class="chip" data-s="" aria-pressed="' + !filtro + '">' + t("Todas", "All") + '<span class="n">' + EMP.length + "</span></button>" +
      sectores.map(function (s) { return '<button type="button" class="chip" data-s="' + esc(s) + '" aria-pressed="' + (filtro === s) + '">' + esc(tr("sectores", s, s)) + '<span class="n">' + cont[s] + "</span></button>"; }).join("");
  }

  // ---------- contacto y cifras ----------
  function pintarFijos() {
    var cif = (CFG.cifras || []).slice();
    $("cifras").innerHTML = cif.map(function (c) { return "<div><dt>" + esc(c.valor) + "</dt><dd>" + esc(EN && c.textoEn ? c.textoEn : c.texto) + "</dd></div>"; }).join("");
    var c = CFG.contacto || {};
    var saludo = t("Hola, quiero hacer una consulta sobre el Parque Industrial.", "Hello, I have a question about Parque Industrial General Manuel Belgrano, Paraná.");
    var fijo = $("wa-fijo");
    if (fijo && c.whatsapp) { fijo.href = linkWa(saludo); fijo.hidden = false; }
    $("con-area").textContent = t("Municipalidad de Paraná. Te asesoramos sobre lotes disponibles, beneficios y el trámite de radicación.",
      "Municipality of Paraná. We advise on available lots, incentives and the application process.");
    // "0343 430-1050" -> +543434301050 ; "0343 15-405-8296" (celular) -> +5493434058296
    var tel = function (t) {
      var d = t.replace(/\D/g, "").replace(/^0/, ""), cel = /^343(15)/.test(d);
      var n = cel ? "+549343" + d.slice(5) : "+54" + d;
      return '<a href="tel:' + n + '">' + esc(EN ? n.replace(/^\+549?(343)(\d{3})(\d{4})$/, "+54 $1 $2-$3") : t) + "</a>";
    };
    $("con-datos").innerHTML = [
      c.direccion ? "<li><span>" + t("Oficinas", "Offices") + "</span><b>" + esc(c.direccion) + (EN ? ", Entre Ríos, Argentina" : "") + "</b></li>" : "",
      c.telefono ? "<li><span>" + t("Teléfono", "Phone") + "</span>" + tel(c.telefono) + "</li>" : "",
      c.telefono2 ? "<li><span>" + t("Celular", "Mobile") + "</span>" + tel(c.telefono2) + "</li>" : "",
      c.whatsapp ? '<li><span>WhatsApp</span><a target="_blank" rel="noopener" href="' + linkWa(saludo) + '">' + t("Escribinos por WhatsApp", "Message us on WhatsApp") + "</a></li>" : "",
      c.email ? "<li><span>" + t("Correo", "Email") + '</span><a href="mailto:' + esc(c.email) + '">' + esc(c.email) + "</a></li>" : ""
    ].join("");
  }

  function init() {
    pintarFijos();
    // En inglés se cargan primero las traducciones de sectores, actividades y observaciones.
    var listo = EN ? traer("data/en.json", "json").then(function (d) { TR = d; }).catch(function () {}) : Promise.resolve();
    listo.then(function () {
      Promise.all([traer("data/lotes.csv"), traer("data/geometria.json", "json")]).then(function (r) {
        var lotes = parseCSV(r[0]), porId = {};
        lotes.forEach(function (l) { porId[l["ID lote"]] = l; });
        pintarPlano(r[1], porId);
        pintarLotes(lotes);
      }).catch(function () { $("lotes-resumen").textContent = t("No se pudieron cargar los lotes. Probá abrir el mapa.", "The lots could not be loaded. Try opening the map."); });

      traer("data/empresas.csv").then(function (txt) {
        EMP = parseCSV(txt).sort(function (a, b) { return (b.Logo ? 1 : 0) - (a.Logo ? 1 : 0) || a.Empresa.localeCompare(b.Empresa, "es"); });
        pintarChips(); pintarEmpresas();
      }).catch(function () { $("emp-grid").innerHTML = '<li class="emp-vacio">' + t("No se pudo cargar el listado de empresas.", "The company directory could not be loaded.") + "</li>"; });
    });
    if ($("emp-mas")) $("emp-mas").addEventListener("click", function () { verTodas = true; pintarEmpresas(); });

    $("emp-chips").addEventListener("click", function (e) {
      var b = e.target.closest(".chip"); if (!b) return;
      filtro = b.dataset.s; pintarChips(); pintarEmpresas();
    });
    $("emp-q").addEventListener("input", function () { q = this.value.trim().toLowerCase(); pintarEmpresas(); });
  }
  document.addEventListener("DOMContentLoaded", init);
})();
