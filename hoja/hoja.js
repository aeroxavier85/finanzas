var COLUMNAS_MOV = {
  id: 'ID',
  fecha: 'Fecha',
  tipo: 'Tipo',
  concepto: 'Concepto',
  categoria: 'Categoría',
  monto: 'Monto',
  montoReal: 'Monto Real',
  estado: 'Estado',
  corte: 'Corte',
  corteClave: 'Corte Clave',
  corteManual: 'Corte Manual',
  recurrente: 'Recurrente',
  idRecurrente: 'ID Recurrente',
  periodo: 'Periodo',
  fechaPago: 'Fecha de Pago',
  persona: 'Persona',
  notas: 'Notas',
  pagadoDesde: 'Pagado desde'
};

var COLUMNAS_REC = {
  id: 'ID',
  tipo: 'Tipo',
  concepto: 'Concepto',
  categoria: 'Categoría',
  monto: 'Monto Habitual',
  dia: 'Día',
  persona: 'Persona',
  activo: 'Activo',
  notas: 'Notas'
};

function doGet() {
  return responder({ ok: true, mensaje: 'Finanzas listo' });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responder({ ok: false, error: 'Pedido vacío' });
    }
    var body = JSON.parse(e.postData.contents);
    if (String(body.clave || '') !== String(CLAVE_FAMILIA)) {
      return responder({ ok: false, error: 'Clave incorrecta' });
    }
    var datos = body.datos || {};
    var resultado = ejecutar(body.accion, datos);
    return responder(resultado);
  } catch (err) {
    return responder({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function ejecutar(accion, datos) {
  if (accion === 'movimiento-crear' || accion === 'movimiento-actualizar' || accion === 'generar') {
    aplicarDiasGuardados();
  }
  if (accion === 'dashboard') return accionDashboard(datos);
  if (accion === 'movimientos') return accionMovimientos(datos);
  if (accion === 'movimiento-crear') return conLock(function () { return accionCrear(datos); });
  if (accion === 'movimiento-actualizar') return conLock(function () { return accionActualizar(datos); });
  if (accion === 'movimiento-eliminar') return conLock(function () { return accionEliminar(datos); });
  if (accion === 'movimiento-pagar') return conLock(function () { return accionPagar(datos); });
  if (accion === 'recurrentes') return { ok: true, recurrentes: leerRecurrentes() };
  if (accion === 'recurrente-guardar') return conLock(function () { return accionGuardarRecurrente(datos); });
  if (accion === 'recurrente-eliminar') return conLock(function () { return accionEliminarRecurrente(datos); });
  if (accion === 'generar') return conLock(function () { return accionGenerar(datos); });
  if (accion === 'config') return { ok: true, config: leerConfig() };
  if (accion === 'config-cortes') return conLock(function () { return accionGuardarCortes(datos); });
  if (accion === 'config-ahorro') return conLock(function () { return accionGuardarAhorro(datos); });
  return { ok: false, error: 'Acción desconocida' };
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function conLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function hoyISO() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function esSi(v) {
  var s = Dinero.norm(v);
  return s === 'sí' || s === 'si' || s === 'yes' || s === '1' || s === 'true';
}

function estaActivo(v) {
  if (v === '' || v === null || v === undefined) return true;
  return esSi(v);
}

function tipoCanonico(v) {
  return Dinero.norm(v) === 'ingreso' ? 'Ingreso' : 'Gasto';
}

function estadoPorDefecto(tipo) {
  return tipo === 'Ingreso' ? 'Esperado' : 'Pendiente';
}

function estadoValido(tipo, estado) {
  var e = Dinero.norm(estado);
  if (tipo === 'Ingreso') {
    if (e === 'esperado') return 'Esperado';
    if (e === 'recibido') return 'Recibido';
    return '';
  }
  if (e === 'pendiente') return 'Pendiente';
  if (e === 'programado') return 'Programado';
  if (e === 'pagado') return 'Pagado';
  if (e === 'omitido') return 'Omitido';
  return '';
}

function textoCelda(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v).trim();
}

function fechaHoja(iso) {
  if (!iso) return '';
  var p = String(iso).split('-');
  if (p.length < 3) return '';
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
}

function nuevoId(prefijo) {
  return prefijo + '-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8).toUpperCase();
}

function hojaPorNombre(nombre) {
  var sh = SpreadsheetApp.getActive().getSheetByName(nombre);
  if (!sh) throw new Error('No está la pestaña ' + nombre);
  return sh;
}

function leerTabla(nombre) {
  var sh = hojaPorNombre(nombre);
  if (nombre === 'Movimientos') asegurarColumna(sh, 'Pagado desde');
  var ultima = sh.getLastRow();
  var anchos = sh.getLastColumn();
  if (ultima < 1 || anchos < 1) return { sheet: sh, headers: [], filas: [] };
  var valores = sh.getRange(1, 1, ultima, anchos).getValues();
  var headers = valores[0].map(function (h) { return String(h || '').trim(); });
  var filas = [];
  for (var i = 1; i < valores.length; i++) {
    var obj = { _fila: i + 1 };
    var vacia = true;
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      obj[headers[c]] = valores[i][c];
      if (valores[i][c] !== '' && valores[i][c] !== null) vacia = false;
    }
    if (!vacia) filas.push(obj);
  }
  return { sheet: sh, headers: headers, filas: filas };
}

function asegurarColumna(sheet, nombre) {
  var ultima = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, ultima).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i] || '').trim() === nombre) return i + 1;
  }
  var col = sheet.getLastColumn() + 1;
  sheet.getRange(1, col).setValue(nombre);
  return col;
}

