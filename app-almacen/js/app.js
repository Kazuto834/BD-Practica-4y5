// ============================================================================
// app.js
// Controlador Principal de Interfaz — Almacenes El Pistón
// Gestiona pestañas, autenticación, filtros múltiples, combobox buscables,
// tablas de inventario/catálogo/órdenes, reportes gerenciales y PDF offline.
// ============================================================================

// ============================================================================
// 1. Estado Global en Memoria y Cachés de Tablas
// ============================================================================

let cacheInventario = [];
let cacheProductos = [];
let cacheOrdenes = [];
let cacheEmpleados = [];
let cacheReportes = {
  stock_por_ubicacion: [],
  eficiencia_recoleccion: [],
  ubicaciones_vacias: [],
};
let cacheReportesFiltrados = {
  stock_por_ubicacion: [],
  eficiencia_recoleccion: [],
  ubicaciones_vacias: [],
};

let reporteActivoTab = "stock"; // "stock" | "eficiencia" | "capacidad"
const filtrosMultiples = {};
const selectComboboxRegistry = new Map();

// ============================================================================
// 2. Utilidades de Búsqueda Ortográfica y Componentes de Filtrado
// ============================================================================

function configurarCierreMenusDesplegables() {
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".ms-dropdown")) {
      document.querySelectorAll(".ms-menu").forEach((m) => m.classList.add("hidden"));
    }
    if (!e.target.closest(".ss-combobox")) {
      document.querySelectorAll(".ss-menu").forEach((m) => m.classList.add("hidden"));
    }
  });
}

function normalizarOrtografia(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Coincidencia insensible a mayúsculas y acentos, respetando el orden secuencial
 * de los tokens escritos por el usuario.
 */
function coincideBusquedaEstricta(query, camposTexto) {
  const qNorm = normalizarOrtografia(query);
  if (!qNorm) return true;

  const queryTokens = qNorm.match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || [];
  if (queryTokens.length === 0) return true;

  const targetSegments = [];
  for (const campo of camposTexto) {
    const cNorm = normalizarOrtografia(campo);
    const rawTokens = cNorm.match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || [];
    for (const tok of rawTokens) {
      if (tok.includes("-")) {
        targetSegments.push(...tok.split("-"));
      } else {
        targetSegments.push(tok);
      }
    }
  }

  let cursor = 0;
  for (const qTok of queryTokens) {
    if (qTok.includes("-")) {
      const subParts = qTok.split("-").filter(Boolean);
      let chainMatchIdx = -1;

      for (let start = cursor; start <= targetSegments.length - subParts.length; start++) {
        let allMatch = true;
        for (let k = 0; k < subParts.length; k++) {
          const seg = targetSegments[start + k];
          const qPart = subParts[k];
          const isLast = k === subParts.length - 1;
          const ok = isLast ? seg.startsWith(qPart) : seg === qPart;
          if (!ok) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) {
          chainMatchIdx = start + subParts.length;
          break;
        }
      }

      if (chainMatchIdx === -1) return false;
      cursor = chainMatchIdx;
    } else {
      let foundIdx = -1;
      for (let i = cursor; i < targetSegments.length; i++) {
        if (targetSegments[i].startsWith(qTok)) {
          foundIdx = i;
          break;
        }
      }
      if (foundIdx === -1) return false;
      cursor = foundIdx + 1;
    }
  }

  return true;
}

function obtenerSeleccionMultiple(key) {
  if (!filtrosMultiples[key]) {
    filtrosMultiples[key] = new Set();
  }
  return filtrosMultiples[key];
}

function pasaFiltroMultiple(key, valor) {
  const sel = obtenerSeleccionMultiple(key);
  if (sel.size === 0) return true;
  return sel.has(String(valor ?? ""));
}

/**
 * Construye o actualiza un menú desplegable con selección múltiple y buscador interno.
 */
function sincronizarMultiSelect({ container, key, etiqueta, opciones, onChange }) {
  const seleccion = obtenerSeleccionMultiple(key);
  const opcionesUnicas = [...new Set(opciones.map((o) => String(o)).filter((o) => o !== ""))];

  for (const val of [...seleccion]) {
    if (!opcionesUnicas.includes(val)) {
      seleccion.delete(val);
    }
  }

  let dropdown = container.querySelector(`.ms-dropdown[data-filter-key="${key}"]`);
  const estabaAbierto = dropdown ? !dropdown.querySelector(".ms-menu").classList.contains("hidden") : false;
  const textoBusquedaPrevio = dropdown ? (dropdown.querySelector(".ms-search-input")?.value || "") : "";

  if (!dropdown) {
    dropdown = document.createElement("div");
    dropdown.className = "ms-dropdown";
    dropdown.dataset.filterKey = key;
    container.appendChild(dropdown);
  }

  const resumen =
    seleccion.size === 0
      ? `${etiqueta}: Todos (${opcionesUnicas.length})`
      : `${etiqueta}: ${seleccion.size} selec. (${[...seleccion].slice(0, 2).join(", ")}${seleccion.size > 2 ? "..." : ""})`;

  dropdown.innerHTML = `
    <button type="button" class="ms-trigger ${seleccion.size > 0 ? "ms-active" : ""}" title="${resumen}">
      <span class="ms-trigger-text">${resumen}</span>
      <span>▾</span>
    </button>
    <div class="ms-menu ${estabaAbierto ? "" : "hidden"}">
      <input type="search" class="ms-search-input" placeholder="Escribir en orden..." value="${textoBusquedaPrevio.replace(/"/g, "&quot;")}" autocomplete="off" />
      <div class="ms-actions">
        <button type="button" class="ms-action-btn" data-action="all">Marcar visibles</button>
        <button type="button" class="ms-action-btn" data-action="clear">Limpiar</button>
      </div>
      <div class="ms-options-list"></div>
    </div>
  `;

  const trigger = dropdown.querySelector(".ms-trigger");
  const menu = dropdown.querySelector(".ms-menu");
  const searchInput = dropdown.querySelector(".ms-search-input");
  const list = dropdown.querySelector(".ms-options-list");

  function renderOpcionesInternas() {
    const q = searchInput.value;
    const visibles = opcionesUnicas.filter((op) => coincideBusquedaEstricta(q, [op]));
    list.innerHTML = "";

    if (visibles.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ms-empty-msg";
      empty.textContent = "Sin coincidencias en ese orden";
      list.appendChild(empty);
      return;
    }

    visibles.forEach((op) => {
      const label = document.createElement("label");
      label.className = "ms-option";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = seleccion.has(op);
      cb.addEventListener("change", () => {
        if (cb.checked) seleccion.add(op);
        else seleccion.delete(op);
        sincronizarMultiSelect({ container, key, etiqueta, opciones: opcionesUnicas, onChange });
        onChange();
      });
      const span = document.createElement("span");
      span.textContent = op;
      label.appendChild(cb);
      label.appendChild(span);
      list.appendChild(label);
    });
  }

  renderOpcionesInternas();

  searchInput.addEventListener("click", (e) => e.stopPropagation());
  searchInput.addEventListener("input", renderOpcionesInternas);

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const abrir = menu.classList.contains("hidden");
    document.querySelectorAll(".ms-menu, .ss-menu").forEach((m) => m.classList.add("hidden"));
    if (abrir) {
      menu.classList.remove("hidden");
      searchInput.focus();
    }
  });

  dropdown.querySelector('[data-action="all"]').addEventListener("click", (e) => {
    e.stopPropagation();
    const q = searchInput.value;
    const visibles = opcionesUnicas.filter((op) => coincideBusquedaEstricta(q, [op]));
    visibles.forEach((op) => seleccion.add(op));
    sincronizarMultiSelect({ container, key, etiqueta, opciones: opcionesUnicas, onChange });
    onChange();
  });

  dropdown.querySelector('[data-action="clear"]').addEventListener("click", (e) => {
    e.stopPropagation();
    seleccion.clear();
    sincronizarMultiSelect({ container, key, etiqueta, opciones: opcionesUnicas, onChange });
    onChange();
  });
}

