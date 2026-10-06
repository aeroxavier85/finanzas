var Api = (function () {
  function pedir(ruta, datos) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return Promise.resolve({
        ok: false,
        error: 'Sin conexión. Los números viven en la hoja, no en el teléfono.'
      });
    }
    return fetch(APP.api, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruta: ruta, datos: datos || {} })
    }).then(function (res) {
      return res.json().catch(function () {
        return { ok: false, error: 'Respuesta inesperada del servidor' };
      }).then(function (body) {
        body = body || { ok: false, error: 'Respuesta vacía' };
        body._estado = res.status;
        return body;
      });
    }).catch(function () {
      return {
        ok: false,
        error: 'Sin conexión. Los números viven en la hoja, no en el teléfono.'
      };
    });
  }

  return {
    salud: function () { return pedir('salud'); },
    yo: function () { return pedir('yo'); },
    login: function (clave) { return pedir('login', { clave: clave }); },
    logout: function () { return pedir('logout'); },
    dashboard: function (datos) { return pedir('dashboard', datos); },
    movimientos: function (datos) { return pedir('movimientos', datos); },
    crearMovimiento: function (datos) { return pedir('movimiento-crear', datos); },
    actualizarMovimiento: function (datos) { return pedir('movimiento-actualizar', datos); },
    eliminarMovimiento: function (datos) { return pedir('movimiento-eliminar', datos); },
    pagar: function (datos) { return pedir('movimiento-pagar', datos); },
    recurrentes: function () { return pedir('recurrentes'); },
    guardarRecurrente: function (datos) { return pedir('recurrente-guardar', datos); },
    eliminarRecurrente: function (datos) { return pedir('recurrente-eliminar', datos); },
    generar: function (datos) { return pedir('generar', datos); },
    config: function () { return pedir('config'); },
    guardarCortes: function (datos) { return pedir('config-cortes', datos); },
    guardarAhorro: function (datos) { return pedir('config-ahorro', datos); },
    guardarActividad: function (datos) { return pedir('config-actividad', datos); },
    mesada: function () { return pedir('mesada'); },
    agregarMesada: function (datos) { return pedir('mesada-agregar', datos); },
    quitarMesada: function (datos) { return pedir('mesada-quitar', datos); }
  };
})();
