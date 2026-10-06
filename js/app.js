var Datos = {
  config: null,
  mes: '',
  pantalla: 'inicio',
  corteClave: ''
};

var Memoria = { lista: null, marca: 0 };
var reintentoEnCurso = '';

function invalidarLectura() {
  Memoria.marca += 1;
}

function copiarMovimiento(m) {
  var copia = {};
  Object.keys(m || {}).forEach(function (k) { copia[k] = m[k]; });
  return copia;
}

function buscarEnMemoria(id) {
  if (!Memoria.lista) return null;
  for (var i = 0; i < Memoria.lista.length; i++) {
    if (Memoria.lista[i].id === id) return Memoria.lista[i];
  }
  return null;
}

function reemplazarEnMemoria(m) {
  if (!Memoria.lista) Memoria.lista = [];
  for (var i = 0; i < Memoria.lista.length; i++) {
    if (Memoria.lista[i].id === m.id) {
      Memoria.lista[i] = m;
      return;
    }
  }
  Memoria.lista.push(m);
}

function quitarDeMemoria(id) {
  if (!Memoria.lista) return;
  Memoria.lista = Memoria.lista.filter(function (m) { return m.id !== id; });
}

function movimientoDesdePayload(payload, base) {
  var m = copiarMovimiento(base || {});
  Object.keys(payload).forEach(function (k) { m[k] = payload[k]; });
  if (!m.id) m.id = 'local-' + Date.now();
  if (payload.corteManual === 'Sí') {
    m.corteClave = payload.corteClave || '';
    m.corte = payload.corte || 'Sin asignar';
  } else {
    var corte = Corte.calcularCorte(payload.fecha);
    m.corteClave = corte.clave;
    m.corte = corte.etiqueta;
    m.corteManual = 'No';
  }
  return m;
}

function traerMovimientos() {
  var marca = Memoria.marca;
  return Api.movimientos({}).then(function (mov) {
    if (marca !== Memoria.marca) return mov;
    if (!mov.ok) {
      if (!Memoria.lista) pintarFalloInicio(mov.error || 'No se pudo cargar el inicio');
      return mov;
    }
    Memoria.lista = mov.movimientos || [];
    pintarInicio(Memoria.lista);
    if (Datos.pantalla === 'lista' && !hayAlgunFiltro()) pintarListaDesde(Memoria.lista);
    return mov;
  });
}

function pintarPantallas() {
  if (Memoria.lista) {
    pintarInicio(Memoria.lista);
    if (Datos.pantalla === 'lista') pintarListaDesde(Memoria.lista);
  }
  pintarReintentos();
}

function leerReintentos() {
  try {
    var datos = JSON.parse(localStorage.getItem('finanzas-reintentos') || '[]');
    return Array.isArray(datos) ? datos : [];
  } catch (e) {
    return [];
  }
}

function guardarReintentos(lista) {
  try { localStorage.setItem('finanzas-reintentos', JSON.stringify(lista)); } catch (e) {}
}

function textoReintento(concepto) {
  return 'No se guardó: ' + (concepto || 'el movimiento') + '. Toca para intentar de nuevo.';
}

function agregarReintento(item) {
  var lista = leerReintentos().filter(function (r) { return r.movimientoId !== item.movimientoId; });
  if (!item.texto) item.texto = textoReintento(item.concepto);
  lista.push(item);
  guardarReintentos(lista);
  pintarReintentos();
}

function quitarReintento(movimientoId) {
  guardarReintentos(leerReintentos().filter(function (r) { return r.movimientoId !== movimientoId; }));
  pintarReintentos();
}

function pintarReintentos() {
  var caja = document.getElementById('reintentos');
  if (!caja) return;
  Formato.vaciar(caja);
  leerReintentos().forEach(function (item) {
    var boton = Formato.nodo('button', 'reintento', item.texto || textoReintento(item.concepto));
    boton.type = 'button';
    boton.addEventListener('click', function () { reintentar(item); });
    caja.appendChild(boton);
  });
}

