var CacheLista = [];
var Filtros = {
  mes: '',
  corte: '',
  tipo: '',
  categoria: '',
  estado: '',
  recurrente: ''
};
var filtrosTocados = false;

function cargarLista() {
  if (Memoria.lista) pintarListaDesde(Memoria.lista);
  if (!hayAlgunFiltro()) return traerMovimientos();
  var marca = Memoria.marca;
  return Api.movimientos(filtrosActivos()).then(function (r) {
    if (marca !== Memoria.marca) return;
    var caja = document.getElementById('lista');
    if (!r.ok) {
      Formato.vaciar(caja);
      caja.appendChild(Formato.nodo('p', 'vacio', r.error || 'No se pudo cargar la lista'));
      return;
    }
    pintarGrupos((r.movimientos || []).filter(pasaFiltroLocal));
  });
}

function pintarListaDesde(listaCompleta) {
  var filtrada = (listaCompleta || []).filter(pasaFiltroLocal);
  pintarGrupos(filtrada);
}

function pintarGrupos(items) {
  var lista = document.getElementById('lista');
  Formato.vaciar(lista);
  CacheLista = soloLoReal(items);
  pintarResumenFiltros();
  if (!CacheLista.length) {
    lista.appendChild(Formato.nodo('p', 'vacio', Filtros.estado
      ? 'No hay movimientos con estos filtros.'
      : 'Todavía no hay nada pagado ni recibido.'));
    return;
  }
  var hoy = Corte.calcularCorte(fechaDeHoy());
  agruparPorCorte(CacheLista).forEach(function (grupo) {
    var titulo = Formato.nodo('h3', 'corte-grupo' + (grupo.clave === hoy.clave ? ' actual' : ''));
    titulo.textContent = grupo.titulo;
    lista.appendChild(titulo);
    grupo.items.forEach(function (m) {
      lista.appendChild(tarjetaMovimiento(m));
    });
  });
}

function hayAlgunFiltro() {
  return Object.keys(Filtros).some(function (k) { return !!Filtros[k]; });
}

function pasaFiltroLocal(m) {
  if (Filtros.tipo && Dinero.norm(m.tipo) !== Dinero.norm(Filtros.tipo)) return false;
  if (Filtros.categoria && Dinero.norm(m.categoria) !== Dinero.norm(Filtros.categoria)) return false;
  if (Filtros.estado && Dinero.norm(m.estado) !== Dinero.norm(Filtros.estado)) return false;
  if (Filtros.corte === 'sin-asignar' && Corte.corteDe(m).clave) return false;
  if (Filtros.corte && Filtros.corte !== 'sin-asignar' && Corte.corteDe(m).clave !== Filtros.corte) return false;
  if (Filtros.mes === 'sin-fecha' && m.fecha) return false;
  if (Filtros.mes && Filtros.mes !== 'sin-fecha' && String(m.fecha || '').slice(0, 7) !== Filtros.mes) return false;
  if (Filtros.recurrente === 'si' && Dinero.norm(m.recurrente) !== 'sí' && Dinero.norm(m.recurrente) !== 'si') return false;
  if (Filtros.recurrente === 'no' && (Dinero.norm(m.recurrente) === 'sí' || Dinero.norm(m.recurrente) === 'si')) return false;
  return true;
}

function fechaDeHoy() {
  var d = new Date();
  var mes = d.getMonth() + 1;
  var dia = d.getDate();
  return d.getFullYear() + '-' + (mes < 10 ? '0' : '') + mes + '-' + (dia < 10 ? '0' : '') + dia;
}

function agruparPorCorte(lista) {
  var grupos = {};
  lista.forEach(function (m) {
    var corte = Corte.corteDe(m);
    var clave = corte.clave || 'sin-asignar';
    if (!grupos[clave]) {
      grupos[clave] = {
        clave: clave,
        titulo: corte.clave
          ? (corte.fin ? Formato.rango(corte.inicio, corte.fin) : (m.corte || corte.etiqueta || 'Sin asignar'))
          : 'Sin asignar',
        items: []
      };
    }
    grupos[clave].items.push(m);
  });
  return Object.keys(grupos).sort(function (a, b) {
    if (a === 'sin-asignar') return 1;
    if (b === 'sin-asignar') return -1;
    return a < b ? 1 : -1;
  }).map(function (clave) { return grupos[clave]; });
}

function soloLoReal(lista) {
  if (Filtros.estado) return lista;
  return lista.filter(function (m) {
    var estado = Dinero.norm(m.estado);
    return estado === 'pagado' || estado === 'recibido';
  });
}

