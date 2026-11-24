var Reintento = require('../../js/reintentos.js');
var assert = require('assert');

function igual(actual, esperado, mensaje) {
  assert.strictEqual(actual, esperado, mensaje + ' → ' + actual);
}

var sinConcepto = {
  movimientoId: 'local-1',
  accion: 'crear',
  concepto: '',
  error: 'Escribe el concepto',
  datos: { tipo: 'Gasto', concepto: '', monto: 45, fecha: '2026-11-20', categoria: 'Transporte', estado: 'Pagado' }
};
igual(Reintento.aviso(sinConcepto), 'No se guardó: Gasto de $45.00 del 20/11/2026. Toca para ver.', 'sin concepto se reconoce por el monto y la fecha');

var conConcepto = { movimientoId: 'MOV-1', accion: 'pagar', concepto: 'Luz', datos: { id: 'MOV-1' } };
igual(Reintento.aviso(conConcepto), 'No se guardó: Luz. Toca para ver.', 'con concepto se usa el concepto');

var filas = Reintento.detalle(sinConcepto);
igual(filas[0][0], 'Qué se intentó', 'primero dice qué se intentó');
igual(filas[0][1], 'Agregar', 'crear se lee Agregar');
var mapa = {};
filas.forEach(function (f) { mapa[f[0]] = f[1]; });
igual(mapa['Concepto'], '(vacío)', 'el concepto vacío se ve');
igual(mapa['Monto'], '$45.00', 'el monto se ve');
igual(mapa['Fecha'], '20/11/2026', 'la fecha se ve');
igual(mapa['Error'], 'Escribe el concepto', 'el error del servidor se ve');

igual(Reintento.detalle({ accion: 'eliminar', concepto: 'Luz', datos: { id: 'MOV-9' } }).filter(function (f) { return f[0] === 'Error'; })[0][1],
  'No se sabe: falló antes de guardar el motivo', 'si no hay error guardado, lo dice');

igual(Reintento.sePuedeCorregir(sinConcepto), true, 'agregar se puede corregir');
igual(Reintento.sePuedeCorregir(conConcepto), false, 'pagar no se corrige con formulario');

console.log('reintentos: ok');
