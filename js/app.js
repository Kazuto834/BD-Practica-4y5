let cacheInventario = [];
let cacheEmpleados = [];

function showAlert(msg) {
  const box = document.getElementById("alert-box");
  box.textContent = msg;
  box.classList.remove("hidden");
  setTimeout(() => box.classList.add("hidden"), 4500);
}

function campoPasswordHTML({
  id,
  autocomplete = "current-password",
  placeholder = "",
  minlength = null,
  required = true,
}) {
  const minAttr = minlength ? `minlength="${minlength}"` : "";
  const reqAttr = required ? "required" : "";
  const phAttr = placeholder ? `placeholder="${placeholder}"` : "";
  return `
    <div class="password-wrap">
      <input type="password" id="${id}" autocomplete="${autocomplete}" ${phAttr} ${minAttr} ${reqAttr} />
      <button type="button" class="btn-toggle-pass" data-target="${id}" aria-label="Mostrar u ocultar contraseña">
        Mostrar
      </button>
    </div>`;
}

function setupPasswordToggles() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-toggle-pass");
    if (!btn) return;
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;

    const ocultar = input.type === "text";
    input.type = ocultar ? "password" : "text";
    btn.textContent = ocultar ? "Mostrar" : "Ocultar";
  });
}

function activarTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.classList.toggle("active", p.id === `tab-${tabName}`);
  });
}

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => activarTab(btn.dataset.tab));
  });
}

async function evaluarEstadoAcceso() {
  const gate = document.getElementById("gate-acceso-operativo");
  const workspace = document.getElementById("workspace-operativo");
  const btnHeader = document.getElementById("btn-sesion-header");

  if (!window.dbClient.isPostgres) {
    gate.innerHTML = "";
    workspace.classList.remove("hidden");
    btnHeader.classList.add("hidden");
    await cargarTodo();
    return;
  }

  if (!window.dbClient.isAuthenticated()) {
    workspace.classList.add("hidden");
    btnHeader.classList.add("hidden");
    gate.innerHTML = `
      <div class="card card-industrial" style="max-width: 460px; margin: 2rem auto;">
        <h2>Acceso Restringido — Personal Autorizado</h2>
        <p style="color: var(--muted); font-size: 0.9rem; margin-bottom: 1rem;">
          Ingresa tu correo y contraseña asignados para consultar el inventario y registrar movimientos en bodega.
        </p>
        <form id="form-login-general" class="grid-form" style="grid-template-columns: 1fr;">
          <label>
            Correo de acceso
            <input type="email" id="login-email" autocomplete="username" required />
          </label>
          <label>
            Contraseña
            ${campoPasswordHTML({ id: "login-password", autocomplete: "current-password" })}
          </label>
          <button type="submit" class="btn-primary">Ingresar al Almacén</button>
        </form>
      </div>`;

    document.getElementById("form-login-general").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const res = await window.dbClient.login(
          document.getElementById("login-email").value,
          document.getElementById("login-password").value
        );
        showAlert(`Bienvenido, ${res.nombre}.`);
        await evaluarEstadoAcceso();
      } catch (err) {
        showAlert(err.message);
      }
    });
    return;
  }

  gate.innerHTML = "";
  workspace.classList.remove("hidden");
  btnHeader.classList.remove("hidden");
  btnHeader.textContent = `Cerrar Sesión (${window.dbClient.userName})`;
  await cargarTodo();
}

function renderControlExportacionPDF() {
  const zonaPdf = document.getElementById("zona-exportacion-pdf");
  if (!zonaPdf) return;

  if (!window.dbClient.isPostgres) {
    zonaPdf.innerHTML = `<span class="status-badge status-static">PDF bloqueado en modo estático</span>`;
    return;
  }

  if (!window.dbClient.isAdmin()) {
    zonaPdf.innerHTML = `<span class="status-badge status-static">PDF exclusivo de Administrador</span>`;
    return;
  }

  zonaPdf.innerHTML = `<button type="button" id="btn-descargar-pdf" class="btn-primary">Descargar Reportes en PDF</button>`;
  document.getElementById("btn-descargar-pdf").addEventListener("click", descargarReportesPDF);
}

