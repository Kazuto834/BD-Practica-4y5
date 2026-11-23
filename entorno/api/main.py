# ============================================================================
# main.py
# API REST en FastAPI para Almacenes El Pistón
# Gestiona autenticación con tokens HMAC, administración de personal,
# inventario físico, catálogo supertipo/subtipos, órdenes de salida y reportes.
# ============================================================================

import os
import sys
import csv
import hmac
import time
import base64
import hashlib
import secrets
from datetime import date, datetime
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg
from psycopg.rows import dict_row

# ============================================================================
# 1. Configuración de Variables de Entorno y Utilidades de Logging
# ============================================================================

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://admin:admin123@postgres:5432/almacen_piston"
)
EMP_EMAIL = os.getenv("EMP_EMAIL", "")
EMP_PASSWORD = os.getenv("EMP_PASSWORD", "")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
AUTH_SECRET = os.getenv("AUTH_SECRET", "default_dev_secret").encode("utf-8")


def log_poblado(mensaje: str):
    """Imprime mensajes de diagnóstico de inicialización hacia stderr de Docker."""
    sys.stderr.write(f"poblando: {mensaje}\n")
    sys.stderr.flush()


def log_barra_progreso(paso: int, total: int, etiqueta: str):
    """Renderiza una barra de progreso textual durante la carga inicial de CSV."""
    ancho = 24
    llenos = int(ancho * paso / total) if total > 0 else ancho
    barra = "█" * llenos + "░" * (ancho - llenos)
    porcentaje = int(100 * paso / total) if total > 0 else 100
    log_poblado(f"[{barra}] {porcentaje:>3}% ({paso}/{total}) -> {etiqueta}")


