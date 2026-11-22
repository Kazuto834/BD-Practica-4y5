# Práctica 4 — Ejercicio 1.5: Pruebas de Restricciones de Dominio

**Sistema de Gestión de Almacén y Centro de Distribución Automotriz "El Pistón"**  
**Equipo:** Garcia Castillo Mario, Gonzáles Martínez Danaet Montserrath, Islas Ramirez Diego  
**Grupo:** 3CV2 — Bases de Datos (ESCOM - IPN)

---

En este documento se presentan diez casos de prueba diseñados para intentar violar intencionalmente las restricciones de dominio implementadas en el esquema de la base de datos de "El Pistón". Cada caso documenta:
1. La sentencia SQL intentada.
2. El resultado esperado.
3. El mensaje exacto devuelto por PostgreSQL (código de error SQLSTATE y mensaje literal).
4. La regla del dominio del negocio que quedó protegida.

---

### Caso 1: Violación de Restricción NOT NULL
* **Operación intentada:** Intentar dar de alta un producto omitiendo el nombre comercial del artículo.
```sql
INSERT INTO PRODUCTO (SKU, Nombre, Largo_cm, Ancho_cm, Alto_cm, Peso_Kg, ID_Categoria)
VALUES ('REP-FRE-9999', NULL, 15.00, 10.00, 5.00, 2.50, 1);
```
* **Resultado esperado:** Rechazo inmediato de la transacción por infracción de nulidad en atributo mandatorio.
* **Mensaje devuelto por el gestor:**
```text
ERROR: el valor nulo en la columna «nombre» de la relación «producto» viola la restricción de no nulo
DETAIL: La fila que falla contiene (REP-FRE-9999, null, 15.00, 10.00, 5.00, 2.50, 1).
SQLSTATE: 23502
```
* **Regla del dominio protegida:** Todo producto automotriz en el catálogo maestro debe tener una denominación comercial legible para identificación en almacén y facturación.

---

### Caso 2: Validación de Valor por Defecto (DEFAULT)
* **Operación intentada:** Registrar un nuevo empleado sin indicar turno ni certificación de montacargas, verificando la asignación por omisión del valor natural `FALSE`.
```sql
INSERT INTO EMPLEADO (ID_Empleado, Nombre, Turno)
VALUES (999, 'Técnico de Pruebas', 'Matutino');

SELECT ID_Empleado, Nombre, Turno, Certificacion_Montacargas 
FROM EMPLEADO WHERE ID_Empleado = 999;
```
* **Resultado esperado:** Inserción exitosa; la columna `Certificacion_Montacargas` adopta el valor `false` definido por defecto sin intervención manual.
* **Mensaje devuelto por el gestor:**
```text
INSERT 0 1
 id_empleado |        nombre        |  turno   | certificacion_montacargas 
-------------+----------------------+----------+---------------------------
         999 | Técnico de Pruebas   | Matutino | f
(1 fila)
```
* **Regla del dominio protegida:** Ningún empleado recién contratado puede operar montacargas por defecto hasta aprobar formalmente la certificación STPS.

---

### Caso 3: Violación de Restricción UNIQUE Simple
* **Operación intentada:** Insertar una nueva categoría con el nombre 'Sistemas de Frenos', el cual ya existe en la base de datos (registrado previamente con `ID_Categoria = 1`).
```sql
INSERT INTO CATEGORIA (ID_Categoria, Nombre, Nivel_Prioridad)
VALUES (99, 'Sistemas de Frenos', 2);
```
* **Resultado esperado:** Rechazo por colisión de clave única en el atributo `Nombre`.
* **Mensaje devuelto por el gestor:**
```text
ERROR: llave duplicada viola restricción de unicidad «uq_categoria_nombre»
DETAIL: Ya existe la llave (nombre)=(Sistemas de Frenos).
SQLSTATE: 23505
```
* **Regla del dominio protegida:** No pueden existir dos familias de refacciones con el mismo nombre para evitar ambigüedades en la clasificación de piezas y compras.

---

