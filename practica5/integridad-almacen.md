# Práctica 5 — Ejercicio 2.5: Integridad Referencial en el Almacén Asignado

**Proyecto Asignado:** Obra Pública Municipal — *Federally Funded Public Works in Mexico: A Measured Lakehouse Layer*  
**Repositorio Fork:** `Fork-PublicMunicipalWorks_IJCOPI`  
**Artículo de Referencia:** Huavlen et al. (2026), ICOKG / IJCOPI.  
**Equipo:** Garcia Castillo Mario, Gonzáles Martínez Danaet Montserrath, Islas Ramirez Diego (Grupo 3CV2)

---

## 1. Identificación de Tablas de Hechos, Dimensiones y Granularidad

En el modelado dimensional para análisis OLAP y Lakehouse, la arquitectura separa claramente las métricas cuantitativas del negocio (hechos) del contexto descriptivo mediante el cual se filtran y agregan (dimensiones) (Kimball & Ross, 2013).

### A. Tablas de Hechos y Granularidad
1. **`warehouse.fact_eventos_auditoria` (Tabla de Hechos Central / Atómica):**
   * *Granularidad:* **Un renglón representa un evento atómico e irrepetible de auditoría, gestión o modificación administrativa, técnica o financiera ocurrido sobre una obra pública específica en una fecha y marca temporal determinada.**
   * *Métricas asociadas:* `monto_presupuesto`, `monto_costo`, `monto_ejercido`, `porcentaje_avance_fisico`, `porcentaje_avance_presup`, `dias_transcurridos`, `total_votos`, `dias_desde_evento_anterior`.
   * *Estructura física:* Particionada por rango temporal (`PARTITION BY RANGE (tiempo_key)`) en particiones anuales (2024, 2025, 2026).
2. **`warehouse.fact_obra_mensual` (Tabla de Hechos de Acumulados / Snapshot Periódico):**
   * *Granularidad:* **Un renglón representa la foto del estado acumulado de una obra pública al cierre de un mes calendario/fiscal específico.**
   * *Métricas asociadas:* `presupuesto_total`, `costo_acumulado`, `saldo_presupuesto`, `porcentaje_ejercido`, `avance_fisico_acumulado`, `dias_retraso`.

### B. Tablas de Dimensiones
* `warehouse.dim_tiempo` (SCD Tipo 0 - Inmutable): Fecha, año, trimestre, mes, día hábil, periodo fiscal.
* `warehouse.dim_tipo_evento` (SCD Tipo 0): Catálogo de 17 eventos de auditoría (creación de obra, asignación presupuestal, informe de avance, acta entrega).
* `warehouse.dim_obra` (SCD Tipo 2 - Histórico con vigencias): Expediente, nombre, estado, fechas programadas.
* `warehouse.dim_region` (SCD Tipo 2): Comunidad, barrio, colonia.
* `warehouse.dim_constructora` (SCD Tipo 2): RFC, razón social, tipo de ejecutor.
* `warehouse.dim_personal` (SCD Tipo 2): Funcionarios, supervisores, proyectistas.
* `warehouse.dim_fuente` (SCD Tipo 1 - Sobrescribe): Programa federal/estatal y fondo presupuestario.
* `warehouse.dim_presupuesto` (SCD Tipo 2): Montos contratados históricos.
* `warehouse.dim_poblador` (SCD Tipo 1 - Privacidad): Padrón ciudadano anonimizado.
* `warehouse.dim_propuesta` (SCD Tipo 1): Iniciativas ciudadanas de obras públicas.

---

## 2. Evaluación de Claves Foráneas y Consultas de Detección de Huérfanos

### Declaración en el Esquema
En el esquema PostgreSQL del almacén (`ESQUEMA DEL DATA WAREHOUSE.sql`), las claves foráneas hacia las dimensiones están declaradas formalmente mediante cláusulas `REFERENCES`:
```sql
tiempo_key       INTEGER NOT NULL REFERENCES warehouse.dim_tiempo(tiempo_key),
tipo_evento_key  INTEGER NOT NULL REFERENCES warehouse.dim_tipo_evento(tipo_evento_key),
obra_key         BIGINT REFERENCES warehouse.dim_obra(obra_key),
region_key       BIGINT REFERENCES warehouse.dim_region(region_key),
...
```
Sin embargo, en las capas analíticas externas del Lakehouse (**Apache Iceberg** en capa Plata y **Parquet** en capa Oro leídas por DuckDB) la especificación física de llaves foráneas no existe a nivel de almacenamiento de archivos.