/**
 * Convierte un <select> HTML nativo en un combobox buscable con validación estricta.
 */
function sincronizarSelectBuscable(selectId, placeholder = "Escribe o elige una opción...") {
  const select = document.getElementById(selectId);
  if (!select) return;

  let wrapper = selectComboboxRegistry.get(selectId);
  if (!wrapper || !document.body.contains(wrapper)) {
    wrapper = document.createElement("div");
    wrapper.className = "ss-combobox";
    wrapper.innerHTML = `
      <div class="ss-input-wrap">
        <input type="text" class="ss-input" placeholder="${placeholder}" autocomplete="off" />
        <span class="ss-caret">▾</span>
      </div>
      <div class="ss-menu hidden">
        <div class="ss-options-list"></div>
      </div>
    `;
    select.style.display = "none";
    select.parentElement.insertBefore(wrapper, select.nextSibling);
    selectComboboxRegistry.set(selectId, wrapper);

    const input = wrapper.querySelector(".ss-input");
    const menu = wrapper.querySelector(".ss-menu");
    const list = wrapper.querySelector(".ss-options-list");

    const obtenerOpcionesSelect = () =>
      Array.from(select.options).map((opt) => ({
        value: opt.value,
        text: opt.textContent,
      }));

    const sincronizarTextoDesdeSelect = () => {
      const selOpt = select.options[select.selectedIndex];
      input.value = selOpt ? selOpt.textContent : "";
      input.disabled = select.disabled;
      input.classList.remove("ss-unconfirmed");
      input.setCustomValidity("");
    };

    const renderLista = (filtrar = true) => {
      const opciones = obtenerOpcionesSelect();
      const q = filtrar ? input.value : "";
      const visibles = opciones.filter((o) => coincideBusquedaEstricta(q, [o.text, o.value]));
      list.innerHTML = "";

      if (visibles.length === 0) {
        const empty = document.createElement("div");
        empty.className = "ms-empty-msg";
        empty.textContent = "Sin coincidencias — elige una opción de la lista";
        list.appendChild(empty);
        return;
      }

      visibles.forEach((op) => {
        const item = document.createElement("div");
        item.className = `ss-item ${op.value === select.value ? "ss-selected" : ""}`;
        item.textContent = op.text;
        item.addEventListener("mousedown", (e) => {
          e.preventDefault();
          select.value = op.value;
          input.value = op.text;
          input.classList.remove("ss-unconfirmed");
          input.setCustomValidity("");
          menu.classList.add("hidden");
          select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        list.appendChild(item);
      });
    };

    input.addEventListener("focus", () => {
      if (select.disabled) return;
      document.querySelectorAll(".ms-menu, .ss-menu").forEach((m) => m.classList.add("hidden"));
      input.select();
      renderLista(false);
      menu.classList.remove("hidden");
    });

    input.addEventListener("input", () => {
      if (select.disabled) return;
      const selOpt = select.options[select.selectedIndex];
      const confirmado = selOpt && selOpt.textContent === input.value;
      input.classList.toggle("ss-unconfirmed", !confirmado);
      input.setCustomValidity(confirmado ? "" : "Debes seleccionar una opción válida de la lista.");
      renderLista(true);
      menu.classList.remove("hidden");
    });

    input.addEventListener("blur", () => {
      setTimeout(() => {
        menu.classList.add("hidden");
        sincronizarTextoDesdeSelect();
      }, 140);
    });

    wrapper._refresh = sincronizarTextoDesdeSelect;
  }

  if (wrapper._refresh) {
    wrapper._refresh();
  }
}

function asegurarBarraFiltrosTabla(tbodyId, toolbarId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return null;

  let toolbar = document.getElementById(toolbarId);
  if (!toolbar) {
    const tableWrap = tbody.closest(".table-wrap") || tbody.closest("table");
    if (!tableWrap || !tableWrap.parentElement) return null;
    toolbar = document.createElement("div");
    toolbar.id = toolbarId;
    toolbar.className = "filter-toolbar";
    tableWrap.parentElement.insertBefore(toolbar, tableWrap);
  }
  return toolbar;
}

// ============================================================================
// 3. Notificaciones, Campos de Contraseña y Control de Pestañas
// ============================================================================

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

// ============================================================================
// 4. Control de Acceso Operativo y Sesión
// ============================================================================

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

  const titulosBoton = {
    stock: "Descargar PDF: Stock y Carga",
    eficiencia: "Descargar PDF: Eficiencia de Recolección",
    capacidad: "Descargar PDF: Capacidad de Racks",
  };

  zonaPdf.innerHTML = `<button type="button" id="btn-descargar-pdf" class="btn-primary">${titulosBoton[reporteActivoTab] || "Descargar Reporte en PDF"}</button>`;
  document.getElementById("btn-descargar-pdf").addEventListener("click", descargarReportesPDF);
}

// ============================================================================
// 5. Pestaña 5: Gestión de Personal, Credenciales y Roles
// ============================================================================

window.seleccionarEmpleadoCredenciales = (idEmpleado) => {
  const select = document.getElementById("cred-emp-id");
  const emailInput = document.getElementById("cred-emp-email");
  const passInput = document.getElementById("cred-emp-password");
  const rolSelect = document.getElementById("cred-emp-rol");
  if (!select || !emailInput) return;

  select.value = String(idEmpleado);
  sincronizarSelectBuscable("cred-emp-id");
  const emp = cacheEmpleados.find((e) => Number(e.id_empleado) === Number(idEmpleado));
  emailInput.value = emp && emp.correo_acceso ? emp.correo_acceso : "";
  if (rolSelect) {
    rolSelect.value = (emp && (emp.rol_acceso === "admin" || emp.rol === "admin")) ? "admin" : "empleado";
  }
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
  const combobox = selectComboboxRegistry.get("cred-emp-id");
  (combobox || select).scrollIntoView({ behavior: "smooth", block: "center" });
  emailInput.focus();
};

window.cambiarRolPersonal = async (idEmpleado, nuevoRol) => {
  try {
    const res = await window.dbClient.asignarRolEmpleado(idEmpleado, nuevoRol);
    showAlert(res.message);
    await cargarTodo();
  } catch (err) {
    showAlert(err.message);
  }
};

function renderTablaPersonal(lista) {
  const tbody = document.getElementById("tabla-personal");
  if (!tbody) return;

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7">Sin trabajadores que coincidan con los filtros seleccionados</td></tr>`;
    return;
  }

  tbody.innerHTML = lista
    .map((emp) => {
      const esAdmin = (emp.rol_acceso === "admin" || emp.rol === "admin");
      const badgeRol = emp.correo_acceso
        ? (esAdmin ? '<span class="badge-success">Administrador</span>' : '<span class="badge-neutral">Personal Operativo</span>')
        : '<span class="badge-warn">Sin acceso web</span>';

      return `
      <tr>
        <td><strong>${emp.id_empleado}</strong></td>
        <td>${emp.nombre}</td>
        <td>${emp.turno}</td>
        <td>${emp.correo_acceso || "<span class='badge-warn'>Sin acceso web</span>"}</td>
        <td>${badgeRol}</td>
        <td>${emp.certificacion_montacargas ? "Sí (Certificado)" : "No"}</td>
        <td>
          <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
            <button type="button" class="btn-small" onclick="seleccionarEmpleadoCredenciales(${emp.id_empleado})">
              ${emp.correo_acceso ? "Editar / Clave" : "Asignar Acceso"}
            </button>
            ${
              emp.correo_acceso
                ? esAdmin
                  ? `<button type="button" class="btn-small btn-secondary" onclick="cambiarRolPersonal(${emp.id_empleado}, 'empleado')">Hacer Operativo</button>`
                  : `<button type="button" class="btn-small btn-primary" onclick="cambiarRolPersonal(${emp.id_empleado}, 'admin')">Promover a Admin</button>`
                : ""
            }
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

function aplicarFiltroPersonal() {
  const toolbar = asegurarBarraFiltrosTabla("tabla-personal", "filtros-personal-toolbar");
  if (toolbar) {
    sincronizarMultiSelect({
      container: toolbar,
      key: "pers_turno",
      etiqueta: "Turno",
      opciones: cacheEmpleados.map((e) => e.turno),
      onChange: aplicarFiltroPersonal,
    });
    sincronizarMultiSelect({
      container: toolbar,
      key: "pers_rol",
      etiqueta: "Rol",
      opciones: cacheEmpleados.map((e) => (e.rol_acceso === "admin" || e.rol === "admin" ? "Administrador" : "Operativo")),
      onChange: aplicarFiltroPersonal,
    });
    sincronizarMultiSelect({
      container: toolbar,
      key: "pers_montacargas",
      etiqueta: "Montacargas",
      opciones: cacheEmpleados.map((e) => (e.certificacion_montacargas ? "Certificado" : "Sin certificación")),
      onChange: aplicarFiltroPersonal,
    });
    sincronizarMultiSelect({
      container: toolbar,
      key: "pers_acceso",
      etiqueta: "Acceso Web",
      opciones: cacheEmpleados.map((e) => (e.correo_acceso ? "Con acceso" : "Sin acceso web")),
      onChange: aplicarFiltroPersonal,
    });
    sincronizarMultiSelect({
      container: toolbar,
      key: "pers_nombre",
      etiqueta: "Trabajador",
      opciones: cacheEmpleados.map((e) => `#${e.id_empleado} — ${e.nombre}`),
      onChange: aplicarFiltroPersonal,
    });
  }

  const filtrados = cacheEmpleados.filter(
    (emp) =>
      pasaFiltroMultiple("pers_turno", emp.turno) &&
      pasaFiltroMultiple("pers_rol", (emp.rol_acceso === "admin" || emp.rol === "admin") ? "Administrador" : "Operativo") &&
      pasaFiltroMultiple("pers_montacargas", emp.certificacion_montacargas ? "Certificado" : "Sin certificación") &&
      pasaFiltroMultiple("pers_acceso", emp.correo_acceso ? "Con acceso" : "Sin acceso web") &&
      pasaFiltroMultiple("pers_nombre", `#${emp.id_empleado} — ${emp.nombre}`)
  );
  renderTablaPersonal(filtrados);
}

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
            <option value="Mixto">Mixto</option>
          </select>
        </label>
        <label>
          Rol / Privilegio
          <select id="emp-rol" required>
            <option value="empleado">Personal Operativo</option>
            <option value="admin">Administrador</option>
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
          <h2>2. Asignar Acceso, Rol o Contraseña a Trabajador</h2>
          <span style="color: var(--muted); font-size: 0.85rem;">
            Permite asignar correo, contraseña o promover a un trabajador ya registrado como Administrador
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
                  `<option value="${emp.id_empleado}">#${emp.id_empleado} — ${emp.nombre} (${emp.turno}) [${(emp.rol_acceso === "admin" || emp.rol === "admin") ? "Admin" : "Operativo"}]</option>`
              )
              .join("")}
          </select>
        </label>
        <label>
          Rol Asignado
          <select id="cred-emp-rol" required>
            <option value="empleado">Personal Operativo</option>
            <option value="admin">Administrador</option>
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
        <button type="submit" class="btn-primary">Guardar Credenciales y Rol</button>
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
              <th>Rol</th>
              <th>Montacargas</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody id="tabla-personal"></tbody>
        </table>
      </div>
    </div>`;

  sincronizarSelectBuscable("cred-emp-id", "Buscar trabajador por ID o nombre...");
  aplicarFiltroPersonal();

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
        rol: document.getElementById("emp-rol") ? document.getElementById("emp-rol").value : "empleado",
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
      const rol = document.getElementById("cred-emp-rol") ? document.getElementById("cred-emp-rol").value : "empleado";
      const res = await window.dbClient.guardarCredencialesEmpleado(idEmp, {
        email,
        password: password || null,
        rol,
      });
      showAlert(res.message);
      await cargarTodo();
    } catch (err) {
      showAlert(err.message);
      await evaluarEstadoAcceso();
    }
  });
}

// ============================================================================
// 6. Pestaña 1: Inventario Físico por Coordenada
// ============================================================================

function renderInventario(lista) {
  const tbody = document.getElementById("tabla-inventario");
  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">Sin registros en inventario para los filtros seleccionados</td></tr>`;
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
  const inputAntiguo = document.getElementById("buscar-inventario");
  if (inputAntiguo) inputAntiguo.style.display = "none";

  const toolbar = asegurarBarraFiltrosTabla("tabla-inventario", "filtros-inventario-toolbar");
  if (toolbar) {
    sincronizarMultiSelect({
      container: toolbar,
      key: "inv_zona",
      etiqueta: "Zona",
      opciones: cacheInventario.map((i) => i.zona),
      onChange: aplicarFiltroInventario,
    });
    sincronizarMultiSelect({
      container: toolbar,
      key: "inv_tipo",
      etiqueta: "Almacenaje",
      opciones: cacheInventario.map((i) => i.tipo_almacenaje),
      onChange: aplicarFiltroInventario,
    });
    sincronizarMultiSelect({
      container: toolbar,
      key: "inv_coord",
      etiqueta: "Ubicación",
      opciones: cacheInventario.map((i) => `${i.zona}-${i.pasillo}-${i.rack}-${i.nivel}`),
      onChange: aplicarFiltroInventario,
    });
    sincronizarMultiSelect({
      container: toolbar,
      key: "inv_producto",
      etiqueta: "Producto / SKU",
      opciones: cacheInventario.map((i) => `${i.sku} — ${i.producto}`),
      onChange: aplicarFiltroInventario,
    });
  }

  const filtrados = cacheInventario.filter(
    (i) =>
      pasaFiltroMultiple("inv_zona", i.zona) &&
      pasaFiltroMultiple("inv_tipo", i.tipo_almacenaje) &&
      pasaFiltroMultiple("inv_coord", `${i.zona}-${i.pasillo}-${i.rack}-${i.nivel}`) &&
      pasaFiltroMultiple("inv_producto", `${i.sku} — ${i.producto}`)
  );
  renderInventario(filtrados);
}

