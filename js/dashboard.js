function cadenaDelCorte(lista, corteClave) {
  var grupos = {};
  (lista || []).forEach(function (m) {
    if (Dinero.norm(m.estado) === 'omitido') return;
    var clave = Corte.corteDe(m).clave;
    if (!clave || clave > corteClave) return;
    if (!grupos[clave]) grupos[clave] = [];
    grupos[clave].push(m);
  });
  if (!grupos[corteClave]) grupos[corteClave] = [];
  var claves = Object.keys(grupos).sort();
  var pasos = Dinero.conArrastre(claves.map(function (clave) {
    return Dinero.resumir(grupos[clave]);
  }));
  var ultimo = pasos[pasos.length - 1] || { arrastre: 0, ingresos: 0, disponible: 0 };
  return {
    resumen: Dinero.resumir(grupos[corteClave]),
    arrastre: ultimo.arrastre,
    ingresos: ultimo.ingresos,
    disponible: ultimo.disponible
  };
}

function cargarInicio() {
  if (Memoria.lista) pintarInicio(Memoria.lista);
  return traerMovimientos();
}

function pintarInicio(lista) {
  if (!Datos.mes) Datos.mes = Corte.periodoDe(fechaDeHoy());
  var hoy = Corte.calcularCorte(fechaDeHoy());
  var corte = Datos.corteClave ? Corte.calcularCorte(Datos.corteClave) : hoy;
  if (!corte.clave) corte = hoy;
  Datos.corteClave = corte.clave;
  var delCorte = (lista || []).filter(function (m) {
    return Corte.corteDe(m).clave === corte.clave && Dinero.norm(m.estado) !== 'omitido';
  });
  var cadena = cadenaDelCorte(lista, corte.clave);
  var resumen = cadena.resumen;
  var titulo = Formato.rango(corte.inicio, corte.fin);
  document.getElementById('mes-etiqueta').textContent = titulo;
  var basicos = document.getElementById('corte-basicos');
  if (basicos) basicos.textContent = titulo;
  var nota = cadena.arrastre ? ('Arrastre ' + Formato.moneda(cadena.arrastre)) : '';
  var filas = [
    ['Ingresos + sobrante', cadena.ingresos, '', nota],
    ['Planificado', resumen.gastosPlanificados],
    ['Pagado', resumen.gastosPagados, 'pagado'],
    ['Disponible', cadena.disponible, true]
  ];
  cuentasAhorro().forEach(function (cuenta) {
    if (!cuenta.inicio) return;
    filas.push(['Ahorro ' + cuenta.nombre, Dinero.saldoAhorro(lista || [], cuenta.nombre), 'ahorro']);
  });
  pintarCifras(document.getElementById('cifras-mes'), filas);
  pintarCorte(Object.assign({}, corte, resumen, {
    arrastre: cadena.arrastre,
    disponibleActual: cadena.disponible,
    disponibleEsperado: Dinero.redondear(cadena.arrastre + resumen.disponibleEsperado)
  }), corte.clave === hoy.clave);
  pintarPorCubrir(delCorte.filter(function (m) {
    var estado = Dinero.norm(m.estado);
    return Dinero.norm(m.tipo) === 'gasto' && (estado === 'pendiente' || estado === 'programado');
  }).sort(function (a, b) {
    return String(a.fecha || '9999').localeCompare(String(b.fecha || '9999'));
  }));
}

function pintarFalloInicio(texto) {
  Formato.vaciar(document.getElementById('cifras-mes'));
  var corte = document.getElementById('corte-actual');
  Formato.vaciar(corte);
  corte.appendChild(Formato.nodo('p', 'vacio', texto));
  Formato.vaciar(document.getElementById('por-cubrir'));
}

function pintarCifras(contenedor, filas) {
  Formato.vaciar(contenedor);
  filas.forEach(function (fila) {
    var marca = fila[2] === 'pagado' ? ' cifra-pagado' : (fila[2] === 'ahorro' ? ' cifra-ahorro' : (fila[2] ? ' cifra-fuerte' : ''));
    var caja = Formato.nodo('div', 'cifra' + marca);
    caja.appendChild(Formato.nodo('span', 'cifra-nombre', fila[0]));
    var valor = Formato.nodo('strong', '', Formato.moneda(fila[1]));
    if (fila[2] === true && Number(fila[1]) < 0) valor.className = 'negativo';
    caja.appendChild(valor);
    if (fila[3]) caja.appendChild(Formato.nodo('span', 'cifra-nota', fila[3]));
    contenedor.appendChild(caja);
  });
}

function pintarCorte(corte, esActual) {
  var caja = document.getElementById('corte-actual');
  Formato.vaciar(caja);
  caja.appendChild(Formato.nodo('p', 'corte-kicker', esActual ? 'Corte actual' : 'Corte'));
  caja.appendChild(Formato.nodo('h3', '', Formato.rango(corte.inicio, corte.fin)));
  var lista = Formato.nodo('dl', 'corte-lista');
  var lineas = [
    ['Gastos pendientes', corte.gastosPendientes],
    ['Gastos pagados', corte.gastosPagados],
    ['Disponible esperado', corte.disponibleEsperado],
    ['Disponible actual', corte.disponibleActual]
  ];
  if (corte.arrastre) lineas.unshift(['Arrastre', corte.arrastre]);
  lineas.unshift(['Ingresos esperados', corte.ingresos]);
  lineas.forEach(function (fila) {
    lista.appendChild(Formato.nodo('dt', '', fila[0]));
    var dd = Formato.nodo('dd', fila[0] === 'Disponible actual' ? 'destacado' : (fila[0] === 'Gastos pagados' ? 'pagado' : ''), Formato.moneda(fila[1]));
    if (fila[0] === 'Disponible actual' && Number(fila[1]) < 0) dd.classList.add('negativo');
    lista.appendChild(dd);
  });
  caja.appendChild(lista);
}

function pintarPorCubrir(pendientes) {
  var caja = document.getElementById('por-cubrir');
  Formato.vaciar(caja);
  if (!pendientes.length) {
    caja.appendChild(Formato.nodo('p', 'vacio', 'Nada pendiente en este corte.'));
    return;
  }
    pendientes.forEach(function (m) {
      caja.appendChild(tarjetaMovimiento(m));
    });
}
