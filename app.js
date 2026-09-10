const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const $ = (sel) => document.querySelector(sel);

const storage = {
  load() { return JSON.parse(localStorage.getItem("viajesActivos")) || []; },
  save(list) { localStorage.setItem("viajesActivos", JSON.stringify(list)); },
  clear() { localStorage.removeItem("viajesActivos"); }
};

// Manejo del almacenamiento nativo en el teléfono (IndexedDB)
const dbStorage = {
  DB_NAME: "ViajesHistorialDB",
  DB_VERSION: 2,
  STORE_NAME: "meses_finalizados",

  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async saveMonth(idKey, tripsList) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORE_NAME], "readwrite");
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.put({ id: idKey, viajes: tripsList });
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async getAllMonths() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORE_NAME], "readonly");
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.getAll();
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async deleteMonth(idKey) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORE_NAME], "readwrite");
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.delete(idKey);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }
};

const validators = {
  ok(v) {
    return v && typeof v === "object"
      && v.producto && v.destino && v.turno && v.operador
      && Number.isInteger(v.dia) && Number.isInteger(v.anio)
      && typeof v.mes === "string";
  }
};

const sorters = {
  byDate(list) {
    return list.sort((a, b) => {
      if (a.anio !== b.anio) return a.anio - b.anio;
      const am = MONTHS.indexOf(a.mes);
      const bm = MONTHS.indexOf(b.mes);
      return am !== bm ? am - bm : a.dia - b.dia;
    });
  }
};

const state = {
  active: [],
  editingIndex: null,
  longPressTimer: null,
  selectedIndex: null,
  filterOperator: null, // Almacena el operador por el que se está filtrando
  filterProduct: null   // Almacena el producto por el que se está filtrando
};

// Función auxiliar para convertir "2026-05" a "2026 - Mayo" de forma centralizada
const formatearIDMes = (idKey) => {
  const [year, monthNum] = idKey.split("-");
  return `${year} - ${MONTHS[parseInt(monthNum, 10) - 1]}`;
};