function reintentar(item) {
  if (reintentoEnCurso) return;
  reintentoEnCurso = item.movimientoId;
  var pedido;
  if (item.accion === 'pagar') pedido = enviarPago(item.datos.id, item.datos.pagadoDesde || '');
  else if (item.accion === 'crear') pedido = Api.crearMovimiento(item.datos);
  else if (item.accion === 'actualizar' || item.accion === 'origen') pedido = Api.actualizarMovimiento(item.datos);
  else if (item.accion === 'eliminar') pedido = Api.eliminarMovimiento(item.datos);
  else {
    reintentoEnCurso = '';
    return;
  }
  pedido.then(function (r) {
    reintentoEnCurso = '';
    if (!r || !r.ok) {
      if (r && r.pagoHecho) {
        if (r.movimiento) reemplazarEnMemoria(r.movimiento);
        item.accion = 'origen';
        item.datos = r.datosOrigen;
        item.texto = 'No se guardó desde dónde salió: ' + item.concepto + '. Toca para intentar de nuevo.';
        guardarReintentos(leerReintentos().map(function (x) {
          return x.movimientoId === item.movimientoId ? item : x;
        }));
      }
      pintarPantallas();
      return;
    }
    quitarReintento(item.movimientoId);
    if (item.accion === 'eliminar') quitarDeMemoria(item.datos.id);
    else if (item.accion === 'crear') {
      quitarDeMemoria(item.movimientoId);
      if (r.movimiento) reemplazarEnMemoria(r.movimiento);
    } else if (r.movimiento) reemplazarEnMemoria(r.movimiento);
    pintarPantallas();
    traerMovimientos();
  });
}

function arrancar() {
  aplicarTemaGuardado();
  document.getElementById('form-login').addEventListener('submit', entrar);
  cajasCodigo().forEach(function (caja, indice) {
    caja.addEventListener('keydown', function (ev) {
      if (ev.key === 'Backspace') {
        ev.preventDefault();
        if (caja.dataset.digito) {
          guardarDigito(caja, '');
          return;
        }
        if (indice > 0) {
          var anterior = cajasCodigo()[indice - 1];
          anterior.value = '';
          anterior.dataset.digito = '';
          anterior.focus();
        }
      } else if (ev.key === 'ArrowLeft' && indice > 0) {
        cajasCodigo()[indice - 1].focus();
      } else if (ev.key === 'ArrowRight' && indice < 3) {
        cajasCodigo()[indice + 1].focus();
      }
    });
    caja.addEventListener('input', function () {
      var digitos = caja.value.replace(/\*/g, '').replace(/\D/g, '');
      if (digitos.length > 1) {
        escribirCodigo(digitos, indice);
        return;
      }
      guardarDigito(caja, digitos);
      if (digitos && indice < 3) cajasCodigo()[indice + 1].focus();
    });
    caja.addEventListener('paste', function (ev) {
      var portapapeles = ev.clipboardData || window.clipboardData;
      if (!portapapeles) return;
      ev.preventDefault();
      escribirCodigo(portapapeles.getData('text'), indice);
    });
    caja.addEventListener('focus', function () { caja.select(); });
  });
  document.getElementById('salir').addEventListener('click', salir);
  document.getElementById('tema').addEventListener('click', alternarTema);
  document.getElementById('cortes').addEventListener('click', abrirCortes);
  document.getElementById('mes-antes').addEventListener('click', function () { cambiarCorte(-1); });
  document.getElementById('mes-despues').addEventListener('click', function () { cambiarCorte(1); });
  document.getElementById('abrir-filtros').addEventListener('click', abrirFiltros);
  document.getElementById('generar-antes').addEventListener('click', function () { moverGenerar(-1); });
  document.getElementById('generar-despues').addEventListener('click', function () { moverGenerar(1); });
  document.getElementById('generar').addEventListener('click', generarCorte);
  document.getElementById('mesada-antes').addEventListener('click', function () { moverMesada(-1); });
  document.getElementById('mesada-despues').addEventListener('click', function () { moverMesada(1); });
  document.getElementById('nuevo').addEventListener('click', pulsarNuevo);
  document.getElementById('cerrar-panel').addEventListener('click', cerrarPanel);
  document.querySelectorAll('.tabs button').forEach(function (boton) {
    boton.addEventListener('click', function () {
      mostrarPantalla(boton.getAttribute('data-pantalla'));
    });
  });
  registrarApp();
  Api.yo().then(function (r) {
    if (r.ok) entrarApp();
    else mostrarLogin();
  });
}

