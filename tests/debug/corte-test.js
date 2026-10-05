var Corte = require('../../js/corte.js');
var assert = require('assert');

function igual(actual, esperado, mensaje) {
  assert.strictEqual(actual, esperado, mensaje + ' → ' + actual);
}

var nov3 = Corte.calcularCorte('2026-11-03');
igual(nov3.clave, '2026-10-25', '3 nov pertenece al corte que empieza el 25 oct');
igual(nov3.inicio, '2026-10-25', 'inicio 25 oct');
igual(nov3.fin, '2026-11-09', 'fin 9 nov');

igual(Corte.calcularCorte('2026-10-10').clave, '2026-10-10', 'día 10');
igual(Corte.calcularCorte('2026-10-24').fin, '2026-10-24', 'día 24');
igual(Corte.calcularCorte('2026-10-25').clave, '2026-10-25', 'día 25');
igual(Corte.calcularCorte('2026-10-31').fin, '2026-11-09', 'día 31');
igual(Corte.calcularCorte('2026-11-01').clave, '2026-10-25', 'día 1');
igual(Corte.calcularCorte('2026-11-09').clave, '2026-10-25', 'día 9');

var enero = Corte.calcularCorte('2027-01-09');
igual(enero.inicio, '2026-12-25', '9 de enero cruza de año');
igual(enero.fin, '2027-01-09', 'fin 9 de enero');
igual(Corte.calcularCorte('2026-01-10').clave, '2026-01-10', '10 de enero es el otro corte');

igual(Corte.calcularCorte('').etiqueta, 'Sin asignar', 'sin fecha');
igual(Corte.calcularCorte(null).clave, '', 'fecha nula no adivina corte');

igual(Corte.fechaDePlantilla('2026-11', 15), '2026-11-15', 'día 15 de noviembre');
igual(Corte.fechaDePlantilla('2026-02', 31), '2026-02-28', '31 en febrero cae el último día');
igual(Corte.fechaDePlantilla('2024-02', 31), '2024-02-29', '31 en febrero bisiesto');
igual(Corte.fechaDePlantilla('2026-04', 31), '2026-04-30', '31 en abril');
igual(Corte.fechaDePlantilla('2026-11', ''), '', 'sin día no inventa fecha');
igual(Corte.fechaEnCorte(Corte.calcularCorte('2026-10-10'), 15), '2026-10-15', 'el 15 cae en el corte del 10');
igual(Corte.fechaEnCorte(Corte.calcularCorte('2026-10-10'), 1), '', 'el 1 no cae en el corte del 10');
igual(Corte.fechaEnCorte(Corte.calcularCorte('2026-10-10'), 25), '', 'el 25 no cae en el corte del 10');
igual(Corte.fechaEnCorte(Corte.calcularCorte('2026-10-25'), 25), '2026-10-25', 'el 25 cae en el corte que cruza de mes');
igual(Corte.fechaEnCorte(Corte.calcularCorte('2026-10-25'), 1), '2026-11-01', 'el 1 del mes siguiente cae en el corte del 25');
igual(Corte.fechaEnCorte(Corte.calcularCorte('2026-10-25'), 15), '', 'el 15 no cae en el corte del 25');
igual(Corte.fechaEnCorte(Corte.calcularCorte('2026-02-25'), 31), '2026-02-28', 'el 31 de febrero cae el último día de ese corte');
igual(Corte.fechaEnCorte(Corte.calcularCorte('2026-10-10'), ''), '', 'sin día no entra en el corte');

igual(Corte.etiquetaMes('2026-10'), 'Octubre 2026', 'nombre del mes');
igual(Corte.moverMes('2026-01', -1), '2025-12', 'mes anterior cruza año');
igual(Corte.moverCorte('2026-10-10', 1), '2026-10-25', 'después del 10 va el 25');
igual(Corte.moverCorte('2026-10-10', -1), '2026-09-25', 'antes del 10 va el 25 anterior');
igual(Corte.moverCorte('2026-10-25', 1), '2026-11-10', 'después del 25 va el 10 siguiente');
igual(Corte.moverCorte('2026-10-04', 1), '2026-10-10', 'el día 4 pertenece al corte del 25 y el siguiente es el 10');
igual(Corte.moverCorte('2026-12-25', 1), '2027-01-10', 'el corte cruza de año');
igual(Corte.moverCorte('2026-01-10', -1), '2025-12-25', 'el corte anterior cruza de año');
igual(Corte.cortesDelMes('2026-10').length, 3, 'octubre toca tres cortes');

Corte.fijarDias(1, 16);
igual(Corte.describir(1, 16), 'Un corte va del 1 al 15. El otro va del 16 al último día del mes.', 'el día 1 cierra el mes');
igual(Corte.calcularCorte('2026-10-01').clave, '2026-10-01', 'día 1 empieza el primer corte');
igual(Corte.calcularCorte('2026-10-15').fin, '2026-10-15', 'el 15 cierra el primer corte');
igual(Corte.calcularCorte('2026-10-16').clave, '2026-10-16', 'el 16 empieza el segundo');
igual(Corte.calcularCorte('2026-10-31').fin, '2026-10-31', 'el segundo llega al fin de mes');
igual(Corte.calcularCorte('2026-02-28').fin, '2026-02-28', 'febrero termina el 28');
igual(Corte.moverCorte('2026-10-01', 1), '2026-10-16', 'después del 1 va el 16');
igual(Corte.moverCorte('2026-10-16', 1), '2026-11-01', 'después del 16 va el 1 siguiente');
igual(Corte.cortesDelMes('2026-10').length, 2, 'con día 1 octubre tiene dos cortes');
var manual = Corte.corteDe({ fecha: '2026-10-03', corteManual: 'Sí', corteClave: '2026-09-25', corte: '25/09/2026–09/10/2026' });
igual(manual.clave, '2026-09-25', 'un corte puesto a mano no se mueve');
igual(Corte.corteDe({ fecha: '2026-10-03', corteManual: 'No' }).clave, '2026-10-01', 'sin marca a mano sigue la fecha');
igual(Corte.fijarDias(10, 10)[0], 1, 'dos días iguales no reemplazan los actuales');
Corte.fijarDias(10, 25);
igual(Corte.calcularCorte('2026-10-25').clave, '2026-10-25', 'volver a 10 y 25');
igual(Corte.describir(10, 25), 'Un corte va del 10 al 24. El otro va del 25 al 9 del mes siguiente.', 'la regla de siempre');
igual(Corte.describir(31, 10), '', 'el 31 no cabe en febrero');

console.log('corte: ok');
