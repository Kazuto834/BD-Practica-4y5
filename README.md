# Prácticas 4 y 5: "Implementación de una base de datos relacional y asignación de permisos empleando DDL", "Restricciones de dominio", "Edición de valores de una base de datos relacional empleando DML" e "Integridad referencial"

## Datos del Equipo
* **Carrera:** Ingeniería en Sistemas Computacionales
* **Plan de Estudios:** 2020
* **Unidad de Aprendizaje:** Bases de Datos
* **Grupo:** 3CV2
* **Integrantes:**
  * Garcia Castillo Mario — Boleta: 2025630545
  * Gonzáles Martínez Danaet Montserrath — Boleta: 2025630554
  * Islas Ramirez Diego — Boleta: 2025630905

---

## Proyectos de Trabajo
* **Proyecto Propio:** Sistema de Gestión de Almacén y Centro de Distribución Automotriz **"El Pistón"** (Motor: PostgreSQL 16).
* **Proyecto Asignado:** **Obra pública municipal** (*Federally Funded Public Works in Mexico: A Measured Lakehouse Layer*).
  * Repositorio / Fork local: [`Fork-PublicMunicipalWorks_IJCOPI`](../Fork-PublicMunicipalWorks_IJCOPI)
  * Publicación científica base: Huavlen et al. (ICOKG 2026 / IJCOPI Special Issue).

---

## Índice General de Entregables

### Parte 1. Práctica 4: DDL, Restricciones de Dominio, Carga Masiva y Seguridad
* **Ejercicio 1.1: Tipos de dato y dominios**
  * Documento analítico: [dominios.md](practica4/dominios.md)
  * Script de migración DDL: [001-dominios.sql](practica4/migraciones/001-dominios.sql)
* **Ejercicio 1.2: Restricciones de columna (NOT NULL, DEFAULT, UNIQUE, CHECK)**
  * Documentado en: [dominios.md](practica4/dominios.md)
  * Implementación DDL con reglas de negocio por línea: [001-dominios.sql](practica4/migraciones/001-dominios.sql)
* **Ejercicio 1.3: La fuente de datos del proyecto propio**
  * Documento de procedencia, citas APA 7.ª ed. y saneamiento: [fuente.md](practica4/fuente.md)
  * Conjuntos de datos limpios (> 200 filas por tabla principal): [Carpeta de datos CSV](practica4/datos/)
* **Ejercicio 1.4: El script de carga masiva automatizada**
  * Instrucciones y verificación de requisitos: [poblar/README.md](practica4/poblar/README.md)
  * Script de automatización Bash (Linux/macOS): [poblar.sh](practica4/poblar/poblar.sh)
  * Script de automatización PowerShell (Windows): [poblar.ps1](practica4/poblar/poblar.ps1)
  * Script SQL atómico e idempotente (COPY masivo): [poblar.sql](practica4/poblar/poblar.sql)
  * Programa de benchmark de rendimiento Python: [poblar.py](practica4/poblar/poblar.py)
* **Ejercicio 1.5: Pruebas de restricciones de dominio**
  * Documento con los 10 casos de violación intencional y salidas: [pruebas-dominio.md](practica4/pruebas-dominio.md)
  * Log de salida de terminal: [evidencias/pruebas-dominio-output.txt](evidencias/pruebas-dominio-output.txt)
* **Ejercicio 1.6: Usuarios y permisos (RBAC y mínimo privilegio)**
  * Documentación de roles, permisos, pruebas y matriz: [permisos.md](practica4/permisos.md)
  * Log de pruebas y retiro con REVOKE: [evidencias/pruebas-permisos-output.txt](evidencias/pruebas-permisos-output.txt)
* **Ejercicio 1.7: El proyecto asignado: datos y dominios**
  * Análisis comparativo contra el artículo y 3 nuevas restricciones: [carga-asignado.md](practica4/proyecto-asignado/carga-asignado.md)
  * Script de verificación y carga: [scripts-carga-asignado.sql](practica4/proyecto-asignado/scripts-carga-asignado.sql)
  * Script de pruebas de restricciones propuestas: [pruebas-dominio-asignado.sql](practica4/proyecto-asignado/pruebas-dominio-asignado.sql)

---

### Parte 2. Práctica 5: Claves Foráneas, Acciones Referenciales, Transacciones y DML
* **Ejercicio 2.1: Las claves foráneas del proyecto propio**
  * Matriz exhaustiva de claves foráneas y cardinalidad: [referencias.md](practica5/referencias.md)
* **Ejercicio 2.2: Acciones referenciales (CASCADE, RESTRICT, SET NULL)**
  * Justificación por regla de dominio: [referencias.md](practica5/referencias.md)
  * Script de migración DDL: [002-referencias.sql](practica5/migraciones/002-referencias.sql)
* **Ejercicio 2.3: Pruebas de integridad referencial**
  * Pruebas de acciones, error de FK inexistente, orden de carga y consultas vacías: [pruebas-referenciales.md](practica5/pruebas-referenciales.md)
  * Log de comprobaciones sin huérfanos: [evidencias/pruebas-referenciales-output.txt](evidencias/pruebas-referenciales-output.txt)
* **Ejercicio 2.4: Edición de valores y transacciones (Situaciones reales)**
  * Documento técnico de casos (UPSERT, UPDATE con CASE, Borrado lógico, SAVEPOINT): [edicion-de-valores.md](practica5/edicion-de-valores.md)
  * Script SQL ejecutable: [transacciones-y-dml.sql](practica5/sql/transacciones-y-dml.sql)
  * Log de salidas y verificación de atomicidad: [evidencias/pruebas-edicion-transacciones.txt](evidencias/pruebas-edicion-transacciones.txt)
* **Ejercicio 2.5: Integridad referencial en el almacén asignado**
  * Hechos, dimensiones, granularidad y omisión estratégica de FKs en DWH/Lakehouse: [integridad-almacen.md](practica5/integridad-almacen.md)
* **Ejercicio 2.6: Trabajo individual por integrante**
  * Mario Garcia Castillo (Relación `PRODUCTO` <-> `DETALLE_ORDEN`): [mario-garcia.md](practica5/integrantes/mario-garcia.md)
  * Danaet Montserrath Gonzáles Martínez (Relación `UBICACION` <-> `INVENTARIO_FISICO`): [danaet-gonzales.md](practica5/integrantes/danaet-gonzales.md)
  * Diego Islas Ramirez (Relación `EMPLEADO` <-> `ORDEN_SALIDA`): [diego-islas.md](practica5/integrantes/diego-islas.md)

---

## Interfaz Web de Demostración Operativa
Se integró la aplicación web de gestión del almacén en [`app-almacen/`](app-almacen/), permitiendo consultar de forma visual e interactiva los 250 productos, ubicaciones, órdenes de salida y métricas operativas del Centro de Distribución "El Pistón".
Para abrir la interfaz:
* Abra con su navegador web el archivo [`app-almacen/index.html`](app-almacen/index.html).
