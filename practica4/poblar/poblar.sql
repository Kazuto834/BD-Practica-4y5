-- ============================================================================
-- Script de Carga Masiva Idempotente y Transaccional (COPY / Staging)
-- Proyecto Propio: Almacén y Centro de Distribución "El Pistón"
-- Cumple con los requisitos del Ejercicio 1.4:
-- 1. Repetible (Idempotente): No duplica registros ni falla en re-ejecución.
-- 2. Ordenado: Carga respetando la jerarquía topológica de dependencias.
-- 3. Todo o nada: Bloque transaccional BEGIN/COMMIT con reversión ante fallas.
-- 4. Con cuentas: Reporta filas insertadas y filas rechazadas/omitidas.
-- 5. Eficiente: Emplea COPY masivo hacia tablas de staging intermedias.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ----------------------------------------------------------------------------
-- PASO 1: CREACIÓN DE TABLAS DE STAGING TEMPORALES (EN MEMORIA / SESIÓN)
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE stg_categoria (LIKE CATEGORIA INCLUDING DEFAULTS) ON COMMIT DROP;
CREATE TEMP TABLE stg_empleado (LIKE EMPLEADO INCLUDING DEFAULTS) ON COMMIT DROP;
CREATE TEMP TABLE stg_ubicacion (LIKE UBICACION INCLUDING DEFAULTS) ON COMMIT DROP;
CREATE TEMP TABLE stg_producto (LIKE PRODUCTO INCLUDING DEFAULTS) ON COMMIT DROP;
CREATE TEMP TABLE stg_pieza_solida (LIKE PIEZA_SOLIDA INCLUDING DEFAULTS) ON COMMIT DROP;
CREATE TEMP TABLE stg_fluido_quimico (LIKE FLUIDO_QUIMICO INCLUDING DEFAULTS) ON COMMIT DROP;
CREATE TEMP TABLE stg_orden_salida (LIKE ORDEN_SALIDA INCLUDING DEFAULTS) ON COMMIT DROP;
CREATE TEMP TABLE stg_detalle_orden (LIKE DETALLE_ORDEN INCLUDING DEFAULTS) ON COMMIT DROP;
CREATE TEMP TABLE stg_inventario_fisico (LIKE INVENTARIO_FISICO INCLUDING DEFAULTS) ON COMMIT DROP;

-- Tabla de métricas y auditoría de carga
CREATE TEMP TABLE metricas_carga (
    tabla VARCHAR(50),
    total_leidos INT,
    insertados INT,
    rechazados_omitidos INT
) ON COMMIT DROP;

-- ----------------------------------------------------------------------------
-- PASO 2: CARGA MASIVA DE ARCHIVOS CSV A STAGING CON \copy
-- ----------------------------------------------------------------------------
\copy stg_categoria FROM 'practica4/datos/categorias.csv' WITH (FORMAT csv, HEADER true);
\copy stg_empleado FROM 'practica4/datos/empleados.csv' WITH (FORMAT csv, HEADER true);
\copy stg_ubicacion FROM 'practica4/datos/ubicaciones.csv' WITH (FORMAT csv, HEADER true);
\copy stg_producto FROM 'practica4/datos/productos.csv' WITH (FORMAT csv, HEADER true);
\copy stg_pieza_solida FROM 'practica4/datos/piezas_solidas.csv' WITH (FORMAT csv, HEADER true);
\copy stg_fluido_quimico FROM 'practica4/datos/fluidos_quimicos.csv' WITH (FORMAT csv, HEADER true);
\copy stg_orden_salida FROM 'practica4/datos/ordenes_salida.csv' WITH (FORMAT csv, HEADER true);
\copy stg_detalle_orden FROM 'practica4/datos/detalle_ordenes.csv' WITH (FORMAT csv, HEADER true);
\copy stg_inventario_fisico FROM 'practica4/datos/inventario_fisico.csv' WITH (FORMAT csv, HEADER true);

-- ----------------------------------------------------------------------------
-- PASO 3: INSERCIÓN ORDENADA A TABLAS DEFINITIVAS CON ON CONFLICT DO NOTHING
-- ----------------------------------------------------------------------------

-- 1. CATEGORIA (Padre sin dependencias)
WITH ins AS (
    INSERT INTO CATEGORIA (ID_Categoria, Nombre, Nivel_Prioridad)
    SELECT ID_Categoria, Nombre, Nivel_Prioridad FROM stg_categoria
    ON CONFLICT (ID_Categoria) DO NOTHING
    RETURNING 1
)
INSERT INTO metricas_carga 
SELECT 'CATEGORIA', 
       (SELECT count(*) FROM stg_categoria), 
       (SELECT count(*) FROM ins), 
       ((SELECT count(*) FROM stg_categoria) - (SELECT count(*) FROM ins));

-- 2. EMPLEADO (Padre sin dependencias)
WITH ins AS (
    INSERT INTO EMPLEADO (ID_Empleado, Nombre, Turno, Certificacion_Montacargas)
    SELECT ID_Empleado, Nombre, Turno, Certificacion_Montacargas FROM stg_empleado
    ON CONFLICT (ID_Empleado) DO NOTHING
    RETURNING 1
)
INSERT INTO metricas_carga 
SELECT 'EMPLEADO', 
       (SELECT count(*) FROM stg_empleado), 
       (SELECT count(*) FROM ins), 
       ((SELECT count(*) FROM stg_empleado) - (SELECT count(*) FROM ins));