app = FastAPI(title="API Almacenes El Pistón", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Orden respetando integridad referencial (entidades fuertes -> dependientes)
TABLAS_CSV = [
    ("CATEGORIA", "categorias.csv", ["ID_Categoria", "Nombre", "Nivel_Prioridad"], ["ID_Categoria"]),
    ("EMPLEADO", "empleados.csv", ["ID_Empleado", "Nombre", "Turno", "Certificacion_Montacargas"], ["ID_Empleado"]),
    ("UBICACION", "ubicaciones.csv", ["ID_Ubicacion", "Zona", "Pasillo", "Rack", "Nivel", "Capacidad_Peso_Kg", "Tipo_Almacenaje"], ["ID_Ubicacion"]),
    ("PRODUCTO", "productos.csv", ["SKU", "Nombre", "Largo_cm", "Ancho_cm", "Alto_cm", "Peso_Kg", "ID_Categoria"], ["SKU"]),
    ("PIEZA_SOLIDA", "piezas_solidas.csv", ["SKU", "Material_Fabricacion", "Fragil"], ["SKU"]),
    ("FLUIDO_QUIMICO", "fluidos_quimicos.csv", ["SKU", "Volumen_Mililitros", "Nivel_Inflamabilidad", "Requiere_Refrigeracion"], ["SKU"]),
    ("ORDEN_SALIDA", "ordenes_salida.csv", ["ID_Orden", "Fecha_Emision", "Estatus", "ID_Empleado"], ["ID_Orden"]),
    ("DETALLE_ORDEN", "detalle_ordenes.csv", ["ID_Orden", "Numero_Linea", "SKU", "Cantidad_Pedida"], ["ID_Orden", "Numero_Linea"]),
    ("INVENTARIO_FISICO", "inventario_fisico.csv", ["SKU", "ID_Ubicacion", "ID_Inventario", "Cantidad", "Fecha_Ingreso"], ["SKU", "ID_Inventario"]),
]

# Respaldo SQL de los triggers en caso de que el archivo 03-triggers.sql no esté montado
SQL_TRIGGERS_FALLBACK = """
CREATE OR REPLACE FUNCTION fn_validar_capacidad_ubicacion()
RETURNS TRIGGER AS $func$
DECLARE
    v_capacidad NUMERIC(10, 2);
    v_peso_unitario NUMERIC(8, 2);
    v_peso_actual NUMERIC(10, 2);
    v_peso_nuevo NUMERIC(10, 2);
    v_peso_total NUMERIC(10, 2);
    v_ubicacion_desc TEXT;
BEGIN
    IF NEW.cantidad IS NULL OR NEW.cantidad <= 0 THEN
        RAISE EXCEPTION 'La cantidad en inventario físico debe ser mayor a 0.';
    END IF;

    SELECT u.capacidad_peso_kg, u.zona || '-' || u.pasillo || '-' || u.rack || '-' || u.nivel
    INTO v_capacidad, v_ubicacion_desc
    FROM UBICACION u
    WHERE u.id_ubicacion = NEW.id_ubicacion;

    IF v_capacidad IS NULL THEN
        RAISE EXCEPTION 'La ubicación % no existe.', NEW.id_ubicacion;
    END IF;

    SELECT peso_kg INTO v_peso_unitario
    FROM PRODUCTO
    WHERE sku = NEW.sku;

    IF v_peso_unitario IS NULL THEN
        RAISE EXCEPTION 'El producto con SKU % no existe.', NEW.sku;
    END IF;

    SELECT COALESCE(SUM(p.peso_kg * i.cantidad), 0)
    INTO v_peso_actual
    FROM INVENTARIO_FISICO i
    JOIN PRODUCTO p ON i.sku = p.sku
    WHERE i.id_ubicacion = NEW.id_ubicacion
      AND NOT (i.sku = NEW.sku AND i.id_inventario = NEW.id_inventario);

    v_peso_nuevo := v_peso_unitario * NEW.cantidad;
    v_peso_total := v_peso_actual + v_peso_nuevo;

    IF v_peso_total > v_capacidad THEN
        RAISE EXCEPTION 'Sin espacio en la ubicación %: el peso total (% kg) excede la capacidad máxima del rack (% kg). Capacidad disponible: % kg.',
            v_ubicacion_desc, ROUND(v_peso_total, 2), ROUND(v_capacidad, 2), ROUND(GREATEST(0.00, v_capacidad - v_peso_actual), 2);
    END IF;

    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_capacidad_ubicacion ON INVENTARIO_FISICO;
CREATE TRIGGER trg_validar_capacidad_ubicacion
BEFORE INSERT OR UPDATE ON INVENTARIO_FISICO
FOR EACH ROW
EXECUTE FUNCTION fn_validar_capacidad_ubicacion();

CREATE OR REPLACE FUNCTION fn_validar_detalle_orden()
RETURNS TRIGGER AS $func$
BEGIN
    IF NEW.cantidad_pedida IS NULL OR NEW.cantidad_pedida <= 0 THEN
        RAISE EXCEPTION 'La cantidad pedida en la orden #% debe ser mayor a 0.', NEW.id_orden;
    END IF;
    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_detalle_orden ON DETALLE_ORDEN;
CREATE TRIGGER trg_validar_detalle_orden
BEFORE INSERT OR UPDATE ON DETALLE_ORDEN
FOR EACH ROW
EXECUTE FUNCTION fn_validar_detalle_orden();

CREATE OR REPLACE FUNCTION fn_validar_transicion_orden_salida()
RETURNS TRIGGER AS $func$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.estatus IS NULL OR TRIM(NEW.estatus) = '' THEN
            NEW.estatus := 'Pendiente';
        END IF;

        IF NEW.estatus NOT IN ('Pendiente', 'En Proceso', 'Completada', 'Cancelada') THEN
            RAISE EXCEPTION 'Estatus inicial no válido para la orden: %.', NEW.estatus;
        END IF;

        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.id_empleado IS DISTINCT FROM OLD.id_empleado THEN
            RAISE EXCEPTION 'No está permitido reasignar el empleado propietario de la orden #%.', OLD.id_orden;
        END IF;

        IF NEW.estatus IS NOT DISTINCT FROM OLD.estatus THEN
            RETURN NEW;
        END IF;

        IF OLD.estatus = 'Completada' THEN
            RAISE EXCEPTION 'La orden #% ya está Completada y no puede modificar su estatus.', OLD.id_orden;
        END IF;

        IF OLD.estatus = 'Cancelada' THEN
            RAISE EXCEPTION 'La orden #% está Cancelada y no puede reactivarse ni modificar su estatus.', OLD.id_orden;
        END IF;

        IF OLD.estatus = 'Pendiente' AND NEW.estatus NOT IN ('En Proceso', 'Cancelada') THEN
            RAISE EXCEPTION 'Transición inválida en orden #%: desde Pendiente solo puede pasar a En Proceso o Cancelada.', OLD.id_orden;
        END IF;

        IF OLD.estatus = 'En Proceso' AND NEW.estatus NOT IN ('Completada', 'Cancelada') THEN
            RAISE EXCEPTION 'Transición inválida en orden #%: desde En Proceso solo puede pasar a Completada o Cancelada.', OLD.id_orden;
        END IF;
    END IF;

    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_transicion_orden_salida ON ORDEN_SALIDA;
CREATE TRIGGER trg_validar_transicion_orden_salida
BEFORE INSERT OR UPDATE ON ORDEN_SALIDA
FOR EACH ROW
EXECUTE FUNCTION fn_validar_transicion_orden_salida();
"""


# ============================================================================
# 2. Conexión a Base de Datos, Criptografía y Control de Sesiones
# ============================================================================

def get_conn():
    """Abre una conexión síncrona a PostgreSQL con filas mapeadas como diccionarios."""
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def extraer_mensaje_pg(err: Exception) -> str:
    """Extrae el mensaje limpio lanzado por un RAISE EXCEPTION de PostgreSQL."""
    diag = getattr(err, "diag", None)
    if diag and getattr(diag, "message_primary", None):
        return diag.message_primary
    return str(err).splitlines()[0]


def hash_password(password: str) -> str:
    """Genera un hash PBKDF2-HMAC-SHA256 con salt aleatorio de 16 bytes."""
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return f"{salt}${dk.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verifica en tiempo constante una contraseña plana contra su hash almacenado."""
    try:
        salt, expected_hex = stored_hash.split("$", 1)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
        return hmac.compare_digest(dk.hex(), expected_hex)
    except Exception:
        return False


def crear_token(email: str, role: str, id_empleado: int | None = None, nombre: str = "") -> str:
    """Firma un token de sesión con vigencia de 4 horas usando HMAC-SHA256."""
    exp = int(time.time()) + 14400
    emp_id_str = str(id_empleado) if id_empleado is not None else ""
    safe_nombre = nombre.replace(":", " ").strip()
    payload = f"{email}:{role}:{emp_id_str}:{safe_nombre}:{exp}".encode("utf-8")
    sig = hmac.new(AUTH_SECRET, payload, hashlib.sha256).hexdigest()
    raw = f"{email}:{role}:{emp_id_str}:{safe_nombre}:{exp}:{sig}".encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("utf-8")


def _decodificar_token(authorization: str | None) -> dict:
    """Valida la cabecera Bearer, verifica firma HMAC y expiración del token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Acceso denegado: inicia sesión para continuar.")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        decoded = base64.urlsafe_b64decode(token.encode("utf-8")).decode("utf-8")
        email, role, emp_id_str, nombre, exp_str, sig = decoded.rsplit(":", 5)
        if int(exp_str) < int(time.time()):
            raise HTTPException(status_code=401, detail="Sesión expirada. Vuelve a iniciar sesión.")
        expected_sig = hmac.new(
            AUTH_SECRET,
            f"{email}:{role}:{emp_id_str}:{nombre}:{exp_str}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            raise HTTPException(status_code=401, detail="Token inválido.")
        if role not in ("empleado", "admin"):
            raise HTTPException(status_code=401, detail="Rol no reconocido.")
        return {
            "email": email,
            "role": role,
            "id_empleado": int(emp_id_str) if emp_id_str else None,
            "nombre": nombre,
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Token malformado o no autorizado.")


def verificar_usuario(authorization: str | None = Header(default=None)) -> dict:
    """Dependencia FastAPI que exige cualquier sesión autenticada válida."""
    return _decodificar_token(authorization)


def verificar_admin(authorization: str | None = Header(default=None)) -> dict:
    """Dependencia FastAPI que exige privilegios de Administrador."""
    user = _decodificar_token(authorization)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Privilegios insuficientes: se requiere cuenta de Administrador.")
    return user


# ============================================================================
# 3. Inicialización de Esquema, Migraciones, CSV y Triggers
# ============================================================================

def _asegurar_tabla_credenciales():
    """Crea la tabla CREDENCIAL_EMPLEADO si aún no existe en la base de datos."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS CREDENCIAL_EMPLEADO (
                    ID_Empleado INT PRIMARY KEY REFERENCES EMPLEADO(ID_Empleado) ON DELETE CASCADE,
                    Email VARCHAR(150) UNIQUE NOT NULL,
                    Password_Hash TEXT NOT NULL,
                    Rol VARCHAR(20) NOT NULL DEFAULT 'empleado',
                    Creado_En TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                ALTER TABLE CREDENCIAL_EMPLEADO ADD COLUMN IF NOT EXISTS Rol VARCHAR(20) NOT NULL DEFAULT 'empleado';
            """)
            conn.commit()


def _asegurar_estatus_ordenes():
    """Normaliza estatus históricos y garantiza el CHECK de ORDEN_SALIDA."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("ALTER TABLE ORDEN_SALIDA DROP CONSTRAINT IF EXISTS chk_orden_estatus_flujo;")
            cur.execute("""
                SELECT conname
                FROM pg_constraint
                WHERE conrelid = 'orden_salida'::regclass
                  AND contype = 'c'
                  AND pg_get_constraintdef(oid) ILIKE '%estatus%';
            """)
            for row in cur.fetchall():
                cur.execute(f'ALTER TABLE ORDEN_SALIDA DROP CONSTRAINT IF EXISTS "{row["conname"]}";')

            cur.execute("""
                UPDATE ORDEN_SALIDA
                SET Estatus = CASE
                    WHEN LOWER(TRIM(Estatus)) IN ('en preparacion', 'en preparación', 'en proceso', 'picking', 'en despacho') THEN 'En Proceso'
                    WHEN LOWER(TRIM(Estatus)) IN ('despachado', 'completada', 'completado', 'entregado') THEN 'Completada'
                    WHEN LOWER(TRIM(Estatus)) IN ('cancelado', 'cancelada') THEN 'Cancelada'
                    ELSE 'Pendiente'
                END;
            """)

            cur.execute("""
                ALTER TABLE ORDEN_SALIDA
                ADD CONSTRAINT chk_orden_estatus_flujo
                CHECK (Estatus IN ('Pendiente', 'En Proceso', 'Completada', 'Cancelada'));
            """)
            conn.commit()


def _asegurar_triggers_bd():
    """Instala o actualiza los triggers desde 03-triggers.sql o desde el respaldo."""
    rutas_posibles = [
        "/app/db/init/03-triggers.sql",
        "/docker-entrypoint-initdb.d/03-triggers.sql",
        os.path.join(os.path.dirname(__file__), "03-triggers.sql"),
    ]
    sql_triggers = None
    for ruta in rutas_posibles:
        if os.path.exists(ruta):
            with open(ruta, "r", encoding="utf-8-sig") as f:
                sql_triggers = f.read()
            break

    if not sql_triggers:
        sql_triggers = SQL_TRIGGERS_FALLBACK

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql_triggers)
            conn.commit()


