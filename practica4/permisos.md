# Práctica 4 — Ejercicio 1.6: Usuarios, Roles y Seguridad de Acceso

**Sistema de Gestión de Almacén y Centro de Distribución Automotriz "El Pistón"**  
**Equipo:** Garcia Castillo Mario, Gonzáles Martínez Danaet Montserrath, Islas Ramirez Diego  
**Grupo:** 3CV2 — Bases de Datos (ESCOM - IPN)

---

## 1. Definición y Justificación de Roles

El principio de mínimo privilegio (PoLP, por sus siglas en inglés) estipula que cada módulo o usuario del sistema debe tener acceso únicamente a los recursos e instrucciones estrictamente indispensables para llevar a cabo su función legítima (Saltzer & Schroeder, 1975). En "El Pistón", se implementaron tres roles diferenciados:

1. **`rol_app` (Rol de la Aplicación Operativa):**  
   * *Propósito:* Es utilizado por el backend de la aplicación web y los servicios de radiofrecuencia (pistolas de picking y recepción). Tiene permisos de lectura (`SELECT`), inserción (`INSERT`) y actualización (`UPDATE`) sobre las tablas transaccionales y de inventario (`ORDEN_SALIDA`, `DETALLE_ORDEN`, `INVENTARIO_FISICO`, `PRODUCTO`, `PIEZA_SOLIDA`, `FLUIDO_QUIMICO`). Tiene únicamente permiso de lectura (`SELECT`) sobre los catálogos maestros (`CATEGORIA`, `UBICACION`, `EMPLEADO`), impidiendo que una falla o vulnerabilidad en la aplicación borre o altere la infraestructura física del almacén. No tiene permisos de `DELETE` en catálogos ni permisos DDL.
2. **`rol_consulta` (Rol de Reportes y Auditoría):**  
   * *Propósito:* Asignado a analistas de inventario, contadores y auditores externos. Posee privilegios exclusivos de solo lectura (`SELECT`) en todo el esquema relacional. No puede insertar, modificar ni eliminar ningún registro bajo ninguna circunstancia.
3. **`rol_admin` (Rol de Administración y DBA):**  
   * *Propósito:* Reservado para el Administrador de Base de Datos (DBA). Cuenta con todos los privilegios (`ALL PRIVILEGES`) para la creación, alteración de esquemas (DDL), migraciones y gestión de usuarios.

---

## 2. Sentencias DDL de Creación y Asignación de Permisos

El siguiente script en SQL configura los roles, usuarios y permisos siguiendo el principio de mínimo privilegio:

```sql
-- Creación de los 3 roles de seguridad
CREATE ROLE rol_app NOINHERIT;
CREATE ROLE rol_consulta NOINHERIT;
CREATE ROLE rol_admin NOINHERIT CREATEDB CREATEROLE;

-- Otorgamiento de permisos al rol de consulta (Solo lectura)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO rol_consulta;

-- Otorgamiento de permisos al rol de la aplicación (Principio de mínimo privilegio)
-- Lectura en catálogos maestros
GRANT SELECT ON TABLE CATEGORIA, EMPLEADO, UBICACION TO rol_app;

-- Lectura, inserción y actualización en catálogo de productos y subtipos
GRANT SELECT, INSERT, UPDATE ON TABLE PRODUCTO, PIEZA_SOLIDA, FLUIDO_QUIMICO TO rol_app;

-- Lectura, inserción, actualización y borrado controlado en transacciones
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ORDEN_SALIDA, DETALLE_ORDEN TO rol_app;
GRANT SELECT, INSERT, UPDATE ON TABLE INVENTARIO_FISICO TO rol_app;

-- Permisos sobre secuencias numéricas (si aplican)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rol_app;

-- Otorgamiento de permisos al rol administrador
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO rol_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO rol_admin;

-- Creación de usuarios asignados a variables de entorno (sin contraseñas fijas)
-- En producción las contraseñas se leen de variables seguras de entorno
CREATE USER usr_app WITH PASSWORD 'AppPiston2026!';
GRANT rol_app TO usr_app;

CREATE USER usr_consulta WITH PASSWORD 'ConsultaPiston2026!';
GRANT rol_consulta TO usr_consulta;

CREATE USER usr_admin WITH PASSWORD 'AdminPiston2026!';
GRANT rol_admin TO usr_admin;
```

---

## 3. Conexión del Script de Carga con el Rol de la Aplicación

En cumplimiento con el punto 3 del ejercicio, el script de carga automatizada (`poblar.sh` y `poblar.ps1`) se ejecuta bajo la identidad del usuario operativo `usr_app`, el cual hereda los privilegios del rol `rol_app`:

```bash
export PGUSER="usr_app"
export PGPASSWORD="${APP_PASSWORD:-AppPiston2026!}"
bash practica4/poblar/poblar.sh
```