window.seleccionarEmpleadoCredenciales = (idEmpleado) => {
  const select = document.getElementById("cred-emp-id");
  const emailInput = document.getElementById("cred-emp-email");
  const passInput = document.getElementById("cred-emp-password");
  if (!select || !emailInput) return;

  select.value = String(idEmpleado);
  const emp = cacheEmpleados.find((e) => Number(e.id_empleado) === Number(idEmpleado));
  emailInput.value = emp && emp.correo_acceso ? emp.correo_acceso : "";
  if (passInput) {
    passInput.value = "";
    passInput.type = "password";
    const toggleBtn = document.querySelector(`.btn-toggle-pass[data-target="cred-emp-password"]`);
    if (toggleBtn) toggleBtn.textContent = "Mostrar";

    passInput.placeholder = emp && emp.correo_acceso
      ? "Dejar vacío para conservar clave actual"
      : "Asigna una contraseña (mín. 4 caracteres)";
    passInput.required = !(emp && emp.correo_acceso);
  }
  select.scrollIntoView({ behavior: "smooth", block: "center" });
  emailInput.focus();
};

function renderSeccionPersonal() {
  const contenedor = document.getElementById("zona-personal-protegida");
  if (!contenedor) return;

  renderControlExportacionPDF();

  if (!window.dbClient.isPostgres) {
    contenedor.innerHTML = `
      <div class="card">
        <h2>Acceso Restringido (Solo Servidor Activo)</h2>
        <p style="color: var(--muted);">
          La gestión de personal, credenciales y reportes PDF está bloqueada en modo estático.
        </p>
      </div>`;
    return;
  }

  if (!window.dbClient.isAdmin()) {
    const puedeCambiarClave = window.dbClient.idEmpleado !== null;

    contenedor.innerHTML = `
      <div class="grid-2">
        <div class="card card-industrial">
          <h2>Mi Cuenta Operativa</h2>
          <p style="color: var(--muted); font-size: 0.9rem; margin-bottom: 1rem;">
            Conectado como: <strong>${window.dbClient.userName}</strong> (${window.dbClient.userEmail})
          </p>
          ${
            puedeCambiarClave
              ? `
              <form id="form-cambiar-mi-clave" class="grid-form" style="grid-template-columns: 1fr;">
                <label>
                  Contraseña Actual
                  ${campoPasswordHTML({ id: "mi-pass-actual", autocomplete: "current-password" })}
                </label>
                <label>
                  Nueva Contraseña
                  ${campoPasswordHTML({ id: "mi-pass-nueva", autocomplete: "new-password", minlength: 4 })}
                </label>
                <button type="submit" class="btn-primary">Actualizar Mi Contraseña</button>
              </form>`
              : `<p style="color: var(--muted); font-size: 0.85rem;">Cuenta operativa general definida en el servidor.</p>`
          }
        </div>

        <div class="card">
          <h2>Escalar a Administrador</h2>
          <p style="color: var(--muted); font-size: 0.9rem; margin-bottom: 1rem;">
            Inicia sesión con la cuenta de Administrador para registrar trabajadores, asignar correos/contraseñas o descargar PDFs:
          </p>
          <form id="form-admin-login" class="grid-form" style="grid-template-columns: 1fr;">
            <label>
              Correo de Administrador
              <input type="email" id="admin-email" autocomplete="username" required />
            </label>
            <label>
              Contraseña de Administrador
              ${campoPasswordHTML({ id: "admin-password", autocomplete: "current-password" })}
            </label>
            <button type="submit" class="btn-primary">Autenticar como Administrador</button>
          </form>
        </div>
      </div>`;

    if (puedeCambiarClave) {
      document.getElementById("form-cambiar-mi-clave").addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
          const res = await window.dbClient.cambiarMiPassword(
            document.getElementById("mi-pass-actual").value,
            document.getElementById("mi-pass-nueva").value
          );
          showAlert(res.message);
          e.target.reset();
        } catch (err) {
          showAlert(err.message);
        }
      });
    }

    document.getElementById("form-admin-login").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await window.dbClient.login(
          document.getElementById("admin-email").value,
          document.getElementById("admin-password").value
        );
        if (!window.dbClient.isAdmin()) {
          showAlert("Esa cuenta corresponde a Empleado, no a Administrador.");
          return;
        }
        showAlert("Privilegios de Administrador activados.");
        await evaluarEstadoAcceso();
      } catch (err) {
        showAlert(err.message);
      }
    });
    return;
  }

  const nextEmpId = cacheEmpleados.reduce((max, emp) => Math.max(max, Number(emp.id_empleado)), 100) + 1;
  const primerEmp = cacheEmpleados[0];

  contenedor.innerHTML = `
    <div class="card card-industrial">
      <div class="card-header">
        <div>
          <h2>1. Registrar Nuevo Trabajador con Credenciales</h2>
          <span style="color: var(--muted); font-size: 0.85rem;">Sesión Admin activa: ${window.dbClient.userEmail}</span>
        </div>
      </div>
      <form id="form-empleado" class="grid-form">
        <label>ID Empleado <input type="number" id="emp-id" value="${nextEmpId}" required /></label>
        <label>Nombre Completo <input type="text" id="emp-nombre" placeholder="Ej. Ana Torres" required /></label>
        <label>
          Turno
          <select id="emp-turno" required>
            <option value="Matutino">Matutino</option>
            <option value="Vespertino">Vespertino</option>
            <option value="Nocturno">Nocturno</option>
          </select>
        </label>
        <label>Correo de Acceso <input type="email" id="emp-email" placeholder="ana.torres@elpiston.mx" required /></label>
        <label>
          Contraseña Inicial
          ${campoPasswordHTML({
            id: "emp-password",
            autocomplete: "new-password",
            placeholder: "Mínimo 4 caracteres",
            minlength: 4,
          })}
        </label>
        <label class="checkbox-label">
          <input type="checkbox" id="emp-montacargas" /> Certificación Montacargas
        </label>
        <button type="submit" class="btn-primary">Registrar Trabajador</button>
      </form>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <h2>2. Asignar Acceso o Cambiar Contraseña a Empleado Existente</h2>
          <span style="color: var(--muted); font-size: 0.85rem;">
            Selecciona un trabajador ya registrado para asignarle correo/clave o restablecer su contraseña
          </span>
        </div>
      </div>
      <form id="form-credenciales-existentes" class="grid-form">
        <label>
          Trabajador Registrado
          <select id="cred-emp-id" required>
            ${cacheEmpleados
              .map(
                (emp) =>
                  `<option value="${emp.id_empleado}">#${emp.id_empleado} — ${emp.nombre} (${emp.turno})</option>`
              )
              .join("")}
          </select>
        </label>
        <label>
          Correo de Acceso
          <input type="email" id="cred-emp-email" value="${primerEmp && primerEmp.correo_acceso ? primerEmp.correo_acceso : ""}" placeholder="empleado@elpiston.mx" required />
        </label>
        <label>
          Nueva Contraseña
          ${campoPasswordHTML({
            id: "cred-emp-password",
            autocomplete: "new-password",
            placeholder:
              primerEmp && primerEmp.correo_acceso
                ? "Dejar vacío para conservar clave actual"
                : "Asigna una contraseña (mín. 4 caracteres)",
            minlength: 4,
            required: !(primerEmp && primerEmp.correo_acceso),
          })}
        </label>
        <button type="submit" class="btn-primary">Guardar Credenciales</button>
      </form>
    </div>

    <div class="card">
      <h2>Personal Registrado en Base de Datos</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>Turno</th>
              <th>Correo de Acceso</th>
              <th>Montacargas</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            ${cacheEmpleados
              .map(
                (emp) => `
              <tr>
                <td><strong>${emp.id_empleado}</strong></td>
                <td>${emp.nombre}</td>
                <td>${emp.turno}</td>
                <td>${emp.correo_acceso || "<span class='badge-warn'>Sin acceso web</span>"}</td>
                <td>${emp.certificacion_montacargas ? "Sí (Certificado)" : "No"}</td>
                <td>
                  <button type="button" class="btn-small" onclick="seleccionarEmpleadoCredenciales(${emp.id_empleado})">
                    ${emp.correo_acceso ? "Editar / Clave" : "Asignar Acceso"}
                  </button>
                </td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>`;

  document.getElementById("cred-emp-id").addEventListener("change", (e) => {
    window.seleccionarEmpleadoCredenciales(Number(e.target.value));
  });

  document.getElementById("form-empleado").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const res = await window.dbClient.crearEmpleado({
        id_empleado: Number(document.getElementById("emp-id").value),
        nombre: document.getElementById("emp-nombre").value.trim(),
        turno: document.getElementById("emp-turno").value,
        email: document.getElementById("emp-email").value.trim(),
        password: document.getElementById("emp-password").value,
        certificacion_montacargas: document.getElementById("emp-montacargas").checked,
      });
      showAlert(res.message);
      await cargarTodo();
    } catch (err) {
      showAlert(err.message);
      await evaluarEstadoAcceso();
    }
  });

  document.getElementById("form-credenciales-existentes").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const idEmp = Number(document.getElementById("cred-emp-id").value);
      const email = document.getElementById("cred-emp-email").value.trim();
      const password = document.getElementById("cred-emp-password").value;
      const res = await window.dbClient.guardarCredencialesEmpleado(idEmp, {
        email,
        password: password || null,
      });
      showAlert(res.message);
      await cargarTodo();
    } catch (err) {
      showAlert(err.message);
      await evaluarEstadoAcceso();
    }
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
        <td><strong class="coord-tag">${i.zona}-${i.pasillo}-${i.rack}-${i.nivel}</strong></td>
        <td>${i.tipo_almacenaje}</td>
        <td><strong>${i.sku}</strong></td>
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
          <td><strong class="coord-tag">${p.sku}</strong></td>
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
        <td><strong>#${o.id_orden}</strong></td>
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
  document.getElementById("rep-stock").innerHTML =
    reportes.stock_por_ubicacion.length === 0
      ? `<tr><td colspan="5">Sin stock registrado</td></tr>`
      : reportes.stock_por_ubicacion
          .map(
            (r) => `
            <tr>
              <td><strong class="coord-tag">${r.zona}-${r.pasillo}-${r.rack}-${r.nivel}</strong></td>
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
              <td><strong class="coord-tag">${u.zona}-${u.pasillo}-${u.rack}-${u.nivel}</strong></td>
              <td>${u.tipo_almacenaje}</td>
              <td>${u.capacidad_peso_kg} kg</td>
            </tr>`
          )
          .join("");
}

