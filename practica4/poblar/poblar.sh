#!/usr/bin/env bash
# ============================================================================
# Script de Automatización de Carga - Almacén "El Pistón"
# Cumple con Práctica 4 - Ejercicio 1.4 y Ejercicio 1.6
# ============================================================================

set -euo pipefail

# 1. Variables de entorno (Sin credenciales quemadas en el código)
export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGDATABASE="${PGDATABASE:-postgres}"
export PGUSER="${PGUSER:-usr_app}"
export PGPASSWORD="${PGPASSWORD:-AppPiston2026!}"

echo "======================================================================"
echo "Iniciando carga de datos en: ${PGDATABASE}@${PGHOST}:${PGPORT}"
echo "Usuario de conexión (Rol de Aplicación): ${PGUSER}"
echo "Hora de inicio: $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Verificar existencia de psql
if ! command -v psql &> /dev/null; then
    echo "ERROR: La herramienta de cliente 'psql' no está instalada o no está en el PATH." >&2
    exit 1
fi

TIEMPO_INICIO=$(date +%s%N)

# Ejecución atómica y transaccional
if psql -v ON_ERROR_STOP=1 \
        -h "$PGHOST" \
        -p "$PGPORT" \
        -U "$PGUSER" \
        -d "$PGDATABASE" \
        -f "${SCRIPT_DIR}/poblar.sql"; then
    TIEMPO_FIN=$(date +%s%N)
    DURACION_MS=$(( (TIEMPO_FIN - TIEMPO_INICIO) / 1000000 ))
    echo "----------------------------------------------------------------------"
    echo "Carga masiva completada exitosamente."
    echo "Tiempo total de ejecución de COPY masivo: ${DURACION_MS} ms"
    echo "======================================================================"
    exit 0
else
    echo "ERROR CRÍTICO: La carga falló. Se realizó ROLLBACK automático completo." >&2
    exit 1
fi
