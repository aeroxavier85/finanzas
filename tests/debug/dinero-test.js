var Dinero = require('../../js/dinero.js');
var assert = require('assert');

function casi(actual, esperado, mensaje) {
  assert.strictEqual(actual, esperado, mensaje + ' → ' + actual);
}

var corte = Dinero.resumir([
  { tipo: 'Ingreso', monto: 2400, montoReal: 2400, estado: 'Recibido' },
  { tipo: 'Gasto', monto: 650, estado: 'Pendiente' },
  { tipo: 'Gasto', monto: 1200, montoReal: 1200, estado: 'Pagado' },
  { tipo: 'Gasto', monto: 80, estado: 'Omitido' }
]);

casi(corte.ingresos, 2400, 'ingresos esperados');
casi(corte.gastosPlanificados, 1850, 'planificado no incluye omitido');
casi(corte.gastosPendientes, 650, 'pendientes');
casi(corte.gastosPagados, 1200, 'pagados');
casi(corte.disponibleEsperado, 550, 'disponible esperado');
casi(corte.disponibleActual, 1200, 'disponible actual');

var pagadoSinReal = Dinero.resumir([
  { tipo: 'Gasto', monto: 35, estado: 'Pagado' }
]);
casi(pagadoSinReal.gastosPagados, 35, 'si no hay monto real, usa el planificado');

casi(corte.gastosPlanificados, 1850, 'omitido no suma');
casi(Dinero.numero('$1,250.50'), 1250.5, 'lee montos con símbolo');
casi(Dinero.numero('12,50'), 12.5, 'la coma es decimal');
casi(Dinero.numero('12.50'), 12.5, 'el punto es decimal');
casi(Dinero.numero('1.250,50'), 1250.5, 'punto de miles y coma decimal');
casi(Dinero.numero(''), null, 'vacío no es cero');

var mes = Dinero.resumir([
  { tipo: 'Ingreso', monto: 3900, montoReal: 3900, estado: 'Recibido' },
  { tipo: 'Gasto', monto: 930, estado: 'Pendiente' },
  { tipo: 'Gasto', monto: 1920, montoReal: 1920, estado: 'Pagado' }
]);
casi(mes.ingresos, 3900, 'ingresos del mes');
casi(mes.gastosPlanificados, 2850, 'planificado incluye lo ya pagado');
casi(mes.gastosPagados, 1920, 'pagado del mes');
casi(mes.disponible, 1980, 'disponible del mes resta lo pagado');

var conAhorro = Dinero.resumir([
  { tipo: 'Ingreso', monto: 1630, montoReal: 1630, estado: 'Recibido' },
  { tipo: 'Gasto', monto: 96, montoReal: 96, estado: 'Pagado', pagadoDesde: 'Presupuesto familiar' },
  { tipo: 'Gasto', monto: 154, montoReal: 154, estado: 'Pagado', pagadoDesde: 'Ahorros Mia' },
  { tipo: 'Gasto', monto: 50, estado: 'Pendiente', pagadoDesde: 'Ahorros Fabi' }
]);
casi(conAhorro.gastosPagados, 96, 'lo pagado con ahorros no sale del presupuesto');
casi(conAhorro.gastosPlanificados, 146, 'lo pagado con ahorros no queda en el plan del presupuesto');
casi(conAhorro.gastosPendientes, 50, 'si aún no se paga, sigue pendiente');
casi(conAhorro.disponibleActual, 1534, 'el verde no baja cuando pagó Mia');

var cajas = Dinero.ahorros([
  { concepto: 'Saldo Ahorros Mia', monto: 300, estado: 'Omitido' },
  { concepto: 'Saldo Ahorros Fabi', monto: 250, estado: 'Omitido' },
  { concepto: 'Luz', monto: 96, montoReal: 96, estado: 'Pagado', pagadoDesde: 'Ahorros Mia' },
  { concepto: 'Escuela', monto: 50, estado: 'Pendiente', pagadoDesde: 'Ahorros Fabi' }
]);
casi(cajas.mia, 204, 'el saldo de Mia baja solo si ya se pagó');