// ============================================================================
// 7. Pestaña 2: Catálogo de Productos (Supertipo y Subtipos)
// ============================================================================

function renderProductos(productos) {
  const tbody = document.getElementById("tabla-productos");
  const badge = document.getElementById("catalogo-resultado-badge");
  if (badge) {
    badge.textContent =
      productos.length > 0
        ? `Mostrando ${productos.length} de ${cacheProductos.length} refacciones`
        : "Sin existencia con ese nombre/filtro";
  }

  if (productos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7">No se encontró ninguna refacción con esa palabra o frase en el catálogo</td></tr>`;
    return;
  }
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

function asegurarControlesCatalogo() {
  const tbody = document.getElementById("tabla-productos");
  if (!tbody) return null;

  let box = document.getElementById("catalogo-filtros-box");
  if (!box) {
    const tableWrap = tbody.closest(".table-wrap") || tbody.closest("table");
    if (!tableWrap || !tableWrap.parentElement) return null;

    box = document.createElement("div");
    box.id = "catalogo-filtros-box";
    box.className = "catalog-search-box";

    const input = document.createElement("input");
    input.type = "search";
    input.id = "buscar-productos";
    input.placeholder = "Verificar existencia por nombre o SKU (ej. pisto, piston forjado, rep-fre-0001)...";
    input.autocomplete = "off";
    input.addEventListener("input", aplicarFiltroProductos);

    const badge = document.createElement("span");
    badge.id = "catalogo-resultado-badge";
    badge.className = "catalog-count-badge";

    box.appendChild(input);
    box.appendChild(badge);
    tableWrap.parentElement.insertBefore(box, tableWrap);
  }
  return box;
}

function aplicarFiltroProductos() {
  const box = asegurarControlesCatalogo();
  if (box) {
    sincronizarMultiSelect({
      container: box,
      key: "prod_categoria",
      etiqueta: "Categoría",
      opciones: cacheProductos.map((p) => p.categoria),
      onChange: aplicarFiltroProductos,
    });
    sincronizarMultiSelect({
      container: box,
      key: "prod_subtipo",
      etiqueta: "Tipo",
      opciones: cacheProductos.map((p) => (p.volumen_mililitros != null ? "Fluido Químico" : "Pieza Sólida")),
      onChange: aplicarFiltroProductos,
    });
  }

  const input = document.getElementById("buscar-productos");
  const query = input ? input.value : "";

  const filtrados = cacheProductos.filter((p) => {
    const tipoStr = p.volumen_mililitros != null ? "Fluido Químico" : "Pieza Sólida";
    if (!pasaFiltroMultiple("prod_categoria", p.categoria)) return false;
    if (!pasaFiltroMultiple("prod_subtipo", tipoStr)) return false;

    return coincideBusquedaEstricta(query, [p.nombre, p.sku, p.categoria]);
  });

  renderProductos(filtrados);
}

// ============================================================================
// 8. Pestaña 3: Órdenes de Salida (Flujo Secuencial por Propietario de Sesión)
// ============================================================================

function obtenerPrioridadOrden(estatus) {
  const norm = normalizarOrtografia(estatus);
  if (norm === "en proceso" || norm === "en despacho" || norm === "picking") return 1;
  if (norm === "pendiente") return 2;
  if (norm === "completada" || norm === "despachado") return 3;
  return 4; // Cancelada
}

/**
 * Indica si la orden está asignada directamente al trabajador en sesión.
 */
function esOrdenDelUsuarioActivo(orden) {
  if (window.dbClient.idEmpleado === null || window.dbClient.idEmpleado === undefined) {
    return false;
  }
  return Number(orden.id_empleado) === Number(window.dbClient.idEmpleado);
}

/**
 * Determina si la sesión actual tiene permiso para cambiar el estatus de la orden:
 * - Trabajador registrado (operativo o admin): solo sus propias órdenes.
 * - Cuenta maestra Admin (.env, sin id_empleado): cualquier orden.
 * - Modo estático: cualquier orden.
 */
function puedeGestionarOrden(orden) {
  if (!window.dbClient.isPostgres) {
    if (window.dbClient.idEmpleado === null) return true;
    return Number(orden.id_empleado) === Number(window.dbClient.idEmpleado);
  }
  if (window.dbClient.idEmpleado !== null) {
    return Number(orden.id_empleado) === Number(window.dbClient.idEmpleado);
  }
  return window.dbClient.isAdmin();
}

function ordenarColaDespacho(lista) {
  return [...lista].sort((a, b) => {
    const miaA = esOrdenDelUsuarioActivo(a);
    const miaB = esOrdenDelUsuarioActivo(b);
    if (miaA !== miaB) return miaA ? -1 : 1;

    const prioDiff = obtenerPrioridadOrden(a.estatus) - obtenerPrioridadOrden(b.estatus);
    if (prioDiff !== 0) return prioDiff;

    const timeA = new Date(a.fecha_emision).getTime() || 0;
    const timeB = new Date(b.fecha_emision).getTime() || 0;
    if (timeA !== timeB) return timeA - timeB;

    return Number(a.id_orden) - Number(b.id_orden);
  });
}

function renderBadgeEstatusOrden(estatus) {
  const prio = obtenerPrioridadOrden(estatus);
  if (prio === 1) return `<span class="badge-info">En Proceso</span>`;
  if (prio === 2) return `<span class="badge-warn">Pendiente</span>`;
  if (prio === 3) return `<span class="badge-ok">Completada</span>`;
  return `<span class="badge-danger">Cancelada</span>`;
}

function renderOrdenes(ordenes) {
  const tbody = document.getElementById("tabla-ordenes");
  if (ordenes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">Sin órdenes asignadas para los filtros seleccionados</td></tr>`;
    return;
  }

  const ordenadas = ordenarColaDespacho(ordenes);

  tbody.innerHTML = ordenadas
    .map((o) => {
      const prio = obtenerPrioridadOrden(o.estatus);
      const esMia = esOrdenDelUsuarioActivo(o);
      const puedeEditar = puedeGestionarOrden(o);
      let accionHTML = "—";

      if (prio === 1 || prio === 2) {
        if (puedeEditar) {
          const btnPrincipal =
            prio === 2
              ? `<button type="button" class="btn-small btn-dispatch" onclick="iniciarProcesoUI(${o.id_orden})">En Proceso</button>`
              : `<button type="button" class="btn-small btn-complete" onclick="completarOrdenUI(${o.id_orden})">Completada</button>`;

          const btnCancelar = `<button type="button" class="btn-small btn-cancel" onclick="cancelarOrdenUI(${o.id_orden})">Cancelar</button>`;

          accionHTML = `<div class="order-actions-wrap">${btnPrincipal}${btnCancelar}</div>`;
        } else {
          accionHTML = `<span class="role-lock-note">Solo editable por ${o.empleado}</span>`;
        }
      }

      const rowClasses = [];
      if (esMia) rowClasses.push("row-mia");
      if (prio === 1) rowClasses.push("row-despacho");
      if (prio === 4) rowClasses.push("row-cancelada");

      const badgePropia = esMia ? ` <span class="badge-mia">Tu orden</span>` : "";

      return `
        <tr class="${rowClasses.join(" ")}">
          <td><strong>#${o.id_orden}</strong></td>
          <td>${new Date(o.fecha_emision).toLocaleString("es-MX")}</td>
          <td>${o.empleado} (${o.turno})${badgePropia}</td>
          <td>${o.resumen_productos || "-"}</td>
          <td>${renderBadgeEstatusOrden(o.estatus)}</td>
          <td>${accionHTML}</td>
        </tr>`;
    })
    .join("");
}

function aplicarFiltroOrdenes() {
  const ordenesOrdenadas = ordenarColaDespacho(cacheOrdenes);
  const toolbar = asegurarBarraFiltrosTabla("tabla-ordenes", "filtros-ordenes-toolbar");
  if (toolbar) {
    sincronizarMultiSelect({
      container: toolbar,
      key: "ord_estatus",
      etiqueta: "Estatus",
      opciones: ordenesOrdenadas.map((o) => o.estatus),
      onChange: aplicarFiltroOrdenes,
    });
    sincronizarMultiSelect({
      container: toolbar,
      key: "ord_empleado",
      etiqueta: "Empleado",
      opciones: ordenesOrdenadas.map((o) => `${o.empleado} (${o.turno})`),
      onChange: aplicarFiltroOrdenes,
    });
    sincronizarMultiSelect({
      container: toolbar,
      key: "ord_id",
      etiqueta: "Núm. Orden",
      opciones: ordenesOrdenadas.map((o) => `#${o.id_orden}`),
      onChange: aplicarFiltroOrdenes,
    });
  }

  const filtrados = ordenesOrdenadas.filter(
    (o) =>
      pasaFiltroMultiple("ord_estatus", o.estatus) &&
      pasaFiltroMultiple("ord_empleado", `${o.empleado} (${o.turno})`) &&
      pasaFiltroMultiple("ord_id", `#${o.id_orden}`)
  );
  renderOrdenes(filtrados);
}

// ============================================================================
// 9. Pestaña 4: Reportes Gerenciales y Generador PDF Nativo Offline
// ============================================================================

function obtenerTarjetasReportes() {
  const repStock = document.getElementById("rep-stock");
  const repEfic = document.getElementById("rep-eficiencia");
  const repVacias = document.getElementById("rep-vacias");
  return {
    stock: repStock ? repStock.closest(".card") : null,
    eficiencia: repEfic ? repEfic.closest(".card") : null,
    capacidad: repVacias ? repVacias.closest(".card") : null,
  };
}

function activarSubtabReporte(tabKey) {
  reporteActivoTab = tabKey;
  const tarjetas = obtenerTarjetasReportes();

  Object.entries(tarjetas).forEach(([key, card]) => {
    if (!card) return;
    card.classList.toggle("hidden", key !== tabKey);
  });

  document.querySelectorAll(".report-subtab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.reportTab === tabKey);
  });

  renderControlExportacionPDF();
}

