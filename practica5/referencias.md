# Práctica 5 — Ejercicio 2.1 y 2.2: Claves Foráneas y Acciones Referenciales

**Sistema de Gestión de Almacén y Centro de Distribución Automotriz "El Pistón"**  
**Equipo:** Garcia Castillo Mario, Gonzáles Martínez Danaet Montserrath, Islas Ramirez Diego  
**Grupo:** 3CV2 — Bases de Datos (ESCOM - IPN)

---

## 1. Inventario de Claves Foráneas del Proyecto Propio

La integridad referencial garantiza que toda clave foránea mantenga una correspondencia exacta y válida con una clave primaria existente en la tabla padre referenciada (Date, 2004; Elmasri & Navathe, 2016). En el esquema de "El Pistón", cada relación identificada en el modelo Entidad-Relación Extendido (EER) de la Práctica 2 y transformada en la Práctica 3 fue mapeada meticulosamente.

A continuación se detalla la matriz completa de claves foráneas, su origen conceptual en el modelo EER, su condición de nulidad y las acciones referenciales configuradas:

| Nombre de la Clave Foránea | Tabla Hija (Origen) | Columna FK | Tabla Padre (Referenciada) | Columna PK | Relación EER que Implementa | ¿Admite Nulos? | Justificación de Cardinalidad Mínima |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| `fk_producto_categoria` | `PRODUCTO` | `ID_Categoria` | `CATEGORIA` | `ID_Categoria` | *Pertenece a* (Clasificación) | **NO** | Cardinalidad mín. 1: Todo producto debe pertenecer obligatoriamente a una familia de refacciones. |
| `fk_pieza_producto` | `PIEZA_SOLIDA` | `SKU` | `PRODUCTO` | `SKU` | *Especialización (Subtipo)* | **NO** | Cardinalidad mín. 1: Es una entidad subtipo que comparte clave primaria y no existe sin el supertipo. |
| `fk_fluido_producto` | `FLUIDO_QUIMICO` | `SKU` | `PRODUCTO` | `SKU` | *Especialización (Subtipo)* | **NO** | Cardinalidad mín. 1: Subtipo dependiente por identidad del supertipo `PRODUCTO`. |
| `fk_orden_empleado` | `ORDEN_SALIDA` | `ID_Empleado` | `EMPLEADO` | `ID_Empleado` | *Asignada a / Despachada por* | **NO** | Cardinalidad mín. 1: Toda orden requiere un operador legalmente responsable del surtimiento. |
| `fk_detalle_orden` | `DETALLE_ORDEN` | `ID_Orden` | `ORDEN_SALIDA` | `ID_Orden` | *Compuesta por* (Composición) | **NO** | Cardinalidad mín. 1: Un renglón de detalle no tiene existencia lógica fuera de su cabecera de orden. |
| `fk_detalle_producto` | `DETALLE_ORDEN` | `SKU` | `PRODUCTO` | `SKU` | *Contiene / Solicita* | **NO** | Cardinalidad mín. 1: No es posible solicitar una partida de despacho sin asociar una pieza real. |
| `fk_inventario_producto` | `INVENTARIO_FISICO` | `SKU` | `PRODUCTO` | `SKU` | *Existencia física de* | **NO** | Cardinalidad mín. 1: Un lote en almacén debe certificar a qué producto del catálogo corresponde. |
| `fk_inventario_ubicacion` | `INVENTARIO_FISICO` | `ID_Ubicacion` | `UBICACION` | `ID_Ubicacion` | *Almacenado en bahía* | **NO** | Cardinalidad mín. 1: Todo stock debe tener coordenadas físicas precisas en rack. |

---

## 2. Justificación de Acciones Referenciales (`ON DELETE` y `ON UPDATE`)

La elección de las acciones referenciales responde a reglas estrictas del dominio logístico y legal de la empresa, evitando la pérdida accidental de información contable o la presencia de celdas huérfanas:

### 1. `fk_producto_categoria`
* **`ON DELETE RESTRICT`:**  
  * *Regla del dominio:* No se permite eliminar una categoría del catálogo si existen refacciones vigentes asociadas a ella. La empresa debe reclasificar previamente las piezas o darlas de baja antes de suprimir la categoría.
* **`ON UPDATE CASCADE`:**  
  * *Regla del dominio:* Si el identificador de una categoría es modificado por reestructuración de catálogo, todas las refacciones asociadas deben actualizar inmediatamente su referencia.

### 2. `fk_pieza_producto` y `fk_fluido_producto`
* **`ON DELETE CASCADE`:**  
  * *Regla del dominio:* Al tratarse de entidades de especialización (subtipos), la pieza sólida o el fluido químico carecen de significado si el producto maestro es retirado del catálogo; por ende, deben suprimirse en cascada de forma atómica.
* **`ON UPDATE CASCADE`:**  
  * *Regla del dominio:* Si el SKU del producto maestro se actualiza, la clave primaria compartida en los subtipos debe sincronizarse automáticamente.

### 3. `fk_orden_empleado`
* **`ON DELETE RESTRICT`:**  
  * *Regla del dominio:* Está prohibido eliminar el registro de un empleado si este figura como responsable en órdenes de salida históricas. La empresa requiere conservar la trazabilidad de auditoría de despacho (auditoría fiscal de inventarios).

### 4. `fk_detalle_orden`
* **`ON DELETE CASCADE`:**  
  * *Regla del dominio:* Los renglones de detalle son partes intrínsecas de una orden de salida. Si la cabecera de la orden se elimina del sistema, todas sus líneas de detalle se cancelan y destruyen simultáneamente.

### 5. `fk_detalle_producto`
* **`ON DELETE RESTRICT`:**  
  * *Regla del dominio:* Un producto no puede ser borrado de la base de datos si aparece referenciado en órdenes de salida previas o en proceso. Se debe preservar la evidencia histórica de lo que fue solicitado.

### 6. `fk_inventario_producto`
* **`ON DELETE RESTRICT`:**  
  * *Regla del dominio:* No se puede dar de baja un producto del catálogo si todavía se reportan lotes físicos con existencias en almacén. Primero debe liquidarse físicamente el stock.

### 7. `fk_inventario_ubicacion`
* **`ON DELETE RESTRICT`:**  
  * *Regla del dominio:* Una celda física de almacenamiento (rack/pasillo) no puede borrarse del sistema mientras contenga tarimas o piezas ubicadas en ella. La reubicación física de la mercancía es un prerrequisito obligatorio.

---

## 3. Bibliografía

* Date, C. J. (2004). *An Introduction to Database Systems* (8th ed.). Pearson.
* Elmasri, R., & Navathe, S. B. (2016). *Fundamentals of Database Systems* (7th ed.). Addison-Wesley.
* Silberschatz, A., Korth, H. F., & Sudarshan, S. (2020). *Database System Concepts* (7th ed.). McGraw-Hill.