function indiceColumna(tabla, nombre) {
  var headers = tabla.headers;
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] === nombre) return i + 1;
  }
  var col = asegurarColumna(tabla.sheet, nombre);
  while (headers.length < col) headers.push('');
  headers[col - 1] = nombre;
  return col;
}

function movimientoDesde(fila) {
  return {
    id: textoCelda(fila['ID']),
    fecha: textoCelda(fila['Fecha']),
    tipo: textoCelda(fila['Tipo']),
    concepto: textoCelda(fila['Concepto']),
    categoria: textoCelda(fila['Categoría']),
    monto: Dinero.numero(fila['Monto']),
    montoReal: Dinero.numero(fila['Monto Real']),
    estado: textoCelda(fila['Estado']),
    corte: textoCelda(fila['Corte']),
    corteClave: textoCelda(fila['Corte Clave']),
    corteManual: textoCelda(fila['Corte Manual']) || 'No',
    recurrente: textoCelda(fila['Recurrente']) || 'No',
    idRecurrente: textoCelda(fila['ID Recurrente']),
    periodo: periodoNormalizado(fila['Periodo']),
    fechaPago: textoCelda(fila['Fecha de Pago']),
    persona: textoCelda(fila['Persona']),
    notas: textoCelda(fila['Notas']),
    pagadoDesde: textoCelda(fila['Pagado desde']),
    _fila: fila._fila
  };
}

function recurrenteDesde(fila) {
  var dia = fila['Día'];
  return {
    id: textoCelda(fila['ID']),
    tipo: textoCelda(fila['Tipo']) || 'Gasto',
    concepto: textoCelda(fila['Concepto']),
    categoria: textoCelda(fila['Categoría']),
    monto: Dinero.numero(fila['Monto Habitual']),
    dia: dia === '' || dia === null || dia === undefined ? '' : Number(dia),
    persona: textoCelda(fila['Persona']),
    activo: estaActivo(fila['Activo']) ? 'Sí' : 'No',
    notas: textoCelda(fila['Notas']),
    _fila: fila._fila
  };
}

function leerMovimientos() {
  return leerTabla('Movimientos').filas.map(movimientoDesde).filter(function (m) {
    return m.id || m.concepto;
  });
}