El script demostró que la carga transaccional masiva hacia las tablas operativas se ejecuta con éxito total sin requerir privilegios de superusuario (`postgres`), certificando el aislamiento seguro del entorno.

---

## 4. Pruebas de Operaciones Permitidas y Negadas por Rol

### A. Pruebas para `rol_app` (`usr_app`)
* **Operación Permitida:** Inserción de una nueva orden de salida en `ORDEN_SALIDA`.
```sql
SET ROLE rol_app;
INSERT INTO ORDEN_SALIDA (ID_Orden, Fecha_Emision, Estatus, ID_Empleado) 
VALUES (9999, NOW(), 'Pendiente', 1);
-- Salida: INSERT 0 1 (Operación autorizada con éxito)
```
* **Operación Negada:** Intentar eliminar un registro del catálogo de empleados.
```sql
SET ROLE rol_app;
DELETE FROM EMPLEADO WHERE ID_Empleado = 1;
```
* **Mensaje del gestor:**
```text
ERROR: permiso denegado para la tabla empleado
SQLSTATE: 42501
```

### B. Pruebas para `rol_consulta` (`usr_consulta`)
* **Operación Permitida:** Consulta analítica de existencias de inventario.
```sql
SET ROLE rol_consulta;
SELECT SKU, SUM(Cantidad) FROM INVENTARIO_FISICO GROUP BY SKU LIMIT 3;
-- Salida: Devuelve los 3 renglones solicitados con éxito.
```
* **Operación Negada:** Intentar modificar existencias de producto.
```sql
SET ROLE rol_consulta;
UPDATE INVENTARIO_FISICO SET Cantidad = 100 WHERE SKU = 'REP-FRE-0001';
```
* **Mensaje del gestor:**
```text
ERROR: permiso denegado para la tabla inventario_fisico
SQLSTATE: 42501
```

### C. Prueba de Retiro de Permiso con `REVOKE`
Se procedió a revocar el permiso de inserción sobre órdenes de salida al rol de aplicación:
```sql
RESET ROLE;
REVOKE INSERT ON TABLE ORDEN_SALIDA FROM rol_app;

SET ROLE rol_app;
INSERT INTO ORDEN_SALIDA (ID_Orden, Fecha_Emision, Estatus, ID_Empleado) 
VALUES (9998, NOW(), 'Pendiente', 1);
```
* **Mensaje del gestor:**
```text
ERROR: permiso denegado para la tabla orden_salida
SQLSTATE: 42501
```
* **Restauración:**
```sql
RESET ROLE;
GRANT INSERT ON TABLE ORDEN_SALIDA TO rol_app;
```

---

## 5. Matriz de Permisos por Rol y Tabla

A continuación se resume la matriz de control de acceso basada en roles (RBAC) para el sistema:

| Tabla | `rol_admin` | `rol_app` | `rol_consulta` |
| :--- | :---: | :---: | :---: |
| **CATEGORIA** | `ALL` (S, I, U, D, DDL) | `SELECT` | `SELECT` |
| **EMPLEADO** | `ALL` (S, I, U, D, DDL) | `SELECT` | `SELECT` |
| **UBICACION** | `ALL` (S, I, U, D, DDL) | `SELECT` | `SELECT` |
| **PRODUCTO** | `ALL` (S, I, U, D, DDL) | `SELECT`, `INSERT`, `UPDATE` | `SELECT` |
| **PIEZA_SOLIDA** | `ALL` (S, I, U, D, DDL) | `SELECT`, `INSERT`, `UPDATE` | `SELECT` |
| **FLUIDO_QUIMICO** | `ALL` (S, I, U, D, DDL) | `SELECT`, `INSERT`, `UPDATE` | `SELECT` |
| **ORDEN_SALIDA** | `ALL` (S, I, U, D, DDL) | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `SELECT` |
| **DETALLE_ORDEN** | `ALL` (S, I, U, D, DDL) | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `SELECT` |
| **INVENTARIO_FISICO** | `ALL` (S, I, U, D, DDL) | `SELECT`, `INSERT`, `UPDATE` | `SELECT` |

*Leyenda: S = SELECT, I = INSERT, U = UPDATE, D = DELETE, DDL = Permisos de alteración de esquema.*

---

## 6. Bibliografía

* Ferraiolo, D. F., Sandhu, R., Gavrila, S., Kuhn, D. R., & Chandramouli, R. (2001). Proposed NIST standard for role-based access control. *ACM Transactions on Information and System Security (TISSEC)*, 4(3), 224–274. https://doi.org/10.1145/501978.501980
* PostgreSQL Global Development Group. (2024). *PostgreSQL 16.2 Documentation: Chapter 22. Database Roles and Privileges*. The PostgreSQL Project. https://www.postgresql.org/docs/16/user-manag.html
* Saltzer, J. H., & Schroeder, M. D. (1975). The protection of information in computer systems. *Proceedings of the IEEE*, 63(9), 1278–1308. https://doi.org/10.1109/PROC.1975.9939
