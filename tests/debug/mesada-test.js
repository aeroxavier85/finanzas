var Mesada = require('../../js/mesada.js');
var assert = require('assert');

function igual(actual, esperado, mensaje) {
  assert.strictEqual(actual, esperado, mensaje + ' → ' + actual);
}

igual(Mesada.porId('platos').valor, 2.5, 'lavar platos vale 2.50');
igual(Mesada.porId('bano').valor, 5, 'el baño vale 5');
igual(Mesada.porId('ropa').valor, 3, 'lavar y secar vale 3');
igual(Mesada.porId('doblar').valor, 5, 'doblar y guardar vale 5');

var lista = [
  { id: '1', nina: 'mia', actividad: 'platos', valor: 2.5, fecha: '2026-10-06' },
  { id: '2', nina: 'mia', actividad: 'bano', valor: 5, fecha: '2026-10-06' },
  { id: '3', nina: 'fabiana', actividad: 'ropa', valor: 3, fecha: '2026-10-07' },
  { id: '4', nina: 'mia', actividad: 'platos', valor: 2.5, fecha: '2026-09-30' }
];
igual(Mesada.total(lista, 'mia', '2026-10'), 7.5, 'octubre de Mia suma platos y baño');
igual(Mesada.delMes(lista, 'mia', '2026-10').length, 2, 'en octubre Mia tiene dos hechas');
igual(Mesada.total(lista, 'fabiana', '2026-10'), 3, 'Fabiana solo suma lo suyo');
igual(Mesada.total(lista, 'mia', '2026-09'), 2.5, 'septiembre no se mezcla con octubre');
Mesada.usar([{ id: 'platos', nombre: 'Lavar platos', valor: 4 }]);
igual(Mesada.porId('platos').valor, 4, 'el precio de una actividad se puede cambiar');
igual(Mesada.porId('bano'), null, 'la lista nueva reemplaza la de fábrica');
Mesada.usar([
  { id: 'bano', nombre: 'Lavar el baño', valor: 5 },
  { id: 'platos', nombre: 'Lavar platos', valor: 2.5 },
  { id: 'ropa', nombre: 'Lavar y secar', valor: 3 },
  { id: 'doblar', nombre: 'Doblar y guardar', valor: 5 }
]);

console.log('mesada: ok');
