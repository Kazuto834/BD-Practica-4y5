let cacheInventario = [];
let cacheReportes = {
  stock_por_ubicacion: [],
  eficiencia_recoleccion: [],
  ubicaciones_vacias: [],
};

function showAlert(msg) {
  const box = document.getElementById("alert-box");
  box.textContent = msg;
  box.classList.remove("hidden");
  setTimeout(() => box.classList.add("hidden"), 4500);
}

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    });
  });
}

function renderInventario(lista) {
  const tbody = document.getElementById("tabla-inventario");
  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">Sin registros en inventario</td></tr>`;
    return;
  }
  tbody.innerHTML = lista
    .map(
      (i) => `
      <tr>
        <td><strong>${i.zona}-${i.pasillo}-${i.rack}-${i.nivel}</strong></td>
        <td>${i.tipo_almacenaje}</td>
        <td>${i.sku}</td>
        <td>${i.producto}</td>
        <td><strong>${i.cantidad}</strong></td>
        <td>${i.fecha_ingreso}</td>
      </tr>`
    )
    .join("");
}

function aplicarFiltroInventario() {
  const input = document.getElementById("buscar-inventario");
  const q = (input ? input.value : "").toLowerCase().trim();
  if (!q) {
    renderInventario(cacheInventario);
    return;
  }
  const filtrados = cacheInventario.filter(
    (i) =>
      i.sku.toLowerCase().includes(q) ||
      i.producto.toLowerCase().includes(q) ||
      `${i.zona}-${i.pasillo}-${i.rack}-${i.nivel}`.toLowerCase().includes(q)
  );
  renderInventario(filtrados);
}

function renderProductos(productos) {
  const tbody = document.getElementById("tabla-productos");
  tbody.innerHTML = productos
    .map((p) => {
      const spec =
        p.volumen_mililitros != null
          ? `Fluido: ${p.volumen_mililitros} ml | Inflam. ${p.nivel_inflamabilidad}`
          : `Sólida: ${p.material_fabricacion || "Estándar"} ${p.fragil ? "(Frágil)" : ""}`;
      return `
        <tr>
          <td><strong>${p.sku}</strong></td>
          <td>${p.nombre}</td>
          <td>${p.categoria}</td>
          <td>${p.largo_cm} × ${p.ancho_cm} × ${p.alto_cm}</td>
          <td>${p.peso_kg} kg</td>
          <td>${spec}</td>
          <td><strong>${p.stock_total}</strong></td>
        </tr>`;
    })
    .join("");
}

function renderOrdenes(ordenes) {
  const tbody = document.getElementById("tabla-ordenes");
  tbody.innerHTML = ordenes
    .map(
      (o) => `
      <tr>
        <td>#${o.id_orden}</td>
        <td>${new Date(o.fecha_emision).toLocaleString("es-MX")}</td>
        <td>${o.empleado} (${o.turno})</td>
        <td>${o.resumen_productos || "-"}</td>
        <td><strong>${o.estatus}</strong></td>
        <td>
          ${
            o.estatus !== "Completada"
              ? `<button class="btn-small" onclick="completarOrdenUI(${o.id_orden})">Completar</button>`
              : "—"
          }
        </td>
      </tr>`
    )
    .join("");
}

function renderReportes(reportes) {
  cacheReportes = reportes;

  document.getElementById("rep-stock").innerHTML =
    reportes.stock_por_ubicacion.length === 0
      ? `<tr><td colspan="5">Sin stock registrado</td></tr>`
      : reportes.stock_por_ubicacion
          .map(
            (r) => `
            <tr>
              <td>${r.zona}-${r.pasillo}-${r.rack}-${r.nivel}</td>
              <td>${r.sku}</td>
              <td>${r.nombre}</td>
              <td>${r.cantidad}</td>
              <td>${r.peso_total_kg} / ${r.capacidad_peso_kg} kg</td>
            </tr>`
          )
          .join("");

  document.getElementById("rep-eficiencia").innerHTML = reportes.eficiencia_recoleccion
    .map(
      (e) => `
      <tr>
        <td>${e.nombre}</td>
        <td>${e.turno}</td>
        <td><strong>${e.ordenes_completadas}</strong> / ${e.ordenes_asignadas}</td>
      </tr>`
    )
    .join("");

  document.getElementById("rep-vacias").innerHTML =
    reportes.ubicaciones_vacias.length === 0
      ? `<tr><td colspan="3">Sin ubicaciones vacías</td></tr>`
      : reportes.ubicaciones_vacias
          .map(
            (u) => `
            <tr>
              <td><strong>${u.zona}-${u.pasillo}-${u.rack}-${u.nivel}</strong></td>
              <td>${u.tipo_almacenaje}</td>
              <td>${u.capacidad_peso_kg} kg</td>
            </tr>`
          )
          .join("");
}

function descargarReportesPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    window.print();
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const fechaStr = new Date().toLocaleString("es-MX");
  const origenDatos = window.dbClient.isPostgres
    ? "Base de Datos PostgreSQL 16 (Entorno Local Docker)"
    : "Modo Estático (Sesión Temporal en Navegador)";

  // Encabezado institucional
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 216, 28, "F");
  doc.setTextColor(56, 189, 248);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Almacenes El Pistón — Reportes Gerenciales", 14, 12);

  doc.setTextColor(226, 232, 240);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Generado: ${fechaStr}`, 14, 19);
  doc.text(`Fuente: ${origenDatos}`, 14, 24);

  let yPos = 36;

  // 1. Stock por Ubicación
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("1. Stock y Carga por Ubicación", 14, yPos);

  const filasStock =
    cacheReportes.stock_por_ubicacion.length > 0
      ? cacheReportes.stock_por_ubicacion.map((r) => [
          `${r.zona}-${r.pasillo}-${r.rack}-${r.nivel}`,
          r.sku,
          r.nombre,
          String(r.cantidad),
          `${r.peso_total_kg} / ${r.capacidad_peso_kg} kg`,
        ])
      : [["—", "—", "Sin stock registrado", "0", "0 kg"]];

  doc.autoTable({
    startY: yPos + 3,
    head: [["Ubicación", "SKU", "Producto", "Cantidad", "Peso Actual / Máx"]],
    body: filasStock,
    theme: "grid",
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
    margin: { left: 14, right: 14 },
  });

  yPos = doc.lastAutoTable.finalY + 10;

  // 2. Eficiencia de Recolección
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("2. Eficiencia de Recolección por Empleado", 14, yPos);

  const filasEficiencia = cacheReportes.eficiencia_recoleccion.map((e) => [
    e.nombre,
    e.turno,
    `${e.ordenes_completadas} / ${e.ordenes_asignadas}`,
  ]);

  doc.autoTable({
    startY: yPos + 3,
    head: [["Empleado", "Turno", "Órdenes Completadas / Asignadas"]],
    body: filasEficiencia,
    theme: "grid",
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
    margin: { left: 14, right: 14 },
  });

  yPos = doc.lastAutoTable.finalY + 10;

  // 3. Ubicaciones Vacías
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("3. Ubicaciones Vacías Disponibles", 14, yPos);

  const filasVacias =
    cacheReportes.ubicaciones_vacias.length > 0
      ? cacheReportes.ubicaciones_vacias.map((u) => [
          `${u.zona}-${u.pasillo}-${u.rack}-${u.nivel}`,
          u.tipo_almacenaje,
          `${u.capacidad_peso_kg} kg`,
        ])
      : [["—", "Sin ubicaciones vacías disponibles", "—"]];

  doc.autoTable({
    startY: yPos + 3,
    head: [["Coordenada", "Tipo de Almacenaje", "Capacidad Máxima"]],
    body: filasVacias,
    theme: "grid",
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
    margin: { left: 14, right: 14 },
  });

  // Pie de página con número de página
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Almacenes El Pistón — Sistema de Gestión Logística | Página ${i} de ${totalPages}`,
      14,
      270
    );
  }

  const fechaArchivo = new Date().toISOString().slice(0, 10);
  doc.save(`Reporte_Almacen_El_Piston_${fechaArchivo}.pdf`);
  showAlert("Reporte gerencial descargado en formato PDF.");
}

