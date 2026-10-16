<?php
// Entrada de Claude con OAuth 2.1. Claude se registra solo, te muestra la página
// para escribir el código de la app y recibe un token que guarda.
// Rutas (ver .htaccess): .well-known/*, autorizar, token, registrar.

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

require __DIR__ . '/comun.php';

$que = isset($_GET['que']) ? (string) $_GET['que'] : '';

if ($que !== 'autorizar') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, MCP-Protocol-Version');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

try {
    mcpPreparar($config);
} catch (Throwable $e) {
    oauthJson(500, ['error' => 'server_error', 'error_description' => 'No se pudo abrir la base']);
}

if ($que === 'recurso') {
    oauthJson(200, [
        'resource' => mcpRecurso(),
        'authorization_servers' => [mcpBase()],
        'bearer_methods_supported' => ['header'],
        'scopes_supported' => ['finanzas'],
        'resource_name' => '¿Y la plata?',
    ]);
}
if ($que === 'servidor') {
    $base = mcpBase();
    oauthJson(200, [
        'issuer' => $base,
        'authorization_endpoint' => $base . '/autorizar',
        'token_endpoint' => $base . '/token',
        'registration_endpoint' => $base . '/registrar',
        'response_types_supported' => ['code'],
        'grant_types_supported' => ['authorization_code', 'refresh_token'],
        'code_challenge_methods_supported' => ['S256'],
        'token_endpoint_auth_methods_supported' => ['none', 'client_secret_post', 'client_secret_basic'],
        'scopes_supported' => ['finanzas'],
    ]);
}
if ($que === 'registrar') oauthRegistrar();
if ($que === 'autorizar') oauthAutorizar($config);
if ($que === 'token') oauthToken();
oauthJson(404, ['error' => 'not_found']);

function oauthJson($estado, $datos)
{
    http_response_code($estado);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function oauthFalla($estado, $error, $texto)
{
    oauthJson($estado, ['error' => $error, 'error_description' => $texto]);
}

function oauthCliente($id)
{
    global $DATOS_CONFIG;
    $filas = datosFilas(datosDb($DATOS_CONFIG), 'SELECT * FROM oauth_clientes WHERE id = ?', [(string) $id]);
    if (!$filas) return null;
    $fila = $filas[0];
    $fila['redirect_uris'] = json_decode($fila['redirect_uris'], true) ?: [];
    return $fila;
}

function oauthRedireccionValida($uri)
{
    if (!is_string($uri) || $uri === '' || strlen($uri) > 500 || strpos($uri, '#') !== false) return false;
    $p = parse_url($uri);
    if (!$p || empty($p['scheme'])) return false;
    $esquema = strtolower($p['scheme']);
    if (in_array($esquema, ['javascript', 'data', 'file', 'vbscript'], true)) return false;
    if ($esquema === 'http') {
        $host = isset($p['host']) ? strtolower($p['host']) : '';
        return $host === 'localhost' || $host === '127.0.0.1' || $host === '[::1]';
    }
    return true;
}

// ---------- Registro de clientes (RFC 7591) ----------

function oauthRegistrar()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') oauthFalla(405, 'invalid_request', 'Solo POST');
    $body = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($body)) oauthFalla(400, 'invalid_client_metadata', 'JSON inválido');

    $uris = isset($body['redirect_uris']) && is_array($body['redirect_uris']) ? array_values($body['redirect_uris']) : [];
    if (!$uris || count($uris) > 10) oauthFalla(400, 'invalid_redirect_uri', 'Faltan redirect_uris');
    foreach ($uris as $uri) {
        if (!oauthRedireccionValida($uri)) oauthFalla(400, 'invalid_redirect_uri', 'redirect_uri no permitida');
    }
    $metodo = isset($body['token_endpoint_auth_method']) ? (string) $body['token_endpoint_auth_method'] : 'none';
    if (!in_array($metodo, ['none', 'client_secret_post', 'client_secret_basic'], true)) $metodo = 'none';
    $nombre = trim(isset($body['client_name']) ? (string) $body['client_name'] : '');
    $nombre = function_exists('mb_substr') ? mb_substr($nombre, 0, 120) : substr($nombre, 0, 120);

    $id = 'cli_' . oauthAzar();
    $secreto = $metodo === 'none' ? '' : 'sec_' . oauthAzar();
    global $DATOS_CONFIG;
    datosExec(datosDb($DATOS_CONFIG), 'INSERT INTO oauth_clientes (id, secreto_hash, nombre, redirect_uris, creado) VALUES (?,?,?,?,?)', [
        $id, $secreto === '' ? '' : oauthHash($secreto), $nombre, json_encode($uris, JSON_UNESCAPED_SLASHES), time(),
    ]);

    $respuesta = [
        'client_id' => $id,
        'client_id_issued_at' => time(),
        'client_name' => $nombre,
        'redirect_uris' => $uris,
        'grant_types' => ['authorization_code', 'refresh_token'],
        'response_types' => ['code'],
        'token_endpoint_auth_method' => $metodo,
        'scope' => 'finanzas',
    ];
    if ($secreto !== '') {
        $respuesta['client_secret'] = $secreto;
        $respuesta['client_secret_expires_at'] = 0;
    }
    oauthJson(201, $respuesta);
}