def _aplicar_migraciones_y_poblar_csv():
    """Aplica migraciones 001/002 y carga los CSV iniciales mediante COPY."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'categoria'
                ) AS existe;
            """)
            if not cur.fetchone()["existe"]:
                log_poblado("esperando creación de tablas base...")
                return

            cur.execute("""
                SELECT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'chk_categoria_prioridad'
                ) AS aplicada;
            """)
            if not cur.fetchone()["aplicada"] and os.path.exists("/app/migraciones_p4/001-dominios.sql"):
                with open("/app/migraciones_p4/001-dominios.sql", "r", encoding="utf-8-sig") as f:
                    sql_001 = f.read().replace("BEGIN;", "").replace("COMMIT;", "")
                    cur.execute(sql_001)

            if os.path.exists("/app/migraciones_p5/002-referencias.sql"):
                with open("/app/migraciones_p5/002-referencias.sql", "r", encoding="utf-8-sig") as f:
                    sql_002 = f.read().replace("BEGIN;", "").replace("COMMIT;", "")
                    cur.execute(sql_002)

            cur.execute("SELECT COUNT(*) AS total FROM CATEGORIA;")
            ya_poblada = cur.fetchone()["total"] > 0

            total_tablas = len(TABLAS_CSV)
            resultados_carga = []

            if not ya_poblada and os.path.isdir("/app/datos"):
                log_poblado("Iniciando carga de datos desde archivos CSV...")
                for idx, (tabla, archivo, columnas, pk_cols) in enumerate(TABLAS_CSV, start=1):
                    ruta_csv = os.path.join("/app/datos", archivo)
                    if not os.path.exists(ruta_csv):
                        resultados_carga.append((tabla, 0, 0, "CSV no encontrado"))
                        log_barra_progreso(idx, total_tablas, f"{tabla} (omitido)")
                        continue

                    stg_table = f"stg_{tabla.lower()}"
                    cur.execute(f"CREATE TEMP TABLE {stg_table} (LIKE {tabla} INCLUDING DEFAULTS) ON COMMIT DROP;")

                    cols_sql = ", ".join(columnas)
                    with open(ruta_csv, "r", encoding="utf-8-sig") as f:
                        with cur.copy(f"COPY {stg_table} ({cols_sql}) FROM STDIN WITH (FORMAT csv, HEADER true)") as copy:
                            while data := f.read(8192):
                                copy.write(data)

                    pk_sql = ", ".join(pk_cols)
                    cur.execute(f"""
                        INSERT INTO {tabla} ({cols_sql})
                        SELECT {cols_sql} FROM {stg_table}
                        ON CONFLICT ({pk_sql}) DO NOTHING;
                    """)
                    insertados = cur.rowcount

                    cur.execute(f"SELECT COUNT(*) AS total FROM {tabla};")
                    total_actual = cur.fetchone()["total"]
                    resultados_carga.append((tabla, insertados, total_actual, "Cargado CSV"))
                    log_barra_progreso(idx, total_tablas, f"{tabla} (+{insertados} registros)")
            else:
                log_poblado("Verificando tablas precargadas en PostgreSQL...")
                for idx, (tabla, _archivo, _columnas, _pk_cols) in enumerate(TABLAS_CSV, start=1):
                    cur.execute(f"SELECT COUNT(*) AS total FROM {tabla};")
                    total_actual = cur.fetchone()["total"]
                    resultados_carga.append((tabla, 0, total_actual, "Precargado"))
                    log_barra_progreso(idx, total_tablas, f"{tabla} ({total_actual} en BD)")

            conn.commit()

            total_global = sum(r[2] for r in resultados_carga)
            total_nuevos = sum(r[1] for r in resultados_carga)
            log_poblado("===========================================================")
            log_poblado("RESULTADOS DE LA CARGA EN POSTGRESQL")
            log_poblado("===========================================================")
            for tabla, nuevos, total_bd, estado in resultados_carga:
                log_poblado(f"  - {tabla:<18} | Nuevos: {nuevos:>4} | Total BD: {total_bd:>4} | [{estado}]")
            log_poblado("-----------------------------------------------------------")
            log_poblado(f"RESUMEN TOTAL -> {total_nuevos} nuevos | {total_global} registros totales en BD")
            log_poblado("===========================================================")


