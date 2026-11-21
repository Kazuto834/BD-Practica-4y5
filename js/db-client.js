class DBClient {
  constructor() {
    const host = window.location.hostname || "localhost";
    this.apiBase = `http://${host}:8000/api`;
    this.isPostgres = false;
    this.storageKey = "piston_static_db_v1";
  }

  async init() {
    const isGitHubPages = window.location.hostname.endsWith("github.io");
    const isFileProtocol = window.location.protocol === "file:";

    if (isGitHubPages || isFileProtocol) {
      this.isPostgres = false;
      this._initStaticState();
      this.renderBadge();
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`${this.apiBase}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      this.isPostgres = res.ok;
    } catch {
      this.isPostgres = false;
    }

    if (!this.isPostgres) {
      this._initStaticState();
    }

    this.renderBadge();
    return this.isPostgres;
  }

  _initStaticState() {
    if (!sessionStorage.getItem(this.storageKey)) {
      sessionStorage.setItem(this.storageKey, JSON.stringify(window.MOCK_DB));
    }
  }

  _getStaticDB() {
    this._initStaticState();
    return JSON.parse(sessionStorage.getItem(this.storageKey));
  }

  _saveStaticDB(db) {
    sessionStorage.setItem(this.storageKey, JSON.stringify(db));
  }

  renderBadge() {
    const badge = document.getElementById("db-status-badge");
    if (!badge) return;
    if (this.isPostgres) {
      badge.textContent = "🟢 Conectado a PostgreSQL (Docker Local)";
      badge.className = "status-badge status-live";
    } else {
      badge.textContent = "🟡 Modo Estático (Sesión Temporal en Pestaña)";
      badge.className = "status-badge status-static";
    }
  }

  async getCatalogos() {
    if (!this.isPostgres) return this._getStaticDB().catalogos;
    const res = await fetch(`${this.apiBase}/catalogos`);
    return res.json();
  }

  async getProductos() {
    if (!this.isPostgres) {
      const db = this._getStaticDB();
      return db.productos.map((p) => {
        const stockTotal = db.inventario
          .filter((i) => i.sku === p.sku)
          .reduce((acc, item) => acc + Number(item.cantidad), 0);
        return { ...p, stock_total: stockTotal };
      });
    }
    const res = await fetch(`${this.apiBase}/productos`);
    return res.json();
  }

  async crearProducto(data) {
    if (!this.isPostgres) {
      const db = this._getStaticDB();
      if (db.productos.some((p) => p.sku.toLowerCase() === data.sku.toLowerCase())) {
        throw new Error(`El SKU '${data.sku}' ya existe en el catálogo.`);
      }
      const cat = db.catalogos.categorias.find((c) => c.id_categoria === data.id_categoria);
      db.productos.push({
        sku: data.sku,
        nombre: data.nombre,
        id_categoria: data.id_categoria,
        categoria: cat ? cat.nombre : "General",
        largo_cm: data.largo_cm,
        ancho_cm: data.ancho_cm,
        alto_cm: data.alto_cm,
        peso_kg: data.peso_kg,
        material_fabricacion: data.tipo === "solida" ? data.material_fabricacion : null,
        fragil: data.tipo === "solida" ? data.fragil : null,
        volumen_mililitros: data.tipo === "fluido" ? data.volumen_mililitros : null,
        nivel_inflamabilidad: data.tipo === "fluido" ? data.nivel_inflamabilidad : null,
        requiere_refrigeracion: data.tipo === "fluido" ? data.requiere_refrigeracion : null,
        stock_total: 0,
      });
      this._saveStaticDB(db);
      return { message: "Producto guardado en sesión estática (vigente hasta cerrar la pestaña)." };
    }

    const res = await fetch(`${this.apiBase}/productos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).detail || "Error al registrar producto");
    return res.json();
  }

  async getInventario() {
    if (!this.isPostgres) return this._getStaticDB().inventario;
    const res = await fetch(`${this.apiBase}/inventario`);
    return res.json();
  }

  async registrarMovimiento(tipo, payload) {
    if (!this.isPostgres) {
      const db = this._getStaticDB();
      const cantidad = Number(payload.cantidad);
      if (cantidad <= 0) throw new Error("La cantidad debe ser mayor a 0.");

      const idx = db.inventario.findIndex(
        (i) => i.sku === payload.sku && Number(i.id_ubicacion) === Number(payload.id_ubicacion)
      );

      if (tipo === "entrada") {
        if (idx !== -1) {
          db.inventario[idx].cantidad = Number(db.inventario[idx].cantidad) + cantidad;
        } else {
          const prod = db.productos.find((p) => p.sku === payload.sku);
          const ubi = db.catalogos.ubicaciones.find((u) => Number(u.id_ubicacion) === Number(payload.id_ubicacion));
          if (!prod || !ubi) throw new Error("Producto o ubicación no válidos.");

          const nextId = db.inventario.reduce((max, i) => Math.max(max, Number(i.id_inventario)), 0) + 1;
          db.inventario.push({
            id_inventario: nextId,
            sku: prod.sku,
            producto: prod.nombre,
            cantidad,
            fecha_ingreso: new Date().toISOString().slice(0, 10),
            id_ubicacion: ubi.id_ubicacion,
            zona: ubi.zona,
            pasillo: ubi.pasillo,
            rack: ubi.rack,
            nivel: ubi.nivel,
            tipo_almacenaje: ubi.tipo_almacenaje,
            capacidad_peso_kg: ubi.capacidad_peso_kg,
          });
        }
        this._saveStaticDB(db);
        return { message: "Entrada registrada en sesión estática." };
      }

      if (tipo === "salida") {
        if (idx === -1 || Number(db.inventario[idx].cantidad) < cantidad) {
          throw new Error("Stock insuficiente en esa ubicación.");
        }
        const nuevaCant = Number(db.inventario[idx].cantidad) - cantidad;
        if (nuevaCant === 0) {
          db.inventario.splice(idx, 1);
        } else {
          db.inventario[idx].cantidad = nuevaCant;
        }
        this._saveStaticDB(db);
        return { message: "Salida procesada y stock descontado en sesión estática." };
      }
    }

    const res = await fetch(`${this.apiBase}/inventario/${tipo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).detail || "Error en movimiento de inventario");
    return res.json();
  }

  async getOrdenes() {
    if (!this.isPostgres) return this._getStaticDB().ordenes;
    const res = await fetch(`${this.apiBase}/ordenes`);
    return res.json();
  }

  async crearOrden(payload) {
    if (!this.isPostgres) {
      const db = this._getStaticDB();
      if (db.ordenes.some((o) => Number(o.id_orden) === Number(payload.id_orden))) {
        throw new Error(`La orden #${payload.id_orden} ya existe.`);
      }
      const emp = db.catalogos.empleados.find((e) => Number(e.id_empleado) === Number(payload.id_empleado));
      if (!emp) throw new Error("Empleado no encontrado.");

      db.ordenes.unshift({
        id_orden: Number(payload.id_orden),
        fecha_emision: new Date().toISOString(),
        estatus: "En Proceso",
        id_empleado: emp.id_empleado,
        empleado: emp.nombre,
        turno: emp.turno,
        resumen_productos: `${payload.sku} (x${payload.cantidad_pedida})`,
      });
      this._saveStaticDB(db);
      return { message: "Orden asignada en sesión estática." };
    }

    const res = await fetch(`${this.apiBase}/ordenes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).detail || "Error al crear orden");
    return res.json();
  }

  async completarOrden(idOrden) {
    if (!this.isPostgres) {
      const db = this._getStaticDB();
      const orden = db.ordenes.find((o) => Number(o.id_orden) === Number(idOrden));
      if (!orden) throw new Error("Orden no encontrada.");
      orden.estatus = "Completada";
      this._saveStaticDB(db);
      return { message: "Orden completada en sesión estática." };
    }

    const res = await fetch(`${this.apiBase}/ordenes/${idOrden}/completar`, {
      method: "PATCH",
    });
    if (!res.ok) throw new Error("Error al completar orden");
    return res.json();
  }

  async getReportes() {
    if (!this.isPostgres) {
      const db = this._getStaticDB();

      // 1. Stock por ubicación recalculado dinámicamente
      const stock_por_ubicacion = db.inventario.map((i) => {
        const prod = db.productos.find((p) => p.sku === i.sku);
        const pesoUnit = prod ? Number(prod.peso_kg) : 0;
        return {
          zona: i.zona,
          pasillo: i.pasillo,
          rack: i.rack,
          nivel: i.nivel,
          sku: i.sku,
          nombre: i.producto,
          cantidad: i.cantidad,
          peso_total_kg: Number((pesoUnit * Number(i.cantidad)).toFixed(2)),
          capacidad_peso_kg: i.capacidad_peso_kg,
        };
      });

      // 2. Eficiencia de recolección recalculada dinámicamente
      const eficiencia_recoleccion = db.catalogos.empleados
        .map((e) => {
          const asignadas = db.ordenes.filter((o) => Number(o.id_empleado) === Number(e.id_empleado));
          const completadas = asignadas.filter((o) => o.estatus === "Completada");
          return {
            id_empleado: e.id_empleado,
            nombre: e.nombre,
            turno: e.turno,
            ordenes_completadas: completadas.length,
            ordenes_asignadas: asignadas.length,
          };
        })
        .sort((a, b) => b.ordenes_completadas - a.ordenes_completadas);

      // 3. Ubicaciones vacías recalculadas dinámicamente
      const ocupadasIds = new Set(db.inventario.map((i) => Number(i.id_ubicacion)));
      const ubicaciones_vacias = db.catalogos.ubicaciones.filter(
        (u) => !ocupadasIds.has(Number(u.id_ubicacion))
      );

      return {
        stock_por_ubicacion,
        eficiencia_recoleccion,
        ubicaciones_vacias,
      };
    }

    const res = await fetch(`${this.apiBase}/reportes`);
    return res.json();
  }
}

window.dbClient = new DBClient();