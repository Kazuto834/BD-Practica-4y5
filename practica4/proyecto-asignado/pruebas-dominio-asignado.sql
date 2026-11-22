-- ============================================================================
-- Pruebas de Nuevas Restricciones de Dominio Propuestas en Proyecto Asignado
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- 1. Aplicación de las 3 restricciones de dominio propuestas
ALTER TABLE public.obra 
    ADD CONSTRAINT chk_obra_fechas_coherentes CHECK (fecha_final >= fecha_inicio);

ALTER TABLE public.informes 
    ADD CONSTRAINT chk_informes_avance_porcentaje CHECK (porcentaje_avance BETWEEN 0 AND 100);

ALTER TABLE public.presupuesto_obra 
    ADD CONSTRAINT chk_presupuesto_monto_positivo CHECK (presupuesto_total > 0.00);

-- 2. Prueba de violación intencional 1: Obra con fecha final anterior al inicio
DO $$
BEGIN
    INSERT INTO public.obra (
        id_obra, codigo_expediente, nombre_obra, fecha_inicio, fecha_final, descripcion, beneficiarios
    ) VALUES (
        'OBRA-ERR-01', 'EXP-999', 'Pavimentación Invalida', '2026-05-01', '2026-01-01', 'Falla de fechas', '500 hab'
    );
    RAISE EXCEPTION 'FALLÓ LA PRUEBA: El motor debió rechazar la fecha errónea.';
EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ÉXITO: Se capturó correctamente la violación de fechas coherentes (SQLSTATE 23514).';
END $$;

-- 3. Prueba de violación intencional 2: Avance físico fuera de rango (150%)
DO $$
BEGIN
    INSERT INTO public.informes (
        id_informe, mes, fecha_inicio, fecha_final, porcentaje_avance, id_obra, id_constructora, codigo_personal
    ) VALUES (
        9999, 'Mayo', '2026-05-01', '2026-05-31', 150, 'OBRA-01', 'CONST-01', 'PER-01'
    );
    RAISE EXCEPTION 'FALLÓ LA PRUEBA: El motor debió rechazar el porcentaje > 100.';
EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ÉXITO: Se capturó correctamente el avance físico excesivo (SQLSTATE 23514).';
END $$;

ROLLBACK;
