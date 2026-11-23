# Práctica 5 — Ejercicio 2.6: Trabajo Individual por Integrante

**Integrante:** Mario Garcia Castillo  
**Boleta:** 2025630545  
**Carrera:** Ingeniería en Sistemas Computacionales (Grupo 3CV2)  
**Unidad de Aprendizaje:** Bases de Datos — Escuela Superior de Cómputo (ESCOM - IPN)  
**Firma del Alumno:** *Mario Garcia Castillo*

---

## 1. Relación Seleccionada del Proyecto Propio

* **Tabla Padre:** `PRODUCTO` (Clave primaria: `SKU`)
* **Tabla Hija:** `DETALLE_ORDEN` (Clave foránea: `SKU`, restricción `fk_detalle_producto`)
* **Relación EER:** Un producto puede ser solicitado en cero, una o muchas líneas de órdenes de salida; cada línea de detalle corresponde exactamente a un producto del catálogo.

---

## 2. Modificación de la Acción Referencial en una Copia de la Base

En el esquema oficial de "El Pistón", esta relación está configurada como `ON DELETE RESTRICT`. Para este experimento, se clonó la base de datos a `piston_test_mario` y se alteró la clave foránea a `ON DELETE CASCADE`:

```sql
-- En la base clonada de prueba:
ALTER TABLE DETALLE_ORDEN 
    DROP CONSTRAINT fk_detalle_producto;

ALTER TABLE DETALLE_ORDEN 
    ADD CONSTRAINT fk_detalle_producto FOREIGN KEY (SKU)
        REFERENCES PRODUCTO(SKU)
        ON DELETE CASCADE
        ON UPDATE CASCADE;
```

---

## 3. Demostración con Datos Reales: ¿Qué cambia al borrar un renglón padre?

Se seleccionó el producto con `SKU = 'REP-FRE-0001'` ("Pastillas de Freno Cerámicas"), el cual está referenciado en 3 líneas de órdenes de salida activas (`ID_Orden = 1, 22, 45`).

### A. Comportamiento Original con `ON DELETE RESTRICT`
* **Sentencia intentada:**
```sql
DELETE FROM PRODUCTO WHERE SKU = 'REP-FRE-0001';
```
* **Respuesta del motor:**
```text
ERROR: update o delete en «producto» viola la llave foránea «fk_detalle_producto» en la tabla «detalle_orden»
DETAIL: La llave (sku)=(REP-FRE-0001) todavía es referida desde la tabla «detalle_orden».
SQLSTATE: 23503
```
* **Impacto en los datos:**  
  * Conteo de `PRODUCTO`: Se mantienen los 250 renglones.
  * Conteo de `DETALLE_ORDEN`: Se mantienen intactos los 350 renglones.

### B. Comportamiento Modificado con `ON DELETE CASCADE`
* **Sentencia ejecutada en la copia:**
```sql
DELETE FROM PRODUCTO WHERE SKU = 'REP-FRE-0001';
```
* **Respuesta del motor:**
```text
DELETE 1
```
* **Impacto en los datos:**  
  * Conteo de `PRODUCTO`: Pasa de 250 a 249 renglones (se eliminó el producto).
  * Conteo de `DETALLE_ORDEN`: Pasa de 350 a 347 renglones (las 3 líneas de detalle fueron eliminadas automáticamente sin advertencia).

---

## 4. Análisis Crítico: ¿Qué se pierde, qué se conserva y cuál opción es la correcta?

* **¿Qué se pierde con `CASCADE`?**  
  Se pierde por completo el historial de despachos de las órdenes 1, 22 y 45. Si un cliente solicita una garantía, una aclaración fiscal o una factura detallada de lo que compró, la orden de salida quedará amputada o vacía, generando inconsistencias contables graves ante el SAT y el cliente.
* **¿Qué se conserva?**  
  Únicamente la cabecera de la orden con un importe y fecha, pero sin el desglose físico de qué refacciones salieron del almacén.
* **¿Cuál de las dos opciones es la correcta para el dominio?**  
  La opción correcta es **`ON DELETE RESTRICT`**.  
  En un sistema de distribución automotriz jamás se debe permitir el borrado físico en cascada de productos vendidos. Si un producto deja de comercializarse, se debe aplicar **borrado lógico** (`UPDATE PRODUCTO SET Activo = FALSE WHERE SKU = ...`), manteniendo viva la integridad histórica de todas las órdenes de salida del pasado.

---
*Documento firmado electrónicamente por Mario Garcia Castillo.*
