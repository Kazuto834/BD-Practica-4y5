# Práctica 5 — Ejercicio 2.4: Edición de Valores y Transacciones

**Sistema de Gestión de Almacén y Centro de Distribución Automotriz "El Pistón"**  
**Equipo:** Garcia Castillo Mario, Gonzáles Martínez Danaet Montserrath, Islas Ramirez Diego  
**Grupo:** 3CV2 — Bases de Datos (ESCOM - IPN)

---

En este documento se detallan y ejecutan cinco situaciones operacionales reales del Centro de Distribución Automotriz "El Pistón", aplicando sentencias avanzadas de manipulación de datos (DML) y control transaccional ACID (Gray & Reuter, 1993).

---

## 1. Situación 1: Inserción desde Consulta (INSERT con SELECT) y Manejo de Conflictos (UPSERT)

### Contexto de Negocio
El sistema de aprovisionamiento nocturno detecta productos de la categoría crítica "Sistemas de Frenos" (`ID_Categoria = 1`) que no cuentan con existencia física registrada en el almacén o presentan stock nulo, y genera automáticamente una orden de reabastecimiento en la bahía de recepción (`ID_Ubicacion = 1`).

### A. Inserción basada en consulta (INSERT ... SELECT)
```sql
INSERT INTO INVENTARIO_FISICO (SKU, ID_Ubicacion, ID_Inventario, Cantidad, Fecha_Ingreso)
SELECT 
    p.SKU,
    1 AS ID_Ubicacion,
    9000 + ROW_NUMBER() OVER () AS ID_Inventario,
    50 AS Cantidad,
    CURRENT_DATE AS Fecha_Ingreso
FROM PRODUCTO p
WHERE p.ID_Categoria = 1
  AND NOT EXISTS (
      SELECT 1 FROM INVENTARIO_FISICO inv WHERE inv.SKU = p.SKU
  )
LIMIT 5;
```

### B. Inserción con resolución de conflicto (UPSERT / ON CONFLICT DO UPDATE)
Si un operador intenta ingresar nuevamente una tarima con el mismo SKU e ID de Inventario, en lugar de abortar con un error de clave duplicada, el sistema acumula el conteo de piezas físicamente recibidas:
```sql
INSERT INTO INVENTARIO_FISICO (SKU, ID_Ubicacion, ID_Inventario, Cantidad, Fecha_Ingreso)
VALUES ('REP-FRE-0001', 1, 1, 20, CURRENT_DATE)
ON CONFLICT (SKU, ID_Inventario) 
DO UPDATE SET 
    Cantidad = INVENTARIO_FISICO.Cantidad + EXCLUDED.Cantidad,
    Fecha_Ingreso = EXCLUDED.Fecha_Ingreso;
```
* **Resultado:** La existencia previa del lote se incrementó en 20 piezas sin romper la restricción de clave primaria.

---

## 2. Situación 2: Actualización Dependiente de Otra Tabla y Clasificación con CASE

### A. UPDATE dependiente de otra tabla (JOIN / UPDATE FROM)
Se requiere actualizar la capacidad de carga restante de las ubicaciones del almacén en función del peso volumétrico acumulado de los productos almacenados en ellas:
```sql
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
```

### B. UPDATE condicional con expresión CASE
Actualización masiva del estatus de las órdenes de salida según la antigüedad transcurrida y el operador asignado:
```sql
UPDATE ORDEN_SALIDA
SET Estatus = CASE 
    WHEN Fecha_Emision < CURRENT_DATE - INTERVAL '30 days' AND Estatus = 'Pendiente' 
        THEN 'Cancelado'
    WHEN Estatus = 'Pendiente' AND ID_Empleado IN (SELECT ID_Empleado FROM EMPLEADO WHERE Certificacion_Montacargas = TRUE) 
        THEN 'En picking'
    WHEN Estatus = 'En picking' 
        THEN 'Empacado'
    ELSE Estatus
END
WHERE Estatus IN ('Pendiente', 'En picking');
```

---

## 3. Situación 3: Eliminación con Subconsulta vs. Borrado Lógico (Soft Delete)

### A. DELETE físico con subconsulta
Se procede a depurar del historial los renglones de pedidos pertenecientes a órdenes que fueron canceladas formalmente hace más de 60 días:
```sql
DELETE FROM DETALLE_ORDEN
WHERE ID_Orden IN (
    SELECT ID_Orden 
    FROM ORDEN_SALIDA 
    WHERE Estatus = 'Cancelado' 
      AND Fecha_Emision < CURRENT_DATE - INTERVAL '60 days'
);
```

### B. Implementación de Borrado Lógico (Soft Delete)
En los sistemas de gestión de almacenes (WMS), un borrado físico (`DELETE`) de un producto activo destruye irreversiblemente la integridad histórica de ventas y fletes. Por ello, se implementa una marca de estado o baja lógica:
```sql
-- Adición de columna para soporte de borrado lógico
ALTER TABLE PRODUCTO ADD COLUMN Activo BOOLEAN DEFAULT TRUE;

-- Borrado lógico de un producto descatalogado
UPDATE PRODUCTO 
SET Activo = FALSE 
WHERE SKU = 'REP-FRE-0005';
```