var desdeNota = Dinero.resumir([
  { tipo: 'Ingreso', monto: 1000, montoReal: 1000, estado: 'Recibido' },
  { tipo: 'Gasto', monto: 160, montoReal: 160, estado: 'Pagado', notas: 'Pagado desde: Ahorros Fabi' }
]);
casi(desdeNota.gastosPagados, 0, 'una nota de Fabiana no sale del presupuesto');
var saldoNota = Dinero.ahorros([
  { concepto: 'Saldo Ahorros Fabi', monto: 768, estado: 'Omitido' },
  { concepto: 'Luz', monto: 160, montoReal: 160, estado: 'Pagado', notas: 'Pagado desde: Ahorros Fabi' }
]);
casi(saldoNota.fabi, 608, 'la luz baja el ahorro de Fabiana');
casi(cajas.fabi, 250, 'lo pendiente no baja el ahorro');
casi(Dinero.saldoAhorro([
  { concepto: 'Saldo Ahorro Emergencia', monto: 80, estado: 'Omitido' },
  { concepto: 'Taxi', monto: 20, montoReal: 20, estado: 'Pagado', pagadoDesde: 'Ahorro Emergencia' }
], 'Emergencia'), 60, 'un ahorro nuevo baja solo lo pagado desde ahí');
casi(Dinero.saldoAhorro([
  { concepto: 'Saldo Ahorros Mia', monto: 172, estado: 'Omitido' }
], 'Emergencia'), 0, 'el saldo de Mia no entra en otro ahorro');
casi(Dinero.saldoAhorro([
  { tipo: 'Gasto', concepto: 'Navidad', categoria: 'Ahorro Navidad', monto: 40, montoReal: 40, estado: 'Pagado', pagadoDesde: 'De la casa' }
], 'Navidad'), 40, 'un gasto a Ahorro Navidad sube ese ahorro');
casi(Dinero.saldoAhorro([
  { tipo: 'Gasto', categoria: 'Ahorro Navidad', monto: 40, estado: 'Pendiente', pagadoDesde: 'De la casa' }
], 'Navidad'), 0, 'si aún no está pagado, el ahorro no sube');
casi(Dinero.resumir([
  { tipo: 'Ingreso', monto: 100, montoReal: 100, estado: 'Recibido' },
  { tipo: 'Gasto', categoria: 'Ahorro Navidad', monto: 40, montoReal: 40, estado: 'Pagado', pagadoDesde: 'De la casa' }
]).disponibleActual, 60, 'guardar en Navidad baja lo disponible de la casa');
casi(Dinero.saldoAhorro([
  { tipo: 'Gasto', categoria: 'Servicios', concepto: 'Luz', monto: 160, montoReal: 160, estado: 'Pagado', pagadoDesde: 'Ahorros Fabi' },
  { concepto: 'Saldo Ahorros Fabi', monto: 928, estado: 'Omitido' }
], 'Fabi'), 768, 'pagar la luz desde Fabi no usa la categoría de ahorro');

var cadena = Dinero.conArrastre([
  { ingresosRecibidos: 100, gastosPagados: 85 },
  { ingresosRecibidos: 50, gastosPagados: 40 }
]);
casi(cadena[0].arrastre, 0, 'el primer corte no arrastra');
casi(cadena[0].ingresos, 100, 'ingresos del primer corte');
casi(cadena[0].disponible, 15, 'sobrante del primer corte');
casi(cadena[1].arrastre, 15, 'el sobrante pasa al siguiente');
casi(cadena[1].ingresos, 65, 'ingresos son el arrastre más lo recibido');
casi(cadena[1].disponible, 25, 'el disponible del siguiente incluye el arrastre');
var deuda = Dinero.conArrastre([
  { ingresosRecibidos: 10, gastosPagados: 25 },
  { ingresosRecibidos: 40, gastosPagados: 0 }
]);
casi(deuda[1].arrastre, -15, 'si se gastó de más, el faltante también pasa');
casi(deuda[1].ingresos, 25, 'el siguiente corte empieza con ese faltante');

console.log('dinero: ok');
