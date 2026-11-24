var Reintento = (function () {
  var ACCIONES = {
    crear: 'Agregar',
    actualizar: 'Editar',
    pagar: 'Marcar pagado',
    origen: 'Guardar desde dónde salió',
    eliminar: 'Eliminar'
  };

  function moneda(n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
  }

  function fecha(iso) {
    var p = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return p ? p[3] + '/' + p[2] + '/' + p[1] : '';
  }

  function datosDe(item) {
    return (item && item.datos) || {};
  }

  function nombre(item) {
    var concepto = String((item && item.concepto) || datosDe(item).concepto || '').trim();
    if (concepto && concepto !== 'el movimiento') return concepto;
    var d = datosDe(item);
    if (d.monto === undefined || d.monto === '' || d.monto === null) return 'un movimiento';
    var texto = (d.tipo || 'Movimiento') + ' de ' + moneda(d.monto);
    if (fecha(d.fecha)) texto += ' del ' + fecha(d.fecha);
    return texto;
  }

  function aviso(item) {
    var inicio = item && item.accion === 'origen' ? 'No se guardó desde dónde salió: ' : 'No se guardó: ';
    return inicio + nombre(item) + '. Toca para ver.';
  }

  function detalle(item) {
    var d = datosDe(item);
    var filas = [['Qué se intentó', ACCIONES[item.accion] || item.accion || '—']];
    if (d.tipo) filas.push(['Tipo', d.tipo]);
    var concepto = String(d.concepto !== undefined ? d.concepto : (item.concepto || '')).trim();
    filas.push(['Concepto', concepto || '(vacío)']);
    if (d.monto !== undefined && d.monto !== '') filas.push(['Monto', moneda(d.monto)]);
    if (d.fecha !== undefined) filas.push(['Fecha', fecha(d.fecha) || 'Sin fecha']);
    if (d.categoria) filas.push(['Categoría', d.categoria]);
    if (d.estado) filas.push(['Estado', d.estado]);
    if (d.pagadoDesde) filas.push(['Pagado desde', d.pagadoDesde]);
    if (d.id) filas.push(['Código', d.id]);
    filas.push(['Error', item.error || 'No se sabe: falló antes de guardar el motivo']);
    return filas;
  }

  function sePuedeCorregir(item) {
    return !!item && (item.accion === 'crear' || item.accion === 'actualizar');
  }

  return {
    aviso: aviso,
    detalle: detalle,
    sePuedeCorregir: sePuedeCorregir
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Reintento;
}
