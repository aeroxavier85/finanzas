<?php
// Lo que comparten el conector (index.php) y la entrada de Claude con OAuth (oauth.php).

$config = require __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../api/datos.php';

const MCP_MAX_FALLOS = 5;
const MCP_BLOQUEO_SEGUNDOS = 86400;
const OAUTH_CODIGO_SEGUNDOS = 600;
const OAUTH_ACCESO_SEGUNDOS = 2592000;   // 30 días
const OAUTH_RENOVAR_SEGUNDOS = 31536000; // 1 año; se alarga cada vez que Claude lo renueva

function mcpPreparar($config)
{
    global $DATOS_CONFIG;
    $DATOS_CONFIG = $config;
    datosAsegurar($config);
    $db = datosDb($config);
    $db->query('CREATE TABLE IF NOT EXISTS mcp_bloqueo (
        id TINYINT NOT NULL PRIMARY KEY,
        fallos INT NOT NULL DEFAULT 0,
        bloqueado_hasta INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB');
    $db->query('INSERT IGNORE INTO mcp_bloqueo (id, fallos, bloqueado_hasta) VALUES (1, 0, 0)');
    $db->query('CREATE TABLE IF NOT EXISTS oauth_clientes (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        secreto_hash VARCHAR(64) NOT NULL DEFAULT \'\',
        nombre VARCHAR(120) NOT NULL DEFAULT \'\',
        redirect_uris TEXT NOT NULL,
        creado INT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    $db->query('CREATE TABLE IF NOT EXISTS oauth_codigos (
        codigo_hash VARCHAR(64) NOT NULL PRIMARY KEY,
        cliente VARCHAR(64) NOT NULL,
        redirect_uri TEXT NOT NULL,
        challenge VARCHAR(128) NOT NULL,
        expira INT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    $db->query('CREATE TABLE IF NOT EXISTS oauth_tokens (
        token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
        tipo VARCHAR(10) NOT NULL,
        cliente VARCHAR(64) NOT NULL,
        expira INT NOT NULL,
        KEY cliente (cliente)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    return $db;
}

// Dirección pública de esta carpeta, por ejemplo https://gofeevo.com/finanzas/mcp
function mcpBase()
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['SERVER_PORT']) && (string) $_SERVER['SERVER_PORT'] === '443')
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
    $host = isset($_SERVER['HTTP_HOST']) ? (string) $_SERVER['HTTP_HOST'] : 'localhost';
    $raiz = isset($_SERVER['DOCUMENT_ROOT']) ? realpath($_SERVER['DOCUMENT_ROOT']) : false;
    $aqui = realpath(__DIR__);
    $ruta = ($raiz && strpos($aqui, $raiz) === 0) ? str_replace('\\', '/', substr($aqui, strlen($raiz))) : '/finanzas/mcp';
    return ($https ? 'https' : 'http') . '://' . $host . $ruta;
}

function mcpRecurso()
{
    return mcpBase() . '/index.php';
}

// Revisa el código de 4 dígitos con el bloqueo de 5 intentos.
// Devuelve ['estado' => 'ok' | 'mal' | 'bloqueado', 'quedan' => intentos que quedan].
function mcpProbarClave($config, $clave)
{
    global $DATOS_CONFIG;
    $db = datosDb($DATOS_CONFIG);
    $fila = datosFilas($db, 'SELECT fallos, bloqueado_hasta FROM mcp_bloqueo WHERE id = 1')[0];
    if ((int) $fila['bloqueado_hasta'] > time()) return ['estado' => 'bloqueado', 'quedan' => 0];

    $esperada = isset($config['clave']) ? (string) $config['clave'] : '';
    if (preg_match('/^\d{4}$/', $esperada) && hash_equals($esperada, trim((string) $clave))) {
        if ((int) $fila['fallos'] > 0) $db->query('UPDATE mcp_bloqueo SET fallos = 0 WHERE id = 1');
        return ['estado' => 'ok', 'quedan' => MCP_MAX_FALLOS];
    }

    $fallos = (int) $fila['fallos'] + 1;
    if ($fallos >= MCP_MAX_FALLOS) {
        datosExec($db, 'UPDATE mcp_bloqueo SET fallos = 0, bloqueado_hasta = ? WHERE id = 1', [time() + MCP_BLOQUEO_SEGUNDOS]);
        return ['estado' => 'bloqueado', 'quedan' => 0];
    }
    datosExec($db, 'UPDATE mcp_bloqueo SET fallos = ? WHERE id = 1', [$fallos]);
    return ['estado' => 'mal', 'quedan' => MCP_MAX_FALLOS - $fallos];
}

function oauthAzar()
{
    return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
}

function oauthHash($texto)
{
    return hash('sha256', (string) $texto);
}

function mcpLeerBearer()
{
    $auth = '';
    foreach (['HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION'] as $k) {
        if (!empty($_SERVER[$k])) $auth = (string) $_SERVER[$k];
    }
    if ($auth === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $nombre => $valor) {
            if (strtolower($nombre) === 'authorization') $auth = (string) $valor;
        }
    }
    return preg_match('/^Bearer\s+(\S+)$/i', $auth, $m) ? $m[1] : '';
}

function oauthTokenValido($token)
{
    global $DATOS_CONFIG;
    $filas = datosFilas(datosDb($DATOS_CONFIG), 'SELECT expira FROM oauth_tokens WHERE token_hash = ? AND tipo = \'acceso\'', [oauthHash($token)]);
    return $filas && (int) $filas[0]['expira'] > time();
}