// ---------- Página para escribir el código ----------

function oauthAutorizar($config)
{
    $p = $_SERVER['REQUEST_METHOD'] === 'POST' ? $_POST : $_GET;
    $leer = function ($k) use ($p) {
        return isset($p[$k]) ? trim((string) $p[$k]) : '';
    };

    $cliente = oauthCliente($leer('client_id'));
    if (!$cliente) oauthPagina('Esta conexión no es válida. Vuelve a Claude y conecta de nuevo.', null);
    $redirect = $leer('redirect_uri');
    if ($redirect === '' && count($cliente['redirect_uris']) === 1) $redirect = $cliente['redirect_uris'][0];
    if (!in_array($redirect, $cliente['redirect_uris'], true)) {
        oauthPagina('La dirección de regreso no coincide. Vuelve a Claude y conecta de nuevo.', null);
    }

    $state = $leer('state');
    if ($leer('response_type') !== 'code') oauthVolver($redirect, ['error' => 'unsupported_response_type', 'state' => $state]);
    $challenge = $leer('code_challenge');
    if ($challenge === '' || $leer('code_challenge_method') !== 'S256') {
        oauthVolver($redirect, ['error' => 'invalid_request', 'error_description' => 'Falta PKCE S256', 'state' => $state]);
    }

    $campos = [
        'client_id' => $cliente['id'],
        'redirect_uri' => $redirect,
        'response_type' => 'code',
        'code_challenge' => $challenge,
        'code_challenge_method' => 'S256',
        'state' => $state,
        'scope' => $leer('scope'),
        'resource' => $leer('resource'),
    ];

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') oauthPagina('', $campos, $cliente);

    if (isset($p['cancelar'])) oauthVolver($redirect, ['error' => 'access_denied', 'state' => $state]);

    $r = mcpProbarClave($config, $leer('clave'));
    if ($r['estado'] === 'bloqueado') {
        oauthPagina('Demasiados códigos incorrectos. Quedó bloqueado por 24 horas.', null);
    }
    if ($r['estado'] === 'mal') {
        $texto = $r['quedan'] === 1 ? 'Código incorrecto. Te queda 1 intento.' : 'Código incorrecto. Te quedan ' . $r['quedan'] . ' intentos.';
        oauthPagina($texto, $campos, $cliente);
    }

    $codigo = oauthAzar();
    global $DATOS_CONFIG;
    $db = datosDb($DATOS_CONFIG);
    datosExec($db, 'DELETE FROM oauth_codigos WHERE expira < ?', [time()]);
    datosExec($db, 'INSERT INTO oauth_codigos (codigo_hash, cliente, redirect_uri, challenge, expira) VALUES (?,?,?,?,?)', [
        oauthHash($codigo), $cliente['id'], $redirect, $challenge, time() + OAUTH_CODIGO_SEGUNDOS,
    ]);
    oauthVolver($redirect, ['code' => $codigo, 'state' => $state, 'iss' => mcpBase()]);
}