async function cargarTodo() {
  const [catalogos, productos, inventario, ordenes, reportes] = await Promise.all([
    window.dbClient.getCatalogos(),
    window.dbClient.getProductos(),
    window.dbClient.getInventario(),
    window.dbClient.getOrdenes(),
    window.dbClient.getReportes(),
  ]);

  cacheInventario = inventario;

  // Poblar selects
  const skuOptions = productos.map((p) => `<option value="${p.sku}">${p.sku} — ${p.nombre}</option>`).join("");
  document.getElementById("mov-sku").innerHTML = skuOptions;
  document.getElementById("ord-sku").innerHTML = skuOptions;

  document.getElementById("mov-ubicacion").innerHTML = catalogos.ubicaciones
    .map((u) => `<option value="${u.id_ubicacion}">${u.zona}-${u.pasillo}-${u.rack}-${u.nivel} (${u.tipo_almacenaje})</option>`)
    .join("");

  document.getElementById("prod-categoria").innerHTML = catalogos.categorias
    .map((c) => `<option value="${c.id_categoria}">${c.nombre}</option>`)
    .join("");

  document.getElementById("ord-empleado").innerHTML = catalogos.empleados
    .map((e) => `<option value="${e.id_empleado}">${e.nombre} (${e.turno})</option>`)
    .join("");

  // Sugerir siguiente ID de orden disponible
  const maxOrden = ordenes.reduce((max, o) => Math.max(max, Number(o.id_orden)), 5000);
  document.getElementById("ord-id").value = maxOrden + 1;

  aplicarFiltroInventario();
  renderProductos(productos);
  renderOrdenes(ordenes);
  renderReportes(reportes);
}

window.completarOrdenUI = async (idOrden) => {
  try {
    const res = await window.dbClient.completarOrden(idOrden);
    showAlert(res?.message || `Orden #${idOrden} marcada como Completada.`);
    await cargarTodo();
  } catch (err) {
    showAlert(err.message);
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  await window.dbClient.init();
  await cargarTodo();

  // Botón descarga PDF
  document.getElementById("btn-descargar-pdf").addEventListener("click", descargarReportesPDF);

  // Filtro rápido en inventario
  document.getElementById("buscar-inventario").addEventListener("input", aplicarFiltroInventario);

  // Cambio de subtipo en formulario de producto
  document.getElementById("prod-subtipo").addEventListener("change", (e) => {
    const esSolida = e.target.value === "solida";
    document.getElementById("campos-solida").classList.toggle("hidden", !esSolida);
    document.getElementById("campos-fluido").classList.toggle("hidden", esSolida);
  });

  // Submit movimiento inventario
  document.getElementById("form-movimiento").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const tipo = document.getElementById("mov-tipo").value;
      const res = await window.dbClient.registrarMovimiento(tipo, {
        sku: document.getElementById("mov-sku").value,
        id_ubicacion: Number(document.getElementById("mov-ubicacion").value),
        cantidad: Number(document.getElementById("mov-cantidad").value),
      });
      showAlert(res?.message || `Movimiento de ${tipo} registrado.`);
      await cargarTodo();
    } catch (err) {
      showAlert(err.message);
    }
  });

  // Submit nuevo producto
  document.getElementById("form-producto").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const tipo = document.getElementById("prod-subtipo").value;
      const res = await window.dbClient.crearProducto({
        sku: document.getElementById("prod-sku").value.trim(),
        nombre: document.getElementById("prod-nombre").value.trim(),
        id_categoria: Number(document.getElementById("prod-categoria").value),
        largo_cm: Number(document.getElementById("prod-largo").value),
        ancho_cm: Number(document.getElementById("prod-ancho").value),
        alto_cm: Number(document.getElementById("prod-alto").value),
        peso_kg: Number(document.getElementById("prod-peso").value),
        tipo,
        material_fabricacion: document.getElementById("prod-material").value.trim() || "Estándar",
        fragil: document.getElementById("prod-fragil").checked,
        volumen_mililitros: Number(document.getElementById("prod-volumen").value),
        nivel_inflamabilidad: Number(document.getElementById("prod-inflamabilidad").value),
        requiere_refrigeracion: document.getElementById("prod-refrigeracion").checked,
      });
      showAlert(res?.message || "Producto registrado.");
      e.target.reset();
      document.getElementById("campos-solida").classList.remove("hidden");
      document.getElementById("campos-fluido").classList.add("hidden");
      await cargarTodo();
    } catch (err) {
      showAlert(err.message);
    }
  });

  // Submit nueva orden
  document.getElementById("form-orden").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const res = await window.dbClient.crearOrden({
        id_orden: Number(document.getElementById("ord-id").value),
        id_empleado: Number(document.getElementById("ord-empleado").value),
        sku: document.getElementById("ord-sku").value,
        cantidad_pedida: Number(document.getElementById("ord-cantidad").value),
      });
      showAlert(res?.message || "Orden de salida asignada correctamente.");
      await cargarTodo();
    } catch (err) {
      showAlert(err.message);
    }
  });
});