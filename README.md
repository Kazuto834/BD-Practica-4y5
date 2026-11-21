# Prácticas 4 y 5: "Implementación de una base de datos relacional y asignación de permisos empleando DDL", "Restricciones de dominio", "Edición de valores de una base de datos relacional empleando DML" e "Integridad referencial"

## Datos del Equipo
* **Carrera:** Ingeniería en Sistemas Computacionales
* **Plan de Estudios:** 2020
* **Unidad de Aprendizaje:** Bases de Datos
* **Grupo:** 3CV2
* **Integrantes:**
  * Garcia Castillo Mario — Boleta: 2025630545
  * González Martínez Danaet Montserrath — Boleta: 2025630554
  * Islas Ramirez Diego — Boleta: 2025630905

---

## Proyectos de Trabajo
* **Proyecto Propio:** Sistema de Gestión de Almacén y Centro de Distribución Automotriz **"El Pistón"** (Motor: PostgreSQL 16).
* **Proyecto Asignado:** **Obra pública municipal** (*Federally Funded Public Works in Mexico: A Measured Lakehouse Layer*).
  * Repositorio / Fork local: [`Fork-PublicMunicipalWorks_IJCOPI`](../Fork-PublicMunicipalWorks_IJCOPI)

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
  * Danaet Montserrath González Martínez (Relación `UBICACION` <-> `INVENTARIO_FISICO`): [danaet-gonzalez.md](practica5/integrantes/danaet-gonzalez.md)
  * Diego Islas Ramirez (Relación `EMPLEADO` <-> `ORDEN_SALIDA`): [diego-islas.md](practica5/integrantes/diego-islas.md)

---

## Interfaz Web de Demostración Operativa y Entorno Contenerizado

El sistema web de gestión logística del Centro de Distribución **"El Pistón"** opera bajo una arquitectura dual que se conecta en tiempo real a **PostgreSQL 16** en entornos locales con Docker Desktop y cambia automáticamente a modo estático al desplegarse en GitHub Pages.

### Archivos de la Aplicación y del Entorno
* **Aplicación Web ([`app-almacen/`](app-almacen/)):**
  * Vista principal: [`app-almacen/index.html`](app-almacen/index.html)
  * Hoja de estilos: [`app-almacen/css/styles.css`](app-almacen/css/styles.css)
  * Lógica de interfaz y formularios: [`app-almacen/js/app.js`](app-almacen/js/app.js)
  * Cliente de conexión dual (PostgreSQL vs. Modo Estático): [`app-almacen/js/db-client.js`](app-almacen/js/db-client.js)
  * Respaldo de datos estáticos (GitHub Pages): [`app-almacen/js/mock-data.js`](app-almacen/js/mock-data.js)
* **Entorno Docker y Backend ([`entorno/`](entorno/)):**
  * Orquestación de contenedores: [`entorno/compose.yaml`](entorno/compose.yaml)
  * API REST en FastAPI: [`entorno/api/main.py`](entorno/api/main.py) ([`Dockerfile`](entorno/api/Dockerfile) | [`requirements.txt`](entorno/api/requirements.txt))
  * Esquema DDL de inicialización automática: [`entorno/db/init/01-esquema.sql`](entorno/db/init/01-esquema.sql)
  * Datos semilla iniciales: [`entorno/db/init/02-datos-semilla.sql`](entorno/db/init/02-datos-semilla.sql)
  * Pruebas manuales de restricciones: [`entorno/db/pruebas/prueba-de-restricciones.sql`](entorno/db/pruebas/prueba-de-restricciones.sql)

### Ejecución Local Conectada a PostgreSQL (Docker Desktop)

1. **Construir y levantar los contenedores:**
   Abra Docker Desktop y, desde una terminal ubicada en la raíz del repositorio, ingrese a [`entorno/`](entorno/) para construir e iniciar los servicios (`piston_postgres`, `piston_api` y `piston_web`):
   ```bash
   cd entorno
   docker compose up --build -d
   ```

2. **Acceder a la aplicación web y verificar el estado de conexión:**
   * **Interfaz Web (`app-almacen`):** `http://localhost:8080` — Verifique en la esquina superior derecha que aparezca el indicador **`🟢 Conectado a PostgreSQL (Docker Local)`**.
   * **Documentación interactiva de la API (Swagger):** `http://localhost:8000/docs`

3. **Conectarse a la base de datos desde pgAdmin 4 (Recomendado):**
   Para visualizar las tablas (`Schemas > public > Tables`), ejecutar consultas SQL y comprobar en tiempo real los registros insertados o modificados desde la web, registre un nuevo servidor en **pgAdmin 4** (`Object > Register > Server...`):
   * En la pestaña **General**, asigne un nombre identificador en **Name** (ej. `El-Piston`).
   * En la pestaña **Connection**, ingrese los siguientes parámetros:

   | Campo en pgAdmin 4 | Valor | Dónde verificarlo en el proyecto |
   | :--- | :--- | :--- |
   | **Host name/address** | `localhost` | Equipo local donde corre Docker Desktop |
   | **Port** | `5433` | [`entorno/compose.yaml`](entorno/compose.yaml) → `services.postgres.ports` (`"5433:5432"`) |
   | **Maintenance database** | `almacen_piston` | [`entorno/compose.yaml`](entorno/compose.yaml) → `POSTGRES_DB` |
   | **Username** | `admin` | [`entorno/compose.yaml`](entorno/compose.yaml) → `POSTGRES_USER` |
   | **Password** | `admin123` | [`entorno/compose.yaml`](entorno/compose.yaml) → `POSTGRES_PASSWORD` |

   * **Comprobación de cambios desde la web:** Abra **Query Tool** sobre la base de datos `almacen_piston` (o haga clic derecho sobre cualquier tabla > **View/Edit Data > All Rows**) y presione **`F5`** después de ejecutar cualquier acción en `http://localhost:8080` para refrescar los registros.

4. **Solución en caso de conflicto de puertos con PostgreSQL local:**
   Si en su equipo ya tiene instalado PostgreSQL de forma nativa ocupando el puerto configurado y pgAdmin muestra un error de autenticación (`FATAL: la autentificación password falló`), Windows está redirigiendo la conexión hacia su servidor local en lugar del contenedor Docker:
   1. Abra [`entorno/compose.yaml`](entorno/compose.yaml) y ubique la sección `ports` dentro del servicio `postgres`.
   2. Cambie únicamente el puerto externo (el número a la izquierda de los dos puntos) por otro disponible en su equipo, por ejemplo de `"5433:5432"` a `"5434:5432"` (conserve intacto el `5432` interno y la variable `DATABASE_URL` de la API).
   3. Aplique el cambio ejecutando `docker compose up -d` dentro de [`entorno/`](entorno/) e ingrese ese mismo puerto nuevo (`5434`) en **pgAdmin 4**.

### Ejecución en Modo Estático (GitHub Pages)

* **Aplicación desplegada en vivo (Modo Estático):** [https://kazuto834.github.io/BD-Practica-4y5/](https://kazuto834.github.io/BD-Practica-4y5/)
* **Comportamiento:** Esta versión corresponde a la aplicación web ejecutándose de forma 100 % estática en **GitHub Pages** (sin conexión activa a PostgreSQL ni peticiones a servidores externos). [`db-client.js`](app-almacen/js/db-client.js) carga automáticamente los datos iniciales desde [`mock-data.js`](app-almacen/js/mock-data.js) y conserva las altas, movimientos de inventario, órdenes y reportes PDF en la memoria temporal de la pestaña (`sessionStorage`) hasta que esta se cierre.