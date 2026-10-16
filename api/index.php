<?php

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

$config = require __DIR__ . '/config.php';

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (isset($_SERVER['SERVER_PORT']) && (string) $_SERVER['SERVER_PORT'] === '443');

if (PHP_VERSION_ID >= 70300) {
    session_set_cookie_params([
        'lifetime' => 60 * 60 * 24 * 30,
        'path' => '/',
        'secure' => $https,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
} else {
    session_set_cookie_params(60 * 60 * 24 * 30, '/', '', $https, true);
}

session_start();

$crudo = file_get_contents('php://input');
$body = json_decode($crudo ? $crudo : '', true);
if (!is_array($body)) {
    $body = [];
}

$datos = isset($body['datos']) && is_array($body['datos']) ? $body['datos'] : [];
$ruta = '';
if (isset($body['ruta'])) {
    $ruta = (string) $body['ruta'];
} elseif (isset($_GET['ruta'])) {
    $ruta = (string) $_GET['ruta'];
}

$rutas = [
    'salud' => 'local',
    'login' => 'local',
    'logout' => 'local',
    'yo' => 'local',
    'dashboard' => 'datos',
    'movimientos' => 'datos',
    'movimiento-crear' => 'datos',
    'movimiento-actualizar' => 'datos',
    'movimiento-eliminar' => 'datos',
    'movimiento-pagar' => 'datos',
    'recurrentes' => 'datos',
    'recurrente-guardar' => 'datos',
    'recurrente-eliminar' => 'datos',
    'generar' => 'datos',
    'config' => 'datos',
    'config-cortes' => 'datos',
    'config-ahorro' => 'datos',
    'config-actividad' => 'datos',
    'mesada' => 'datos',
    'mesada-agregar' => 'datos',
    'mesada-quitar' => 'datos',
];

if (!isset($rutas[$ruta])) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'Ruta desconocida'], JSON_UNESCAPED_UNICODE);
    exit;
}

$publicas = ['salud', 'login'];
if (!in_array($ruta, $publicas, true) && empty($_SESSION['ok'])) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Entra de nuevo'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($rutas[$ruta] === 'local') {
    if ($ruta === 'salud') {
        echo json_encode(['ok' => true, 'php' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($ruta === 'yo') {
        echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($ruta === 'logout') {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
        }
        session_destroy();
        echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $clave = isset($datos['clave']) ? trim((string) $datos['clave']) : '';
    $esperada = isset($config['clave']) ? (string) $config['clave'] : '';
    if (!preg_match('/^\d{4}$/', $clave) || !preg_match('/^\d{4}$/', $esperada) || !hash_equals($esperada, $clave)) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'Código incorrecto'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    session_regenerate_id(true);
    $_SESSION['ok'] = true;
    echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

require_once __DIR__ . '/datos.php';
echo json_encode(datosAccion($ruta, $datos, $config), JSON_UNESCAPED_UNICODE);