const ui = {
  renderTable() {
    const tbody = $("#tablaViajes tbody");
    tbody.innerHTML = "";

    state.active.forEach((v, idxReal) => {
      if (!validators.ok(v)) return;

      const prodMap = { "Premium": "producto-Premium", "Magna": "producto-Magna", "Diesel": "producto-Diesel" };
      const productoClass = prodMap[v.producto] || "";
      const operMap = { "Damian": "operador-Damian", "Cosme": "operador-Cosme"};
      const operadorClass = operMap[v.operador] || "";
      const turnoClass = v.turno === "Turno 1" ? "turno-dia" : "turno-noche";

      const tr = document.createElement("tr");
      tr.className = turnoClass;
      tr.dataset.index = String(idxReal);
      tr.innerHTML = `
        <td>${v.dia}</td>
        <td>${v.mes}</td>
        <td>${v.destino}</td>
        <td class="${productoClass}">${v.producto}</td>
        <td class="${operadorClass}">${v.operador}</td>
      `;
      tbody.appendChild(tr);
    });
  },

  renderSummary() {
    const list = state.active.filter(validators.ok);
    
    // 1. Calcular totales independientes de operadores y productos para que sus cajas no queden en 0
    const operadorTotales = { Damian: 0, Cosme: 0 };
    const productoTotales = { Premium: 0, Magna: 0, Diesel: 0 };

    for (const v of list) {
      if (operadorTotales[v.operador] != null) operadorTotales[v.operador]++;
      
      // Si hay un operador seleccionado, las cajas de productos se adaptan a ese operador
      if (!state.filterOperator || v.operador === state.filterOperator) {
        if (productoTotales[v.producto] != null) productoTotales[v.producto]++;
      }
    }

    // 2. Aplicar los filtros cruzados simultáneos (Operador Y/O Producto)
    const filteredList = list.filter(v => {
      const matchOper = !state.filterOperator || v.operador === state.filterOperator;
      const matchProd = !state.filterProduct || v.producto === state.filterProduct;
      return matchOper && matchProd;
    });

    // 3. Modificar dinámicamente el título del modal para dar feedback de los filtros activos
    let titulo = "Resumen de Viajes";
    if (state.filterOperator && state.filterProduct) titulo = `${state.filterOperator} (${state.filterProduct})`;
    else if (state.filterOperator) titulo = `Resumen: ${state.filterOperator}`;
    else if (state.filterProduct) titulo = `Resumen: ${state.filterProduct}`;
    $("#modal-resumen h2").textContent = titulo;

    const summary = {
      total: filteredList.length,
      destinos: { "Velam": 0, "San Juan": 0, "Noyowee": 0, "0324": 0, "Bajos del Ejido": 0, "Fletes": 0 }
    };

    for (const v of filteredList) {
      if (summary.destinos[v.destino] != null) summary.destinos[v.destino]++;
    }

    $("#totalViajes").textContent = summary.total;
    $("#totalPremium").textContent = productoTotales.Premium;
    $("#totalMagna").textContent = productoTotales.Magna;
    $("#totalDiesel").textContent = productoTotales.Diesel;

    $("#velam").textContent = summary.destinos["Velam"];
    $("#sanjuan").textContent = summary.destinos["San Juan"];
    $("#noyo").textContent = summary.destinos["Noyowee"];
    $("#e0324").textContent = summary.destinos["0324"];
    $("#bajos").textContent = summary.destinos["Bajos del Ejido"];
    $("#flete").textContent = summary.destinos["Fletes"];
    
    $("#Damian").textContent = operadorTotales.Damian;
    $("#Cosme").textContent = operadorTotales.Cosme;

    // Indicadores visuales de filtro activo estilo Neon Toggle
    $(".Damian").classList.toggle("operador-neon", state.filterOperator === "Damian"); 
    $(".Cosme").classList.toggle("operador-neon", state.filterOperator === "Cosme"); 

    // --- LOGICA DE RESALTADO VISUAL DINÁMICO ---
    const prod = state.filterProduct;

    // Modificar las clases de los bloques de combustible para activarse con sus respectivos colores
    $(".resumen-Premium").className = `resumen-Premium ${prod === "Premium" ? "producto-activo-Premium" : ""}`;
    $(".resumen-Magna").className = `resumen-Magna ${prod === "Magna" ? "producto-activo-Magna" : ""}`;
    $(".resumen-Diesel").className = `resumen-Diesel ${prod === "Diesel" ? "producto-activo-Diesel" : ""}`;

    // Limpiar clases de color previas y aplicar el color del combustible a los destinos activos
    document.querySelectorAll(".destino-box").forEach(box => {
      box.classList.remove("destino-resaltado-Premium", "destino-resaltado-Magna", "destino-resaltado-Diesel");
      if (prod) {
        box.classList.add(`destino-resaltado-${prod}`);
      }
    });
  },

  openModal() { $("#modal").style.display = "flex"; },
  closeModal() { $("#modal").style.display = "none"; },
  openSummary() { ui.renderSummary(); $("#modal-resumen").style.display = "flex"; },
  closeSummary() { 
    state.filterOperator = null; // Limpiar filtros al cerrar
    state.filterProduct = null;
    $("#modal-resumen").style.display = "none"; 
  },
  async openHistorial() { $("#pantalla-historial").style.display = "flex"; await ui.renderHistorialList(); },
  closeHistorial() { $("#pantalla-historial").style.display = "none"; ui.openSummary(); },

  async renderHistorialList() {
    const contenedor = $("#lista-meses");
    contenedor.innerHTML = "<p style='text-align:center; color:#888;'>Cargando historial...</p>";
    
    $("#pantalla-historial h2").textContent = "Historial de Meses";
    $("#btnCerrarHistorial").textContent = "Volver al Resumen";
    
    try {
      const meses = await dbStorage.getAllMonths();
      if (meses.length === 0) {
        contenedor.innerHTML = "<p style='text-align:center; color:#888; margin-top:20px;'>No hay meses guardados todavía.</p>";
        return;
      }
      
      contenedor.innerHTML = "";
      meses.forEach(mes => {
        const btn = document.createElement("button");
        btn.textContent = formatearIDMes(mes.id);
        btn.style.cssText = "background:#222; color:#fff; border:2px solid #fff; padding:15px; margin:8px 0; border-radius:5px; font-weight:bold; width:100%; text-align:left; font-size:16px;";
        btn.addEventListener("click", () => ui.viewMonthDetails(mes));
        contenedor.appendChild(btn);
      });
    } catch (error) {
      console.error(error);
      contenedor.innerHTML = "<p style='color:red; text-align:center;'>Error al leer el almacenamiento.</p>";
    }
  },

  viewMonthDetails(mes) {
    const etiquetaLegible = formatearIDMes(mes.id);
    $("#pantalla-historial h2").textContent = etiquetaLegible;
    $("#btnCerrarHistorial").textContent = "Volver a la lista";

    const contenedor = $("#lista-meses");
    contenedor.innerHTML = `
      <button id="btnBorrarMes" style="background:#ef4444; color:#fff; border:2px solid #fff; padding:10px; margin-bottom:12px; border-radius:5px; font-weight:bold; width:100%; font-size:15px; box-sizing:border-box;">Borrar este mes 🗑️</button>
      <table style="width:100%; background:#111; border-collapse:collapse; margin-top:5px; color:#fff; font-size:14px;">
        <thead>
          <tr style="background:#222;">
            <th style="border:1px solid #fff; padding:6px;">Día</th>
            <th style="border:1px solid #fff; padding:6px;">Destino</th>
            <th style="border:1px solid #fff; padding:6px;">Prod.</th>
            <th style="border:1px solid #fff; padding:6px;">Operador</th>
          </tr>
        </thead>
        <tbody>
          ${mes.viajes.map(v => `
            <tr>
              <td style="border:1px solid #fff; padding:6px; text-align:center;">${v.dia}</td>
              <td style="border:1px solid #fff; padding:6px; text-align:center;">${v.destino}</td>
              <td style="border:1px solid #fff; padding:6px; text-align:center;">${v.producto}</td>
              <td style="border:1px solid #fff; padding:6px; text-align:center;">${v.operador}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    $("#btnBorrarMes").addEventListener("click", async () => {
      if (!confirm(`¿Estás seguro de ELIMINAR permanentemente los registros de "${etiquetaLegible}"? Esta acción no se puede deshacer.`)) return;
      try {
        await dbStorage.deleteMonth(mes.id);
        alert("Mes eliminado del almacenamiento local.");
        await ui.renderHistorialList();
      } catch (error) {
        console.error(error);
        alert("Error al intentar eliminar el registro.");
      }
    });
  },

  resetForm() {
    $("#fecha").value = "";
    $("#destino").selectedIndex = 0;
    $("#producto").selectedIndex = 0;
    $("#turno").selectedIndex = 0;
    $("#operador").selectedIndex = 0;
  },

  fillForm(v) {
    const m = MONTHS.indexOf(v.mes);
    $("#fecha").value = `${v.anio}-${String(m+1).padStart(2,"0")}-${String(v.dia).padStart(2,"0")}`;
    $("#destino").value = v.destino;
    $("#producto").value = v.producto;
    $("#turno").value = v.turno;
    $("#operador").value = v.operador;
  },

  setEditMode(isEditing) {
    $("#btnAgregar").textContent = isEditing ? "Guardar Cambios" : "Agregar Viaje";
    $("#btnCancelar").textContent = isEditing ? "Cancelar" : "Cerrar";
  },

  showEditOptions() { $("#editOptions").style.display = "block"; },
  hideEditOptions() { $("#editOptions").style.display = "none"; }
};

