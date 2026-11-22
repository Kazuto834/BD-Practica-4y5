# Práctica 5 — Ejercicio 2.3: Pruebas de Integridad Referencial

**Sistema de Gestión de Almacén y Centro de Distribución Automotriz "El Pistón"**  
**Equipo:** Garcia Castillo Mario, Gonzáles Martínez Danaet Montserrath, Islas Ramirez Diego  
**Grupo:** 3CV2 — Bases de Datos (ESCOM - IPN)

---

## 1. Pruebas por Acción Referencial con Datos Reales

### A. Prueba de `ON DELETE RESTRICT` (Protección de Categoría con Refacciones)
* **Objetivo:** Demostrar que el gestor prohíbe la eliminación de una categoría padre si existen refacciones asociadas en `PRODUCTO`.
* **Conteo previo:**
  * Tabla `CATEGORIA`: 10 registros.
  * Tabla `PRODUCTO`: 250 registros (25 refacciones asignadas a `ID_Categoria = 1`).
* **Sentencia DML ejecutada:**
```sql
DELETE FROM CATEGORIA WHERE ID_Categoria = 1;
```
* **Respuesta del gestor:**
```text
ERROR: update o delete en «categoria» viola la llave foránea «fk_producto_categoria» en la tabla «producto»
DETAIL: La llave (id_categoria)=(1) todavía es referida desde la tabla «producto».
SQLSTATE: 23503
```
* **Conteo posterior:**
  * Tabla `CATEGORIA`: 10 registros (0 eliminados).
  * Tabla `PRODUCTO`: 250 registros (intactos).
* **Conclusión:** Se comprobó que `RESTRICT` previene desastres de huérfanos en cascada no deseados.

---

### B. Prueba de `ON DELETE CASCADE` (Eliminación de Orden y sus Detalles)
* **Objetivo:** Demostrar la eliminación atómica en cascada de los renglones dependientes de `DETALLE_ORDEN` cuando se elimina la cabecera en `ORDEN_SALIDA`.
* **Conteo previo:**
  * Tabla `ORDEN_SALIDA`: 220 registros.
  * Tabla `DETALLE_ORDEN`: 350 registros (la orden `ID_Orden = 1` tiene 2 líneas asociadas).
* **Sentencia DML ejecutada:**
```sql
DELETE FROM ORDEN_SALIDA WHERE ID_Orden = 1;
```
* **Respuesta del gestor:**
```text
DELETE 1
```
* **Conteo posterior:**
  * Tabla `ORDEN_SALIDA`: 219 registros.
  * Tabla `DETALLE_ORDEN`: 348 registros (las 2 líneas asociadas fueron eliminadas automáticamente).
* **Conclusión:** Los renglones débiles se limpiaron en cascada sin dejar registros huérfanos en la base de datos.

---

### C. Prueba de `ON UPDATE CASCADE` (Sincronización de Clave Primaria)
* **Objetivo:** Probar que la modificación de un identificador en la tabla padre se propaga automáticamente a todas las tablas hijas sin error.
* **Conteo previo:**
  * En `PRODUCTO`: Existen 25 productos con `ID_Categoria = 10`.
* **Sentencia DML ejecutada:**
```sql
UPDATE CATEGORIA SET ID_Categoria = 100 WHERE ID_Categoria = 10;
```
* **Respuesta del gestor:**
```text
UPDATE 1
```
* **Verificación posterior:**
```sql
SELECT count(*) FROM PRODUCTO WHERE ID_Categoria = 100;
-- Resultado: 25 registros actualizados automáticamente.
SELECT count(*) FROM PRODUCTO WHERE ID_Categoria = 10;
-- Resultado: 0 registros con la clave antigua.
```
* **Conclusión:** La propagación `ON UPDATE CASCADE` asegura coherencia total ante reestructuraciones de identificadores.

---

## 2. Inserción con Clave Foránea Inexistente (Violación de FK)

* **Sentencia intentada:**
```sql
INSERT INTO PRODUCTO (SKU, Nombre, Largo_cm, Ancho_cm, Alto_cm, Peso_Kg, ID_Categoria)
VALUES ('REP-FRE-TEST', 'Bomba Hidráulica Falsa', 20.00, 15.00, 10.00, 3.50, 9999);
```
* **Mensaje devuelto por el motor:**
```text
ERROR: inserción o actualización en la tabla «producto» viola la llave foránea «fk_producto_categoria»
DETAIL: La llave (id_categoria)=(9999) no está presente en la tabla «categoria».
SQLSTATE: 23503
```
* **Análisis:** El motor intercepta la operación antes de persistir, impidiendo la creación de productos desvinculados de su catálogo.

