// ============================================================================
// db-client.js
// Capa de Abstracción de Datos (Dual-Mode: PostgreSQL API vs Sesión Estática)
// Detecta automáticamente si el backend Docker está disponible; de lo contrario
// opera sobre sessionStorage con window.MOCK_DB para despliegue en GitHub Pages.
// ============================================================================

class DBClient {
  constructor() {
    this.apiBase = "/api";
    this.isPostgres = false;
    this.storageKey = "piston_static_db_v1";
    this.tokenKey = "piston_session_token_v1";
    this.userEmail = null;
    this.userRole = null;
    this.idEmpleado = null;
    this.userName = null;
  }

  // ==========================================================================
  // 1. Detección de Entorno y Verificación de Sesión
  // ==========================================================================

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

    if (this.isPostgres) {
      await this.verificarSesion();
    } else {
      this._initStaticState();
    }

    this.renderBadge();
    return this.isPostgres;
  }

  getToken() {
    return sessionStorage.getItem(this.tokenKey);
  }

  isAuthenticated() {
    return Boolean(this.isPostgres && this.userEmail && this.userRole && this.getToken());
  }

  isAdmin() {
    return this.isAuthenticated() && this.userRole === "admin";
  }

  async verificarSesion() {
    const token = this.getToken();
    if (!token || !this.isPostgres) {
      this.logout();
      return false;
    }
    try {
      const res = await fetch(`${this.apiBase}/auth/verify`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        this.logout();
        return false;
      }
      const data = await res.json();
      this.userEmail = data.email;
      this.userRole = data.role;
      this.idEmpleado = data.id_empleado ?? null;
      this.userName = data.nombre || data.email;
      return true;
    } catch {
      this.logout();
      return false;
    }
  }

  async login(email, password) {
    if (!this.isPostgres) {
      throw new Error("El inicio de sesión requiere que el servidor Docker esté activo.");
    }
    const res = await fetch(`${this.apiBase}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Credenciales incorrectas.");
    }
    sessionStorage.setItem(this.tokenKey, data.token);
    this.userEmail = data.email;
    this.userRole = data.role;
    this.idEmpleado = data.id_empleado ?? null;
    this.userName = data.nombre || data.email;
    this.renderBadge();
    return data;
  }

  logout() {
    sessionStorage.removeItem(this.tokenKey);
    this.userEmail = null;
    this.userRole = null;
    this.idEmpleado = null;
    this.userName = null;
    this.renderBadge();
  }

  async _authFetch(url, options = {}) {
    const token = this.getToken();
    if (!token) {
      throw new Error("Sesión requerida para consultar o modificar la base de datos.");
    }
    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      this.logout();
      throw new Error("Sesión expirada o no autorizada. Inicia sesión nuevamente.");
    }
    return res;
  }

  // ==========================================================================
  // 2. Administración de Personal, Credenciales y Roles
  // ==========================================================================

  async crearEmpleado(payload) {
    if (!this.isAdmin()) {
      throw new Error("Acceso denegado: se requiere cuenta de Administrador.");
    }
    const res = await this._authFetch(`${this.apiBase}/empleados`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "No autorizado para registrar trabajadores.");
    }
    return data;
  }

  async guardarCredencialesEmpleado(idEmpleado, payload) {
    if (!this.isAdmin()) {
      throw new Error("Acceso denegado: se requiere cuenta de Administrador.");
    }
    if (!this.isPostgres) {
      const db = this._getStaticDB();
      const emp = db.catalogos.empleados.find((e) => Number(e.id_empleado) === Number(idEmpleado));
      if (!emp) throw new Error("Empleado no encontrado.");
      emp.correo_acceso = payload.email;
      emp.rol = payload.rol || "empleado";
      emp.rol_acceso = emp.rol;
      this._saveStaticDB(db);
      return { message: `Credenciales actualizadas en sesión estática para ${emp.nombre}.` };
    }
    const res = await this._authFetch(`${this.apiBase}/empleados/${idEmpleado}/credenciales`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "No se pudieron actualizar las credenciales.");
    }
    return data;
  }

  async asignarRolEmpleado(idEmpleado, rol) {
    if (!this.isAdmin()) {
      throw new Error("Acceso denegado: se requiere cuenta de Administrador.");
    }
    if (!this.isPostgres) {
      const db = this._getStaticDB();
      const emp = db.catalogos.empleados.find((e) => Number(e.id_empleado) === Number(idEmpleado));
      if (!emp) throw new Error("Empleado no encontrado.");
      emp.rol = rol;
      emp.rol_acceso = rol;
      this._saveStaticDB(db);
      const etiqueta = rol === "admin" ? "Administrador" : "Personal Operativo";
      return { message: `Rol actualizado a ${etiqueta} para ${emp.nombre}.` };
    }
    const res = await this._authFetch(`${this.apiBase}/empleados/${idEmpleado}/rol`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rol }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "No se pudo actualizar el rol.");
    }
    return data;
  }

  async cambiarMiPassword(passwordActual, passwordNueva) {
    const res = await this._authFetch(`${this.apiBase}/auth/cambiar-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password_actual: passwordActual,
        password_nueva: passwordNueva,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "No se pudo cambiar la contraseña.");
    }
    return data;
  }

  async getReportesCertificadosPDF() {
    if (!this.isAdmin()) {
      throw new Error("La descarga de reportes PDF requiere sesión de Administrador.");
    }
    const res = await this._authFetch(`${this.apiBase}/reportes/pdf-data`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "No autorizado para exportar reportes PDF.");
    }
    return data;
  }

  // ==========================================================================
  // 3. Almacenamiento Estático en Sesión e Indicador Visual de Entorno
  // ==========================================================================

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
      if (!this.isAuthenticated()) {
        badge.textContent = "🟢 PostgreSQL en Vivo (Bloqueado)";
      } else {
        badge.textContent = `🟢 PostgreSQL — ${this.userName}`;
      }
      badge.className = "status-badge status-live";
    } else {
      badge.textContent = "🟡 Modo Estático (Sesión Temporal en Pestaña)";
      badge.className = "status-badge status-static";
    }
  }

  // ==========================================================================
  // 4. Catálogos, Productos e Inventario Físico
  // ==========================================================================

  async getCatalogos() {
    if (!this.isPostgres) return this._getStaticDB().catalogos;
    const res = await this._authFetch(`${this.apiBase}/catalogos`);
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
    const res = await this._authFetch(`${this.apiBase}/productos`);
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

    const res = await this._authFetch(`${this.apiBase}/productos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).detail || "Error al registrar producto");
    return res.json();
  }

  async getInventario() {
    if (!this.isPostgres) return this._getStaticDB().inventario;
    const res = await this._authFetch(`${this.apiBase}/inventario`);
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
        const prod = db.productos.find((p) => p.sku === payload.sku);
        const ubi = db.catalogos.ubicaciones.find((u) => Number(u.id_ubicacion) === Number(payload.id_ubicacion));
        if (!prod || !ubi) throw new Error("Producto o ubicación no válidos.");

        const pesoActual = db.inventario
          .filter((i) => Number(i.id_ubicacion) === Number(payload.id_ubicacion))
          .reduce((acc, item) => {
            const p = db.productos.find((x) => x.sku === item.sku);
            return acc + (p ? Number(p.peso_kg) * Number(item.cantidad) : 0);
          }, 0);

        const pesoAdicional = Number(prod.peso_kg) * cantidad;
        const capMax = Number(ubi.capacidad_peso_kg);

        if (pesoActual + pesoAdicional > capMax) {
          const disponible = Math.max(0, capMax - pesoActual);
          throw new Error(
            `Sin espacio: el peso a ingresar (${pesoAdicional.toFixed(2)} kg) excede la capacidad de la coordenada ${ubi.zona}-${ubi.pasillo}-${ubi.rack}-${ubi.nivel}. ` +
            `Espacio disponible: ${disponible.toFixed(2)} kg (Capacidad máx: ${capMax.toFixed(2)} kg, Ocupado actual: ${pesoActual.toFixed(2)} kg).`
          );
        }

        if (idx !== -1) {
          db.inventario[idx].cantidad = Number(db.inventario[idx].cantidad) + cantidad;
        } else {
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

    const res = await this._authFetch(`${this.apiBase}/inventario/${tipo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).detail || "Error en movimiento de inventario");
    return res.json();
  }

  // ==========================================================================
  // 5. Órdenes de Salida (Ciclo: Pendiente -> En Proceso -> Completada / Cancelada)
  // ==========================================================================

  async getOrdenes() {
    if (!this.isPostgres) return this._getStaticDB().ordenes;
    const res = await this._authFetch(`${this.apiBase}/ordenes`);
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
        estatus: "Pendiente",
        id_empleado: emp.id_empleado,
        empleado: emp.nombre,
        turno: emp.turno,
        resumen_productos: `${payload.sku} (x${payload.cantidad_pedida})`,
      });
      this._saveStaticDB(db);
      return { message: "Orden asignada en estatus Pendiente (sesión estática)." };
    }

    const res = await this._authFetch(`${this.apiBase}/ordenes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).detail || "Error al crear orden");
    return res.json();
  }

  /**
   * Replica en modo estático la misma máquina de estados validada por trigger en PostgreSQL.
   */
  _actualizarOrdenEstatica(idOrden, nuevoEstatus) {
    const db = this._getStaticDB();
    const orden = db.ordenes.find((o) => Number(o.id_orden) === Number(idOrden));
    if (!orden) throw new Error("Orden no encontrada.");

    const actual = String(orden.estatus || "").trim().toLowerCase();
    if (nuevoEstatus === "En Proceso" && actual !== "pendiente") {
      throw new Error("Solo las órdenes en estatus Pendiente pueden pasar a En Proceso.");
    }
    if (nuevoEstatus === "Completada" && actual !== "en proceso" && actual !== "en despacho") {
      throw new Error("Debes poner primero la orden En Proceso antes de marcarla como Completada.");
    }
    if (nuevoEstatus === "Cancelada" && (actual === "completada" || actual === "cancelada")) {
      throw new Error(`La orden #${idOrden} ya está ${orden.estatus} y no puede cancelarse.`);
    }

    orden.estatus = nuevoEstatus;
    this._saveStaticDB(db);
    return { message: `Orden #${idOrden} actualizada a '${nuevoEstatus}' en sesión estática.` };
  }

  async procesarOrden(idOrden) {
    if (!this.isPostgres) {
      return this._actualizarOrdenEstatica(idOrden, "En Proceso");
    }
    const res = await this._authFetch(`${this.apiBase}/ordenes/${idOrden}/procesar`, {
      method: "PATCH",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "No se pudo poner la orden en proceso.");
    return data;
  }

  async completarOrden(idOrden) {
    if (!this.isPostgres) {
      return this._actualizarOrdenEstatica(idOrden, "Completada");
    }
    const res = await this._authFetch(`${this.apiBase}/ordenes/${idOrden}/completar`, {
      method: "PATCH",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "No se pudo completar la orden.");
    return data;
  }

  async cancelarOrden(idOrden) {
    if (!this.isPostgres) {
      return this._actualizarOrdenEstatica(idOrden, "Cancelada");
    }
    const res = await this._authFetch(`${this.apiBase}/ordenes/${idOrden}/cancelar`, {
      method: "PATCH",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "No se pudo cancelar la orden.");
    return data;
  }

  // ==========================================================================
  // 6. Reportes Gerenciales
  // ==========================================================================

  async getReportes() {
    if (!this.isPostgres) {
      const db = this._getStaticDB();

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

    const res = await this._authFetch(`${this.apiBase}/reportes`);
    return res.json();
  }
}

window.dbClient = new DBClient();