@app.on_event("startup")
def on_startup():
    """Ejecuta la secuencia de arranque esperando disponibilidad de PostgreSQL."""
    for _ in range(10):
        try:
            _asegurar_tabla_credenciales()
            _aplicar_migraciones_y_poblar_csv()
            _asegurar_estatus_ordenes()
            _asegurar_triggers_bd()
            log_poblado("Base de datos y triggers listos y operativos.")
            break
        except Exception as e:
            log_poblado(f"reintentando inicialización ({e})")
            time.sleep(1.5)


# ============================================================================
# 4. Modelos de Entrada (Pydantic)
# ============================================================================

class LoginIn(BaseModel):
    email: str
    password: str


class EmpleadoIn(BaseModel):
    id_empleado: int
    nombre: str
    turno: str
    certificacion_montacargas: bool = False
    email: str
    password: str
    rol: str = "empleado"


class CredencialEmpleadoIn(BaseModel):
    email: str
    password: str | None = None
    rol: str | None = "empleado"


class RolEmpleadoIn(BaseModel):
    rol: str


class CambiarPasswordIn(BaseModel):
    password_actual: str
    password_nueva: str


class ProductoIn(BaseModel):
    sku: str
    nombre: str
    largo_cm: float
    ancho_cm: float
    alto_cm: float
    peso_kg: float
    id_categoria: int
    tipo: str
    material_fabricacion: str | None = None
    fragil: bool | None = False
    volumen_mililitros: float | None = None
    nivel_inflamabilidad: int | None = 1
    requiere_refrigeracion: bool | None = False


class MovimientoInventarioIn(BaseModel):
    sku: str
    id_ubicacion: int
    cantidad: int


class OrdenIn(BaseModel):
    id_orden: int
    id_empleado: int
    sku: str
    cantidad_pedida: int


# ============================================================================
# 5. Funciones Auxiliares de Negocio (Reportes y Órdenes Propias)
# ============================================================================

def _consultar_reportes_bd():
    """Consulta las tres vistas analíticas para la pestaña de Reportes Gerenciales."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT u.zona, u.pasillo, u.rack, u.nivel, p.sku, p.nombre, i.cantidad,
                       ROUND((p.peso_kg * i.cantidad)::numeric, 2) AS peso_total_kg,
                       u.capacidad_peso_kg
                FROM INVENTARIO_FISICO i
                JOIN UBICACION u ON i.id_ubicacion = u.id_ubicacion
                JOIN PRODUCTO p ON i.sku = p.sku
                ORDER BY u.zona, u.pasillo, u.rack, u.nivel;
            """)
            stock_ubicacion = cur.fetchall()

            cur.execute("""
                SELECT e.id_empleado, e.nombre, e.turno,
                       COUNT(o.id_orden) FILTER (WHERE o.estatus = 'Completada') AS ordenes_completadas,
                       COUNT(o.id_orden) AS ordenes_asignadas
                FROM EMPLEADO e
                LEFT JOIN ORDEN_SALIDA o ON e.id_empleado = o.id_empleado
                GROUP BY e.id_empleado, e.nombre, e.turno
                ORDER BY ordenes_completadas DESC, e.id_empleado;
            """)
            eficiencia = cur.fetchall()

            cur.execute("""
                SELECT u.id_ubicacion, u.zona, u.pasillo, u.rack, u.nivel,
                       u.tipo_almacenaje,
                       u.capacidad_peso_kg,
                       COALESCE(ROUND(SUM(p.peso_kg * i.cantidad)::numeric, 2), 0) AS peso_actual_kg,
                       ROUND((u.capacidad_peso_kg - COALESCE(SUM(p.peso_kg * i.cantidad), 0))::numeric, 2) AS capacidad_disponible_kg,
                       CASE
                           WHEN COALESCE(SUM(i.cantidad), 0) = 0 THEN 'Vacía'
                           WHEN COALESCE(SUM(p.peso_kg * i.cantidad), 0) >= u.capacidad_peso_kg * 0.95 THEN 'Llena'
                           ELSE 'Disponible'
                       END AS estado_ocupacion
                FROM UBICACION u
                LEFT JOIN INVENTARIO_FISICO i ON u.id_ubicacion = i.id_ubicacion
                LEFT JOIN PRODUCTO p ON i.sku = p.sku
                GROUP BY u.id_ubicacion, u.zona, u.pasillo, u.rack, u.nivel,
                         u.tipo_almacenaje, u.capacidad_peso_kg
                ORDER BY u.zona, u.pasillo, u.rack, u.nivel;
            """)
            ubicaciones_capacidad = cur.fetchall()

    return {
        "stock_por_ubicacion": stock_ubicacion,
        "eficiencia_recoleccion": eficiencia,
        "ubicaciones_vacias": ubicaciones_capacidad,
    }