function oauthVolver($redirect, $params)
{
    if (isset($params['state']) && $params['state'] === '') unset($params['state']);
    $sep = strpos($redirect, '?') === false ? '?' : '&';
    header('Location: ' . $redirect . $sep . http_build_query($params, '', '&', PHP_QUERY_RFC3986), true, 302);
    exit;
}

function oauthPagina($mensaje, $campos, $cliente = null)
{
    $e = function ($s) {
        return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
    };
    header('Content-Type: text/html; charset=utf-8');
    header('X-Frame-Options: DENY');
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
    $quien = 'Claude';
    if ($cliente) {
        $host = parse_url($cliente['redirect_uris'][0], PHP_URL_HOST);
        $quien = $cliente['nombre'] !== '' ? $cliente['nombre'] : ($host ?: 'Una aplicación');
    }
    ?><!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Conectar · ¿Y la plata?</title>
  <style>
    :root { --fondo: #f4efe6; --tinta: #1b3a4b; --suave: #5b6f7a; --borde: #d8cfc0; --error: #b3261e; }
    @media (prefers-color-scheme: dark) { :root { --fondo: #10232e; --tinta: #f4efe6; --suave: #a9b8c0; --borde: #2c4756; --error: #ff8a80; } }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; background: var(--fondo); color: var(--tinta); font: 16px/1.45 system-ui, -apple-system, sans-serif; }
    main { width: 100%; max-width: 360px; text-align: center; }
    h1 { font: italic 600 2.2rem/1.1 Georgia, serif; margin: 0 0 12px; }
    p { margin: 0 0 20px; color: var(--suave); }
    strong { color: var(--tinta); }
    input { width: 100%; font-size: 2rem; letter-spacing: .6em; text-align: center; padding: 12px 0 12px .6em; border: 2px solid var(--borde); border-radius: 14px; background: transparent; color: var(--tinta); }
    input:focus { outline: none; border-color: var(--tinta); }
    button { width: 100%; margin-top: 14px; padding: 14px; border: 0; border-radius: 14px; font-size: 1.05rem; font-weight: 600; cursor: pointer; background: var(--tinta); color: var(--fondo); }
    button.no { background: transparent; color: var(--suave); margin-top: 6px; }
    .error { color: var(--error); font-weight: 600; }
  </style>
</head>
<body>
  <main>
    <h1>¿Y la plata?</h1>
    <?php if ($campos): ?>
      <p><strong><?= $e($quien) ?></strong> quiere ver y anotar en tus finanzas. Escribe el código de la app para permitirlo.</p>
      <?php if ($mensaje !== ''): ?><p class="error" role="alert"><?= $e($mensaje) ?></p><?php endif; ?>
      <form method="post" action="autorizar">
        <?php foreach ($campos as $k => $v): ?><input type="hidden" name="<?= $e($k) ?>" value="<?= $e($v) ?>"><?php endforeach; ?>
        <input name="clave" type="password" inputmode="numeric" pattern="\d{4}" maxlength="4" autocomplete="off" required autofocus aria-label="Código de 4 dígitos">
        <button type="submit">Permitir</button>
        <button class="no" type="submit" name="cancelar" value="1" formnovalidate>Cancelar</button>
      </form>
    <?php else: ?>
      <p class="error" role="alert"><?= $e($mensaje) ?></p>
    <?php endif; ?>
  </main>
</body>
</html>
<?php
    exit;
}

// ---------- Entrega de tokens ----------

function oauthToken()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') oauthFalla(405, 'invalid_request', 'Solo POST');
    $p = $_POST;
    if (!$p) {
        $json = json_decode((string) file_get_contents('php://input'), true);
        if (is_array($json)) $p = $json;
    }
    $leer = function ($k) use ($p) {
        return isset($p[$k]) ? trim((string) $p[$k]) : '';
    };

    $clienteId = $leer('client_id');
    $secreto = $leer('client_secret');
    if (!empty($_SERVER['PHP_AUTH_USER'])) {
        $clienteId = (string) $_SERVER['PHP_AUTH_USER'];
        $secreto = isset($_SERVER['PHP_AUTH_PW']) ? (string) $_SERVER['PHP_AUTH_PW'] : '';
    } else {
        $auth = isset($_SERVER['HTTP_AUTHORIZATION']) ? (string) $_SERVER['HTTP_AUTHORIZATION'] : (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION']) ? (string) $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] : '');
        if (preg_match('/^Basic\s+(\S+)$/i', $auth, $m)) {
            $par = explode(':', (string) base64_decode($m[1]), 2);
            $clienteId = urldecode($par[0]);
            $secreto = isset($par[1]) ? urldecode($par[1]) : '';
        }
    }
    $cliente = oauthCliente($clienteId);
    if (!$cliente) oauthFalla(401, 'invalid_client', 'Cliente desconocido');
    if ($cliente['secreto_hash'] !== '' && !hash_equals($cliente['secreto_hash'], oauthHash($secreto))) {
        oauthFalla(401, 'invalid_client', 'Secreto incorrecto');
    }

    global $DATOS_CONFIG;
    $db = datosDb($DATOS_CONFIG);
    datosExec($db, 'DELETE FROM oauth_tokens WHERE expira < ?', [time()]);
    $tipo = $leer('grant_type');

    if ($tipo === 'authorization_code') {
        $hash = oauthHash($leer('code'));
        $filas = datosFilas($db, 'SELECT * FROM oauth_codigos WHERE codigo_hash = ?', [$hash]);
        datosExec($db, 'DELETE FROM oauth_codigos WHERE codigo_hash = ?', [$hash]);
        if (!$filas) oauthFalla(400, 'invalid_grant', 'El código no es válido');
        $fila = $filas[0];
        if ((int) $fila['expira'] < time()) oauthFalla(400, 'invalid_grant', 'El código venció');
        if ($fila['cliente'] !== $cliente['id']) oauthFalla(400, 'invalid_grant', 'El código es de otro cliente');
        if ($leer('redirect_uri') !== '' && $leer('redirect_uri') !== $fila['redirect_uri']) oauthFalla(400, 'invalid_grant', 'redirect_uri distinta');
        $verificador = $leer('code_verifier');
        $calculado = rtrim(strtr(base64_encode(hash('sha256', $verificador, true)), '+/', '-_'), '=');
        if ($verificador === '' || !hash_equals($fila['challenge'], $calculado)) oauthFalla(400, 'invalid_grant', 'PKCE no coincide');
        oauthEntregar($cliente['id']);
    }

    if ($tipo === 'refresh_token') {
        $hash = oauthHash($leer('refresh_token'));
        $filas = datosFilas($db, 'SELECT * FROM oauth_tokens WHERE token_hash = ? AND tipo = \'renovar\'', [$hash]);
        if (!$filas || $filas[0]['cliente'] !== $cliente['id'] || (int) $filas[0]['expira'] < time()) {
            oauthFalla(400, 'invalid_grant', 'Conecta de nuevo');
        }
        datosExec($db, 'DELETE FROM oauth_tokens WHERE token_hash = ?', [$hash]);
        oauthEntregar($cliente['id']);
    }

    oauthFalla(400, 'unsupported_grant_type', 'grant_type no soportado');
}

function oauthEntregar($clienteId)
{
    global $DATOS_CONFIG;
    $db = datosDb($DATOS_CONFIG);
    $acceso = 'fz_' . oauthAzar();
    $renovar = 'fzr_' . oauthAzar();
    datosExec($db, 'INSERT INTO oauth_tokens (token_hash, tipo, cliente, expira) VALUES (?,?,?,?)', [oauthHash($acceso), 'acceso', $clienteId, time() + OAUTH_ACCESO_SEGUNDOS]);
    datosExec($db, 'INSERT INTO oauth_tokens (token_hash, tipo, cliente, expira) VALUES (?,?,?,?)', [oauthHash($renovar), 'renovar', $clienteId, time() + OAUTH_RENOVAR_SEGUNDOS]);
    oauthJson(200, [
        'access_token' => $acceso,
        'token_type' => 'Bearer',
        'expires_in' => OAUTH_ACCESO_SEGUNDOS,
        'refresh_token' => $renovar,
        'scope' => 'finanzas',
    ]);
}