---

## 3. Prueba de Orden de Carga y Resolución de Dependencias

### ¿Qué ocurre al intentar cargar las tablas hijas antes que las padres?
Si un script intenta cargar `PRODUCTO` o `DETALLE_ORDEN` antes de poblar `CATEGORIA` u `ORDEN_SALIDA`:
```sql
-- Intento erróneo de cargar detalle antes de la orden
\copy DETALLE_ORDEN FROM 'practica4/datos/detalle_ordenes.csv' WITH (FORMAT csv, HEADER true);
```
* **Mensaje de fallo:**
```text
ERROR: inserción o actualización en la tabla «detalle_orden» viola la llave foránea «fk_detalle_orden»
DETAIL: La llave (id_orden)=(1) no está presente en la tabla «orden_salida».
SQLSTATE: 23503
```

### ¿Cómo lo resuelve la solución implementada?
El script `poblar.sql` resuelve este problema mediante un **ordenamiento topológico estricto del Grafo Acíclico Dirigido (DAG)** de dependencias referenciales:
1. Nivel 0 (Raíces): `CATEGORIA`, `EMPLEADO`, `UBICACION`.
2. Nivel 1 (Dependientes directos): `PRODUCTO` (requiere `CATEGORIA`), `ORDEN_SALIDA` (requiere `EMPLEADO`).
3. Nivel 2 (Subtipos e intermedias): `PIEZA_SOLIDA`, `FLUIDO_QUIMICO` (requieren `PRODUCTO`).
4. Nivel 3 (Dependientes compuestos): `DETALLE_ORDEN` (requiere `ORDEN_SALIDA` y `PRODUCTO`), `INVENTARIO_FISICO` (requiere `PRODUCTO` y `UBICACION`).

---

## 4. Consultas de Comprobación de Integridad (Salida Vacía = 0 Renglones)

Las siguientes consultas SQL fueron ejecutadas tanto en la base propia como en la asignada, certificando que ambas bases están 100% libres de anomalías:

### A. Búsqueda de Claves Foráneas Huérfanas
```sql
-- En proyecto propio: verificar productos sin categoría válida
SELECT p.SKU, p.ID_Categoria 
FROM PRODUCTO p 
LEFT JOIN CATEGORIA c ON p.ID_Categoria = c.ID_Categoria 
WHERE c.ID_Categoria IS NULL;
-- (0 renglones)

-- Verificar detalles de orden sin cabecera de orden existente
SELECT d.ID_Orden, d.Numero_Linea 
FROM DETALLE_ORDEN d 
LEFT JOIN ORDEN_SALIDA o ON d.ID_Orden = o.ID_Orden 
WHERE o.ID_Orden IS NULL;
-- (0 renglones)

-- Verificar lotes de inventario sin producto existente
SELECT i.SKU, i.ID_Inventario 
FROM INVENTARIO_FISICO i 
LEFT JOIN PRODUCTO p ON i.SKU = p.SKU 
WHERE p.SKU IS NULL;
-- (0 renglones)
```

### B. Búsqueda de Duplicados en Columnas Únicas
```sql
-- Verificar nombres duplicados en CATEGORIA
SELECT Nombre, count(*) 
FROM CATEGORIA 
GROUP BY Nombre 
HAVING count(*) > 1;
-- (0 renglones)

-- Verificar duplicados en celdas espaciales de UBICACION
SELECT Zona, Pasillo, Rack, Nivel, count(*) 
FROM UBICACION 
GROUP BY Zona, Pasillo, Rack, Nivel 
HAVING count(*) > 1;
-- (0 renglones)
```

### C. Búsqueda de Nulos en Columnas Mandatorias
```sql
-- Verificar nulos en columnas obligatorias de PRODUCTO
SELECT count(*) 
FROM PRODUCTO 
WHERE SKU IS NULL OR Nombre IS NULL OR Largo_cm IS NULL OR Peso_Kg IS NULL;
-- (0 renglones)

-- Verificar nulos en cabecera de ORDEN_SALIDA
SELECT count(*) 
FROM ORDEN_SALIDA 
WHERE ID_Orden IS NULL OR Fecha_Emision IS NULL OR Estatus IS NULL OR ID_Empleado IS NULL;
-- (0 renglones)
```

**Resultado:** Todas las consultas arrojan exactamente **0 renglones**, demostrando la integridad de los datos.
