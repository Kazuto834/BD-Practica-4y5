-- Categorías
INSERT INTO CATEGORIA (ID_Categoria, Nombre, Nivel_Prioridad) VALUES
(1, 'Sistema de Frenos', 1),
(2, 'Lubricantes y Fluidos', 2),
(3, 'Componentes de Motor', 1),
(4, 'Sensores y Electrónica', 3);

-- Ubicaciones del almacén
INSERT INTO UBICACION (ID_Ubicacion, Zona, Pasillo, Rack, Nivel, Capacidad_Peso_Kg, Tipo_Almacenaje) VALUES
(1, 'Z-A', 'P1', 'R01', 'N1', 500.00, 'Seco'),
(2, 'Z-A', 'P1', 'R01', 'N2', 250.00, 'Seco'),
(3, 'Z-B', 'P2', 'R04', 'N1', 400.00, 'Material Peligroso'),
(4, 'Z-C', 'P3', 'R02', 'N1', 300.00, 'Seco');

-- Empleados
INSERT INTO EMPLEADO (ID_Empleado, Nombre, Turno, Certificacion_Montacargas) VALUES
(101, 'Carlos Mendoza', 'Matutino', TRUE),
(102, 'Laura Gómez', 'Vespertino', FALSE),
(103, 'Roberto Sánchez', 'Matutino', TRUE);

-- Productos (Supertipo)
INSERT INTO PRODUCTO (SKU, Nombre, Largo_cm, Ancho_cm, Alto_cm, Peso_Kg, ID_Categoria) VALUES
('SKU-1001', 'Juego de Balatas Cerámicas Delanteras', 22.00, 14.00, 9.00, 2.40, 1),
('SKU-1002', 'Disco de Freno Ventilado 300mm', 31.00, 31.00, 5.50, 7.80, 1),
('SKU-2001', 'Aceite Sintético 5W-30 Garrafa 5L', 25.00, 15.00, 32.00, 4.60, 2),
('SKU-2002', 'Anticongelante Concentrado 4L', 22.00, 14.00, 29.00, 4.20, 2),
('SKU-4001', 'Sensor de Oxígeno Universal', 12.00, 6.00, 6.00, 0.35, 4);

-- Subtipos: Pieza Sólida y Fluido Químico
INSERT INTO PIEZA_SOLIDA (SKU, Material_Fabricacion, Fragil) VALUES
('SKU-1001', 'Compuesto Cerámico', FALSE),
('SKU-1002', 'Hierro Fundido', FALSE),
('SKU-4001', 'Acero Inoxidable / Cerámica', TRUE);

INSERT INTO FLUIDO_QUIMICO (SKU, Volumen_Mililitros, Nivel_Inflamabilidad, Requiere_Refrigeracion) VALUES
('SKU-2001', 5000.00, 2, FALSE),
('SKU-2002', 4000.00, 1, FALSE);

-- Inventario Físico (Stock real por coordenada)
INSERT INTO INVENTARIO_FISICO (SKU, ID_Ubicacion, ID_Inventario, Cantidad, Fecha_Ingreso) VALUES
('SKU-1001', 1, 1, 45, '2026-11-10'),
('SKU-1002', 1, 2, 20, '2026-11-11'),
('SKU-2001', 3, 3, 60, '2026-11-12'),
('SKU-4001', 2, 4, 30, '2026-11-14');

-- Órdenes de Salida y Detalle
INSERT INTO ORDEN_SALIDA (ID_Orden, Fecha_Emision, Estatus, ID_Empleado) VALUES
(5001, '2026-11-18 09:30:00', 'Completada', 101),
(5002, '2026-11-19 11:15:00', 'En Proceso', 102);

INSERT INTO DETALLE_ORDEN (ID_Orden, Numero_Linea, SKU, Cantidad_Pedida) VALUES
(5001, 1, 'SKU-1001', 4),
(5001, 2, 'SKU-2001', 6),
(5002, 1, 'SKU-4001', 2);