var Dinero = require('../../js/dinero.js');
var assert = require('assert');

function igual(actual, esperado, mensaje) {
  assert.deepStrictEqual(actual, esperado, mensaje + ' → ' + JSON.stringify(actual));
}

// Qué monto se muestra en el único campo
igual(Dinero.montoVisible({ monto: 60, montoReal: 63, estado: 'Pagado' }), 63, 'pagado muestra lo que de verdad se pagó');
igual(Dinero.montoVisible({ monto: 60, montoReal: '', estado: 'Pagado' }), 60, 'sin monto real muestra el monto');
igual(Dinero.montoVisible({ monto: 60, montoReal: 63, estado: 'Pendiente' }), 60, 'pendiente muestra el plan');
igual(Dinero.montoVisible(null), '', 'nuevo va vacío');

// Qué se guarda
igual(Dinero.montosAlGuardar(null, 45, 'Pagado'), { monto: 45, montoReal: 45 }, 'nuevo pagado guarda los dos iguales');
igual(Dinero.montosAlGuardar(null, 45, 'Recibido'), { monto: 45, montoReal: 45 }, 'nuevo recibido guarda los dos iguales');
igual(Dinero.montosAlGuardar(null, 45, 'Pendiente'), { monto: 45, montoReal: '' }, 'nuevo pendiente no inventa monto real');

var viejo = { monto: 60, montoReal: 63, estado: 'Pagado' };
igual(Dinero.montosAlGuardar(viejo, 63, 'Pagado'), {}, 'registro viejo sin tocar el monto no cambia nada');
igual(Dinero.montosAlGuardar(viejo, 70, 'Pagado'), { monto: 70, montoReal: 70 }, 'si cambia el monto, los dos quedan iguales');

var pendiente = { monto: 60, montoReal: '', estado: 'Pendiente' };
igual(Dinero.montosAlGuardar(pendiente, 60, 'Pendiente'), {}, 'pendiente sin cambios no cambia nada');
igual(Dinero.montosAlGuardar(pendiente, 60, 'Pagado'), { montoReal: 60 }, 'al pasarlo a pagado se llena el monto real');
igual(Dinero.montosAlGuardar(pendiente, 62, 'Pagado'), { monto: 62, montoReal: 62 }, 'pagado con otro monto guarda los dos');
igual(Dinero.montosAlGuardar({ monto: '60.00', montoReal: '', estado: 'Pendiente' }, 60, 'Pendiente'), {}, 'texto y número iguales cuentan como sin cambio');

console.log('formulario: ok');
