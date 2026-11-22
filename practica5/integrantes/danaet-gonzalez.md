# Práctica 5 — Ejercicio 2.6: Trabajo Individual por Integrante

**Integrante:** Danaet Montserrath Gonzáles Martínez  
**Boleta:** 2025630554  
**Carrera:** Ingeniería en Sistemas Computacionales (Grupo 3CV2)  
**Unidad de Aprendizaje:** Bases de Datos — Escuela Superior de Cómputo (ESCOM - IPN)  
**Firma de la Alumna:** *Danaet Montserrath Gonzáles Martínez*

---

## 1. Relación Seleccionada del Proyecto Propio

* **Tabla Padre:** `UBICACION` (Clave primaria: `ID_Ubicacion`)
* **Tabla Hija:** `INVENTARIO_FISICO` (Clave foránea: `ID_Ubicacion`, restricción `fk_inventario_ubicacion`)
* **Relación EER:** Una celda física de rack/bahía puede albergar cero, uno o varios lotes de refacciones; cada lote de inventario físico debe estar obligatoriamente posicionado en una celda existente del almacén.

---

## 2. Modificación de la Acción Referencial en una Copia de la Base

En el diseño original del almacén "El Pistón", esta restricción tiene la acción `ON DELETE RESTRICT`. Para este análisis experimental, se creó una base clonada de pruebas (`piston_test_danaet`) y se cambió la acción referencial a `ON DELETE CASCADE`:

```sql
-- En la base de prueba:
ALTER TABLE INVENTARIO_FISICO 
    DROP CONSTRAINT fk_inventario_ubicacion;

ALTER TABLE INVENTARIO_FISICO 
    ADD CONSTRAINT fk_inventario_ubicacion FOREIGN KEY (ID_Ubicacion)
        REFERENCES UBICACION(ID_Ubicacion)
        ON DELETE CASCADE
        ON UPDATE CASCADE;
```

---

## 3. Demostración con Datos Reales: ¿Qué cambia al borrar un renglón padre?

Se seleccionó la celda física `ID_Ubicacion = 1` (`ZONA-A`, `PAS-01`, `RCK-01`, `NIV-01`), la cual contiene actualmente 5 lotes de refacciones con un total acumulado de 185 piezas físicas de refacciones valorizadas.

### A. Comportamiento Original con `ON DELETE RESTRICT`
* **Sentencia intentada:**
```sql
DELETE FROM UBICACION WHERE ID_Ubicacion = 1;
```
* **Respuesta del motor:**
```text
ERROR: update o delete en «ubicacion» viola la llave foránea «fk_inventario_ubicacion» en la tabla «inventario_fisico»
DETAIL: La llave (id_ubicacion)=(1) todavía es referida desde la tabla «inventario_fisico».
SQLSTATE: 23503
```
* **Impacto en los datos:**  
  * Conteo de `UBICACION`: Permanece en 60 ubicaciones.
  * Conteo de `INVENTARIO_FISICO`: Permanece en 300 lotes (100% de la mercancía resguardada).

### B. Comportamiento Modificado con `ON DELETE CASCADE`
* **Sentencia ejecutada en la copia:**
```sql
DELETE FROM UBICACION WHERE ID_Ubicacion = 1;
```
* **Respuesta del motor:**
```text
DELETE 1
```
* **Impacto en los datos:**  
  * Conteo de `UBICACION`: Se reduce a 59 ubicaciones.
  * Conteo de `INVENTARIO_FISICO`: Se reduce drásticamente de 300 a 295 lotes (se eliminaron los 5 lotes de inventario en cascada sin previo aviso).

---

## 4. Análisis Crítico: ¿Qué se pierde, qué se conserva y cuál opción es la correcta?

* **¿Qué se pierde con `CASCADE`?**  
  Se pierde el registro contable y de existencias de 185 piezas automotrices valorizadas. En un centro de distribución real, esto provocaría una pérdida contable inmediata (merma no explicada o desvío de inventario fantasma), ya que las refacciones siguen físicamente en el pasillo pero desaparecieron del sistema informático.
* **¿Qué se conserva?**  
  Solo la eliminación de la estructura física del rack.
* **¿Cuál de las dos opciones es la correcta para el dominio?**  
  La opción correcta e indispensable es **`ON DELETE RESTRICT`**.  
  Si la empresa necesita dar mantenimiento o retirar un rack físico deteriorado, la regla de oro de la logística dicta que primero se debe emitir una orden de transferencia interna (`UPDATE INVENTARIO_FISICO SET ID_Ubicacion = nueva_bahia WHERE ID_Ubicacion = 1;`). Únicamente cuando la celda quede con 0 lotes alojados, el sistema permitirá dar de baja la ubicación física sin destruir mercancía contable.

---
*Documento firmado electrónicamente por Danaet Montserrath Gonzáles Martínez.*
