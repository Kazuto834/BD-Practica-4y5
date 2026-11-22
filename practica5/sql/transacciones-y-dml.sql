-- ============================================================================
-- Práctica 5 - Ejercicio 2.4: Script Ejecutable de DML y Transacciones
-- Almacén y Centro de Distribución Automotriz "El Pistón"
-- ============================================================================

\set ON_ERROR_STOP on

-- ----------------------------------------------------------------------------
-- 1. INSERT con SELECT y UPSERT (ON CONFLICT DO UPDATE)
-- ----------------------------------------------------------------------------
-- Reabastecimiento de productos de alta rotación sin stock
INSERT INTO INVENTARIO_FISICO (SKU, ID_Ubicacion, ID_Inventario, Cantidad, Fecha_Ingreso)
SELECT 
    p.SKU,
    1 AS ID_Ubicacion,
    9100 + ROW_NUMBER() OVER () AS ID_Inventario,
    40 AS Cantidad,
    CURRENT_DATE AS Fecha_Ingreso
FROM PRODUCTO p
WHERE p.ID_Categoria = 1
  AND NOT EXISTS (
      SELECT 1 FROM INVENTARIO_FISICO inv WHERE inv.SKU = p.SKU
  )
LIMIT 3;

-- Manejo de conflicto en lote existente (acumula existencias)
INSERT INTO INVENTARIO_FISICO (SKU, ID_Ubicacion, ID_Inventario, Cantidad, Fecha_Ingreso)
VALUES ('REP-FRE-0001', 1, 1, 15, CURRENT_DATE)
ON CONFLICT (SKU, ID_Inventario) 
DO UPDATE SET 
    Cantidad = INVENTARIO_FISICO.Cantidad + EXCLUDED.Cantidad,
    Fecha_Ingreso = EXCLUDED.Fecha_Ingreso;

-- ----------------------------------------------------------------------------
-- 2. UPDATE DEPENDIENTE DE OTRA TABLA Y CON CASE
-- ----------------------------------------------------------------------------
-- A. Update dependiente de otra tabla (Recálculo de carga en bahías)
UPDATE UBICACION u
SET Capacidad_Peso_Kg = u.Capacidad_Peso_Kg - sub.Peso_Total
FROM (
    SELECT inv.ID_Ubicacion, SUM(inv.Cantidad * p.Peso_Kg) AS Peso_Total
    FROM INVENTARIO_FISICO inv
    JOIN PRODUCTO p ON inv.SKU = p.SKU
    GROUP BY inv.ID_Ubicacion
) sub
WHERE u.ID_Ubicacion = sub.ID_Ubicacion
  AND (u.Capacidad_Peso_Kg - sub.Peso_Total) > 0;

-- B. Update con CASE para ciclo de vida de órdenes
UPDATE ORDEN_SALIDA
SET Estatus = CASE 
    WHEN Fecha_Emision < CURRENT_DATE - INTERVAL '30 days' AND Estatus = 'Pendiente' THEN 'Cancelado'
    WHEN Estatus = 'Pendiente' THEN 'En picking'
    WHEN Estatus = 'En picking' THEN 'Empacado'
    ELSE Estatus
END
WHERE Estatus IN ('Pendiente', 'En picking');

-- ----------------------------------------------------------------------------
-- 3. DELETE CON SUBCONSULTA Y BORRADO LÓGICO
-- ----------------------------------------------------------------------------
-- A. Borrado físico con subconsulta
DELETE FROM DETALLE_ORDEN
WHERE ID_Orden IN (
    SELECT ID_Orden 
    FROM ORDEN_SALIDA 
    WHERE Estatus = 'Cancelado' 
      AND Fecha_Emision < CURRENT_DATE - INTERVAL '60 days'
);

-- B. Soporte y ejecución de borrado lógico
ALTER TABLE PRODUCTO ADD COLUMN IF NOT EXISTS Activo BOOLEAN DEFAULT TRUE;

UPDATE PRODUCTO 
SET Activo = FALSE 
WHERE SKU = 'REP-FRE-0005';

-- ----------------------------------------------------------------------------
-- 4. TRANSACCIÓN MULTITABLA CON SAVEPOINT, REVERSIÓN PARCIAL Y COMMIT
-- ----------------------------------------------------------------------------
BEGIN;

INSERT INTO ORDEN_SALIDA (ID_Orden, Fecha_Emision, Estatus, ID_Empleado)
VALUES (7777, NOW(), 'Pendiente', 1);

INSERT INTO DETALLE_ORDEN (ID_Orden, Numero_Linea, SKU, Cantidad_Pedida)
VALUES (7777, 1, 'REP-FRE-0001', 5);

SAVEPOINT sp_linea_secundaria;

-- Simulamos reversión parcial de una línea alternativa no confirmada
ROLLBACK TO SAVEPOINT sp_linea_secundaria;

INSERT INTO DETALLE_ORDEN (ID_Orden, Numero_Linea, SKU, Cantidad_Pedida)
VALUES (7777, 2, 'REP-MOT-0002', 3);

COMMIT;

-- ----------------------------------------------------------------------------
-- 5. TRANSACCIÓN QUE FALLA Y DEMUESTRA ATOMICIDAD COMPLETA
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    INSERT INTO ORDEN_SALIDA (ID_Orden, Fecha_Emision, Estatus, ID_Empleado)
    VALUES (8888, NOW(), 'Pendiente', 2);

    -- Violación intencional de restricción CHECK
    INSERT INTO DETALLE_ORDEN (ID_Orden, Numero_Linea, SKU, Cantidad_Pedida)
    VALUES (8888, 1, 'REP-FRE-0001', -10);

EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'Transacción revertida por el motor. La base permanece inalterada.';
END $$;