function asegurarSubtabsReportes() {
  const tarjetas = obtenerTarjetasReportes();
  const primeraTarjeta = tarjetas.stock;
  if (!primeraTarjeta || !primeraTarjeta.parentElement) return;

  const parent = primeraTarjeta.parentElement;
  if (parent.classList.contains("grid-2")) {
    parent.classList.remove("grid-2");
  }

  const tituloCapacidad = tarjetas.capacidad?.querySelector("h2");
  if (tituloCapacidad) {
    tituloCapacidad.textContent = "Capacidad por Zona, Rack y Nivel (Todas las Ubicaciones)";
  }

  const tablaCapacidad = document.getElementById("rep-vacias")?.closest("table");
  const theadRow = tablaCapacidad?.querySelector("thead tr");
  if (theadRow) {
    theadRow.innerHTML = `
      <th>Coordenada</th>
      <th>Tipo de Almacenaje</th>
      <th>Carga Actual / Capacidad Máx.</th>
      <th>Disponible y Estado</th>
    `;
  }

  let nav = document.getElementById("reportes-subtabs-nav");
  if (!nav) {
    nav = document.createElement("div");
    nav.id = "reportes-subtabs-nav";
    nav.className = "report-subtabs";
    nav.innerHTML = `
      <button type="button" class="report-subtab-btn" data-report-tab="stock">
        1. Stock y Carga por Ubicación
      </button>
      <button type="button" class="report-subtab-btn" data-report-tab="eficiencia">
        2. Eficiencia de Recolección
      </button>
      <button type="button" class="report-subtab-btn" data-report-tab="capacidad">
        3. Capacidad de Racks y Niveles
      </button>
    `;
    parent.insertBefore(nav, primeraTarjeta);

    nav.querySelectorAll(".report-subtab-btn").forEach((btn) => {
      btn.addEventListener("click", () => activarSubtabReporte(btn.dataset.reportTab));
    });
  }

  activarSubtabReporte(reporteActivoTab);
}