function cajasCodigo() {
  return Array.prototype.slice.call(document.querySelectorAll('#form-login .digito'));
}

function guardarDigito(caja, digito) {
  caja.dataset.digito = digito || '';
  caja.value = digito ? '*' : '';
}

function escribirCodigo(texto, desde) {
  var digitos = String(texto || '').replace(/\D/g, '').split('');
  var cajas = cajasCodigo();
  var i = desde || 0;
  digitos.forEach(function (d) {
    if (i >= cajas.length) return;
    cajas[i].dataset.digito = d;
    cajas[i].value = '*';
    i += 1;
  });
  if (cajas[Math.min(i, cajas.length - 1)]) cajas[Math.min(i, cajas.length - 1)].focus();
}

function entrar(ev) {
  ev.preventDefault();
  var clave = cajasCodigo().map(function (caja) {
    return String(caja.dataset.digito || '').replace(/\D/g, '').slice(0, 1);
  }).join('');
  var error = document.getElementById('error-login');
  error.textContent = '';
  if (!/^\d{4}$/.test(clave)) {
    error.textContent = 'El código son 4 números';
    return;
  }
  Api.login(clave).then(function (r) {
    if (!r.ok) {
      error.textContent = r.error || 'Código incorrecto';
      return;
    }
    entrarApp();
  });
}

function entrarApp() {
  document.getElementById('login').classList.add('oculto');
  document.getElementById('app').classList.remove('oculto');
  Api.config().then(function (r) {
    if (r.ok) {
      Datos.config = r.config;
      aplicarDiasDeConfig(r.config);
    } else aviso(r.error || 'No se pudo leer la configuración');
    pintarReintentos();
    return cargarInicio();
  });
}

function aplicarDiasDeConfig(config) {
  var general = (config && config.general) || {};
  Corte.fijarDias(general.corteDia1 || 10, general.corteDia2 || 25);
  if (config && config.ahorros && config.ahorros.length) fijarAhorros(config.ahorros);
  if (config && config.actividades && config.actividades.length) Mesada.usar(config.actividades);
}

function cuentasAhorro() {
  var lista = (Datos.config && Datos.config.ahorros) || [];
  if (!lista.length) {
    try {
      var local = JSON.parse(localStorage.getItem('finanzas-ahorros') || '[]');
      if (Array.isArray(local) && local.length) lista = local;
    } catch (e) {}
  }
  if (!lista.length) {
    lista = [
      { id: 'mia', nombre: 'Mia', inicio: false },
      { id: 'fabi', nombre: 'Fabi', inicio: false }
    ];
  }
  return lista.map(function (item) {
    var nombre = String(item.nombre || '').trim().replace(/^ahorros?\s+/i, '');
    return {
      id: String(item.id || nombre).trim(),
      nombre: nombre,
      inicio: item.inicio === true || Dinero.norm(item.inicio) === 'sí' || Dinero.norm(item.inicio) === 'si'
    };
  }).filter(function (item) { return item.nombre; });
}

function fijarAhorros(lista) {
  if (!Datos.config) Datos.config = {};
  Datos.config.ahorros = lista;
  try { localStorage.setItem('finanzas-ahorros', JSON.stringify(lista)); } catch (e) {}
}