function leerRecurrentes() {
  return leerTabla('Recurrentes').filas.map(recurrenteDesde).filter(function (r) {
    return r.id || r.concepto;
  });
}

function periodoNormalizado(v) {
  var t = textoCelda(v);
  var coincidencia = t.match(/^(\d{4})-(\d{2})/);
  if (!coincidencia) return t;
  return coincidencia[1] + '-' + coincidencia[2];
}

function valorColumna(clave, mov) {
  if (clave === 'fecha' || clave === 'fechaPago') return fechaHoja(mov[clave]);
  if (clave === 'monto' || clave === 'montoReal') {
    if (mov[clave] === '' || mov[clave] === null || mov[clave] === undefined) return '';
    return Dinero.redondear(Number(mov[clave]));
  }
  if (clave === 'dia') {
    if (mov.dia === '' || mov.dia === null || mov.dia === undefined) return '';
    return Number(mov.dia);
  }
  if (clave === 'periodo') return periodoNormalizado(mov.periodo);
  return mov[clave] === null || mov[clave] === undefined ? '' : mov[clave];
}

function escribirObjeto(nombreHoja, columnas, obj) {
  var tabla = leerTabla(nombreHoja);
  var fila = obj._fila;
  if (!fila) {
    var colId = indiceColumna(tabla, columnas.id);
    var ultima = Math.max(tabla.sheet.getLastRow(), 1);
    var alto = Math.max(ultima - 1, 1);
    var ids = tabla.sheet.getRange(2, colId, alto, 1).getValues();
    fila = ultima + 1;
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0] || '').trim() === '') {
        fila = i + 2;
        break;
      }
    }
  }
  if (fila > tabla.sheet.getMaxRows()) tabla.sheet.insertRowsAfter(tabla.sheet.getMaxRows(), 1);
  var claves = Object.keys(columnas);
  for (var c = 0; c < claves.length; c++) {
    var columna = indiceColumna(tabla, columnas[claves[c]]);
    var celda = tabla.sheet.getRange(fila, columna);
    if (claves[c] === 'periodo') celda.setNumberFormat('@');
    celda.setValue(valorColumna(claves[c], obj));
  }
  obj._fila = fila;
  return obj;
}

function borrarPorId(nombreHoja, id) {
  var tabla = leerTabla(nombreHoja);
  for (var i = 0; i < tabla.filas.length; i++) {
    if (textoCelda(tabla.filas[i]['ID']) === id) {
      tabla.sheet.deleteRow(tabla.filas[i]._fila);
      return true;
    }
  }
  return false;
}

function aplicarCorte(m, datos) {
  if (datos && esSi(datos.corteManual)) {
    m.corteManual = 'Sí';
    if (!datos.corteClave) {
      m.corte = 'Sin asignar';
      m.corteClave = '';
    } else {
      m.corteClave = String(datos.corteClave);
      m.corte = datos.corte || datos.corteClave;
    }
    return;
  }
  m.corteManual = 'No';
  var corte = Corte.calcularCorte(m.fecha);
  m.corte = corte.etiqueta;
  m.corteClave = corte.clave;
}

