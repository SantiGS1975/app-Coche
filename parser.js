/* Convierte el texto de un ticket o factura (salida del OCR) en gastos.
   Funciona en el navegador (window.Parser) y en Node (require) para poder probarlo. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Parser = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CATEGORIES = [
    { id: "combustible", name: "Combustible" },
    { id: "mantenimiento", name: "Mantenimiento" },
    { id: "reparacion", name: "Reparación" },
    { id: "neumaticos", name: "Neumáticos" },
    { id: "seguro", name: "Seguro" },
    { id: "impuestos", name: "Impuestos" },
    { id: "itv", name: "ITV" },
    { id: "peajes", name: "Peajes" },
    { id: "parking", name: "Parking" },
    { id: "lavado", name: "Lavado" },
    { id: "multas", name: "Multas" },
    { id: "otros", name: "Otros" }
  ];

  var FUEL_RE = /gasolina|gas[oó]leo|di[eé]sel|\bsp ?9[58]\b|\be ?(5|10)\b|\bglp\b|autogas|adblue|combustible|carburante|surtidor|gasolinera|estaci[oó]n de servicio|repsol|cepsa|moeve|\bbp\b|shell|galp|ballenoil|plenergy|petroprix|\bavia\b|esclatoil|petronor|campsa|q8|texaco/i;
  var FUEL_BRANDS = ["Repsol", "Cepsa", "Moeve", "BP", "Shell", "Galp", "Ballenoil", "Plenergy", "Petroprix", "Avia", "Esclatoil", "Petronor", "Campsa", "Q8", "Texaco", "Disa"];

  var CAT_RULES = [
    ["itv", /\bitv\b|inspecci[oó]n t[eé]cnica/i],
    ["seguro", /seguro|p[oó]liza|\bprima\b/i],
    ["peajes", /peaje|autopista|via-?t\b|telepeaje/i],
    ["parking", /parking|aparcamiento|estacionamiento|\bora\b/i],
    ["lavado", /lavado|lavadero|t[uú]nel de lavado/i],
    ["multas", /multa|sanci[oó]n|denuncia/i],
    ["neumaticos", /neum[aá]tic|cubierta|alineado|equilibrado|\bruedas?\b/i],
    ["impuestos", /impuesto|ivtm|circulaci[oó]n|\btasa\b/i],
    ["reparacion", /reparaci[oó]n|aver[ií]a|sustituci[oó]n|chapa|pintura|embrague|amortiguador|alternador|motor de arranque/i],
    ["mantenimiento", /aceite|filtro|revisi[oó]n|mantenimiento|pastillas|discos|buj[ií]a|bater[ií]a|l[ií]quido|correa|distribuci[oó]n|mano de obra|\bm\.? ?o\.?\b|anticongelante|escobillas/i],
    ["combustible", FUEL_RE]
  ];

  function guessCategory(text) {
    for (var i = 0; i < CAT_RULES.length; i++) if (CAT_RULES[i][1].test(text)) return CAT_RULES[i][0];
    return "otros";
  }

  /* "1.234,56" -> 1234.56 · "45,67" -> 45.67 · "45.67" -> 45.67 · "1.459" (3 decimales de precio) -> 1.459 */
  function parseAmount(s) {
    if (s == null) return null;
    s = String(s).replace(/[€\s]/g, "").replace(/^-/, "");
    if (!/\d/.test(s)) return null;
    var lastC = s.lastIndexOf(","), lastD = s.lastIndexOf(".");
    var dec;
    if (lastC >= 0 && lastD >= 0) dec = Math.max(lastC, lastD);
    else if (lastC >= 0) dec = lastC;
    else if (lastD >= 0) dec = lastD;
    else return parseFloat(s);
    var intPart = s.slice(0, dec).replace(/[.,]/g, "");
    var frac = s.slice(dec + 1);
    // "1.234" con tres decimales tras un solo separador y parte entera de 1 cifra: precio por litro (1.459)
    var n = parseFloat(intPart + "." + frac);
    return isFinite(n) ? n : null;
  }

  var AMOUNT_RE = /(?:\d{1,3}(?:[.\s]\d{3})+|\d+)[,.]\d{2}(?!\d)/g;
  function amountsIn(line) {
    var out = [], m;
    AMOUNT_RE.lastIndex = 0;
    while ((m = AMOUNT_RE.exec(line))) out.push(parseAmount(m[0]));
    return out.filter(function (n) { return n != null; });
  }

  function iso(y, m, d) { return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }
  function findDate(text, nowYear) {
    var re = /(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4}|\d{2})(?!\d)/g, m;
    while ((m = re.exec(text))) {
      var d = +m[1], mo = +m[2], y = +m[3];
      if (y < 100) y += 2000;
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2000 && y <= nowYear + 1) return iso(y, mo, d);
    }
    var re2 = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (re2 && +re2[2] >= 1 && +re2[2] <= 12 && +re2[3] >= 1 && +re2[3] <= 31) return re2[0];
    return null;
  }

  function findVendor(lines) {
    var joined = lines.join(" ");
    for (var i = 0; i < FUEL_BRANDS.length; i++) {
      if (new RegExp("\\b" + FUEL_BRANDS[i] + "\\b", "i").test(joined)) return FUEL_BRANDS[i];
    }
    for (var j = 0; j < Math.min(lines.length, 8); j++) {
      var l = lines[j].replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .&'\-]/g, " ").replace(/\s+/g, " ").trim();
      var letters = (l.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || []).length;
      if (letters >= 4 && !/factura|ticket|simplificado|c\.?i\.?f|n\.?i\.?f|tel|fecha|hora|cliente|original|duplicado|www|@/i.test(l)) {
        return l.length > 40 ? l.slice(0, 40) : l;
      }
    }
    return "";
  }

  function findTotal(lines) {
    var tiers = [
      /total\s*(a\s*pagar|factura|general|eur|€)|importe\s*total|a\s*pagar|total\s*pagado/i,
      /\btotal\b/i,
      /importe|suministro|pagado|tarjeta|efectivo/i
    ];
    var bad = /subtotal|base\b|imponible|\biva\b|sin\s*iva|cuota|descuento|dto/i;
    for (var t = 0; t < tiers.length; t++) {
      var best = null;
      lines.forEach(function (l, idx) {
        if (!tiers[t].test(l)) return;
        if (t > 0 && bad.test(l)) return;
        var a = amountsIn(l);
        if (!a.length && lines[idx + 1]) a = amountsIn(lines[idx + 1]);
        a.forEach(function (n) { if (best == null || n > best) best = n; });
      });
      if (best != null) return best;
    }
    var all = [];
    lines.forEach(function (l) { all = all.concat(amountsIn(l)); });
    return all.length ? Math.max.apply(null, all) : null;
  }

  function findLiters(text) {
    var m = /(\d{1,3}(?:[.,]\d{1,3}))\s*(?:l\b|lt\b|lts\b|litros?\b)/i.exec(text);
    if (m) return parseAmount(m[1]);
    m = /(?:volumen|cantidad|litros)\s*[:\-]?\s*(\d{1,3}(?:[.,]\d{1,3}))/i.exec(text);
    return m ? parseAmount(m[1]) : null;
  }
  function findPricePerLiter(text) {
    var m = /(\d[.,]\d{3})\s*(?:€|eur)?\s*\/\s*(?:l|lt|litro)/i.exec(text);
    if (m) return parseAmount(m[1]);
    m = /precio[^\d\n]{0,12}(\d[.,]\d{3})/i.exec(text);
    return m ? parseAmount(m[1]) : null;
  }

  function findOdometer(text) {
    var re = /(?:kil[oó]metros?|kilometraje|od[oó]metro|\bkms?\b)[^\d\n]{0,15}(\d{1,3}(?:[.\s]\d{3})+|\d{4,7})/i;
    var m = re.exec(text);
    if (!m) m = /(\d{1,3}(?:[.\s]\d{3})+|\d{4,7})\s*(?:kms?\b|kil[oó]metros)/i.exec(text);
    if (!m) return null;
    var n = parseInt(m[1].replace(/[.\s]/g, ""), 10);
    return n >= 1000 && n <= 999999 ? n : null;
  }

  function itemLines(lines) {
    var skip = /total|\biva\b|base|imponible|subtotal|cambio|entregado|efectivo|tarjeta|dto|descuento|cuota|n\.?i\.?f|c\.?i\.?f|tel[eé]fono|fecha|factura n|pedido/i;
    var items = [];
    lines.forEach(function (l) {
      if (skip.test(l)) return;
      var a = amountsIn(l);
      if (!a.length) return;
      var desc = l.replace(AMOUNT_RE, " ").replace(/[€*]/g, " ").replace(/\s+/g, " ").trim();
      if ((desc.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || []).length < 3) return;
      items.push({ description: desc.slice(0, 80), amount: a[a.length - 1] });
    });
    return items;
  }

  /* text: salida del OCR. Devuelve {vendor, date, total, odometer, lines[], notes[]} */
  function parseReceipt(text, opts) {
    opts = opts || {};
    var nowYear = opts.year || new Date().getFullYear();
    var raw = String(text || "");
    var lines = raw.split(/\r?\n/).map(function (l) { return l.replace(/\s+/g, " ").trim(); }).filter(Boolean);
    var out = { vendor: findVendor(lines), date: findDate(raw, nowYear), total: findTotal(lines), odometer: findOdometer(raw), lines: [], notes: [] };
    var isFuel = FUEL_RE.test(raw);

    if (isFuel) {
      var liters = findLiters(raw), price = findPricePerLiter(raw);
      var amount = out.total;
      if (liters && price && (amount == null || Math.abs(liters * price - amount) > Math.max(1, amount * 0.08))) {
        // el total leído no cuadra con litros × precio: se prefiere el cálculo si el total no es fiable
        if (amount == null) amount = Math.round(liters * price * 100) / 100;
        else out.notes.push("El importe no cuadra con litros × precio por litro (" + (Math.round(liters * price * 100) / 100).toFixed(2).replace(".", ",") + " €). Revísalo.");
      }
      if (liters && !price && amount) price = amount / liters;
      var fuelName = (/gas[oó]leo|di[eé]sel/i.test(raw) ? "Diésel" : /sp ?98/i.test(raw) ? "Gasolina 98" : /sp ?95|e ?5\b|e ?10\b|gasolina/i.test(raw) ? "Gasolina 95" : /glp|autogas/i.test(raw) ? "GLP" : "Repostaje");
      if (amount != null) out.lines.push({ category: "combustible", description: fuelName, amount: amount, liters: liters || null });
      out.total = amount;
    } else if (out.total != null) {
      var items = itemLines(lines);
      var sum = items.reduce(function (a, i) { return a + i.amount; }, 0);
      var base = items.length;
      // Las líneas se usan solo si suman el total (con o sin IVA del 21 %)
      if (base >= 2 && (Math.abs(sum - out.total) <= 0.03 || Math.abs(sum * 1.21 - out.total) <= 0.05 * base + 0.03)) {
        var k = Math.abs(sum - out.total) <= 0.03 ? 1 : 1.21;
        items.forEach(function (i) {
          out.lines.push({ category: guessCategory(i.description + " " + out.vendor), description: i.description, amount: Math.round(i.amount * k * 100) / 100, liters: null });
        });
        var diff = Math.round((out.total - out.lines.reduce(function (a, l) { return a + l.amount; }, 0)) * 100) / 100;
        if (Math.abs(diff) >= 0.02 && out.lines.length) out.lines[out.lines.length - 1].amount = Math.round((out.lines[out.lines.length - 1].amount + diff) * 100) / 100;
      } else {
        out.lines.push({ category: guessCategory(raw), description: out.vendor, amount: out.total, liters: null });
      }
    }
    if (!out.date) out.notes.push("No he encontrado la fecha. He puesto la de hoy: corrígela si hace falta.");
    if (!out.lines.length) out.notes.push("No he encontrado ningún importe. Añade las líneas a mano.");
    return out;
  }

  return { CATEGORIES: CATEGORIES, parseReceipt: parseReceipt, parseAmount: parseAmount, guessCategory: guessCategory };
});
