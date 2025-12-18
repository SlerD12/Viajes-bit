const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const $ = (sel) => document.querySelector(sel);

const storage = {
  load() {
    return JSON.parse(localStorage.getItem("viajesActivos")) || [];
  },
  save(list) {
    localStorage.setItem("viajesActivos", JSON.stringify(list));
  },
  clear() {
    localStorage.removeItem("viajesActivos");
  }
};

const validators = {
  ok(v) {
    return v && typeof v === "object"
      && v.producto && v.destino && v.unidad && v.turno
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
      if (am !== bm) return am - bm;
      return a.dia - b.dia;
    });
  }
};

const state = {
  active: [],
  editingIndex: null,
  longPressTimer: null,
  selectedIndex: null
};

const ui = {
  renderTable() {
    const tbody = $("#tablaViajes tbody");
    tbody.innerHTML = "";

    state.active.forEach((v, idxReal) => {
      if (!validators.ok(v)) return;

      const productoClass =
        v.producto === "Premium" ? "producto-Premium" :
        v.producto === "Magna" ? "producto-Magna" : "producto-Diesel";

      const turnoClass = v.turno === "Turno 1" ? "turno-dia" : "turno-noche";

      const tr = document.createElement("tr");
      tr.className = turnoClass;
      tr.dataset.index = String(idxReal);
      tr.innerHTML = `
        <td>${v.dia}</td>
        <td>${v.mes}</td>
        <td>${v.destino}</td>
        <td class="${productoClass}">${v.producto}</td>
        <td>${v.unidad}</td>
      `;
      tbody.appendChild(tr);
    });
  },

  renderSummary() {
    const list = state.active.filter(validators.ok);

    const summary = {
      total: list.length,
      productos: { Premium: 0, Magna: 0, Diesel: 0 },
      destinos: { "Velam":0,"San Juan":0,"Noyowee":0,"0324":0,"Bajos del Ejido":0,"San Luis":0 },
      unidad: { fzc2460:0, fzv1449:0, fzv1452:0 }
    };

    for (const v of list) {
      if (summary.productos[v.producto] != null) summary.productos[v.producto]++;
      if (summary.destinos[v.destino] != null) summary.destinos[v.destino]++;
      if (summary.unidad[v.unidad] != null) summary.unidad[v.unidad]++;
    }

    $("#totalViajes").textContent = summary.total;
    $("#totalPremium").textContent = summary.productos.Premium;
    $("#totalMagna").textContent = summary.productos.Magna;
    $("#totalDiesel").textContent = summary.productos.Diesel;

    $("#velam").textContent = summary.destinos["Velam"];
    $("#sanjuan").textContent = summary.destinos["San Juan"];
    $("#noyo").textContent = summary.destinos["Noyowee"];
    $("#e0324").textContent = summary.destinos["0324"];
    $("#bajos").textContent = summary.destinos["Bajos del Ejido"];
    $("#sla").textContent = summary.destinos["San Luis"];

    $("#fzc2460").textContent = summary.unidad.fzc2460;
    $("#fzv1449").textContent = summary.unidad.fzv1449;
    $("#fzv1452").textContent = summary.unidad.fzv1452;
  },

  openModal() { $("#modal").style.display = "flex"; },
  closeModal() { $("#modal").style.display = "none"; },

  openSummary() {
    ui.renderSummary();
    $("#modal-resumen").style.display = "flex";
  },
  closeSummary() { $("#modal-resumen").style.display = "none"; },

  resetForm() {
    $("#fecha").value = "";
    $("#destino").selectedIndex = 0;
    $("#producto").selectedIndex = 0;
    $("#turno").selectedIndex = 0;
    $("#unidad").selectedIndex = 0;
  },

  fillForm(v) {
    const m = MONTHS.indexOf(v.mes);
    $("#fecha").value = `${v.anio}-${String(m+1).padStart(2,"0")}-${String(v.dia).padStart(2,"0")}`;
    $("#destino").value = v.destino;
    $("#producto").value = v.producto;
    $("#turno").value = v.turno;
    $("#unidad").value = v.unidad;
  },

  setEditMode(isEditing) {
    $("#btnAgregar").textContent = isEditing ? "Guardar Cambios" : "Agregar Viaje";
    $("#btnCancelar").textContent = isEditing ? "Cancelar" : "Cerrar";
  },

  showEditOptions() { $("#editOptions").style.display = "block"; },
  hideEditOptions() { $("#editOptions").style.display = "none"; }
};

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildPrintableHTML(title, rows) {
  const head = `
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:Arial,sans-serif;padding:16px;}
  h2{margin:0 0 10px 0;}
  .meta{margin-bottom:12px;color:#333}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #000;padding:8px;text-align:center;font-size:14px}
  th{background:#eee}
</style>
</head>
<body>
<h2>${title}</h2>
<div class="meta">Generado: ${new Date().toLocaleString("es-MX")}</div>
<table>
  <thead>
    <tr><th>Día</th><th>Mes</th><th>Destino</th><th>Producto</th><th>Turno</th><th>Unidad</th></tr>
  </thead>
  <tbody>
`;
  const body = rows.map(v => `
    <tr>
      <td>${v.dia}</td>
      <td>${v.mes}</td>
      <td>${v.destino}</td>
      <td>${v.producto}</td>
      <td>${v.turno}</td>
      <td>${v.unidad}</td>
    </tr>
  `).join("");

  const foot = `
  </tbody>
</table>
<script>
  // abre diálogo de imprimir automáticamente (en Android permite "Guardar como PDF")
  window.onload = () => { setTimeout(() => window.print(), 200); };
</script>
</body>
</html>`;
  return head + body + foot;
}

