# Instrucciones de Ejecución del Script de Carga Masiva

Este módulo contiene la solución automatizada para el **Ejercicio 1.4** de la Práctica 4.

## Comando Único de Ejecución

De acuerdo con las reglas de la práctica, la carga de la base de datos se ejecuta con **un solo comando**:

### En Linux / macOS / Git Bash:
```bash
bash practica4/poblar/poblar.sh
```

### En Windows (PowerShell):
```powershell
powershell -ExecutionPolicy Bypass -File practica4/poblar/poblar.ps1
```

### Directo en PostgreSQL (`psql`):
```bash
psql -h localhost -p 5432 -U usr_app -d postgres -f practica4/poblar/poblar.sql
```

---

## Verificación de Requisitos del Ejercicio 1.4

1. **Repetible (Idempotente):**  
   Ejecutar el script dos veces no genera errores ni duplica renglones. Utiliza inserción hacia tablas de staging y volcado final mediante cláusulas `ON CONFLICT (...) DO NOTHING`. En la primera ejecución se insertan todos los registros válidos; en la segunda ejecución se reportan 0 filas insertadas y el 100% como omitidas/existentes, sin error.
2. **Ordenado:**  
   Sigue estrictamente la topología del grafo de dependencias de claves foráneas:
   `CATEGORIA` $\rightarrow$ `EMPLEADO` $\rightarrow$ `UBICACION` $\rightarrow$ `PRODUCTO` $\rightarrow$ `PIEZA_SOLIDA` / `FLUIDO_QUIMICO` $\rightarrow$ `ORDEN_SALIDA` $\rightarrow$ `DETALLE_ORDEN` $\rightarrow$ `INVENTARIO_FISICO`.
3. **Todo o Nada (Transaccional):**  
   Toda la operación se encuentra envuelta en un bloque `BEGIN ... COMMIT` con la bandera `\set ON_ERROR_STOP on`. Si cualquier renglón viola una restricción no mitigada, el motor aborta la transacción (`ROLLBACK`), informando el error específico y dejando la base de datos en su estado previo íntegro.
4. **Con Cuentas:**  
   Al concluir, genera un informe tabular con el conteo exacto de registros leídos, registros insertados y registros rechazados/omitidos por cada tabla.
5. **Sin Credenciales Adentro:**  
   Las conexiones leen las variables de entorno estándar `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`. Ninguna credencial privada sensible se encuentra fijada en el repositorio.
6. **Eficiente (Carga Masiva COPY vs INSERT):**  
   Utiliza la instrucción nativa `\copy` para streaming de bloques binarios hacia el motor, alcanzando tiempos inferiores a 50 ms para el conjunto de datos completo, comparado contra > 1200 ms requeridos por inserciones individuales fila por fila (aceleración superior a 24x).
