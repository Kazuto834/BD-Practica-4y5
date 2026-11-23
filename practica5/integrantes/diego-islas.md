# Práctica 5 — Ejercicio 2.6: Trabajo Individual por Integrante

**Integrante:** Diego Islas Ramirez  
**Boleta:** 2025630905  
**Carrera:** Ingeniería en Sistemas Computacionales (Grupo 3CV2)  
**Unidad de Aprendizaje:** Bases de Datos — Escuela Superior de Cómputo (ESCOM - IPN)  
**Firma del Alumno:** *Diego Islas Ramirez*

---

## 1. Relación Seleccionada del Proyecto Propio

* **Tabla Padre:** `EMPLEADO` (Clave primaria: `ID_Empleado`)
* **Tabla Hija:** `ORDEN_SALIDA` (Clave foránea: `ID_Empleado`, restricción `fk_orden_empleado`)
* **Relación EER:** Un empleado del almacén puede preparar y autorizar cero, una o muchas órdenes de salida; cada orden de salida debe contar obligatoriamente con el registro del empleado responsable.

---

## 2. Modificación de la Acción Referencial en una Copia de la Base

En el esquema relacional de "El Pistón", esta relación está protegida mediante `ON DELETE RESTRICT`. Para este experimento, se duplicó la base a `piston_test_diego` y se probó la sustitución por `ON DELETE CASCADE`:

```sql
-- En la base clonada de prueba:
ALTER TABLE ORDEN_SALIDA 
    DROP CONSTRAINT fk_orden_empleado;

ALTER TABLE ORDEN_SALIDA 
    ADD CONSTRAINT fk_orden_empleado FOREIGN KEY (ID_Empleado)
        REFERENCES EMPLEADO(ID_Empleado)
        ON DELETE CASCADE
        ON UPDATE CASCADE;
```

---

## 3. Demostración con Datos Reales: ¿Qué cambia al borrar un renglón padre?

Se seleccionó al empleado con `ID_Empleado = 1` ("Mario Garcia Castillo"), quien tiene a su cargo el despacho de 11 órdenes de salida registradas en el sistema.

### A. Comportamiento Original con `ON DELETE RESTRICT`
* **Sentencia intentada:**
```sql
DELETE FROM EMPLEADO WHERE ID_Empleado = 1;
```
* **Respuesta del motor:**
```text
ERROR: update o delete en «empleado» viola la llave foránea «fk_orden_empleado» en la tabla «orden_salida»
DETAIL: La llave (id_empleado)=(1) todavía es referida desde la tabla «orden_salida».
SQLSTATE: 23503
```
* **Impacto en los datos:**  
  * Conteo de `EMPLEADO`: Se conservan los 20 empleados.
  * Conteo de `ORDEN_SALIDA`: Se conservan intactas las 220 órdenes de salida.
  * Conteo de `DETALLE_ORDEN`: Se mantienen intactos los 350 renglones.

### B. Comportamiento Modificado con `ON DELETE CASCADE`
* **Sentencia ejecutada en la copia:**
```sql
DELETE FROM EMPLEADO WHERE ID_Empleado = 1;
```
* **Respuesta del motor:**
```text
DELETE 1
```
* **Impacto en los datos:**  
  * Conteo de `EMPLEADO`: Pasa de 20 a 19 empleados.
  * Conteo de `ORDEN_SALIDA`: Pasa de 220 a 209 órdenes de salida (¡se borraron 11 órdenes completas!).
  * Conteo de `DETALLE_ORDEN`: Se eliminaron en cascada secundaria 18 renglones de pedidos asociados a esas órdenes.

---

## 4. Análisis Crítico: ¿Qué se pierde, qué se conserva y cuál opción es la correcta?

* **¿Qué se pierde con `CASCADE`?**  
  Se pierde toda la evidencia operativa y legal de las 11 órdenes de despacho. La empresa pierde el registro de quién autorizó la salida de miles de pesos en refacciones. En auditorías laborales, penales o fiscales, esto constituye una violación grave a la trazabilidad de la cadena de suministro.
* **¿Qué se conserva?**  
  Solamente el resto de las órdenes operadas por otros empleados.
* **¿Cuál de las dos opciones es la correcta para el dominio?**  
  La opción indudable es **`ON DELETE RESTRICT`**.  
  Los empleados no se deben borrar de una base de datos operativa si ya tienen historial transaccional generado. Si un trabajador deja de laborar en la empresa (renuncia o despido), la práctica correcta es la **baja administrativa** (marcarlo como inactivo o revocar sus credenciales de acceso), pero su clave e histórico deben preservarse para fines de auditoría y deslinde de responsabilidades.

---
*Documento firmado electrónicamente por Diego Islas Ramirez.*
