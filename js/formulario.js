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
    fecha: fechaDeHoy(),
    corteManual: 'No'
  });
}

function abrirMovimiento(m, reintentoViejo) {
  var caja = Formato.nodo('form', 'formulario');
  caja.appendChild(Formato.nodo('h2', '', m.id ? 'Editar' : 'Nuevo movimiento'));

  var tipo = selectCon([
    ['Gasto', 'Gasto'],
    ['Ingreso', 'Ingreso']
  ], m.tipo || 'Gasto');
  var concepto = inputTexto(m.concepto || '', 'Ej. Luz de noviembre');
  var categoria = document.createElement('select');
  var ahorroCat = document.createElement('select');
  var campoCategoria = Formato.campo('Categoría gasto', categoria);
  var etiquetaCategoria = campoCategoria.querySelector('span');
  var campoAhorro = Formato.campo('Categoría ahorro', ahorroCat);
  var monto = inputNumero(Dinero.montoVisible(m));
  var fecha = document.createElement('input');
  fecha.type = 'date';
  fecha.value = m.fecha || '';
  var estado = document.createElement('select');
  var notasViejas = String(m.notas || '').replace(/^Pagado desde: [^.]+\.?\s*/, '').trim();
  var pago = opcionesDePago();
  var valorOrigen = 'De la casa';
  pago.forEach(function (op) {
    if (Dinero.baseAhorro(op[0]) && Dinero.baseAhorro(op[0]) === Dinero.baseAhorro(Dinero.origenGasto(m))) valorOrigen = op[0];
  });
  var origen = selectCon(pago, valorOrigen);
  var campoOrigen = Formato.campo('Sale de', origen);

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
  }

  categoria.addEventListener('change', function () {
    if (categoria.value) ahorroCat.value = '';
  });
  ahorroCat.addEventListener('change', function () {
    if (ahorroCat.value) categoria.value = '';
  });
  tipo.addEventListener('change', refrescarListas);
  refrescarListas();

  caja.appendChild(Formato.campo('Tipo', tipo));
  caja.appendChild(Formato.campo('Concepto', concepto));
  if (notasViejas) caja.appendChild(Formato.nodo('p', 'meta', 'Detalle anterior: ' + notasViejas));
  caja.appendChild(Formato.campo('Monto', monto));
  caja.appendChild(Formato.campo('Fecha', fecha));
  caja.appendChild(campoCategoria);
  caja.appendChild(campoAhorro);
  caja.appendChild(Formato.campo('Estado', estado));
  caja.appendChild(campoOrigen);

  var guardar = Formato.nodo('button', 'boton', m.id ? 'Guardar' : 'Agregar');
  guardar.type = 'submit';
  caja.appendChild(guardar);
  caja.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var plan = Dinero.numero(monto.value);
    if (plan === null || plan < 0) {
      aviso('Escribe el monto. Sirve con coma o con punto.');
      return;
    }
    if (!concepto.value.trim()) {
      aviso('Escribe el concepto.');
      concepto.focus();
      return;
    }
    var anterior = m.id ? copiarMovimiento(buscarEnMemoria(m.id) || m) : null;
    var payload = {
      tipo: tipo.value,
      concepto: concepto.value.trim(),
      categoria: (tipo.value === 'Gasto' && ahorroCat.value) ? ahorroCat.value : categoria.value,
      fecha: fecha.value,
      estado: estado.value,
      pagadoDesde: tipo.value === 'Gasto' ? origen.value : ''
    };
    var montos = Dinero.montosAlGuardar(anterior, plan, estado.value);
    Object.keys(montos).forEach(function (k) { payload[k] = montos[k]; });
    if (!anterior) {
      payload.notas = '';
      payload.corteManual = 'No';
    } else {
      // Las notas viejas se quedan; solo se quita la marca de ahorro si ahora sale de la casa.
      var tieneMarca = /^Pagado desde:/i.test(String(anterior.notas || ''));
      if (tieneMarca && !Dinero.baseAhorro(payload.pagadoDesde)) payload.notas = notasViejas;
      // El corte va con la fecha; uno elegido a mano antes se respeta mientras la fecha no cambie.
      if (!esManual(anterior) || fecha.value !== (anterior.fecha || '')) payload.corteManual = 'No';
      payload.id = m.id;
    }
    var optimista = movimientoDesdePayload(payload, anterior || m);
    invalidarLectura();
    reemplazarEnMemoria(optimista);
    quitarReintento(optimista.id);
    if (reintentoViejo) {
      quitarReintento(reintentoViejo);
      quitarDeMemoria(reintentoViejo);
    }
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
          error: r.error
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