function renderReportes(reportes) {
  asegurarSubtabsReportes();

  document.getElementById("rep-stock").innerHTML =
    reportes.stock_por_ubicacion.length === 0
      ? `<tr><td colspan="5">Sin stock registrado para los filtros seleccionados</td></tr>`
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

  document.getElementById("rep-eficiencia").innerHTML =
    reportes.eficiencia_recoleccion.length === 0
      ? `<tr><td colspan="3">Sin empleados que coincidan</td></tr>`
      : reportes.eficiencia_recoleccion
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
      ? `<tr><td colspan="4">Sin ubicaciones registradas para los filtros seleccionados</td></tr>`
      : reportes.ubicaciones_vacias
          .map((u) => {
            const pesoActual = Number(u.peso_actual_kg ?? 0);
            const capMax = Number(u.capacidad_peso_kg ?? 0);
            const disponible = Number(u.capacidad_disponible_kg ?? capMax - pesoActual);
            const estado = u.estado_ocupacion || (pesoActual === 0 ? "Vacía" : disponible <= capMax * 0.05 ? "Llena" : "Disponible");
            const badgeClass =
              estado === "Llena" ? "badge-danger" : estado === "Vacía" ? "badge-ok" : "badge-warn";

            return `
              <tr>
                <td><strong class="coord-tag">${u.zona}-${u.pasillo}-${u.rack}-${u.nivel}</strong></td>
                <td>${u.tipo_almacenaje}</td>
                <td><strong>${pesoActual.toFixed(2)} kg</strong> / ${capMax.toFixed(2)} kg</td>
                <td>
                  <strong>${disponible.toFixed(2)} kg libres</strong>
                  <span class="${badgeClass}" style="margin-left: 0.4rem;">${estado}</span>
                </td>
              </tr>`;
          })
          .join("");
}

