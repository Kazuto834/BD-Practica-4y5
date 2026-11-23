-- 03-triggers.sql
-- Restricciones de Integridad Activa y Máquina de Estados en PostgreSQL

-- ============================================================================
-- 1. Validación de Capacidad de Peso en Racks y Celdas Físicas
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_validar_capacidad_ubicacion()
RETURNS TRIGGER AS $func$
DECLARE
    v_capacidad NUMERIC(10, 2);
    v_peso_unitario NUMERIC(8, 2);
    v_peso_actual NUMERIC(10, 2);
    v_peso_nuevo NUMERIC(10, 2);
    v_peso_total NUMERIC(10, 2);
    v_ubicacion_desc TEXT;
BEGIN
    IF NEW.cantidad IS NULL OR NEW.cantidad <= 0 THEN
        RAISE EXCEPTION 'La cantidad en inventario físico debe ser mayor a 0.';
    END IF;

    SELECT u.capacidad_peso_kg, u.zona || '-' || u.pasillo || '-' || u.rack || '-' || u.nivel
    INTO v_capacidad, v_ubicacion_desc
    FROM UBICACION u
    WHERE u.id_ubicacion = NEW.id_ubicacion;

    IF v_capacidad IS NULL THEN
        RAISE EXCEPTION 'La ubicación % no existe.', NEW.id_ubicacion;
    END IF;

    SELECT peso_kg INTO v_peso_unitario
    FROM PRODUCTO
    WHERE sku = NEW.sku;

    IF v_peso_unitario IS NULL THEN
        RAISE EXCEPTION 'El producto con SKU % no existe.', NEW.sku;
    END IF;

    SELECT COALESCE(SUM(p.peso_kg * i.cantidad), 0)
    INTO v_peso_actual
    FROM INVENTARIO_FISICO i
    JOIN PRODUCTO p ON i.sku = p.sku
    WHERE i.id_ubicacion = NEW.id_ubicacion
      AND NOT (i.sku = NEW.sku AND i.id_inventario = NEW.id_inventario);

    v_peso_nuevo := v_peso_unitario * NEW.cantidad;
    v_peso_total := v_peso_actual + v_peso_nuevo;

    IF v_peso_total > v_capacidad THEN
        RAISE EXCEPTION 'Sin espacio en la ubicación %: el peso total (% kg) excede la capacidad máxima del rack (% kg). Capacidad disponible: % kg.',
            v_ubicacion_desc, ROUND(v_peso_total, 2), ROUND(v_capacidad, 2), ROUND(GREATEST(0.00, v_capacidad - v_peso_actual), 2);
    END IF;

    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_capacidad_ubicacion ON INVENTARIO_FISICO;
CREATE TRIGGER trg_validar_capacidad_ubicacion
BEFORE INSERT OR UPDATE ON INVENTARIO_FISICO
FOR EACH ROW
EXECUTE FUNCTION fn_validar_capacidad_ubicacion();


-- ============================================================================
-- 2. Validación de Cantidades en Detalle de Órdenes
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_validar_detalle_orden()
RETURNS TRIGGER AS $func$
BEGIN
    IF NEW.cantidad_pedida IS NULL OR NEW.cantidad_pedida <= 0 THEN
        RAISE EXCEPTION 'La cantidad pedida en la orden #% debe ser mayor a 0.', NEW.id_orden;
    END IF;
    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_detalle_orden ON DETALLE_ORDEN;
CREATE TRIGGER trg_validar_detalle_orden
BEFORE INSERT OR UPDATE ON DETALLE_ORDEN
FOR EACH ROW
EXECUTE FUNCTION fn_validar_detalle_orden();


-- ============================================================================
-- 3. Máquina de Estados para Órdenes de Salida
--    Flujo permitido:
--      Pendiente  -> En Proceso | Cancelada
--      En Proceso -> Completada | Cancelada
--      Completada -> (Estado final inmutable)
--      Cancelada  -> (Estado final inmutable)
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_validar_transicion_orden_salida()
RETURNS TRIGGER AS $func$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.estatus IS NULL OR TRIM(NEW.estatus) = '' THEN
            NEW.estatus := 'Pendiente';
        END IF;

        IF NEW.estatus NOT IN ('Pendiente', 'En Proceso', 'Completada', 'Cancelada') THEN
            RAISE EXCEPTION 'Estatus inicial no válido para la orden: %.', NEW.estatus;
        END IF;

        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.id_empleado IS DISTINCT FROM OLD.id_empleado THEN
            RAISE EXCEPTION 'No está permitido reasignar el empleado propietario de la orden #%.', OLD.id_orden;
        END IF;

        IF NEW.estatus IS NOT DISTINCT FROM OLD.estatus THEN
            RETURN NEW;
        END IF;

        IF OLD.estatus = 'Completada' THEN
            RAISE EXCEPTION 'La orden #% ya está Completada y no puede modificar su estatus.', OLD.id_orden;
        END IF;

        IF OLD.estatus = 'Cancelada' THEN
            RAISE EXCEPTION 'La orden #% está Cancelada y no puede reactivarse ni modificar su estatus.', OLD.id_orden;
        END IF;

        IF OLD.estatus = 'Pendiente' AND NEW.estatus NOT IN ('En Proceso', 'Cancelada') THEN
            RAISE EXCEPTION 'Transición inválida en orden #%: desde Pendiente solo puede pasar a En Proceso o Cancelada.', OLD.id_orden;
        END IF;

        IF OLD.estatus = 'En Proceso' AND NEW.estatus NOT IN ('Completada', 'Cancelada') THEN
            RAISE EXCEPTION 'Transición inválida en orden #%: desde En Proceso solo puede pasar a Completada o Cancelada.', OLD.id_orden;
        END IF;
    END IF;

    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_transicion_orden_salida ON ORDEN_SALIDA;
CREATE TRIGGER trg_validar_transicion_orden_salida
BEFORE INSERT OR UPDATE ON ORDEN_SALIDA
FOR EACH ROW
EXECUTE FUNCTION fn_validar_transicion_orden_salida();