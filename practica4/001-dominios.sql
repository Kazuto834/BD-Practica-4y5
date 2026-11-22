-- ============================================================================
-- Migración 001: Restricciones de Dominio y Columnas
-- Proyecto Propio: Almacén y Centro de Distribución "El Pistón"
-- Ejecutar sobre el esquema base limpio de la Práctica 3
-- Cada restricción está justificada con una regla del dominio en una línea.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. CREACIÓN DE DOMINIOS REUTILIZABLES
-- ----------------------------------------------------------------------------

-- Regla: El turno laboral debe ser exclusivamente Matutino, Vespertino, Nocturno o Mixto según el contrato colectivo.
CREATE DOMAIN turno_laboral AS VARCHAR(20)
    CONSTRAINT chk_dom_turno CHECK (VALUE IN ('Matutino', 'Vespertino', 'Nocturno', 'Mixto'));

-- Regla: El estatus de la orden debe seguir estrictamente los estados del flujo logístico del almacén.
CREATE DOMAIN estatus_orden AS VARCHAR(30)
    CONSTRAINT chk_dom_estatus CHECK (VALUE IN ('Pendiente', 'En picking', 'Empacado', 'Despachado', 'Cancelado'));

-- Regla: El tipo de almacenaje debe responder a la infraestructura física estandarizada del centro de distribución.
CREATE DOMAIN tipo_almacenaje_dom AS VARCHAR(50)
    CONSTRAINT chk_dom_almacenaje CHECK (VALUE IN ('Paletizado', 'Caja ligera', 'Estanteria pesada', 'Material peligroso', 'Racks selectivos'));

-- Regla: La clasificación de riesgo de inflamabilidad debe apegarse a la escala de 0 a 4 de la norma NFPA 704.
CREATE DOMAIN nivel_inflamabilidad_nfpa AS INT
    CONSTRAINT chk_dom_inflamabilidad CHECK (VALUE BETWEEN 0 AND 4);


-- ----------------------------------------------------------------------------
-- 2. VALORES POR DEFECTO (DEFAULT)
-- ----------------------------------------------------------------------------

-- Regla: Toda nueva categoría creada se cataloga con la prioridad estándar intermedia (3).
ALTER TABLE CATEGORIA ALTER COLUMN Nivel_Prioridad SET DEFAULT 3;

-- Regla: Todo empleado nuevo ingresa sin certificación de montacargas hasta acreditar el curso de la STPS.
ALTER TABLE EMPLEADO ALTER COLUMN Certificacion_Montacargas SET DEFAULT FALSE;

-- Regla: La modalidad de almacenaje base es 'Paletizado' por compatibilidad con tarima estándar.
ALTER TABLE UBICACION ALTER COLUMN Tipo_Almacenaje SET DEFAULT 'Paletizado';

-- Regla: Las piezas sólidas por omisión se consideran no frágiles a menos que se especifique amortiguamiento especial.
ALTER TABLE PIEZA_SOLIDA ALTER COLUMN Fragil SET DEFAULT FALSE;

-- Regla: Los fluidos por defecto se almacenan a temperatura ambiente sin refrigeración.
ALTER TABLE FLUIDO_QUIMICO ALTER COLUMN Requiere_Refrigeracion SET DEFAULT FALSE;

-- Regla: La fecha de emisión de una orden se estampa automáticamente con la marca temporal actual del sistema.
ALTER TABLE ORDEN_SALIDA ALTER COLUMN Fecha_Emision SET DEFAULT CURRENT_TIMESTAMP;

-- Regla: El estado inicial natural de toda orden de salida al generarse es 'Pendiente' de preparación.
ALTER TABLE ORDEN_SALIDA ALTER COLUMN Estatus SET DEFAULT 'Pendiente';

-- Regla: La fecha de ingreso de inventario por omisión es la fecha de recepción del día de hoy.
ALTER TABLE INVENTARIO_FISICO ALTER COLUMN Fecha_Ingreso SET DEFAULT CURRENT_DATE;

-- Regla: Un lote registrado inicia con existencia cero hasta que concluye la verificación de conteo en bahía.
ALTER TABLE INVENTARIO_FISICO ALTER COLUMN Cantidad SET DEFAULT 0;


-- ----------------------------------------------------------------------------
-- 3. RESTRICCIONES DE UNICIDAD (UNIQUE SIMPLES Y COMPUESTAS)
-- ----------------------------------------------------------------------------

-- Regla: No pueden existir dos categorías con el mismo nombre para evitar duplicidad de familias en el catálogo.
ALTER TABLE CATEGORIA ADD CONSTRAINT uq_categoria_nombre UNIQUE (Nombre);

-- Regla: Una celda física de almacenaje (Zona, Pasillo, Rack, Nivel) es irrepetible en el espacio del almacén.
ALTER TABLE UBICACION ADD CONSTRAINT uq_ubicacion_posicion_espacial UNIQUE (Zona, Pasillo, Rack, Nivel);