def _cambiar_estatus_orden_propia(id_orden: int, nuevo_estatus: str, user: dict) -> dict:
    """
    Valida que la orden pertenezca al empleado en sesión (o que sea la cuenta
    maestra de Administrador del .env) y delega la validación de la transición
    de estado al trigger trg_validar_transicion_orden_salida.
    """
    es_admin_maestro = user["id_empleado"] is None and user.get("role") == "admin"

    if user["id_empleado"] is None and not es_admin_maestro:
        raise HTTPException(
            status_code=403,
            detail="Tu sesión operativa general no está vinculada a un empleado registrado.",
        )

    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "SELECT id_empleado, estatus FROM ORDEN_SALIDA WHERE id_orden = %s FOR UPDATE",
                    (id_orden,),
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail=f"Orden #{id_orden} no encontrada.")

                if not es_admin_maestro and int(row["id_empleado"]) != int(user["id_empleado"]):
                    raise HTTPException(
                        status_code=403,
                        detail="Acceso denegado: únicamente puedes alterar las órdenes que estén a tu nombre.",
                    )

                cur.execute(
                    "UPDATE ORDEN_SALIDA SET estatus = %s WHERE id_orden = %s",
                    (nuevo_estatus, id_orden),
                )
                conn.commit()
                return {"message": f"Orden #{id_orden} actualizada a '{nuevo_estatus}'."}
            except HTTPException:
                conn.rollback()
                raise
            except psycopg.Error as e:
                conn.rollback()
                raise HTTPException(status_code=400, detail=extraer_mensaje_pg(e))


# ============================================================================
# 6. Endpoints de Salud y Autenticación
# ============================================================================

@app.get("/api/health")
def health():
    """Verifica conectividad activa con PostgreSQL."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1;")
    return {"status": "ok", "mode": "postgres"}


@app.post("/api/auth/login")
def login(creds: LoginIn):
    """Autentica cuentas maestras (.env) o empleados registrados en CREDENCIAL_EMPLEADO."""
    email_in = creds.email.strip().lower()

    if ADMIN_EMAIL and ADMIN_PASSWORD:
        if hmac.compare_digest(email_in, ADMIN_EMAIL.strip().lower()) and hmac.compare_digest(creds.password, ADMIN_PASSWORD):
            token = crear_token(ADMIN_EMAIL, "admin", None, "Administrador")
            return {
                "token": token,
                "email": ADMIN_EMAIL,
                "role": "admin",
                "id_empleado": None,
                "nombre": "Administrador",
            }

    _asegurar_tabla_credenciales()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.id_empleado, c.email, c.password_hash, COALESCE(c.rol, 'empleado') AS rol, e.nombre, e.turno
                FROM CREDENCIAL_EMPLEADO c
                JOIN EMPLEADO e ON c.id_empleado = e.id_empleado
                WHERE LOWER(c.email) = %s
                """,
                (email_in,),
            )
            row = cur.fetchone()
            if row and verify_password(creds.password, row["password_hash"]):
                rol_usuario = row["rol"] if row["rol"] in ("admin", "empleado") else "empleado"
                rol_etiqueta = " (Admin)" if rol_usuario == "admin" else ""
                nombre_completo = f"{row['nombre']} ({row['turno']}){rol_etiqueta}"
                token = crear_token(row["email"], rol_usuario, row["id_empleado"], nombre_completo)
                return {
                    "token": token,
                    "email": row["email"],
                    "role": rol_usuario,
                    "id_empleado": row["id_empleado"],
                    "nombre": nombre_completo,
                }

    if EMP_EMAIL and EMP_PASSWORD:
        if hmac.compare_digest(email_in, EMP_EMAIL.strip().lower()) and hmac.compare_digest(creds.password, EMP_PASSWORD):
            token = crear_token(EMP_EMAIL, "empleado", None, "Personal Operativo")
            return {
                "token": token,
                "email": EMP_EMAIL,
                "role": "empleado",
                "id_empleado": None,
                "nombre": "Personal Operativo",
            }

    raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos.")


@app.get("/api/auth/verify")
def verify_session(user: dict = Depends(verificar_usuario)):
    """Devuelve la identidad y rol asociados al token activo."""
    return {
        "authenticated": True,
        "email": user["email"],
        "role": user["role"],
        "id_empleado": user["id_empleado"],
        "nombre": user["nombre"],
    }


@app.post("/api/auth/cambiar-password")
def cambiar_mi_password(payload: CambiarPasswordIn, user: dict = Depends(verificar_usuario)):
    """Permite al empleado en sesión actualizar su propia contraseña."""
    if user["id_empleado"] is None:
        raise HTTPException(
            status_code=400,
            detail="Las cuentas maestras definidas en .env deben modificarse directamente en el archivo .env.",
        )
    if len(payload.password_nueva) < 4:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe tener al menos 4 caracteres.")

    _asegurar_tabla_credenciales()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT password_hash FROM CREDENCIAL_EMPLEADO WHERE id_empleado = %s",
                (user["id_empleado"],),
            )
            row = cur.fetchone()
            if not row or not verify_password(payload.password_actual, row["password_hash"]):
                raise HTTPException(status_code=400, detail="La contraseña actual es incorrecta.")

            nuevo_hash = hash_password(payload.password_nueva)
            cur.execute(
                "UPDATE CREDENCIAL_EMPLEADO SET password_hash = %s WHERE id_empleado = %s",
                (nuevo_hash, user["id_empleado"]),
            )
            conn.commit()
            return {"message": "Tu contraseña ha sido actualizada correctamente."}


# ============================================================================
# 7. Endpoints de Gestión de Personal y Credenciales (Solo Administrador)
# ============================================================================