function validarMovimiento(datos, base) {
  var m = base || {};
  var tipo = tipoCanonico(datos.tipo || m.tipo);
  var concepto = String(datos.concepto !== undefined ? datos.concepto : (m.concepto || '')).trim();
  if (!concepto) throw new Error('Escribe el concepto');
  var monto = datos.monto !== undefined ? Dinero.numero(datos.monto) : Dinero.numero(m.monto);
  if (monto === null || monto < 0) throw new Error('Escribe el monto');
  var estado = estadoValido(tipo, datos.estado !== undefined ? datos.estado : m.estado);
  if (!estado) estado = estadoPorDefecto(tipo);
  var fecha = datos.fecha !== undefined ? textoCelda(datos.fecha) : (m.fecha || '');
  if (fecha && !Corte.periodoDe(fecha)) throw new Error('La fecha no es válida');
  var montoReal = datos.montoReal !== undefined ? Dinero.numero(datos.montoReal) : m.montoReal;
  return {
    id: m.id || '',
    fecha: fecha,
    tipo: tipo,
    concepto: concepto,
    categoria: String(datos.categoria !== undefined ? datos.categoria : (m.categoria || '')).trim(),
    monto: Dinero.redondear(monto),
    montoReal: montoReal === null || montoReal === undefined ? '' : Dinero.redondear(montoReal),
    estado: estado,
    corte: m.corte || '',
    corteClave: m.corteClave || '',
    corteManual: m.corteManual || 'No',
    recurrente: m.recurrente || 'No',
    idRecurrente: m.idRecurrente || '',
    periodo: m.periodo || '',
    fechaPago: m.fechaPago || '',
    persona: String(datos.persona !== undefined ? datos.persona : (m.persona || 'Familia')).trim() || 'Familia',
    notas: String(datos.notas !== undefined ? datos.notas : (m.notas || '')).trim(),
    pagadoDesde: tipo === 'Gasto'
      ? origenCanonico(datos.pagadoDesde !== undefined ? datos.pagadoDesde : m.pagadoDesde)
      : '',
    _fila: m._fila
  };
}

function origenCanonico(v) {
  var o = Dinero.norm(v);
  if (!o || o === 'presupuesto familiar' || o === 'de la casa' || o === 'casa' || o === 'la casa') return 'De la casa';
  if (o === 'ahorros mia' || o === 'ahorro mia' || o === 'mia') return 'Ahorros Mia';
  if (o === 'ahorros fabi' || o === 'ahorro fabi' || o === 'fabi' || o === 'fabiana' || o === 'ahorros fabiana' || o === 'ahorro fabiana') return 'Ahorros Fabi';
  var limpio = String(v || '').trim().replace(/^ahorros?\s+/i, '');
  if (!limpio) return 'De la casa';
  return 'Ahorro ' + limpio;
}

function publicar(m) {
  var copia = {};
  Object.keys(m).forEach(function (k) {
    if (k !== '_fila') copia[k] = m[k];
  });
  if (copia.montoReal === null) copia.montoReal = '';
  return copia;
}

function accionDashboard(datos) {
  var hoy = hoyISO();
  var mes = (datos && datos.mes) || Corte.periodoDe(hoy);
  var todos = leerMovimientos();
  var delMes = todos.filter(function (m) {
    return m.fecha && m.fecha.slice(0, 7) === mes && Dinero.norm(m.estado) !== 'omitido';
  });
  var corteHoy = Corte.calcularCorte(hoy);
  var delCorte = todos.filter(function (m) {
    return corteHoy.clave && m.corteClave === corteHoy.clave && Dinero.norm(m.estado) !== 'omitido';
  });
  var pendientes = delCorte.filter(function (m) {
    var estado = Dinero.norm(m.estado);
    return Dinero.norm(m.tipo) === 'gasto' && (estado === 'pendiente' || estado === 'programado');
  }).sort(function (a, b) {
    return String(a.fecha || '9999').localeCompare(String(b.fecha || '9999'));
  });
  return {
    ok: true,
    hoy: hoy,
    mes: Object.assign({ periodo: mes, etiqueta: Corte.etiquetaMes(mes) }, Dinero.resumir(delMes)),
    corte: Object.assign({}, corteHoy, Dinero.resumir(delCorte)),
    pendientes: pendientes.map(publicar)
  };
}