const actions = {
  save() { storage.save(state.active); },

  addOrUpdateFromForm() {
    const f = $("#fecha").value;
    const destino = $("#destino").value;
    const producto = $("#producto").value;
    const turno = $("#turno").value;
    const operador = $("#operador").value;

    if (!f || !destino || !producto || !turno || !operador){
      alert("Completa todos los campos.");
      return;
    }

    const [a, m, d] = f.split("-");
    const v = {
      dia: parseInt(d, 10),
      mes: MONTHS[parseInt(m, 10) - 1],
      anio: parseInt(a, 10),
      destino, producto, turno, operador
    };

    if (state.editingIndex != null) {
      state.active[state.editingIndex] = v;
      state.editingIndex = null;
      ui.setEditMode(false);
    } else {
      state.active.push(v);
    }

    sorters.byDate(state.active);
    actions.save();
    ui.resetForm();
    ui.renderTable();
    ui.renderSummary();
    ui.closeModal();
  },

  edit(index) {
    const v = state.active[index];
    if (!validators.ok(v)) return alert("Registro inválido.");
    state.editingIndex = index;
    ui.fillForm(v);
    ui.setEditMode(true);
    ui.openModal();
  },

  remove(index) {
    state.active.splice(index, 1);
    actions.save();
    ui.renderTable();
    ui.renderSummary();
  },

  async finalizeMonth() {
    const list = state.active.filter(validators.ok);
    if (list.length === 0) return alert("No hay viajes activos para finalizar el mes.");
    if (!confirm("¿Estás seguro de finalizar el mes? Los viajes actuales se moverán al historial permanente y la pantalla se limpiará.")) return;

    try {
      const primerViaje = list[0];
      const year = primerViaje.anio;
      const monthName = primerViaje.mes;

      const monthNumber = String(MONTHS.indexOf(monthName) + 1).padStart(2, "0");
      const idKey = `${year}-${monthNumber}`; 

      await dbStorage.saveMonth(idKey, list);

      state.active = [];
      state.editingIndex = null;
      storage.clear();

      ui.setEditMode(false);
      ui.renderTable();
      ui.renderSummary();

      alert(`Mes finalizado con éxito. Guardado en el historial como: ${year} - ${monthName}`);
    } catch (error) {
      console.error(error);
      alert("Error crítico al intentar guardar en el almacenamiento del teléfono.");
    }
  }
};

