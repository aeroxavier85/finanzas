function categoriasDe(tipo) {
  var lista = (Datos.config && Datos.config.categorias) || [];
  var wanted = Dinero.norm(tipo);
  var nombres = lista.filter(function (c) {
    return c.nombre && (!wanted || Dinero.norm(c.tipo) === wanted);
  }).map(function (c) { return c.nombre; });
  if (!wanted || wanted === 'gasto') {
    var ya = nombres.some(function (nombre) {
      return Dinero.norm(nombre) === 'diezmos y ofrendas';
    });
    if (!ya) nombres.push('Diezmos y ofrendas');
  }
  return nombres;
}

function estadosDe(tipo) {
  var lista = (Datos.config && Datos.config.estados) || [];
  var wanted = Dinero.norm(tipo);
  var nombres = lista.filter(function (e) {
    return e.nombre && (!wanted || Dinero.norm(e.tipo) === wanted);
  }).map(function (e) { return e.nombre; });
  if (nombres.length) return nombres;
  return wanted === 'ingreso'
    ? ['Esperado', 'Recibido']
    : ['Pendiente', 'Programado', 'Pagado', 'Omitido'];
}

function nuevoMovimiento() {
  abrirMovimiento({
    tipo: 'Gasto',
    estado: 'Pendiente',
    monto: '',
    fecha: '',
    corteManual: 'No'
  });
}