function guardarCuentaAhorro(cuenta) {
  var nombre = String(cuenta.nombre || '').trim().replace(/^ahorros?\s+/i, '');
  if (!nombre) return Promise.resolve({ ok: false, error: 'Escribe el nombre del ahorro' });
  var actual = cuentasAhorro();
  var repetida = actual.some(function (item) {
    return Dinero.baseAhorro(item.nombre) === Dinero.baseAhorro(nombre) && item.id !== cuenta.id;
  });
  if (repetida) return Promise.resolve({ ok: false, error: 'Ese ahorro ya existe' });
  var id = cuenta.id || nombre.toLowerCase().replace(/\s+/g, '-');
  var siguiente = {
    id: id,
    nombre: nombre,
    inicio: !!cuenta.inicio
  };
  return Api.guardarAhorro(siguiente).then(function (r) {
    if (r.ok && r.ahorros) {
      fijarAhorros(r.ahorros);
      return r;
    }
    if ((r.error || '').indexOf('desconocida') === -1) return r;
    var lista = actual.filter(function (item) { return item.id !== id; });
    lista.push(siguiente);
    fijarAhorros(lista);
    r.local = true;
    r.error = 'Quedó en este teléfono. Falta actualizar el programa de la hoja de Google para verlo en el otro.';
    return r;
  });
}

function actividadesMesada() {
  var lista = (Datos.config && Datos.config.actividades) || [];
  if (!lista.length) {
    try {
      var local = JSON.parse(localStorage.getItem('finanzas-mesada-actividades') || '[]');
      if (Array.isArray(local) && local.length) lista = local;
    } catch (e) {}
  }
  if (lista.length) Mesada.usar(lista);
  return Mesada.actividades.slice();
}

function fijarActividades(lista) {
  if (!Datos.config) Datos.config = {};
  Datos.config.actividades = Mesada.usar(lista);
  try { localStorage.setItem('finanzas-mesada-actividades', JSON.stringify(Datos.config.actividades)); } catch (e) {}
}

function idActividad(nombre) {
  var s = Dinero.norm(nombre);
  s = s.replace(/[áà]/g, 'a').replace(/[éè]/g, 'e').replace(/[íì]/g, 'i');
  s = s.replace(/[óò]/g, 'o').replace(/[úù]/g, 'u').replace(/ñ/g, 'n');
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return s || ('act-' + Date.now());
}

function guardarActividad(datos) {
  var nombre = String(datos.nombre || '').trim();
  var valor = Dinero.numero(datos.valor);
  if (!nombre) return Promise.resolve({ ok: false, error: 'Escribe qué pueden hacer' });
  if (valor === null || valor < 0) return Promise.resolve({ ok: false, error: 'Escribe el precio. Sirve con coma o con punto.' });
  var id = datos.id || idActividad(nombre);
  var actual = actividadesMesada();
  var repetida = actual.some(function (item) {
    return Dinero.norm(item.nombre) === Dinero.norm(nombre) && item.id !== id;
  });
  if (repetida) return Promise.resolve({ ok: false, error: 'Esa actividad ya está' });
  var siguiente = { id: id, nombre: nombre, valor: Dinero.redondear(valor) };
  return Api.guardarActividad(siguiente).then(function (r) {
    if (r.ok && r.actividades) {
      fijarActividades(r.actividades);
      return r;
    }
    if ((r.error || '').indexOf('desconocida') === -1) return r;
    var lista = actual.filter(function (item) { return item.id !== id; });
    lista.push(siguiente);
    fijarActividades(lista);
    r.local = true;
    r.error = 'Quedó en este teléfono. Falta actualizar el programa de la hoja de Google para verlo en el otro.';
    return r;
  });
}