function bindEvents() {
  $("#btnOpenModal").addEventListener("click", () => ui.openModal());
  $("#btnOpenResumen").addEventListener("click", ui.openSummary);
  $("#btnCloseResumen").addEventListener("click", ui.closeSummary);
  $("#btnOpenHistorial").addEventListener("click", () => { ui.closeSummary(); ui.openHistorial(); });
  
  $("#btnCerrarHistorial").addEventListener("click", () => {
    if ($("#btnCerrarHistorial").textContent === "Volver a la lista") {
      ui.renderHistorialList();
    } else {
      ui.closeHistorial();
    }
  });

  $("#btnFinalizarMes").addEventListener("click", actions.finalizeMonth);

  $("#btnAgregar").addEventListener("click", (e) => {
    e.preventDefault();
    actions.addOrUpdateFromForm();
  });

  $("#btnCancelar").addEventListener("click", (e) => {
    e.preventDefault();
    state.editingIndex = null;
    ui.setEditMode(false);
    ui.resetForm();
    ui.closeModal();
  });

  // Clicks interactivos en recuadros de operadores
  const boxDamian = $(".Damian");
  const boxCosme = $(".Cosme");
  boxDamian.style.cursor = "pointer";
  boxCosme.style.cursor = "pointer";

  boxDamian.addEventListener("click", () => {
    state.filterOperator = state.filterOperator === "Damian" ? null : "Damian";
    ui.renderSummary();
  });

  boxCosme.addEventListener("click", () => {
    state.filterOperator = state.filterOperator === "Cosme" ? null : "Cosme";
    ui.renderSummary();
  });

  // Clicks interactivos en recuadros de productos (Combustibles)
  const boxPremium = $(".resumen-Premium");
  const boxMagna = $(".resumen-Magna");
  const boxDiesel = $(".resumen-Diesel");
  
  boxPremium.style.cursor = "pointer";
  boxMagna.style.cursor = "pointer";
  boxDiesel.style.cursor = "pointer";

  boxPremium.addEventListener("click", () => {
    state.filterProduct = state.filterProduct === "Premium" ? null : "Premium";
    ui.renderSummary();
  });

  boxMagna.addEventListener("click", () => {
    state.filterProduct = state.filterProduct === "Magna" ? null : "Magna";
    ui.renderSummary();
  });

  boxDiesel.addEventListener("click", () => {
    state.filterProduct = state.filterProduct === "Diesel" ? null : "Diesel";
    ui.renderSummary();
  });

  const tbody = $("#tablaViajes tbody");

  const start = (index) => {
    clearTimeout(state.longPressTimer);
    state.longPressTimer = setTimeout(() => {
      state.selectedIndex = index;
      ui.showEditOptions();
    }, 600);
  };

  const stop = () => {
    clearTimeout(state.longPressTimer);
    state.longPressTimer = null;
  };

  tbody.addEventListener("pointerdown", (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const idx = parseInt(tr.dataset.index, 10);
    if (Number.isNaN(idx)) return;
    start(idx);
  });

  tbody.addEventListener("pointerup", stop);
  tbody.addEventListener("pointercancel", stop);
  tbody.addEventListener("pointerleave", stop);

  $("#optEdit").addEventListener("click", () => {
    ui.hideEditOptions();
    if (state.selectedIndex != null) actions.edit(state.selectedIndex);
    state.selectedIndex = null;
  });

  $("#optDelete").addEventListener("click", () => {
    ui.hideEditOptions();
    if (state.selectedIndex != null) actions.remove(state.selectedIndex);
    state.selectedIndex = null;
  });

  $("#optCancel").addEventListener("click", () => {
    ui.hideEditOptions();
    state.selectedIndex = null;
  });
}

function init() {
  state.active = storage.load();
  sorters.byDate(state.active);

  $("#fechaActual").textContent = new Date().toLocaleDateString("es-MX");

  ui.renderTable();
  ui.renderSummary();
  bindEvents();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(console.error);
    });
  }
}

init();
