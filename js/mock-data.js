window.MOCK_DB = {
  catalogos: {
    categorias: [
      { id_categoria: 1, nombre: "Sistema de Frenos", nivel_prioridad: 1 },
      { id_categoria: 2, nombre: "Lubricantes y Fluidos", nivel_prioridad: 2 },
      { id_categoria: 3, nombre: "Componentes de Motor", nivel_prioridad: 1 },
      { id_categoria: 4, nombre: "Sensores y Electrónica", nivel_prioridad: 3 }
    ],
    ubicaciones: [
      { id_ubicacion: 1, zona: "Z-A", pasillo: "P1", rack: "R01", nivel: "N1", capacidad_peso_kg: 500, tipo_almacenaje: "Seco" },
      { id_ubicacion: 2, zona: "Z-A", pasillo: "P1", rack: "R01", nivel: "N2", capacidad_peso_kg: 250, tipo_almacenaje: "Seco" },
      { id_ubicacion: 3, zona: "Z-B", pasillo: "P2", rack: "R04", nivel: "N1", capacidad_peso_kg: 400, tipo_almacenaje: "Material Peligroso" },
      { id_ubicacion: 4, zona: "Z-C", pasillo: "P3", rack: "R02", nivel: "N1", capacidad_peso_kg: 300, tipo_almacenaje: "Seco" }
    ],
    empleados: [
      { id_empleado: 101, nombre: "Carlos Mendoza", turno: "Matutino", certificacion_montacargas: true },
      { id_empleado: 102, nombre: "Laura Gómez", turno: "Vespertino", certificacion_montacargas: false },
      { id_empleado: 103, nombre: "Roberto Sánchez", turno: "Matutino", certificacion_montacargas: true }
    ]
  },
  productos: [
    {
      sku: "SKU-1001",
      nombre: "Juego de Balatas Cerámicas Delanteras",
      id_categoria: 1,
      categoria: "Sistema de Frenos",
      largo_cm: 22,
      ancho_cm: 14,
      alto_cm: 9,
      peso_kg: 2.4,
      material_fabricacion: "Compuesto Cerámico",
      fragil: false,
      volumen_mililitros: null,
      nivel_inflamabilidad: null,
      requiere_refrigeracion: null,
      stock_total: 45
    },
    {
      sku: "SKU-1002",
      nombre: "Disco de Freno Ventilado 300mm",
      id_categoria: 1,
      categoria: "Sistema de Frenos",
      largo_cm: 31,
      ancho_cm: 31,
      alto_cm: 5.5,
      peso_kg: 7.8,
      material_fabricacion: "Hierro Fundido",
      fragil: false,
      volumen_mililitros: null,
      nivel_inflamabilidad: null,
      requiere_refrigeracion: null,
      stock_total: 20
    },
    {
      sku: "SKU-2001",
      nombre: "Aceite Sintético 5W-30 Garrafa 5L",
      id_categoria: 2,
      categoria: "Lubricantes y Fluidos",
      largo_cm: 25,
      ancho_cm: 15,
      alto_cm: 32,
      peso_kg: 4.6,
      material_fabricacion: null,
      fragil: null,
      volumen_mililitros: 5000,
      nivel_inflamabilidad: 2,
      requiere_refrigeracion: false,
      stock_total: 60
    },
    {
      sku: "SKU-4001",
      nombre: "Sensor de Oxígeno Universal",
      id_categoria: 4,
      categoria: "Sensores y Electrónica",
      largo_cm: 12,
      ancho_cm: 6,
      alto_cm: 6,
      peso_kg: 0.35,
      material_fabricacion: "Acero Inoxidable / Cerámica",
      fragil: true,
      volumen_mililitros: null,
      nivel_inflamabilidad: null,
      requiere_refrigeracion: null,
      stock_total: 30
    }
  ],
  inventario: [
    { id_inventario: 1, sku: "SKU-1001", producto: "Juego de Balatas Cerámicas Delanteras", cantidad: 45, fecha_ingreso: "2026-11-10", id_ubicacion: 1, zona: "Z-A", pasillo: "P1", rack: "R01", nivel: "N1", tipo_almacenaje: "Seco", capacidad_peso_kg: 500 },
    { id_inventario: 2, sku: "SKU-1002", producto: "Disco de Freno Ventilado 300mm", cantidad: 20, fecha_ingreso: "2026-11-11", id_ubicacion: 1, zona: "Z-A", pasillo: "P1", rack: "R01", nivel: "N1", tipo_almacenaje: "Seco", capacidad_peso_kg: 500 },
    { id_inventario: 3, sku: "SKU-2001", producto: "Aceite Sintético 5W-30 Garrafa 5L", cantidad: 60, fecha_ingreso: "2026-11-12", id_ubicacion: 3, zona: "Z-B", pasillo: "P2", rack: "R04", nivel: "N1", tipo_almacenaje: "Material Peligroso", capacidad_peso_kg: 400 },
    { id_inventario: 4, sku: "SKU-4001", producto: "Sensor de Oxígeno Universal", cantidad: 30, fecha_ingreso: "2026-11-14", id_ubicacion: 2, zona: "Z-A", pasillo: "P1", rack: "R01", nivel: "N2", tipo_almacenaje: "Seco", capacidad_peso_kg: 250 }
  ],
  ordenes: [
    { id_orden: 5001, fecha_emision: "2026-11-18T09:30:00", estatus: "Completada", id_empleado: 101, empleado: "Carlos Mendoza", turno: "Matutino", resumen_productos: "SKU-1001 (x4), SKU-2001 (x6)" },
    { id_orden: 5002, fecha_emision: "2026-11-19T11:15:00", estatus: "En Proceso", id_empleado: 102, empleado: "Laura Gómez", turno: "Vespertino", resumen_productos: "SKU-4001 (x2)" }
  ],
  reportes: {
    stock_por_ubicacion: [
      { zona: "Z-A", pasillo: "P1", rack: "R01", nivel: "N1", sku: "SKU-1001", nombre: "Juego de Balatas Cerámicas Delanteras", cantidad: 45, peso_total_kg: 108.00, capacidad_peso_kg: 500 },
      { zona: "Z-A", pasillo: "P1", rack: "R01", nivel: "N1", sku: "SKU-1002", nombre: "Disco de Freno Ventilado 300mm", cantidad: 20, peso_total_kg: 156.00, capacidad_peso_kg: 500 },
      { zona: "Z-A", pasillo: "P1", rack: "R01", nivel: "N2", sku: "SKU-4001", nombre: "Sensor de Oxígeno Universal", cantidad: 30, peso_total_kg: 10.50, capacidad_peso_kg: 250 },
      { zona: "Z-B", pasillo: "P2", rack: "R04", nivel: "N1", sku: "SKU-2001", nombre: "Aceite Sintético 5W-30 Garrafa 5L", cantidad: 60, peso_total_kg: 276.00, capacidad_peso_kg: 400 }
    ],
    eficiencia_recoleccion: [
      { id_empleado: 101, nombre: "Carlos Mendoza", turno: "Matutino", ordenes_completadas: 1, ordenes_asignadas: 1 },
      { id_empleado: 102, nombre: "Laura Gómez", turno: "Vespertino", ordenes_completadas: 0, ordenes_asignadas: 1 },
      { id_empleado: 103, nombre: "Roberto Sánchez", turno: "Matutino", ordenes_completadas: 0, ordenes_asignadas: 0 }
    ],
    ubicaciones_vacias: [
      { id_ubicacion: 4, zona: "Z-C", pasillo: "P3", rack: "R02", nivel: "N1", capacidad_peso_kg: 300, tipo_almacenaje: "Seco" }
    ]
  }
};