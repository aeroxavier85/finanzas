<?php

require __DIR__ . '/../../api/datos.php';
$config = require __DIR__ . '/../../api/config.php';

function fallo($mensaje)
{
    fwrite(STDERR, $mensaje . "\n");
    exit(1);
}

$antesMov = count(datosAccion('movimientos', [], $config)['movimientos']);
$antesRec = count(datosAccion('recurrentes', [], $config)['recurrentes']);
$antesMes = count(datosAccion('mesada', [], $config)['items']);
$antesAct = count(datosAccion('config', [], $config)['config']['actividades']);

$creado = datosAccion('movimiento-crear', [
    'tipo' => 'Gasto',
    'concepto' => 'PRUEBA CRUD borrar',
    'categoria' => 'Otros',
    'monto' => '1,25',
    'montoReal' => '',
    'estado' => 'Pendiente',
    'fecha' => '2026-10-16',
    'persona' => 'Familia',
    'notas' => 'fila de prueba',
    'pagadoDesde' => 'De la casa',
], $config);
if (empty($creado['ok']) || empty($creado['movimiento']['id'])) fallo('no creo el movimiento');
$idMov = $creado['movimiento']['id'];

$lista = datosAccion('movimientos', ['mes' => '2026-10'], $config);
$visto = false;
foreach ($lista['movimientos'] as $m) {
    if ($m['id'] === $idMov && $m['monto'] == 1.25) $visto = true;
}
if (!$visto) fallo('no leyo el movimiento');

$editado = datosAccion('movimiento-actualizar', [
    'id' => $idMov,
    'tipo' => 'Gasto',
    'concepto' => 'PRUEBA CRUD editada',
    'monto' => '2,50',
    'estado' => 'Pendiente',
    'fecha' => '2026-10-16',
], $config);
if (empty($editado['ok']) || $editado['movimiento']['concepto'] !== 'PRUEBA CRUD editada') fallo('no actualizo');

$pagado = datosAccion('movimiento-pagar', ['id' => $idMov, 'pagadoDesde' => 'De la casa'], $config);
if (empty($pagado['ok']) || $pagado['movimiento']['estado'] !== 'Pagado') fallo('no marco pagado');

if (empty(datosAccion('movimiento-eliminar', ['id' => $idMov], $config)['ok'])) fallo('no borro el movimiento');

$rec = datosAccion('recurrente-guardar', [
    'tipo' => 'Gasto',
    'concepto' => 'PRUEBA CRUD plantilla',
    'categoria' => 'Otros',
    'monto' => '3',
    'dia' => 15,
    'activo' => 'Sí',
], $config);
if (empty($rec['ok'])) fallo('no creo la plantilla');
$idRec = $rec['recurrente']['id'];
$rec2 = datosAccion('recurrente-guardar', [
    'id' => $idRec,
    'concepto' => 'PRUEBA CRUD plantilla editada',
    'monto' => '4',
    'dia' => 16,
    'activo' => 'No',
], $config);
if (empty($rec2['ok']) || $rec2['recurrente']['concepto'] !== 'PRUEBA CRUD plantilla editada') fallo('no actualizo la plantilla');
if (empty(datosAccion('recurrente-eliminar', ['id' => $idRec], $config)['ok'])) fallo('no borro la plantilla');

$act = datosAccion('config-actividad', ['nombre' => 'PRUEBA CRUD barrer', 'valor' => '1,50'], $config);
if (empty($act['ok'])) fallo('no creo la actividad');
$idAct = '';
foreach ($act['actividades'] as $a) {
    if ($a['nombre'] === 'PRUEBA CRUD barrer') $idAct = $a['id'];
}
if ($idAct === '') fallo('no leyo la actividad');
$act2 = datosAccion('config-actividad', ['id' => $idAct, 'nombre' => 'PRUEBA CRUD barrer', 'valor' => '2'], $config);
if (empty($act2['ok'])) fallo('no actualizo la actividad');
$GLOBALS['DATOS_CONFIG'] = $config;
datosExec(datosDb($config), 'DELETE FROM configuracion WHERE grupo = ? AND clave = ?', ['mesada', $idAct]);

$marca = datosAccion('mesada-agregar', ['nina' => 'mia', 'actividad' => 'platos', 'fecha' => '2026-10-16'], $config);
if (empty($marca['ok'])) fallo('no creo la mesada');
$idMes = $marca['item']['id'];
$items = datosAccion('mesada', [], $config)['items'];
$hay = false;
foreach ($items as $item) {
    if ($item['id'] === $idMes) $hay = true;
}
if (!$hay) fallo('no leyo la mesada');
if (empty(datosAccion('mesada-quitar', ['id' => $idMes], $config)['ok'])) fallo('no borro la mesada');

$mov = datosAccion('movimientos', [], $config)['movimientos'];
$recs = datosAccion('recurrentes', [], $config)['recurrentes'];
$mes = datosAccion('mesada', [], $config)['items'];
$acts = datosAccion('config', [], $config)['config']['actividades'];
foreach (array_merge($mov, $recs, $mes) as $fila) {
    if (strpos((string) $fila['concepto' . (isset($fila['concepto']) ? '' : '')], 'PRUEBA CRUD') !== false) fallo('quedo texto de prueba');
    if (isset($fila['concepto']) && strpos($fila['concepto'], 'PRUEBA CRUD') !== false) fallo('quedo un concepto de prueba');
    if (isset($fila['id']) && ($fila['id'] === $idMov || $fila['id'] === $idRec || $fila['id'] === $idMes)) fallo('quedo un id de prueba');
}
foreach ($acts as $a) {
    if (strpos($a['nombre'], 'PRUEBA CRUD') !== false || $a['id'] === $idAct) fallo('quedo la actividad de prueba');
}
if (count($mov) !== $antesMov || count($recs) !== $antesRec || count($mes) !== $antesMes || count($acts) !== $antesAct) {
    fallo('los conteos no volvieron: mov ' . count($mov) . '/' . $antesMov . ' rec ' . count($recs) . '/' . $antesRec . ' mes ' . count($mes) . '/' . $antesMes . ' act ' . count($acts) . '/' . $antesAct);
}

echo "crud: ok\n";