@app.post("/api/empleados")
def crear_empleado(emp: EmpleadoIn, _admin: dict = Depends(verificar_admin)):
    """Registra un nuevo trabajador en EMPLEADO y crea su acceso en CREDENCIAL_EMPLEADO."""
    if emp.turno not in ("Matutino", "Vespertino", "Nocturno", "Mixto"):
        raise HTTPException(status_code=400, detail="Turno no válido (Matutino, Vespertino, Nocturno o Mixto).")
    if not emp.nombre.strip():
        raise HTTPException(status_code=400, detail="El nombre del empleado es obligatorio.")
    if "@" not in emp.email or len(emp.password) < 4:
        raise HTTPException(status_code=400, detail="Ingresa un correo válido y una contraseña de al menos 4 caracteres.")

    _asegurar_tabla_credenciales()
    email_clean = emp.email.strip().lower()
    pwd_hash = hash_password(emp.password)
    rol_clean = (emp.rol or "empleado").strip().lower()
    if rol_clean not in ("admin", "empleado"):
        rol_clean = "empleado"

    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    """
                    INSERT INTO EMPLEADO (ID_Empleado, Nombre, Turno, Certificacion_Montacargas)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (emp.id_empleado, emp.nombre.strip(), emp.turno, emp.certificacion_montacargas),
                )
                cur.execute(
                    """
                    INSERT INTO CREDENCIAL_EMPLEADO (ID_Empleado, Email, Password_Hash, Rol)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (emp.id_empleado, email_clean, pwd_hash, rol_clean),
                )
                conn.commit()
                rol_desc = "Administrador" if rol_clean == "admin" else "Personal Operativo"
                return {"message": f"Empleado {emp.nombre.strip()} registrado con acceso ({email_clean}) como {rol_desc}."}
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=400, detail=f"No se pudo registrar el empleado: {extraer_mensaje_pg(e)}")


@app.put("/api/empleados/{id_empleado}/credenciales")
def asignar_o_actualizar_credenciales(
    id_empleado: int,
    creds: CredencialEmpleadoIn,
    _admin: dict = Depends(verificar_admin),
):
    """Asigna o actualiza correo, contraseña y rol de un trabajador existente."""
    if "@" not in creds.email:
        raise HTTPException(status_code=400, detail="Ingresa un correo electrónico válido.")

    email_clean = creds.email.strip().lower()
    rol_clean = (creds.rol or "empleado").strip().lower()
    if rol_clean not in ("admin", "empleado"):
        raise HTTPException(status_code=400, detail="Rol inválido: debe ser 'empleado' o 'admin'.")

    _asegurar_tabla_credenciales()

    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute("SELECT nombre FROM EMPLEADO WHERE id_empleado = %s", (id_empleado,))
                emp = cur.fetchone()
                if not emp:
                    raise HTTPException(status_code=404, detail="Empleado no encontrado.")

                cur.execute("SELECT email FROM CREDENCIAL_EMPLEADO WHERE id_empleado = %s", (id_empleado,))
                existente = cur.fetchone()
                rol_desc = "Administrador" if rol_clean == "admin" else "Personal Operativo"

                if not existente:
                    if not creds.password or len(creds.password) < 4:
                        raise HTTPException(
                            status_code=400,
                            detail="Debes asignar una contraseña de al menos 4 caracteres para crear su acceso.",
                        )
                    cur.execute(
                        """
                        INSERT INTO CREDENCIAL_EMPLEADO (ID_Empleado, Email, Password_Hash, Rol)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (id_empleado, email_clean, hash_password(creds.password), rol_clean),
                    )
                    conn.commit()
                    return {"message": f"Acceso asignado a {emp['nombre']} ({email_clean}) con rol {rol_desc}."}

                if creds.password and creds.password.strip():
                    if len(creds.password) < 4:
                        raise HTTPException(status_code=400, detail="La nueva contraseña debe tener al menos 4 caracteres.")
                    cur.execute(
                        """
                        UPDATE CREDENCIAL_EMPLEADO
                        SET Email = %s, Password_Hash = %s, Rol = %s
                        WHERE ID_Empleado = %s
                        """,
                        (email_clean, hash_password(creds.password), rol_clean, id_empleado),
                    )
                    conn.commit()
                    return {"message": f"Correo, contraseña y rol ({rol_desc}) actualizados para {emp['nombre']}."}

                cur.execute(
                    "UPDATE CREDENCIAL_EMPLEADO SET Email = %s, Rol = %s WHERE ID_Empleado = %s",
                    (email_clean, rol_clean, id_empleado),
                )
                conn.commit()
                return {"message": f"Correo ({email_clean}) y rol ({rol_desc}) actualizados para {emp['nombre']}."}
            except HTTPException:
                conn.rollback()
                raise
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=400, detail=f"Error al actualizar credenciales: {extraer_mensaje_pg(e)}")


@app.put("/api/empleados/{id_empleado}/rol")
def cambiar_rol_empleado(
    id_empleado: int,
    payload: RolEmpleadoIn,
    _admin: dict = Depends(verificar_admin),
):
    """Promueve o degrada directamente el rol de acceso de un empleado con cuenta activa."""
    rol_clean = payload.rol.strip().lower()
    if rol_clean not in ("admin", "empleado"):
        raise HTTPException(status_code=400, detail="Rol inválido: debe ser 'admin' o 'empleado'.")

    _asegurar_tabla_credenciales()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT nombre FROM EMPLEADO WHERE id_empleado = %s", (id_empleado,))
            emp = cur.fetchone()
            if not emp:
                raise HTTPException(status_code=404, detail="Empleado no encontrado.")

            cur.execute("SELECT email, rol FROM CREDENCIAL_EMPLEADO WHERE id_empleado = %s", (id_empleado,))
            cred = cur.fetchone()
            if not cred:
                raise HTTPException(
                    status_code=400,
                    detail=f"{emp['nombre']} no tiene credenciales de acceso activas. Asígnale correo y contraseña primero.",
                )

            cur.execute("UPDATE CREDENCIAL_EMPLEADO SET Rol = %s WHERE id_empleado = %s", (rol_clean, id_empleado))
            conn.commit()
            etiqueta = "Administrador" if rol_clean == "admin" else "Personal Operativo"
            return {"message": f"El trabajador {emp['nombre']} ahora tiene rol de {etiqueta}."}


# ============================================================================
# 8. Endpoints de Catálogos, Productos e Inventario Físico
# ============================================================================

@app.get("/api/catalogos")
def obtener_catalogos(_user: dict = Depends(verificar_usuario)):
    """Retorna categorías, ubicaciones físicas y plantilla de empleados."""
    _asegurar_tabla_credenciales()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM CATEGORIA ORDER BY ID_Categoria;")
            categorias = cur.fetchall()
            cur.execute("SELECT * FROM UBICACION ORDER BY Zona, Pasillo, Rack, Nivel;")
            ubicaciones = cur.fetchall()
            cur.execute("""
                SELECT e.*, c.email AS correo_acceso, COALESCE(c.rol, 'empleado') AS rol_acceso
                FROM EMPLEADO e
                LEFT JOIN CREDENCIAL_EMPLEADO c ON e.id_empleado = c.id_empleado
                ORDER BY e.ID_Empleado;
            """)
            empleados = cur.fetchall()
    return {
        "categorias": categorias,
        "ubicaciones": ubicaciones,
        "empleados": empleados,
    }


@app.get("/api/productos")
def listar_productos(_user: dict = Depends(verificar_usuario)):
    """Lista el supertipo PRODUCTO unido con sus subtipos y stock consolidado."""
    sql = """
        SELECT p.sku, p.nombre, p.largo_cm, p.ancho_cm, p.alto_cm, p.peso_kg, p.id_categoria,
               c.nombre AS categoria,
               ps.material_fabricacion, ps.fragil,
               fq.volumen_mililitros, fq.nivel_inflamabilidad, fq.requiere_refrigeracion,
               COALESCE((SELECT SUM(cantidad) FROM INVENTARIO_FISICO i WHERE i.sku = p.sku), 0) AS stock_total
        FROM PRODUCTO p
        JOIN CATEGORIA c ON p.id_categoria = c.id_categoria
        LEFT JOIN PIEZA_SOLIDA ps ON p.sku = ps.sku
        LEFT JOIN FLUIDO_QUIMICO fq ON p.sku = fq.sku
        ORDER BY p.sku;
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            return cur.fetchall()


@app.post("/api/productos")
def crear_producto(item: ProductoIn, _user: dict = Depends(verificar_usuario)):
    """Inserta un producto en PRODUCTO y en su tabla de subtipo correspondiente."""
    sku_clean = item.sku.strip().upper()
    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    """
                    INSERT INTO PRODUCTO (SKU, Nombre, Largo_cm, Ancho_cm, Alto_cm, Peso_Kg, ID_Categoria)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        sku_clean,
                        item.nombre.strip(),
                        item.largo_cm,
                        item.ancho_cm,
                        item.alto_cm,
                        item.peso_kg,
                        item.id_categoria,
                    ),
                )
                if item.tipo == "solida":
                    cur.execute(
                        "INSERT INTO PIEZA_SOLIDA (SKU, Material_Fabricacion, Fragil) VALUES (%s, %s, %s)",
                        (sku_clean, (item.material_fabricacion or "Estándar").strip(), bool(item.fragil)),
                    )
                else:
                    cur.execute(
                        """
                        INSERT INTO FLUIDO_QUIMICO (SKU, Volumen_Mililitros, Nivel_Inflamabilidad, Requiere_Refrigeracion)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (
                            sku_clean,
                            item.volumen_mililitros or 1000,
                            item.nivel_inflamabilidad if item.nivel_inflamabilidad is not None else 1,
                            bool(item.requiere_refrigeracion),
                        ),
                    )
                conn.commit()
                return {"message": "Producto registrado", "sku": sku_clean}
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=400, detail=extraer_mensaje_pg(e))


