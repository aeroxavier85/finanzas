var Mesada = (function () {
  var ACTIVIDADES = [
    { id: 'bano', nombre: 'Lavar el baño', valor: 5 },
    { id: 'platos', nombre: 'Lavar platos', valor: 2.5 },
    { id: 'ropa', nombre: 'Lavar y secar', valor: 3 },
    { id: 'doblar', nombre: 'Doblar y guardar', valor: 5 }
  ];
  var NINAS = [
    { id: 'mia', nombre: 'Mia' },
    { id: 'fabiana', nombre: 'Fabiana' }
  ];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function usar(lista) {
    var siguiente = [];
    (lista || []).forEach(function (item) {
      var nombre = String(item.nombre || '').trim();
      var valor = Number(item.valor);
      if (!nombre || !isFinite(valor) || valor < 0) return;
      var id = String(item.id || '').trim();
      if (!id) id = nombre.toLowerCase();
      siguiente.push({
        id: id,
        nombre: nombre,
        valor: Math.round((valor + Number.EPSILON) * 100) / 100
      });
    });
    if (!siguiente.length) return ACTIVIDADES;
    ACTIVIDADES.length = 0;
    siguiente.forEach(function (item) { ACTIVIDADES.push(item); });
    return ACTIVIDADES;
  }

  function porId(id) {
    var encontrada = null;
    ACTIVIDADES.forEach(function (actividad) {
      if (actividad.id === id) encontrada = actividad;
    });
    return encontrada;
  }

  function claveMes(anio, mes) {
    return anio + '-' + (mes < 10 ? '0' : '') + mes;
  }

  function mesDe(fecha) {
    return String(fecha || '').slice(0, 7);
  }

  function tituloMes(anio, mes) {
    var nombre = MESES[mes - 1] || '';
    return nombre.charAt(0).toUpperCase() + nombre.slice(1) + ' ' + anio;
  }

  function delMes(lista, nina, mes) {
    return (lista || []).filter(function (item) {
      return item && item.nina === nina && mesDe(item.fecha) === mes;
    });
  }

  function total(lista, nina, mes) {
    var suma = 0;
    delMes(lista, nina, mes).forEach(function (item) {
      var n = Number(item.valor);
      if (isFinite(n)) suma += n;
    });
    return Math.round((suma + Number.EPSILON) * 100) / 100;
  }

  return {
    actividades: ACTIVIDADES,
    ninas: NINAS,
    porId: porId,
    usar: usar,
    claveMes: claveMes,
    mesDe: mesDe,
    tituloMes: tituloMes,
    delMes: delMes,
    total: total
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Mesada;
}

var mesadaMes = '';
var mesadaItems = [];
var mesadaSoloTelefono = false;

function mesadaPartes() {
  if (!mesadaMes) mesadaMes = String(fechaDeHoy()).slice(0, 7);
  var p = mesadaMes.split('-');
  return { anio: Number(p[0]), mes: Number(p[1]), clave: mesadaMes };
}

function cargarMesada() {
  pintarMesada();
  return Api.mesada().then(function (r) {
    if (!r || !r.ok) {
      if (r && String(r.error || '').toLowerCase().indexOf('desconocida') >= 0) {
        mesadaSoloTelefono = true;
        leerMesadaLocal();
        pintarMesada();
      }
      return r;
    }
    mesadaSoloTelefono = false;
    mesadaItems = normalizarItems(r.items || r.marcas || []);
    guardarMesadaLocal();
    pintarMesada();
    return r;
  });
}

function moverMesada(delta) {
  var p = mesadaPartes();
  var d = new Date(Date.UTC(p.anio, p.mes - 1 + delta, 1));
  mesadaMes = Mesada.claveMes(d.getUTCFullYear(), d.getUTCMonth() + 1);
  pintarMesada();
}

function pintarMesada() {
  var p = mesadaPartes();
  var titulo = document.getElementById('mesada-etiqueta');
  if (titulo) titulo.textContent = Mesada.tituloMes(p.anio, p.mes);
  var aviso = document.getElementById('mesada-aviso');
  if (aviso) {
    aviso.textContent = mesadaSoloTelefono
      ? 'Las marcas quedan en este teléfono hasta actualizar el programa de la hoja de Google.'
      : '';
    aviso.classList.toggle('oculto', !mesadaSoloTelefono);
  }
  var caja = document.getElementById('mesada-cuerpo');
  if (!caja) return;
  Formato.vaciar(caja);
  var columnas = Formato.nodo('div', 'mesada-columnas');
  Mesada.ninas.forEach(function (nina) {
    columnas.appendChild(columnaNina(nina, p.clave));
  });
  caja.appendChild(columnas);
}

function columnaNina(nina, mes) {
  var hechas = Mesada.delMes(mesadaItems, nina.id, mes).sort(function (a, b) {
    return String(b.fecha).localeCompare(String(a.fecha));
  });
  var tarjeta = Formato.nodo('article', 'mesada-nina');
  var identidad = Formato.nodo('div', 'mesada-identidad');
  var fotos = { mia: 'img/mia.jpg', fabiana: 'img/fabiana.jpg' };
  if (fotos[nina.id]) {
    var foto = document.createElement('img');
    foto.className = 'mesada-cara';
    foto.alt = '';
    foto.src = fotos[nina.id];
    identidad.appendChild(foto);
  }
  identidad.appendChild(Formato.nodo('h3', '', nina.nombre));
  tarjeta.appendChild(identidad);
  tarjeta.appendChild(Formato.nodo('strong', 'mesada-total', Formato.moneda(Mesada.total(mesadaItems, nina.id, mes))));
  tarjeta.appendChild(Formato.nodo('p', 'meta', hechas.length + (hechas.length === 1 ? ' hecha' : ' hechas')));

  var select = document.createElement('select');
  select.appendChild(new Option('Elige', ''));
  Mesada.actividades.forEach(function (actividad) {
    select.appendChild(new Option(actividad.nombre + ' · ' + Formato.moneda(actividad.valor), actividad.id));
  });
  var boton = Formato.nodo('button', 'boton', 'Hecho');
  boton.type = 'button';
  boton.addEventListener('click', function () {
    if (!select.value) {
      aviso('Elige una actividad.');
      return;
    }
    sumarActividad(nina.id, select.value);
  });
  tarjeta.appendChild(select);
  tarjeta.appendChild(boton);

  tarjeta.appendChild(Formato.nodo('p', 'mesada-lista-titulo', 'Hecho este mes'));
  if (!hechas.length) {
    tarjeta.appendChild(Formato.nodo('p', 'vacio', 'Nada todavía.'));
    return tarjeta;
  }
  hechas.forEach(function (item) {
    tarjeta.appendChild(lineaHecha(item));
  });
  return tarjeta;
}

function lineaHecha(item) {
  var fila = Formato.nodo('div', 'mesada-linea');
  var texto = Formato.nodo('div', 'mesada-linea-texto');
  texto.appendChild(Formato.nodo('span', '', Formato.fecha(item.fecha)));
  texto.appendChild(Formato.nodo('strong', '', item.nombre || nombreActividad(item.actividad)));
  fila.appendChild(texto);
  var lado = Formato.nodo('div', 'mesada-linea-lado');
  lado.appendChild(Formato.nodo('span', '', Formato.moneda(item.valor)));
  var quitar = Formato.nodo('button', 'mesada-quitar', '×');
  quitar.type = 'button';
  quitar.setAttribute('aria-label', 'Quitar');
  quitar.addEventListener('click', function () { quitarActividad(item.id); });
  lado.appendChild(quitar);
  fila.appendChild(lado);
  return fila;
}

function nombreActividad(id) {
  var actividad = Mesada.porId(id);
  return actividad ? actividad.nombre : id;
}

function sumarActividad(nina, actividadId) {
  var actividad = Mesada.porId(actividadId);
  if (!actividad) return;
  var item = {
    id: 'local-' + Date.now(),
    nina: nina,
    actividad: actividad.id,
    nombre: actividad.nombre,
    valor: actividad.valor,
    fecha: fechaDeHoy()
  };
  mesadaItems.push(item);
  mesadaMes = Mesada.mesDe(item.fecha);
  guardarMesadaLocal();
  pintarMesada();
  Api.agregarMesada(item).then(function (r) {
    if (r && r.ok && r.item) {
      mesadaSoloTelefono = false;
      mesadaItems = mesadaItems.filter(function (actual) { return actual.id !== item.id; });
      mesadaItems.push(normalizarItem(r.item));
      guardarMesadaLocal();
      pintarMesada();
      return;
    }
    if (r && String(r.error || '').toLowerCase().indexOf('desconocida') >= 0) {
      mesadaSoloTelefono = true;
      pintarMesada();
      return;
    }
    mesadaItems = mesadaItems.filter(function (actual) { return actual.id !== item.id; });
    guardarMesadaLocal();
    pintarMesada();
    aviso('No se guardó.');
  });
}

function quitarActividad(id) {
  var copia = mesadaItems.slice();
  mesadaItems = mesadaItems.filter(function (item) { return item.id !== id; });
  guardarMesadaLocal();
  pintarMesada();
  Api.quitarMesada({ id: id }).then(function (r) {
    if (r && r.ok) {
      mesadaSoloTelefono = false;
      return;
    }
    if (r && String(r.error || '').toLowerCase().indexOf('desconocida') >= 0) {
      mesadaSoloTelefono = true;
      pintarMesada();
      return;
    }
    mesadaItems = copia;
    guardarMesadaLocal();
    pintarMesada();
    aviso('No se quitó.');
  });
}

function normalizarItems(lista) {
  return (lista || []).map(normalizarItem).filter(function (item) { return item.id && item.nina && item.fecha; });
}

function normalizarItem(item) {
  var actividad = Mesada.porId(item.actividad);
  return {
    id: String(item.id || ''),
    nina: String(item.nina || '').toLowerCase(),
    actividad: actividad ? actividad.id : String(item.actividad || ''),
    nombre: actividad ? actividad.nombre : String(item.nombre || item.actividad || ''),
    valor: valorGuardado(item, actividad),
    fecha: String(item.fecha || '').slice(0, 10)
  };
}

function valorGuardado(item, actividad) {
  var n = Number(item.valor);
  if (isFinite(n)) return Math.round((n + Number.EPSILON) * 100) / 100;
  return actividad ? actividad.valor : 0;
}

function guardarMesadaLocal() {
  try { localStorage.setItem('finanzas-mesada-log', JSON.stringify(mesadaItems)); } catch (e) {}
}

function leerMesadaLocal() {
  var crudo = '';
  try { crudo = localStorage.getItem('finanzas-mesada-log') || ''; } catch (e) { crudo = ''; }
  if (!crudo) {
    mesadaItems = [];
    return;
  }
  try { mesadaItems = normalizarItems(JSON.parse(crudo)); } catch (e2) { mesadaItems = []; }
}
