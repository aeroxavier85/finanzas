<?php
// Conector de Claude (MCP). Se registra en claude.ai con la URL:
// https://TU-DOMINIO/finanzas/mcp/index.php?clave=CODIGO
// El código es el mismo de la app. Después de 5 códigos malos se bloquea 24 horas.

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

$config = require __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../api/datos.php';

const MCP_VERSIONES = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const MCP_MAX_FALLOS = 5;
const MCP_BLOQUEO_SEGUNDOS = 86400;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['error' => 'Solo POST'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    global $DATOS_CONFIG;
    $DATOS_CONFIG = $config;
    datosAsegurar($config);
    mcpRevisarClave($config);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'No se pudo abrir la base'], JSON_UNESCAPED_UNICODE);
    exit;
}

$entrada = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($entrada)) {
    echo json_encode(mcpError(null, -32700, 'JSON inválido'), JSON_UNESCAPED_UNICODE);
    exit;
}

$esLote = array_keys($entrada) === range(0, count($entrada) - 1);
$mensajes = $esLote ? $entrada : [$entrada];
$respuestas = [];
foreach ($mensajes as $msg) {
    $r = mcpAtender(is_array($msg) ? $msg : []);
    if ($r !== null) $respuestas[] = $r;
}

if (!$respuestas) {
    http_response_code(202);
    exit;
}
echo json_encode($esLote ? $respuestas : $respuestas[0], JSON_UNESCAPED_UNICODE);

// ---------- Clave y bloqueo ----------

function mcpRevisarClave($config)
{
    global $DATOS_CONFIG;
    $db = datosDb($DATOS_CONFIG);
    $db->query('CREATE TABLE IF NOT EXISTS mcp_bloqueo (
        id TINYINT NOT NULL PRIMARY KEY,
        fallos INT NOT NULL DEFAULT 0,
        bloqueado_hasta INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB');
    $db->query('INSERT IGNORE INTO mcp_bloqueo (id, fallos, bloqueado_hasta) VALUES (1, 0, 0)');
    $fila = datosFilas($db, 'SELECT fallos, bloqueado_hasta FROM mcp_bloqueo WHERE id = 1')[0];

    if ((int) $fila['bloqueado_hasta'] > time()) {
        mcpNegar(429, 'Bloqueado por demasiados códigos incorrectos. Intenta más tarde.');
    }

    $clave = isset($_GET['clave']) ? trim((string) $_GET['clave']) : '';
    if ($clave === '') {
        $auth = isset($_SERVER['HTTP_AUTHORIZATION']) ? (string) $_SERVER['HTTP_AUTHORIZATION'] : '';
        if (preg_match('/^Bearer\s+(\S+)$/i', $auth, $m)) $clave = $m[1];
    }
    if ($clave === '') mcpNegar(401, 'Falta el código');

    $esperada = isset($config['clave']) ? (string) $config['clave'] : '';
    if (preg_match('/^\d{4}$/', $esperada) && hash_equals($esperada, $clave)) {
        if ((int) $fila['fallos'] > 0) $db->query('UPDATE mcp_bloqueo SET fallos = 0 WHERE id = 1');
        return;
    }

    $fallos = (int) $fila['fallos'] + 1;
    if ($fallos >= MCP_MAX_FALLOS) {
        datosExec($db, 'UPDATE mcp_bloqueo SET fallos = 0, bloqueado_hasta = ? WHERE id = 1', [time() + MCP_BLOQUEO_SEGUNDOS]);
    } else {
        datosExec($db, 'UPDATE mcp_bloqueo SET fallos = ? WHERE id = 1', [$fallos]);
    }
    mcpNegar(401, 'Código incorrecto');
}

function mcpNegar($estado, $texto)
{
    http_response_code($estado);
    echo json_encode(['error' => $texto], JSON_UNESCAPED_UNICODE);
    exit;
}

// ---------- JSON-RPC ----------

function mcpError($id, $codigo, $texto)
{
    return ['jsonrpc' => '2.0', 'id' => $id, 'error' => ['code' => $codigo, 'message' => $texto]];
}

function mcpOk($id, $resultado)
{
    return ['jsonrpc' => '2.0', 'id' => $id, 'result' => $resultado];
}

function mcpAtender($msg)
{
    $metodo = isset($msg['method']) ? (string) $msg['method'] : '';
    if (!array_key_exists('id', $msg)) return null;
    $id = $msg['id'];
    $params = isset($msg['params']) && is_array($msg['params']) ? $msg['params'] : [];

    if ($metodo === 'initialize') {
        $pedida = isset($params['protocolVersion']) ? (string) $params['protocolVersion'] : '';
        return mcpOk($id, [
            'protocolVersion' => in_array($pedida, MCP_VERSIONES, true) ? $pedida : MCP_VERSIONES[1],
            'capabilities' => ['tools' => new stdClass()],
            'serverInfo' => ['name' => 'finanzas', 'title' => '¿Y la plata?', 'version' => '1.0.0'],
            'instructions' => 'Finanzas de la familia. Montos en USD. Los periodos se llaman "cortes" (no meses). '
                . 'Para "¿cómo voy?" usa estado_corte. Para registrar usa agregar_movimiento. '
                . 'Para marcar algo pagado, primero busca el id con pendientes.',
        ]);
    }
    if ($metodo === 'ping') return mcpOk($id, new stdClass());
    if ($metodo === 'tools/list') return mcpOk($id, ['tools' => mcpHerramientas()]);
    if ($metodo === 'tools/call') {
        $nombre = isset($params['name']) ? (string) $params['name'] : '';
        $args = isset($params['arguments']) && is_array($params['arguments']) ? $params['arguments'] : [];
        try {
            $datos = mcpLlamar($nombre, $args);
            if ($datos === null) return mcpError($id, -32602, 'Herramienta desconocida: ' . $nombre);
            return mcpOk($id, [
                'content' => [['type' => 'text', 'text' => json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)]],
                'structuredContent' => $datos,
            ]);
        } catch (Throwable $e) {
            return mcpOk($id, [
                'content' => [['type' => 'text', 'text' => 'Error: ' . $e->getMessage()]],
                'isError' => true,
            ]);
        }
    }
    return mcpError($id, -32601, 'Método no soportado: ' . $metodo);
}