function abrirMovimiento(m) {
  var caja = Formato.nodo('form', 'formulario');
  caja.appendChild(Formato.nodo('h2', '', m.id ? 'Editar' : 'Nuevo movimiento'));

  var tipo = selectCon([
    ['Gasto', 'Gasto'],
    ['Ingreso', 'Ingreso']
  ], m.tipo || 'Gasto');
  var concepto = inputTexto(m.concepto || '', 'Ej. Luz');
  var categoria = document.createElement('select');
  var ahorroCat = document.createElement('select');
  var campoCategoria = Formato.campo('Categoría gasto', categoria);
  var etiquetaCategoria = campoCategoria.querySelector('span');
  var campoAhorro = Formato.campo('Categoría ahorro', ahorroCat);
  var monto = inputNumero(m.monto);
  var montoReal = inputNumero(m.montoReal);
  var fecha = document.createElement('input');
  fecha.type = 'date';
  fecha.value = m.fecha || '';
  var estado = document.createElement('select');
  var notas = inputTexto(m.notas || '', '');
  var pago = opcionesDePago();
  var valorOrigen = 'De la casa';
  pago.forEach(function (op) {
    if (Dinero.baseAhorro(op[0]) && Dinero.baseAhorro(op[0]) === Dinero.baseAhorro(Dinero.origenGasto(m))) valorOrigen = op[0];
  });
  var origen = selectCon(pago, valorOrigen);
  var campoOrigen = Formato.campo('Sale de', origen);
  var cortePreview = Formato.nodo('p', 'corte-preview', '');
  var corteManual = document.createElement('select');

  function refrescarListas() {
    var esGasto = tipo.value === 'Gasto';
    var gastoActual = categoria.value;
    var ahorroActual = ahorroCat.value;
    if (!categoria.dataset.listo) {
      if (Dinero.destinoAhorro(m)) ahorroActual = m.categoria || '';
      else gastoActual = m.categoria || '';
      categoria.dataset.listo = '1';
    }
    var actualEstado = estado.value || m.estado || '';
    Formato.vaciar(categoria);
    var cats = categoriasDe(tipo.value);
    if (esGasto) categoria.appendChild(new Option('Ninguna', ''));
    if (!cats.length && !esGasto) categoria.appendChild(new Option('Sin categorías', ''));
    cats.forEach(function (nombre) { categoria.appendChild(new Option(nombre, nombre)); });
    if (gastoActual && !Dinero.destinoAhorro({ categoria: gastoActual })) categoria.value = gastoActual;
    else if (!ahorroActual && cats.length && !m.id && !m.categoria) categoria.value = cats[0];
    Formato.vaciar(ahorroCat);
    ahorroCat.appendChild(new Option('Ninguna', ''));
    cuentasAhorro().forEach(function (cuenta) {
      var valor = 'Ahorro ' + cuenta.nombre;
      ahorroCat.appendChild(new Option(valor, valor));
    });
    if (ahorroActual) {
      var baseAhorroElegido = Dinero.baseAhorro(ahorroActual);
      for (var i = 0; i < ahorroCat.options.length; i++) {
        if (Dinero.baseAhorro(ahorroCat.options[i].value) === baseAhorroElegido) {
          ahorroCat.value = ahorroCat.options[i].value;
          break;
        }
      }
      if (ahorroCat.value) categoria.value = '';
    }
    etiquetaCategoria.textContent = esGasto ? 'Categoría gasto' : 'Categoría';
    campoAhorro.style.display = esGasto ? '' : 'none';
    if (!esGasto) ahorroCat.value = '';
    Formato.vaciar(estado);
    estadosDe(tipo.value).forEach(function (nombre) { estado.appendChild(new Option(nombre, nombre)); });
    estado.value = actualEstado || (tipo.value === 'Ingreso' ? 'Esperado' : 'Pendiente');
    campoOrigen.style.display = esGasto ? '' : 'none';
    refrescarCortes();
  }

  function refrescarCortes() {
    var elegido = corteManual.value;
    Formato.vaciar(corteManual);
    corteManual.appendChild(new Option('Calcular con la fecha', ''));
    var periodo = fecha.value ? fecha.value.slice(0, 7) : (Datos.mes || '');
    Corte.cortesDelMes(periodo).forEach(function (c) {
      var opcion = new Option(Formato.rango(c.inicio, c.fin), c.clave);
      opcion.dataset.etiqueta = c.etiqueta;
      corteManual.appendChild(opcion);
    });
    corteManual.appendChild(new Option('Sin asignar', 'sin-asignar'));
    if (elegido) corteManual.value = elegido;
    else if (esManual(m) && !fecha.dataset.tocada) {
      corteManual.value = m.corteClave || 'sin-asignar';
    }
    var auto = Corte.calcularCorte(fecha.value);
    cortePreview.textContent = corteManual.value
      ? 'Corte elegido a mano'
      : 'Corte: ' + (auto.clave ? Formato.rango(auto.inicio, auto.fin) : 'Sin asignar');
  }

  categoria.addEventListener('change', function () {
    if (categoria.value) ahorroCat.value = '';
  });
  ahorroCat.addEventListener('change', function () {
    if (ahorroCat.value) categoria.value = '';
  });
  tipo.addEventListener('change', refrescarListas);
  fecha.addEventListener('change', function () {
    fecha.dataset.tocada = '1';
    refrescarCortes();
  });
  corteManual.addEventListener('change', refrescarCortes);
  refrescarListas();

  caja.appendChild(Formato.campo('Tipo', tipo));
  caja.appendChild(Formato.campo('Concepto', concepto));
  caja.appendChild(campoCategoria);
  caja.appendChild(campoAhorro);
  caja.appendChild(Formato.campo('Monto', monto));
  caja.appendChild(Formato.campo('Monto real', montoReal));
  caja.appendChild(Formato.campo('Fecha', fecha));
  caja.appendChild(cortePreview);
  caja.appendChild(Formato.campo('Estado', estado));
  caja.appendChild(campoOrigen);
  caja.appendChild(Formato.campo('Notas', notas));
  caja.appendChild(Formato.campo('Corte', corteManual));

  var diferencia = Formato.nodo('p', 'diferencia', '');
  function pintarDiferencia() {
    var plan = Dinero.numero(monto.value);
    var real = Dinero.numero(montoReal.value);
    if (plan === null || real === null) {
      diferencia.textContent = '';
      return;
    }
    var delta = Dinero.redondear(real - plan);
    var signo = delta > 0 ? '+' : '';
    diferencia.textContent = 'Diferencia: ' + signo + Formato.moneda(delta);
  }
  monto.addEventListener('input', pintarDiferencia);
  montoReal.addEventListener('input', pintarDiferencia);
  pintarDiferencia();
  caja.appendChild(diferencia);

  var guardar = Formato.nodo('button', 'boton', m.id ? 'Guardar' : 'Agregar');
  guardar.type = 'submit';
  caja.appendChild(guardar);
  caja.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var plan = Dinero.numero(monto.value);
    var real = Dinero.numero(montoReal.value);
    if (plan === null || plan < 0) {
      aviso('Escribe el monto. Sirve con coma o con punto.');
      return;
    }
    var payload = {
      tipo: tipo.value,
      concepto: concepto.value,
      categoria: (tipo.value === 'Gasto' && ahorroCat.value) ? ahorroCat.value : categoria.value,
      monto: Dinero.redondear(plan),
      montoReal: real === null ? '' : Dinero.redondear(real),
      fecha: fecha.value,
      estado: estado.value,
      pagadoDesde: tipo.value === 'Gasto' ? origen.value : '',
      notas: notas.value
    };
    if (corteManual.value) {
      payload.corteManual = 'Sí';
      payload.corteClave = corteManual.value === 'sin-asignar' ? '' : corteManual.value;
      var opcion = corteManual.options[corteManual.selectedIndex];
      payload.corte = opcion && opcion.dataset.etiqueta ? opcion.dataset.etiqueta : (opcion ? opcion.text : '');
    } else {
      payload.corteManual = 'No';
    }
    if (m.id) payload.id = m.id;
    var anterior = m.id ? copiarMovimiento(buscarEnMemoria(m.id) || m) : null;
    var optimista = movimientoDesdePayload(payload, anterior || m);
    invalidarLectura();
    reemplazarEnMemoria(optimista);
    quitarReintento(optimista.id);
    cerrarPanel();
    pintarPantallas();
    var pedido = payload.id ? Api.actualizarMovimiento(payload) : Api.crearMovimiento(payload);
    pedido.then(function (r) {
      if (!r.ok) {
        if (anterior) reemplazarEnMemoria(anterior);
        else quitarDeMemoria(optimista.id);
        agregarReintento({
          movimientoId: optimista.id,
          concepto: payload.concepto || 'el movimiento',
          accion: payload.id ? 'actualizar' : 'crear',
          datos: payload,
          texto: textoReintento(payload.concepto)
        });
        pintarPantallas();
        return;
      }
      if (!payload.id) quitarDeMemoria(optimista.id);
      if (r.movimiento) reemplazarEnMemoria(r.movimiento);
      quitarReintento(optimista.id);
      pintarPantallas();
      traerMovimientos();
    });
  });
  abrirPanel(caja);
  concepto.focus();
}

function esManual(m) {
  return Dinero.norm(m.corteManual) === 'sí' || Dinero.norm(m.corteManual) === 'si';
}

function selectCon(opciones, valor) {
  var select = document.createElement('select');
  opciones.forEach(function (op) { select.appendChild(new Option(op[1], op[0])); });
  select.value = valor || opciones[0][0];
  return select;
}

function inputTexto(valor, placeholder) {
  var input = document.createElement('input');
  input.type = 'text';
  input.value = valor;
  input.placeholder = placeholder || '';
  input.maxLength = 160;
  return input;
}

function inputNumero(valor) {
  var input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.autocomplete = 'off';
  input.placeholder = '0,00';
  input.enterKeyHint = 'done';
  if (valor !== '' && valor !== null && valor !== undefined) input.value = valor;
  input.addEventListener('input', function () {
    var limpio = input.value.replace(/[^\d.,]/g, '');
    if (limpio === input.value) return;
    var pos = input.selectionStart;
    input.value = limpio;
    if (pos !== null) input.setSelectionRange(pos, pos);
  });
  return input;
}
