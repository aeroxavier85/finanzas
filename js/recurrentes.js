var corteGenerar = '';

function corteParaGenerar() {
  if (!corteGenerar) {
    var hoy = Corte.calcularCorte(fechaDeHoy());
    corteGenerar = Corte.moverCorte(hoy.clave, 1) || hoy.clave;
  }
  return Corte.calcularCorte(corteGenerar);
}

function pintarCorteGenerar() {
  var corte = corteParaGenerar();
  var etiqueta = document.getElementById('corte-generar');
  if (!etiqueta) return;
  etiqueta.textContent = corte.inicio ? Formato.rango(corte.inicio, corte.fin) : '—';
}

function moverGenerar(delta) {
  var corte = corteParaGenerar();
  corteGenerar = Corte.moverCorte(corte.clave, delta) || corte.clave;
  pintarCorteGenerar();
}

function cargarRecurrentes() {
  pintarCorteGenerar();
  return Api.recurrentes().then(function (r) {
    var lista = document.getElementById('lista-recurrentes');
    Formato.vaciar(lista);
    if (!r.ok) {
      lista.appendChild(Formato.nodo('p', 'vacio', r.error || 'No se pudieron cargar las plantillas'));
      return;
    }
    var filas = r.recurrentes || [];
    if (!filas.length) {
      lista.appendChild(Formato.nodo('p', 'vacio', 'Todavía no hay plantillas. El + agrega internet, luz, colegio…'));
      return;
    }
    filas.forEach(function (item) {
      var boton = Formato.nodo('button', 'tarjeta');
      boton.type = 'button';
      var cabeza = Formato.nodo('div', 'tarjeta-cabeza');
      cabeza.appendChild(Formato.nodo('span', 'concepto', item.concepto));
      cabeza.appendChild(Formato.nodo('strong', 'monto', Formato.moneda(item.monto || 0)));
      boton.appendChild(cabeza);
      var dia = item.dia === '' || item.dia === null || item.dia === undefined ? 'Sin día' : 'Día ' + item.dia;
      var activo = Dinero.norm(item.activo) === 'no' ? 'Inactiva' : 'Activa';
      boton.appendChild(Formato.nodo('p', 'meta', dia + ' · ' + (item.categoria || item.tipo) + ' · ' + activo));
      boton.addEventListener('click', function () { abrirRecurrente(item); });
      lista.appendChild(boton);
    });
  });
}

function generarCorte() {
  var corte = corteParaGenerar();
  if (!corte.clave) {
    aviso('Elige el corte');
    return;
  }
  var boton = document.getElementById('generar');
  boton.disabled = true;
  Api.generar({ corte: corte.clave }).then(function (r) {
    boton.disabled = false;
    if (!r.ok) {
      var msg = r.error || 'No se pudo generar';
      if (msg.indexOf('Elige un mes') !== -1 || msg.indexOf('desconocida') !== -1) {
        msg = 'No se generó. Falta actualizar el programa de la hoja de Google.';
      }
      aviso(msg);
      return;
    }
    if (!r.creados) aviso('Ese corte ya estaba generado');
    else aviso('Se agregaron ' + r.creados + ' movimientos');
    despuesDeGuardar();
  });
}

function nuevoRecurrente() {
  abrirRecurrente({
    tipo: 'Gasto',
    activo: 'Sí',
    monto: '',
    dia: ''
  });
}

function abrirRecurrente(item) {
  var caja = Formato.nodo('form', 'formulario');
  caja.appendChild(Formato.nodo('h2', '', item.id ? 'Editar plantilla' : 'Nueva plantilla'));
  var tipo = selectCon([['Gasto', 'Gasto'], ['Ingreso', 'Ingreso']], item.tipo || 'Gasto');
  var concepto = inputTexto(item.concepto || '', 'Ej. Internet');
  var categoria = document.createElement('select');
  var monto = inputNumero(item.monto);
  var dia = document.createElement('input');
  dia.type = 'number';
  dia.min = '1';
  dia.max = '31';
  dia.inputMode = 'numeric';
  dia.placeholder = 'Vacío si no se sabe';
  if (item.dia !== '' && item.dia !== null && item.dia !== undefined) dia.value = item.dia;
  var activo = selectCon([['Sí', 'Sí'], ['No', 'No']], item.activo || 'Sí');
  var notas = inputTexto(item.notas || '', '');

  function refrescar() {
    var actual = categoria.value || item.categoria || '';
    Formato.vaciar(categoria);
    categoriasDe(tipo.value).forEach(function (nombre) {
      categoria.appendChild(new Option(nombre, nombre));
    });
    if (actual) categoria.value = actual;
  }
  tipo.addEventListener('change', refrescar);
  refrescar();

  caja.appendChild(Formato.campo('Tipo', tipo));
  caja.appendChild(Formato.campo('Concepto', concepto));
  caja.appendChild(Formato.campo('Categoría', categoria));
  caja.appendChild(Formato.campo('Monto habitual', monto));
  caja.appendChild(Formato.campo('Día del mes', dia));
  caja.appendChild(Formato.campo('Activa', activo));
  caja.appendChild(Formato.campo('Notas', notas));
  caja.appendChild(Formato.nodo('p', 'ayuda', 'Esto no es el pago del mes. Si un mes cambia el valor, se cambia en el movimiento, no aquí.'));

  var guardar = Formato.nodo('button', 'boton', item.id ? 'Guardar plantilla' : 'Crear plantilla');
  guardar.type = 'submit';
  caja.appendChild(guardar);
  if (item.id) {
    var borrar = Formato.nodo('button', 'boton boton-peligro', 'Eliminar plantilla');
    borrar.type = 'button';
    borrar.addEventListener('click', function () {
      if (!window.confirm('¿Eliminar la plantilla «' + item.concepto + '»? Los meses ya generados se quedan.')) return;
      Api.eliminarRecurrente({ id: item.id }).then(function (r) {
        if (!r.ok) {
          aviso(r.error || 'No se pudo eliminar');
          return;
        }
        cerrarPanel();
        aviso('Plantilla eliminada');
        despuesDeGuardar();
      });
    });
    caja.appendChild(borrar);
  }

  caja.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var habitual = Dinero.numero(monto.value);
    if (habitual === null || habitual < 0) {
      aviso('Escribe el monto. Sirve con coma o con punto.');
      return;
    }
    var payload = {
      tipo: tipo.value,
      concepto: concepto.value,
      categoria: categoria.value,
      monto: Dinero.redondear(habitual),
      dia: dia.value,
      activo: activo.value,
      notas: notas.value
    };
    if (item.id) payload.id = item.id;
    guardar.disabled = true;
    Api.guardarRecurrente(payload).then(function (r) {
      guardar.disabled = false;
      if (!r.ok) {
        aviso(r.error || 'No se pudo guardar');
        return;
      }
      cerrarPanel();
      aviso('Plantilla guardada');
      despuesDeGuardar();
    });
  });
  abrirPanel(caja);
  concepto.focus();
}
