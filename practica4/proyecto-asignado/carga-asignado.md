# Práctica 4 — Ejercicio 1.7: El Proyecto Asignado: Datos, Carga y Restricciones de Dominio

**Proyecto Asignado:** Obra Pública Municipal — *Federally Funded Public Works in Mexico: A Measured Lakehouse Layer*  
**Repositorio Fork:** `Fork-PublicMunicipalWorks_IJCOPI`  
**Artículo de Referencia:**  
Huavlen, G. et al. (2026). *Federally Funded Public Works in Mexico: a Measured Lakehouse Layer*. 5th International Conference on Ontologies and Knowledge Graphs (ICOKG 2026), Edición Especial en *International Journal of Combinatorial Optimization Problems and Informatics* (IJCOPI).  
**Equipo:** Garcia Castillo Mario, Gonzáles Martínez Danaet Montserrath, Islas Ramirez Diego (Grupo 3CV2)

---

## 1. Origen de los Datos y Script de Carga Automatizada

De acuerdo con lo estipulado en el artículo y la nota docente, para el caso de **Obra Pública Municipal**, los sistemas operacionales de los municipios (ej. Temascaltepec, Estado de México) resguardan expedientes internos no siempre abiertos al público en crudo, mientras que el nivel federal consolida los proyectos de la Secretaría de Hacienda y Crédito Público (SHCP).

El repositorio asignado cuenta con dos vertientes de datos:
1. **Datos Oficiales Consolidados (Capa Lakehouse):** 9 archivos oficiales del gasto federalizado (2020-2025) validados con hashes criptográficos SHA-256 en `lakehouse/fuentes.json`, cruzados con el Censo de Población y Vivienda 2020 del INEGI, el Censo Nacional de Gobiernos Municipales y Demarcaciones Territoriales 2023 del INEGI y los Índices de Rezago Social 2020 del CONEVAL.
2. **Datos Sintéticos Operacionales (Capa Transaccional / Almacén):** Generados mediante el script parametrizado `scripts/generate_synthetic_data.py`, el cual simula con fidelidad matemática el ciclo de vida de obras públicas, presupuestos, supervisores, constructoras y propuestas de pobladores.

### Implementación del Script de Carga (Requisitos 1.4)
Se elaboró el script `scripts-carga-asignado.sql` que opera bajo los mismos estándares de calidad:
* **Orden de Carga:** Topológico en cascada:
  1. Dimensiones inmutables (`dim_tiempo`, `dim_tipo_evento`).
  2. Dimensiones de entidades participantes (`dim_region`, `dim_constructora`, `dim_personal`, `dim_poblador`, `dim_fuente`).
  3. Dimensiones de proyectos y presupuestos (`dim_obra`, `dim_presupuesto`, `dim_propuesta`).
  4. Tablas de hechos particionadas (`fact_eventos_auditoria_2024`, `fact_eventos_auditoria_2025`, `fact_acumulado_obra_mensual`).
* **Idempotencia:** Empleo de `ON CONFLICT (...) DO NOTHING` en dimensiones y llaves primarias subrogadas.
* **Transaccionalidad Atómica:** Todo el script se ejecuta en una transacción `BEGIN ... COMMIT` con detención ante errores.

---

## 2. Comparación entre Datos Obtenidos y lo Reportado en el Artículo

| Indicador / Métrica | Valor Reportado en el Artículo (Huavlen et al., 2026) | Valor Obtenido en la Carga Operacional / Fork | Explicación Técnica de la Diferencia |
| :--- | :--- | :--- | :--- |
| **Total de Obras Georreferenciadas (Nivel Nacional)** | 253,346 proyectos (Ejercicio Fiscal 2024) | 253,346 registros en capas exportadas (`silver/gold`) | Coincidencia exacta con las particiones Parquet e índices del mapa nacional. |
| **Entidades Federativas Cubiertas** | 32 estados de la República Mexicana | 32 estados | Idéntico. Se integraron geometrías Natural Earth 5.1.2. |
| **Municipios del Esquema Operacional** | 1 municipio piloto focalizado (Temascaltepec) | 1 municipio piloto (Temascaltepec) | El esquema relacional operacional (`DDLBASEObPub.sql`) modela la gestión interna municipal, mientras que el Lakehouse modela la federación completa. |
| **Granularidad de Auditoría** | Eventos atómicos de avance, presupuesto y voto ciudadano | 17 tipos de eventos en `dim_tipo_evento` | Plena correspondencia con los eventos registrados en el artículo. |

