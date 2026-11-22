-- ============================================================================
-- Migración 002: Integridad Referencial y Acciones en Cascada
-- Proyecto Propio: Almacén y Centro de Distribución "El Pistón"
-- Aplica las llaves foráneas con sus acciones referenciales justificadas.
-- ============================================================================

BEGIN;

-- 1. fk_producto_categoria: RESTRICT en borrado para proteger categorías con piezas
ALTER TABLE PRODUCTO
    DROP CONSTRAINT IF EXISTS fk_producto_categoria,
    ADD CONSTRAINT fk_producto_categoria FOREIGN KEY (ID_Categoria)
        REFERENCES CATEGORIA(ID_Categoria)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;

-- 2. fk_pieza_producto: CASCADE en borrado por ser subtipo dependiente
ALTER TABLE PIEZA_SOLIDA
    DROP CONSTRAINT IF EXISTS fk_pieza_producto,
    ADD CONSTRAINT fk_pieza_producto FOREIGN KEY (SKU)
        REFERENCES PRODUCTO(SKU)
        ON DELETE CASCADE
        ON UPDATE CASCADE;

-- 3. fk_fluido_producto: CASCADE en borrado por ser subtipo dependiente
ALTER TABLE FLUIDO_QUIMICO
    DROP CONSTRAINT IF EXISTS fk_fluido_producto,
    ADD CONSTRAINT fk_fluido_producto FOREIGN KEY (SKU)
        REFERENCES PRODUCTO(SKU)
        ON DELETE CASCADE
        ON UPDATE CASCADE;

-- 4. fk_orden_empleado: RESTRICT en borrado para preservar trazabilidad de despachos
ALTER TABLE ORDEN_SALIDA
    DROP CONSTRAINT IF EXISTS fk_orden_empleado,
    ADD CONSTRAINT fk_orden_empleado FOREIGN KEY (ID_Empleado)
        REFERENCES EMPLEADO(ID_Empleado)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;

-- 5. fk_detalle_orden: CASCADE en borrado de cabecera de orden
ALTER TABLE DETALLE_ORDEN
    DROP CONSTRAINT IF EXISTS fk_detalle_orden,
    ADD CONSTRAINT fk_detalle_orden FOREIGN KEY (ID_Orden)
        REFERENCES ORDEN_SALIDA(ID_Orden)
        ON DELETE CASCADE
        ON UPDATE CASCADE;

-- 6. fk_detalle_producto: RESTRICT en borrado de producto referenciado en pedidos
ALTER TABLE DETALLE_ORDEN
    DROP CONSTRAINT IF EXISTS fk_detalle_producto,
    ADD CONSTRAINT fk_detalle_producto FOREIGN KEY (SKU)
        REFERENCES PRODUCTO(SKU)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;

-- 7. fk_inventario_producto: RESTRICT en borrado si hay stock físico vigente
ALTER TABLE INVENTARIO_FISICO
    DROP CONSTRAINT IF EXISTS fk_inventario_producto,
    ADD CONSTRAINT fk_inventario_producto FOREIGN KEY (SKU)
        REFERENCES PRODUCTO(SKU)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;

-- 8. fk_inventario_ubicacion: RESTRICT en borrado de bahía ocupada
ALTER TABLE INVENTARIO_FISICO
    DROP CONSTRAINT IF EXISTS fk_inventario_ubicacion,
    ADD CONSTRAINT fk_inventario_ubicacion FOREIGN KEY (ID_Ubicacion)
        REFERENCES UBICACION(ID_Ubicacion)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;

COMMIT;
