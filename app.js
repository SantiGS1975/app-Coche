(function () {
  "use strict";

  var CATS = Parser.CATEGORIES;
  var CAT_NAME = {};
  CATS.forEach(function (c) { CAT_NAME[c.id] = c.name; });
  var MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  var eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
  var eur0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
  var dec1 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var dec2 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var dec3 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  var intf = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

  var DATA_KEY = "gastos-coche:v1";
  var SET_KEY = "gastos-coche:settings";
  var DEFAULT_MODEL = "claude-sonnet-5-5";

  function $(id) { return document.getElementById(id); }
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") el.className = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) el.append(c.nodeType ? c : document.createTextNode(c)); });
    return el;
  }
  function num(s) {
    if (s == null || s === "") return null;
    var n = parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
    return isFinite(n) ? n : null;
  }
  function todayIso() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !isNaN(new Date(s + "T00:00:00")); }
  function shortDate(iso) {
    var p = iso.split("-");
    return p[2] + " " + MONTHS[+p[1] - 1] + (p[0] !== String(new Date().getFullYear()) ? " " + p[0].slice(2) : "");
  }
  function uid() { return "x" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function r2(n) { return Math.round(n * 100) / 100; }

  /* ---------- Almacenamiento (localStorage) ---------- */
  var expenses = [];
  var settings = { useAI: false, apiKey: "", model: DEFAULT_MODEL };
  var storageOk = true;

  function loadAll() {
    try {
      var d = JSON.parse(localStorage.getItem(DATA_KEY) || "null");
      if (d && Array.isArray(d.expenses)) expenses = d.expenses;
    } catch (e) { storageOk = false; }
    try {
      var s = JSON.parse(localStorage.getItem(SET_KEY) || "null");
      if (s) settings = Object.assign(settings, s);
    } catch (e) { /* ajustes por defecto */ }
  }
  function saveData() {
    try { localStorage.setItem(DATA_KEY, JSON.stringify({ version: 1, expenses: expenses })); storageOk = true; }
    catch (e) { storageOk = false; }
    render();
  }
  function saveSettings() {
    try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) { /* nada */ }
  }
  function addExpense(o) { expenses.push(Object.assign({ id: uid() }, o)); }
  function setExpense(id, o) { expenses = expenses.map(function (e) { return e.id === id ? Object.assign({ id: id }, o) : e; }); }
  function removeExpense(id) { expenses = expenses.filter(function (e) { return e.id !== id; }); }

  var year = new Date().getFullYear();
  var catFilter = "all";
  var ed = null;
  var scanToken = 0;

  /* ---------- Cálculos ---------- */
  function yearsAvailable() {
    var set = {}; set[new Date().getFullYear()] = 1;
    expenses.forEach(function (e) { if (e.date) set[e.date.slice(0, 4)] = 1; });
    return Object.keys(set).map(Number).sort(function (a, b) { return b - a; });
  }
  function inYear(y) { return expenses.filter(function (e) { return e.date && e.date.indexOf(String(y)) === 0; }); }
  function sum(list) { return list.reduce(function (a, e) { return a + (e.amount || 0); }, 0); }

  function stats() {
    var now = new Date();
    var monthKey = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    var out = { yearTotal: sum(inYear(year)), monthTotal: sum(expenses.filter(function (e) { return e.date && e.date.indexOf(monthKey) === 0; })), per100: null, consumption: null, lastPrice: null };
    var withKm = expenses.filter(function (e) { return e.odometer > 0 && e.date; });
    if (withKm.length >= 2) {
      var lo = withKm.reduce(function (a, b) { return b.odometer < a.odometer ? b : a; });
      var hi = withKm.reduce(function (a, b) { return b.odometer > a.odometer ? b : a; });
      var km = hi.odometer - lo.odometer;
      if (km >= 50) {
        var a = lo.date <= hi.date ? lo.date : hi.date, b = lo.date <= hi.date ? hi.date : lo.date;
        out.per100 = sum(expenses.filter(function (e) { return e.date >= a && e.date <= b; })) / km * 100;
        out.km = km;
      }
    }
    var fuel = expenses.filter(function (e) { return e.category === "combustible" && e.liters > 0 && e.odometer > 0; })
      .sort(function (x, y) { return x.odometer - y.odometer; });
    if (fuel.length >= 2) {
      var kmF = fuel[fuel.length - 1].odometer - fuel[0].odometer, lit = 0;
      for (var i = 1; i < fuel.length; i++) lit += fuel[i].liters;
      if (kmF >= 50 && lit > 0) out.consumption = lit / kmF * 100;
    }
    var last = expenses.filter(function (e) { return e.category === "combustible" && e.liters > 0 && e.amount > 0 && e.date; })
      .sort(function (x, y) { return y.date.localeCompare(x.date); })[0];
    if (last) out.lastPrice = last.amount / last.liters;
    return out;
  }

  /* ---------- Render ---------- */
  function render() {
    var n = $("notice");
    if (!storageOk) {
      n.hidden = false;
      n.textContent = "Este navegador no deja guardar datos (modo privado o almacenamiento bloqueado). Lo que añadas se perderá al cerrar.";
    } else n.hidden = true;
    renderTiles(); renderYear(); renderMonths(); renderCats(); renderList();
    $("btnCsv").hidden = !expenses.length;
    $("foot").textContent = expenses.length ? intf.format(expenses.length) + " gastos guardados en este dispositivo." : "";
  }

  function tile(label, big, unit, hint) {
    return h("div", { class: "tile" }, [
      h("span", { class: "label", text: label }),
      h("div", { class: "big num" }, [big, unit ? h("small", { text: unit }) : null]),
      h("span", { class: "hint", text: hint || "" })
    ]);
  }
  function renderTiles() {
    var s = stats();
    $("tiles").replaceChildren(
      tile("Este mes", eur.format(s.monthTotal), "", "Gasto total del mes en curso"),
      tile("Año " + year, eur.format(s.yearTotal), "", inYear(year).length + " gastos"),
      tile("Coste por 100 km", s.per100 != null ? dec2.format(s.per100) : "–", s.per100 != null ? "€" : "",
        s.per100 != null ? "Sobre " + intf.format(s.km) + " km con kilometraje" : "Necesita dos gastos con kilometraje"),
      tile("Consumo medio", s.consumption != null ? dec1.format(s.consumption) : "–", s.consumption != null ? "l/100 km" : "",
        s.consumption != null ? "Estimado entre repostajes" : "Necesita dos repostajes con km y litros"),
      tile("Último precio", s.lastPrice != null ? dec3.format(s.lastPrice) : "–", s.lastPrice != null ? "€/l" : "", "Del último repostaje")
    );
  }
  function renderYear() {
    var sel = $("yearSel"), ys = yearsAvailable();
    if (ys.indexOf(year) < 0) ys.unshift(year);
    sel.replaceChildren.apply(sel, ys.map(function (y) { return h("option", { value: String(y), text: String(y), selected: y === year }); }));
  }
  function renderMonths() {
    var totals = new Array(12).fill(0);
    inYear(year).forEach(function (e) { totals[+e.date.slice(5, 7) - 1] += e.amount || 0; });
    var max = Math.max.apply(null, totals.concat([1]));
    var nowM = new Date().getFullYear() === year ? new Date().getMonth() : -1;
    $("months").replaceChildren.apply($("months"), totals.map(function (v, i) {
      return h("div", { class: "mcol" + (i === nowM ? " cur" : ""), title: MONTHS[i] + " " + year + ": " + eur.format(v) }, [
        h("div", { class: "v", text: v > 0 ? eur0.format(v) : "" }),
        h("div", { class: "bar", style: "height:" + (v > 0 ? Math.max(2, v / max * 128) : 2) + "px" })
      ]);
    }));
    $("mlabels").replaceChildren.apply($("mlabels"), MONTHS.map(function (m) { return h("span", { text: m }); }));
  }
  function renderCats() {
    var by = {};
    inYear(year).forEach(function (e) { var c = e.category || "otros"; by[c] = (by[c] || 0) + (e.amount || 0); });
    var rows = Object.keys(by).map(function (k) { return { id: k, v: by[k] }; }).sort(function (a, b) { return b.v - a.v; });
    var total = rows.reduce(function (a, r) { return a + r.v; }, 0);
    $("catTotal").textContent = total ? eur.format(total) : "";
    var box = $("cats");
    if (!rows.length) { box.replaceChildren(h("div", { class: "foot", text: "Sin gastos en " + year + "." })); return; }
    var max = rows[0].v;
    box.replaceChildren.apply(box, rows.map(function (r) {
      return h("div", { class: "cat" }, [
        h("span", { class: "name", text: CAT_NAME[r.id] || r.id }),
        h("span", { class: "amt num", text: eur.format(r.v) + " · " + Math.round(r.v / total * 100) + " %" }),
        h("div", { class: "track" }, [h("div", { class: "fill", style: "width:" + (r.v / max * 100) + "%" })])
      ]);
    }));
  }
  function renderList() {
    var sel = $("catFilter");
    sel.replaceChildren.apply(sel, [h("option", { value: "all", text: "Todas las categorías", selected: catFilter === "all" })]
      .concat(CATS.map(function (c) { return h("option", { value: c.id, text: c.name, selected: catFilter === c.id }); })));
    var box = $("list");
    var list = expenses.filter(function (e) { return catFilter === "all" || e.category === catFilter; })
      .sort(function (a, b) { return (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0); });
    if (!list.length) {
      box.replaceChildren(h("div", { class: "empty" }, expenses.length ? [h("span", { text: "No hay gastos en esta categoría." })] : [
        h("b", { text: "Todavía no hay gastos" }),
        h("span", { text: "Pulsa «Escanear ticket» y elige una foto de un ticket de gasolina o de una factura de taller. También puedes añadir un gasto a mano." })
      ]));
      return;
    }
    box.replaceChildren.apply(box, list.map(function (e) {
      var extra = [];
      if (e.liters > 0) extra.push(dec2.format(e.liters) + " l" + (e.amount > 0 ? " a " + dec3.format(e.amount / e.liters) + " €/l" : ""));
      if (e.odometer > 0) extra.push(intf.format(e.odometer) + " km");
      var detail = (e.vendor && e.description ? e.description : "") + (extra.length ? (e.vendor && e.description ? " · " : "") + extra.join(" · ") : "");
      return h("button", { class: "row", type: "button", onclick: function () { openEditor(editFrom(e)); } }, [
        h("span", { class: "d", text: e.date ? shortDate(e.date) : "" }),
        h("span", { class: "t" }, [
          h("b", { text: e.vendor || e.description || CAT_NAME[e.category] || "Gasto" }),
          h("span", {}, [h("i", { class: "pill", text: CAT_NAME[e.category] || "Otros" }), detail])
        ]),
        h("span", { class: "a num", text: eur.format(e.amount || 0) })
      ]);
    }));
  }

  /* ---------- Editor ---------- */
  function editFrom(e) {
    return { mode: "edit", id: e.id, receiptId: e.receiptId || null, createdAt: e.createdAt || Date.now(),
      vendor: e.vendor || "", date: e.date || todayIso(), odometer: e.odometer ? String(e.odometer) : "", total: null, notes: [],
      lines: [{ category: e.category || "otros", description: e.description || "", amount: e.amount != null ? String(e.amount).replace(".", ",") : "", liters: e.liters ? String(e.liters).replace(".", ",") : "" }] };
  }
  function blankEditor() {
    return { mode: "new", receiptId: null, vendor: "", date: todayIso(), odometer: "", total: null, notes: [],
      lines: [{ category: "combustible", description: "", amount: "", liters: "" }] };
  }
  function openEditor(state) {
    ed = state; $("scanArea").hidden = true; renderEditor(); $("editorArea").hidden = false;
    $("editorArea").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function closeEditor() { ed = null; $("editorArea").hidden = true; $("editorArea").replaceChildren(); }
  function lineSum() { return ed.lines.reduce(function (a, l) { return a + (num(l.amount) || 0); }, 0); }
  function refreshSum() {
    var el = $("edSum"); if (!el) return;
    var s = lineSum();
    el.replaceChildren("Suma de líneas: ", h("strong", { class: "num", text: eur.format(s) }));
    if (ed.total != null && Math.abs(s - ed.total) > 0.02) el.append(" · el documento indica " + eur.format(ed.total));
  }

  function renderEditor() {
    var isNew = ed.mode === "new";
    var head = h("div", { class: "editor-head" }, [
      h("h2", { text: isNew ? (ed.fromScan ? "Revisa lo que he leído" : "Nuevo gasto") : "Editar gasto" }),
      h("span", { class: "label", text: isNew ? "Se guardará una línea por gasto" : "" })
    ]);
    var fields = h("div", { class: "fields" }, [
      h("div", { class: "field" }, [h("label", { class: "label", for: "edVendor", text: "Comercio" }),
        h("input", { id: "edVendor", type: "text", value: ed.vendor, placeholder: "Repsol, Taller López…", oninput: function (e) { ed.vendor = e.target.value; } })]),
      h("div", { class: "field" }, [h("label", { class: "label", for: "edDate", text: "Fecha" }),
        h("input", { id: "edDate", type: "date", value: ed.date, oninput: function (e) { ed.date = e.target.value; } })]),
      h("div", { class: "field" }, [h("label", { class: "label", for: "edKm", text: "Kilómetros del coche" }),
        h("input", { id: "edKm", type: "text", inputmode: "numeric", value: ed.odometer, placeholder: "Opcional", oninput: function (e) { ed.odometer = e.target.value; } })])
    ]);

    var lines = h("div", { class: "lines" });
    function rerender() {
      var id = document.activeElement && document.activeElement.id;
      renderEditor();
      if (id) { var f = document.getElementById(id); if (f) f.focus(); }
    }
    ed.lines.forEach(function (l, i) {
      var cat = h("select", { "aria-label": "Categoría", onchange: function (e) { l.category = e.target.value; rerender(); } },
        CATS.map(function (c) { return h("option", { value: c.id, text: c.name, selected: l.category === c.id }); }));
      var desc = h("input", { class: "desc", type: "text", "aria-label": "Concepto", value: l.description, placeholder: "Concepto", oninput: function (e) { l.description = e.target.value; } });
      var lit = l.category === "combustible"
        ? h("input", { class: "right", type: "text", inputmode: "decimal", "aria-label": "Litros", value: l.liters, placeholder: "Litros", oninput: function (e) { l.liters = e.target.value; } })
        : h("span");
      var amt = h("input", { class: "right", type: "text", inputmode: "decimal", "aria-label": "Importe en euros", value: l.amount, placeholder: "Importe €", oninput: function (e) { l.amount = e.target.value; refreshSum(); } });
      var rm = ed.lines.length > 1 && ed.mode === "new"
        ? h("button", { class: "x", type: "button", "aria-label": "Quitar línea", text: "×", onclick: function () { ed.lines.splice(i, 1); rerender(); } })
        : h("span");
      lines.append(h("div", { class: "linerow" }, [cat, desc, lit, amt, rm]));
    });

    var children = [head];
    if (ed.thumb) children.push(h("img", { class: "thumb", src: ed.thumb, alt: "Foto del ticket" }));
    children.push(fields);
    (ed.notes || []).forEach(function (n) { children.push(h("div", { class: "msg warn", text: n })); });
    children.push(lines, h("div", { class: "msg err", id: "edErr", role: "alert" }));
    children.push(h("div", { class: "editor-foot" }, [
      h("div", { class: "sumline", id: "edSum" }),
      h("div", { class: "actions" }, [
        ed.mode === "edit" ? h("button", { class: "btn danger", type: "button", id: "edDelete", onclick: onDelete, text: "Eliminar" }) : null,
        ed.mode === "new" ? h("button", { class: "btn", type: "button", text: "Añadir línea", onclick: function () { ed.lines.push({ category: "otros", description: "", amount: "", liters: "" }); renderEditor(); } }) : null,
        h("button", { class: "btn ghost", type: "button", onclick: closeEditor, text: "Cancelar" }),
        h("button", { class: "btn primary", type: "button", id: "edSave", onclick: onSave, text: ed.mode === "edit" ? "Guardar cambios" : "Guardar gastos" })
      ])
    ]));
    if (ed.raw) children.push(h("details", { class: "raw" }, [h("summary", { text: "Ver el texto leído de la foto" }), h("pre", { text: ed.raw })]));
    $("editorArea").replaceChildren(h("div", { class: "panel editor" }, children));
    refreshSum();
  }

  function onDelete() {
    var btn = $("edDelete");
    if (btn.dataset.sure !== "1") { btn.dataset.sure = "1"; btn.textContent = "Pulsa otra vez para eliminar"; return; }
    removeExpense(ed.id); saveData(); closeEditor();
  }
  function onSave() {
    var err = $("edErr"); err.textContent = "";
    if (!validDate(ed.date)) { err.textContent = "Pon una fecha válida."; return; }
    var km = num(ed.odometer);
    if (ed.odometer && (km == null || km < 0)) { err.textContent = "Los kilómetros deben ser un número."; return; }
    var recs = [];
    for (var i = 0; i < ed.lines.length; i++) {
      var l = ed.lines[i], amount = num(l.amount);
      if (amount == null || amount <= 0) { err.textContent = "Revisa el importe de la línea " + (i + 1) + ": tiene que ser mayor que 0."; return; }
      var liters = l.category === "combustible" ? num(l.liters) : null;
      if (l.category === "combustible" && l.liters && (liters == null || liters <= 0)) { err.textContent = "Revisa los litros de la línea " + (i + 1) + "."; return; }
      recs.push({ date: ed.date, vendor: ed.vendor.trim(), category: l.category, description: l.description.trim(), amount: r2(amount),
        liters: liters || null, odometer: km || null,
        receiptId: ed.receiptId || (ed.mode === "new" && ed.lines.length > 1 ? "r" + uid() : null), createdAt: ed.createdAt || Date.now() });
    }
    if (ed.mode === "edit") setExpense(ed.id, recs[0]); else recs.forEach(addExpense);
    saveData(); closeEditor();
  }

  /* ---------- Escaneo ---------- */
  function scanBox(kids) { var a = $("scanArea"); a.hidden = false; a.replaceChildren(h("div", { class: "scanbox" }, kids)); }
  function scanError(text) {
    scanBox([
      h("div", { class: "msg err", role: "alert", text: text }),
      h("div", { class: "actions" }, [
        h("button", { class: "btn primary", type: "button", text: "Probar con otra foto", onclick: function () { $("fileInput").click(); } }),
        h("button", { class: "btn", type: "button", text: "Añadir a mano", onclick: function () { openEditor(blankEditor()); } }),
        h("button", { class: "btn ghost", type: "button", text: "Cerrar", onclick: function () { $("scanArea").hidden = true; } })
      ])
    ]);
  }

  function normalizeAI(raw) {
    var lines = (Array.isArray(raw.lineas) ? raw.lineas : []).map(function (l) {
      var amt = typeof l.importe === "number" ? l.importe : num(l.importe);
      var lit = typeof l.litros === "number" ? l.litros : num(l.litros);
      var cat = CAT_NAME[l.categoria] ? l.categoria : "otros";
      return { category: cat, description: String(l.concepto || "").slice(0, 120), amount: amt, liters: cat === "combustible" && lit > 0 ? lit : null };
    }).filter(function (l) { return l.amount != null; });
    var total = typeof raw.total === "number" ? raw.total : num(raw.total);
    var k = typeof raw.kilometraje === "number" ? raw.kilometraje : num(raw.kilometraje);
    return { vendor: String(raw.comercio || "").slice(0, 80), date: validDate(raw.fecha) ? raw.fecha : null, total: total,
      odometer: k > 0 ? Math.round(k) : null, lines: lines, notes: lines.length ? [] : ["No he encontrado ningún importe."] };
  }

  var AI_ERR = {
    401: "La clave de API no es válida. Revísala en Ajustes.",
    403: "La clave de API no tiene permiso para usar este modelo.",
    404: "El modelo indicado no existe. Revísalo en Ajustes.",
    429: "Has superado el límite de la API. Prueba en unos minutos.",
    529: "El servicio de Claude está saturado. Prueba en unos minutos."
  };

  async function scanFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []).slice(0, 4);
    if (!files.length) return;
    closeEditor();
    var token = ++scanToken;
    var bar = h("progress", { max: "1" });
    var msg = h("div", { class: "msg" }, [h("span", { class: "spinner" }), "Leyendo el ticket…"]);
    var cancel = h("button", { class: "btn small", type: "button", text: "Cancelar", onclick: function () { scanToken++; $("scanArea").hidden = true; } });
    scanBox([msg, bar, cancel]);
    function progress(f, text) {
      if (token !== scanToken) return;
      if (f != null) bar.value = f; else bar.removeAttribute("value");
      if (text) msg.replaceChildren(h("span", { class: "spinner" }), text);
    }

    var parsed = null, rawText = "", notes = [];
    try {
      if (settings.useAI && settings.apiKey) {
        try {
          progress(null, "Leyendo con Claude…");
          parsed = normalizeAI(await OCR.readWithClaude(files, settings.apiKey.trim(), settings.model || DEFAULT_MODEL, CATS.map(function (c) { return c.id; })));
          rawText = "";
        } catch (e) {
          if (token !== scanToken) return;
          var why = e && e.status ? (AI_ERR[e.status] || "La API respondió con el error " + e.status + (e.detail ? ": " + e.detail : ".")) : "No se pudo conectar con la API.";
          notes.push(why + " He usado el lector del dispositivo.");
          parsed = null;
        }
      }
      if (!parsed) {
        rawText = await OCR.recognize(files, progress);
        if (token !== scanToken) return;
        parsed = Parser.parseReceipt(rawText);
      }
    } catch (e) {
      if (token !== scanToken) return;
      scanError(e && e.message === "offline"
        ? "La primera vez el lector de fotos se descarga de internet y no he podido conectar. Conéctate un momento y vuelve a probar, o añade el gasto a mano."
        : "No se pudo leer la foto. Prueba con otra, con buena luz y el ticket plano.");
      return;
    }
    if (token !== scanToken) return;

    if (!parsed.lines.length) {
      var rawShow = rawText;
      scanError("No he encontrado importes en esa foto. Prueba con otra más cercana y con buena luz, o añade el gasto a mano." + (rawShow ? "" : ""));
      return;
    }
    var date = parsed.date || todayIso();
    var allNotes = notes.concat(parsed.notes || []);
    var dup = expenses.some(function (e) { return e.date === date && parsed.lines.some(function (l) { return Math.abs((e.amount || 0) - l.amount) < 0.005; }); });
    if (dup) allNotes.push("Ya tienes un gasto con esa fecha y ese importe. Comprueba que no lo estás duplicando.");
    var thumb = null;
    try { thumb = URL.createObjectURL(files[0]); } catch (e) { /* sin miniatura */ }
    $("scanArea").hidden = true;
    openEditor({
      mode: "new", fromScan: true, receiptId: parsed.lines.length > 1 ? "r" + uid() : null, vendor: parsed.vendor || "", date: date,
      odometer: parsed.odometer ? String(parsed.odometer) : "", total: parsed.total != null ? parsed.total : null, notes: allNotes, thumb: thumb, raw: rawText,
      lines: parsed.lines.map(function (l) { return { category: l.category, description: l.description || "", amount: String(r2(l.amount)).replace(".", ","), liters: l.liters ? String(l.liters).replace(".", ",") : "" }; })
    });
  }

  /* ---------- Descargas y copias ---------- */
  function download(name, mime, text) {
    var url = URL.createObjectURL(new Blob([text], { type: mime }));
    var a = h("a", { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function csvCell(v) { var s = v == null ? "" : String(v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function exportCsv() {
    var head = ["Fecha", "Comercio", "Categoría", "Concepto", "Importe (€)", "Litros", "Kilómetros"];
    var rows = expenses.slice().sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); }).map(function (e) {
      return [e.date, e.vendor, CAT_NAME[e.category] || e.category, e.description, e.amount != null ? String(e.amount).replace(".", ",") : "", e.liters ? String(e.liters).replace(".", ",") : "", e.odometer || ""];
    });
    download("gastos-coche.csv", "text/csv;charset=utf-8", "﻿" + [head].concat(rows).map(function (r) { return r.map(csvCell).join(";"); }).join("\r\n"));
  }
  function dataMsg(t, bad) { var m = $("dataMsg"); m.textContent = t; m.className = "msg" + (bad ? " err" : ""); }

  /* ---------- Ajustes ---------- */
  function openSettings() {
    $("setUseAI").checked = !!settings.useAI; $("setKey").value = settings.apiKey || ""; $("setModel").value = settings.model || DEFAULT_MODEL;
    dataMsg(""); $("btnWipe").textContent = "Borrar todo"; $("btnWipe").dataset.sure = "";
    $("settings").showModal();
  }

  /* ---------- Instalación ---------- */
  var deferredPrompt = null;
  function setupInstall() {
    var standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    if (standalone) return;
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault(); deferredPrompt = e;
      $("installText").textContent = "Puedes instalarla como app en este dispositivo.";
      $("btnInstall").hidden = false; $("installBar").hidden = false;
    });
    window.addEventListener("appinstalled", function () { $("installBar").hidden = true; });
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (ios) {
      $("installText").textContent = "Para instalarla en iPhone o iPad: botón Compartir y «Añadir a pantalla de inicio».";
      $("installBar").hidden = false;
    }
    $("btnInstall").addEventListener("click", function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt(); deferredPrompt.userChoice.finally(function () { deferredPrompt = null; $("installBar").hidden = true; });
    });
  }

  /* ---------- Eventos ---------- */
  $("btnScan").addEventListener("click", function () { $("fileInput").click(); });
  $("btnManual").addEventListener("click", function () { $("scanArea").hidden = true; openEditor(blankEditor()); });
  $("btnSettings").addEventListener("click", openSettings);
  $("fileInput").addEventListener("change", function (e) { var f = Array.prototype.slice.call(e.target.files); e.target.value = ""; scanFiles(f); });
  $("yearSel").addEventListener("change", function (e) { year = +e.target.value; render(); });
  $("catFilter").addEventListener("change", function (e) { catFilter = e.target.value; renderList(); });
  $("btnCsv").addEventListener("click", exportCsv);

  $("btnSaveSettings").addEventListener("click", function () {
    settings.useAI = $("setUseAI").checked; settings.apiKey = $("setKey").value.trim(); settings.model = $("setModel").value.trim() || DEFAULT_MODEL;
    if (settings.useAI && !settings.apiKey) settings.useAI = false;
    saveSettings();
  });
  $("btnExport").addEventListener("click", function (e) {
    e.preventDefault();
    download("copia-gastos-coche-" + todayIso() + ".json", "application/json", JSON.stringify({ version: 1, expenses: expenses }, null, 1));
    dataMsg("Copia guardada.");
  });
  $("btnImport").addEventListener("click", function (e) { e.preventDefault(); $("importInput").click(); });
  $("importInput").addEventListener("change", function (e) {
    var f = e.target.files[0]; e.target.value = ""; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var d = JSON.parse(rd.result), list = Array.isArray(d) ? d : d.expenses;
        if (!Array.isArray(list)) throw new Error("formato");
        var have = {}; expenses.forEach(function (x) { have[x.id] = 1; });
        var added = 0;
        list.forEach(function (x) {
          if (x && x.id && validDate(x.date) && typeof x.amount === "number" && !have[x.id]) { expenses.push(x); added++; }
        });
        saveData(); dataMsg("Restauradas " + added + " entradas nuevas.");
      } catch (err) { dataMsg("Ese archivo no es una copia válida.", true); }
    };
    rd.readAsText(f);
  });
  $("btnWipe").addEventListener("click", function (e) {
    e.preventDefault();
    var b = e.currentTarget;
    if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Pulsa otra vez: se borra todo"; return; }
    expenses = []; saveData(); b.dataset.sure = ""; b.textContent = "Borrar todo"; dataMsg("Todo borrado.");
  });

  document.addEventListener("dragover", function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0) e.preventDefault(); });
  document.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); scanFiles(e.dataTransfer.files); } });

  loadAll();
  render();
  setupInstall();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
})();
