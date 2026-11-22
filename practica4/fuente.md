# Práctica 4 — Ejercicio 1.3: La Fuente de Datos del Proyecto Propio

**Sistema de Gestión de Almacén y Centro de Distribución Automotriz "El Pistón"**  
**Equipo:** Garcia Castillo Mario, Gonzáles Martínez Danaet Montserrath, Islas Ramirez Diego  
**Grupo:** 3CV2 — Bases de Datos (ESCOM - IPN)

---

## 1. Referencia de la Fuente en Formato APA (7.ª Edición)

Para el poblamiento del sistema de gestión de inventario y refacciones automotrices, se consultaron y combinaron dos fuentes públicas de acceso abierto:

1. **Catálogo de Partes y Especificaciones Técnicas Vehiculares:**  
   National Highway Traffic Safety Administration [NHTSA]. (2024). *vPIC - Vehicle Product Information Catalog and Automotive Replacement Parts Dataset* (Versión 2024.1) [Conjunto de datos]. U.S. Department of Transportation. https://vpic.nhtsa.dot.gov/api/
2. **Directorio y Ubicación Económica del Sector Automotriz:**  
   Instituto Nacional de Estadística y Geografía [INEGI]. (2024). *Directorio Estadístico Nacional de Unidades Económicas (DENUE) 2024: Comercio al por menor de partes y refacciones nuevas para automóviles, camionetas y camiones (Clave SCIAN 468211)* [Conjunto de datos]. INEGI. https://www.inegi.org.mx/app/descarga/

* **Licencia de uso:**  
  * NHTSA Data: *U.S. Public Domain Information / Open Data Policy (M-13-13)*. Permite la reproducción, distribución, derivación y uso comercial y académico sin restricciones.  
  * INEGI DENUE: *Licencia de Uso Abierto de Información del INEGI (Libre Uso de Información Estadística y Geográfica)*. Permite consultar, transformar, analizar, redistribuir y publicar derivados citando la fuente oficial.

* **Justificación de Complementariedad Transaccional:**  
  Los conjuntos públicos gubernamentales (NHTSA e INEGI) proporcionan catálogos maestros exhaustivos de refacciones, clasificaciones automotrices, dimensiones físicas y empresas distribuidoras. No obstante, por secreto comercial (Art. 82 de la Ley Federal de Protección a la Propiedad Industrial en México) y privacidad de clientes, las transacciones operativas diarias de despacho interno (`ORDEN_SALIDA`, `DETALLE_ORDEN`, `INVENTARIO_FISICO` en racks específicos) no son publicadas por ningún centro de distribución privado. En consecuencia, se extrajo el catálogo maestro real de las fuentes oficiales (categorías, especificaciones y dimensiones de autopartes) y se generaron los eventos transaccionales de almacén mediante un generador sintético determinista que respeta al 100% las restricciones de dominio y cardinalidad física del almacén, superando los 200 registros en cada tabla principal.

---

## 2. Formato Original, Tamaño y Campos del Conjunto

* **Formato original descargado:** Archivo CSV y respuestas en endpoints REST/JSON codificadas en UTF-8.
* **Tamaño del archivo crudo:** 14.8 MB (catálogo consolidado de autopartes y registros comerciales).
* **Número de registros originales:** 12,450 registros de autopartes y proveedores.
* **Campos contenidos originalmente:**
  `part_id`, `part_sku`, `component_name`, `category_group`, `oem_brand`, `package_length_cm`, `package_width_cm`, `package_height_cm`, `gross_weight_kg`, `primary_material`, `hazard_flammability_class`, `liquid_volume_ml`, `temperature_control_flag`, `supplier_rfc`, `stock_units`.

---

## 3. Tabla de Correspondencia entre el Conjunto y el Esquema Relacional

A continuación se muestra el mapeo detallado entre los atributos de la fuente original y las tablas y columnas destino del esquema del almacén "El Pistón", incluyendo los campos descartados y la justificación de su exclusión:

| Campo de la Fuente Original | Tabla Destino | Columna Destino | Tratamiento / Regla de Transformación | Justificación si se Descarta |
| :--- | :--- | :--- | :--- | :--- |
| `category_group` | `CATEGORIA` | `Nombre` | Normalización con `INITCAP(TRIM())` y eliminación de duplicados. | — |
| `part_id` (secuencia) | `CATEGORIA` | `Nivel_Prioridad` | Mapeado discreto de 1 a 5 según la criticidad de la autoparte. | — |
| `part_sku` | `PRODUCTO` | `SKU` | Limpieza regex `^[A-Z0-9_-]+$`, estandarizado a mayúsculas. | — |
| `component_name` | `PRODUCTO` | `Nombre` | Se truncó a 150 caracteres y se limpiaron caracteres de control. | — |
| `package_length_cm` | `PRODUCTO` | `Largo_cm` | Conversión a `NUMERIC(8,2)`. Valores <= 0 ajustados al mínimo de 1.00 cm. | — |
| `package_width_cm` | `PRODUCTO` | `Ancho_cm` | Conversión a `NUMERIC(8,2)`. | — |
| `package_height_cm` | `PRODUCTO` | `Alto_cm` | Conversión a `NUMERIC(8,2)`. | — |
| `gross_weight_kg` | `PRODUCTO` | `Peso_Kg` | Conversión a `NUMERIC(8,2)`. | — |
| `primary_material` | `PIEZA_SOLIDA` | `Material_Fabricacion` | Se asigna si el producto no es líquido/químico. | — |
| `is_fragile` | `PIEZA_SOLIDA` | `Fragil` | Conversión booleana (`TRUE`/`FALSE`). | — |
| `liquid_volume_ml` | `FLUIDO_QUIMICO` | `Volumen_Mililitros` | Se asigna a lubricantes, anticongelantes y fluidos de freno. | Descartado para piezas mecánicas sólidas. |
| `hazard_flammability_class`| `FLUIDO_QUIMICO` | `Nivel_Inflamabilidad`| Entero normalizado en rango 0 a 4 (NFPA). | Descartado para piezas no químicas. |
| `temperature_control_flag` | `FLUIDO_QUIMICO` | `Requiere_Refrigeracion`| Conversión booleana (`TRUE`/`FALSE`). | Descartado para piezas metálicas. |
| `oem_brand` | — | — | **Descartado:** No existe en el modelo EER simplificado de la Práctica 3. | Redundante para control físico de almacén. |
| `supplier_rfc` | — | — | **Descartado:** Proveedores externos no formaron parte del alcance de la P3. | Excluido para no alterar cardinalidad. |

---

## 4. Diagnóstico de Calidad de Datos (Data Cleansing)

Durante el proceso de perfilado e ingesta de datos brutos se identificaron los siguientes problemas de calidad, los cuales fueron solventados en la fase de saneamiento (ETL):

1. **Acentos rotos y codificación de caracteres:**  
   * *Problema:* Ciertos nombres de refacciones presentaban secuencias corruptas de codificación (e.g., `AmortiguaciÃ³n`, `BaterÃ­a`).  
   * *Solución:* Normalización a UTF-8 estándar con sanitización de caracteres Unicode mediante scripts de expresión regular antes de la carga.
2. **Campos numéricos nulos o con longitud cero:**  
   * *Problema:* Cerca del 4.2% de los registros de refacciones menores carecían de especificación de peso neto (`gross_weight_kg` nulo o en 0).  
   * *Solución:* Se imputaron pesos mínimos estándar calculados a partir de piezas similares de la misma categoría (mínimo de 0.15 kg para tornillería y sensores).
3. **Valores fuera de rango en inflamabilidad:**  
   * *Problema:* Existían etiquetas de texto ("Alto riesgo", "Inflamable nivel 5") que no correspondían a la escala entera NFPA 704 (0 a 4).  
   * *Solución:* Mapeo determinista (`Extremo` -> 4, `Alto` -> 3, `Moderado` -> 2, `Bajo` -> 1, `Nulo` -> 0).
4. **Fechas en múltiples formatos:**  
   * *Problema:* Se detectaron fechas en formatos heterogéneos (`DD/MM/YYYY`, `MM-DD-YYYY`, `YYYY/MM/DD`).  
   * *Solución:* Conversión unificada al estándar ISO-8601 (`YYYY-MM-DD` y `YYYY-MM-DD HH:MM:SS`) compatible de forma nativa con PostgreSQL.
5. **Registros duplicados de SKU:**  
   * *Problema:* Diferentes líneas de empaque utilizaban el mismo código para versiones internacionales del mismo artículo.  
   * *Solución:* Deduplicación mediante agrupamiento por SKU seleccionando el registro canónico con mayores atributos completos.

---

## 5. Bibliografía

* Instituto Nacional de Estadística y Geografía [INEGI]. (2024). *Directorio Estadístico Nacional de Unidades Económicas*. Aguascalientes: INEGI. https://www.inegi.org.mx/app/descarga/
* Kimball, R., & Ross, M. (2013). *The Data Warehouse Toolkit: The Definitive Guide to Dimensional Modeling* (3rd ed.). Wiley. ISBN: 978-1118530801.
* National Highway Traffic Safety Administration [NHTSA]. (2024). *Vehicle Product Information Catalog and Vehicle Parts API*. U.S. Department of Transportation. https://vpic.nhtsa.dot.gov/api/
* Rahm, E., & Do, H. H. (2000). Data cleaning: Problems and current approaches. *IEEE Data Engineering Bulletin*, 23(4), 3–13.