function pasaFiltro(m, f) {
  f = f || {};
  if (f.mes === 'sin-fecha') {
    if (m.fecha) return false;
  } else if (f.mes && (!m.fecha || m.fecha.slice(0, 7) !== f.mes)) {
    return false;
  }
  if (f.corte === 'sin-asignar') {
    if (m.corteClave) return false;
  } else if (f.corte && m.corteClave !== f.corte) {
    return false;
  }
  if (f.tipo && Dinero.norm(m.tipo) !== Dinero.norm(f.tipo)) return false;
  if (f.categoria && Dinero.norm(m.categoria) !== Dinero.norm(f.categoria)) return false;
  if (f.estado && Dinero.norm(m.estado) !== Dinero.norm(f.estado)) return false;
  if (f.persona && Dinero.norm(m.persona) !== Dinero.norm(f.persona)) return false;
  if (f.recurrente === 'si' && !esSi(m.recurrente)) return false;
  if (f.recurrente === 'no' && esSi(m.recurrente)) return false;
  return true;
}

function accionMovimientos(datos) {
  var lista = leerMovimientos().filter(function (m) {
    return pasaFiltro(m, datos || {});
  }).sort(function (a, b) {
    return String(a.fecha || '9999').localeCompare(String(b.fecha || '9999'));
  });
  return { ok: true, movimientos: lista.map(publicar) };
}

function accionCrear(datos) {
  var m = validarMovimiento(datos, null);
  m.id = nuevoId('MOV');
  m.recurrente = 'No';
  m.idRecurrente = '';
  m.periodo = '';
  m.fechaPago = '';
  aplicarCorte(m, datos);
  escribirObjeto('Movimientos', COLUMNAS_MOV, m);
  return { ok: true, movimiento: publicar(m) };
}

function buscarMovimiento(id) {
  var lista = leerMovimientos();
  for (var i = 0; i < lista.length; i++) {
    if (lista[i].id === id) return lista[i];
  }
  return null;
}

function accionActualizar(datos) {
  var actual = buscarMovimiento(String(datos.id || ''));
  if (!actual) return { ok: false, error: 'No se encontró el movimiento' };
  var m = validarMovimiento(datos, actual);
  m.id = actual.id;
  m.recurrente = actual.recurrente || 'No';
  m.idRecurrente = actual.idRecurrente || '';
  m.periodo = actual.periodo || '';
  m.fechaPago = datos.fechaPago !== undefined ? textoCelda(datos.fechaPago) : (actual.fechaPago || '');
  m._fila = actual._fila;
  if (!(datos && esSi(datos.corteManual)) && esSi(actual.corteManual) && datos.corteManual === undefined) {
    m.corte = actual.corte;
    m.corteClave = actual.corteClave;
    m.corteManual = 'Sí';
  } else {
    aplicarCorte(m, datos);
  }
  escribirObjeto('Movimientos', COLUMNAS_MOV, m);
  return { ok: true, movimiento: publicar(m) };
}

function accionEliminar(datos) {
  var id = String(datos.id || '');
  if (!id || !borrarPorId('Movimientos', id)) return { ok: false, error: 'No se encontró el movimiento' };
  return { ok: true };
}

function accionPagar(datos) {
  var actual = buscarMovimiento(String(datos.id || ''));
  if (!actual) return { ok: false, error: 'No se encontró el movimiento' };
  actual.estado = actual.tipo === 'Ingreso' ? 'Recibido' : 'Pagado';
  if (actual.tipo !== 'Ingreso') {
    actual.pagadoDesde = origenCanonico(datos.pagadoDesde !== undefined ? datos.pagadoDesde : actual.pagadoDesde);
  }
  if (!actual.fechaPago) actual.fechaPago = hoyISO();
  if (actual.montoReal === '' || actual.montoReal === null || actual.montoReal === undefined) {
    actual.montoReal = actual.monto;
  }
  escribirObjeto('Movimientos', COLUMNAS_MOV, actual);
  return { ok: true, movimiento: publicar(actual) };
}