// ---------- Herramientas ----------

function mcpHerramientas()
{
    $config = datosLeerConfig();
    $gastos = [];
    $ingresos = [];
    foreach ($config['categorias'] as $c) {
        if (dNorm($c['tipo']) === 'ingreso') $ingresos[] = $c['nombre'];
        else $gastos[] = $c['nombre'];
    }
    $origenes = ['De la casa'];
    foreach ($config['ahorros'] as $a) $origenes[] = 'Ahorro ' . $a['nombre'];

    $fechaCorte = [
        'type' => 'string',
        'description' => 'Cualquier fecha YYYY-MM-DD dentro del corte que se quiere ver. Si no se manda, es el corte de hoy.',
    ];

    return [
        [
            'name' => 'estado_corte',
            'title' => 'Estado del corte',
            'description' => 'Muestra lo mismo que la pantalla de Inicio: ingresos + sobrante del corte anterior, planificado, pagado, '
                . 'disponible, saldos de ahorro y cuánto falta por pagar. Úsala para "¿cómo voy?", "¿cuánto me queda?", "¿cuál es mi saldo?".',
            'inputSchema' => ['type' => 'object', 'properties' => ['fecha' => $fechaCorte]],
            'annotations' => ['readOnlyHint' => true],
        ],
        [
            'name' => 'pendientes',
            'title' => 'Gastos por pagar',
            'description' => 'Lista los gastos pendientes o programados de un corte (pantalla "Gastos básicos"), con su id, fecha y monto.',
            'inputSchema' => ['type' => 'object', 'properties' => ['fecha' => $fechaCorte]],
            'annotations' => ['readOnlyHint' => true],
        ],
        [
            'name' => 'agregar_movimiento',
            'title' => 'Agregar gasto o ingreso',
            'description' => 'Registra un gasto o un ingreso en la app. Si el usuario dice que ya lo gastó o lo recibió, el estado es Pagado/Recibido '
                . '(es lo normal). Si es algo por pagar más adelante usa Pendiente. Elige la categoría más parecida de la lista; si ninguna encaja, déjala vacía. '
                . 'Confirma al usuario lo que quedó guardado.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'tipo' => ['type' => 'string', 'enum' => ['Gasto', 'Ingreso']],
                    'concepto' => ['type' => 'string', 'description' => 'Qué fue, corto. Ej. "Supermercado", "Gasolina".'],
                    'monto' => ['type' => 'number', 'description' => 'Monto en USD, positivo.'],
                    'categoria' => [
                        'type' => 'string',
                        'description' => 'Gastos: ' . implode(', ', $gastos) . '. Ingresos: ' . implode(', ', $ingresos) . '.',
                    ],
                    'fecha' => ['type' => 'string', 'description' => 'YYYY-MM-DD. Si no se manda, hoy.'],
                    'estado' => ['type' => 'string', 'enum' => ['Pagado', 'Pendiente', 'Programado', 'Recibido', 'Esperado']],
                    'pagado_desde' => [
                        'type' => 'string',
                        'description' => 'Solo gastos: de dónde salió el dinero. Opciones: ' . implode(', ', $origenes) . '. Por defecto De la casa.',
                    ],
                    'persona' => ['type' => 'string', 'description' => 'Por defecto Familia.'],
                    'notas' => ['type' => 'string'],
                ],
                'required' => ['tipo', 'concepto', 'monto'],
            ],
        ],
        [
            'name' => 'marcar_pagado',
            'title' => 'Marcar como pagado',
            'description' => 'Marca un gasto pendiente como pagado (o un ingreso esperado como recibido). Busca el id con la herramienta pendientes.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string'],
                    'pagado_desde' => ['type' => 'string', 'description' => 'De dónde salió: ' . implode(', ', $origenes) . '.'],
                ],
                'required' => ['id'],
            ],
            'annotations' => ['idempotentHint' => true],
        ],
        [
            'name' => 'buscar_movimientos',
            'title' => 'Buscar movimientos',
            'description' => 'Consulta movimientos con filtros (todos opcionales) y devuelve la lista con id y los totales de gastos e ingresos. '
                . 'Úsala para "¿cuánto gasté en comida?", "¿qué pagué esta semana?", o para encontrar el id antes de modificar o eliminar.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'desde' => ['type' => 'string', 'description' => 'YYYY-MM-DD, incluida.'],
                    'hasta' => ['type' => 'string', 'description' => 'YYYY-MM-DD, incluida.'],
                    'corte' => ['type' => 'string', 'description' => 'Fecha YYYY-MM-DD: solo los movimientos del corte que contiene esa fecha.'],
                    'texto' => ['type' => 'string', 'description' => 'Busca en concepto y notas.'],
                    'tipo' => ['type' => 'string', 'enum' => ['Gasto', 'Ingreso']],
                    'categoria' => ['type' => 'string'],
                    'estado' => ['type' => 'string', 'enum' => ['Pagado', 'Pendiente', 'Programado', 'Omitido', 'Recibido', 'Esperado']],
                    'limite' => ['type' => 'integer', 'description' => 'Máximo de filas, por defecto 50. Los totales cuentan todo.'],
                ],
            ],
            'annotations' => ['readOnlyHint' => true],
        ],
        [
            'name' => 'modificar_movimiento',
            'title' => 'Modificar movimiento',
            'description' => 'Cambia un movimiento existente. Manda solo el id y los campos que cambian. Busca el id con buscar_movimientos o pendientes.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string'],
                    'tipo' => ['type' => 'string', 'enum' => ['Gasto', 'Ingreso']],
                    'concepto' => ['type' => 'string'],
                    'monto' => ['type' => 'number'],
                    'monto_real' => ['type' => 'number', 'description' => 'Lo que de verdad se pagó, si fue distinto al monto.'],
                    'categoria' => ['type' => 'string'],
                    'fecha' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                    'estado' => ['type' => 'string', 'enum' => ['Pagado', 'Pendiente', 'Programado', 'Omitido', 'Recibido', 'Esperado']],
                    'pagado_desde' => ['type' => 'string', 'description' => 'Opciones: ' . implode(', ', $origenes) . '.'],
                    'persona' => ['type' => 'string'],
                    'notas' => ['type' => 'string'],
                ],
                'required' => ['id'],
            ],
            'annotations' => ['idempotentHint' => true],
        ],
        [
            'name' => 'eliminar_movimiento',
            'title' => 'Eliminar movimiento',
            'description' => 'Borra un movimiento para siempre. Antes de llamarla, dile al usuario cuál vas a borrar (concepto, fecha y monto) y espera que confirme.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => ['id' => ['type' => 'string']],
                'required' => ['id'],
            ],
            'annotations' => ['destructiveHint' => true],
        ],
    ];
}