**Conclusión de la Comparación:**  
Los números son coherentes. La aparente discrepancia entre el número masivo del artículo (253,346 proyectos nacionales) y los registros de la base transaccional (`public.obra`) se debe a la separación arquitectónica formal explicada en la Sección 2 del artículo: el Lakehouse consolida el gasto nacional en capas Plata/Oro, mientras que la base relacional de referencia implementa el sistema de control operacional municipal.

---

## 3. Revisión de Restricciones de Dominio y 3 Propuestas Nuevas

### Restricciones Declaradas en el Esquema Asignado
El esquema base del fork incluye restricciones elementales como llaves primarias, llaves foráneas y listas simples de texto en el rol de personal:
`rol character varying NOT NULL CHECK (rol::text = ANY (ARRAY['Supervisor'::character varying, 'Director'::character varying, 'Secretario'::character varying, 'Proyectista'::character varying]::text[]))`.
Sin embargo, carece de validaciones de rangos físicos, financieros y cronológicos esenciales para evitar inconsistencias graves en obras públicas.

### 3 Nuevas Restricciones de Dominio Propuestas

1. **Restricción Cronológica en Periodo de Ejecución de la Obra:**
   * *Regla del dominio:* La fecha de conclusión de una obra pública no puede ser cronológicamente anterior a su fecha formal de inicio.
   * *Implementación SQL:*
     ```sql
     ALTER TABLE public.obra ADD CONSTRAINT chk_obra_fechas_coherentes 
         CHECK (fecha_final >= fecha_inicio);
     ```
2. **Restricción de Rango en Porcentaje de Avance Físico:**
   * *Regla del dominio:* El porcentaje de avance físico reportado en los informes técnicos de supervisión debe ubicarse de manera estricta entre 0% y 100%.
   * *Implementación SQL:*
     ```sql
     ALTER TABLE public.informes ADD CONSTRAINT chk_informes_avance_porcentaje 
         CHECK (porcentaje_avance BETWEEN 0 AND 100);
     ```
3. **Restricción de Monto Presupuestal Estrictamente Positivo:**
   * *Regla del dominio:* Todo presupuesto asignado a un contrato de obra pública municipal debe ser un valor monetario positivo mayor a cero pesos.
   * *Implementación SQL:*
     ```sql
     ALTER TABLE public.presupuesto_obra ADD CONSTRAINT chk_presupuesto_monto_positivo 
         CHECK (presupuesto_total > 0.00);
     ```

### Validación en una Copia con Datos Reales/Generados
Se ejecutaron las tres restricciones en una copia clonada de la base del fork (`postgres_asignado_test`):
* **Resultado:** Las tres restricciones se crearon con éxito (`ALTER TABLE ... ADD CONSTRAINT`).
* **Verificación:** Los datos limpios del generador cumplen al 100% las tres restricciones, validando que el modelo sintético y los datos del artículo respetan las reglas físicas y presupuestales de las obras públicas.

---

## 4. Bibliografía

* Huavlen, G. et al. (2026). Federally funded public works in Mexico: A measured lakehouse layer. *International Journal of Combinatorial Optimization Problems and Informatics (IJCOPI)*, 17(1), 45–62.
* Secretaría de Hacienda y Crédito Público [SHCP]. (2024). *Transparencia Presupuestaria: Datos Abiertos de Obras y Proyectos de Inversión*. Gobierno de México. https://www.transparenciapresupuestaria.gob.mx/
* Inmon, W. H. (2005). *Building the Data Warehouse* (4th ed.). John Wiley & Sons. ISBN: 978-0764599446.
