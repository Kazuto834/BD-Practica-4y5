-- ============================================================================
-- Script de Carga Masiva y Verificación para el Proyecto Asignado
-- Obra Pública Municipal (Fork-PublicMunicipalWorks_IJCOPI)
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- 1. Poblado de dimensión tiempo mediante función generadora
SELECT warehouse.generar_dim_tiempo('2024-01-01'::DATE, '2026-12-31'::DATE);

-- 2. Verificación de conteo en dimensiones maestras
SELECT 'dim_tipo_evento' AS dimension, count(*) AS registros FROM warehouse.dim_tipo_evento
UNION ALL
SELECT 'dim_tiempo', count(*) FROM warehouse.dim_tiempo;

-- 3. Inserción de ejemplo de auditoría transaccional
INSERT INTO warehouse.dim_region (region_id, comunidad, barrio, colonia)
VALUES ('REG-01', 'Temascaltepec Centro', 'Barrio San Juan', 'Centro')
ON CONFLICT DO NOTHING;

INSERT INTO warehouse.dim_constructora (constructora_id, rfc, nombre_const, tipo_ejecutor)
VALUES ('CONST-01', 'COB120304AB1', 'Constructora Mexiquense S.A. de C.V.', 'Privado')
ON CONFLICT DO NOTHING;

COMMIT;