function mcpLlamar($nombre, $args)
{
    if ($nombre === 'estado_corte') return mcpEstadoCorte(isset($args['fecha']) ? $args['fecha'] : '');
    if ($nombre === 'pendientes') {
        $estado = mcpEstadoCorte(isset($args['fecha']) ? $args['fecha'] : '');
        return ['corte' => $estado['corte'], 'totalPendiente' => $estado['gastosPendientes'], 'pendientes' => $estado['pendientes']];
    }
    if ($nombre === 'agregar_movimiento') return mcpAgregar($args);
    if ($nombre === 'marcar_pagado') {
        $r = datosPagarMovimiento([
            'id' => isset($args['id']) ? (string) $args['id'] : '',
            'pagadoDesde' => isset($args['pagado_desde']) ? $args['pagado_desde'] : null,
        ]);
        if (empty($r['ok'])) throw new RuntimeException($r['error']);
        return ['guardado' => mcpCorto($r['movimiento'])];
    }
    if ($nombre === 'buscar_movimientos') return mcpBuscar($args);
    if ($nombre === 'modificar_movimiento') return mcpModificar($args);
    if ($nombre === 'eliminar_movimiento') {
        $id = isset($args['id']) ? (string) $args['id'] : '';
        $antes = dBuscarMovimiento($id);
        if (!$antes) throw new RuntimeException('No se encontró el movimiento');
        $r = datosEliminarMovimiento(['id' => $id]);
        if (empty($r['ok'])) throw new RuntimeException($r['error']);
        return ['eliminado' => mcpCorto($antes)];
    }
    return null;
}

