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
    'dashboard' => 'hoja',
    'movimientos' => 'hoja',
    'movimiento-crear' => 'hoja',
    'movimiento-actualizar' => 'hoja',
    'movimiento-eliminar' => 'hoja',
    'movimiento-pagar' => 'hoja',
    'recurrentes' => 'hoja',
    'recurrente-guardar' => 'hoja',
    'recurrente-eliminar' => 'hoja',
    'generar' => 'hoja',
    'config' => 'hoja',
    'config-cortes' => 'hoja',
    'config-ahorro' => 'hoja',
    'config-actividad' => 'hoja',
    'mesada' => 'hoja',
    'mesada-agregar' => 'hoja',
    'mesada-quitar' => 'hoja',
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

echo json_encode(llamarHoja($ruta, $datos, $config), JSON_UNESCAPED_UNICODE);

function llamarHoja($accion, $datos, $config)
{
    $url = isset($config['script_url']) ? trim((string) $config['script_url']) : '';
    if ($url === '' || strpos($url, 'https://script.google.com/') !== 0) {
        return [
            'ok' => false,
            'error' => 'Falta la dirección de la hoja en api/config.php. Se copia al publicar el programa de Google.',
        ];
    }
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'error' => 'Este hosting no tiene cURL activado.'];
    }

    $payload = json_encode([
        'clave' => (string) $config['clave'],
        'accion' => $accion,
        'datos' => $datos,
    ], JSON_UNESCAPED_UNICODE);

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json; charset=utf-8']);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 40);
    $crudo = curl_exec($ch);
    $error = curl_error($ch);
    $codigo = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $tamano = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);

    if ($crudo === false || $crudo === '') {
        return ['ok' => false, 'error' => $error !== '' ? $error : 'La hoja no respondió'];
    }

    $cabeceras = substr($crudo, 0, $tamano);
    $respuesta = substr($crudo, $tamano);
    if ($codigo >= 300 && $codigo < 400 && preg_match('/^location:\\s*(\\S+)/mi', $cabeceras, $coincide)) {
        $destino = curl_init($coincide[1]);
        curl_setopt($destino, CURLOPT_HTTPGET, true);
        curl_setopt($destino, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($destino, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($destino, CURLOPT_TIMEOUT, 40);
        $respuesta = curl_exec($destino);
        $error = curl_error($destino);
        $codigo = (int) curl_getinfo($destino, CURLINFO_HTTP_CODE);
        if ($respuesta === false || $respuesta === '') {
            return ['ok' => false, 'error' => $error !== '' ? $error : 'La hoja no respondió'];
        }
    }

    $json = json_decode($respuesta, true);
    if (!is_array($json)) {
        return [
            'ok' => false,
            'error' => 'La hoja respondió algo que no se entiende. Revisa que el programa esté publicado como aplicación web.',
        ];
    }
    if ($codigo >= 400 && empty($json['error'])) {
        $json['ok'] = false;
        $json['error'] = 'La hoja rechazó el pedido';
    }
    return $json;
}