@app.get("/api/inventario")
def listar_inventario(_user: dict = Depends(verificar_usuario)):
    """Lista las existencias físicas por coordenada de rack."""
    sql = """
        SELECT i.id_inventario, i.sku, p.nombre AS producto, i.cantidad, i.fecha_ingreso,
               u.id_ubicacion, u.zona, u.pasillo, u.rack, u.nivel, u.tipo_almacenaje, u.capacidad_peso_kg
        FROM INVENTARIO_FISICO i
        JOIN PRODUCTO p ON i.sku = p.sku
        JOIN UBICACION u ON i.id_ubicacion = u.id_ubicacion
        ORDER BY u.zona, u.pasillo, u.rack, u.nivel;
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            return cur.fetchall()


@app.post("/api/inventario/entrada")
def registrar_entrada(mov: MovimientoInventarioIn, _user: dict = Depends(verificar_usuario)):
    """
    Registra una entrada de mercancía; la validación de peso máximo por celda
    se ejecuta automáticamente en PostgreSQL mediante trg_validar_capacidad_ubicacion.
    """
    if mov.cantidad <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0")
    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "SELECT id_inventario FROM INVENTARIO_FISICO WHERE sku = %s AND id_ubicacion = %s FOR UPDATE",
                    (mov.sku, mov.id_ubicacion),
                )
                existente = cur.fetchone()
                if existente:
                    cur.execute(
                        "UPDATE INVENTARIO_FISICO SET cantidad = cantidad + %s WHERE sku = %s AND id_inventario = %s",
                        (mov.cantidad, mov.sku, existente["id_inventario"]),
                    )
                else:
                    cur.execute("SELECT COALESCE(MAX(id_inventario), 0) + 1 AS next_id FROM INVENTARIO_FISICO")
                    next_id = cur.fetchone()["next_id"]
                    cur.execute(
                        """
                        INSERT INTO INVENTARIO_FISICO (SKU, ID_Ubicacion, ID_Inventario, Cantidad, Fecha_Ingreso)
                        VALUES (%s, %s, %s, %s, %s)
                        """,
                        (mov.sku, mov.id_ubicacion, next_id, mov.cantidad, date.today()),
                    )
                conn.commit()
                return {"message": "Entrada registrada correctamente"}
            except psycopg.Error as e:
                conn.rollback()
                raise HTTPException(status_code=400, detail=extraer_mensaje_pg(e))


@app.post("/api/inventario/salida")
def registrar_salida(mov: MovimientoInventarioIn, _user: dict = Depends(verificar_usuario)):
    """Descuenta stock de una coordenada física o elimina el registro si llega a 0."""
    if mov.cantidad <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0")
    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "SELECT id_inventario, cantidad FROM INVENTARIO_FISICO WHERE sku = %s AND id_ubicacion = %s FOR UPDATE",
                    (mov.sku, mov.id_ubicacion),
                )
                existente = cur.fetchone()
                if not existente or existente["cantidad"] < mov.cantidad:
                    raise HTTPException(status_code=400, detail="Stock insuficiente en esa ubicación")
                nueva_cant = existente["cantidad"] - mov.cantidad
                if nueva_cant == 0:
                    cur.execute(
                        "DELETE FROM INVENTARIO_FISICO WHERE sku = %s AND id_inventario = %s",
                        (mov.sku, existente["id_inventario"]),
                    )
                else:
                    cur.execute(
                        "UPDATE INVENTARIO_FISICO SET cantidad = %s WHERE sku = %s AND id_inventario = %s",
                        (nueva_cant, mov.sku, existente["id_inventario"]),
                    )
                conn.commit()
                return {"message": "Salida procesada y stock descontado"}
            except HTTPException:
                conn.rollback()
                raise
            except psycopg.Error as e:
                conn.rollback()
                raise HTTPException(status_code=400, detail=extraer_mensaje_pg(e))


# ============================================================================
# 9. Endpoints de Órdenes de Salida (Flujo Secuencial por Titular)
# ============================================================================

@app.get("/api/ordenes")
def listar_ordenes(user: dict = Depends(verificar_usuario)):
    """Lista las órdenes poniendo primero las del usuario activo y luego por estatus."""
    id_emp_activo = user.get("id_empleado")
    sql = """
        SELECT o.id_orden, o.fecha_emision, o.estatus, e.id_empleado, e.nombre AS empleado, e.turno,
               COALESCE(
                   STRING_AGG(d.sku || ' (x' || d.cantidad_pedida || ')', ', '),
                   'Sin detalle'
               ) AS resumen_productos
        FROM ORDEN_SALIDA o
        JOIN EMPLEADO e ON o.id_empleado = e.id_empleado
        LEFT JOIN DETALLE_ORDEN d ON o.id_orden = d.id_orden
        GROUP BY o.id_orden, o.fecha_emision, o.estatus, e.id_empleado, e.nombre, e.turno
        ORDER BY
            CASE WHEN %s IS NOT NULL AND e.id_empleado = %s THEN 0 ELSE 1 END ASC,
            CASE
                WHEN o.estatus = 'En Proceso' THEN 1
                WHEN o.estatus = 'Pendiente' THEN 2
                WHEN o.estatus = 'Completada' THEN 3
                ELSE 4
            END ASC,
            o.fecha_emision ASC,
            o.id_orden ASC;
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (id_emp_activo, id_emp_activo))
            return cur.fetchall()


