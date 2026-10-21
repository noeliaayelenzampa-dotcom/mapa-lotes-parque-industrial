(function () {
  "use strict";
  var CFG = window.PARQUE_CONFIG || {};
  var LS_EDITS = "parque-lotes-ediciones";
  var LS_GEOREF = "parque-lotes-georef";
  var LS_GESTION = "parque-lotes-gestion";

  // label: lo que ve cualquiera; interno: lo que se ve en modo gestión (si difiere).
  var ESTADOS = [
    { key: "disponible", label: "Disponible", css: "--st-disponible" },
    { key: "reservado", label: "Reservado", css: "--st-reservado" },
    { key: "libre privado", label: "Libre (titular privado)", css: "--st-libreprivado" },
    { key: "en construccion", label: "En construcción", css: "--st-obra" },
    { key: "en actividad", label: "En actividad", css: "--st-actividad" },
    { key: "inactivo", label: "Sin actividad", css: "--st-inactivo" },
    { key: "privado", label: "Privado", css: "--st-privado" },
    { key: "uso comun", label: "Uso común", css: "--st-comun" },
    { key: "usurpado", label: "No disponible", interno: "Usurpado", css: "--st-usurpado", cssPublico: "--st-nodisp" },
    { key: "a confirmar", label: "A confirmar", css: "--st-confirmar" },
    { key: "no disponible", label: "No disponible", css: "--st-nodisp" },
    { key: "sin datos", label: "Sin datos", css: "--st-sindatos" }
  ];
  var CAMPOS = ["id", "manzana", "fraccion", "lote", "tipo", "partida", "partida_prov", "matricula", "superficie_m2", "superficie_aprox_m2", "estado", "razon_social", "rubro", "propietario", "situacion_dominial", "adjudicatario", "titular_plano", "precio", "servicios", "frente_m", "observaciones", "notas_internas", "fuente", "verificar"];

  var $ = function (id) { return document.getElementById(id); };
  var state = {
    lotes: [], byId: {}, selected: null, filtroEstado: null, supMin: 0, q: "",
    vista: "plano", gestion: false, calibrando: false, calibPts: [], pendiente: null
  };
  var map, capa, layerById = {}, calibLayer, etiquetas;

  // ---------- utilidades ----------
  function store(key, val) {
    try {
      if (val === undefined) { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
      if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#999"; }
  function estadoInfo(k) {
    var e = ESTADOS[ESTADOS.length - 1];
    for (var i = 0; i < ESTADOS.length; i++) if (ESTADOS[i].key === k) e = ESTADOS[i];
    if (state.gestion) return { key: e.key, label: e.interno || e.label, css: e.css };
    return { key: e.key, label: e.label, css: e.cssPublico || e.css };
  }
  function fmtM2(n) {
    if (!n && n !== 0) return "—";
    if (n >= 10000) return (n / 10000).toLocaleString("es-AR", { maximumFractionDigits: 2 }) + " ha";
    return Math.round(n).toLocaleString("es-AR") + " m²";
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function num(v) {
    v = String(v == null ? "" : v).trim();
    if (!v) return 0;
    // Acepta 29.390,83 / 90.223 (formato argentino) y 29390.83 (formato de archivo).
    if (v.indexOf(",") >= 0) v = v.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, "");
    return parseFloat(v) || 0;
  }
  function sup(l) { return num(l.superficie_m2) || num(l.superficie_aprox_m2) || 0; }
  function supEsOficial(l) { return !!num(l.superficie_m2); }

  // Encabezados de la planilla madre -> nombres internos.
  var ENCABEZADOS = {
    "id lote": "id", "manzana": "manzana", "fracción": "fraccion", "lote": "lote", "tipo": "tipo", "estado": "estado",
    "razón social (público)": "razon_social", "rubro": "rubro", "superficie oficial (m²)": "superficie_m2",
    "superficie medida en plano (m²)": "superficie_aprox_m2", "partida municipal": "partida", "partida provincial": "partida_prov",
    "matrícula": "matricula", "propietario": "propietario", "situación dominial": "situacion_dominial",
    "adjudicatario / comodato": "adjudicatario", "titular según plano": "titular_plano", "valor / condiciones": "precio",
    "servicios": "servicios", "frente (m)": "frente_m", "observaciones (públicas)": "observaciones",
    "notas internas": "notas_internas", "fuente": "fuente", "a verificar": "verificar"
  };
  function parseCSV(text) {
    var rows = [], row = [], f = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(f); rows.push(row); row = []; f = "";
      } else f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    var head = rows.shift().map(function (h) { h = h.trim(); return ENCABEZADOS[h.toLowerCase()] || h; });
    return rows.filter(function (r) { return r.length > 1 || r[0]; }).map(function (r) {
      var o = {}; head.forEach(function (h, j) { o[h] = (r[j] || "").trim(); }); return o;
    });
  }
  function titulo(h) { return h.charAt(0).toUpperCase() + h.slice(1).replace("(m²)", "(m²)"); }
  function toCSV(lotes, sep) {
    sep = sep || ",";
    var inv = {}; Object.keys(ENCABEZADOS).forEach(function (h) { inv[ENCABEZADOS[h]] = h; });
    var out = [CAMPOS.map(function (k) { return titulo(inv[k] || k); }).join(sep)];
    lotes.forEach(function (l) {
      out.push(CAMPOS.map(function (k) {
        var v = String(l[k] == null ? "" : l[k]);
        if (sep === "\t") return v.replace(/[\t\n]/g, " ");
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(sep));
    });
    return out.join("\n");
  }

  // ---------- georreferencia (transformación afín por mínimos cuadrados) ----------
  function solve3(A, b) {
    var m = A.map(function (r, i) { return r.concat([b[i]]); });
    for (var c = 0; c < 3; c++) {
      var p = c;
      for (var r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
      var t = m[c]; m[c] = m[p]; m[p] = t;
      if (Math.abs(m[c][c]) < 1e-12) return null;
      for (var r2 = 0; r2 < 3; r2++) {
        if (r2 === c) continue;
        var k = m[r2][c] / m[c][c];
        for (var j = c; j < 4; j++) m[r2][j] -= k * m[c][j];
      }
    }
    return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
  }
  function fitAffine(pts) {
    if (!pts || pts.length < 3) return null;
    var AtA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bLat = [0, 0, 0], bLng = [0, 0, 0];
    pts.forEach(function (p) {
      var v = [p.plano[0], p.plano[1], 1];
      for (var i = 0; i < 3; i++) {
        for (var j = 0; j < 3; j++) AtA[i][j] += v[i] * v[j];
        bLat[i] += v[i] * p.gps[0]; bLng[i] += v[i] * p.gps[1];
      }
    });
    var a = solve3(AtA, bLat), b = solve3(AtA, bLng);
    if (!a || !b) return null;
    var T = function (yx) { return [a[0] * yx[0] + a[1] * yx[1] + a[2], b[0] * yx[0] + b[1] * yx[1] + b[2]]; };
    var lat0 = pts[0].gps[0] * Math.PI / 180;
    T.errores = pts.map(function (p) {
      var g = T(p.plano);
      var dy = (g[0] - p.gps[0]) * 111320, dx = (g[1] - p.gps[1]) * 111320 * Math.cos(lat0);
      return Math.sqrt(dx * dx + dy * dy);
    });
    return T;
  }
  function georefPts() { return store(LS_GEOREF) || CFG.georef || []; }

  // ---------- datos ----------
  function cargar() {
    var geo = fetch("data/geometria.json").then(function (r) { return r.json(); });
    fetch("data/calles.json").then(function (r) { return r.json(); }).then(function (c) { state.calles = c; if (map) pintarEtiquetas(); }).catch(function () {});
    fetch("data/manzanas.json").then(function (r) { return r.json(); }).then(function (m) { state.manzanas = m; if (map) pintarEtiquetas(); }).catch(function () {});
    var datos = fetch(CFG.fuenteDatos || "data/lotes.csv").then(function (r) {
      if (!r.ok) throw new Error("No se pudo leer la planilla de datos (" + r.status + ").");
      return r.text();
    }).then(parseCSV);
    return Promise.all([geo, datos]).then(function (res) {
      var g = res[0], filas = res[1], porId = {};
      filas.forEach(function (f) { porId[f.id] = f; });
      var edits = store(LS_EDITS) || {};
      state.geoMeta = g;
      state.lotes = g.lotes.map(function (gl) {
        var l = Object.assign({ id: gl.id }, porId[gl.id] || {}, edits[gl.id] || {});
        l.estado = (l.estado || "sin datos").toLowerCase();
        l.ll = gl.ll; l.c = gl.c; l.r = gl.r;
        return l;
      });
      state.lotes.forEach(function (l) { state.byId[l.id] = l; });
    });
  }

  // ---------- mapa ----------
  function colorDe(l) { return cssVar(estadoInfo(l.estado).css); }
  function estilo(l) {
    var sel = state.selected === l.id;
    var visible = pasaFiltro(l);
    var base = colorDe(l);
    var sinDatos = l.estado === "sin datos";
    return {
      color: sel ? cssVar("--accent") : base,
      weight: sel ? 3 : 1,
      fillColor: base,
      fillOpacity: !visible ? 0.04 : sel ? 0.55 : sinDatos ? 0.08 : (state.vista === "satelite" ? 0.45 : 0.38),
      opacity: visible ? 0.95 : 0.25
    };
  }
  function crearMapa() {
    if (map) { map.remove(); map = null; }
    layerById = {};
    var T = state.vista === "satelite" ? fitAffine(georefPts()) : null;
    if (T) {
      map = L.map("map", { zoomControl: true, attributionControl: true, maxZoom: 20 });
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 20, maxNativeZoom: 19,
        attribution: "Imagen: Esri, Maxar, Earthstar Geographics"
      }).addTo(map);
    } else {
      var W = state.geoMeta.page.w, H = state.geoMeta.page.h;
      map = L.map("map", { crs: L.CRS.Simple, minZoom: -2, maxZoom: 4, zoomSnap: 0.25, attributionControl: false });
      var b = [[-W, 0], [0, H]];
      L.imageOverlay(state.planoCompleto ? "img/plano.png" : "img/plano-limpio.png", b, { className: "plano-img" }).addTo(map);
      map.setMaxBounds(L.latLngBounds(b).pad(0.15));
    }
    capa = L.featureGroup().addTo(map);
    state.lotes.forEach(function (l) {
      var pts = T ? l.ll.map(T) : l.ll;
      var poly = L.polygon(pts, estilo(l));
      poly.on("click", function (e) {
        if (state.calibrando) { calibClick(e); return; }
        seleccionar(l.id, false);
      });
      poly.on("mouseover", function () { if (state.selected !== l.id) poly.setStyle({ weight: 2.5 }); });
      poly.on("mouseout", function () { poly.setStyle(estilo(l)); });
      poly.bindTooltip(textoTip(l), { sticky: true, direction: "top", opacity: 0.95 });
      poly.addTo(capa);
      layerById[l.id] = poly;
    });
    map.on("click", function (e) { if (state.calibrando) calibClick(e); });
    calibLayer = L.layerGroup().addTo(map);
    etiquetas = L.layerGroup().addTo(map);
    map.on("zoomend", pintarEtiquetas);
    pintarCalib();
    var target = state.selected && layerById[state.selected];
    if (target) map.fitBounds(target.getBounds(), { maxZoom: T ? 18 : 2, padding: [40, 40] });
    else map.fitBounds(capa.getBounds(), { padding: [10, 10] });
    pintarEtiquetas();
  }

  // ---------- rótulos sobre el mapa ----------
  // Lotes en actividad: solo la razón social. Disponibles: m² y partida.
  function rotulo(l) {
    if (!pasaFiltro(l)) return null;
    if (l.estado === "disponible" || l.estado === "libre privado") {
      return '<b>' + (l.estado === "disponible" ? "Disponible" : "Libre") + "</b><br>" + fmtM2(sup(l)) + (l.partida ? "<br>Pda. " + esc(l.partida) : "");
    }
    if ((l.estado === "en actividad" || l.estado === "en construccion" || l.estado === "inactivo") && l.razon_social) return esc(l.razon_social);
    return null;
  }
  function pintarEtiquetas() {
    if (!etiquetas || state.planoCompleto) { if (etiquetas) etiquetas.clearLayers(); return; }
    etiquetas.clearLayers();
    var T = state.vista === "satelite" ? fitAffine(georefPts()) : null;
    var z = map.getZoom(), escala = T ? 1 : Math.pow(2, z);
    state.lotes.forEach(function (l) {
      var html = rotulo(l); if (!html || !l.c) return;
      // Mostrar solo si el texto entra en el lote a este zoom.
      var radioPx = (l.r || 0) * escala;
      var largo = html.replace(/<[^>]+>/g, " ").split(" ").reduce(function (m, w) { return Math.max(m, w.length); }, 0);
      if (!T && (radioPx < 14 || radioPx * 2 < Math.min(largo, 14) * 6)) return;
      var pos = T ? T(l.c) : l.c;
      var cls = "rot " + (l.estado === "disponible" || l.estado === "libre privado" ? "rot-disp" : "rot-emp");
      L.marker(pos, { interactive: false, icon: L.divIcon({ className: cls, html: '<span style="max-width:' + Math.max(60, Math.min(170, radioPx * 2)) + 'px">' + html + "</span>", iconSize: null }) }).addTo(etiquetas);
    });
    (state.manzanas || []).forEach(function (m) {
      if (T) return;
      L.marker(m.c, { interactive: false, icon: L.divIcon({ className: "rot rot-mz", html: "<span>Mz " + esc(m.n) + "</span>", iconSize: null }) }).addTo(etiquetas);
    });
    if (!T && z >= 0) (state.calles || []).forEach(function (c) {
      L.marker(c.c, { interactive: false, icon: L.divIcon({ className: "rot rot-calle", html: "<span>" + esc(c.n) + "</span>", iconSize: null }) }).addTo(etiquetas);
    });
  }
  function textoTip(l) {
    var e = estadoInfo(l.estado).label;
    if (l.razon_social && /actividad|construccion|inactivo/.test(l.estado)) return esc(l.razon_social);
    return esc(e + " · " + fmtM2(sup(l)));
  }
  function repintar() {
    state.lotes.forEach(function (l) {
      var p = layerById[l.id]; if (!p) return;
      p.setStyle(estilo(l));
      p.setTooltipContent(textoTip(l));
      if (state.selected === l.id) p.bringToFront();
    });
    pintarEtiquetas();
  }

  // ---------- filtros y lista ----------
  // En la vista pública "usurpado" se agrupa con "no disponible".
  function clave(k) { return !state.gestion && k === "usurpado" ? "no disponible" : k; }
  function pasaFiltro(l) {
    if (state.filtroEstado && clave(l.estado) !== state.filtroEstado) return false;
    if (state.supMin && sup(l) < state.supMin) return false;
    if (state.q) {
      var hay = [l.id, l.manzana, l.partida, l.rubro, l.razon_social, l.observaciones, puedeVerTitular() ? [l.propietario, l.adjudicatario, l.titular_plano].join(" ") : ""].join(" ").toLowerCase();
      if (hay.indexOf(state.q) < 0) return false;
    }
    return true;
  }
  function puedeVerTitular() { return state.gestion || CFG.mostrarTitularPublico; }

  function pintarResumen() {
    var cont = {};
    state.lotes.forEach(function (l) { var k = clave(l.estado); cont[k] = (cont[k] || 0) + 1; });
    $("resumen").innerHTML = ESTADOS.filter(function (e) { return cont[e.key]; }).map(function (e) {
      return '<button type="button" class="chip" data-estado="' + e.key + '" aria-pressed="' + (state.filtroEstado === e.key) + '">' +
        '<span class="dot" style="background:var(' + e.css + ')"></span>' + e.label + ' <span class="n">' + cont[e.key] + "</span></button>";
    }).join("");
    $("leyenda").innerHTML = ESTADOS.filter(function (e) { return cont[e.key]; }).map(function (e) {
      return '<span><i class="dot" style="background:var(' + e.css + ')"></i>' + e.label + "</span>";
    }).join("");
  }
  var ORDEN = {};
  ESTADOS.forEach(function (e, i) { ORDEN[e.key] = i; });
  function pintarLista() {
    var vis = state.lotes.filter(pasaFiltro).sort(function (a, b) {
      return (ORDEN[a.estado] - ORDEN[b.estado]) || a.id.localeCompare(b.id, "es", { numeric: true });
    });
    $("lista-n").textContent = vis.length + " de " + state.lotes.length;
    $("lista-titulo").textContent = state.filtroEstado ? estadoInfo(state.filtroEstado).label : "Todos los lotes";
    if (!vis.length) { $("lista").innerHTML = '<li class="vacio">Ningún lote coincide con los filtros.</li>'; return; }
    var LIM = 25, extra = vis.length - LIM;
    var mostrar = state.verTodos ? vis : vis.slice(0, LIM);
    $("lista").innerHTML = mostrar.map(function (l) {
      var e = estadoInfo(l.estado);
      var sub = [e.label, l.razon_social || l.rubro || null, l.partida ? "Pda. " + l.partida : null].filter(Boolean).join(" · ");
      return '<li><button type="button" class="fila" data-id="' + esc(l.id) + '">' +
        '<span class="dot" style="background:var(' + e.css + ')"></span>' +
        '<span><span class="id">' + esc(l.id) + '</span><span class="sub">' + esc(sub) + "</span></span>" +
        '<span class="m2">' + (supEsOficial(l) ? "" : "≈ ") + fmtM2(sup(l)) + "</span></button></li>";
    }).join("") + (extra > 0 && !state.verTodos ? '<li><button type="button" class="fila mas" id="ver-todos"><span></span><span>Mostrar ' + extra + ' lotes más</span><span></span></button></li>' : "");
  }

  // ---------- ficha ----------
  function linkLote(id) {
    var base = CFG.urlPublica || (location.origin + location.pathname);
    return base.replace(/#.*$/, "") + "#lote-" + id;
  }
  function pintarFicha() {
    var l = state.byId[state.selected], f = $("ficha");
    if (!l) { f.hidden = true; f.innerHTML = ""; return; }
    var e = estadoInfo(l.estado);
    var gest = state.gestion;
    var filas = [
      ["Superficie", (supEsOficial(l) ? fmtM2(num(l.superficie_m2)) + ' <span class="mono">(' + num(l.superficie_m2).toLocaleString("es-AR", { minimumFractionDigits: 2 }) + " m²)</span>" : "≈ " + fmtM2(sup(l)) + ' <span class="nota">medida sobre plano</span>')],
      ["Ubicación", esc(["Manzana " + (l.manzana || "s/d"), l.fraccion ? "Fracción " + l.fraccion : "", l.lote ? "Lote " + l.lote : ""].filter(Boolean).join(" · "))],
      l.razon_social ? ["Empresa", esc(l.razon_social)] : null,
      l.rubro ? ["Rubro", esc(l.rubro)] : null,
      l.partida && !gest && /disponible|libre privado/.test(l.estado) ? ["Partida", '<span class="mono">' + esc(l.partida) + "</span>"] : null,
      l.frente_m ? ["Frente", esc(l.frente_m) + " m"] : null,
      l.servicios ? ["Servicios", esc(l.servicios)] : null,
      l.precio ? ["Valor", esc(l.precio)] : null,
      l.observaciones ? ["Observaciones", esc(l.observaciones)] : null,
      gest ? ["Partida munic.", l.partida ? '<span class="mono">' + esc(l.partida) + "</span>" : "—"] : null,
      gest && l.partida_prov ? ["Partida prov.", '<span class="mono">' + esc(l.partida_prov) + "</span>"] : null,
      gest && l.matricula ? ["Matrícula", '<span class="mono">' + esc(l.matricula) + "</span>"] : null,
      puedeVerTitular() && (l.propietario || l.titular_plano) ? ["Propietario", esc(l.propietario || l.titular_plano + " (según plano)")] : null,
      gest && l.situacion_dominial ? ["Situación dominial", esc(l.situacion_dominial)] : null,
      gest && l.adjudicatario ? ["Adjudicatario / comodato", esc(l.adjudicatario)] : null,
      gest && l.notas_internas ? ["Notas internas", esc(l.notas_internas)] : null,
      gest && l.verificar ? ["A verificar", esc(l.verificar)] : null,
      gest ? ["Fuente", l.fuente === "registro" ? "Registro del parque" : "Solo plano de Catastro"] : null
    ].filter(Boolean);
    var c = CFG.contacto || {};
    var contacto = [c.area, c.email, c.telefono].filter(Boolean).map(esc).join(" · ");
    var msg = "Lote " + l.id + " (" + estadoInfo(l.estado).label.toLowerCase() + ") del " + (CFG.nombre || "Parque Industrial") + " (" + fmtM2(sup(l)) + "): " + linkLote(l.id);
    var html =
      '<div class="ficha-top"><h2>Lote ' + esc(l.id) + "<small>" + esc(l.tipo && l.tipo !== "lote" ? l.tipo : "Parque Industrial") + "</small></h2>" +
      '<button type="button" class="cerrar" id="ficha-cerrar" aria-label="Cerrar ficha">×</button></div>' +
      '<span class="estado"><span class="dot" style="background:var(' + e.css + ')"></span>' + e.label + "</span>" +
      '<dl class="datos">' + filas.map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>"; }).join("") + "</dl>" +
      '<div class="acciones">' +
      '<a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(msg) + '">Compartir por WhatsApp</a>' +
      '<button type="button" class="btn ghost" id="ficha-copiar">Copiar link</button></div>' +
      '<p class="toast" id="ficha-toast" role="status"></p>' +
      (contacto ? '<p class="contacto">Consultas: ' + contacto + "</p>" : "");
    if (state.gestion) html += editorHTML(l);
    f.innerHTML = html;
    f.hidden = false;
    $("ficha-cerrar").onclick = function () { seleccionar(null); };
    $("ficha-copiar").onclick = function () { copiar(linkLote(l.id), "ficha-toast", "Link copiado"); };
    if (state.gestion) conectarEditor(l);
  }
  function editorHTML(l) {
    var opts = ESTADOS.map(function (e) { return '<option value="' + e.key + '"' + (l.estado === e.key ? " selected" : "") + ">" + e.label + "</option>"; }).join("");
    function inp(id, label, val, cls) {
      return '<label class="campo ' + (cls || "") + '"><span>' + label + '</span><input id="ed-' + id + '" value="' + esc(val) + '"></label>';
    }
    return '<div class="editor" id="editor">' +
      '<label class="campo"><span>Estado</span><select id="ed-estado">' + opts + "</select></label>" +
      inp("frente_m", "Frente (m)", l.frente_m) +
      inp("superficie_m2", "Superficie oficial (m²)", l.superficie_m2) +
      inp("partida", "Partida", l.partida) +
      inp("precio", "Valor / condiciones", l.precio, "full") +
      inp("servicios", "Servicios (agua, gas, luz trifásica…)", l.servicios, "full") +
      inp("razon_social", "Razón social (público)", l.razon_social, "full") +
      inp("rubro", "Rubro", l.rubro, "full") +
      inp("propietario", "Propietario", l.propietario, "full") +
      '<label class="campo full"><span>Observaciones (públicas)</span><textarea id="ed-observaciones">' + esc(l.observaciones) + "</textarea></label>" +
      '<label class="campo full"><span>Notas internas</span><textarea id="ed-notas_internas">' + esc(l.notas_internas) + "</textarea></label>" +
      '<div class="acciones full"><button type="button" class="btn" id="ed-guardar">Guardar cambios</button></div></div>';
  }
  function conectarEditor(l) {
    $("ed-guardar").onclick = function () {
      var edits = store(LS_EDITS) || {}, cambio = {};
      ["estado", "frente_m", "superficie_m2", "partida", "precio", "servicios", "razon_social", "rubro", "propietario", "observaciones", "notas_internas"].forEach(function (k) {
        cambio[k] = $("ed-" + k).value.trim();
      });
      Object.assign(l, cambio);
      edits[l.id] = Object.assign(edits[l.id] || {}, cambio);
      store(LS_EDITS, edits);
      pintarResumen(); pintarLista(); repintar(); pintarFicha();
      var t = $("ficha-toast"); if (t) t.textContent = "Guardado en este navegador";
    };
  }
  function seleccionar(id, centrar) {
    state.selected = id;
    pintarFicha(); repintar();
    try { history.replaceState(null, "", id ? "#lote-" + id : (state.gestion ? "#gestion" : location.pathname)); } catch (e) { /* sin historial */ }
    if (id && centrar !== false && layerById[id]) {
      map.fitBounds(layerById[id].getBounds(), { maxZoom: state.vista === "satelite" ? 18 : 2, padding: [40, 40] });
    }
    if (id && window.matchMedia("(max-width: 820px)").matches) $("ficha").scrollIntoView({ behavior: "smooth", block: "start" });
    else if (id) $("panel").scrollTop = 0;
  }

  function copiar(texto, toastId, ok) {
    var t = $(toastId);
    var fallo = function () {
      if (t) t.textContent = "No se pudo copiar automáticamente. Seleccioná el texto: " + texto.slice(0, 120);
    };
    try {
      navigator.clipboard.writeText(texto).then(function () { if (t) t.textContent = ok; }, fallo);
    } catch (e) { fallo(); }
  }

  // ---------- calibración satelital ----------
  function pintarCalib() {
    if (!calibLayer) return;
    calibLayer.clearLayers();
    if (state.vista !== "plano") return;
    state.calibPts.forEach(function (p, i) {
      L.circleMarker(p.plano, { radius: 7, color: cssVar("--accent"), weight: 3, fillOpacity: 0.2 })
        .bindTooltip(String(i + 1), { permanent: true, direction: "right", className: "lbl-lote" }).addTo(calibLayer);
    });
    if (state.pendiente) L.circleMarker(state.pendiente, { radius: 7, color: cssVar("--st-reservado"), weight: 3 }).addTo(calibLayer);
  }
  function calibClick(e) {
    if (state.vista !== "plano") return;
    state.pendiente = [Math.round(e.latlng.lat * 100) / 100, Math.round(e.latlng.lng * 100) / 100];
    pintarCalib(); pintarCalibPanel();
    var inp = $("cal-gps"); if (inp) inp.focus();
  }
  function pintarCalibPanel() {
    var c = $("calib");
    if (!state.calibrando) { c.hidden = true; return; }
    var T = fitAffine(state.calibPts);
    var lista = state.calibPts.map(function (p, i) {
      var err = T ? " · error " + Math.round(T.errores[i]) + " m" : "";
      return "<li>" + esc(p.nombre || "Punto " + (i + 1)) + ' <span class="mono">' + p.gps[0].toFixed(6) + ", " + p.gps[1].toFixed(6) + "</span>" + err + "</li>";
    }).join("");
    c.innerHTML =
      "<p class=\"nota\">Necesitás 3 o más puntos bien separados, por ejemplo esquinas de calles en extremos opuestos del parque.</p>" +
      "<ol><li>Hacé zoom en el plano y tocá una esquina que puedas reconocer.</li>" +
      "<li>En Google Maps, mantené apretado ese mismo lugar y copiá las coordenadas que aparecen.</li>" +
      "<li>Pegalas acá abajo y tocá Agregar.</li></ol>" +
      (state.pendiente ? '<div class="pt"><label class="campo"><span>Coordenadas (lat, lng)</span><input id="cal-gps" placeholder="-31.7xxxx, -60.4xxxx"></label>' +
        '<button type="button" class="btn" id="cal-add">Agregar</button></div>' +
        '<label class="campo"><span>Nombre del punto (opcional)</span><input id="cal-nombre" placeholder="Robinson y Bonell"></label>'
        : '<p class="toast">Tocá un punto en el plano para empezar.</p>') +
      (lista ? "<ol>" + lista + "</ol>" : "") +
      (state.calibPts.length ? '<div class="acciones"><button type="button" class="btn ghost" id="cal-undo">Quitar el último</button>' +
        (T ? '<button type="button" class="btn" id="cal-ver">Ver en satélite</button><button type="button" class="btn ghost" id="cal-copy">Copiar configuración</button>' : "") + "</div>" : "") +
      '<p class="toast" id="cal-toast" role="status"></p>' +
      (T ? "<pre>" + esc(JSON.stringify(state.calibPts)) + "</pre>" : "");
    c.hidden = false;
    var add = $("cal-add");
    if (add) add.onclick = function () {
      var m = ($("cal-gps").value || "").match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
      if (!m) { $("cal-toast").textContent = "Pegá las coordenadas como las da Google Maps, por ejemplo -31.7412, -60.4889."; return; }
      state.calibPts.push({ nombre: $("cal-nombre").value.trim(), plano: state.pendiente, gps: [parseFloat(m[1]), parseFloat(m[2])] });
      state.pendiente = null;
      store(LS_GEOREF, state.calibPts);
      pintarCalib(); pintarCalibPanel(); actualizarBotonSat();
    };
    var undo = $("cal-undo");
    if (undo) undo.onclick = function () { state.calibPts.pop(); store(LS_GEOREF, state.calibPts.length ? state.calibPts : null); pintarCalib(); pintarCalibPanel(); actualizarBotonSat(); };
    var ver = $("cal-ver");
    if (ver) ver.onclick = function () { cambiarVista("satelite"); };
    var cp = $("cal-copy");
    if (cp) cp.onclick = function () { copiar("georef: " + JSON.stringify(state.calibPts), "cal-toast", "Configuración copiada. Mandámela o pegala en config.js."); };
  }

  // ---------- vistas ----------
  function actualizarBotonSat() {
    var ok = !!fitAffine(georefPts());
    $("btn-sat").disabled = !ok;
    $("btn-sat").title = ok ? "Ver los lotes sobre la imagen satelital" : "Falta ubicar el plano en el mapa (modo gestión)";
  }
  function cambiarVista(v) {
    if (v === "satelite" && !fitAffine(georefPts())) return;
    state.vista = v;
    $("btn-plano").classList.toggle("on", v === "plano");
    $("btn-sat").classList.toggle("on", v === "satelite");
    $("btn-plano").setAttribute("aria-pressed", v === "plano");
    $("btn-sat").setAttribute("aria-pressed", v === "satelite");
    var aviso = $("aviso-sat");
    aviso.hidden = v !== "satelite";
    aviso.textContent = "Ubicación aproximada: los lotes se ajustaron a la imagen con " + georefPts().length + " puntos de control.";
    crearMapa();
  }

  // ---------- inicio ----------
  function leerHash() {
    var h = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    if (h === "gestion") { state.gestion = true; store(LS_GESTION, true); }
    var m = h.match(/^lote-(.+)$/);
    return m ? m[1] : null;
  }
  function init() {
    if (CFG.nombre) { $("nombre").textContent = CFG.nombre; }
    if (CFG.subtitulo) $("subtitulo").textContent = CFG.subtitulo;
    $("fuente").textContent = "Base: " + (CFG.fuentePlano || "plano catastral") + ". Datos preliminares, sujetos a verificación. Las superficies con ≈ están medidas sobre el plano.";
    var idInicial = leerHash();
    if (store(LS_GESTION)) state.gestion = true;
    state.calibPts = store(LS_GEOREF) || (CFG.georef || []).slice();
    $("gestion").hidden = !state.gestion;

    cargar().then(function () {
      pintarResumen(); pintarLista(); actualizarBotonSat();
      crearMapa();
      if (idInicial && state.byId[idInicial]) seleccionar(idInicial);
    }).catch(function (err) {
      $("lista").innerHTML = '<li class="vacio">No se pudieron cargar los lotes. ' + esc(err.message) + "</li>";
    });

    $("resumen").addEventListener("click", function (e) {
      var b = e.target.closest(".chip"); if (!b) return;
      state.filtroEstado = state.filtroEstado === b.dataset.estado ? null : b.dataset.estado;
      pintarResumen(); pintarLista(); repintar();
    });
    $("f-sup").addEventListener("change", function () { state.supMin = +this.value; pintarLista(); repintar(); });
    $("f-q").addEventListener("input", function () { state.q = this.value.trim().toLowerCase(); pintarLista(); repintar(); });
    $("lista").addEventListener("click", function (e) {
      if (e.target.closest("#ver-todos")) { state.verTodos = true; pintarLista(); return; }
      var b = e.target.closest(".fila"); if (b) seleccionar(b.dataset.id);
    });
    $("btn-gestion").onclick = function () {
      state.gestion = !state.gestion; store(LS_GESTION, state.gestion || null);
      $("gestion").hidden = !state.gestion;
      this.textContent = state.gestion ? "Salir del modo gestión" : "Modo gestión";
      state.filtroEstado = null;
      pintarResumen(); pintarFicha(); pintarLista(); repintar();
      if (state.gestion) $("gestion").scrollIntoView({ behavior: "smooth" });
    };
    $("btn-gestion").textContent = state.gestion ? "Salir del modo gestión" : "Modo gestión";
    // En la versión pública el botón no se muestra: se entra con #gestion al final del link.
    $("btn-gestion").hidden = !(CFG.mostrarBotonGestion || state.gestion);
    $("btn-plano-completo").hidden = CFG.planoCompleto === false;
    $("btn-plano-completo").onclick = function () {
      state.planoCompleto = !state.planoCompleto;
      this.textContent = state.planoCompleto ? "Ver plano limpio" : "Ver plano completo de Catastro";
      if (state.vista === "plano") crearMapa();
    };
    $("btn-plano").onclick = function () { cambiarVista("plano"); };
    $("btn-sat").onclick = function () { cambiarVista("satelite"); };
    $("btn-copiar-tabla").onclick = function () { copiar(toCSV(state.lotes, "\t"), "toast-gestion", "Tabla copiada. Pegala en la planilla (celda A1)."); };
    $("btn-borrar-local").onclick = function () {
      store(LS_EDITS, null);
      $("toast-gestion").textContent = "Cambios locales descartados. Recargá la página para ver los datos originales.";
    };
    $("btn-calibrar").onclick = function () {
      state.calibrando = !state.calibrando;
      this.textContent = state.calibrando ? "Terminar ubicación" : "Ubicar en satélite";
      if (state.calibrando && state.vista !== "plano") cambiarVista("plano");
      pintarCalibPanel(); pintarCalib();
    };
    window.addEventListener("hashchange", function () {
      var id = leerHash();
      $("gestion").hidden = !state.gestion;
      if (id && state.byId[id]) seleccionar(id);
    });
  }
  document.addEventListener("DOMContentLoaded", init);
})();
