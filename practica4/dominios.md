# Práctica 4 — Ejercicio 1.1: Tipos de Dato y Dominios del Proyecto Propio

**Sistema de Gestión de Almacén y Centro de Distribución Automotriz "El Pistón"**  
**Equipo:** Garcia Castillo Mario, Gonzáles Martínez Danaet Montserrath, Islas Ramirez Diego  
**Grupo:** 3CV2 — Bases de Datos (ESCOM - IPN)

---

## 1. Definición y Justificación de Columnas y Tipos de Datos

En el diseño relacional, el dominio de un atributo determina el universo de valores válidos que puede almacenar una columna, garantizando la consistencia semántica y física de los datos (Codd, 1970; Elmasri & Navathe, 2016). En el proyecto **"El Pistón"**, se definieron tipos de datos precisos para evitar problemas típicos de modelado como el uso inadecuado de punto flotante en magnitudes monetarias o de peso exacto, desbordamientos de enteros o textos sin longitud delimitada.

A continuación se presenta la tabla exhaustiva con cada columna del esquema del proyecto propio, el tipo de dato asignado, su precisión/longitud y la justificación técnica de negocio.

| Tabla | Columna | Tipo de Dato | Longitud / Precisión | Regla del Dominio / Justificación Técnica |
| :--- | :--- | :--- | :--- | :--- |
| **CATEGORIA** | `ID_Categoria` | `INT` (PK) | 4 bytes (Entero) | Identificador numérico único de la familia de refacciones. Permite indexación B-Tree de alta velocidad. |
| **CATEGORIA** | `Nombre` | `VARCHAR(100)` | 100 caracteres | Denominación comercial de la categoría (ej. 'Sistemas de Frenos', 'Suspensión'). Longitud máxima suficiente para nombres descriptivos. |
| **CATEGORIA** | `Nivel_Prioridad` | `INT` | 4 bytes | Prioridad operativa de reabastecimiento en escala discreta del 1 (máxima) al 5 (mínima). |
| **EMPLEADO** | `ID_Empleado` | `INT` (PK) | 4 bytes (Entero) | Número de nómina único del personal operativo del Centro de Distribución. |
| **EMPLEADO** | `Nombre` | `VARCHAR(150)` | 150 caracteres | Nombre y apellidos completos del empleado para identificación laboral y auditoría. |
| **EMPLEADO** | `Turno` | `turno_laboral` | Dominio / ENUM | Turno de trabajo asignado ('Matutino', 'Vespertino', 'Nocturno', 'Mixto'). Solo valores predefinidos por Recursos Humanos. |
| **EMPLEADO** | `Certificacion_Montacargas` | `BOOLEAN` | 1 byte (Lógico) | Indicador booleano (TRUE/FALSE) que valida si el empleado cuenta con permiso de la STPS para operar montacargas de hombre sentado. |
| **UBICACION** | `ID_Ubicacion` | `INT` (PK) | 4 bytes (Entero) | Identificador secuencial unívoco del espacio físico en el almacén. |
| **UBICACION** | `Zona` | `VARCHAR(20)` | 20 caracteres | Código alfanumérico del sector del almacén (ej. 'ZONA-A', 'RECEPCION', 'PICKING-LIGERO'). |
| **UBICACION** | `Pasillo` | `VARCHAR(20)` | 20 caracteres | Identificador de pasillo logístico (ej. 'PAS-01', 'PAS-12'). |
| **UBICACION** | `Rack` | `VARCHAR(20)` | 20 caracteres | Estructura vertical de almacenamiento metálico (ej. 'RCK-01' a 'RCK-30'). |
| **UBICACION** | `Nivel` | `VARCHAR(20)` | 20 caracteres | Altura de la bahía o balda (ej. 'NIV-01' para suelo hasta 'NIV-06' para altura de montacargas). |
| **UBICACION** | `Capacidad_Peso_Kg` | `NUMERIC(10, 2)` | 10 dígitos, 2 dec. | Capacidad máxima de carga estructural en kilogramos. Se usa `NUMERIC` para evitar el redondeo impreciso de `FLOAT` en cálculos de seguridad estructural (OSHA/NOM-006-STPS). |
| **UBICACION** | `Tipo_Almacenaje` | `tipo_almacenaje_dom` | Dominio / ENUM | Modalidad de almacenamiento: 'Paletizado', 'Caja ligera', 'Estanteria pesada', 'Material peligroso'. |
| **PRODUCTO** | `SKU` | `VARCHAR(50)` | 50 caracteres (PK) | Stock Keeping Unit bajo estándar automotriz alfanumérico (ej. 'REP-FRE-1001'). Identificador unívoco del bien. |
| **PRODUCTO** | `Nombre` | `VARCHAR(150)` | 150 caracteres | Descripción comercial formal del componente automotriz. |
| **PRODUCTO** | `Largo_cm` | `NUMERIC(8, 2)` | 8 dígitos, 2 dec. | Longitud física en centímetros para cubicaje de embalaje. Precisión fija requerida para cálculo volumétrico de fletes. |
| **PRODUCTO** | `Ancho_cm` | `NUMERIC(8, 2)` | 8 dígitos, 2 dec. | Anchura física en centímetros. Valor estrictamente positivo. |
| **PRODUCTO** | `Alto_cm` | `NUMERIC(8, 2)` | 8 dígitos, 2 dec. | Altura física en centímetros. Valor estrictamente positivo. |
| **PRODUCTO** | `Peso_Kg` | `NUMERIC(8, 2)` | 8 dígitos, 2 dec. | Masa neta del producto en kilogramos. No permite punto flotante para balance de masa en estiba. |
| **PRODUCTO** | `ID_Categoria` | `INT` (FK) | 4 bytes | Clave foránea que asocia el artículo a su categoría maestra. |
| **PIEZA_SOLIDA** | `SKU` | `VARCHAR(50)` (PK/FK) | 50 caracteres | Subtipo de producto. Clave primaria y foránea al supertipo `PRODUCTO`. |
| **PIEZA_SOLIDA** | `Material_Fabricacion` | `VARCHAR(100)` | 100 caracteres | Composición elemental (ej. 'Acero al carbono', 'Aluminio anodizado', 'Cerámica reforzada'). |
| **PIEZA_SOLIDA** | `Fragil` | `BOOLEAN` | 1 byte | Bandera lógica que determina si requiere embalaje con amortiguación y estiba máxima controlada. |
| **FLUIDO_QUIMICO** | `SKU` | `VARCHAR(50)` (PK/FK) | 50 caracteres | Subtipo de producto químico/lubricante. Clave primaria y foránea al supertipo `PRODUCTO`. |
| **FLUIDO_QUIMICO** | `Volumen_Mililitros` | `NUMERIC(10, 2)` | 10 dígitos, 2 dec. | Contenido volumétrico neto en mililitros (ej. 946.35 ml para 1 cuarto de galón). |
| **FLUIDO_QUIMICO** | `Nivel_Inflamabilidad` | `INT` | 4 bytes | Clasificación de riesgo de fuego según rombo de seguridad NFPA 704 (0 = no arde, 4 = extremadamente inflamable). |
| **FLUIDO_QUIMICO** | `Requiere_Refrigeracion` | `BOOLEAN` | 1 byte | Indica si el producto químico requiere almacenamiento térmico controlado (< 15 °C). |
| **ORDEN_SALIDA** | `ID_Orden` | `INT` (PK) | 4 bytes (Entero) | Folio único de la orden de surtimiento y despacho a clientes o talleres asociados. |
| **ORDEN_SALIDA** | `Fecha_Emision` | `TIMESTAMP` | 8 bytes | Marca temporal exacta (año, mes, día, hora, minuto, segundo) en que se radicó la orden. |
| **ORDEN_SALIDA** | `Estatus` | `estatus_orden` | Dominio / ENUM | Estado del ciclo de vida logístico: 'Pendiente', 'En picking', 'Empacado', 'Despachado', 'Cancelado'. |
| **ORDEN_SALIDA** | `ID_Empleado` | `INT` (FK) | 4 bytes | Identificador del empleado encargado de preparar y certificar la orden. |
| **DETALLE_ORDEN** | `ID_Orden` | `INT` (PK comp.) | 4 bytes (FK) | Folio de la orden de salida correspondiente. |
| **DETALLE_ORDEN** | `Numero_Linea` | `INT` (PK comp.) | 4 bytes | Número secuencial del renglón dentro de la orden (1, 2, 3...). |
| **DETALLE_ORDEN** | `SKU` | `VARCHAR(50)` (FK) | 50 caracteres | Clave del producto solicitado en esa línea. |
| **DETALLE_ORDEN** | `Cantidad_Pedida` | `INT` | 4 bytes | Unidades requeridas en la línea de pedido. Debe ser estrictamente mayor a 0. |
| **INVENTARIO_FISICO** | `SKU` | `VARCHAR(50)` (PK comp.) | 50 caracteres (FK) | Producto automotriz posicionado físicamente. |
| **INVENTARIO_FISICO** | `ID_Ubicacion` | `INT` (FK) | 4 bytes | Ubicación exacta de almacenamiento en el almacén. |
| **INVENTARIO_FISICO** | `ID_Inventario` | `INT` (PK comp.) | 4 bytes | Identificador del lote o partida física de inventario en dicha posición. |
| **INVENTARIO_FISICO** | `Cantidad` | `INT` | 4 bytes | Existencias físicas reales contadas en unidades. Debe ser mayor o igual a 0. |
| **INVENTARIO_FISICO** | `Fecha_Ingreso` | `DATE` | 4 bytes | Fecha de recepción en almacén. No puede ser una fecha futura. |