-- 3. UBICACION (Padre sin dependencias)
WITH ins AS (
    INSERT INTO UBICACION (ID_Ubicacion, Zona, Pasillo, Rack, Nivel, Capacidad_Peso_Kg, Tipo_Almacenaje)
    SELECT ID_Ubicacion, Zona, Pasillo, Rack, Nivel, Capacidad_Peso_Kg, Tipo_Almacenaje FROM stg_ubicacion
    ON CONFLICT (ID_Ubicacion) DO NOTHING
    RETURNING 1
)
INSERT INTO metricas_carga 
SELECT 'UBICACION', 
       (SELECT count(*) FROM stg_ubicacion), 
       (SELECT count(*) FROM ins), 
       ((SELECT count(*) FROM stg_ubicacion) - (SELECT count(*) FROM ins));

-- 4. PRODUCTO (Depende de CATEGORIA)
WITH ins AS (
    INSERT INTO PRODUCTO (SKU, Nombre, Largo_cm, Ancho_cm, Alto_cm, Peso_Kg, ID_Categoria)
    SELECT SKU, Nombre, Largo_cm, Ancho_cm, Alto_cm, Peso_Kg, ID_Categoria FROM stg_producto
    ON CONFLICT (SKU) DO NOTHING
    RETURNING 1
)
INSERT INTO metricas_carga 
SELECT 'PRODUCTO', 
       (SELECT count(*) FROM stg_producto), 
       (SELECT count(*) FROM ins), 
       ((SELECT count(*) FROM stg_producto) - (SELECT count(*) FROM ins));

-- 5. PIEZA_SOLIDA (Subtipo, depende de PRODUCTO)
WITH ins AS (
    INSERT INTO PIEZA_SOLIDA (SKU, Material_Fabricacion, Fragil)
    SELECT SKU, Material_Fabricacion, Fragil FROM stg_pieza_solida
    ON CONFLICT (SKU) DO NOTHING
    RETURNING 1
)
INSERT INTO metricas_carga 
SELECT 'PIEZA_SOLIDA', 
       (SELECT count(*) FROM stg_pieza_solida), 
       (SELECT count(*) FROM ins), 
       ((SELECT count(*) FROM stg_pieza_solida) - (SELECT count(*) FROM ins));

-- 6. FLUIDO_QUIMICO (Subtipo, depende de PRODUCTO)
WITH ins AS (
    INSERT INTO FLUIDO_QUIMICO (SKU, Volumen_Mililitros, Nivel_Inflamabilidad, Requiere_Refrigeracion)
    SELECT SKU, Volumen_Mililitros, Nivel_Inflamabilidad, Requiere_Refrigeracion FROM stg_fluido_quimico
    ON CONFLICT (SKU) DO NOTHING
    RETURNING 1
)
INSERT INTO metricas_carga 
SELECT 'FLUIDO_QUIMICO', 
       (SELECT count(*) FROM stg_fluido_quimico), 
       (SELECT count(*) FROM ins), 
       ((SELECT count(*) FROM stg_fluido_quimico) - (SELECT count(*) FROM ins));

-- 7. ORDEN_SALIDA (Depende de EMPLEADO)
WITH ins AS (
    INSERT INTO ORDEN_SALIDA (ID_Orden, Fecha_Emision, Estatus, ID_Empleado)
    SELECT ID_Orden, Fecha_Emision, Estatus, ID_Empleado FROM stg_orden_salida
    ON CONFLICT (ID_Orden) DO NOTHING
    RETURNING 1
)
INSERT INTO metricas_carga 
SELECT 'ORDEN_SALIDA', 
       (SELECT count(*) FROM stg_orden_salida), 
       (SELECT count(*) FROM ins), 
       ((SELECT count(*) FROM stg_orden_salida) - (SELECT count(*) FROM ins));

-- 8. DETALLE_ORDEN (Depende de ORDEN_SALIDA y PRODUCTO)
WITH ins AS (
    INSERT INTO DETALLE_ORDEN (ID_Orden, Numero_Linea, SKU, Cantidad_Pedida)
    SELECT ID_Orden, Numero_Linea, SKU, Cantidad_Pedida FROM stg_detalle_orden
    ON CONFLICT (ID_Orden, Numero_Linea) DO NOTHING
    RETURNING 1
)
INSERT INTO metricas_carga 
SELECT 'DETALLE_ORDEN', 
       (SELECT count(*) FROM stg_detalle_orden), 
       (SELECT count(*) FROM ins), 
       ((SELECT count(*) FROM stg_detalle_orden) - (SELECT count(*) FROM ins));

-- 9. INVENTARIO_FISICO (Depende de PRODUCTO y UBICACION)
WITH ins AS (
    INSERT INTO INVENTARIO_FISICO (SKU, ID_Ubicacion, ID_Inventario, Cantidad, Fecha_Ingreso)
    SELECT SKU, ID_Ubicacion, ID_Inventario, Cantidad, Fecha_Ingreso FROM stg_inventario_fisico
    ON CONFLICT (SKU, ID_Inventario) DO NOTHING
    RETURNING 1
)
INSERT INTO metricas_carga 
SELECT 'INVENTARIO_FISICO', 
       (SELECT count(*) FROM stg_inventario_fisico), 
       (SELECT count(*) FROM ins), 
       ((SELECT count(*) FROM stg_inventario_fisico) - (SELECT count(*) FROM ins));

-- ----------------------------------------------------------------------------
-- PASO 4: REPORTE FINAL DE CUENTAS POR TABLA
-- ----------------------------------------------------------------------------
SELECT 
    tabla AS "Tabla Destino",
    total_leidos AS "Registros Leídos",
    insertados AS "Insertados con Éxito",
    rechazados_omitidos AS "Omitidos / Existentes"
FROM metricas_carga;

COMMIT;