function filtrosActivos() {
  var datos = {};
  Object.keys(Filtros).forEach(function (k) {
    if (Filtros[k] && k !== 'corte') datos[k] = Filtros[k];
  });
  return datos;
}

function pintarResumenFiltros() {
  var partes = [];
  if (Filtros.mes === 'sin-fecha') partes.push('Sin fecha');
  else if (Filtros.mes) partes.push(Corte.etiquetaMes(Filtros.mes));
  else partes.push('Por cortes');
  if (Filtros.tipo) partes.push(Filtros.tipo);
  partes.push(Filtros.estado || 'Pagados y recibidos');
  if (Filtros.categoria) partes.push(Filtros.categoria);
  if (Filtros.recurrente === 'si') partes.push('Recurrentes');
  if (Filtros.recurrente === 'no') partes.push('Sueltos');
  if (Filtros.corte === 'sin-asignar') partes.push('Sin corte');
  else if (Filtros.corte) partes.push('Un corte');
  document.getElementById('resumen-filtros').textContent = partes.join(' · ');
}

function montoVisible(m) {
  var estado = String(m.estado || '').toLowerCase();
  if ((estado === 'pagado' || estado === 'recibido') && m.montoReal !== '' && m.montoReal !== null && m.montoReal !== undefined) {
    return Number(m.montoReal);
  }
  return Number(m.monto || 0);
}

function tarjetaMovimiento(m) {
  var boton = Formato.nodo('button', 'tarjeta');
  boton.type = 'button';
  var cabeza = Formato.nodo('div', 'tarjeta-cabeza');
  cabeza.appendChild(Formato.nodo('span', 'concepto', m.concepto || 'Sin concepto'));
  var claseMonto = 'monto';
  if (Dinero.norm(m.tipo) === 'ingreso') claseMonto += ' ingreso';
  else if (Dinero.norm(m.estado) === 'pagado') claseMonto += ' pagado';
  var monto = Formato.nodo('strong', claseMonto, Formato.moneda(montoVisible(m)));
  cabeza.appendChild(monto);
  boton.appendChild(cabeza);
  var meta = [];
  meta.push(m.fecha ? Formato.fecha(m.fecha, false) : 'Sin fecha');
  if (m.categoria) meta.push(m.categoria);
  boton.appendChild(Formato.nodo('p', 'meta', meta.join(' · ')));
  var estadoTxt = marcaEstado(m.estado);
  var origen = textoOrigen(m);
  if (origen) estadoTxt += ' · ' + origen;
  boton.appendChild(Formato.nodo('p', 'estado estado-' + Dinero.norm(m.estado || 'pendiente'), estadoTxt));
  boton.addEventListener('click', function () { abrirAcciones(m); });
  return boton;
}

function textoOrigen(m) {
  var base = Dinero.baseAhorro(Dinero.origenGasto(m));
  if (!base) return '';
  return 'desde ' + base.charAt(0).toUpperCase() + base.slice(1);
}

function opcionesDePago() {
  var lista = [['De la casa', 'De la casa']];
  cuentasAhorro().forEach(function (cuenta) {
    lista.push(['Ahorro ' + cuenta.nombre, 'Desde ' + cuenta.nombre]);
  });
  return lista;
}

function marcaEstado(estado) {
  var e = Dinero.norm(estado);
  if (e === 'pagado' || e === 'recibido') return '✓ ' + (estado || '');
  if (e === 'programado' || e === 'esperado') return '◌ ' + (estado || '');
  if (e === 'omitido') return '– Omitido';
  return '○ ' + (estado || 'Pendiente');
}

function abrirAcciones(m) {
  var caja = Formato.nodo('div', 'acciones');
  caja.appendChild(Formato.nodo('h2', '', m.concepto));
  var detalle = Formato.moneda(montoVisible(m)) + ' · ' + (m.corte || 'Sin asignar');
  var origenActual = textoOrigen(m);
  if (origenActual) detalle += ' · ' + origenActual;
  caja.appendChild(Formato.nodo('p', 'meta', detalle));
  if (Dinero.norm(m.tipo) === 'ingreso') {
    var recibir = Formato.nodo('button', 'boton', 'Marcar recibido');
    recibir.type = 'button';
    recibir.addEventListener('click', function () { marcarPagado(m.id, ''); });
    caja.appendChild(recibir);
  } else {
    opcionesDePago().forEach(function (op) {
      var esCasa = !Dinero.baseAhorro(op[0]);
      var elegido = esCasa ? !origenActual : Dinero.baseAhorro(op[0]) === Dinero.baseAhorro(origenActual);
      var pagar = Formato.nodo('button', elegido ? 'boton' : 'boton boton-secundario', op[1]);
      pagar.type = 'button';
      pagar.addEventListener('click', function () { marcarPagado(m.id, op[0]); });
      caja.appendChild(pagar);
    });
  }
  var editar = Formato.nodo('button', 'boton boton-secundario', 'Editar');
  editar.type = 'button';
  editar.addEventListener('click', function () { abrirMovimiento(m); });
  var borrar = Formato.nodo('button', 'boton boton-peligro', 'Eliminar');
  borrar.type = 'button';
  borrar.addEventListener('click', function () { eliminarMovimiento(m); });
  caja.appendChild(editar);
  caja.appendChild(borrar);
  abrirPanel(caja);
}