---

## 2. Definición de Dominios Reutilizables en PostgreSQL (`CREATE DOMAIN`)

En PostgreSQL, `CREATE DOMAIN` permite crear tipos definidos por el usuario basados en un tipo fundamental, incorporando restricciones `CHECK` que se evalúan automáticamente en cualquier columna que declare ese dominio (PostgreSQL Global Development Group, 2024).

Se crearon e implementaron los siguientes dominios en la migración `001-dominios.sql`:

```sql
-- 1. Dominio para identificador estándar de SKU automotriz
CREATE DOMAIN sku_automotriz AS VARCHAR(50)
    CONSTRAINT chk_formato_sku CHECK (VALUE ~ '^[A-Z0-9]{3,4}-[A-Z0-9]{3,4}-[0-9]{3,5}$');

-- 2. Dominio para turnos laborales permitidos en el almacén
CREATE DOMAIN turno_laboral AS VARCHAR(20)
    CONSTRAINT chk_valores_turno CHECK (VALUE IN ('Matutino', 'Vespertino', 'Nocturno', 'Mixto'));

-- 3. Dominio para estatus del ciclo de vida de órdenes
CREATE DOMAIN estatus_orden AS VARCHAR(30)
    CONSTRAINT chk_valores_estatus CHECK (VALUE IN ('Pendiente', 'En picking', 'Empacado', 'Despachado', 'Cancelado'));

-- 4. Dominio para modalidad física de estiba y almacenaje
CREATE DOMAIN tipo_almacenaje_dom AS VARCHAR(50)
    CONSTRAINT chk_valores_almacenaje CHECK (VALUE IN ('Paletizado', 'Caja ligera', 'Estanteria pesada', 'Material peligroso', 'Racks selectivos'));

-- 5. Dominio para riesgo de inflamabilidad NFPA 704
CREATE DOMAIN nivel_inflamabilidad_nfpa AS INT
    CONSTRAINT chk_rango_nfpa CHECK (VALUE BETWEEN 0 AND 4);

-- 6. Dominio para magnitudes de masa y dimensiones exactas (estrictamente positivas)
CREATE DOMAIN dimension_positiva AS NUMERIC(8, 2)
    CONSTRAINT chk_dimension_mayor_cero CHECK (VALUE > 0.00);

-- 7. Dominio para cantidades no negativas de existencia
CREATE DOMAIN cantidad_existencia AS INT
    CONSTRAINT chk_existencia_no_negativa CHECK (VALUE >= 0);
```