function openPrintableAsNewTab(htmlString) {
  const blob = new Blob([htmlString], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  // no revocar inmediato para que alcance a cargar; el navegador lo limpia luego.
}

const actions = {
  save() { storage.save(state.active); },

  addOrUpdateFromForm() {
    const f = $("#fecha").value;
    const destino = $("#destino").value;
    const producto = $("#producto").value;
    const turno = $("#turno").value;
    const unidad = $("#unidad").value;

    if (!f || !destino || !producto || !turno || !unidad) {
      alert("Completa todos los campos.");
      return;
    }

    const [a, m, d] = f.split("-");
    const v = {
      dia: parseInt(d, 10),
      mes: MONTHS[parseInt(m, 10) - 1],
      anio: parseInt(a, 10),
      destino, producto, turno, unidad
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

  // ✅ Finaliza mes => exporta TXT + abre impresión (PDF) + limpia datos
  finalizeMonthExport() {
    const list = state.active.filter(validators.ok);
    if (list.length === 0) return alert("No hay viajes para exportar.");

    // nombre: Viajes_YYYY-MM (numérico, fácil)
    const now = new Date();
    const y = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const baseName = `Viajes_${y}-${mm}`;

    // 1) TXT simple
    const txt = [
      `${baseName}`,
      `Generado: ${now.toLocaleString("es-MX")}`,
      "",
      "DIA\tMES\tDESTINO\tPRODUCTO\tTURNO\tUNIDAD",
      ...list.map(v => `${v.dia}\t${v.mes}\t${v.destino}\t${v.producto}\t${v.turno}\t${v.unidad}`)
    ].join("\n");
    downloadText(`${baseName}.txt`, txt);

    // 2) “PDF” vía imprimir (abre una pestaña imprimible)
    const printable = buildPrintableHTML(baseName, list);
    openPrintableAsNewTab(printable);

    // 3) limpiar datos
    state.active = [];
    state.editingIndex = null;
    ui.setEditMode(false);

    storage.clear();
    ui.renderTable();
    ui.renderSummary();

    alert("Exportado y limpiado. En la pestaña nueva usa: Imprimir → Guardar como PDF.");
  }
};

function bindEvents() {
  $("#btnOpenModal").addEventListener("click", () => ui.openModal());
  $("#btnFinalizarMes").addEventListener("click", actions.finalizeMonthExport);
  $("#btnOpenResumen").addEventListener("click", ui.openSummary);
  $("#btnCloseResumen").addEventListener("click", ui.closeSummary);

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

  // long press (pointer events)
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

  // SW opcional
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(console.error);
    });
  }
}

init();