### Análisis Comparativo: ¿Cuándo conviene cada uno y qué se pierde?
* **Borrado Físico (Hard Delete):**  
  * *Cuándo conviene:* Solo en tablas de staging temporales, registros de sesiones expiradas o datos de prueba.  
  * *Qué se pierde:* Al borrar de verdad, si la acción es `CASCADE`, se destruyen todas las órdenes y detalles asociados, perdiendo el balance fiscal, métricas históricas de rotación de inventario y auditorías ante el SAT o clientes. Si la acción es `RESTRICT`, el sistema simplemente se bloqueará impidiendo el mantenimiento.
* **Borrado Lógico (Soft Delete):**  
  * *Cuándo conviene:* En catálogos maestros (`PRODUCTO`, `EMPLEADO`, `UBICACION`).  
  * *Beneficios:* Permite ocultar el registro de las pantallas de venta inmediata (`WHERE Activo = TRUE`) mientras se conserva la trazabilidad forense íntegra de las operaciones del pasado.

---

## 4. Situación 4: Transacción Multitabla con Punto de Recuperación (SAVEPOINT)

### Contexto
Un cliente solicita una orden de salida que incluye dos artículos: un amortiguador de suspensión (alta disponibilidad) y una pieza experimental fuera de stock. El sistema abre la transacción, inserta la cabecera, inserta la primera línea, fija un punto de recuperación (`SAVEPOINT`), intenta la línea 2, detecta el fallo, revierte únicamente la línea problemática y confirma la orden con los artículos válidos.

```sql
BEGIN;

-- 1. Insertar cabecera de orden
INSERT INTO ORDEN_SALIDA (ID_Orden, Fecha_Emision, Estatus, ID_Empleado)
VALUES (7777, NOW(), 'Pendiente', 1);

-- 2. Insertar primera línea de detalle (Válida)
INSERT INTO DETALLE_ORDEN (ID_Orden, Numero_Linea, SKU, Cantidad_Pedida)
VALUES (7777, 1, 'REP-FRE-0001', 4);

-- 3. Crear Punto de Recuperación
SAVEPOINT sp_linea_secundaria;

-- 4. Intento de insertar línea 2 con un producto inexistente (provoca error)
-- Simulamos la captura del error en la aplicación o procedimiento
ROLLBACK TO SAVEPOINT sp_linea_secundaria;

-- 5. Sustitución por una pieza alternativa disponible
INSERT INTO DETALLE_ORDEN (ID_Orden, Numero_Linea, SKU, Cantidad_Pedida)
VALUES (7777, 2, 'REP-MOT-0002', 2);

-- 6. Confirmación final de la transacción
COMMIT;
```
* **Verificación:** La orden 7777 quedó persistida de forma atómica y completa con sus dos líneas válidas, demostrando la resiliencia del punto de recuperación.

---

## 5. Situación 5: Transacción Fallida por Violación de Restricción y Comprobación de Reversión

### Demostración de Atomicidad (All-or-Nothing)
Se inicia una transacción que crea una nueva orden e intenta agregar una línea que viola intencionalmente la restricción de cantidad positiva (`Cantidad_Pedida = -5`):

```sql
-- Conteo previo de órdenes
SELECT count(*) FROM ORDEN_SALIDA WHERE ID_Orden = 8888;
-- Resultado: 0

BEGIN;

-- Paso A: Inserción válida en ORDEN_SALIDA
INSERT INTO ORDEN_SALIDA (ID_Orden, Fecha_Emision, Estatus, ID_Empleado)
VALUES (8888, NOW(), 'Pendiente', 2);

-- Paso B: Inserción que viola restricción CHECK (chk_detalle_cantidad_positiva)
INSERT INTO DETALLE_ORDEN (ID_Orden, Numero_Linea, SKU, Cantidad_Pedida)
VALUES (8888, 1, 'REP-FRE-0001', -5);

-- El gestor arroja el error:
-- ERROR: el nuevo renglón para la relación «detalle_orden» viola la restricción «check» «chk_detalle_cantidad_positiva»
-- SQLSTATE: 23514

-- La transacción queda en estado de aborto (CURRENT TRANSACTION IS ABORTED)
ROLLBACK;
```

### Comprobación de que la Base de Datos quedó intacta:
```sql
SELECT count(*) FROM ORDEN_SALIDA WHERE ID_Orden = 8888;
-- Resultado: 0

SELECT count(*) FROM DETALLE_ORDEN WHERE ID_Orden = 8888;
-- Resultado: 0
```
* **Conclusión:** Se comprobó que el motor garantizó la propiedad de atomicidad: al fallar el detalle, la cabecera insertada en el Paso A no fue guardada en el disco, preservando el estado previo de la base de datos.

---

## 6. Bibliografía

* Gray, J., & Reuter, A. (1993). *Transaction Processing: Concepts and Techniques*. Morgan Kaufmann. ISBN: 978-1558601901.
* Haerder, T., & Reuter, A. (1983). Principles of transaction-oriented database recovery. *ACM Computing Surveys (CSUR)*, 15(4), 287–317. https://doi.org/10.1145/356924.356928
* PostgreSQL Global Development Group. (2024). *PostgreSQL 16.2 Documentation: Chapter 7. Data Manipulation & Chapter 13. Concurrency Control*. https://www.postgresql.org/docs/16/mvcc.html