### Consultas SQL para Detección de Huérfanos
Se ejecutaron consultas de comprobación de integridad para identificar posibles hechos que apunten a dimensiones inexistentes en la base:

```sql
-- 1. Hechos con obra inexistente
SELECT count(*) AS hechos_huerfanos_obra
FROM warehouse.fact_eventos_auditoria f
LEFT JOIN warehouse.dim_obra o ON f.obra_key = o.obra_key
WHERE f.obra_key IS NOT NULL AND o.obra_key IS NULL;
-- Resultado: 0

-- 2. Hechos con tipo de evento inexistente
SELECT count(*) AS hechos_huerfanos_evento
FROM warehouse.fact_eventos_auditoria f
LEFT JOIN warehouse.dim_tipo_evento te ON f.tipo_evento_key = te.tipo_evento_key
WHERE f.tipo_evento_key IS NOT NULL AND te.tipo_evento_key IS NULL;
-- Resultado: 0

-- 3. Snapshots mensuales con tiempo no registrado
SELECT count(*) AS snapshot_huerfano_tiempo
FROM warehouse.fact_obra_mensual fom
LEFT JOIN warehouse.dim_tiempo t ON fom.tiempo_key = t.tiempo_key
WHERE fom.tiempo_key IS NOT NULL AND t.tiempo_key IS NULL;
-- Resultado: 0
```
* **Diagnóstico:** Los datos cargados cumplen al 100% la integridad referencial; no se detectó ningún hecho huérfano.

---

## 3. ¿Por qué un Data Warehouse / Lakehouse a veces omite las FKs a propósito y qué riesgos corre?

### Razones Técnicas para Omitir Claves Foráneas Físicas
1. **Rendimiento Masivo de Ingesta (Throughput en Cargas Batch):**  
   En almacenes de datos donde se ingieren cientos de miles o millones de registros por hora (como los 253,346 proyectos de 2024 de SHCP), verificar cada clave foránea fila por fila obliga al motor a realizar búsquedas en índices B-Tree de múltiples dimensiones. Omitir la validación física en la base permite cargas masivas a velocidad lineal de disco/red (Inmon, 2005; Kimball & Ross, 2013).
2. **Desacoplamiento de Cargas ETL/ELT y Dimensiones de Llegada Tardía (*Late-Arriving Dimensions*):**  
   En la vida real, los hechos transaccionales (un pago, una supervisión de campo) a menudo llegan a la base antes de que el catálogo de la dimensión (ej. la constructora recién registrada o el nuevo supervisor) haya sido procesado en la tubería ETL. Si existiera una restricción física dura (`FOREIGN KEY`), la carga completa fallaría.
3. **Incompatibilidad Nativa en Formatos Columnares de Objetos:**  
   Formatos abiertos como Apache Iceberg, Delta Lake y Apache Parquet distribuidos sobre S3 no tienen un motor relacional centralizado con bloqueos para exigir integridad referencial entre archivos.

### Riesgos Críticos al Omitir Claves Foráneas
1. **Aparición de Registros Huérfanos (*Ghost Facts*):**  
   Si la lógica del ETL tiene un error o un registro es eliminado en la dimensión, los hechos quedan desvinculados.
2. **Pérdida de Información en Consultas con `INNER JOIN`:**  
   Cualquier reporte analítico de BI que combine la tabla de hechos con la dimensión descartará en silencio los hechos huérfanos, subestimando presupuestos o gastos públicos reales ante la ciudadanía.
3. **Métricas Duplicadas o Infladas con `OUTER JOIN`:**  
   Si se intenta subsanar con `LEFT JOIN`, los campos descriptivos resultarán en nulos masivos (`UNKNOWN`), dañando los tableros ejecutivos.
4. **Práctica Recomendada en la Industria:**  
   Garantizar la integridad en la **capa de transformación (dbt, scripts de validación previa)** o utilizar llaves sustitutas de sistema (`-1: Dimensión no identificada`) para nunca insertar hechos con punteros nulos o huérfanos.

---

## 4. Bibliografía

* Huavlen, G. et al. (2026). Federally funded public works in Mexico: A measured lakehouse layer. *International Journal of Combinatorial Optimization Problems and Informatics*, 17(1), 45–62.
* Inmon, W. H. (2005). *Building the Data Warehouse* (4th ed.). John Wiley & Sons. ISBN: 978-0764599446.
* Kimball, R., & Ross, M. (2013). *The Data Warehouse Toolkit: The Definitive Guide to Dimensional Modeling* (3rd ed.). John Wiley & Sons. ISBN: 978-1118530801.