function pagoOptimista(m, origen) {
  var copia = copiarMovimiento(m);
  var esIngreso = Dinero.norm(m.tipo) === 'ingreso';
  copia.estado = esIngreso ? 'Recibido' : 'Pagado';
  if (!esIngreso) {
    copia.pagadoDesde = origen || 'De la casa';
    var resto = String(m.notas || '').replace(/^Pagado desde: [^.]+\.?\s*/, '');
    if (Dinero.baseAhorro(origen)) {
      copia.notas = ('Pagado desde: ' + origen + (resto ? '. ' + resto : '')).trim();
    } else {
      copia.pagadoDesde = 'De la casa';
      copia.notas = resto;
    }
  }
  if (copia.montoReal === '' || copia.montoReal == null) copia.montoReal = copia.monto;
  return copia;
}

function enviarPago(id, origen) {
  var datos = { id: id };
  if (origen) datos.pagadoDesde = origen;
  return Api.pagar(datos).then(function (r) {
    if (!r.ok) return r;
    var quiereAhorro = !!Dinero.baseAhorro(origen);
    if (!quiereAhorro || Dinero.baseAhorro(Dinero.origenGasto(r.movimiento || {})) === Dinero.baseAhorro(origen)) {
      var notasBase = String((r.movimiento && r.movimiento.notas) || '');
      if (quiereAhorro || !/^Pagado desde:/i.test(notasBase)) return r;
      var limpio = notasBase.replace(/^Pagado desde: [^.]+\.?\s*/, '');
      return Api.actualizarMovimiento({
        id: id,
        estado: r.movimiento && r.movimiento.estado === 'Recibido' ? 'Recibido' : 'Pagado',
        pagadoDesde: 'De la casa',
        notas: limpio
      }).then(function (r2) {
        return r2.ok ? r2 : r;
      });
    }
    var notas = String((r.movimiento && r.movimiento.notas) || '').replace(/^Pagado desde: [^.]+\.?\s*/, '');
    var datosOrigen = {
      id: id,
      estado: 'Pagado',
      pagadoDesde: origen,
      notas: ('Pagado desde: ' + origen + (notas ? '. ' + notas : '')).trim()
    };
    return Api.actualizarMovimiento(datosOrigen).then(function (r2) {
      if (!r2.ok) {
        return {
          ok: false,
          pagoHecho: true,
          error: r2.error,
          movimiento: r.movimiento,
          datosOrigen: datosOrigen
        };
      }
      return r2;
    });
  });
}

function marcarPagado(id, origen) {
  var anterior = buscarEnMemoria(id);
  var concepto = (anterior && anterior.concepto) || 'el movimiento';
  if (anterior) {
    invalidarLectura();
    reemplazarEnMemoria(pagoOptimista(anterior, origen));
    quitarReintento(id);
    cerrarPanel();
    pintarPantallas();
  }
  enviarPago(id, origen).then(function (r) {
    if (r.ok) {
      if (r.movimiento) reemplazarEnMemoria(r.movimiento);
      quitarReintento(id);
      cerrarPanel();
      pintarPantallas();
      traerMovimientos();
      return;
    }
    if (r.pagoHecho) {
      if (r.movimiento) reemplazarEnMemoria(r.movimiento);
      agregarReintento({
        movimientoId: id,
        concepto: concepto,
        accion: 'origen',
        datos: r.datosOrigen,
        texto: 'No se guardó desde dónde salió: ' + concepto + '. Toca para intentar de nuevo.'
      });
    } else if (anterior) {
      reemplazarEnMemoria(anterior);
      agregarReintento({
        movimientoId: id,
        concepto: concepto,
        accion: 'pagar',
        datos: { id: id, pagadoDesde: origen || '' },
        texto: textoReintento(concepto)
      });
    } else {
      agregarReintento({
        movimientoId: id,
        concepto: concepto,
        accion: 'pagar',
        datos: { id: id, pagadoDesde: origen || '' },
        texto: textoReintento(concepto)
      });
    }
    cerrarPanel();
    pintarPantallas();
  });
}

