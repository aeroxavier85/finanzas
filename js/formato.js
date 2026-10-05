var Formato = (function () {
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  function moneda(n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
  }

  function partes(iso) {
    var p = String(iso || '').split('-');
    if (p.length < 3) return null;
    return { anio: p[0], mes: Number(p[1]), dia: Number(p[2]) };
  }

  function fecha(iso, conAnio) {
    var p = partes(iso);
    if (!p || !p.mes) return 'Sin fecha';
    var nombre = MESES[p.mes - 1] || '';
    nombre = nombre.charAt(0).toUpperCase() + nombre.slice(1);
    return conAnio ? p.dia + ' ' + nombre + ' ' + p.anio : p.dia + ' ' + nombre;
  }

  function rango(inicio, fin) {
    if (!inicio || !fin) return 'Sin asignar';
    var a = partes(inicio);
    var b = partes(fin);
    var cruza = a && b && a.anio !== b.anio;
    return fecha(inicio, cruza) + ' → ' + fecha(fin, cruza);
  }

  function nodo(tag, clase, texto) {
    var n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }

  function campo(etiqueta, control) {
    var label = nodo('label', 'campo');
    label.appendChild(nodo('span', '', etiqueta));
    label.appendChild(control);
    return label;
  }

  function vaciar(nodoPadre) {
    while (nodoPadre.firstChild) nodoPadre.removeChild(nodoPadre.firstChild);
  }

  return {
    moneda: moneda,
    fecha: fecha,
    rango: rango,
    nodo: nodo,
    campo: campo,
    vaciar: vaciar
  };
})();