### Caso 4: Violación de Restricción UNIQUE Compuesta
* **Operación intentada:** Registrar una ubicación física compartiendo la misma tupla espacial `(Zona, Pasillo, Rack, Nivel)` que una celda ya ocupada (`ZONA-A`, `PAS-01`, `RCK-01`, `NIV-01`).
```sql
INSERT INTO UBICACION (ID_Ubicacion, Zona, Pasillo, Rack, Nivel, Capacidad_Peso_Kg, Tipo_Almacenaje)
VALUES (999, 'ZONA-A', 'PAS-01', 'RCK-01', 'NIV-01', 800.00, 'Paletizado');
```
* **Resultado esperado:** Error de llave duplicada sobre la restricción compuesta `uq_ubicacion_posicion_espacial`.
* **Mensaje devuelto por el gestor:**
```text
ERROR: llave duplicada viola restricción de unicidad «uq_ubicacion_posicion_espacial»
DETAIL: Ya existe la llave (zona, pasillo, rack, nivel)=(ZONA-A, PAS-01, RCK-01, NIV-01).
SQLSTATE: 23505
```
* **Regla del dominio protegida:** Dos ubicaciones no pueden coexistir físicamente en las mismas coordenadas tridimensionales dentro del almacén.

---

### Caso 5: Violación de Restricción CHECK de Rango (Capacidad de Carga)
* **Operación intentada:** Declarar una ubicación de almacenamiento con una capacidad de carga nula o negativa (`Capacidad_Peso_Kg = -250.00`).
```sql
INSERT INTO UBICACION (ID_Ubicacion, Zona, Pasillo, Rack, Nivel, Capacidad_Peso_Kg, Tipo_Almacenaje)
VALUES (980, 'ZONA-B', 'PAS-05', 'RCK-05', 'NIV-02', -250.00, 'Paletizado');
```
* **Resultado esperado:** Rechazo inmediato por no cumplir la condición `Capacidad_Peso_Kg > 0.00`.
* **Mensaje devuelto por el gestor:**
```text
ERROR: el nuevo renglón para la relación «ubicacion» viola la restricción «check» «chk_ubicacion_capacidad_positiva»
DETAIL: La fila que falla contiene (980, ZONA-B, PAS-05, RCK-05, NIV-02, -250.00, Paletizado).
SQLSTATE: 23514
```
* **Regla del dominio protegida:** Toda estructura de almacenaje debe tener una resistencia de carga positiva real para salvaguardar la integridad de los operadores y evitar colapsos.

---

### Caso 6: Violación de Restricción CHECK de Rango Químico (Escala NFPA 704)
* **Operación intentada:** Registrar un químico automotriz asignándole un nivel de inflamabilidad de 7, excediendo el rango normativo de 0 a 4.
```sql
INSERT INTO FLUIDO_QUIMICO (SKU, Volumen_Mililitros, Nivel_Inflamabilidad, Requiere_Refrigeracion)
VALUES ('REP-QUI-0001', 1000.00, 7, FALSE);
```
* **Resultado esperado:** Violación de la restricción `chk_fluido_inflamabilidad_rango`.
* **Mensaje devuelto por el gestor:**
```text
ERROR: el nuevo renglón para la relación «fluido_quimico» viola la restricción «check» «chk_fluido_inflamabilidad_rango»
DETAIL: La fila que falla contiene (REP-QUI-0001, 1000.00, 7, f).
SQLSTATE: 23514
```
* **Regla del dominio protegida:** La categorización de riesgo de incendio debe ajustarse estrictamente a la norma internacional NFPA 704 de 0 a 4.

---

