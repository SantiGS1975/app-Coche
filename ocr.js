/* Lectura de fotos de tickets: OCR en el propio navegador (Tesseract.js) o, opcionalmente,
   Claude con tu clave de API de Anthropic. */
(function (root) {
  "use strict";
  var TESS_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  var tessPromise = null;

  function loadTesseract() {
    if (root.Tesseract) return Promise.resolve(root.Tesseract);
    if (!tessPromise) {
      tessPromise = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = TESS_URL; s.crossOrigin = "anonymous";
        s.onload = function () { root.Tesseract ? resolve(root.Tesseract) : reject(new Error("tesseract")); };
        s.onerror = function () { tessPromise = null; reject(new Error("offline")); };
        document.head.appendChild(s);
      });
    }
    return tessPromise;
  }

  async function toBitmap(file) {
    if (root.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { /* sigue */ }
    }
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("image")); };
      img.src = url;
    });
  }

  /* Reduce la imagen y, para OCR, la pasa a grises con el contraste estirado. */
  async function prepare(file, maxSide, enhance) {
    var bmp = await toBitmap(file);
    var w = bmp.width, h = bmp.height, scale = Math.min(1, maxSide / Math.max(w, h));
    var cw = Math.round(w * scale), ch = Math.round(h * scale);
    var c = document.createElement("canvas"); c.width = cw; c.height = ch;
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(bmp, 0, 0, cw, ch);
    if (enhance) {
      var img = ctx.getImageData(0, 0, cw, ch), d = img.data, hist = new Uint32Array(256), i, g;
      for (i = 0; i < d.length; i += 4) { g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0; d[i] = g; hist[g]++; }
      var total = cw * ch, acc = 0, lo = 0, hi = 255;
      for (i = 0; i < 256; i++) { acc += hist[i]; if (acc > total * 0.01) { lo = i; break; } }
      acc = 0;
      for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc > total * 0.01) { hi = i; break; } }
      var span = Math.max(1, hi - lo);
      for (i = 0; i < d.length; i += 4) {
        g = Math.max(0, Math.min(255, ((d[i] - lo) * 255 / span) | 0));
        d[i] = d[i + 1] = d[i + 2] = g;
      }
      ctx.putImageData(img, 0, 0);
    }
    return c;
  }

  /* OCR local. onProgress(fraction 0..1 | null, mensaje) */
  async function recognize(files, onProgress) {
    onProgress(null, "Cargando el lector…");
    var T = await loadTesseract();
    var done = 0, texts = [];
    var worker = await T.createWorker("spa", 1, {
      logger: function (m) {
        if (m.status === "recognizing text") onProgress((done + m.progress) / files.length, "Leyendo el texto…");
        else if (m.status) onProgress(null, "Preparando el lector en español…");
      }
    });
    try {
      await worker.setParameters({ tessedit_pageseg_mode: "4", preserve_interword_spaces: "1" });
      for (var i = 0; i < files.length; i++) {
        var canvas = await prepare(files[i], 2200, true);
        var res = await worker.recognize(canvas);
        texts.push(res.data.text);
        done++;
      }
    } finally {
      try { await worker.terminate(); } catch (e) { /* nada */ }
    }
    return texts.join("\n");
  }

  var PROMPT = function (cats, year) {
    return [
      "Eres un lector de tickets y facturas de gastos de un coche en España. Te paso una o varias fotos del MISMO documento.",
      "Responde SOLO con un objeto JSON con esta forma exacta:",
      '{"comercio": string|null, "fecha": "AAAA-MM-DD"|null, "total": number|null, "kilometraje": number|null, "lineas": [{"categoria": string, "concepto": string, "importe": number, "litros": number|null}]}',
      "Reglas:",
      "- categoria es una de: " + cats.join(", ") + ". Gasolina, diésel, GLP o recarga eléctrica van en combustible. Aceite, filtros, revisión, pastillas de freno, batería y mano de obra de mantenimiento van en mantenimiento; averías en reparacion; cubiertas y alineado en neumaticos; túnel de lavado en lavado.",
      "- importe es el precio final en euros con IVA incluido, como número con punto decimal. Si el documento muestra base e IVA por separado, suma el IVA al importe de cada línea.",
      "- En un ticket de gasolinera hay una sola línea de combustible: litros repostados en litros y total pagado en importe.",
      "- En una factura de taller separa las líneas relevantes; sus importes deben sumar el total. Los descuentos van como líneas con importe negativo.",
      "- fecha en formato AAAA-MM-DD. Si el año tiene dos cifras es 20XX; si no aparece el año, usa " + year + ".",
      "- kilometraje solo si aparece claramente; si no, null.",
      "- Si no hay ningún gasto relacionado con un coche, devuelve lineas como lista vacía. No inventes datos que no se vean."
    ].join("\n");
  };

  function toBase64(canvas) {
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
  }

  /* Lectura con Claude: la foto va directamente del navegador a api.anthropic.com. */
  async function readWithClaude(files, apiKey, model, cats) {
    var content = [];
    for (var i = 0; i < Math.min(files.length, 3); i++) {
      var c = await prepare(files[i], 1600, false);
      content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: toBase64(c) } });
    }
    content.push({ type: "text", text: PROMPT(cats, new Date().getFullYear()) });
    var res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({ model: model, max_tokens: 1500, messages: [{ role: "user", content: content }] })
    });
    if (!res.ok) {
      var err = new Error("api"); err.status = res.status;
      try { var j = await res.json(); err.detail = j && j.error && j.error.message; } catch (e) { /* nada */ }
      throw err;
    }
    var data = await res.json();
    var text = (data.content || []).map(function (b) { return b.text || ""; }).join("");
    var m = /\{[\s\S]*\}/.exec(text);
    if (!m) throw new Error("json");
    return JSON.parse(m[0]);
  }

  root.OCR = { recognize: recognize, readWithClaude: readWithClaude, loadTesseract: loadTesseract };
})(self);