function validarRecurrente(datos, base) {
  var r = base || {};
  var concepto = String(datos.concepto !== undefined ? datos.concepto : (r.concepto || '')).trim();
  if (!concepto) throw new Error('Escribe el concepto');
  var monto = datos.monto !== undefined ? Dinero.numero(datos.monto) : Dinero.numero(r.monto);
  if (monto === null || monto < 0) throw new Error('Escribe el monto habitual');
  var dia = datos.dia !== undefined ? datos.dia : r.dia;
  if (dia === '' || dia === null || dia === undefined) dia = '';
  else {
    dia = Number(dia);
    if (!isFinite(dia) || dia < 1 || dia > 31) throw new Error('El día debe estar entre 1 y 31');
  }
  return {
    id: r.id || '',
    tipo: tipoCanonico(datos.tipo || r.tipo || 'Gasto'),
    concepto: concepto,
    categoria: String(datos.categoria !== undefined ? datos.categoria : (r.categoria || '')).trim(),
    monto: Dinero.redondear(monto),
    dia: dia,
    persona: String(datos.persona !== undefined ? datos.persona : (r.persona || 'Familia')).trim() || 'Familia',
    activo: datos.activo !== undefined ? (esSi(datos.activo) ? 'Sí' : 'No') : (r.activo || 'Sí'),
    notas: String(datos.notas !== undefined ? datos.notas : (r.notas || '')).trim(),
    _fila: r._fila
  };
}

function accionGuardarRecurrente(datos) {
  var actual = null;
  if (datos.id) {
    var lista = leerRecurrentes();
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === datos.id) actual = lista[i];
    }
    if (!actual) return { ok: false, error: 'No se encontró la plantilla' };
  }
  var r = validarRecurrente(datos, actual);
  if (!r.id) r.id = nuevoId('REC');
  escribirObjeto('Recurrentes', COLUMNAS_REC, r);
  delete r._fila;
  return { ok: true, recurrente: r };
}

function accionEliminarRecurrente(datos) {
  var id = String(datos.id || '');
  if (!id || !borrarPorId('Recurrentes', id)) return { ok: false, error: 'No se encontró la plantilla' };
  return { ok: true };
}

function accionGenerar(datos) {
  var clave = String((datos && (datos.corte || datos.corteClave)) || '');
  var corte = Corte.calcularCorte(clave);
  if (!corte.clave) return { ok: false, error: 'Elige un corte' };
  var plantillas = leerRecurrentes().filter(function (r) { return esSi(r.activo); });
  var existentes = leerMovimientos();
  var conceptos = [];
  plantillas.forEach(function (p) {
    var fecha = Corte.fechaEnCorte(corte, p.dia);
    if (!fecha) return;
    var ya = existentes.some(function (m) {
      return m.idRecurrente === p.id && m.fecha === fecha;
    });
    if (ya) return;
    var m = {
      id: nuevoId('MOV'),
      fecha: fecha,
      tipo: p.tipo,
      concepto: p.concepto,
      categoria: p.categoria,
      monto: p.monto || 0,
      montoReal: '',
      estado: p.tipo === 'Ingreso' ? 'Esperado' : 'Pendiente',
      corte: '',
      corteClave: '',
      corteManual: 'No',
      recurrente: 'Sí',
      idRecurrente: p.id,
      periodo: Corte.periodoDe(fecha),
      fechaPago: '',
      persona: p.persona || 'Familia',
      notas: '',
      pagadoDesde: p.tipo === 'Ingreso' ? '' : 'Presupuesto familiar'
    };
    aplicarCorte(m, { corteManual: 'No' });
    escribirObjeto('Movimientos', COLUMNAS_MOV, m);
    conceptos.push(p.concepto);
  });
  return { ok: true, creados: conceptos.length, conceptos: conceptos, corte: corte.clave };
}

function asegurarCategoria(tabla, tipo, nombre) {
  var existe = tabla.filas.some(function (fila) {
    return Dinero.norm(fila['Grupo']) === 'categoria' && Dinero.norm(fila['Valor']) === Dinero.norm(nombre);
  });
  if (existe) return;
  var mapa = { Grupo: 'categoria', Clave: tipo, Valor: nombre, Activo: 'Sí' };
  var fila = Math.max(tabla.sheet.getLastRow(), 1) + 1;
  tabla.headers.forEach(function (header, i) {
    if (mapa[header]) tabla.sheet.getRange(fila, i + 1).setValue(mapa[header]);
  });
  var nueva = { _fila: fila };
  tabla.headers.forEach(function (header) {
    if (header) nueva[header] = mapa[header] || '';
  });
  tabla.filas.push(nueva);
}