function mcpBuscar($args)
{
    $desde = isset($args['desde']) ? dFecha($args['desde']) : null;
    $hasta = isset($args['hasta']) ? dFecha($args['hasta']) : null;
    $corte = '';
    if (!empty($args['corte'])) {
        $corte = dCalcularCorte($args['corte'])['clave'];
        if ($corte === '') throw new RuntimeException('La fecha del corte no es válida, usa YYYY-MM-DD');
    }
    $texto = isset($args['texto']) ? dNorm($args['texto']) : '';
    $limite = isset($args['limite']) ? max(1, (int) $args['limite']) : 50;

    $filas = [];
    $gastos = 0;
    $ingresos = 0;
    foreach (datosLeerMovimientos() as $m) {
        if ($desde && (!$m['fecha'] || $m['fecha'] < $desde)) continue;
        if ($hasta && (!$m['fecha'] || $m['fecha'] > $hasta)) continue;
        if ($corte !== '' && mcpClaveDe($m) !== $corte) continue;
        if (!empty($args['tipo']) && dNorm($m['tipo']) !== dNorm($args['tipo'])) continue;
        if (!empty($args['categoria']) && dNorm($m['categoria']) !== dNorm($args['categoria'])) continue;
        if (!empty($args['estado']) && dNorm($m['estado']) !== dNorm($args['estado'])) continue;
        if ($texto !== '' && strpos(dNorm($m['concepto'] . ' ' . $m['notas']), $texto) === false) continue;
        $filas[] = $m;
        if (dNorm($m['estado']) === 'omitido') continue;
        $monto = mcpReal($m, dNumero($m['monto']) ?: 0);
        if ($m['tipo'] === 'Ingreso') $ingresos += $monto;
        else $gastos += $monto;
    }
    usort($filas, function ($a, $b) {
        return strcmp($b['fecha'] ?: '0000', $a['fecha'] ?: '0000');
    });
    return [
        'encontrados' => count($filas),
        'totalGastos' => dRedondear($gastos),
        'totalIngresos' => dRedondear($ingresos),
        'movimientos' => array_map(function ($m) {
            $c = mcpCorto($m);
            if ($m['montoReal'] !== '') $c['montoReal'] = $m['montoReal'];
            if ($m['notas'] !== '') $c['notas'] = $m['notas'];
            return $c;
        }, array_slice($filas, 0, $limite)),
    ];
}