function aplicarFiltroReportes() {
  const tbStock = asegurarBarraFiltrosTabla("rep-stock", "filtros-rep-stock-toolbar");
  if (tbStock) {
    sincronizarMultiSelect({
      container: tbStock,
      key: "rep_stock_zona",
      etiqueta: "Zona",
      opciones: cacheReportes.stock_por_ubicacion.map((r) => r.zona),
      onChange: aplicarFiltroReportes,
    });
    sincronizarMultiSelect({
      container: tbStock,
      key: "rep_stock_prod",
      etiqueta: "Producto / SKU",
      opciones: cacheReportes.stock_por_ubicacion.map((r) => `${r.sku} — ${r.nombre}`),
      onChange: aplicarFiltroReportes,
    });
  }

  const tbEfic = asegurarBarraFiltrosTabla("rep-eficiencia", "filtros-rep-efic-toolbar");
  if (tbEfic) {
    sincronizarMultiSelect({
      container: tbEfic,
      key: "rep_efic_turno",
      etiqueta: "Turno",
      opciones: cacheReportes.eficiencia_recoleccion.map((e) => e.turno),
      onChange: aplicarFiltroReportes,
    });
    sincronizarMultiSelect({
      container: tbEfic,
      key: "rep_efic_emp",
      etiqueta: "Empleado",
      opciones: cacheReportes.eficiencia_recoleccion.map((e) => e.nombre),
      onChange: aplicarFiltroReportes,
    });
  }

  const tbVacias = asegurarBarraFiltrosTabla("rep-vacias", "filtros-rep-vacias-toolbar");
  if (tbVacias) {
    sincronizarMultiSelect({
      container: tbVacias,
      key: "rep_vacias_zona",
      etiqueta: "Zona",
      opciones: cacheReportes.ubicaciones_vacias.map((u) => u.zona),
      onChange: aplicarFiltroReportes,
    });
    sincronizarMultiSelect({
      container: tbVacias,
      key: "rep_vacias_rack",
      etiqueta: "Rack",
      opciones: cacheReportes.ubicaciones_vacias.map((u) => `${u.zona}-${u.pasillo}-${u.rack}`),
      onChange: aplicarFiltroReportes,
    });
    sincronizarMultiSelect({
      container: tbVacias,
      key: "rep_vacias_tipo",
      etiqueta: "Tipo Almacenaje",
      opciones: cacheReportes.ubicaciones_vacias.map((u) => u.tipo_almacenaje),
      onChange: aplicarFiltroReportes,
    });
    sincronizarMultiSelect({
      container: tbVacias,
      key: "rep_vacias_estado",
      etiqueta: "Estado",
      opciones: cacheReportes.ubicaciones_vacias.map((u) => u.estado_ocupacion || "Vacía"),
      onChange: aplicarFiltroReportes,
    });
  }

  cacheReportesFiltrados = {
    stock_por_ubicacion: cacheReportes.stock_por_ubicacion.filter(
      (r) =>
        pasaFiltroMultiple("rep_stock_zona", r.zona) &&
        pasaFiltroMultiple("rep_stock_prod", `${r.sku} — ${r.nombre}`)
    ),
    eficiencia_recoleccion: cacheReportes.eficiencia_recoleccion.filter(
      (e) =>
        pasaFiltroMultiple("rep_efic_turno", e.turno) &&
        pasaFiltroMultiple("rep_efic_emp", e.nombre)
    ),
    ubicaciones_vacias: cacheReportes.ubicaciones_vacias.filter(
      (u) =>
        pasaFiltroMultiple("rep_vacias_zona", u.zona) &&
        pasaFiltroMultiple("rep_vacias_rack", `${u.zona}-${u.pasillo}-${u.rack}`) &&
        pasaFiltroMultiple("rep_vacias_tipo", u.tipo_almacenaje) &&
        pasaFiltroMultiple("rep_vacias_estado", u.estado_ocupacion || "Vacía")
    ),
  };

  renderReportes(cacheReportesFiltrados);
}

/**
 * Construye un archivo PDF 1.4 binario desde cero sin dependencias externas.
 */
