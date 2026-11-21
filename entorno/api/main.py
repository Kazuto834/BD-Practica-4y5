import os
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

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://admin:admin123@postgres:5432/almacen_piston"
)
EMP_EMAIL = os.getenv("EMP_EMAIL", "")
EMP_PASSWORD = os.getenv("EMP_PASSWORD", "")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
AUTH_SECRET = os.getenv("AUTH_SECRET", "default_dev_secret").encode("utf-8")

app = FastAPI(title="API Almacenes El Pistón", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_conn():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return f"{salt}${dk.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, expected_hex = stored_hash.split("$", 1)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
        return hmac.compare_digest(dk.hex(), expected_hex)
    except Exception:
        return False


def crear_token(email: str, role: str, id_empleado: int | None = None, nombre: str = "") -> str:
    exp = int(time.time()) + 14400  # Vigencia: 4 horas
    emp_id_str = str(id_empleado) if id_empleado is not None else ""
    safe_nombre = nombre.replace(":", " ").strip()
    payload = f"{email}:{role}:{emp_id_str}:{safe_nombre}:{exp}".encode("utf-8")
    sig = hmac.new(AUTH_SECRET, payload, hashlib.sha256).hexdigest()
    raw = f"{email}:{role}:{emp_id_str}:{safe_nombre}:{exp}:{sig}".encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("utf-8")


def _decodificar_token(authorization: str | None) -> dict:
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
    return _decodificar_token(authorization)


def verificar_admin(authorization: str | None = Header(default=None)) -> dict:
    user = _decodificar_token(authorization)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Privilegios insuficientes: se requiere cuenta de Administrador.")
    return user


def _asegurar_tabla_credenciales():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS CREDENCIAL_EMPLEADO (
                    ID_Empleado INT PRIMARY KEY REFERENCES EMPLEADO(ID_Empleado) ON DELETE CASCADE,
                    Email VARCHAR(150) UNIQUE NOT NULL,
                    Password_Hash TEXT NOT NULL,
                    Creado_En TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            conn.commit()


@app.on_event("startup")
def on_startup():
    try:
        _asegurar_tabla_credenciales()
    except Exception:
        pass


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


class CredencialEmpleadoIn(BaseModel):
    email: str
    password: str | None = None


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


def _consultar_reportes_bd():
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
                       u.capacidad_peso_kg, u.tipo_almacenaje
                FROM UBICACION u
                LEFT JOIN INVENTARIO_FISICO i ON u.id_ubicacion = i.id_ubicacion
                WHERE i.id_ubicacion IS NULL
                ORDER BY u.zona, u.pasillo, u.rack, u.nivel;
            """)
            ubicaciones_vacias = cur.fetchall()

    return {
        "stock_por_ubicacion": stock_ubicacion,
        "eficiencia_recoleccion": eficiencia,
        "ubicaciones_vacias": ubicaciones_vacias,
    }


@app.get("/api/health")
def health():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1;")
    return {"status": "ok", "mode": "postgres"}


@app.post("/api/auth/login")
def login(creds: LoginIn):
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
                SELECT c.id_empleado, c.email, c.password_hash, e.nombre, e.turno
                FROM CREDENCIAL_EMPLEADO c
                JOIN EMPLEADO e ON c.id_empleado = e.id_empleado
                WHERE LOWER(c.email) = %s
                """,
                (email_in,),
            )
            row = cur.fetchone()
            if row and verify_password(creds.password, row["password_hash"]):
                nombre_completo = f"{row['nombre']} ({row['turno']})"
                token = crear_token(row["email"], "empleado", row["id_empleado"], nombre_completo)
                return {
                    "token": token,
                    "email": row["email"],
                    "role": "empleado",
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
    return {
        "authenticated": True,
        "email": user["email"],
        "role": user["role"],
        "id_empleado": user["id_empleado"],
        "nombre": user["nombre"],
    }


@app.post("/api/auth/cambiar-password")
def cambiar_mi_password(payload: CambiarPasswordIn, user: dict = Depends(verificar_usuario)):
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


@app.post("/api/empleados")
def crear_empleado(emp: EmpleadoIn, _admin: dict = Depends(verificar_admin)):
    if emp.turno not in ("Matutino", "Vespertino", "Nocturno"):
        raise HTTPException(status_code=400, detail="Turno no válido (Matutino, Vespertino o Nocturno).")
    if not emp.nombre.strip():
        raise HTTPException(status_code=400, detail="El nombre del empleado es obligatorio.")
    if "@" not in emp.email or len(emp.password) < 4:
        raise HTTPException(status_code=400, detail="Ingresa un correo válido y una contraseña de al menos 4 caracteres.")

    _asegurar_tabla_credenciales()
    email_clean = emp.email.strip().lower()
    pwd_hash = hash_password(emp.password)

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
                    INSERT INTO CREDENCIAL_EMPLEADO (ID_Empleado, Email, Password_Hash)
                    VALUES (%s, %s, %s)
                    """,
                    (emp.id_empleado, email_clean, pwd_hash),
                )
                conn.commit()
                return {"message": f"Empleado {emp.nombre.strip()} registrado con acceso ({email_clean})."}
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=400, detail=f"No se pudo registrar el empleado: {e}")


@app.put("/api/empleados/{id_empleado}/credenciales")
def asignar_o_actualizar_credenciales(
    id_empleado: int,
    creds: CredencialEmpleadoIn,
    _admin: dict = Depends(verificar_admin),
):
    if "@" not in creds.email:
        raise HTTPException(status_code=400, detail="Ingresa un correo electrónico válido.")

    email_clean = creds.email.strip().lower()
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

                if not existente:
                    if not creds.password or len(creds.password) < 4:
                        raise HTTPException(
                            status_code=400,
                            detail="Debes asignar una contraseña de al menos 4 caracteres para crear su acceso.",
                        )
                    cur.execute(
                        """
                        INSERT INTO CREDENCIAL_EMPLEADO (ID_Empleado, Email, Password_Hash)
                        VALUES (%s, %s, %s)
                        """,
                        (id_empleado, email_clean, hash_password(creds.password)),
                    )
                    conn.commit()
                    return {"message": f"Acceso asignado a {emp['nombre']} ({email_clean})."}

                if creds.password and creds.password.strip():
                    if len(creds.password) < 4:
                        raise HTTPException(status_code=400, detail="La nueva contraseña debe tener al menos 4 caracteres.")
                    cur.execute(
                        """
                        UPDATE CREDENCIAL_EMPLEADO
                        SET Email = %s, Password_Hash = %s
                        WHERE ID_Empleado = %s
                        """,
                        (email_clean, hash_password(creds.password), id_empleado),
                    )
                    conn.commit()
                    return {"message": f"Correo y contraseña actualizados para {emp['nombre']}."}

                cur.execute(
                    "UPDATE CREDENCIAL_EMPLEADO SET Email = %s WHERE ID_Empleado = %s",
                    (email_clean, id_empleado),
                )
                conn.commit()
                return {"message": f"Correo actualizado a {email_clean} para {emp['nombre']}."}
            except HTTPException:
                conn.rollback()
                raise
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=400, detail=f"Error al actualizar credenciales: {e}")


@app.get("/api/catalogos")
def obtener_catalogos(_user: dict = Depends(verificar_usuario)):
    _asegurar_tabla_credenciales()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM CATEGORIA ORDER BY ID_Categoria;")
            categorias = cur.fetchall()
            cur.execute("SELECT * FROM UBICACION ORDER BY Zona, Pasillo, Rack, Nivel;")
            ubicaciones = cur.fetchall()
            cur.execute("""
                SELECT e.*, c.email AS correo_acceso
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
    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    """
                    INSERT INTO PRODUCTO (SKU, Nombre, Largo_cm, Ancho_cm, Alto_cm, Peso_Kg, ID_Categoria)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        item.sku,
                        item.nombre,
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
                        (item.sku, item.material_fabricacion or "Estándar", bool(item.fragil)),
                    )
                else:
                    cur.execute(
                        """
                        INSERT INTO FLUIDO_QUIMICO (SKU, Volumen_Mililitros, Nivel_Inflamabilidad, Requiere_Refrigeracion)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (
                            item.sku,
                            item.volumen_mililitros or 1000,
                            item.nivel_inflamabilidad or 1,
                            bool(item.requiere_refrigeracion),
                        ),
                    )
                conn.commit()
                return {"message": "Producto registrado", "sku": item.sku}
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/inventario")
def listar_inventario(_user: dict = Depends(verificar_usuario)):
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
    if mov.cantidad <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0")
    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "SELECT id_inventario, cantidad FROM INVENTARIO_FISICO WHERE sku = %s AND id_ubicacion = %s",
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
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/inventario/salida")
def registrar_salida(mov: MovimientoInventarioIn, _user: dict = Depends(verificar_usuario)):
    if mov.cantidad <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0")
    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "SELECT id_inventario, cantidad FROM INVENTARIO_FISICO WHERE sku = %s AND id_ubicacion = %s",
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
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/ordenes")
def listar_ordenes(_user: dict = Depends(verificar_usuario)):
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
        ORDER BY o.id_orden DESC;
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            return cur.fetchall()


@app.post("/api/ordenes")
def crear_orden(orden: OrdenIn, user: dict = Depends(verificar_usuario)):
    empleado_asignado = user["id_empleado"] if user["id_empleado"] is not None else orden.id_empleado

    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    """
                    INSERT INTO ORDEN_SALIDA (ID_Orden, Fecha_Emision, Estatus, ID_Empleado)
                    VALUES (%s, %s, 'En Proceso', %s)
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
                return {"message": "Orden asignada correctamente"}
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=400, detail=str(e))


@app.patch("/api/ordenes/{id_orden}/completar")
def completar_orden(id_orden: int, _user: dict = Depends(verificar_usuario)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE ORDEN_SALIDA SET estatus = 'Completada' WHERE id_orden = %s",
                (id_orden,),
            )
            conn.commit()
            return {"message": "Orden marcada como Completada"}


@app.get("/api/reportes")
def obtener_reportes(_user: dict = Depends(verificar_usuario)):
    return _consultar_reportes_bd()


@app.get("/api/reportes/pdf-data")
def obtener_reportes_pdf(admin: dict = Depends(verificar_admin)):
    data = _consultar_reportes_bd()
    data["autorizado_por"] = admin["email"]
    return data