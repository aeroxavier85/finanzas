var Corte = (function () {
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function pad(n) {
    n = String(n);
    return n.length < 2 ? '0' + n : n;
  }

  function iso(anio, mes, dia) {
    return anio + '-' + pad(mes) + '-' + pad(dia);
  }

  function diasDelMes(anio, mes) {
    return new Date(anio, mes, 0).getDate();
  }

  function partes(fecha) {
    if (!fecha) return null;
    var coincidencia = String(fecha).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!coincidencia) return null;
    var anio = Number(coincidencia[1]);
    var mes = Number(coincidencia[2]);
    var dia = Number(coincidencia[3]);
    if (mes < 1 || mes > 12 || dia < 1) return null;
    if (dia > diasDelMes(anio, mes)) return null;
    return { anio: anio, mes: mes, dia: dia };
  }

  function sumarMes(anio, mes, delta) {
    var indice = mes - 1 + delta;
    return {
      anio: anio + Math.floor(indice / 12),
      mes: ((indice % 12) + 12) % 12 + 1
    };
  }

  function ddmm(anio, mes, dia) {
    return pad(dia) + '/' + pad(mes) + '/' + anio;
  }

  function armar(inicio, fin) {
    return {
      etiqueta: ddmm(inicio.anio, inicio.mes, inicio.dia) + '–' + ddmm(fin.anio, fin.mes, fin.dia),
      clave: iso(inicio.anio, inicio.mes, inicio.dia),
      inicio: iso(inicio.anio, inicio.mes, inicio.dia),
      fin: iso(fin.anio, fin.mes, fin.dia)
    };
  }

  var diasCorte = [10, 25];

  function sinAsignar() {
    return { etiqueta: 'Sin asignar', clave: '', inicio: '', fin: '' };
  }

  function diaValido(n) {
    n = Number(n);
    if (!isFinite(n)) return null;
    n = Math.round(n);
    if (n < 1 || n > 28) return null;
    return n;
  }

  function fijarDias(a, b) {
    var x = diaValido(a);
    var y = diaValido(b);
    if (x === null || y === null || x === y) return diasCorte.slice();
    diasCorte = x < y ? [x, y] : [y, x];
    return diasCorte.slice();
  }

  function diasActuales() {
    return diasCorte.slice();
  }

  function describir(a, b) {
    var x = diaValido(a);
    var y = diaValido(b);
    if (x === null || y === null || x === y) return '';
    if (x > y) {
      var cambio = x;
      x = y;
      y = cambio;
    }
    var finPrimero = y - 1;
    var finSegundo = x - 1;
    if (finSegundo < 1) {
      return 'Un corte va del ' + x + ' al ' + finPrimero + '. El otro va del ' + y + ' al último día del mes.';
    }
    return 'Un corte va del ' + x + ' al ' + finPrimero + '. El otro va del ' + y + ' al ' + finSegundo + ' del mes siguiente.';
  }

  function diaAnterior(anio, mes, dia) {
    if (dia > 1) return { anio: anio, mes: mes, dia: dia - 1 };
    var anterior = sumarMes(anio, mes, -1);
    return { anio: anterior.anio, mes: anterior.mes, dia: diasDelMes(anterior.anio, anterior.mes) };
  }

  function calcularCorte(fecha) {
    var p = partes(fecha);
    if (!p) return sinAsignar();
    var primero = diasCorte[0];
    var segundo = diasCorte[1];
    if (p.dia >= segundo) {
      var siguiente = sumarMes(p.anio, p.mes, 1);
      var fin = diaAnterior(siguiente.anio, siguiente.mes, primero);
      return armar({ anio: p.anio, mes: p.mes, dia: segundo }, fin);
    }
    if (p.dia >= primero) {
      return armar({ anio: p.anio, mes: p.mes, dia: primero }, { anio: p.anio, mes: p.mes, dia: segundo - 1 });
    }
    var anterior = sumarMes(p.anio, p.mes, -1);
    return armar(
      { anio: anterior.anio, mes: anterior.mes, dia: segundo },
      { anio: p.anio, mes: p.mes, dia: primero - 1 }
    );
  }

  function corteDe(m) {
    if (!m) return sinAsignar();
    var manual = String(m.corteManual || '').trim().toLowerCase();
    if (manual === 'si' || manual === 'sí') {
      if (!m.corteClave) return sinAsignar();
      return {
        etiqueta: m.corte || String(m.corteClave),
        clave: String(m.corteClave),
        inicio: String(m.corteClave).slice(0, 10),
        fin: ''
      };
    }
    return calcularCorte(m.fecha);
  }

  function fechaDePlantilla(periodo, dia) {
    var coincidencia = String(periodo || '').match(/^(\d{4})-(\d{2})$/);
    if (!coincidencia) return '';
    if (dia === '' || dia === null || dia === undefined) return '';
    var n = Number(dia);
    if (!isFinite(n) || n < 1) return '';
    var anio = Number(coincidencia[1]);
    var mes = Number(coincidencia[2]);
    if (mes < 1 || mes > 12) return '';
    var ultimo = diasDelMes(anio, mes);
    if (n > ultimo) n = ultimo;
    return iso(anio, mes, n);
  }

  function fechaEnCorte(corte, dia) {
    if (!corte || !corte.clave || !corte.inicio || !corte.fin) return '';
    if (dia === '' || dia === null || dia === undefined) return '';
    var n = Number(dia);
    if (!isFinite(n) || n < 1) return '';
    var inicio = partes(corte.inicio);
    var fin = partes(corte.fin);
    if (!inicio || !fin) return '';
    var meses = [{ anio: inicio.anio, mes: inicio.mes }];
    if (fin.anio !== inicio.anio || fin.mes !== inicio.mes) meses.push({ anio: fin.anio, mes: fin.mes });
    var i;
    for (i = 0; i < meses.length; i++) {
      var fecha = fechaDePlantilla(meses[i].anio + '-' + pad(meses[i].mes), n);
      if (fecha && calcularCorte(fecha).clave === corte.clave) return fecha;
    }
    return '';
  }

  function etiquetaMes(periodo) {
    var coincidencia = String(periodo || '').match(/^(\d{4})-(\d{2})$/);
    if (!coincidencia) return '';
    var nombre = MESES[Number(coincidencia[2]) - 1] || '';
    return nombre.charAt(0).toUpperCase() + nombre.slice(1) + ' ' + coincidencia[1];
  }

  function periodoDe(fecha) {
    var p = partes(fecha);
    if (!p) return '';
    return String(p.anio) + '-' + pad(p.mes);
  }

  function moverCorte(clave, delta) {
    var corte = calcularCorte(clave);
    if (!corte.clave) return '';
    var p = partes(corte.inicio);
    var paso = delta < 0 ? -1 : 1;
    var primero = diasCorte[0];
    var segundo = diasCorte[1];
    if (p.dia === segundo) {
      if (paso < 0) return iso(p.anio, p.mes, primero);
      var siguiente = sumarMes(p.anio, p.mes, 1);
      return iso(siguiente.anio, siguiente.mes, primero);
    }
    if (paso < 0) {
      var anterior = sumarMes(p.anio, p.mes, -1);
      return iso(anterior.anio, anterior.mes, segundo);
    }
    return iso(p.anio, p.mes, segundo);
  }

  function moverMes(periodo, delta) {
    var coincidencia = String(periodo || '').match(/^(\d{4})-(\d{2})$/);
    if (!coincidencia) return '';
    var destino = sumarMes(Number(coincidencia[1]), Number(coincidencia[2]), delta);
    return String(destino.anio) + '-' + pad(destino.mes);
  }

  function cortesDelMes(periodo) {
    var coincidencia = String(periodo || '').match(/^(\d{4})-(\d{2})$/);
    if (!coincidencia) return [];
    var anio = coincidencia[1];
    var mes = coincidencia[2];
    var vistos = {};
    var lista = [];
    [1, diasCorte[0], diasCorte[1]].forEach(function (dia) {
      var fecha = fechaDePlantilla(anio + '-' + mes, dia);
      var corte = calcularCorte(fecha);
      if (!corte.clave || vistos[corte.clave]) return;
      vistos[corte.clave] = true;
      lista.push(corte);
    });
    return lista;
  }

  return {
    calcularCorte: calcularCorte,
    corteDe: corteDe,
    fijarDias: fijarDias,
    diasActuales: diasActuales,
    diaValido: diaValido,
    describir: describir,
    fechaDePlantilla: fechaDePlantilla,
    fechaEnCorte: fechaEnCorte,
    etiquetaMes: etiquetaMes,
    periodoDe: periodoDe,
    moverMes: moverMes,
    moverCorte: moverCorte,
    cortesDelMes: cortesDelMes,
    diasDelMes: diasDelMes
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Corte;
}