function abrirCortes() {
  var dias = Corte.diasActuales();
  var caja = Formato.nodo('form', 'formulario');
  caja.appendChild(Formato.nodo('h2', '', 'Configuración'));
  caja.appendChild(Formato.nodo('p', 'ayuda', 'Estos dos días se guardan en Configuración, aparte de los gastos. La pantalla agrupa cada movimiento por su fecha.'));
  var dia1 = document.createElement('input');
  dia1.type = 'number';
  dia1.min = '1';
  dia1.max = '28';
  dia1.inputMode = 'numeric';
  dia1.value = String(dias[0]);
  var dia2 = document.createElement('input');
  dia2.type = 'number';
  dia2.min = '1';
  dia2.max = '28';
  dia2.inputMode = 'numeric';
  dia2.value = String(dias[1]);
  var preview = Formato.nodo('p', 'corte-preview', Corte.describir(dias[0], dias[1]));
  var error = Formato.nodo('p', 'error', '');
  function refrescar() {
    preview.textContent = Corte.describir(dia1.value, dia2.value) || 'Elige dos días distintos, del 1 al 28.';
  }
  dia1.addEventListener('input', refrescar);
  dia2.addEventListener('input', refrescar);
  caja.appendChild(Formato.campo('Primer corte empieza el día', dia1));
  caja.appendChild(Formato.campo('Segundo corte empieza el día', dia2));
  caja.appendChild(preview);
  caja.appendChild(Formato.nodo('p', 'ayuda', 'Si un gasto lo pusiste en un corte a mano, ese se queda ahí.'));
  caja.appendChild(Formato.nodo('h2', '', 'Ahorros'));
  caja.appendChild(Formato.nodo('p', 'ayuda', 'Solo estas cuentas pueden verse en Inicio. Al pagar eliges si sale de la casa o de una de ellas.'));
  var listaAhorros = Formato.nodo('div', 'lista-ahorros');
  var errorAhorro = Formato.nodo('p', 'error', '');
  function pintarListaAhorros() {
    Formato.vaciar(listaAhorros);
    cuentasAhorro().forEach(function (cuenta) {
      var fila = Formato.nodo('label', 'ahorro-fila');
      var check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = !!cuenta.inicio;
      check.addEventListener('change', function () {
        errorAhorro.textContent = '';
        guardarCuentaAhorro({ id: cuenta.id, nombre: cuenta.nombre, inicio: check.checked }).then(function (r) {
          if (r && r.error) errorAhorro.textContent = r.error;
          pintarListaAhorros();
          pintarPantallas();
        });
      });
      fila.appendChild(check);
      fila.appendChild(Formato.nodo('span', '', 'Ahorro ' + cuenta.nombre));
      fila.appendChild(Formato.nodo('span', 'meta', 'Ver en inicio'));
      listaAhorros.appendChild(fila);
    });
  }
  pintarListaAhorros();
  var nombreAhorro = document.createElement('input');
  nombreAhorro.type = 'text';
  nombreAhorro.placeholder = 'Viaje, emergencia';
  var agregar = Formato.nodo('button', 'boton boton-secundario', 'Agregar ahorro');
  agregar.type = 'button';
  agregar.addEventListener('click', function () {
    errorAhorro.textContent = '';
    guardarCuentaAhorro({ nombre: nombreAhorro.value, inicio: true }).then(function (r) {
      if (r && (r.ok || r.local)) nombreAhorro.value = '';
      if (r && r.error) errorAhorro.textContent = r.error;
      pintarListaAhorros();
      pintarPantallas();
    });
  });
  caja.appendChild(listaAhorros);
  caja.appendChild(Formato.campo('Nuevo ahorro', nombreAhorro));
  caja.appendChild(agregar);
  caja.appendChild(errorAhorro);
  caja.appendChild(Formato.nodo('h2', '', 'Mesada'));
  caja.appendChild(Formato.nodo('p', 'ayuda', 'Estas salen en la pestaña Mesada. Si cambias el precio, lo nuevo vale para las próximas. Lo ya marcado se queda con el precio de ese día.'));
  var listaActividades = Formato.nodo('div', 'mesada-config');
  var errorActividad = Formato.nodo('p', 'error', '');
  function pintarActividades() {
    Formato.vaciar(listaActividades);
    actividadesMesada().forEach(function (actividad) {
      var fila = Formato.nodo('div', 'mesada-config-fila');
      var nombre = document.createElement('input');
      nombre.type = 'text';
      nombre.className = 'nombre';
      nombre.value = actividad.nombre;
      var precio = document.createElement('input');
      precio.type = 'text';
      precio.className = 'precio';
      precio.inputMode = 'decimal';
      precio.value = String(actividad.valor).replace('.', ',');
      var actualizar = Formato.nodo('button', 'boton boton-secundario', 'Actualizar');
      actualizar.type = 'button';
      actualizar.addEventListener('click', function () {
        errorActividad.textContent = '';
        guardarActividad({ id: actividad.id, nombre: nombre.value, valor: precio.value }).then(function (r) {
          if (r && r.error) errorActividad.textContent = r.error;
          pintarActividades();
          if (Datos.pantalla === 'mesada') pintarMesada();
        });
      });
      fila.appendChild(nombre);
      fila.appendChild(precio);
      fila.appendChild(actualizar);
      listaActividades.appendChild(fila);
    });
  }
  pintarActividades();
  var nombreNueva = document.createElement('input');
  nombreNueva.type = 'text';
  nombreNueva.className = 'nombre';
  nombreNueva.placeholder = 'Barrer, tender la cama';
  var precioNuevo = document.createElement('input');
  precioNuevo.type = 'text';
  precioNuevo.className = 'precio';
  precioNuevo.inputMode = 'decimal';
  precioNuevo.placeholder = '1,50';
  var agregarActividad = Formato.nodo('button', 'boton boton-secundario', 'Agregar');
  agregarActividad.type = 'button';
  agregarActividad.addEventListener('click', function () {
    errorActividad.textContent = '';
    guardarActividad({ nombre: nombreNueva.value, valor: precioNuevo.value }).then(function (r) {
      if (r && (r.ok || r.local)) {
        nombreNueva.value = '';
        precioNuevo.value = '';
      }
      if (r && r.error) errorActividad.textContent = r.error;
      pintarActividades();
      if (Datos.pantalla === 'mesada') pintarMesada();
    });
  });
  var filaNueva = Formato.nodo('div', 'mesada-config-fila');
  filaNueva.appendChild(nombreNueva);
  filaNueva.appendChild(precioNuevo);
  filaNueva.appendChild(agregarActividad);
  caja.appendChild(listaActividades);
  caja.appendChild(filaNueva);
  caja.appendChild(errorActividad);
  var guardar = Formato.nodo('button', 'boton', 'Guardar');
  guardar.type = 'submit';
  caja.appendChild(guardar);
  caja.appendChild(error);
  caja.addEventListener('submit', function (ev) {
    ev.preventDefault();
    error.textContent = '';
    var a = Corte.diaValido(dia1.value);
    var b = Corte.diaValido(dia2.value);
    if (a === null || b === null) {
      error.textContent = 'Elige un día del 1 al 28.';
      return;
    }
    if (a === b) {
      error.textContent = 'Los dos cortes tienen que empezar en días distintos.';
      return;
    }
    guardar.disabled = true;
    Api.guardarCortes({ dia1: a, dia2: b }).then(function (r) {
      guardar.disabled = false;
      if (!r.ok) {
        var msg = r.error || 'No se guardó';
        if (msg.indexOf('desconocida') !== -1) {
          msg = 'No se guardó. Falta actualizar el programa de la hoja de Google.';
        }
        error.textContent = msg;
        return;
      }
      var nuevos = r.dias || Corte.fijarDias(a, b);
      Corte.fijarDias(nuevos[0], nuevos[1]);
      if (!Datos.config) Datos.config = {};
      if (!Datos.config.general) Datos.config.general = {};
      Datos.config.general.corteDia1 = String(nuevos[0]);
      Datos.config.general.corteDia2 = String(nuevos[1]);
      if (r.config) Datos.config = r.config;
      Datos.corteClave = '';
      cerrarPanel();
      pintarPantallas();
    });
  });
  abrirPanel(caja);
  dia1.focus();
}