@app.post("/api/ordenes")
def crear_orden(orden: OrdenIn, user: dict = Depends(verificar_usuario)):
    """Crea una nueva orden en estatus inicial 'Pendiente' vinculada al usuario activo."""
    empleado_asignado = user["id_empleado"] if user["id_empleado"] is not None else orden.id_empleado

    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    """
                    INSERT INTO ORDEN_SALIDA (ID_Orden, Fecha_Emision, Estatus, ID_Empleado)
                    VALUES (%s, %s, 'Pendiente', %s)
                    """,
                    (orden.id_orden, datetime.now(), empleado_asignado),
                )
                cur.execute(
                    """
                    INSERT INTO DETALLE_ORDEN (ID_Orden, Numero_Linea, SKU, Cantidad_Pedida)
                    VALUES (%s, 1, %s, %s)
                    """,
                    (orden.id_orden, orden.sku, orden.cantidad_pedida),
                )
                conn.commit()
                return {"message": "Orden asignada en estatus Pendiente"}
            except psycopg.Error as e:
                conn.rollback()
                raise HTTPException(status_code=400, detail=extraer_mensaje_pg(e))


@app.patch("/api/ordenes/{id_orden}/procesar")
@app.patch("/api/ordenes/{id_orden}/despachar")
def pasar_a_proceso(id_orden: int, user: dict = Depends(verificar_usuario)):
    """Transición 1: Pendiente -> En Proceso (solo si la orden pertenece al usuario)."""
    return _cambiar_estatus_orden_propia(id_orden, "En Proceso", user)


@app.patch("/api/ordenes/{id_orden}/completar")
def completar_orden(id_orden: int, user: dict = Depends(verificar_usuario)):
    """Transición 2: En Proceso -> Completada (solo si la orden pertenece al usuario)."""
    return _cambiar_estatus_orden_propia(id_orden, "Completada", user)


@app.patch("/api/ordenes/{id_orden}/cancelar")
def cancelar_orden(id_orden: int, user: dict = Depends(verificar_usuario)):
    """Transición de cancelación: Pendiente | En Proceso -> Cancelada."""
    return _cambiar_estatus_orden_propia(id_orden, "Cancelada", user)


# ============================================================================
# 10. Endpoints de Reportes Gerenciales y Exportación PDF
# ============================================================================

@app.get("/api/reportes")
def obtener_reportes(_user: dict = Depends(verificar_usuario)):
    """Devuelve los indicadores gerenciales para consulta en pantalla."""
    return _consultar_reportes_bd()


@app.get("/api/reportes/pdf-data")
def obtener_reportes_pdf(admin: dict = Depends(verificar_admin)):
    """Certifica privilegios de administrador antes de generar el PDF en cliente."""
    data = _consultar_reportes_bd()
    data["autorizado_por"] = admin["email"]
    return data