function mcpModificar($args)
{
    $nombres = [
        'tipo' => 'tipo', 'concepto' => 'concepto', 'monto' => 'monto', 'monto_real' => 'montoReal',
        'categoria' => 'categoria', 'fecha' => 'fecha', 'estado' => 'estado',
        'pagado_desde' => 'pagadoDesde', 'persona' => 'persona', 'notas' => 'notas',
    ];
    $datos = ['id' => isset($args['id']) ? (string) $args['id'] : ''];
    foreach ($nombres as $de => $a) {
        if (array_key_exists($de, $args)) $datos[$a] = $args[$de];
    }
    $r = datosActualizarMovimiento($datos);
    if (empty($r['ok'])) throw new RuntimeException($r['error']);
    return ['guardado' => mcpCorto($r['movimiento'])];
}

function mcpAgregar($args)
{
    $tipo = dTipo(isset($args['tipo']) ? $args['tipo'] : 'Gasto');
    $estado = isset($args['estado']) ? (string) $args['estado'] : '';
    if (dEstado($tipo, $estado) === '') $estado = $tipo === 'Ingreso' ? 'Recibido' : 'Pagado';
    $fecha = isset($args['fecha']) ? trim((string) $args['fecha']) : '';
    if ($fecha === '') $fecha = dHoy();
    $r = datosCrearMovimiento([
        'tipo' => $tipo,
        'concepto' => isset($args['concepto']) ? $args['concepto'] : '',
        'monto' => isset($args['monto']) ? $args['monto'] : null,
        'categoria' => isset($args['categoria']) ? $args['categoria'] : '',
        'fecha' => $fecha,
        'estado' => $estado,
        'pagadoDesde' => isset($args['pagado_desde']) ? $args['pagado_desde'] : '',
        'persona' => isset($args['persona']) ? $args['persona'] : 'Familia',
        'notas' => isset($args['notas']) ? $args['notas'] : '',
    ]);
    if (empty($r['ok'])) throw new RuntimeException($r['error']);
    return ['guardado' => mcpCorto($r['movimiento'])];
}

function mcpCorto($m)
{
    $corto = [
        'id' => $m['id'],
        'fecha' => $m['fecha'],
        'tipo' => $m['tipo'],
        'concepto' => $m['concepto'],
        'categoria' => $m['categoria'],
        'monto' => $m['monto'],
        'estado' => $m['estado'],
        'corte' => $m['corte'],
    ];
    if ($m['tipo'] === 'Gasto') $corto['pagadoDesde'] = $m['pagadoDesde'];
    return $corto;
}

// ---------- Mismas cuentas que js/dinero.js y js/dashboard.js ----------

function mcpClaveDe($m)
{
    if (dEsSi($m['corteManual'])) return (string) $m['corteClave'];
    return dCalcularCorte($m['fecha'])['clave'];
}

function mcpClaveAhorro($base)
{
    return ($base === 'mia' || $base === 'fabi') ? 'ahorros ' . $base : 'ahorro ' . $base;
}

function mcpOrigenGasto($m)
{
    $directo = dBaseAhorro($m['pagadoDesde']);
    if ($directo !== '') return mcpClaveAhorro($directo);
    $notas = dNorm($m['notas']);
    if (preg_match('/pagado desde:\s*([^.]+)/', $notas, $marca)) {
        $desde = dBaseAhorro($marca[1]);
        if ($desde !== '') return mcpClaveAhorro($desde);
    }
    if (strpos($notas, 'ahorros fabi') !== false || strpos($notas, 'ahorro fabi') !== false) return 'ahorros fabi';
    if (strpos($notas, 'ahorros mia') !== false || strpos($notas, 'ahorro mia') !== false) return 'ahorros mia';
    return '';
}

function mcpDestinoAhorro($m)
{
    $cat = dNorm($m['categoria']);
    if (strpos($cat, 'ahorros ') !== 0 && strpos($cat, 'ahorro ') !== 0) return '';
    return dBaseAhorro($cat);
}

function mcpReal($m, $monto)
{
    $real = dNumero($m['montoReal']);
    return $real === null ? $monto : $real;
}