function leerConfig() {
  var categorias = [];
  var personas = [];
  var estados = [];
  var cortes = [];
  var general = {};
  var ahorros = [];
  var tabla = leerTabla('Configuracion');
  asegurarCategoria(tabla, 'Gasto', 'Diezmos y ofrendas');
  tabla.filas.forEach(function (fila) {
    var grupo = Dinero.norm(fila['Grupo']);
    if (!estaActivo(fila['Activo'])) return;
    if (grupo === 'categoria') {
      categorias.push({ tipo: textoCelda(fila['Clave']), nombre: textoCelda(fila['Valor']) });
    } else if (grupo === 'persona' && textoCelda(fila['Valor'])) {
      personas.push(textoCelda(fila['Valor']));
    } else if (grupo === 'estado') {
      estados.push({ tipo: textoCelda(fila['Clave']), nombre: textoCelda(fila['Valor']) });
    } else if (grupo === 'corte') {
      cortes.push({
        clave: textoCelda(fila['Clave']),
        inicio: fila['Valor'],
        fin: fila['Extra']
      });
    } else if (grupo === 'general' && textoCelda(fila['Clave'])) {
      general[textoCelda(fila['Clave'])] = textoCelda(fila['Valor']);
    } else if (grupo === 'ahorro') {
      var nombreAhorro = String(textoCelda(fila['Valor']) || '').trim().replace(/^ahorros?\s+/i, '');
      if (!nombreAhorro) return;
      ahorros.push({
        id: textoCelda(fila['Clave']) || nombreAhorro.toLowerCase(),
        nombre: nombreAhorro,
        inicio: esSi(fila['Extra'])
      });
    }
  });
  if (!ahorros.length) {
    ponerAhorro(tabla, 'mia', 'Mia', false);
    ponerAhorro(tabla, 'fabi', 'Fabi', false);
    ahorros = [
      { id: 'mia', nombre: 'Mia', inicio: false },
      { id: 'fabi', nombre: 'Fabi', inicio: false }
    ];
  }
  return {
    categorias: categorias,
    personas: personas,
    estados: estados,
    cortes: cortes,
    general: general,
    ahorros: ahorros
  };
}

function aplicarDiasGuardados() {
  var general = leerConfig().general || {};
  Corte.fijarDias(general.corteDia1 || 10, general.corteDia2 || 25);
}

function ponerGeneral(tabla, clave, valor) {
  var texto = String(valor);
  var i;
  for (i = 0; i < tabla.filas.length; i++) {
    var fila = tabla.filas[i];
    if (Dinero.norm(fila['Grupo']) === 'general' && textoCelda(fila['Clave']) === clave) {
      var colValor = indiceColumna(tabla, 'Valor');
      var celda = tabla.sheet.getRange(fila._fila, colValor);
      celda.setNumberFormat('@');
      celda.setValue(texto);
      fila['Valor'] = texto;
      if (textoCelda(fila['Activo']) && !estaActivo(fila['Activo'])) {
        var colActivo = indiceColumna(tabla, 'Activo');
        tabla.sheet.getRange(fila._fila, colActivo).setValue('Sí');
        fila['Activo'] = 'Sí';
      }
      return;
    }
  }
  var mapa = { Grupo: 'general', Clave: clave, Valor: texto, Activo: 'Sí' };
  var n = Math.max(tabla.sheet.getLastRow(), 1) + 1;
  tabla.headers.forEach(function (header, idx) {
    if (mapa[header] === undefined) return;
    var celdaNueva = tabla.sheet.getRange(n, idx + 1);
    if (header === 'Valor' || header === 'Clave') celdaNueva.setNumberFormat('@');
    celdaNueva.setValue(mapa[header]);
  });
  var nueva = { _fila: n };
  tabla.headers.forEach(function (header) {
    nueva[header] = mapa[header] || '';
  });
  tabla.filas.push(nueva);
}