-- Regla: En una orden de salida un producto solo puede aparecer en una única línea; la cantidad debe acumularse.
ALTER TABLE DETALLE_ORDEN ADD CONSTRAINT uq_detalle_orden_producto UNIQUE (ID_Orden, SKU);


-- ----------------------------------------------------------------------------
-- 4. RESTRICCIONES CHECK DE RANGO, FORMATO, LISTA Y LÓGICA DE NEGOCIO
-- ----------------------------------------------------------------------------

-- Regla: El nivel de prioridad de una categoría debe estar acotado entre 1 (urgente) y 5 (baja demanda).
ALTER TABLE CATEGORIA ADD CONSTRAINT chk_categoria_prioridad 
    CHECK (Nivel_Prioridad BETWEEN 1 AND 5);

-- Regla: El turno del empleado debe corresponder a un turno laboral oficial de la empresa.
ALTER TABLE EMPLEADO ADD CONSTRAINT chk_empleado_turno 
    CHECK (Turno IN ('Matutino', 'Vespertino', 'Nocturno', 'Mixto'));

-- Regla: La capacidad de carga en kilogramos de una ubicación debe ser estrictamente positiva para evitar colapsos.
ALTER TABLE UBICACION ADD CONSTRAINT chk_ubicacion_capacidad_positiva 
    CHECK (Capacidad_Peso_Kg > 0.00);

-- Regla: La modalidad de almacenaje de una ubicación debe cumplir los tipos físicos certificados.
ALTER TABLE UBICACION ADD CONSTRAINT chk_ubicacion_tipo_almacenaje 
    CHECK (Tipo_Almacenaje IN ('Paletizado', 'Caja ligera', 'Estanteria pesada', 'Material peligroso', 'Racks selectivos'));

-- Regla: El código SKU debe tener un formato alfanumérico en mayúsculas de al menos 3 caracteres sin espacios.
ALTER TABLE PRODUCTO ADD CONSTRAINT chk_producto_sku_formato 
    CHECK (SKU ~ '^[A-Z0-9_-]{3,50}$');

-- Regla: Las dimensiones físicas lineales de un producto (largo, ancho, alto) deben ser estrictamente positivas.
ALTER TABLE PRODUCTO ADD CONSTRAINT chk_producto_dimensiones_positivas 
    CHECK (Largo_cm > 0.00 AND Ancho_cm > 0.00 AND Alto_cm > 0.00);

-- Regla: El peso neto de un producto automotriz debe ser estrictamente mayor a cero gramos.
ALTER TABLE PRODUCTO ADD CONSTRAINT chk_producto_peso_positivo 
    CHECK (Peso_Kg > 0.00);

-- Regla: El material de fabricación de una pieza sólida no puede ser una cadena vacía ni contener solo espacios.
ALTER TABLE PIEZA_SOLIDA ADD CONSTRAINT chk_pieza_material_no_vacio 
    CHECK (length(trim(Material_Fabricacion)) > 0);

-- Regla: El volumen de un fluido químico o lubricante automotriz debe ser estrictamente positivo.
ALTER TABLE FLUIDO_QUIMICO ADD CONSTRAINT chk_fluido_volumen_positivo 
    CHECK (Volumen_Mililitros > 0.00);

-- Regla: El índice de inflamabilidad de un químico automotriz debe ceñirse a la escala estandarizada NFPA (0 a 4).
ALTER TABLE FLUIDO_QUIMICO ADD CONSTRAINT chk_fluido_inflamabilidad_rango 
    CHECK (Nivel_Inflamabilidad BETWEEN 0 AND 4);

-- Regla: El estado de una orden de salida debe pertenecer al ciclo de vida operacional autorizado.
ALTER TABLE ORDEN_SALIDA ADD CONSTRAINT chk_orden_estatus_valido 
    CHECK (Estatus IN ('Pendiente', 'En picking', 'Empacado', 'Despachado', 'Cancelado'));

-- Regla: El número secuencial de línea en una orden de salida debe ser entero positivo mayor o igual a 1.
ALTER TABLE DETALLE_ORDEN ADD CONSTRAINT chk_detalle_linea_positiva 
    CHECK (Numero_Linea >= 1);

-- Regla: La cantidad solicitada en una línea de pedido debe ser de al menos 1 unidad (no se permiten pedidos en cero o negativos).
ALTER TABLE DETALLE_ORDEN ADD CONSTRAINT chk_detalle_cantidad_positiva 
    CHECK (Cantidad_Pedida > 0);

-- Regla: La cantidad de piezas en existencia física en una ubicación nunca puede ser negativa en el almacén.
ALTER TABLE INVENTARIO_FISICO ADD CONSTRAINT chk_inventario_cantidad_no_negativa 
    CHECK (Cantidad >= 0);

-- Regla: La fecha de ingreso de un lote físico de inventario no puede ser una fecha posterior a la del día de hoy.
ALTER TABLE INVENTARIO_FISICO ADD CONSTRAINT chk_inventario_fecha_valida 
    CHECK (Fecha_Ingreso <= CURRENT_DATE);

COMMIT;
