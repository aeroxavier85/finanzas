var Dinero = (function () {
  function norm(v) {
    return String(v || '').trim().toLowerCase();
  }

  function numero(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).replace(/\$/g, '').replace(/\s/g, '');
    var ultimaComa = s.lastIndexOf(',');
    var ultimoPunto = s.lastIndexOf('.');
    if (ultimaComa >= 0 && ultimoPunto >= 0) {
      if (ultimaComa > ultimoPunto) s = s.replace(/\./g, '').replace(/,/g, '.');
      else s = s.replace(/,/g, '');
    } else if (ultimaComa >= 0) {
      s = s.replace(/,/g, '.');
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function redondear(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function valorReal(m, monto) {
    var real = numero(m.montoReal);
    return real === null ? monto : real;
  }

  function baseAhorro(v) {
    var o = norm(v);
    o = o.replace(/^pagado desde:\s*/, '');
    o = o.replace(/^saldo\s+/, '');
    o = o.replace(/^ahorros?\s+/, '');
    if (o === 'fabiana') return 'fabi';
    if (!o || o === 'presupuesto familiar' || o === 'de la casa' || o === 'casa' || o === 'la casa') return '';
    return o;
  }

  function claveAhorro(base) {
    if (base === 'mia' || base === 'fabi') return 'ahorros ' + base;
    return 'ahorro ' + base;
  }

  function destinoAhorro(m) {
    var cat = norm(m && m.categoria);
    if (cat.indexOf('ahorros ') !== 0 && cat.indexOf('ahorro ') !== 0) return '';
    return baseAhorro(cat);
  }

  function origenGasto(m) {
    var directo = baseAhorro(m && m.pagadoDesde);
    if (directo) return claveAhorro(directo);
    var notas = norm(m && m.notas);
    var marca = notas.match(/pagado desde:\s*([^.]+)/);
    if (marca) {
      var desde = baseAhorro(marca[1]);
      if (desde) return claveAhorro(desde);
    }
    if (notas.indexOf('ahorros fabi') !== -1 || notas.indexOf('ahorro fabi') !== -1) return 'ahorros fabi';
    if (notas.indexOf('ahorros mia') !== -1 || notas.indexOf('ahorro mia') !== -1) return 'ahorros mia';
    return '';
  }

  function saleDeAhorro(m) {
    return origenGasto(m) !== '';
  }

  function resumir(lista) {
    var ingresos = 0;
    var ingresosRecibidos = 0;
    var gastosPlan = 0;
    var gastosPagados = 0;
    var gastosPendientes = 0;

    (lista || []).forEach(function (m) {
      var estado = norm(m.estado);
      if (estado === 'omitido') return;
      var tipo = norm(m.tipo);
      var monto = numero(m.monto);
      if (monto === null) monto = 0;
      if (tipo === 'ingreso') {
        ingresos += monto;
        if (estado === 'recibido') ingresosRecibidos += valorReal(m, monto);
      } else if (tipo === 'gasto') {
        if (estado === 'pagado' && saleDeAhorro(m)) return;
        gastosPlan += monto;
        if (estado === 'pagado') gastosPagados += valorReal(m, monto);
        if (estado === 'pendiente' || estado === 'programado') gastosPendientes += monto;
      }
    });

    return {
      ingresos: redondear(ingresos),
      ingresosRecibidos: redondear(ingresosRecibidos),
      gastosPlanificados: redondear(gastosPlan),
      gastosPagados: redondear(gastosPagados),
      gastosPendientes: redondear(gastosPendientes),
      disponibleEsperado: redondear(ingresos - gastosPlan),
      disponibleActual: redondear(ingresosRecibidos - gastosPagados),
      disponible: redondear(ingresos - gastosPagados)
    };
  }

  function conArrastre(resumenes) {
    var carry = 0;
    return (resumenes || []).map(function (resumen) {
      var arrastre = carry;
      var ingresos = redondear(arrastre + (resumen.ingresosRecibidos || 0));
      var disponible = redondear(ingresos - (resumen.gastosPagados || 0));
      carry = disponible;
      return {
        arrastre: arrastre,
        ingresos: ingresos,
        disponible: disponible
      };
    });
  }

  function saldoAhorro(lista, nombre) {
    var base = baseAhorro(nombre);
    if (!base) return 0;
    var total = 0;
    (lista || []).forEach(function (m) {
      var monto = numero(m.monto);
      if (monto === null) monto = 0;
      var concepto = norm(m.concepto);
      if (concepto.indexOf('saldo') === 0 && baseAhorro(concepto) === base) total += monto;
      if (norm(m.estado) !== 'pagado') return;
      var real = valorReal(m, monto);
      if (destinoAhorro(m) === base) total += real;
      if (baseAhorro(origenGasto(m)) === base) total -= real;
    });
    return redondear(total);
  }

  function ahorros(lista) {
    return {
      mia: saldoAhorro(lista, 'Mia'),
      fabi: saldoAhorro(lista, 'Fabi')
    };
  }

  return {
    resumir: resumir,
    numero: numero,
    norm: norm,
    redondear: redondear,
    saleDeAhorro: saleDeAhorro,
    origenGasto: origenGasto,
    destinoAhorro: destinoAhorro,
    baseAhorro: baseAhorro,
    saldoAhorro: saldoAhorro,
    ahorros: ahorros,
    conArrastre: conArrastre
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Dinero;
}
