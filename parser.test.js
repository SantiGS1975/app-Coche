const assert = require("assert");
const P = require("../src/js/parser.js");

// Ticket de gasolinera
const fuel = `REPSOL ESTACION DE SERVICIO
C.I.F. A-12345678
Fecha: 14/10/2026 18:32
SURTIDOR 4
GASOLEO A
Volumen: 38,42 L
Precio: 1,459 EUR/L
Importe: 56,05 EUR
TOTAL 56,05
Gracias por su visita`;
let r = P.parseReceipt(fuel, { year: 2026 });
assert.strictEqual(r.vendor, "Repsol");
assert.strictEqual(r.date, "2026-10-14");
assert.strictEqual(r.lines.length, 1);
assert.strictEqual(r.lines[0].category, "combustible");
assert.strictEqual(r.lines[0].amount, 56.05);
assert.strictEqual(r.lines[0].liters, 38.42);
assert.strictEqual(r.lines[0].description, "Diésel");

// Factura de taller: líneas que suman el total con IVA
const taller = `TALLERES LOPEZ S.L.
Factura n 2026/0412
Fecha 03-09-2026
Matricula 1234 KLM  Kms: 84.250
Mano de obra revision 120,00
Aceite motor 5W30 55,00
Filtro de aceite 18,00
Pastillas de freno delanteras 62,00
Base imponible 255,00
IVA 21% 53,55
TOTAL FACTURA 308,55`;
r = P.parseReceipt(taller, { year: 2026 });
assert.strictEqual(r.date, "2026-09-03");
assert.strictEqual(r.odometer, 84250);
assert.strictEqual(r.total, 308.55);
assert.strictEqual(r.lines.length, 4);
assert.ok(Math.abs(r.lines.reduce((a, l) => a + l.amount, 0) - 308.55) < 0.011, "suma de líneas");
assert.ok(r.lines.every(l => l.category === "mantenimiento"));

// Peaje, importes sencillos
r = P.parseReceipt("AUTOPISTAS S.A.\nPeaje 12/08/26\nImporte total 8,45 €", { year: 2026 });
assert.strictEqual(r.lines[0].category, "peajes");
assert.strictEqual(r.lines[0].amount, 8.45);
assert.strictEqual(r.date, "2026-08-12");

// Formatos de importe
assert.strictEqual(P.parseAmount("1.234,56"), 1234.56);
assert.strictEqual(P.parseAmount("45,67"), 45.67);
assert.strictEqual(P.parseAmount("45.67"), 45.67);
assert.strictEqual(P.parseAmount("1,459"), 1.459);

// Sin nada útil
r = P.parseReceipt("hola", { year: 2026 });
assert.strictEqual(r.lines.length, 0);
console.log("parser OK");