function eliminarMovimiento(m) {
  if (!window.confirm('¿Eliminar «' + m.concepto + '»?')) return;
  var anterior = copiarMovimiento(buscarEnMemoria(m.id) || m);
  invalidarLectura();
  quitarDeMemoria(m.id);
  quitarReintento(m.id);
  cerrarPanel();
  pintarPantallas();
  Api.eliminarMovimiento({ id: m.id }).then(function (r) {
    if (!r.ok) {
      reemplazarEnMemoria(anterior);
      agregarReintento({
        movimientoId: m.id,
        concepto: m.concepto,
        accion: 'eliminar',
        datos: { id: m.id },
        texto: textoReintento(m.concepto)
      });
      pintarPantallas();
      return;
    }
    quitarReintento(m.id);
    traerMovimientos();
  });
}

function abrirFiltros() {
  filtrosTocados = true;
  var caja = Formato.nodo('div', 'formulario');
  caja.appendChild(Formato.nodo('h2', '', 'Filtros'));

  var mes = document.createElement('input');
  mes.type = 'month';
  mes.value = Filtros.mes && Filtros.mes !== 'sin-fecha' ? Filtros.mes : '';
  caja.appendChild(Formato.campo('Mes', mes));

  var sinFecha = document.createElement('input');
  sinFecha.type = 'checkbox';
  sinFecha.checked = Filtros.mes === 'sin-fecha';
  caja.appendChild(Formato.campo('Solo sin fecha', sinFecha));

  var corte = document.createElement('select');
  corte.appendChild(new Option('Todos los cortes', ''));
  corte.appendChild(new Option('Sin asignar', 'sin-asignar'));
  var base = mes.value || Datos.mes;
  Corte.cortesDelMes(base).forEach(function (c) {
    corte.appendChild(new Option(Formato.rango(c.inicio, c.fin), c.clave));
  });
  if (Filtros.corte) corte.value = Filtros.corte;
  mes.addEventListener('change', function () {
    var valor = corte.value;
    while (corte.options.length > 2) corte.remove(2);
    Corte.cortesDelMes(mes.value || Datos.mes).forEach(function (c) {
      corte.appendChild(new Option(Formato.rango(c.inicio, c.fin), c.clave));
    });
    corte.value = valor;
  });
  caja.appendChild(Formato.campo('Corte', corte));

  var tipo = selectSimple([
    ['', 'Ingresos y gastos'],
    ['Ingreso', 'Ingreso'],
    ['Gasto', 'Gasto']
  ], Filtros.tipo);
  caja.appendChild(Formato.campo('Tipo', tipo));

  var categoria = document.createElement('select');
  categoria.appendChild(new Option('Todas', ''));
  categoriasDe('').forEach(function (nombre) {
    categoria.appendChild(new Option(nombre, nombre));
  });
  categoria.value = Filtros.categoria;
  caja.appendChild(Formato.campo('Categoría', categoria));

  var estado = document.createElement('select');
  estado.appendChild(new Option('Pagados y recibidos', ''));
  estadosDe('').forEach(function (nombre) {
    estado.appendChild(new Option(nombre, nombre));
  });
  estado.value = Filtros.estado;
  caja.appendChild(Formato.campo('Estado', estado));

  var recurrente = selectSimple([
    ['', 'Todos'],
    ['si', 'Sí'],
    ['no', 'No']
  ], Filtros.recurrente);
  caja.appendChild(Formato.campo('Recurrente', recurrente));

  var aplicar = Formato.nodo('button', 'boton', 'Ver lista');
  aplicar.type = 'button';
  aplicar.addEventListener('click', function () {
    Filtros.mes = sinFecha.checked ? 'sin-fecha' : mes.value;
    Filtros.corte = corte.value;
    Filtros.tipo = tipo.value;
    Filtros.categoria = categoria.value;
    Filtros.estado = estado.value;
    Filtros.recurrente = recurrente.value;
    cerrarPanel();
    cargarLista();
  });
  var limpiar = Formato.nodo('button', 'boton boton-secundario', 'Quitar filtros');
  limpiar.type = 'button';
  limpiar.addEventListener('click', function () {
    Filtros = { mes: '', corte: '', tipo: '', categoria: '', estado: '', recurrente: '' };
    filtrosTocados = true;
    cerrarPanel();
    cargarLista();
  });
  caja.appendChild(aplicar);
  caja.appendChild(limpiar);
  abrirPanel(caja);
}

function selectSimple(opciones, valor) {
  var select = document.createElement('select');
  opciones.forEach(function (op) {
    select.appendChild(new Option(op[1], op[0]));
  });
  select.value = valor || '';
  return select;
}
