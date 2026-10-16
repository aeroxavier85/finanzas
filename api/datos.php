<?php

function datosAccion($accion, $datos, $config)
{
    global $DATOS_CONFIG;
    $DATOS_CONFIG = $config;
    try {
        datosAsegurar($config);
        if ($accion === 'dashboard') return datosDashboard($datos);
        if ($accion === 'movimientos') return datosMovimientos($datos);
        if ($accion === 'movimiento-crear') return datosCrearMovimiento($datos);
        if ($accion === 'movimiento-actualizar') return datosActualizarMovimiento($datos);
        if ($accion === 'movimiento-eliminar') return datosEliminarMovimiento($datos);
        if ($accion === 'movimiento-pagar') return datosPagarMovimiento($datos);
        if ($accion === 'recurrentes') return ['ok' => true, 'recurrentes' => datosLeerRecurrentes()];
        if ($accion === 'recurrente-guardar') return datosGuardarRecurrente($datos);
        if ($accion === 'recurrente-eliminar') return datosEliminarRecurrente($datos);
        if ($accion === 'generar') return datosGenerar($datos);
        if ($accion === 'config') return ['ok' => true, 'config' => datosLeerConfig()];
        if ($accion === 'config-cortes') return datosGuardarCortes($datos);
        if ($accion === 'config-ahorro') return datosGuardarAhorro($datos);
        if ($accion === 'config-actividad') return datosGuardarActividad($datos);
        if ($accion === 'mesada') return ['ok' => true, 'items' => datosLeerMesada()];
        if ($accion === 'mesada-agregar') return datosAgregarMesada($datos);
        if ($accion === 'mesada-quitar') return datosQuitarMesada($datos);
        return ['ok' => false, 'error' => 'Acción desconocida'];
    } catch (Throwable $e) {
        return ['ok' => false, 'error' => $e->getMessage()];
    }
}

function datosDb($config)
{
    static $db = null;
    if ($db instanceof mysqli) return $db;
    $host = isset($config['db_host']) ? (string) $config['db_host'] : '';
    $name = isset($config['db_name']) ? (string) $config['db_name'] : '';
    $user = isset($config['db_user']) ? (string) $config['db_user'] : '';
    $pass = isset($config['db_pass']) ? (string) $config['db_pass'] : '';
    $port = isset($config['db_port']) ? (int) $config['db_port'] : 3306;
    if ($host === '' || $name === '' || $user === '') {
        throw new RuntimeException('Falta la base de datos en api/config.php');
    }
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $db = new mysqli($host, $user, $pass, $name, $port);
    $db->set_charset('utf8mb4');
    return $db;
}