function salir() {
  Api.logout().then(function () {
    document.getElementById('app').classList.add('oculto');
    mostrarLogin();
  });
}

function mostrarLogin() {
  document.getElementById('login').classList.remove('oculto');
  cajasCodigo().forEach(function (caja) {
    caja.value = '';
    caja.dataset.digito = '';
  });
}

function mostrarPantalla(nombre) {
  Datos.pantalla = nombre;
  ['inicio', 'basicos', 'lista', 'recurrentes', 'mesada'].forEach(function (id) {
    document.getElementById('pantalla-' + id).classList.toggle('oculto', id !== nombre);
  });
  document.querySelectorAll('.tabs button').forEach(function (boton) {
    boton.classList.toggle('activa', boton.getAttribute('data-pantalla') === nombre);
  });
  document.getElementById('nuevo').classList.toggle('oculto', nombre === 'mesada');
  if (nombre === 'inicio') cargarInicio();
  if (nombre === 'lista') cargarLista();
  if (nombre === 'recurrentes') cargarRecurrentes();
  if (nombre === 'mesada') cargarMesada();
}

function cambiarCorte(delta) {
  var base = Datos.corteClave || Corte.calcularCorte(fechaDeHoy()).clave;
  Datos.corteClave = Corte.moverCorte(base, delta);
  cargarInicio();
}