async function descargarReportesPDF() {
  if (!window.dbClient.isAdmin()) {
    showAlert("Bloqueado: inicia sesión como administrador para descargar reportes en PDF.");
    return;
  }

  try {
    const reportesCertificados = await window.dbClient.getReportesCertificadosPDF();

    if (!window.jspdf || !window.jspdf.jsPDF) {
      window.print();
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
    const fechaStr = new Date().toLocaleString("es-MX");

    doc.setFillColor(24, 24, 27);
    doc.rect(0, 0, 216, 30, "F");
    doc.setFillColor(245, 158, 11);
    doc.rect(0, 28, 216, 2, "F");

    doc.setTextColor(251, 191, 36);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Almacenes El Pistón — Reportes Gerenciales", 14, 12);

    doc.setTextColor(228, 228, 231);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Generado: ${fechaStr} | Autorizado por: ${reportesCertificados.autorizado_por}`, 14, 19);
    doc.text("Fuente: Base de Datos PostgreSQL 16 (Servidor Verificado)", 14, 24);

    let yPos = 38;

    doc.setTextColor(24, 24, 27);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("1. Stock y Carga por Ubicación", 14, yPos);

    const filasStock =
      reportesCertificados.stock_por_ubicacion.length > 0
        ? reportesCertificados.stock_por_ubicacion.map((r) => [
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
      headStyles: { fillColor: [39, 39, 42], textColor: [251, 191, 36], fontSize: 9 },
      bodyStyles: { fontSize: 8.5, textColor: [24, 24, 27] },
      margin: { left: 14, right: 14 },
    });

    yPos = doc.lastAutoTable.finalY + 10;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("2. Eficiencia de Recolección por Empleado", 14, yPos);

    const filasEficiencia = reportesCertificados.eficiencia_recoleccion.map((e) => [
      e.nombre,
      e.turno,
      `${e.ordenes_completadas} / ${e.ordenes_asignadas}`,
    ]);

    doc.autoTable({
      startY: yPos + 3,
      head: [["Empleado", "Turno", "Órdenes Completadas / Asignadas"]],
      body: filasEficiencia,
      theme: "grid",
      headStyles: { fillColor: [39, 39, 42], textColor: [251, 191, 36], fontSize: 9 },
      bodyStyles: { fontSize: 8.5, textColor: [24, 24, 27] },
      margin: { left: 14, right: 14 },
    });

    yPos = doc.lastAutoTable.finalY + 10;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("3. Ubicaciones Vacías Disponibles", 14, yPos);

    const filasVacias =
      reportesCertificados.ubicaciones_vacias.length > 0
        ? reportesCertificados.ubicaciones_vacias.map((u) => [
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
      headStyles: { fillColor: [39, 39, 42], textColor: [251, 191, 36], fontSize: 9 },
      bodyStyles: { fontSize: 8.5, textColor: [24, 24, 27] },
      margin: { left: 14, right: 14 },
    });

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(113, 113, 122);
      doc.text(
        `Almacenes El Pistón — Sistema de Gestión Logística | Página ${i} de ${totalPages}`,
        14,
        270
      );
    }

    const fechaArchivo = new Date().toISOString().slice(0, 10);
    doc.save(`Reporte_Almacen_El_Piston_${fechaArchivo}.pdf`);
    showAlert("Reporte gerencial descargado en formato PDF.");
  } catch (err) {
    showAlert(err.message);
    await evaluarEstadoAcceso();
  }
}

async function cargarTodo() {
  try {
    const [catalogos, productos, inventario, ordenes, reportes] = await Promise.all([
      window.dbClient.getCatalogos(),
      window.dbClient.getProductos(),
      window.dbClient.getInventario(),
      window.dbClient.getOrdenes(),
      window.dbClient.getReportes(),
    ]);

    cacheInventario = inventario;
    cacheEmpleados = catalogos.empleados;

    const skuOptions = productos.map((p) => `<option value="${p.sku}">${p.sku} — ${p.nombre}</option>`).join("");
    document.getElementById("mov-sku").innerHTML = skuOptions;
    document.getElementById("ord-sku").innerHTML = skuOptions;

    document.getElementById("mov-ubicacion").innerHTML = catalogos.ubicaciones
      .map((u) => `<option value="${u.id_ubicacion}">${u.zona}-${u.pasillo}-${u.rack}-${u.nivel} (${u.tipo_almacenaje})</option>`)
      .join("");

    document.getElementById("prod-categoria").innerHTML = catalogos.categorias
      .map((c) => `<option value="${c.id_categoria}">${c.nombre}</option>`)
      .join("");

    const selectEmpleado = document.getElementById("ord-empleado");
    if (window.dbClient.isPostgres && window.dbClient.idEmpleado !== null) {
      const empActivo = catalogos.empleados.find(
        (e) => Number(e.id_empleado) === Number(window.dbClient.idEmpleado)
      );
      if (empActivo) {
        selectEmpleado.innerHTML = `<option value="${empActivo.id_empleado}">${empActivo.nombre} (${empActivo.turno}) — Sesión Activa</option>`;
        selectEmpleado.disabled = true;
      }
    } else {
      selectEmpleado.disabled = false;
      selectEmpleado.innerHTML = catalogos.empleados
        .map((e) => `<option value="${e.id_empleado}">${e.nombre} (${e.turno})</option>`)
        .join("");
    }

    const maxOrden = ordenes.reduce((max, o) => Math.max(max, Number(o.id_orden)), 5000);
    document.getElementById("ord-id").value = maxOrden + 1;

    aplicarFiltroInventario();
    renderProductos(productos);
    renderOrdenes(ordenes);
    renderReportes(reportes);
    renderSeccionPersonal();
  } catch (err) {
    showAlert(err.message);
    await evaluarEstadoAcceso();
  }
}

window.completarOrdenUI = async (idOrden) => {
  try {
    const res = await window.dbClient.completarOrden(idOrden);
    showAlert(res?.message || `Orden #${idOrden} marcada como Completada.`);
    await cargarTodo();
  } catch (err) {
    showAlert(err.message);
    await evaluarEstadoAcceso();
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  setupPasswordToggles();
  await window.dbClient.init();
  await evaluarEstadoAcceso();

  document.getElementById("btn-sesion-header").addEventListener("click", async () => {
    window.dbClient.logout();
    showAlert("Sesión cerrada correctamente.");
    await evaluarEstadoAcceso();
  });

  document.getElementById("buscar-inventario").addEventListener("input", aplicarFiltroInventario);

  document.getElementById("prod-subtipo").addEventListener("change", (e) => {
    const esSolida = e.target.value === "solida";
    document.getElementById("campos-solida").classList.toggle("hidden", !esSolida);
    document.getElementById("campos-fluido").classList.toggle("hidden", esSolida);
  });

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
      await evaluarEstadoAcceso();
    }
  });

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
      await evaluarEstadoAcceso();
    }
  });

  document.getElementById("form-orden").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const idEmp =
        window.dbClient.isPostgres && window.dbClient.idEmpleado !== null
          ? Number(window.dbClient.idEmpleado)
          : Number(document.getElementById("ord-empleado").value);

      const res = await window.dbClient.crearOrden({
        id_orden: Number(document.getElementById("ord-id").value),
        id_empleado: idEmp,
        sku: document.getElementById("ord-sku").value,
        cantidad_pedida: Number(document.getElementById("ord-cantidad").value),
      });
      showAlert(res?.message || "Orden de salida asignada correctamente.");
      await cargarTodo();
    } catch (err) {
      showAlert(err.message);
      await evaluarEstadoAcceso();
    }
  });
});