function datosAsegurar($config)
{
    static $listo = false;
    if ($listo) return;
    $db = datosDb($config);
    $db->query("CREATE TABLE IF NOT EXISTS movimientos (
        id VARCHAR(40) NOT NULL PRIMARY KEY,
        fecha DATE NULL,
        tipo VARCHAR(20) NOT NULL DEFAULT '',
        concepto VARCHAR(255) NOT NULL DEFAULT '',
        categoria VARCHAR(120) NOT NULL DEFAULT '',
        monto DECIMAL(12,2) NOT NULL DEFAULT 0,
        monto_real DECIMAL(12,2) NULL,
        estado VARCHAR(20) NOT NULL DEFAULT '',
        corte VARCHAR(80) NOT NULL DEFAULT '',
        corte_clave VARCHAR(20) NOT NULL DEFAULT '',
        corte_manual VARCHAR(8) NOT NULL DEFAULT 'No',
        recurrente VARCHAR(8) NOT NULL DEFAULT 'No',
        id_recurrente VARCHAR(40) NOT NULL DEFAULT '',
        periodo VARCHAR(10) NOT NULL DEFAULT '',
        fecha_pago DATE NULL,
        persona VARCHAR(80) NOT NULL DEFAULT '',
        notas TEXT NULL,
        pagado_desde VARCHAR(80) NOT NULL DEFAULT ''
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $db->query("CREATE TABLE IF NOT EXISTS recurrentes (
        id VARCHAR(40) NOT NULL PRIMARY KEY,
        tipo VARCHAR(20) NOT NULL DEFAULT 'Gasto',
        concepto VARCHAR(255) NOT NULL DEFAULT '',
        categoria VARCHAR(120) NOT NULL DEFAULT '',
        monto DECIMAL(12,2) NOT NULL DEFAULT 0,
        dia SMALLINT NULL,
        persona VARCHAR(80) NOT NULL DEFAULT 'Familia',
        activo VARCHAR(8) NOT NULL DEFAULT 'Sí',
        notas TEXT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $db->query("CREATE TABLE IF NOT EXISTS configuracion (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        grupo VARCHAR(40) NOT NULL,
        clave VARCHAR(80) NOT NULL DEFAULT '',
        valor VARCHAR(255) NOT NULL DEFAULT '',
        extra VARCHAR(255) NOT NULL DEFAULT '',
        activo VARCHAR(8) NOT NULL DEFAULT 'Sí',
        KEY grupo_clave (grupo, clave)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $db->query("CREATE TABLE IF NOT EXISTS mesada (
        id VARCHAR(40) NOT NULL PRIMARY KEY,
        nina VARCHAR(20) NOT NULL,
        actividad VARCHAR(80) NOT NULL,
        valor DECIMAL(12,2) NOT NULL,
        fecha DATE NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $listo = true;
}

function datosExec($db, $sql, $params = [])
{
    $st = $db->prepare($sql);
    if ($params) {
        $types = str_repeat('s', count($params));
        $refs = [];
        foreach ($params as $i => $p) {
            $params[$i] = $p === null ? '' : (string) $p;
            $refs[] = &$params[$i];
        }
        $st->bind_param($types, ...$refs);
    }
    $st->execute();
    return $st;
}

function datosFilas($db, $sql, $params = [])
{
    $res = datosExec($db, $sql, $params)->get_result();
    $filas = [];
    while ($fila = $res->fetch_assoc()) $filas[] = $fila;
    return $filas;
}

function dNorm($v)
{
    $s = strtr(trim((string) $v), [
        'Á' => 'á', 'É' => 'é', 'Í' => 'í', 'Ó' => 'ó', 'Ú' => 'ú', 'Ñ' => 'ñ', 'Ü' => 'ü',
        'À' => 'à', 'È' => 'è', 'Ì' => 'ì', 'Ò' => 'ò', 'Ù' => 'ù',
    ]);
    return strtolower($s);
}

function dNumero($v)
{
    if ($v === null || $v === '') return null;
    if (is_int($v) || is_float($v)) return is_finite($v) ? (float) $v : null;
    $s = str_replace(['$', ' '], '', (string) $v);
    $coma = strrpos($s, ',');
    $punto = strrpos($s, '.');
    if ($coma !== false && $punto !== false) {
        if ($coma > $punto) $s = str_replace(',', '.', str_replace('.', '', $s));
        else $s = str_replace(',', '', $s);
    } elseif ($coma !== false) {
        $s = str_replace(',', '.', $s);
    }
    if (!is_numeric($s)) return null;
    return (float) $s;
}

function dRedondear($n)
{
    return round(((float) $n) * 100) / 100;
}

function dEsSi($v)
{
    $s = dNorm($v);
    return $s === 'sí' || $s === 'si' || $s === 'yes' || $s === '1' || $s === 'true';
}

function dActivo($v)
{
    if ($v === '' || $v === null) return true;
    return dEsSi($v);
}

function dTipo($v)
{
    return dNorm($v) === 'ingreso' ? 'Ingreso' : 'Gasto';
}

function dEstado($tipo, $estado)
{
    $e = dNorm($estado);
    if ($tipo === 'Ingreso') {
        if ($e === 'esperado') return 'Esperado';
        if ($e === 'recibido') return 'Recibido';
        return '';
    }
    if ($e === 'pendiente') return 'Pendiente';
    if ($e === 'programado') return 'Programado';
    if ($e === 'pagado') return 'Pagado';
    if ($e === 'omitido') return 'Omitido';
    return '';
}

function dBaseAhorro($v)
{
    $o = dNorm($v);
    $o = preg_replace('/^pagado desde:\s*/', '', $o);
    $o = preg_replace('/^saldo\s+/', '', $o);
    $o = preg_replace('/^ahorros?\s+/', '', $o);
    if ($o === 'fabiana') return 'fabi';
    if ($o === '' || $o === 'presupuesto familiar' || $o === 'de la casa' || $o === 'casa' || $o === 'la casa') return '';
    return $o;
}

function dOrigen($v)
{
    $o = dNorm($v);
    if ($o === '' || $o === 'presupuesto familiar' || $o === 'de la casa' || $o === 'casa' || $o === 'la casa') return 'De la casa';
    if ($o === 'ahorros mia' || $o === 'ahorro mia' || $o === 'mia') return 'Ahorros Mia';
    if ($o === 'ahorros fabi' || $o === 'ahorro fabi' || $o === 'fabi' || $o === 'fabiana' || $o === 'ahorros fabiana' || $o === 'ahorro fabiana') return 'Ahorros Fabi';
    $limpio = trim(preg_replace('/^ahorros?\s+/i', '', (string) $v));
    if ($limpio === '') return 'De la casa';
    return 'Ahorro ' . $limpio;
}

function dNuevoId($prefijo)
{
    return $prefijo . '-' . strtoupper(bin2hex(random_bytes(4)));
}

function dHoy()
{
    return date('Y-m-d');
}

function dFecha($v)
{
    $t = trim((string) $v);
    if ($t === '') return null;
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $t, $m)) return null;
    if (!checkdate((int) $m[2], (int) $m[3], (int) $m[1])) return null;
    return $m[1] . '-' . $m[2] . '-' . $m[3];
}

function dDiaValido($n)
{
    if (!is_numeric($n)) return null;
    $n = (int) round((float) $n);
    if ($n < 1 || $n > 28) return null;
    return $n;
}

function dDiasCorte()
{
    $general = datosLeerConfig()['general'];
    $a = dDiaValido(isset($general['corteDia1']) ? $general['corteDia1'] : 10);
    $b = dDiaValido(isset($general['corteDia2']) ? $general['corteDia2'] : 25);
    if ($a === null) $a = 10;
    if ($b === null) $b = 25;
    if ($a === $b) return [10, 25];
    return $a < $b ? [$a, $b] : [$b, $a];
}

function dPartes($fecha)
{
    $f = dFecha($fecha);
    if ($f === null) return null;
    return [(int) substr($f, 0, 4), (int) substr($f, 5, 2), (int) substr($f, 8, 2)];
}

function dIso($anio, $mes, $dia)
{
    return sprintf('%04d-%02d-%02d', $anio, $mes, $dia);
}

function dSumarMes($anio, $mes, $delta)
{
    $indice = $mes - 1 + $delta;
    return [$anio + (int) floor($indice / 12), (($indice % 12) + 12) % 12 + 1];
}

function dCalcularCorte($fecha)
{
    $p = dPartes($fecha);
    if (!$p) return ['etiqueta' => 'Sin asignar', 'clave' => '', 'inicio' => '', 'fin' => ''];
    $dias = dDiasCorte();
    $primero = $dias[0];
    $segundo = $dias[1];
    if ($p[2] >= $segundo) {
        $sig = dSumarMes($p[0], $p[1], 1);
        $finDia = $primero - 1;
        if ($finDia < 1) {
            $ant = dSumarMes($sig[0], $sig[1], -1);
            $fin = [$ant[0], $ant[1], (int) date('t', strtotime(dIso($ant[0], $ant[1], 1)))];
        } else {
            $fin = [$sig[0], $sig[1], $finDia];
        }
        $inicio = dIso($p[0], $p[1], $segundo);
        $finIso = dIso($fin[0], $fin[1], $fin[2]);
    } elseif ($p[2] >= $primero) {
        $inicio = dIso($p[0], $p[1], $primero);
        $finIso = dIso($p[0], $p[1], $segundo - 1);
    } else {
        $ant = dSumarMes($p[0], $p[1], -1);
        $inicio = dIso($ant[0], $ant[1], $segundo);
        $finIso = dIso($p[0], $p[1], $primero - 1);
    }
    $ei = dPartes($inicio);
    $ef = dPartes($finIso);
    $etiqueta = sprintf('%02d/%02d/%04d–%02d/%02d/%04d', $ei[2], $ei[1], $ei[0], $ef[2], $ef[1], $ef[0]);
    return ['etiqueta' => $etiqueta, 'clave' => $inicio, 'inicio' => $inicio, 'fin' => $finIso];
}

function dFechaEnCorte($corte, $dia)
{
    if (!$corte['clave'] || $corte['inicio'] === '' || $corte['fin'] === '') return '';
    if ($dia === '' || $dia === null) return '';
    $n = (int) $dia;
    if ($n < 1) return '';
    $inicio = dPartes($corte['inicio']);
    $fin = dPartes($corte['fin']);
    if (!$inicio || !$fin) return '';
    $meses = [[$inicio[0], $inicio[1]]];
    if ($fin[0] !== $inicio[0] || $fin[1] !== $inicio[1]) $meses[] = [$fin[0], $fin[1]];
    foreach ($meses as $mes) {
        $ultimo = (int) date('t', strtotime(dIso($mes[0], $mes[1], 1)));
        $diaMes = min($n, $ultimo);
        $fecha = dIso($mes[0], $mes[1], $diaMes);
        if (dCalcularCorte($fecha)['clave'] === $corte['clave']) return $fecha;
    }
    return '';
}

function dAplicarCorte(&$m, $datos)
{
    if ($datos && dEsSi(isset($datos['corteManual']) ? $datos['corteManual'] : '')) {
        $m['corteManual'] = 'Sí';
        if (empty($datos['corteClave'])) {
            $m['corte'] = 'Sin asignar';
            $m['corteClave'] = '';
        } else {
            $m['corteClave'] = (string) $datos['corteClave'];
            $m['corte'] = !empty($datos['corte']) ? (string) $datos['corte'] : (string) $datos['corteClave'];
        }
        return;
    }
    $m['corteManual'] = 'No';
    $corte = dCalcularCorte($m['fecha']);
    $m['corte'] = $corte['etiqueta'];
    $m['corteClave'] = $corte['clave'];
}

function dPublicarMovimiento($fila)
{
    return [
        'id' => (string) $fila['id'],
        'fecha' => $fila['fecha'] ? (string) $fila['fecha'] : '',
        'tipo' => (string) $fila['tipo'],
        'concepto' => (string) $fila['concepto'],
        'categoria' => (string) $fila['categoria'],
        'monto' => dRedondear($fila['monto']),
        'montoReal' => $fila['monto_real'] === null ? '' : dRedondear($fila['monto_real']),
        'estado' => (string) $fila['estado'],
        'corte' => (string) $fila['corte'],
        'corteClave' => (string) $fila['corte_clave'],
        'corteManual' => $fila['corte_manual'] !== '' ? (string) $fila['corte_manual'] : 'No',
        'recurrente' => $fila['recurrente'] !== '' ? (string) $fila['recurrente'] : 'No',
        'idRecurrente' => (string) $fila['id_recurrente'],
        'periodo' => (string) $fila['periodo'],
        'fechaPago' => $fila['fecha_pago'] ? (string) $fila['fecha_pago'] : '',
        'persona' => (string) $fila['persona'],
        'notas' => $fila['notas'] === null ? '' : (string) $fila['notas'],
        'pagadoDesde' => (string) $fila['pagado_desde'],
    ];
}

function datosLeerMovimientos()
{
    global $DATOS_CONFIG;
    $filas = datosFilas(datosDb($DATOS_CONFIG), 'SELECT * FROM movimientos');
    return array_map('dPublicarMovimiento', $filas);
}

function dPasaFiltro($m, $f)
{
    $f = $f ?: [];
    if (isset($f['mes']) && $f['mes'] === 'sin-fecha') {
        if ($m['fecha']) return false;
    } elseif (!empty($f['mes']) && (!$m['fecha'] || substr($m['fecha'], 0, 7) !== $f['mes'])) {
        return false;
    }
    if (isset($f['corte']) && $f['corte'] === 'sin-asignar') {
        if ($m['corteClave']) return false;
    } elseif (!empty($f['corte']) && $m['corteClave'] !== $f['corte']) {
        return false;
    }
    if (!empty($f['tipo']) && dNorm($m['tipo']) !== dNorm($f['tipo'])) return false;
    if (!empty($f['categoria']) && dNorm($m['categoria']) !== dNorm($f['categoria'])) return false;
    if (!empty($f['estado']) && dNorm($m['estado']) !== dNorm($f['estado'])) return false;
    if (!empty($f['persona']) && dNorm($m['persona']) !== dNorm($f['persona'])) return false;
    if (isset($f['recurrente']) && $f['recurrente'] === 'si' && !dEsSi($m['recurrente'])) return false;
    if (isset($f['recurrente']) && $f['recurrente'] === 'no' && dEsSi($m['recurrente'])) return false;
    return true;
}

function datosMovimientos($datos)
{
    $lista = array_values(array_filter(datosLeerMovimientos(), function ($m) use ($datos) {
        return dPasaFiltro($m, $datos);
    }));
    usort($lista, function ($a, $b) {
        return strcmp($a['fecha'] === '' ? '9999' : $a['fecha'], $b['fecha'] === '' ? '9999' : $b['fecha']);
    });
    return ['ok' => true, 'movimientos' => $lista];
}

function dValidarMovimiento($datos, $base)
{
    $m = $base ?: [];
    $tipo = dTipo(isset($datos['tipo']) ? $datos['tipo'] : (isset($m['tipo']) ? $m['tipo'] : ''));
    $concepto = trim((string) (array_key_exists('concepto', $datos) ? $datos['concepto'] : (isset($m['concepto']) ? $m['concepto'] : '')));
    if ($concepto === '') throw new RuntimeException('Escribe el concepto');
    $monto = array_key_exists('monto', $datos) ? dNumero($datos['monto']) : dNumero(isset($m['monto']) ? $m['monto'] : null);
    if ($monto === null || $monto < 0) throw new RuntimeException('Escribe el monto');
    $estado = dEstado($tipo, array_key_exists('estado', $datos) ? $datos['estado'] : (isset($m['estado']) ? $m['estado'] : ''));
    if ($estado === '') $estado = $tipo === 'Ingreso' ? 'Esperado' : 'Pendiente';
    $fecha = array_key_exists('fecha', $datos) ? trim((string) $datos['fecha']) : (isset($m['fecha']) ? $m['fecha'] : '');
    if ($fecha !== '' && dFecha($fecha) === null) throw new RuntimeException('La fecha no es válida');
    $montoReal = array_key_exists('montoReal', $datos) ? dNumero($datos['montoReal']) : (array_key_exists('montoReal', $m) && $m['montoReal'] !== '' ? dNumero($m['montoReal']) : null);
    return [
        'id' => isset($m['id']) ? $m['id'] : '',
        'fecha' => $fecha,
        'tipo' => $tipo,
        'concepto' => $concepto,
        'categoria' => trim((string) (array_key_exists('categoria', $datos) ? $datos['categoria'] : (isset($m['categoria']) ? $m['categoria'] : ''))),
        'monto' => dRedondear($monto),
        'montoReal' => $montoReal === null ? '' : dRedondear($montoReal),
        'estado' => $estado,
        'corte' => isset($m['corte']) ? $m['corte'] : '',
        'corteClave' => isset($m['corteClave']) ? $m['corteClave'] : '',
        'corteManual' => isset($m['corteManual']) ? $m['corteManual'] : 'No',
        'recurrente' => isset($m['recurrente']) ? $m['recurrente'] : 'No',
        'idRecurrente' => isset($m['idRecurrente']) ? $m['idRecurrente'] : '',
        'periodo' => isset($m['periodo']) ? $m['periodo'] : '',
        'fechaPago' => isset($m['fechaPago']) ? $m['fechaPago'] : '',
        'persona' => trim((string) (array_key_exists('persona', $datos) ? $datos['persona'] : (isset($m['persona']) ? $m['persona'] : 'Familia'))) ?: 'Familia',
        'notas' => trim((string) (array_key_exists('notas', $datos) ? $datos['notas'] : (isset($m['notas']) ? $m['notas'] : ''))),
        'pagadoDesde' => $tipo === 'Gasto'
            ? dOrigen(array_key_exists('pagadoDesde', $datos) ? $datos['pagadoDesde'] : (isset($m['pagadoDesde']) ? $m['pagadoDesde'] : ''))
            : '',
    ];
}

function dGuardarMovimiento($m)
{
    global $DATOS_CONFIG;
    $db = datosDb($DATOS_CONFIG);
    datosExec($db, 'REPLACE INTO movimientos
        (id, fecha, tipo, concepto, categoria, monto, monto_real, estado, corte, corte_clave, corte_manual, recurrente, id_recurrente, periodo, fecha_pago, persona, notas, pagado_desde)
        VALUES (?, NULLIF(?, \'\'),?,?,?,?,NULLIF(?, \'\'),?,?,?,?,?,?,?,NULLIF(?, \'\'),?,?,?)', [
        $m['id'],
        $m['fecha'],
        $m['tipo'],
        $m['concepto'],
        $m['categoria'],
        (string) $m['monto'],
        $m['montoReal'] === '' ? '' : (string) $m['montoReal'],
        $m['estado'],
        $m['corte'],
        $m['corteClave'],
        $m['corteManual'],
        $m['recurrente'],
        $m['idRecurrente'],
        $m['periodo'],
        $m['fechaPago'] === '' ? '' : $m['fechaPago'],
        $m['persona'],
        $m['notas'],
        $m['pagadoDesde'],
    ]);
}

function dBuscarMovimiento($id)
{
    foreach (datosLeerMovimientos() as $m) {
        if ($m['id'] === $id) return $m;
    }
    return null;
}

function datosCrearMovimiento($datos)
{
    $m = dValidarMovimiento($datos, null);
    $m['id'] = dNuevoId('MOV');
    $m['recurrente'] = 'No';
    $m['idRecurrente'] = '';
    $m['periodo'] = '';
    $m['fechaPago'] = '';
    dAplicarCorte($m, $datos);
    dGuardarMovimiento($m);
    return ['ok' => true, 'movimiento' => $m];
}

function datosActualizarMovimiento($datos)
{
    $actual = dBuscarMovimiento((string) (isset($datos['id']) ? $datos['id'] : ''));
    if (!$actual) return ['ok' => false, 'error' => 'No se encontró el movimiento'];
    $m = dValidarMovimiento($datos, $actual);
    $m['id'] = $actual['id'];
    $m['recurrente'] = $actual['recurrente'] ?: 'No';
    $m['idRecurrente'] = $actual['idRecurrente'];
    $m['periodo'] = $actual['periodo'];
    $m['fechaPago'] = array_key_exists('fechaPago', $datos) ? trim((string) $datos['fechaPago']) : $actual['fechaPago'];
    if (!(dEsSi(isset($datos['corteManual']) ? $datos['corteManual'] : '')) && dEsSi($actual['corteManual']) && !array_key_exists('corteManual', $datos)) {
        $m['corte'] = $actual['corte'];
        $m['corteClave'] = $actual['corteClave'];
        $m['corteManual'] = 'Sí';
    } else {
        dAplicarCorte($m, $datos);
    }
    dGuardarMovimiento($m);
    return ['ok' => true, 'movimiento' => $m];
}

function datosEliminarMovimiento($datos)
{
    global $DATOS_CONFIG;
    $id = (string) (isset($datos['id']) ? $datos['id'] : '');
    if ($id === '') return ['ok' => false, 'error' => 'No se encontró el movimiento'];
    $st = datosExec(datosDb($DATOS_CONFIG), 'DELETE FROM movimientos WHERE id = ?', [$id]);
    if ($st->affected_rows < 1) return ['ok' => false, 'error' => 'No se encontró el movimiento'];
    return ['ok' => true];
}

function datosPagarMovimiento($datos)
{
    $actual = dBuscarMovimiento((string) (isset($datos['id']) ? $datos['id'] : ''));
    if (!$actual) return ['ok' => false, 'error' => 'No se encontró el movimiento'];
    $actual['estado'] = $actual['tipo'] === 'Ingreso' ? 'Recibido' : 'Pagado';
    if ($actual['tipo'] !== 'Ingreso') {
        $actual['pagadoDesde'] = dOrigen(array_key_exists('pagadoDesde', $datos) ? $datos['pagadoDesde'] : $actual['pagadoDesde']);
    }
    if ($actual['fechaPago'] === '') $actual['fechaPago'] = dHoy();
    if ($actual['montoReal'] === '') $actual['montoReal'] = $actual['monto'];
    dGuardarMovimiento($actual);
    return ['ok' => true, 'movimiento' => $actual];
}

function dPublicarRecurrente($fila)
{
    return [
        'id' => (string) $fila['id'],
        'tipo' => $fila['tipo'] !== '' ? (string) $fila['tipo'] : 'Gasto',
        'concepto' => (string) $fila['concepto'],
        'categoria' => (string) $fila['categoria'],
        'monto' => dRedondear($fila['monto']),
        'dia' => $fila['dia'] === null ? '' : (int) $fila['dia'],
        'persona' => (string) $fila['persona'],
        'activo' => dActivo($fila['activo']) ? 'Sí' : 'No',
        'notas' => $fila['notas'] === null ? '' : (string) $fila['notas'],
    ];
}

function datosLeerRecurrentes()
{
    global $DATOS_CONFIG;
    return array_map('dPublicarRecurrente', datosFilas(datosDb($DATOS_CONFIG), 'SELECT * FROM recurrentes'));
}

function datosGuardarRecurrente($datos)
{
    $actual = null;
    if (!empty($datos['id'])) {
        foreach (datosLeerRecurrentes() as $r) {
            if ($r['id'] === $datos['id']) $actual = $r;
        }
        if (!$actual) return ['ok' => false, 'error' => 'No se encontró la plantilla'];
    }
    $base = $actual ?: [];
    $concepto = trim((string) (array_key_exists('concepto', $datos) ? $datos['concepto'] : (isset($base['concepto']) ? $base['concepto'] : '')));
    if ($concepto === '') throw new RuntimeException('Escribe el concepto');
    $monto = array_key_exists('monto', $datos) ? dNumero($datos['monto']) : dNumero(isset($base['monto']) ? $base['monto'] : null);
    if ($monto === null || $monto < 0) throw new RuntimeException('Escribe el monto habitual');
    $dia = array_key_exists('dia', $datos) ? $datos['dia'] : (isset($base['dia']) ? $base['dia'] : '');
    if ($dia === '' || $dia === null) $dia = '';
    else {
        $dia = (int) $dia;
        if ($dia < 1 || $dia > 31) throw new RuntimeException('El día debe estar entre 1 y 31');
    }
    $r = [
        'id' => !empty($base['id']) ? $base['id'] : dNuevoId('REC'),
        'tipo' => dTipo(isset($datos['tipo']) ? $datos['tipo'] : (isset($base['tipo']) ? $base['tipo'] : 'Gasto')),
        'concepto' => $concepto,
        'categoria' => trim((string) (array_key_exists('categoria', $datos) ? $datos['categoria'] : (isset($base['categoria']) ? $base['categoria'] : ''))),
        'monto' => dRedondear($monto),
        'dia' => $dia,
        'persona' => trim((string) (array_key_exists('persona', $datos) ? $datos['persona'] : (isset($base['persona']) ? $base['persona'] : 'Familia'))) ?: 'Familia',
        'activo' => array_key_exists('activo', $datos) ? (dEsSi($datos['activo']) ? 'Sí' : 'No') : (isset($base['activo']) ? $base['activo'] : 'Sí'),
        'notas' => trim((string) (array_key_exists('notas', $datos) ? $datos['notas'] : (isset($base['notas']) ? $base['notas'] : ''))),
    ];
    global $DATOS_CONFIG;
    datosExec(datosDb($DATOS_CONFIG), 'REPLACE INTO recurrentes (id, tipo, concepto, categoria, monto, dia, persona, activo, notas) VALUES (?,?,?,?,?,NULLIF(?, \'\'),?,?,?)', [
        $r['id'], $r['tipo'], $r['concepto'], $r['categoria'], (string) $r['monto'], $r['dia'] === '' ? '' : (string) $r['dia'], $r['persona'], $r['activo'], $r['notas'],
    ]);
    return ['ok' => true, 'recurrente' => $r];
}

function datosEliminarRecurrente($datos)
{
    global $DATOS_CONFIG;
    $id = (string) (isset($datos['id']) ? $datos['id'] : '');
    if ($id === '') return ['ok' => false, 'error' => 'No se encontró la plantilla'];
    $st = datosExec(datosDb($DATOS_CONFIG), 'DELETE FROM recurrentes WHERE id = ?', [$id]);
    if ($st->affected_rows < 1) return ['ok' => false, 'error' => 'No se encontró la plantilla'];
    return ['ok' => true];
}

function datosGenerar($datos)
{
    global $DATOS_CONFIG;
    $clave = (string) (isset($datos['corte']) ? $datos['corte'] : (isset($datos['corteClave']) ? $datos['corteClave'] : ''));
    $corte = dCalcularCorte($clave);
    if ($corte['clave'] === '') return ['ok' => false, 'error' => 'Elige un corte'];
    $existentes = datosLeerMovimientos();
    $conceptos = [];
    $db = datosDb($DATOS_CONFIG);
    $db->begin_transaction();
    try {
        foreach (datosLeerRecurrentes() as $p) {
            if (!dEsSi($p['activo'])) continue;
            $fecha = dFechaEnCorte($corte, $p['dia']);
            if ($fecha === '') continue;
            $ya = false;
            foreach ($existentes as $m) {
                if ($m['idRecurrente'] === $p['id'] && $m['fecha'] === $fecha) $ya = true;
            }
            if ($ya) continue;
            $nuevo = [
                'id' => dNuevoId('MOV'),
                'fecha' => $fecha,
                'tipo' => $p['tipo'],
                'concepto' => $p['concepto'],
                'categoria' => $p['categoria'],
                'monto' => $p['monto'] ?: 0,
                'montoReal' => '',
                'estado' => $p['tipo'] === 'Ingreso' ? 'Esperado' : 'Pendiente',
                'corte' => '',
                'corteClave' => '',
                'corteManual' => 'No',
                'recurrente' => 'Sí',
                'idRecurrente' => $p['id'],
                'periodo' => substr($fecha, 0, 7),
                'fechaPago' => '',
                'persona' => $p['persona'] ?: 'Familia',
                'notas' => '',
                'pagadoDesde' => $p['tipo'] === 'Ingreso' ? '' : 'Presupuesto familiar',
            ];
            dAplicarCorte($nuevo, ['corteManual' => 'No']);
            dGuardarMovimiento($nuevo);
            $existentes[] = $nuevo;
            $conceptos[] = $p['concepto'];
        }
        $db->commit();
    } catch (Throwable $e) {
        $db->rollback();
        throw $e;
    }
    return ['ok' => true, 'creados' => count($conceptos), 'conceptos' => $conceptos, 'corte' => $corte['clave']];
}

function datosFilasConfig()
{
    global $DATOS_CONFIG;
    return datosFilas(datosDb($DATOS_CONFIG), 'SELECT * FROM configuracion ORDER BY id');
}

function datosLeerConfig()
{
    $categorias = [];
    $personas = [];
    $estados = [];
    $cortes = [];
    $general = [];
    $ahorros = [];
    $actividades = [];
    foreach (datosFilasConfig() as $fila) {
        if (!dActivo($fila['activo'])) continue;
        $grupo = dNorm($fila['grupo']);
        if ($grupo === 'categoria') {
            $categorias[] = ['tipo' => (string) $fila['clave'], 'nombre' => (string) $fila['valor']];
        } elseif ($grupo === 'persona' && trim((string) $fila['valor']) !== '') {
            $personas[] = (string) $fila['valor'];
        } elseif ($grupo === 'estado') {
            $estados[] = ['tipo' => (string) $fila['clave'], 'nombre' => (string) $fila['valor']];
        } elseif ($grupo === 'corte') {
            $cortes[] = ['clave' => (string) $fila['clave'], 'inicio' => is_numeric($fila['valor']) ? (int) $fila['valor'] : $fila['valor'], 'fin' => is_numeric($fila['extra']) ? (int) $fila['extra'] : $fila['extra']];
        } elseif ($grupo === 'general' && trim((string) $fila['clave']) !== '') {
            $general[(string) $fila['clave']] = (string) $fila['valor'];
        } elseif ($grupo === 'ahorro') {
            $nombre = trim(preg_replace('/^ahorros?\s+/i', '', (string) $fila['valor']));
            if ($nombre === '') continue;
            $ahorros[] = ['id' => $fila['clave'] !== '' ? (string) $fila['clave'] : dNorm($nombre), 'nombre' => $nombre, 'inicio' => dEsSi($fila['extra'])];
        } elseif ($grupo === 'mesada') {
            $precio = dNumero($fila['extra']);
            if (trim((string) $fila['valor']) === '' || $precio === null || $precio < 0) continue;
            $ahorrosNombre = (string) $fila['valor'];
            $actividades[] = [
                'id' => $fila['clave'] !== '' ? (string) $fila['clave'] : dIdActividad($ahorrosNombre),
                'nombre' => $ahorrosNombre,
                'valor' => dRedondear($precio),
            ];
        }
    }
    $hayDiezmo = false;
    foreach ($categorias as $c) {
        if (dNorm($c['nombre']) === 'diezmos y ofrendas') $hayDiezmo = true;
    }
    if (!$hayDiezmo) {
        datosPonerConfig('categoria', 'Gasto', 'Diezmos y ofrendas', '', 'Sí');
        $categorias[] = ['tipo' => 'Gasto', 'nombre' => 'Diezmos y ofrendas'];
    }
    if (!$ahorros) {
        datosPonerConfig('ahorro', 'mia', 'Mia', 'No', 'Sí');
        datosPonerConfig('ahorro', 'fabi', 'Fabi', 'No', 'Sí');
        $ahorros = [
            ['id' => 'mia', 'nombre' => 'Mia', 'inicio' => false],
            ['id' => 'fabi', 'nombre' => 'Fabi', 'inicio' => false],
        ];
    }
    if (!$actividades) {
        $base = [
            ['id' => 'bano', 'nombre' => 'Lavar el baño', 'valor' => 5],
            ['id' => 'platos', 'nombre' => 'Lavar platos', 'valor' => 2.5],
            ['id' => 'ropa', 'nombre' => 'Lavar y secar', 'valor' => 3],
            ['id' => 'doblar', 'nombre' => 'Doblar y guardar', 'valor' => 5],
        ];
        foreach ($base as $actividad) {
            datosPonerConfig('mesada', $actividad['id'], $actividad['nombre'], (string) $actividad['valor'], 'Sí');
        }
        $actividades = $base;
    }
    return [
        'categorias' => $categorias,
        'personas' => $personas,
        'estados' => $estados,
        'cortes' => $cortes,
        'general' => $general,
        'ahorros' => $ahorros,
        'actividades' => $actividades,
    ];
}

function datosPonerConfig($grupo, $clave, $valor, $extra, $activo)
{
    global $DATOS_CONFIG;
    $db = datosDb($DATOS_CONFIG);
    $filas = datosFilas($db, 'SELECT id FROM configuracion WHERE grupo = ? AND clave = ? AND valor = ?', [$grupo, $clave, $valor]);
    if ($grupo === 'general' || $grupo === 'ahorro' || $grupo === 'mesada') {
        $filas = datosFilas($db, 'SELECT id FROM configuracion WHERE grupo = ? AND clave = ?', [$grupo, $clave]);
    }
    if ($filas) {
        datosExec($db, 'UPDATE configuracion SET valor = ?, extra = ?, activo = ? WHERE id = ?', [$valor, $extra, $activo, (int) $filas[0]['id']]);
        return;
    }
    datosExec($db, 'INSERT INTO configuracion (grupo, clave, valor, extra, activo) VALUES (?,?,?,?,?)', [$grupo, $clave, $valor, $extra, $activo]);
}

function dIdActividad($nombre)
{
    $s = dNorm($nombre);
    $s = strtr($s, ['á' => 'a', 'à' => 'a', 'é' => 'e', 'è' => 'e', 'í' => 'i', 'ì' => 'i', 'ó' => 'o', 'ò' => 'o', 'ú' => 'u', 'ù' => 'u', 'ñ' => 'n']);
    $s = trim(preg_replace('/[^a-z0-9]+/', '-', $s), '-');
    return $s !== '' ? $s : ('act-' . time());
}

function datosGuardarCortes($datos)
{
    $a = dDiaValido(isset($datos['dia1']) ? $datos['dia1'] : null);
    $b = dDiaValido(isset($datos['dia2']) ? $datos['dia2'] : null);
    if ($a === null || $b === null) return ['ok' => false, 'error' => 'Elige un día del 1 al 28'];
    if ($a === $b) return ['ok' => false, 'error' => 'Los dos cortes tienen que empezar en días distintos'];
    datosPonerConfig('general', 'corteDia1', (string) min($a, $b), '', 'Sí');
    datosPonerConfig('general', 'corteDia2', (string) max($a, $b), '', 'Sí');
    $dias = dDiasCorte();
    return ['ok' => true, 'dias' => $dias, 'config' => datosLeerConfig()];
}

function datosGuardarAhorro($datos)
{
    $nombre = trim(preg_replace('/^ahorros?\s+/i', '', (string) (isset($datos['nombre']) ? $datos['nombre'] : '')));
    if ($nombre === '') return ['ok' => false, 'error' => 'Escribe el nombre del ahorro'];
    $id = trim((string) (isset($datos['id']) ? $datos['id'] : ''));
    if ($id === '') $id = str_replace(' ', '-', dNorm($nombre));
    $inicio = !empty($datos['inicio']) && ($datos['inicio'] === true || dEsSi($datos['inicio']));
    foreach (datosFilasConfig() as $fila) {
        if (dNorm($fila['grupo']) !== 'ahorro' || !dActivo($fila['activo'])) continue;
        if ((string) $fila['clave'] === $id) continue;
        if (dBaseAhorro($fila['valor']) === dBaseAhorro($nombre)) return ['ok' => false, 'error' => 'Ese ahorro ya existe'];
    }
    datosPonerConfig('ahorro', $id, $nombre, $inicio ? 'Sí' : 'No', 'Sí');
    return ['ok' => true, 'ahorros' => datosLeerConfig()['ahorros']];
}

function datosGuardarActividad($datos)
{
    $nombre = trim((string) (isset($datos['nombre']) ? $datos['nombre'] : ''));
    $valor = dNumero(isset($datos['valor']) ? $datos['valor'] : null);
    if ($nombre === '') return ['ok' => false, 'error' => 'Escribe qué pueden hacer'];
    if ($valor === null || $valor < 0) return ['ok' => false, 'error' => 'Escribe el precio'];
    $id = trim((string) (isset($datos['id']) ? $datos['id'] : ''));
    if ($id === '') $id = dIdActividad($nombre);
    foreach (datosFilasConfig() as $fila) {
        if (dNorm($fila['grupo']) !== 'mesada' || !dActivo($fila['activo'])) continue;
        if ((string) $fila['clave'] === $id) continue;
        if (dNorm($fila['valor']) === dNorm($nombre)) return ['ok' => false, 'error' => 'Esa actividad ya está'];
    }
    datosPonerConfig('mesada', $id, $nombre, (string) dRedondear($valor), 'Sí');
    return ['ok' => true, 'actividades' => datosLeerConfig()['actividades']];
}

function datosLeerMesada()
{
    global $DATOS_CONFIG;
    $items = [];
    foreach (datosFilas(datosDb($DATOS_CONFIG), 'SELECT * FROM mesada') as $fila) {
        $nina = dNorm($fila['nina']);
        if ($nina !== 'mia' && $nina !== 'fabiana') continue;
        $items[] = [
            'id' => (string) $fila['id'],
            'nina' => $nina,
            'actividad' => (string) $fila['actividad'],
            'valor' => dRedondear($fila['valor']),
            'fecha' => (string) $fila['fecha'],
        ];
    }
    return $items;
}

function dValorMesada($id)
{
    foreach (datosLeerConfig()['actividades'] as $actividad) {
        if ($actividad['id'] === $id) return $actividad['valor'];
    }
    return null;
}

function datosAgregarMesada($datos)
{
    $nina = dNorm(isset($datos['nina']) ? $datos['nina'] : '');
    $actividad = trim((string) (isset($datos['actividad']) ? $datos['actividad'] : ''));
    $valor = dValorMesada($actividad);
    if ($nina !== 'mia' && $nina !== 'fabiana') return ['ok' => false, 'error' => 'Elige a Mia o a Fabiana'];
    if ($valor === null) return ['ok' => false, 'error' => 'Elige una actividad'];
    $fecha = dFecha(isset($datos['fecha']) ? $datos['fecha'] : '');
    if ($fecha === null) $fecha = dHoy();
    $item = ['id' => dNuevoId('MES'), 'nina' => $nina, 'actividad' => $actividad, 'valor' => $valor, 'fecha' => $fecha];
    global $DATOS_CONFIG;
    datosExec(datosDb($DATOS_CONFIG), 'INSERT INTO mesada (id, nina, actividad, valor, fecha) VALUES (?,?,?,?,?)', [
        $item['id'], $item['nina'], $item['actividad'], (string) $item['valor'], $item['fecha'],
    ]);
    return ['ok' => true, 'item' => $item];
}

function datosQuitarMesada($datos)
{
    $id = trim((string) (isset($datos['id']) ? $datos['id'] : ''));
    if ($id === '') return ['ok' => false, 'error' => 'No está esa marca'];
    if (strpos($id, 'local-') === 0) return ['ok' => true];
    global $DATOS_CONFIG;
    datosExec(datosDb($DATOS_CONFIG), 'DELETE FROM mesada WHERE id = ?', [$id]);
    return ['ok' => true];
}

function dResumir($lista)
{
    $ingresos = 0;
    $recibidos = 0;
    $plan = 0;
    $pagados = 0;
    $pendientes = 0;
    foreach ($lista as $m) {
        if (dNorm($m['estado']) === 'omitido') continue;
        $monto = dNumero($m['monto']);
        if ($monto === null) $monto = 0;
        if (dNorm($m['tipo']) === 'ingreso') {
            $ingresos += $monto;
            if (dNorm($m['estado']) === 'recibido') {
                $real = dNumero($m['montoReal']);
                $recibidos += $real === null ? $monto : $real;
            }
        } elseif (dNorm($m['tipo']) === 'gasto') {
            $plan += $monto;
            $estado = dNorm($m['estado']);
            if ($estado === 'pagado') {
                $real = dNumero($m['montoReal']);
                $pagados += $real === null ? $monto : $real;
            }
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
        'disponibleActual' => dRedondear($recibidos - $pagados),
        'disponible' => dRedondear($ingresos - $pagados),
    ];
}

function datosDashboard($datos)
{
    $hoy = dHoy();
    $mes = !empty($datos['mes']) ? (string) $datos['mes'] : substr($hoy, 0, 7);
    $todos = datosLeerMovimientos();
    $delMes = [];
    $delCorte = [];
    $pendientes = [];
    $corteHoy = dCalcularCorte($hoy);
    foreach ($todos as $m) {
        if (dNorm($m['estado']) === 'omitido') continue;
        if ($m['fecha'] && substr($m['fecha'], 0, 7) === $mes) $delMes[] = $m;
        if ($corteHoy['clave'] && $m['corteClave'] === $corteHoy['clave']) {
            $delCorte[] = $m;
            $estado = dNorm($m['estado']);
            if (dNorm($m['tipo']) === 'gasto' && ($estado === 'pendiente' || $estado === 'programado')) $pendientes[] = $m;
        }
    }
    $meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    $nMes = (int) substr($mes, 5, 2);
    $etiqueta = ($nMes >= 1 && $nMes <= 12 ? ucfirst($meses[$nMes - 1]) : '') . ' ' . substr($mes, 0, 4);
    return [
        'ok' => true,
        'hoy' => $hoy,
        'mes' => array_merge(['periodo' => $mes, 'etiqueta' => trim($etiqueta)], dResumir($delMes)),
        'corte' => array_merge($corteHoy, dResumir($delCorte)),
        'pendientes' => $pendientes,
    ];
}

function datosImportar($config, $export)
{
    global $DATOS_CONFIG;
    $DATOS_CONFIG = $config;
    datosAsegurar($config);
    $db = datosDb($config);
    $ya = (int) datosFilas($db, 'SELECT COUNT(*) AS n FROM movimientos')[0]['n'];
    if ($ya > 0) return ['ok' => false, 'error' => 'La base ya tiene movimientos. No se volvió a copiar.'];
    $db->begin_transaction();
    try {
        foreach ($export['movimientos']['movimientos'] as $m) {
            dGuardarMovimiento([
                'id' => (string) $m['id'],
                'fecha' => isset($m['fecha']) ? (string) $m['fecha'] : '',
                'tipo' => isset($m['tipo']) ? (string) $m['tipo'] : '',
                'concepto' => isset($m['concepto']) ? (string) $m['concepto'] : '',
                'categoria' => isset($m['categoria']) ? (string) $m['categoria'] : '',
                'monto' => dNumero(isset($m['monto']) ? $m['monto'] : 0) ?: 0,
                'montoReal' => (isset($m['montoReal']) && $m['montoReal'] !== '' && $m['montoReal'] !== null) ? dRedondear(dNumero($m['montoReal'])) : '',
                'estado' => isset($m['estado']) ? (string) $m['estado'] : '',
                'corte' => isset($m['corte']) ? (string) $m['corte'] : '',
                'corteClave' => isset($m['corteClave']) ? (string) $m['corteClave'] : '',
                'corteManual' => isset($m['corteManual']) && $m['corteManual'] !== '' ? (string) $m['corteManual'] : 'No',
                'recurrente' => isset($m['recurrente']) && $m['recurrente'] !== '' ? (string) $m['recurrente'] : 'No',
                'idRecurrente' => isset($m['idRecurrente']) ? (string) $m['idRecurrente'] : '',
                'periodo' => isset($m['periodo']) ? (string) $m['periodo'] : '',
                'fechaPago' => isset($m['fechaPago']) ? (string) $m['fechaPago'] : '',
                'persona' => isset($m['persona']) ? (string) $m['persona'] : '',
                'notas' => isset($m['notas']) ? (string) $m['notas'] : '',
                'pagadoDesde' => isset($m['pagadoDesde']) ? (string) $m['pagadoDesde'] : '',
            ]);
        }
        foreach ($export['recurrentes']['recurrentes'] as $r) {
            datosExec($db, 'INSERT INTO recurrentes (id, tipo, concepto, categoria, monto, dia, persona, activo, notas) VALUES (?,?,?,?,?,NULLIF(?, \'\'),?,?,?)', [
                (string) $r['id'],
                isset($r['tipo']) ? (string) $r['tipo'] : 'Gasto',
                isset($r['concepto']) ? (string) $r['concepto'] : '',
                isset($r['categoria']) ? (string) $r['categoria'] : '',
                (string) (dNumero(isset($r['monto']) ? $r['monto'] : 0) ?: 0),
                (isset($r['dia']) && $r['dia'] !== '' && $r['dia'] !== null) ? (string) (int) $r['dia'] : '',
                isset($r['persona']) ? (string) $r['persona'] : 'Familia',
                isset($r['activo']) ? (string) $r['activo'] : 'Sí',
                isset($r['notas']) ? (string) $r['notas'] : '',
            ]);
        }
        $c = $export['config']['config'];
        foreach ($c['categorias'] as $fila) datosPonerConfig('categoria', (string) $fila['tipo'], (string) $fila['nombre'], '', 'Sí');
        foreach ($c['personas'] as $nombre) datosPonerConfig('persona', (string) $nombre, (string) $nombre, '', 'Sí');
        foreach ($c['estados'] as $fila) datosPonerConfig('estado', (string) $fila['tipo'], (string) $fila['nombre'], '', 'Sí');
        foreach ($c['cortes'] as $fila) datosPonerConfig('corte', (string) $fila['clave'], (string) $fila['inicio'], (string) $fila['fin'], 'Sí');
        foreach ($c['general'] as $clave => $valor) datosPonerConfig('general', (string) $clave, (string) $valor, '', 'Sí');
        foreach ($c['ahorros'] as $fila) datosPonerConfig('ahorro', (string) $fila['id'], (string) $fila['nombre'], !empty($fila['inicio']) ? 'Sí' : 'No', 'Sí');
        foreach ($c['actividades'] as $fila) datosPonerConfig('mesada', (string) $fila['id'], (string) $fila['nombre'], (string) $fila['valor'], 'Sí');
        foreach ((isset($export['mesada']['items']) ? $export['mesada']['items'] : []) as $item) {
            datosExec($db, 'INSERT INTO mesada (id, nina, actividad, valor, fecha) VALUES (?,?,?,?,?)', [
                (string) $item['id'], (string) $item['nina'], (string) $item['actividad'], (string) $item['valor'], (string) $item['fecha'],
            ]);
        }
        $db->commit();
    } catch (Throwable $e) {
        $db->rollback();
        throw $e;
    }
    return ['ok' => true];
}