function mcpResumir($lista)
{
    $ingresos = 0;
    $recibidos = 0;
    $plan = 0;
    $pagados = 0;
    $pendientes = 0;
    foreach ($lista as $m) {
        $estado = dNorm($m['estado']);
        if ($estado === 'omitido') continue;
        $tipo = dNorm($m['tipo']);
        $monto = dNumero($m['monto']);
        if ($monto === null) $monto = 0;
        if ($tipo === 'ingreso') {
            $ingresos += $monto;
            if ($estado === 'recibido') $recibidos += mcpReal($m, $monto);
        } elseif ($tipo === 'gasto') {
            if ($estado === 'pagado' && mcpOrigenGasto($m) !== '') continue;
            $plan += $monto;
            if ($estado === 'pagado') $pagados += mcpReal($m, $monto);
            if ($estado === 'pendiente' || $estado === 'programado') $pendientes += $monto;
        }
    }
    return [
        'ingresos' => dRedondear($ingresos),
        'ingresosRecibidos' => dRedondear($recibidos),
        'gastosPlanificados' => dRedondear($plan),
        'gastosPagados' => dRedondear($pagados),
        'gastosPendientes' => dRedondear($pendientes),
        'disponibleEsperado' => dRedondear($ingresos - $plan),
    ];
}

function mcpSaldoAhorro($lista, $nombre)
{
    $base = dBaseAhorro($nombre);
    if ($base === '') return 0;
    $total = 0;
    foreach ($lista as $m) {
        $monto = dNumero($m['monto']);
        if ($monto === null) $monto = 0;
        $concepto = dNorm($m['concepto']);
        if (strpos($concepto, 'saldo') === 0 && dBaseAhorro($concepto) === $base) $total += $monto;
        if (dNorm($m['estado']) !== 'pagado') continue;
        $real = mcpReal($m, $monto);
        if (mcpDestinoAhorro($m) === $base) $total += $real;
        if (dBaseAhorro(mcpOrigenGasto($m)) === $base) $total -= $real;
    }
    return dRedondear($total);
}

function mcpEstadoCorte($fecha)
{
    $fecha = trim((string) $fecha);
    if ($fecha === '') $fecha = dHoy();
    $corte = dCalcularCorte($fecha);
    if ($corte['clave'] === '') throw new RuntimeException('La fecha no es válida, usa YYYY-MM-DD');
    $clave = $corte['clave'];
    $lista = datosLeerMovimientos();

    $grupos = [$clave => []];
    foreach ($lista as $m) {
        if (dNorm($m['estado']) === 'omitido') continue;
        $c = mcpClaveDe($m);
        if ($c === '' || $c > $clave) continue;
        $grupos[$c][] = $m;
    }
    ksort($grupos);
    $arrastre = 0;
    $ingresosMasSobrante = 0;
    $disponible = 0;
    foreach ($grupos as $c => $movs) {
        $r = mcpResumir($movs);
        $arrastre = $disponible;
        $ingresosMasSobrante = dRedondear($arrastre + $r['ingresosRecibidos']);
        $disponible = dRedondear($ingresosMasSobrante - $r['gastosPagados']);
    }
    $resumen = mcpResumir($grupos[$clave]);

    $pendientes = [];
    foreach ($grupos[$clave] as $m) {
        $estado = dNorm($m['estado']);
        if (dNorm($m['tipo']) === 'gasto' && ($estado === 'pendiente' || $estado === 'programado')) {
            $pendientes[] = ['id' => $m['id'], 'fecha' => $m['fecha'], 'concepto' => $m['concepto'], 'categoria' => $m['categoria'], 'monto' => $m['monto'], 'estado' => $m['estado']];
        }
    }
    usort($pendientes, function ($a, $b) {
        return strcmp($a['fecha'] ?: '9999', $b['fecha'] ?: '9999');
    });

    $ahorros = [];
    foreach (datosLeerConfig()['ahorros'] as $cuenta) {
        $ahorros['Ahorro ' . $cuenta['nombre']] = mcpSaldoAhorro($lista, $cuenta['nombre']);
    }

    return [
        'hoy' => dHoy(),
        'corte' => ['inicio' => $corte['inicio'], 'fin' => $corte['fin'], 'esElActual' => $clave === dCalcularCorte(dHoy())['clave']],
        'moneda' => 'USD',
        'ingresosMasSobrante' => $ingresosMasSobrante,
        'arrastreDelCorteAnterior' => $arrastre,
        'ingresosEsperados' => $resumen['ingresos'],
        'planificado' => $resumen['gastosPlanificados'],
        'pagado' => $resumen['gastosPagados'],
        'gastosPendientes' => $resumen['gastosPendientes'],
        'disponible' => $disponible,
        'disponibleEsperado' => dRedondear($arrastre + $resumen['disponibleEsperado']),
        'ahorros' => $ahorros,
        'pendientes' => $pendientes,
    ];
}