function ponerAhorro(tabla, id, nombre, inicio) {
  var extra = inicio ? 'Sí' : 'No';
  var i;
  for (i = 0; i < tabla.filas.length; i++) {
    var fila = tabla.filas[i];
    if (Dinero.norm(fila['Grupo']) !== 'ahorro') continue;
    var misma = textoCelda(fila['Clave']) === id || Dinero.baseAhorro(fila['Valor']) === Dinero.baseAhorro(nombre);
    if (!misma) continue;
    var colValor = indiceColumna(tabla, 'Valor');
    var colExtra = indiceColumna(tabla, 'Extra');
    var colActivo = indiceColumna(tabla, 'Activo');
    var celdaValor = tabla.sheet.getRange(fila._fila, colValor);
    celdaValor.setNumberFormat('@');
    celdaValor.setValue(nombre);
    if (colExtra) tabla.sheet.getRange(fila._fila, colExtra).setValue(extra);
    if (colActivo) tabla.sheet.getRange(fila._fila, colActivo).setValue('Sí');
    fila['Valor'] = nombre;
    fila['Extra'] = extra;
    fila['Activo'] = 'Sí';
    return;
  }
  var mapa = { Grupo: 'ahorro', Clave: id, Valor: nombre, Extra: extra, Activo: 'Sí' };
  var n = Math.max(tabla.sheet.getLastRow(), 1) + 1;
  tabla.headers.forEach(function (header, idx) {
    if (mapa[header] === undefined) return;
    var celdaNueva = tabla.sheet.getRange(n, idx + 1);
    if (header === 'Valor' || header === 'Clave') celdaNueva.setNumberFormat('@');
    celdaNueva.setValue(mapa[header]);
  });
  var nueva = { _fila: n };
  tabla.headers.forEach(function (header) {
    nueva[header] = mapa[header] || '';
  });
  tabla.filas.push(nueva);
}

function accionGuardarAhorro(datos) {
  var nombre = String((datos && datos.nombre) || '').trim().replace(/^ahorros?\s+/i, '');
  if (!nombre) return { ok: false, error: 'Escribe el nombre del ahorro' };
  var id = String((datos && datos.id) || '').trim();
  if (!id) id = nombre.toLowerCase().replace(/\s+/g, '-');
  var inicio = !!(datos && (datos.inicio === true || esSi(datos.inicio)));
  var tabla = leerTabla('Configuracion');
  var repetida = false;
  tabla.filas.forEach(function (fila) {
    if (Dinero.norm(fila['Grupo']) !== 'ahorro') return;
    if (!estaActivo(fila['Activo'])) return;
    if (textoCelda(fila['Clave']) === id) return;
    if (Dinero.baseAhorro(fila['Valor']) === Dinero.baseAhorro(nombre)) repetida = true;
  });
  if (repetida) return { ok: false, error: 'Ese ahorro ya existe' };
  ponerAhorro(tabla, id, nombre, inicio);
  return { ok: true, ahorros: leerConfig().ahorros };
}

function accionGuardarCortes(datos) {
  var a = Corte.diaValido(datos && datos.dia1);
  var b = Corte.diaValido(datos && datos.dia2);
  if (a === null || b === null) return { ok: false, error: 'Elige un día del 1 al 28' };
  if (a === b) return { ok: false, error: 'Los dos cortes tienen que empezar en días distintos' };
  var tabla = leerTabla('Configuracion');
  ponerGeneral(tabla, 'corteDia1', Math.min(a, b));
  ponerGeneral(tabla, 'corteDia2', Math.max(a, b));
  Corte.fijarDias(a, b);
  return { ok: true, dias: Corte.diasActuales(), config: leerConfig() };
}
