import os
from datetime import date, datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://admin:admin123@postgres:5432/almacen_piston"
)

app = FastAPI(title="API Almacenes El Pistón")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_conn():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


class ProductoIn(BaseModel):
    sku: str
    nombre: str
    largo_cm: float
    ancho_cm: float
    alto_cm: float
    peso_kg: float
    id_categoria: int
    tipo: str  # "solida" o "fluido"
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


@app.get("/api/health")
def health():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1;")
    return {"status": "ok", "mode": "postgres"}


@app.get("/api/catalogos")
def obtener_catalogos():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM CATEGORIA ORDER BY ID_Categoria;")
            categorias = cur.fetchall()
            cur.execute("SELECT * FROM UBICACION ORDER BY Zona, Pasillo, Rack, Nivel;")
            ubicaciones = cur.fetchall()
            cur.execute("SELECT * FROM EMPLEADO ORDER BY ID_Empleado;")
            empleados = cur.fetchall()
    return {
        "categorias": categorias,
        "ubicaciones": ubicaciones,
        "empleados": empleados,
    }


@app.get("/api/productos")
def listar_productos():
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
def crear_producto(item: ProductoIn):
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
def listar_inventario():
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
def registrar_entrada(mov: MovimientoInventarioIn):
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
def registrar_salida(mov: MovimientoInventarioIn):
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
def listar_ordenes():
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
def crear_orden(orden: OrdenIn):
    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    """
                    INSERT INTO ORDEN_SALIDA (ID_Orden, Fecha_Emision, Estatus, ID_Empleado)
                    VALUES (%s, %s, 'En Proceso', %s)
                    """,
                    (orden.id_orden, datetime.now(), orden.id_empleado),
                )
                cur.execute(
                    """
                    INSERT INTO DETALLE_ORDEN (ID_Orden, Numero_Linea, SKU, Cantidad_Pedida)
                    VALUES (%s, 1, %s, %s)
                    """,
                    (orden.id_orden, orden.sku, orden.cantidad_pedida),
                )
                conn.commit()
                return {"message": "Orden asignada"}
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=400, detail=str(e))


@app.patch("/api/ordenes/{id_orden}/completar")
def completar_orden(id_orden: int):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE ORDEN_SALIDA SET estatus = 'Completada' WHERE id_orden = %s",
                (id_orden,),
            )
            conn.commit()
            return {"message": "Orden marcada como Completada"}


@app.get("/api/reportes")
def obtener_reportes():
    with get_conn() as conn:
        with conn.cursor() as cur:
            # 1. Stock por Ubicación
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

            # 2. Eficiencia de Recolección
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

            # 3. Ubicaciones Vacías
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