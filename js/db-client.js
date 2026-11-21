class DBClient {
  constructor() {
    const host = window.location.hostname || "localhost";
    this.apiBase = `http://${host}:8000/api`;
    this.isPostgres = false;
  }

  async init() {
    const isGitHubPages = window.location.hostname.endsWith("github.io");
    const isFileProtocol = window.location.protocol === "file:";

    if (isGitHubPages || isFileProtocol) {
      this.isPostgres = false;
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

    this.renderBadge();
    return this.isPostgres;
  }

  renderBadge() {
    const badge = document.getElementById("db-status-badge");
    if (!badge) return;
    if (this.isPostgres) {
      badge.textContent = "🟢 Conectado a PostgreSQL (Docker Local)";
      badge.className = "status-badge status-live";
    } else {
      badge.textContent = "🟡 Modo Estático (GitHub Pages)";
      badge.className = "status-badge status-static";
    }
  }

  async getCatalogos() {
    if (!this.isPostgres) return structuredClone(window.MOCK_DB.catalogos);
    const res = await fetch(`${this.apiBase}/catalogos`);
    return res.json();
  }

  async getProductos() {
    if (!this.isPostgres) return structuredClone(window.MOCK_DB.productos);
    const res = await fetch(`${this.apiBase}/productos`);
    return res.json();
  }

  async crearProducto(data) {
    if (!this.isPostgres) {
      const cat = window.MOCK_DB.catalogos.categorias.find(c => c.id_categoria === data.id_categoria);
      window.MOCK_DB.productos.push({
        ...data,
        categoria: cat ? cat.nombre : "General",
        stock_total: 0
      });
      return { message: "Producto agregado en memoria local (Modo Estático)" };
    }
    const res = await fetch(`${this.apiBase}/productos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error((await res.json()).detail || "Error al registrar producto");
    return res.json();
  }

  async getInventario() {
    if (!this.isPostgres) return structuredClone(window.MOCK_DB.inventario);
    const res = await fetch(`${this.apiBase}/inventario`);
    return res.json();
  }

  async registrarMovimiento(tipo, payload) {
    if (!this.isPostgres) {
      throw new Error("Modo Estático activo: las transacciones hacia PostgreSQL están deshabilitadas en GitHub Pages.");
    }
    const res = await fetch(`${this.apiBase}/inventario/${tipo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json()).detail || "Error en movimiento de inventario");
    return res.json();
  }

  async getOrdenes() {
    if (!this.isPostgres) return structuredClone(window.MOCK_DB.ordenes);
    const res = await fetch(`${this.apiBase}/ordenes`);
    return res.json();
  }

  async crearOrden(payload) {
    if (!this.isPostgres) {
      throw new Error("Modo Estático activo: creación de órdenes deshabilitada en GitHub Pages.");
    }
    const res = await fetch(`${this.apiBase}/ordenes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json()).detail || "Error al crear orden");
    return res.json();
  }

  async completarOrden(idOrden) {
    if (!this.isPostgres) {
      throw new Error("Modo Estático activo: actualización de órdenes deshabilitada en GitHub Pages.");
    }
    const res = await fetch(`${this.apiBase}/ordenes/${idOrden}/completar`, {
      method: "PATCH"
    });
    if (!res.ok) throw new Error("Error al completar orden");
    return res.json();
  }

  async getReportes() {
    if (!this.isPostgres) return structuredClone(window.MOCK_DB.reportes);
    const res = await fetch(`${this.apiBase}/reportes`);
    return res.json();
  }
}

window.dbClient = new DBClient();