### Caso 7: Violación de Restricción CHECK de Formato (Expresión Regular en SKU)
* **Operación intentada:** Registrar un producto automotriz cuyo código SKU contenga caracteres inválidos o espacios en blanco (`SKU = 'sku 123 *?'`).
```sql
INSERT INTO PRODUCTO (SKU, Nombre, Largo_cm, Ancho_cm, Alto_cm, Peso_Kg, ID_Categoria)
VALUES ('sku 123 *?', 'Filtro Experimental', 10.00, 10.00, 10.00, 1.00, 2);
```
* **Resultado esperado:** Rechazo de inserción por fallo en la expresión regular `^[A-Z0-9_-]{3,50}$`.
* **Mensaje devuelto por el gestor:**
```text
ERROR: el nuevo renglón para la relación «producto» viola la restricción «check» «chk_producto_sku_formato»
DETAIL: La fila que falla contiene (sku 123 *?, Filtro Experimental, 10.00, 10.00, 10.00, 1.00, 2).
SQLSTATE: 23514
```
* **Regla del dominio protegida:** Los códigos SKU deben cumplir con el estándar alfanumérico para compatibilidad con lectores de código de barras y terminales de radiofrecuencia (RF).

---

### Caso 8: Violación de Restricción CHECK Temporal (Fecha Futura en Recepción)
* **Operación intentada:** Dar entrada a un lote de inventario en almacén con una fecha en el año 2099 (`Fecha_Ingreso = '2099-12-31'`).
```sql
INSERT INTO INVENTARIO_FISICO (SKU, ID_Ubicacion, ID_Inventario, Cantidad, Fecha_Ingreso)
VALUES ('REP-FRE-0001', 1, 9999, 50, '2099-12-31');
```
* **Resultado esperado:** Error al evaluar la restricción `chk_inventario_fecha_valida` (`Fecha_Ingreso <= CURRENT_DATE`).
* **Mensaje devuelto por el gestor:**
```text
ERROR: el nuevo renglón para la relación «inventario_fisico» viola la restricción «check» «chk_inventario_fecha_valida»
DETAIL: La fila que falla contiene (REP-FRE-0001, 1, 9999, 50, 2099-12-31).
SQLSTATE: 23514
```
* **Regla del dominio protegida:** Ningún lote físico puede ingresar al almacén con fecha posterior al día en curso.

---

### Caso 9: Violación de Restricción CHECK de Lista de Valores (Turno Laboral)
* **Operación intentada:** Asignar a un empleado un turno inexistente denominado 'Intermedio-Especial'.
```sql
INSERT INTO EMPLEADO (ID_Empleado, Nombre, Turno, Certificacion_Montacargas)
VALUES (888, 'Operador Extraordinario', 'Intermedio-Especial', FALSE);
```
* **Resultado esperado:** Error de violación de lista de dominios en `chk_empleado_turno`.
* **Mensaje devuelto por el gestor:**
```text
ERROR: el nuevo renglón para la relación «empleado» viola la restricción «check» «chk_empleado_turno»
DETAIL: La fila que falla contiene (888, Operador Extraordinario, Intermedio-Especial, f).
SQLSTATE: 23514
```
* **Regla del dominio protegida:** El personal operativo debe estar asignado exclusivamente a los roles contractuales definidos por la empresa ('Matutino', 'Vespertino', 'Nocturno', 'Mixto').

---

### Caso 10: Violación de Restricción CHECK de Cantidad Positiva en Pedido
* **Operación intentada:** Registrar una línea de orden de salida solicitando una cantidad igual a cero (`Cantidad_Pedida = 0`) o negativa.
```sql
INSERT INTO DETALLE_ORDEN (ID_Orden, Numero_Linea, SKU, Cantidad_Pedida)
VALUES (1, 99, 'REP-FRE-0001', 0);
```
* **Resultado esperado:** Falla de verificación en `chk_detalle_cantidad_positiva` (`Cantidad_Pedida > 0`).
* **Mensaje devuelto por el gestor:**
```text
ERROR: el nuevo renglón para la relación «detalle_orden» viola la restricción «check» «chk_detalle_cantidad_positiva»
DETAIL: La fila que falla contiene (1, 99, REP-FRE-0001, 0).
SQLSTATE: 23514
```
* **Regla del dominio protegida:** Un renglón de pedido de surtimiento solo tiene razón de ser si se solicita al menos una unidad del producto.