### ¿Qué se gana con el uso de Dominios?
1. **Centralización de Reglas de Negocio:** Una regla como la escala NFPA (0 a 4) o la lista de turnos queda escrita en un único lugar en el catálogo del motor (`pg_type`, `pg_constraint`). Si la empresa agrega un turno 'Especial', se altera el dominio una sola vez y todas las tablas lo heredan inmediatamente.
2. **Consistencia Semántica:** Evita discrepancias entre tablas donde un desarrollador podría permitir 'MATUTINO' y otro 'Matutino' o 'mañana'.
3. **Mantenibilidad del Código DDL:** Reduce la redundancia de declarar cláusulas `CHECK (col IN (...))` en múltiples columnas a lo largo del esquema relacional.
4. **Legibilidad del Diccionario de Datos:** El tipo de la columna describe intrínsecamente su propósito de negocio (`estatus_orden` es mucho más autoexplicativo que `VARCHAR(30)`).

---

## 3. Bibliografía y Referencias Académicas

* Codd, E. F. (1970). A relational model of data for large shared data banks. *Communications of the ACM*, 13(6), 377–387. https://doi.org/10.1145/362384.362685
* Date, C. J. (2004). *An Introduction to Database Systems* (8th ed.). Addison-Wesley. ISBN: 978-0321197849.
* Elmasri, R., & Navathe, S. B. (2016). *Fundamentals of Database Systems* (7th ed.). Pearson. ISBN: 978-0133970777.
* PostgreSQL Global Development Group. (2024). *PostgreSQL 16.2 Documentation: Chapter 41. Domains and Types*. The PostgreSQL Project. https://www.postgresql.org/docs/16/sql-createdomain.html
* Secretaría del Trabajo y Previsión Social [STPS]. (2014). *Norma Oficial Mexicana NOM-006-STPS-2014: Manejo y almacenamiento de materiales - Condiciones de seguridad y salud en el trabajo*. Diario Oficial de la Federación.