function generarPDFNativoOffline({ titulo, subtitulo1, subtitulo2, secciones }) {
  const WIN_ANSI_MAP = {
    "€": 0x80, "—": 0x97, "–": 0x96, "¡": 0xa1, "°": 0xb0, "·": 0xb7, "¿": 0xbf,
    "Á": 0xc1, "É": 0xc9, "Í": 0xcd, "Ñ": 0xd1, "Ó": 0xd3, "×": 0xd7, "Ú": 0xda, "Ü": 0xdc,
    "á": 0xe1, "é": 0xe9, "í": 0xed, "ñ": 0xf1, "ó": 0xf3, "ú": 0xfa, "ü": 0xfc,
  };

  function encodeWinAnsi(str) {
    const out = [];
    for (const ch of String(str ?? "")) {
      const code = ch.charCodeAt(0);
      if (ch === "\\" || ch === "(" || ch === ")") {
        out.push(0x5c, code);
      } else if (code >= 0x20 && code <= 0x7e) {
        out.push(code);
      } else if (WIN_ANSI_MAP[ch] !== undefined) {
        out.push(WIN_ANSI_MAP[ch]);
      } else {
        out.push(0x3f);
      }
    }
    return out;
  }

  function asciiBytes(str) {
    const arr = [];
    for (let i = 0; i < str.length; i++) {
      arr.push(str.charCodeAt(i) & 0xff);
    }
    return arr;
  }

  function ajustarTexto(texto, anchoPt, fontSize) {
    const s = String(texto ?? "");
    const maxChars = Math.max(4, Math.floor((anchoPt - 8) / (fontSize * 0.52)));
    return s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s;
  }

  const PAGE_W = 612;
  const PAGE_H = 792;
  const MARGIN_L = 40;
  const TABLE_W = PAGE_W - MARGIN_L * 2;
  const BOTTOM_LIMIT = 56;

  const paginasOps = [];
  let opsActual = [];
  let y = PAGE_H - 95;

  function nuevaPagina(esPrimera = false) {
    if (opsActual.length > 0) paginasOps.push(opsActual);
    opsActual = [];

    if (esPrimera) {
      opsActual.push(asciiBytes(`0.094 0.094 0.106 rg 0 ${PAGE_H - 76} ${PAGE_W} 76 re f\n`));
      opsActual.push(asciiBytes(`0.961 0.620 0.043 rg 0 ${PAGE_H - 80} ${PAGE_W} 4 re f\n`));

      opsActual.push(asciiBytes(`BT /F2 15 Tf 0.984 0.749 0.141 rg ${MARGIN_L} ${PAGE_H - 32} Td (`));
      opsActual.push(encodeWinAnsi(titulo));
      opsActual.push(asciiBytes(`) Tj ET\n`));

      opsActual.push(asciiBytes(`BT /F1 8.5 Tf 0.894 0.894 0.906 rg ${MARGIN_L} ${PAGE_H - 49} Td (`));
      opsActual.push(encodeWinAnsi(subtitulo1));
      opsActual.push(asciiBytes(`) Tj ET\n`));

      opsActual.push(asciiBytes(`BT /F1 8.5 Tf 0.894 0.894 0.906 rg ${MARGIN_L} ${PAGE_H - 63} Td (`));
      opsActual.push(encodeWinAnsi(subtitulo2));
      opsActual.push(asciiBytes(`) Tj ET\n`));

      y = PAGE_H - 104;
    } else {
      y = PAGE_H - 50;
    }
  }

  function dibujarEncabezadoTabla(headers, colWidths) {
    const rowH = 20;
    opsActual.push(asciiBytes(`0.153 0.153 0.165 rg ${MARGIN_L} ${y - rowH} ${TABLE_W} ${rowH} re f\n`));
    let x = MARGIN_L;
    for (let c = 0; c < headers.length; c++) {
      const w = colWidths[c];
      opsActual.push(asciiBytes(`0.35 0.35 0.40 RG 0.5 w ${x} ${y - rowH} ${w} ${rowH} re S\n`));
      opsActual.push(asciiBytes(`BT /F2 8.5 Tf 0.984 0.749 0.141 rg ${x + 4} ${y - 13.5} Td (`));
      opsActual.push(encodeWinAnsi(ajustarTexto(headers[c], w, 8.5)));
      opsActual.push(asciiBytes(`) Tj ET\n`));
      x += w;
    }
    y -= rowH;
  }

  nuevaPagina(true);

  for (const sec of secciones) {
    if (y - 52 < BOTTOM_LIMIT) {
      nuevaPagina(false);
    }

    opsActual.push(asciiBytes(`BT /F2 11 Tf 0.094 0.094 0.106 rg ${MARGIN_L} ${y} Td (`));
    opsActual.push(encodeWinAnsi(sec.titulo));
    opsActual.push(asciiBytes(`) Tj ET\n`));
    y -= 10;

    const colWidths = sec.ratios.map((r) => Math.round(TABLE_W * r));
    dibujarEncabezadoTabla(sec.headers, colWidths);

    const rowH = 18;
    sec.filas.forEach((fila, idx) => {
      if (y - rowH < BOTTOM_LIMIT) {
        nuevaPagina(false);
        dibujarEncabezadoTabla(sec.headers, colWidths);
      }

      if (idx % 2 === 1) {
        opsActual.push(asciiBytes(`0.965 0.965 0.975 rg ${MARGIN_L} ${y - rowH} ${TABLE_W} ${rowH} re f\n`));
      }

      let x = MARGIN_L;
      for (let c = 0; c < fila.length; c++) {
        const w = colWidths[c];
        opsActual.push(asciiBytes(`0.82 0.82 0.85 RG 0.4 w ${x} ${y - rowH} ${w} ${rowH} re S\n`));
        opsActual.push(asciiBytes(`BT /F1 8 Tf 0.094 0.094 0.106 rg ${x + 4} ${y - 12.5} Td (`));
        opsActual.push(encodeWinAnsi(ajustarTexto(fila[c], w, 8)));
        opsActual.push(asciiBytes(`) Tj ET\n`));
        x += w;
      }
      y -= rowH;
    });

    y -= 20;
  }

  if (opsActual.length > 0) paginasOps.push(opsActual);

  const totalPaginas = paginasOps.length;
  paginasOps.forEach((ops, idx) => {
    const footer = `Almacenes El Pistón — Sistema de Gestión Logística | Página ${idx + 1} de ${totalPaginas}`;
    ops.push(asciiBytes(`BT /F1 8 Tf 0.44 0.44 0.48 rg ${MARGIN_L} 28 Td (`));
    ops.push(encodeWinAnsi(footer));
    ops.push(asciiBytes(`) Tj ET\n`));
  });

  const pdfBytes = [];
  const offsets = [0];
  const pushBytes = (arr) => {
    for (let i = 0; i < arr.length; i++) pdfBytes.push(arr[i]);
  };
  const pushAscii = (str) => pushBytes(asciiBytes(str));

  pushBytes([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]);

  const totalObjs = 4 + totalPaginas * 2;
  const pageObjIds = [];
  for (let i = 0; i < totalPaginas; i++) pageObjIds.push(5 + i * 2);

  offsets[1] = pdfBytes.length;
  pushAscii(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);

  offsets[2] = pdfBytes.length;
  pushAscii(`2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${totalPaginas} >>\nendobj\n`);

  offsets[3] = pdfBytes.length;
  pushAscii(`3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`);

  offsets[4] = pdfBytes.length;
  pushAscii(`4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`);

  paginasOps.forEach((ops, i) => {
    const pageId = 5 + i * 2;
    const contentId = pageId + 1;
    const streamBytes = [];
    ops.forEach((chunk) => {
      for (let j = 0; j < chunk.length; j++) streamBytes.push(chunk[j]);
    });

    offsets[pageId] = pdfBytes.length;
    pushAscii(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`
    );

    offsets[contentId] = pdfBytes.length;
    pushAscii(`${contentId} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n`);
    pushBytes(streamBytes);
    pushAscii(`\nendstream\nendobj\n`);
  });

  const xrefOffset = pdfBytes.length;
  pushAscii(`xref\n0 ${totalObjs + 1}\n`);
  pushAscii(`0000000000 65535 f \n`);
  for (let id = 1; id <= totalObjs; id++) {
    pushAscii(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  pushAscii(`trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
}

async function descargarReportesPDF() {
  if (!window.dbClient.isAdmin()) {
    showAlert("Bloqueado: inicia sesión como administrador para descargar reportes en PDF.");
    return;
  }

  try {
    const reportesCertificados = await window.dbClient.getReportesCertificadosPDF();
    const fechaStr = new Date().toLocaleString("es-MX");
    const fechaArchivo = new Date().toISOString().slice(0, 10);

    let seccionUnica;
    let sufijoArchivo = "General";

    if (reporteActivoTab === "stock") {
      sufijoArchivo = "Stock_Ubicacion";
      const datos = cacheReportesFiltrados.stock_por_ubicacion;
      seccionUnica = {
        titulo: "Reporte 1: Stock y Carga por Ubicación",
        headers: ["Ubicación", "SKU", "Producto", "Cant.", "Peso Actual / Máx"],
        ratios: [0.23, 0.16, 0.33, 0.08, 0.20],
        filas:
          datos.length > 0
            ? datos.map((r) => [
                `${r.zona}-${r.pasillo}-${r.rack}-${r.nivel}`,
                r.sku,
                r.nombre,
                String(r.cantidad),
                `${r.peso_total_kg} / ${r.capacidad_peso_kg} kg`,
              ])
            : [["—", "—", "Sin stock registrado para los filtros activos", "0", "0 kg"]],
      };
    } else if (reporteActivoTab === "eficiencia") {
      sufijoArchivo = "Eficiencia_Recoleccion";
      const datos = cacheReportesFiltrados.eficiencia_recoleccion;
      seccionUnica = {
        titulo: "Reporte 2: Eficiencia de Recolección por Empleado",
        headers: ["Empleado", "Turno", "Órdenes Completadas / Asignadas"],
        ratios: [0.45, 0.23, 0.32],
        filas:
          datos.length > 0
            ? datos.map((e) => [
                e.nombre,
                e.turno,
                `${e.ordenes_completadas} / ${e.ordenes_asignadas}`,
              ])
            : [["—", "—", "0 / 0"]],
      };
    } else {
      sufijoArchivo = "Capacidad_Racks_Niveles";
      const datos = cacheReportesFiltrados.ubicaciones_vacias;
      seccionUnica = {
        titulo: "Reporte 3: Capacidad por Zona, Rack y Nivel",
        headers: ["Coordenada", "Tipo Almacenaje", "Actual / Máx.", "Disponible (Estado)"],
        ratios: [0.25, 0.27, 0.24, 0.24],
        filas:
          datos.length > 0
            ? datos.map((u) => {
                const actual = Number(u.peso_actual_kg ?? 0).toFixed(2);
                const max = Number(u.capacidad_peso_kg ?? 0).toFixed(2);
                const disp = Number(u.capacidad_disponible_kg ?? (max - actual)).toFixed(2);
                const est = u.estado_ocupacion || "Vacía";
                return [
                  `${u.zona}-${u.pasillo}-${u.rack}-${u.nivel}`,
                  u.tipo_almacenaje,
                  `${actual} / ${max} kg`,
                  `${disp} kg (${est})`,
                ];
              })
            : [["—", "Sin ubicaciones para los filtros activos", "—", "—"]],
      };
    }

    const pdfBlob = generarPDFNativoOffline({
      titulo: `Almacenes El Pistón — ${seccionUnica.titulo}`,
      subtitulo1: `Generado: ${fechaStr} | Autorizado por: ${reportesCertificados.autorizado_por}`,
      subtitulo2: "Fuente: Base de Datos PostgreSQL 16 (Exportación Individual de Pestaña Activa)",
      secciones: [seccionUnica],
    });

    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Reporte_${sufijoArchivo}_${fechaArchivo}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    showAlert(`Descargado: ${seccionUnica.titulo} en PDF.`);
  } catch (err) {
    showAlert(err.message);
    await evaluarEstadoAcceso();
  }
}

// ============================================================================
// 10. Sincronización General de Datos y Acciones Globales de Órdenes
// ============================================================================

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
    cacheProductos = productos;
    cacheOrdenes = ordenes;
    cacheEmpleados = catalogos.empleados;
    cacheReportes = reportes;

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

    sincronizarSelectBuscable("mov-sku", "Escribe SKU o nombre de producto...");
    sincronizarSelectBuscable("mov-ubicacion", "Escribe zona, pasillo o rack...");
    sincronizarSelectBuscable("ord-sku", "Escribe SKU o nombre de producto...");
    sincronizarSelectBuscable("ord-empleado", "Escribe nombre del empleado...");

    const maxOrden = ordenes.reduce((max, o) => Math.max(max, Number(o.id_orden)), 5000);
    document.getElementById("ord-id").value = maxOrden + 1;

    aplicarFiltroInventario();
    aplicarFiltroProductos();
    aplicarFiltroOrdenes();
    aplicarFiltroReportes();
    renderSeccionPersonal();
  } catch (err) {
    showAlert(err.message);
    await evaluarEstadoAcceso();
  }
}

window.iniciarProcesoUI = async (idOrden) => {
  try {
    const res = await window.dbClient.procesarOrden(idOrden);
    showAlert(res?.message || `Orden #${idOrden} marcada En Proceso.`);
    await cargarTodo();
  } catch (err) {
    showAlert(err.message);
  }
};

window.completarOrdenUI = async (idOrden) => {
  try {
    const ordActual = cacheOrdenes.find((o) => Number(o.id_orden) === Number(idOrden));
    if (ordActual && obtenerPrioridadOrden(ordActual.estatus) !== 1) {
      showAlert("Debes poner primero la orden En Proceso antes de marcarla como Completada.");
      return;
    }

    const res = await window.dbClient.completarOrden(idOrden);
    showAlert(res?.message || `Orden #${idOrden} marcada como Completada.`);
    await cargarTodo();
  } catch (err) {
    showAlert(err.message);
  }
};

window.cancelarOrdenUI = async (idOrden) => {
  if (!window.confirm(`¿Seguro que deseas cancelar la orden #${idOrden}? Esta acción es definitiva.`)) {
    return;
  }

  try {
    const res = await window.dbClient.cancelarOrden(idOrden);
    showAlert(res?.message || `Orden #${idOrden} Cancelada.`);
    await cargarTodo();
  } catch (err) {
    showAlert(err.message);
  }
};

// ============================================================================
// 11. Inicialización del DOM y Enlace de Formularios
// ============================================================================

document.addEventListener("DOMContentLoaded", async () => {
  configurarCierreMenusDesplegables();
  setupTabs();
  setupPasswordToggles();
  await window.dbClient.init();
  await evaluarEstadoAcceso();

  document.getElementById("btn-sesion-header").addEventListener("click", async () => {
    window.dbClient.logout();
    showAlert("Sesión cerrada correctamente.");
    await evaluarEstadoAcceso();
  });

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