function pulsarNuevo() {
  if (Datos.pantalla === 'recurrentes') nuevoRecurrente();
  else nuevoMovimiento();
}

function abrirPanel(contenido) {
  var panel = document.getElementById('panel');
  var cuerpo = document.getElementById('panel-cuerpo');
  Formato.vaciar(cuerpo);
  cuerpo.appendChild(contenido);
  panel.classList.remove('oculto');
  document.body.classList.add('con-panel');
}

function cerrarPanel() {
  document.getElementById('panel').classList.add('oculto');
  document.body.classList.remove('con-panel');
}

function despuesDeGuardar() {
  var trabajos = [cargarInicio()];
  if (Datos.pantalla === 'lista' || document.getElementById('lista').childNodes.length) trabajos.push(cargarLista());
  if (Datos.pantalla === 'recurrentes') trabajos.push(cargarRecurrentes());
  return Promise.all(trabajos);
}

function aviso(texto) {
  var n = document.getElementById('aviso');
  n.textContent = texto;
  n.classList.remove('oculto');
  clearTimeout(aviso._t);
  aviso._t = setTimeout(function () { n.classList.add('oculto'); }, 6000);
}

function aplicarTemaGuardado() {
  var tema = '';
  try { tema = localStorage.getItem('tema') || ''; } catch (e) { tema = ''; }
  if (tema) document.documentElement.setAttribute('data-tema', tema);
  pintarThemeColor();
}

function alternarTema() {
  var actual = document.documentElement.getAttribute('data-tema');
  var oscuro = actual
    ? actual === 'oscuro'
    : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-tema', oscuro ? 'claro' : 'oscuro');
  try { localStorage.setItem('tema', oscuro ? 'claro' : 'oscuro'); } catch (e) { /* el tema sigue en esta visita */ }
  pintarThemeColor();
}

function pintarThemeColor() {
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  var oscuro = document.documentElement.getAttribute('data-tema') === 'oscuro';
  if (!document.documentElement.getAttribute('data-tema') && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    oscuro = true;
  }
  meta.setAttribute('content', oscuro ? '#121816' : '#1b3a4b');
}

function registrarApp() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  });
}

document.addEventListener('DOMContentLoaded', arrancar);
