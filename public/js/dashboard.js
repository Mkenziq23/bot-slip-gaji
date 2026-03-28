// =============================
// INITIALIZATION & VARIABLES
// =============================
document.getElementById("logoutBtn").onclick = async () => {
  const result = await Swal.fire({
    title: "Keluar Aplikasi?",
    text: "Sesi Anda akan diakhiri, dan anda perlu scan ulang.",
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#2563eb",
    confirmButtonText: "Ya, Logout",
    cancelButtonText: "Batal",
  });

  if (result.isConfirmed) {
    await fetch("/logout");
    window.location.href = "/";
  }
};

async function checkAdminRole() {
  try {
    const res = await fetch("/api/admin/me");
    const data = await res.json();

    if (!data.loggedIn) return;

    if (data.role === "admin" || data.role === "superadmin") {
      document.getElementById("manageUsersBtn").style.display = "inline-block";
    }
  } catch (err) {
    console.error("Role check error:", err);
  }
}

checkAdminRole();

document.getElementById("manageUsersBtn")?.addEventListener("click", () => {
  window.location.href = "/manage-users";
});

// =============================
// GLOBAL GAJI
// =============================
let dataAll = [];
let filteredData = [];
let currentPageData = 1;
const pageSizeData = 10;
let currentPage = 1;
const pageSize = 10;
let checkedSet = new Set();
let currentCompany = "hisana";
let gajiDuplicateCheckInterval = null;

// =============================
// BONUS GLOBAL
// =============================
let bonusData = [];
let currentBonusPage = 1;
const pageSizeBonus = 10;
let selectedBonusSet = new Set();
let bonusDuplicateCheckInterval = null;
let bonusProgressInterval = null;

let bonusProgress = {
  running: false,
  total: 0,
  sent: 0,
  failed: 0,
};

// =============================
// THR GLOBAL THR
// =============================
let thrData = [];
let currentThrPage = 1;
const pageSizeThr = 10;
let thrProgress = {
  running: false,
  total: 0,
  sent: 0,
  failed: 0,
};
let thrProgressInterval = null;
let selectedThrSet = new Set();
let currentThrYear = new Date().getFullYear();
let thrDuplicateCheckInterval = null;

function rupiah(x) {
  if (!x) return "Rp 0";
  return "Rp " + Number(x).toLocaleString("id-ID");
}

// =============================
// LOAD DATA
// =============================
async function loadData() {
  try {
    const res = await fetch(`/my-slip?company=${currentCompany}`);
    let data = await res.json();
    dataAll = data;

    const now = new Date();
    const bulan = now.toLocaleString("id-ID", { month: "long" });
    const tahun = now.getFullYear();

    console.log(`Loaded data for ${currentCompany} - ${bulan} ${tahun}:`, dataAll.length, "records");

    renderTable();
    renderDataTable();

    // Update select all status setelah render table
    setTimeout(() => {
      updateSelectAllSlipStatus();
    }, 100);
  } catch (err) {
    console.error("Load data error:", err);
  }
}
// =============================
// UPLOAD EXCEL
// =============================
async function uploadExcel(formData, statusId, formId) {
  const statusEl = document.getElementById(statusId);
  const formEl = document.getElementById(formId);
  statusEl.innerText = "Sedang memproses...";
  try {
    const res = await fetch("/upload", { method: "POST", body: formData });
    const result = await res.json();
    if (result.success) {
      Swal.fire("Import Berhasil!", result.message, "success");
      await loadData();
      formEl.reset();
    } else {
      Swal.fire("Import Gagal", result.message, "error");
    }
  } catch (err) {
    console.error(err);
    Swal.fire("Import Gagal", "Terjadi kesalahan saat upload", "error");
  } finally {
    statusEl.innerText = "";
  }
}

document.getElementById("uploadFormKirim").onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  formData.append("company", currentCompany);
  await uploadExcel(formData, "uploadStatus", "uploadFormKirim");
};

document.getElementById("uploadFormData").onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  formData.append("company", currentCompany);
  await uploadExcel(formData, "uploadStatus", "uploadFormData");
};

// =============================
// DOWNLOAD TEMPLATE
// =============================
document.getElementById("downloadTemplateBtn").onclick = () => {
  let wb = XLSX.utils.book_new();
  let ws_data = [];

  if (currentCompany === "hisana") {
    ws_data = [["No Induk", "NAMA", "POSISI", "STORE", "AWAL MASUK", "KERJA", "GAJI", "Iuran BPJS Ketenagakerjaan", "KERAJINAN", "CUTI", "Tunj. BPJS & Pulsa", "JUMLAH", "UM", "KETERANGAN", "GAJI TOTAL", "NO HP"]];
  } else {
    ws_data = [["No Induk", "Nama Karyawan", "Tanggal Masuk", "Jabatan", "Penempatan", "Gaji Utuh", "Gaji Pokok", "BPJS Kesehatan", "Insentif", "Total Gaji", "Keterangan", "No HP"]];
  }

  let ws = XLSX.utils.aoa_to_sheet(ws_data);
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.writeFile(wb, `Template_${currentCompany}.xlsx`);
};

// =============================
// FORM RENDER FUNCTIONS
// =============================
function renderFormFields() {
  const formGrid = document.getElementById("formFields");
  if (!formGrid) return;

  if (currentCompany === "hisana") {
    formGrid.innerHTML = `
      <div class="formGroup"><label>No Induk *</label><input type="text" id="no_induk" required placeholder="Contoh: H001" /></div>
      <div class="formGroup"><label>Nama Karyawan *</label><input type="text" id="nama" required placeholder="Nama lengkap" /></div>
      <div class="formGroup"><label>Posisi *</label><input type="text" id="posisi" required placeholder="Contoh: Staff, Supervisor" /></div>
      <div class="formGroup"><label>Store *</label><input type="text" id="store" required placeholder="Nama store/toko" /></div>
      <div class="formGroup"><label>Tanggal Awal Masuk</label><input type="date" id="awal_masuk" /></div>
      <div class="formGroup"><label>Jumlah Hari Kerja *</label><input type="number" id="kerja" required value="0" step="1" /></div>
      <div class="formGroup"><label>Gaji Pokok *</label><input type="number" id="gaji" required value="0" step="1000" /></div>
      <div class="formGroup"><label>Iuran BPJS Ketenagakerjaan</label><input type="number" id="iuran_bpjs_ketenagakerjaan" value="0" step="1000" /></div>
      <div class="formGroup"><label>Kerajinan</label><input type="number" id="kerajinan" value="0" step="1000" /></div>
      <div class="formGroup"><label>Cuti</label><input type="number" id="cuti" value="0" step="1000" /></div>
      <div class="formGroup"><label>Tunjangan BPJS & Pulsa</label><input type="number" id="tunj_bpjs_pulsa" value="0" step="1000" /></div>
      <div class="formGroup"><label>Total Perhitungan</label><input type="number" id="jumlah" readonly style="background:#f3f4f6" /></div>
      <div class="formGroup"><label>Uang Makan (UM) *</label><input type="number" id="um" required value="0" step="1000" /></div>
      <div class="formGroup"><label>Keterangan</label><input type="text" id="keterangan" placeholder="Opsional" /></div>
      <div class="formGroup"><label>Total Gaji</label><input type="number" id="gaji_total" readonly style="background:#f3f4f6" /></div>
      <div class="formGroup"><label>No HP Karyawan *</label><input type="text" id="nohp" required placeholder="Contoh: 628123456789" /></div>
    `;

    const triggerIds = ["gaji", "iuran_bpjs_ketenagakerjaan", "kerajinan", "cuti", "tunj_bpjs_pulsa", "um"];
    triggerIds.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.removeEventListener("input", calculatePayroll);
        element.addEventListener("input", calculatePayroll);
      }
    });
    calculatePayroll();
  } else {
    formGrid.innerHTML = `
      <div class="formGroup"><label>No Induk *</label><input type="text" id="no_induk" required placeholder="Contoh: E001" /></div>
      <div class="formGroup"><label>Nama Karyawan *</label><input type="text" id="nama_karyawan" required placeholder="Nama lengkap" /></div>
      <div class="formGroup"><label>Tanggal Masuk *</label><input type="date" id="tanggal_masuk" required /></div>
      <div class="formGroup"><label>Jabatan *</label><input type="text" id="jabatan" required placeholder="Contoh: Staff, Supervisor" /></div>
      <div class="formGroup"><label>Penempatan</label><input type="text" id="penempatan" placeholder="Contoh: Blimbing, Kepanjen" /></div>
      <div class="formGroup"><label>Gaji Utuh</label><input type="number" id="gaji_utuh" value="0" step="1000" /></div>
      <div class="formGroup"><label>Gaji Pokok *</label><input type="number" id="gaji_pokok" required value="0" step="1000" /></div>
      <div class="formGroup"><label>BPJS Kesehatan</label><input type="number" id="bpjs_kesehatan" value="0" step="1000" /></div>
      <div class="formGroup"><label>Insentif</label><input type="number" id="insentif" value="0" step="1000" /></div>
      <div class="formGroup"><label>Total Gaji</label><input type="number" id="total_gaji" readonly style="background:#f3f4f6" /></div>
      <div class="formGroup"><label>Keterangan</label><input type="text" id="keterangan" placeholder="Opsional" /></div>
      <div class="formGroup"><label>No HP Karyawan *</label><input type="text" id="nohp" required placeholder="Contoh: 628123456789" /></div>
    `;

    const triggerIdsEnakko = ["gaji_utuh", "gaji_pokok", "bpjs_kesehatan", "insentif"];
    triggerIdsEnakko.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.removeEventListener("input", calculateEnakkoTotal);
        element.addEventListener("input", calculateEnakkoTotal);
      }
    });
    calculateEnakkoTotal();
  }
}

function calculatePayroll() {
  const gaji = parseFloat(document.getElementById("gaji")?.value) || 0;
  const iuran = parseFloat(document.getElementById("iuran_bpjs_ketenagakerjaan")?.value) || 0;
  const kerajinan = parseFloat(document.getElementById("kerajinan")?.value) || 0;
  const cuti = parseFloat(document.getElementById("cuti")?.value) || 0;
  const tunjangan = parseFloat(document.getElementById("tunj_bpjs_pulsa")?.value) || 0;
  const um = parseFloat(document.getElementById("um")?.value) || 0;

  const jumlah = gaji - iuran + kerajinan + cuti + tunjangan;
  const gajiTotal = jumlah + um;

  const jumlahField = document.getElementById("jumlah");
  const gajiTotalField = document.getElementById("gaji_total");
  if (jumlahField) jumlahField.value = Math.round(jumlah);
  if (gajiTotalField) gajiTotalField.value = Math.round(gajiTotal);
}

function calculateEnakkoTotal() {
  const gajiUtuh = parseFloat(document.getElementById("gaji_utuh")?.value) || 0;
  const gajiPokok = parseFloat(document.getElementById("gaji_pokok")?.value) || 0;
  const bpjsKesehatan = parseFloat(document.getElementById("bpjs_kesehatan")?.value) || 0;
  const insentif = parseFloat(document.getElementById("insentif")?.value) || 0;

  const totalGaji = gajiPokok + bpjsKesehatan + insentif;

  const totalGajiField = document.getElementById("total_gaji");
  if (totalGajiField) {
    totalGajiField.value = Math.round(totalGaji);
  }
}

// =============================
// NAVIGASI MENU
// =============================
const menuHisanaBtn = document.getElementById("menuHisana");
const menuEnakkoBtn = document.getElementById("menuEnakko");
const submenuHisana = document.getElementById("submenuHisana");
const submenuEnakko = document.getElementById("submenuEnakko");

function activateSubmenu(btnId, sectionId) {
  const parent = document.getElementById(btnId).parentNode;
  parent.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  document.getElementById(btnId).classList.add("active");

  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  document.getElementById(sectionId).classList.add("active");

  if (sectionId === "sectionData") {
    checkDuplicateStatus();
  }
}

function switchMainMenu(company) {
  currentCompany = company;
  checkedSet.clear();
  selectedBonusSet.clear();
  selectedThrSet.clear();
  currentPage = 1;
  currentPageData = 1;
  currentBonusPage = 1;
  currentThrPage = 1;

  resetBonusProgress();
  resetThrProgress();

  // Reset progress untuk Kirim Slip
  const progressContainer = document.getElementById("progressContainer");
  const progressBar = document.getElementById("bar");
  if (progressContainer) progressContainer.style.display = "none";
  if (progressBar) progressBar.style.width = "0%";

  renderTableHeader();
  renderDataTableHeader();
  loadData();

  if (company === "hisana") {
    menuHisanaBtn.classList.add("active");
    menuEnakkoBtn.classList.remove("active");
    submenuHisana.style.display = "flex";
    submenuEnakko.style.display = "none";
    document.getElementById("menuDataHisana").click();
  } else {
    menuEnakkoBtn.classList.add("active");
    menuHisanaBtn.classList.remove("active");
    submenuEnakko.style.display = "flex";
    submenuHisana.style.display = "none";
    document.getElementById("menuDataEnakko").click();
  }

  stopBonusDuplicateStatusCheck();
  stopThrDuplicateStatusCheck();
  stopGajiDuplicateStatusCheck();
  setTimeout(() => {
    checkBonusDuplicateStatus();
    startBonusDuplicateStatusCheck();
    checkThrDuplicateStatus();
    startThrDuplicateStatusCheck();
    checkDuplicateStatus();
    startGajiDuplicateStatusCheck();
  }, 500);
}

menuHisanaBtn.onclick = () => switchMainMenu("hisana");
menuEnakkoBtn.onclick = () => switchMainMenu("enakko");

// =============================
// SUBMENU HANDLERS
// =============================
document.getElementById("menuKirimHisana").onclick = () => {
  activateSubmenu("menuKirimHisana", "sectionKirim");
  renderTable();
};
document.getElementById("menuDataHisana").onclick = () => {
  activateSubmenu("menuDataHisana", "sectionData");
  renderDataTableHeader();
  renderDataTable();
};
document.getElementById("menuBonusHisana").onclick = () => {
  activateSubmenu("menuBonusHisana", "sectionBonus");
  loadBonusData();
};
document.getElementById("menuTHRHisana").onclick = () => {
  activateSubmenu("menuTHRHisana", "sectionTHR");
  loadThrData();
};

document.getElementById("menuKirimEnakko").onclick = () => {
  activateSubmenu("menuKirimEnakko", "sectionKirim");
  renderTable();
};
document.getElementById("menuDataEnakko").onclick = () => {
  activateSubmenu("menuDataEnakko", "sectionData");
  renderDataTableHeader();
  renderDataTable();
};
document.getElementById("menuBonusEnakko").onclick = () => {
  activateSubmenu("menuBonusEnakko", "sectionBonus");
  loadBonusData();
};
document.getElementById("menuTHREnakko").onclick = () => {
  activateSubmenu("menuTHREnakko", "sectionTHR");
  loadThrData();
};

window.addEventListener("DOMContentLoaded", () => {
  if (!currentCompany) currentCompany = "hisana";
  switchMainMenu(currentCompany);
});

// =============================
// TABLE RENDER FUNCTIONS
// =============================
function renderTableHeader() {
  const thead = document.querySelector("#table thead");
  if (!thead) return;

  if (currentCompany === "hisana") {
    thead.innerHTML = `
      <tr>
        <th><input type="checkbox" id="selectAllSlip" class="select-all-checkbox"></th>
        <th>No</th>
        <th>No Induk</th>
        <th>Nama</th>
        <th>Posisi</th>
        <th>Store</th>
        <th>Awal Masuk</th>
        <th>Kerja</th>
        <th>Gaji</th>
        <th>Iuran BPJS</th>
        <th>Kerajinan</th>
        <th>Cuti</th>
        <th>Tunj. Bpjs & Pulsa</th>
        <th>Total</th>
        <th>UM</th>
        <th>Keterangan</th>
        <th>Gaji Total</th>
        <th>No HP</th>
        <th>Status Slip</th>
      </tr>
    `;
  } else {
    thead.innerHTML = `
      <tr>
        <th><i class="fas fa-check-square"></i></th>
        <th>No</th>
        <th>No Induk</th>
        <th>Nama</th>
        <th>Tanggal Masuk</th>
        <th>Jabatan</th>
        <th>Penempatan</th>
        <th>Gaji Utuh</th>
        <th>Gaji Pokok</th>
        <th>BPJS Kesehatan</th>
        <th>Insentif</th>
        <th>Total Gaji</th>
        <th>Keterangan</th>
        <th>No HP</th>
        <th>Status Slip</th>
      </tr>
    `;
  }
}

function renderTable() {
  const tbody = document.querySelector("#table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const query = document.getElementById("searchInput")?.value.toLowerCase() || "";
  const filtered = dataAll.filter((d) => Object.values(d).some((v) => String(v).toLowerCase().includes(query)));
  const totalPages = Math.ceil(filtered.length / pageSize);
  if (currentPage > totalPages) currentPage = 1;
  const start = (currentPage - 1) * pageSize;
  const pageData = filtered.slice(start, start + pageSize);

  pageData.forEach((d, i) => {
    const tr = document.createElement("tr");
    const checked = checkedSet.has(d.no_induk) ? "checked" : "";
    let statusBadge = d.status_slip === "terkirim" ? '<span class="status-badge success"><i class="fas fa-check-circle"></i> Terkirim</span>' : '<span class="status-badge pending"><i class="fas fa-clock"></i> Belum Dikirim</span>';

    if (currentCompany === "hisana") {
      let awalMasukFormatted = d.awal_masuk ? new Date(d.awal_masuk).toISOString().split("T")[0] : "";
      tr.innerHTML = `
        <td><input type="checkbox" class="chk chk-slip" data-noinduk="${d.no_induk}" ${checked} ${d.status_slip === "terkirim" ? "disabled" : ""}>\\
        <td class="text-center">${start + i + 1}</td>\\
        <td>${d.no_induk}</td>\\
        <td style="font-weight:600">${d.nama}</td>\\
        <td>${d.posisi}</td>\\
        <td>${d.store}</td>\\
        <td>${awalMasukFormatted}</td>\\
        <td>${d.kerja}</td>\\
        <td class="money">${rupiah(d.gaji)}</td>\\
        <td class="deduction">-${rupiah(d.iuran_bpjs_ketenagakerjaan)}</td>\\
        <td>${rupiah(d.kerajinan)}</td>\\
        <td>${rupiah(d.cuti)}</td>\\
        <td>${rupiah(d.tunj_bpjs_pulsa)}</td>\\
        <td class="total-bold">${rupiah(d.jumlah)}</td>\\
        <td>${rupiah(d.um)}</td>\\
        <td style="font-style:italic; color:var(--text-muted)">${d.keterangan || "-"}</td>\\
        <td class="total-bold" style="background:#f0f9ff">${rupiah(d.gaji_total)}</td>\\
        <td>${d.nohp}</td>\\
        <td>${statusBadge}</td>\\
      `;
    } else {
      let tanggalMasukFormatted = d.tanggal_masuk ? new Date(d.tanggal_masuk).toISOString().split("T")[0] : "";
      tr.innerHTML = `
        <td><input type="checkbox" class="chk chk-slip" data-noinduk="${d.no_induk}" ${checked} ${d.status_slip === "terkirim" ? "disabled" : ""}>\\
        <td class="text-center">${start + i + 1}</td>\\
        <td>${d.no_induk}</td>\\
        <td style="font-weight:600">${d.nama_karyawan || d.nama}</td>\\
        <td>${tanggalMasukFormatted}</td>\\
        <td>${d.jabatan || "-"}</td>\\
        <td>${d.penempatan || "-"}</td>\\
        <td class="money">${rupiah(d.gaji_utuh || 0)}</td>\\
        <td class="money">${rupiah(d.gaji_pokok || 0)}</td>\\
        <td>${rupiah(d.bpjs_kesehatan || 0)}</td>\\
        <td>${rupiah(d.insentif || 0)}</td>\\
        <td class="total-bold">${rupiah(d.total_gaji || 0)}</td>\\
        <td style="font-style:italic; color:var(--text-muted)">${d.keterangan || "-"}</td>\\
        <td>${d.nohp}</td>\\
        <td>${statusBadge}</td>\\
      `;
    }
    tbody.appendChild(tr);
  });

  // Attach event handler untuk setiap checkbox individu
  attachIndividualCheckboxHandlers();

  // Setup dan update select all checkbox
  setupSelectAllSlipListener();
  updateSelectAllSlipStatus();

  const pageInfo = document.getElementById("pageInfo");
  if (pageInfo) pageInfo.innerText = `Halaman ${currentPage} dari ${totalPages || 1}`;
}

// Fungsi terpisah untuk attach event handler checkbox individu
function attachIndividualCheckboxHandlers() {
  document.querySelectorAll(".chk-slip").forEach((chk) => {
    // Hapus listener lama jika ada
    const newChk = chk.cloneNode(true);
    chk.parentNode.replaceChild(newChk, chk);

    if (!newChk.disabled) {
      newChk.onchange = (e) => {
        const no = e.target.dataset.noinduk;
        if (e.target.checked) {
          checkedSet.add(no);
        } else {
          checkedSet.delete(no);
        }

        // Update status checkbox select all
        updateSelectAllSlipStatus();

        // Debug: log jumlah yang dipilih
        console.log("Selected count:", checkedSet.size);
      };
    }
  });
}
// Fungsi untuk setup event listener select all
function setupSelectAllSlipListener() {
  const selectAllCheckbox = document.getElementById("selectAllSlip");
  if (!selectAllCheckbox) return;

  // Hapus listener lama jika ada
  const newSelectAll = selectAllCheckbox.cloneNode(true);
  selectAllCheckbox.parentNode.replaceChild(newSelectAll, selectAllCheckbox);

  // Tambahkan listener baru
  newSelectAll.addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    const checkboxes = document.querySelectorAll(".chk-slip:not(:disabled)");

    checkboxes.forEach((chk) => {
      chk.checked = isChecked;
      const noInduk = chk.dataset.noinduk;
      if (isChecked) {
        checkedSet.add(noInduk);
      } else {
        checkedSet.delete(noInduk);
      }
    });
  });
}

// Fungsi untuk update status checkbox select all
function updateSelectAllSlipStatus() {
  const selectAllCheckbox = document.getElementById("selectAllSlip");
  if (!selectAllCheckbox) return;

  const checkboxes = document.querySelectorAll(".chk-slip:not(:disabled)");
  const checkedCheckboxes = document.querySelectorAll(".chk-slip:checked:not(:disabled)");

  if (checkboxes.length === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  } else if (checkedCheckboxes.length === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  } else if (checkedCheckboxes.length === checkboxes.length) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true;
  }
}

// =============================
// DATA TABLE FUNCTIONS
// =============================
function renderDataTableHeader() {
  const thead = document.querySelector("#tableData thead");
  if (!thead) return;

  if (currentCompany === "hisana") {
    thead.innerHTML = `
      <tr>
        <th>No</th>
        <th>No Induk</th>
        <th>Nama</th>
        <th>Posisi</th>
        <th>Store</th>
        <th>Awal Masuk</th>
        <th>Kerja</th>
        <th>Gaji</th>
        <th>Iuran BPJS</th>
        <th>Kerajinan</th>
        <th>Cuti</th>
        <th>Tunj. Bpjs & Pulsa</th>
        <th>Total</th>
        <th>UM</th>
        <th>Keterangan</th>
        <th>Gaji Total</th>
        <th>No HP</th>
        <th>Status Slip</th>
        <th style="min-width:150px">Aksi</th>
      </tr>
    `;
  } else {
    thead.innerHTML = `
      <tr>
        <th>No</th>
        <th>No Induk</th>
        <th>Nama Karyawan</th>
        <th>Tanggal Masuk</th>
        <th>Jabatan</th>
        <th>Penempatan</th>
        <th>Gaji Utuh</th>
        <th>Gaji Pokok</th>
        <th>BPJS Kesehatan</th>
        <th>Insentif</th>
        <th>Total Gaji</th>
        <th>Keterangan</th>
        <th>No HP</th>
        <th>Status Slip</th>
        <th style="min-width:150px">Aksi</th>
      </tr>
    `;
  }
}

function renderDataTable() {
  const tbody = document.querySelector("#tableData tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const query = document.getElementById("searchDataInput")?.value.toLowerCase() || "";
  filteredData = dataAll.filter((d) => Object.values(d).some((v) => String(v).toLowerCase().includes(query)));
  const totalPages = Math.ceil(filteredData.length / pageSizeData);
  if (currentPageData > totalPages) currentPageData = 1;
  const start = (currentPageData - 1) * pageSizeData;
  const pageData = filteredData.slice(start, start + pageSizeData);

  pageData.forEach((d, i) => {
    const tr = document.createElement("tr");
    let statusBadge = d.status_slip === "terkirim" ? '<span class="status-badge success"><i class="fas fa-check-circle"></i> Terkirim</span>' : '<span class="status-badge pending"><i class="fas fa-clock"></i> Belum Dikirim</span>';

    if (currentCompany === "hisana") {
      let awalMasukFormatted = d.awal_masuk ? new Date(d.awal_masuk).toISOString().split("T")[0] : "";
      tr.innerHTML = `
        <td>${start + i + 1}</td>
        <td>${d.no_induk}</td>
        <td style="font-weight:600">${d.nama}</td>
        <td>${d.posisi}</td>
        <td>${d.store}</td>
        <td>${awalMasukFormatted}</td>
        <td>${d.kerja}</td>
        <td class="money">${rupiah(d.gaji)}</td>
        <td class="deduction">-${rupiah(d.iuran_bpjs_ketenagakerjaan)}</td>
        <td>${rupiah(d.kerajinan)}</td>
        <td>${rupiah(d.cuti)}</td>
        <td>${rupiah(d.tunj_bpjs_pulsa)}</td>
        <td class="total-bold">${rupiah(d.jumlah)}</td>
        <td>${rupiah(d.um)}</td>
        <td>${d.keterangan || "-"}</td>
        <td class="total-bold" style="background:#fffbeb">${rupiah(d.gaji_total)}</td>
        <td>${d.nohp}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn-primary" style="padding: 5px 10px;" onclick='openModalById(${d.id})'><i class="fas fa-edit"></i></button>
          <button class="btn-danger" style="padding: 5px 10px;" onclick='deleteData(${d.id})'><i class="fas fa-trash"></i></button>
        </td>
      `;
    } else {
      let tanggalMasukFormatted = d.tanggal_masuk ? new Date(d.tanggal_masuk).toISOString().split("T")[0] : "";
      tr.innerHTML = `
        <td>${start + i + 1}</td>
        <td>${d.no_induk}</td>
        <td style="font-weight:600">${d.nama_karyawan || d.nama}</td>
        <td>${tanggalMasukFormatted}</td>
        <td>${d.jabatan || "-"}</td>
        <td>${d.penempatan || "-"}</td>
        <td class="money">${rupiah(d.gaji_utuh || 0)}</td>
        <td class="money">${rupiah(d.gaji_pokok || 0)}</td>
        <td class="deduction">-${rupiah(d.bpjs_kesehatan || 0)}</td>
        <td>${rupiah(d.insentif || 0)}</td>
        <td class="total-bold">${rupiah(d.total_gaji || 0)}</td>
        <td>${d.keterangan || "-"}</td>
        <td>${d.nohp}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn-primary" style="padding:5px 10px;" onclick='openModalById(${d.id})'><i class="fas fa-edit"></i></button>
          <button class="btn-danger" style="padding:5px 10px;" onclick='deleteData(${d.id})'><i class="fas fa-trash"></i></button>
        </td>
      `;
    }
    tbody.appendChild(tr);
  });

  const dataPageInfo = document.getElementById("dataPageInfo");
  if (dataPageInfo) dataPageInfo.innerText = `Halaman ${currentPageData} dari ${totalPages || 1}`;
}

// =============================
// GAJI FUNCTIONS
// =============================
function openModal(item = null) {
  const modal = document.getElementById("dataModal");
  if (!modal) return;

  modal.style.display = "flex";
  renderFormFields();

  if (item) {
    document.getElementById("modalTitle").innerText = "Edit Data Slip";
    document.getElementById("dataId").value = item.id;

    if (currentCompany === "hisana") {
      const fields = ["no_induk", "nama", "posisi", "store", "awal_masuk", "kerja", "gaji", "iuran_bpjs_ketenagakerjaan", "kerajinan", "cuti", "tunj_bpjs_pulsa", "jumlah", "um", "keterangan", "gaji_total", "nohp"];
      fields.forEach((k) => {
        const el = document.getElementById(k);
        if (!el) return;
        if (k === "awal_masuk" && item[k]) {
          el.value = new Date(item[k]).toISOString().split("T")[0];
        } else {
          el.value = item[k] || "";
        }
      });
      calculatePayroll();
    } else {
      document.getElementById("no_induk").value = item.no_induk || "";
      document.getElementById("nama_karyawan").value = item.nama_karyawan || item.nama || "";
      document.getElementById("tanggal_masuk").value = item.tanggal_masuk ? new Date(item.tanggal_masuk).toISOString().split("T")[0] : "";
      document.getElementById("jabatan").value = item.jabatan || "";
      document.getElementById("penempatan").value = item.penempatan || "";
      document.getElementById("gaji_utuh").value = item.gaji_utuh || 0;
      document.getElementById("gaji_pokok").value = item.gaji_pokok || 0;
      document.getElementById("bpjs_kesehatan").value = item.bpjs_kesehatan || 0;
      document.getElementById("insentif").value = item.insentif || 0;
      document.getElementById("total_gaji").value = item.total_gaji || 0;
      document.getElementById("keterangan").value = item.keterangan || "";
      document.getElementById("nohp").value = item.nohp || "";
      calculateEnakkoTotal();
    }
  } else {
    document.getElementById("modalTitle").innerText = "Tambah Data Slip Baru";
    document.getElementById("dataForm").reset();
    document.getElementById("dataId").value = "";

    if (currentCompany === "hisana") {
      if (document.getElementById("kerja")) document.getElementById("kerja").value = 0;
      if (document.getElementById("gaji")) document.getElementById("gaji").value = 0;
      if (document.getElementById("iuran_bpjs_ketenagakerjaan")) document.getElementById("iuran_bpjs_ketenagakerjaan").value = 0;
      if (document.getElementById("kerajinan")) document.getElementById("kerajinan").value = 0;
      if (document.getElementById("cuti")) document.getElementById("cuti").value = 0;
      if (document.getElementById("tunj_bpjs_pulsa")) document.getElementById("tunj_bpjs_pulsa").value = 0;
      if (document.getElementById("um")) document.getElementById("um").value = 0;
      calculatePayroll();
    } else {
      if (document.getElementById("gaji_utuh")) document.getElementById("gaji_utuh").value = 0;
      if (document.getElementById("gaji_pokok")) document.getElementById("gaji_pokok").value = 0;
      if (document.getElementById("bpjs_kesehatan")) document.getElementById("bpjs_kesehatan").value = 0;
      if (document.getElementById("insentif")) document.getElementById("insentif").value = 0;
      calculateEnakkoTotal();
    }
  }
}

window.openModalById = (id) => {
  const item = dataAll.find((d) => d.id == id);
  openModal(item);
};

// =============================
// CRUD OPERATIONS
// =============================
window.deleteData = async (id) => {
  const result = await Swal.fire({
    title: "Apakah Anda yakin?",
    text: "Data slip ini akan dihapus secara permanen!",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    confirmButtonText: "Ya, hapus!",
    cancelButtonText: "Batal",
  });

  if (!result.isConfirmed) return;

  try {
    const res = await fetch(`/slip/${id}?company=${currentCompany}`, { method: "DELETE" });
    const resultData = await res.json();

    if (resultData.success) {
      Swal.fire("Berhasil!", "Data berhasil dihapus.", "success");
      await loadData();
    } else {
      Swal.fire("Gagal!", resultData.message || "Data tidak ditemukan.", "error");
    }
  } catch (err) {
    console.error(err);
    Swal.fire("Error!", "Server error: " + err.message, "error");
  }
};

document.getElementById("dataForm").onsubmit = async (e) => {
  e.preventDefault();

  const id = document.getElementById("dataId").value;
  let payload = {};

  if (currentCompany === "hisana") {
    payload = {
      no_induk: document.getElementById("no_induk")?.value || "",
      nama: document.getElementById("nama")?.value || "",
      posisi: document.getElementById("posisi")?.value || "",
      store: document.getElementById("store")?.value || "",
      awal_masuk: document.getElementById("awal_masuk")?.value || null,
      kerja: parseInt(document.getElementById("kerja")?.value) || 0,
      gaji: parseFloat(document.getElementById("gaji")?.value) || 0,
      iuran_bpjs_ketenagakerjaan: parseFloat(document.getElementById("iuran_bpjs_ketenagakerjaan")?.value) || 0,
      kerajinan: parseFloat(document.getElementById("kerajinan")?.value) || 0,
      cuti: parseFloat(document.getElementById("cuti")?.value) || 0,
      tunj_bpjs_pulsa: parseFloat(document.getElementById("tunj_bpjs_pulsa")?.value) || 0,
      jumlah: parseFloat(document.getElementById("jumlah")?.value) || 0,
      um: parseFloat(document.getElementById("um")?.value) || 0,
      keterangan: document.getElementById("keterangan")?.value || "",
      gaji_total: parseFloat(document.getElementById("gaji_total")?.value) || 0,
      nohp: document.getElementById("nohp")?.value || "",
    };

    if (!payload.no_induk || !payload.nama || !payload.posisi || !payload.store || !payload.nohp) {
      Swal.fire("Error", "Semua field wajib diisi", "error");
      return;
    }
  } else {
    payload = {
      no_induk: document.getElementById("no_induk")?.value || "",
      nama_karyawan: document.getElementById("nama_karyawan")?.value || "",
      tanggal_masuk: document.getElementById("tanggal_masuk")?.value || null,
      jabatan: document.getElementById("jabatan")?.value || "",
      penempatan: document.getElementById("penempatan")?.value || "",
      gaji_utuh: parseFloat(document.getElementById("gaji_utuh")?.value) || 0,
      gaji_pokok: parseFloat(document.getElementById("gaji_pokok")?.value) || 0,
      bpjs_kesehatan: parseFloat(document.getElementById("bpjs_kesehatan")?.value) || 0,
      insentif: parseFloat(document.getElementById("insentif")?.value) || 0,
      total_gaji: parseFloat(document.getElementById("total_gaji")?.value) || 0,
      keterangan: document.getElementById("keterangan")?.value || "",
      nohp: document.getElementById("nohp")?.value || "",
    };

    if (!payload.no_induk || !payload.nama_karyawan || !payload.tanggal_masuk || !payload.jabatan || !payload.nohp) {
      Swal.fire("Error", "Semua field wajib diisi", "error");
      return;
    }
  }

  const method = id ? "PUT" : "POST";
  const url = id ? `/slip/${id}?company=${currentCompany}` : `/slip?company=${currentCompany}`;

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await res.json();

    if (result.success) {
      document.getElementById("dataModal").style.display = "none";
      await loadData();
      Swal.fire("Berhasil!", id ? "Data berhasil diperbarui." : "Data berhasil ditambahkan.", "success");
    } else {
      Swal.fire("Gagal", result.message || "Tidak dapat menyimpan data.", "error");
    }
  } catch (err) {
    console.error("Submit error:", err);
    Swal.fire("Error", `Terjadi kesalahan: ${err.message}`, "error");
  }
};

// =============================
// EVENT LISTENERS
// =============================
document.getElementById("searchInput")?.addEventListener("input", () => {
  currentPage = 1;
  renderTable();
});

document.getElementById("prevPage")?.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderTable();
  }
});

document.getElementById("nextPage")?.addEventListener("click", () => {
  const query = document.getElementById("searchInput")?.value.toLowerCase() || "";
  const filtered = dataAll.filter((d) => Object.values(d).some((v) => String(v).toLowerCase().includes(query)));
  if (currentPage * pageSize < filtered.length) {
    currentPage++;
    renderTable();
  }
});

document.getElementById("sendSelected")?.addEventListener("click", async () => {
  const selected = Array.from(checkedSet);
  if (selected.length === 0) {
    Swal.fire({
      title: "Peringatan",
      text: "Tidak ada karyawan yang dipilih. Silakan pilih karyawan terlebih dahulu.",
      icon: "warning",
      confirmButtonText: "OK",
    });
    return;
  }

  const result = await Swal.fire({
    title: "Konfirmasi",
    text: `Kirim slip ke ${selected.length} karyawan terpilih?`,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Ya, Kirim!",
  });

  if (result.isConfirmed) {
    try {
      const res = await fetch("/start-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected, company: currentCompany }),
      });

      const data = await res.json();
      if (data.success) {
        trackProgress();
      } else {
        Swal.fire("Error", data.message || "Gagal memulai pengiriman", "error");
      }
    } catch (err) {
      Swal.fire("Error", "Gagal memulai pengiriman", "error");
    }
  }
});

const fileInputData = document.getElementById("fileInputData");
const fileNameData = document.getElementById("fileNameData");

if (fileInputData && fileNameData) {
  fileInputData.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      fileNameData.textContent = e.target.files[0].name;
    } else {
      fileNameData.textContent = "Tidak ada file dipilih";
    }
  });
}

// File input preview untuk upload form kirim
const fileInputKirim = document.getElementById("fileInputKirim");
const fileNameKirim = document.getElementById("fileNameKirim");

if (fileInputKirim && fileNameKirim) {
  fileInputKirim.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      fileNameKirim.textContent = e.target.files[0].name;
    } else {
      fileNameKirim.textContent = "Tidak ada file dipilih";
    }
  });
}

function trackProgress() {
  const btn = document.getElementById("sendSelected");
  const progressContainer = document.getElementById("progressContainer");
  const progressBar = document.getElementById("bar");
  const progressStatus = document.getElementById("status");

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...';

  // Tampilkan progress container saat mulai mengirim
  if (progressContainer) progressContainer.style.display = "block";

  const interval = setInterval(async () => {
    try {
      const res = await fetch("/progress");
      const p = await res.json();

      const percent = p.total > 0 ? ((p.sent + p.failed) / p.total) * 100 : 0;
      if (progressBar) progressBar.style.width = percent + "%";
      if (progressStatus) progressStatus.innerText = `Proses: ${p.sent} Berhasil, ${p.failed} Gagal dari ${p.total} Total`;

      if (!p.running && p.sent + p.failed >= p.total && p.total > 0) {
        clearInterval(interval);

        Swal.fire({
          title: "Laporan Pengiriman",
          html: `
            <div style="margin-top: 15px;">
              <div style="display: flex; justify-content: space-around; margin-bottom: 20px;">
                <div style="text-align: center;">
                  <div style="font-size: 0.8rem; color: #666;">TOTAL</div>
                  <div style="font-size: 1.5rem; font-weight: bold; color: #2563eb;">${p.total}</div>
                </div>
                <div style="text-align: center;">
                  <div style="font-size: 0.8rem; color: #666;">BERHASIL</div>
                  <div style="font-size: 1.5rem; font-weight: bold; color: #16a34a;">${p.sent}</div>
                </div>
                <div style="text-align: center;">
                  <div style="font-size: 0.8rem; color: #666;">GAGAL</div>
                  <div style="font-size: 1.5rem; font-weight: bold; color: #dc2626;">${p.failed}</div>
                </div>
              </div>
              <div style="background: #f8fafc; border-radius: 12px; padding: 15px; border: 1px solid #e2e8f0;">
                <p style="margin: 0; font-size: 0.9rem; color: #475569;">
                  ${p.failed > 0 ? `<i class="fas fa-exclamation-circle" style="color: #f59e0b;"></i> Ada ${p.failed} data yang gagal dikirim.` : '<i class="fas fa-check-circle" style="color: #16a34a;"></i> Semua slip gaji berhasil terkirim!'}
                </p>
              </div>
            </div>
          `,
          icon: p.failed > 0 ? "warning" : "success",
          confirmButtonText: "Selesai",
        }).then(() => {
          checkedSet.clear();
          loadData();
          // Reset progress bar
          if (progressBar) progressBar.style.width = "0%";
          // Sembunyikan progress container setelah selesai
          if (progressContainer) progressContainer.style.display = "none";
        });

        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim Slip Terpilih';
      }
    } catch (err) {
      console.error("Gagal memantau progress:", err);
    }
  }, 1500);
}

document.getElementById("exportBtn")?.addEventListener("click", () => {
  let ws_data = [];

  if (currentCompany === "hisana") {
    ws_data.push(["No Induk", "NAMA", "POSISI", "STORE", "AWAL MASUK", "KERJA", "GAJI", "Iuran BPJS Ketenagakerjaan", "KERAJINAN", "CUTI", "Tunj. BPJS & Pulsa", "JUMLAH", "UM", "KETERANGAN", "GAJI TOTAL", "NO HP"]);
    filteredData.forEach((item) => {
      ws_data.push([
        item.no_induk || "",
        item.nama || "",
        item.posisi || "",
        item.store || "",
        item.awal_masuk ? new Date(item.awal_masuk).toISOString().split("T")[0] : "",
        item.kerja || 0,
        item.gaji || 0,
        item.iuran_bpjs_ketenagakerjaan || 0,
        item.kerajinan || 0,
        item.cuti || 0,
        item.tunj_bpjs_pulsa || 0,
        item.jumlah || 0,
        item.um || 0,
        item.keterangan || "",
        item.gaji_total || 0,
        item.nohp || "",
      ]);
    });
  } else {
    ws_data.push(["No Induk", "Nama Karyawan", "Tanggal Masuk", "Jabatan", "Penempatan", "Gaji Utuh", "Gaji Pokok", "BPJS Kesehatan", "Insentif", "Total Gaji", "Keterangan", "No HP"]);
    filteredData.forEach((item) => {
      ws_data.push([
        item.no_induk || "",
        item.nama_karyawan || item.nama || "",
        item.tanggal_masuk ? new Date(item.tanggal_masuk).toISOString().split("T")[0] : "",
        item.jabatan || "",
        item.penempatan || "",
        item.gaji_utuh || 0,
        item.gaji_pokok || 0,
        item.bpjs_kesehatan || 0,
        item.insentif || 0,
        item.total_gaji || 0,
        item.keterangan || "",
        item.nohp || "",
      ]);
    });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  XLSX.utils.book_append_sheet(wb, ws, `SlipGaji_${currentCompany}`);
  XLSX.writeFile(wb, `Export_Slip_Gaji_${currentCompany}.xlsx`);
});

document.getElementById("closeModal")?.addEventListener("click", () => {
  const modal = document.getElementById("dataModal");
  if (modal) modal.style.display = "none";
});

document.getElementById("addDataBtn")?.addEventListener("click", () => openModal());
// Reset Checkbox untuk Slip Gaji
// Reset Checkbox untuk Slip Gaji
document.getElementById("resetCheckbox")?.addEventListener("click", () => {
  if (checkedSet.size === 0) {
    Swal.fire({
      title: "Info",
      text: "Tidak ada checkbox yang dipilih untuk direset.",
      icon: "info",
      toast: true,
      timer: 2000,
      showConfirmButton: false,
    });
    return;
  }

  checkedSet.clear();

  // Reset semua checkbox individu
  const checkboxes = document.querySelectorAll(".chk-slip");
  checkboxes.forEach((chk) => {
    chk.checked = false;
  });

  // Reset checkbox select all
  const selectAllSlip = document.getElementById("selectAllSlip");
  if (selectAllSlip) {
    selectAllSlip.checked = false;
    selectAllSlip.indeterminate = false;
  }

  renderTable();

  Swal.fire({
    title: "Berhasil!",
    text: "Semua pilihan checkbox slip gaji telah direset.",
    icon: "success",
    toast: true,
    timer: 2000,
    showConfirmButton: false,
  });
});

document.getElementById("searchDataInput")?.addEventListener("input", () => {
  currentPageData = 1;
  renderDataTable();
});

document.getElementById("prevDataPage")?.addEventListener("click", () => {
  if (currentPageData > 1) {
    currentPageData--;
    renderDataTable();
  }
});

document.getElementById("nextDataPage")?.addEventListener("click", () => {
  const query = document.getElementById("searchDataInput")?.value.toLowerCase() || "";
  const filtered = dataAll.filter((d) => Object.values(d).some((v) => String(v).toLowerCase().includes(query)));
  if (currentPageData * pageSizeData < filtered.length) {
    currentPageData++;
    renderDataTable();
  }
});

// =============================
// BONUS FUNCTIONS
// =============================

function resetBonusProgress() {
  if (bonusProgressInterval) {
    clearInterval(bonusProgressInterval);
    bonusProgressInterval = null;
  }

  bonusProgress = { running: false, total: 0, sent: 0, failed: 0 };

  const progressContainer = document.getElementById("bonusProgressContainer");
  const progressBar = document.getElementById("bonusProgressBar");
  const progressStatus = document.getElementById("bonusProgressStatus");

  if (progressContainer) progressContainer.style.display = "none";
  if (progressBar) progressBar.style.width = "0%";
  if (progressStatus) progressStatus.innerText = "Siap mengirim bonus.";

  const btn = document.getElementById("sendBonusSelected");
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim Bonus Terpilih';
  }
}

// Reset Bonus Checkbox Button
document.getElementById("resetBonusCheckbox")?.addEventListener("click", () => {
  if (selectedBonusSet.size === 0) {
    Swal.fire({
      title: "Info",
      text: "Tidak ada checkbox bonus yang dipilih untuk direset.",
      icon: "info",
      toast: true,
      timer: 2000,
      showConfirmButton: false,
    });
    return;
  }

  selectedBonusSet.clear();
  renderBonusTable();
  const selectAllBonus = document.getElementById("selectAllBonus");
  if (selectAllBonus) selectAllBonus.checked = false;

  Swal.fire({
    title: "Berhasil!",
    text: "Semua pilihan checkbox bonus telah direset.",
    icon: "success",
    toast: true,
    timer: 2000,
    showConfirmButton: false,
  });
});

async function loadBonusData() {
  try {
    const res = await fetch(`/bonus?company=${currentCompany}`);
    bonusData = await res.json();
    renderBonusTable();
  } catch (err) {
    console.error("Load bonus data error:", err);
  }
}

function renderBonusTable() {
  const tbody = document.querySelector("#tableBonus tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const query = document.getElementById("searchBonusInput")?.value.toLowerCase() || "";
  const filtered = bonusData.filter((d) => d.nama?.toLowerCase().includes(query) || d.no_induk?.toLowerCase().includes(query));

  const totalPages = Math.ceil(filtered.length / pageSizeBonus);
  if (currentBonusPage > totalPages) currentBonusPage = 1;
  const start = (currentBonusPage - 1) * pageSizeBonus;
  const pageData = filtered.slice(start, start + pageSizeBonus);

  const bulanNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  pageData.forEach((d, i) => {
    const tr = document.createElement("tr");
    const statusBadge = d.status === "terkirim" ? '<span class="status-badge success"><i class="fas fa-check-circle"></i> Terkirim</span>' : '<span class="status-badge pending"><i class="fas fa-clock"></i> Belum Dikirim</span>';
    const isChecked = selectedBonusSet.has(d.id) ? "checked" : "";

    tr.innerHTML = `
      <td><input type="checkbox" class="chk-bonus" data-id="${d.id}" ${isChecked} ${d.status === "terkirim" ? "disabled" : ""}>
      <td>${start + i + 1}
      <td>${d.no_induk}
      <td style="font-weight:600">${escapeHtml(d.nama)}
      <td>${bulanNames[d.bulan - 1]}
      <td>${d.tahun}
      <td class="money">${rupiah(d.jumlah_bonus)}
      <td>${d.nohp}
      <td>${statusBadge}
      <td style="font-size:0.8rem">${new Date(d.created_at).toLocaleDateString("id-ID")}
      <td>
        <button class="btn-primary" style="padding:5px 10px;" onclick='openBonusModalById(${d.id})'><i class="fas fa-edit"></i></button>
        <button class="btn-danger" style="padding:5px 10px;" onclick='deleteBonus(${d.id})'><i class="fas fa-trash"></i></button>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll(".chk-bonus").forEach((chk) => {
    if (!chk.disabled) {
      chk.onchange = (e) => {
        const id = parseInt(e.target.dataset.id);
        if (e.target.checked) selectedBonusSet.add(id);
        else selectedBonusSet.delete(id);
      };
    }
  });

  const bonusPageInfo = document.getElementById("bonusPageInfo");
  if (bonusPageInfo) bonusPageInfo.innerText = `Halaman ${currentBonusPage} dari ${totalPages || 1}`;
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

document.getElementById("prevBonusPage")?.addEventListener("click", () => {
  if (currentBonusPage > 1) {
    currentBonusPage--;
    renderBonusTable();
  }
});

document.getElementById("nextBonusPage")?.addEventListener("click", () => {
  const query = document.getElementById("searchBonusInput")?.value.toLowerCase() || "";
  const filtered = bonusData.filter((d) => d.nama?.toLowerCase().includes(query) || d.no_induk?.toLowerCase().includes(query));
  if (currentBonusPage * pageSizeBonus < filtered.length) {
    currentBonusPage++;
    renderBonusTable();
  }
});

function openBonusModal(item = null) {
  const modal = document.getElementById("bonusModal");
  if (!modal) return;
  modal.style.display = "flex";

  if (item) {
    document.getElementById("bonus_id").value = item.id;
    document.getElementById("bonus_no_induk").value = item.no_induk;
    document.getElementById("bonus_nama").value = item.nama;
    document.getElementById("bonus_periode").value = `${item.tahun}-${String(item.bulan).padStart(2, "0")}`;
    document.getElementById("bonus_jumlah").value = item.jumlah_bonus;
    document.getElementById("bonus_nohp").value = item.nohp;
  } else {
    document.getElementById("bonusForm").reset();
    document.getElementById("bonus_id").value = "";
  }
}

window.openBonusModalById = (id) => {
  const item = bonusData.find((d) => d.id == id);
  openBonusModal(item);
};

window.deleteBonus = async (id) => {
  const result = await Swal.fire({
    title: "Apakah Anda yakin?",
    text: "Data bonus ini akan dihapus secara permanen!",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    confirmButtonText: "Ya, hapus!",
    cancelButtonText: "Batal",
  });

  if (!result.isConfirmed) return;

  try {
    const res = await fetch(`/bonus/${id}?company=${currentCompany}`, { method: "DELETE" });
    const resultData = await res.json();

    if (resultData.success) {
      Swal.fire("Berhasil!", "Data bonus berhasil dihapus.", "success");
      await loadBonusData();
    } else {
      Swal.fire("Gagal!", resultData.message || "Data tidak ditemukan.", "error");
    }
  } catch (err) {
    console.error(err);
    Swal.fire("Error!", "Server error: " + err.message, "error");
  }
};

document.getElementById("bonusForm").onsubmit = async (e) => {
  e.preventDefault();

  const id = document.getElementById("bonus_id").value;
  const payload = {
    no_induk: document.getElementById("bonus_no_induk").value,
    nama: document.getElementById("bonus_nama").value,
    periode: document.getElementById("bonus_periode").value,
    jumlah_bonus: parseFloat(document.getElementById("bonus_jumlah").value),
    nohp: document.getElementById("bonus_nohp").value,
  };

  if (!payload.no_induk || !payload.nama || !payload.periode || !payload.jumlah_bonus || !payload.nohp) {
    Swal.fire("Error", "Semua field harus diisi", "error");
    return;
  }

  const method = id ? "PUT" : "POST";
  const url = id ? `/bonus/${id}?company=${currentCompany}` : `/bonus?company=${currentCompany}`;

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await res.json();

    if (result.success) {
      document.getElementById("bonusModal").style.display = "none";
      await loadBonusData();
      Swal.fire("Berhasil!", id ? "Bonus berhasil diperbarui." : "Bonus berhasil ditambahkan.", "success");
    } else {
      Swal.fire("Gagal", result.message || "Tidak dapat menyimpan data.", "error");
    }
  } catch (err) {
    console.error("Submit error:", err);
    Swal.fire("Error", `Terjadi kesalahan: ${err.message}`, "error");
  }
};

document.getElementById("sendBonusSelected")?.addEventListener("click", async () => {
  const selected = Array.from(selectedBonusSet);
  if (selected.length === 0) {
    Swal.fire({
      title: "Peringatan",
      text: "Tidak ada bonus yang dipilih. Silakan pilih bonus terlebih dahulu.",
      icon: "warning",
      confirmButtonText: "OK",
    });
    return;
  }

  // Filter hanya yang statusnya belum terkirim
  const selectedData = bonusData.filter((d) => selected.includes(d.id) && d.status !== "terkirim");

  if (selectedData.length === 0) {
    Swal.fire({
      title: "Peringatan",
      text: "Bonus yang dipilih sudah terkirim semua. Silakan pilih bonus yang belum terkirim.",
      icon: "warning",
      confirmButtonText: "OK",
    });
    return;
  }

  const result = await Swal.fire({
    title: "Konfirmasi",
    text: `Kirim bonus ke ${selectedData.length} karyawan terpilih?`,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Ya, Kirim!",
    cancelButtonText: "Batal",
  });

  if (result.isConfirmed) {
    const btn = document.getElementById("sendBonusSelected");
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...';

    try {
      const res = await fetch("/send-bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected: selectedData.map((d) => d.id), company: currentCompany }),
      });

      const data = await res.json();

      if (data.success) {
        resetBonusProgress();
        bonusProgress = {
          running: true,
          total: selectedData.length,
          sent: 0,
          failed: 0,
        };
        const progressContainer = document.getElementById("bonusProgressContainer");
        if (progressContainer) progressContainer.style.display = "block";
        startBonusProgressTracking();
      } else {
        Swal.fire("Error", data.message || "Gagal memulai pengiriman", "error");
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim Bonus Terpilih';
      }
    } catch (err) {
      console.error("Send bonus error:", err);
      Swal.fire("Error", "Gagal memulai pengiriman: " + err.message, "error");
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim Bonus Terpilih';
    }
  }
});

async function refreshBonusStatus() {
  try {
    const res = await fetch(`/bonus?company=${currentCompany}`);
    const newData = await res.json();

    // Update data lokal
    bonusData = newData;

    // Render ulang tabel
    renderBonusTable();

    // Update selectedBonusSet (hapus yang sudah terkirim)
    const newSelectedSet = new Set();
    selectedBonusSet.forEach((id) => {
      const item = bonusData.find((d) => d.id === id);
      if (item && item.status !== "terkirim") {
        newSelectedSet.add(id);
      }
    });
    selectedBonusSet.clear();
    newSelectedSet.forEach((id) => selectedBonusSet.add(id));

    console.log("Bonus status refreshed");
  } catch (err) {
    console.error("Refresh bonus status error:", err);
  }
}

function updateBonusProgressDisplay() {
  const progressContainer = document.getElementById("bonusProgressContainer");
  const progressBar = document.getElementById("bonusProgressBar");
  const progressStatus = document.getElementById("bonusProgressStatus");

  if (!progressContainer || !progressBar || !progressStatus) return;

  if (bonusProgress.running || bonusProgress.total > 0) {
    progressContainer.style.display = "block";
    const percent = bonusProgress.total > 0 ? ((bonusProgress.sent + bonusProgress.failed) / bonusProgress.total) * 100 : 0;
    progressBar.style.width = percent + "%";
    progressStatus.innerText = `Bonus: ${bonusProgress.sent} Berhasil, ${bonusProgress.failed} Gagal dari ${bonusProgress.total} Total`;

    // Jika proses selesai (running false dan semua sudah diproses)
    if (!bonusProgress.running && bonusProgress.sent + bonusProgress.failed >= bonusProgress.total && bonusProgress.total > 0) {
      // Tampilkan SweetAlert
      Swal.fire({
        title: "Laporan Pengiriman Bonus",
        html: `
          <div style="margin-top:15px">
            <div style="display:flex; justify-content:space-around; margin-bottom:20px">
              <div style="text-align:center">
                <div style="font-size:0.8rem;color:#666">TOTAL</div>
                <div style="font-size:1.5rem;font-weight:bold;color:#2563eb">${bonusProgress.total}</div>
              </div>
              <div style="text-align:center">
                <div style="font-size:0.8rem;color:#666">BERHASIL</div>
                <div style="font-size:1.5rem;font-weight:bold;color:#16a34a">${bonusProgress.sent}</div>
              </div>
              <div style="text-align:center">
                <div style="font-size:0.8rem;color:#666">GAGAL</div>
                <div style="font-size:1.5rem;font-weight:bold;color:#dc2626">${bonusProgress.failed}</div>
              </div>
            </div>
            <div style="background:#f8fafc;border-radius:12px;padding:15px;border:1px solid #e2e8f0">
              <p style="margin:0;font-size:0.9rem;color:#475569">
                ${
                  bonusProgress.failed > 0
                    ? `<i class="fas fa-exclamation-circle" style="color:#f59e0b"></i> Ada ${bonusProgress.failed} bonus yang gagal dikirim. Silakan cek koneksi atau nomor WhatsApp.`
                    : '<i class="fas fa-check-circle" style="color:#16a34a"></i> Semua bonus berhasil terkirim sempurna!'
                }
              </p>
            </div>
          </div>
        `,
        icon: bonusProgress.failed > 0 ? "warning" : "success",
        confirmButtonText: '<i class="fas fa-check"></i> Selesai',
        confirmButtonColor: "#2563eb",
      }).then(async () => {
        // Reset progress dan reload data
        resetBonusProgress();

        // Reload bonus data untuk update status di tabel
        await loadBonusData();

        // Hapus semua selection yang sudah terkirim
        selectedBonusSet.clear();

        // Reset checkbox select all
        const selectAllCheckbox = document.getElementById("selectAllBonus");
        if (selectAllCheckbox) selectAllCheckbox.checked = false;

        console.log("Bonus data reloaded, status updated");
      });

      // Hentikan interval tracking
      if (bonusProgressInterval) {
        clearInterval(bonusProgressInterval);
        bonusProgressInterval = null;
      }
    }
  } else {
    progressContainer.style.display = "none";
  }
}

function startBonusProgressTracking() {
  // Hentikan interval yang sudah ada
  if (bonusProgressInterval) {
    clearInterval(bonusProgressInterval);
    bonusProgressInterval = null;
  }

  bonusProgressInterval = setInterval(async () => {
    try {
      const progressRes = await fetch("/bonus-progress");
      const progressData = await progressRes.json();

      // Update progress
      bonusProgress = progressData;

      // Update tampilan
      updateBonusProgressDisplay();
    } catch (err) {
      console.error("Gagal memantau progress bonus:", err);
    }
  }, 1500);
}

const searchBonusInput = document.getElementById("searchBonusInput");
if (searchBonusInput)
  searchBonusInput.addEventListener("input", () => {
    currentBonusPage = 1;
    renderBonusTable();
  });

const addBonusBtn = document.getElementById("addBonusBtn");
if (addBonusBtn) addBonusBtn.addEventListener("click", () => openBonusModal());

const closeBonusModal = document.getElementById("closeBonusModal");
if (closeBonusModal)
  closeBonusModal.addEventListener("click", () => {
    const modal = document.getElementById("bonusModal");
    if (modal) modal.style.display = "none";
  });

const selectAllBonus = document.getElementById("selectAllBonus");
if (selectAllBonus) {
  selectAllBonus.addEventListener("change", (e) => {
    const checkboxes = document.querySelectorAll(".chk-bonus:not(:disabled)");
    checkboxes.forEach((chk) => {
      chk.checked = e.target.checked;
      const id = parseInt(chk.dataset.id);
      if (e.target.checked) selectedBonusSet.add(id);
      else selectedBonusSet.delete(id);
    });
  });
}

// =============================
// BONUS DUPLICATION FUNCTIONS
// =============================
async function duplicatePreviousMonthBonus() {
  try {
    const result = await Swal.fire({
      title: "Duplikasi Bonus Bulan Lalu?",
      text: `Anda akan menduplikasi data bonus dari bulan sebelumnya untuk ${currentCompany === "hisana" ? "Hisana" : "Enakko"}.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#2563eb",
      confirmButtonText: "Ya, Duplikasi",
      cancelButtonText: "Batal",
    });

    if (!result.isConfirmed) return;

    Swal.fire({ title: "Sedang Memproses...", text: "Mohon tunggu", allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const response = await fetch(`/duplicate-bonus-data?company=${currentCompany}`, { method: "POST" });
    const data = await response.json();
    Swal.close();

    if (!response.ok) {
      Swal.fire("Gagal!", data.message || "Terjadi kesalahan", "error");
      return;
    }

    if (data.success) {
      Swal.fire({ title: "Berhasil!", html: `<div style="background:#f0fdf4;border-radius:12px;padding:15px"><p>${data.message}</p></div>`, icon: "success", confirmButtonText: "OK" });
      await loadBonusData();

      // Sembunyikan tombol duplikasi, tampilkan tombol batal
      const duplicateBtn = document.getElementById("duplicateBonusBtn");
      const cancelBtn = document.getElementById("cancelDuplicateBonusBtn");
      if (duplicateBtn && cancelBtn) {
        duplicateBtn.style.display = "none";
        cancelBtn.style.display = "inline-block";
      }
      startBonusDuplicateStatusCheck();
    }
  } catch (err) {
    console.error("Duplicate bonus error:", err);
    Swal.fire("Error!", err.message, "error");
  }
}

async function cancelBonusDuplicate() {
  try {
    const result = await Swal.fire({
      title: "Batalkan Duplikasi Bonus?",
      html: `<p>Data bonus hasil duplikasi akan dihapus permanen!</p>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Ya, Batalkan",
      cancelButtonText: "Tidak",
    });

    if (!result.isConfirmed) return;

    Swal.fire({ title: "Sedang Memproses...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const response = await fetch(`/cancel-duplicate-bonus?company=${currentCompany}`, { method: "POST" });
    const data = await response.json();
    Swal.close();

    if (!response.ok) {
      Swal.fire("Gagal!", data.message || "Terjadi kesalahan", "error");
      return;
    }

    if (data.success) {
      Swal.fire({ title: "Berhasil!", html: `<div style="background:#fef2e8;border-radius:12px;padding:15px"><p>${data.message}</p></div>`, icon: "success", confirmButtonText: "OK" });
      await loadBonusData();

      // Tampilkan kembali tombol duplikasi, sembunyikan tombol batal
      const duplicateBtn = document.getElementById("duplicateBonusBtn");
      const cancelBtn = document.getElementById("cancelDuplicateBonusBtn");
      if (duplicateBtn && cancelBtn) {
        duplicateBtn.style.display = "inline-block";
        cancelBtn.style.display = "none";
      }
      stopBonusDuplicateStatusCheck();
    }
  } catch (err) {
    console.error("Cancel bonus duplicate error:", err);
    Swal.fire("Error!", err.message, "error");
  }
}

async function checkBonusDuplicateStatus() {
  try {
    const response = await fetch(`/check-bonus-duplicate-status?company=${currentCompany}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    const duplicateBtn = document.getElementById("duplicateBonusBtn");
    const cancelBtn = document.getElementById("cancelDuplicateBonusBtn");

    if (duplicateBtn && cancelBtn) {
      if (data.hasRecentDuplicate) {
        duplicateBtn.style.display = "none";
        cancelBtn.style.display = "inline-block";
      } else {
        duplicateBtn.style.display = "inline-block";
        cancelBtn.style.display = "none";
      }
    }
  } catch (err) {
    console.error("Check bonus duplicate status error:", err);
  }
}

function startBonusDuplicateStatusCheck() {
  if (bonusDuplicateCheckInterval) clearInterval(bonusDuplicateCheckInterval);
  bonusDuplicateCheckInterval = setInterval(() => checkBonusDuplicateStatus(), 5000);
}

function stopBonusDuplicateStatusCheck() {
  if (bonusDuplicateCheckInterval) {
    clearInterval(bonusDuplicateCheckInterval);
    bonusDuplicateCheckInterval = null;
  }
}

// =============================
// WEBSOCKET & OTHER FUNCTIONS
// =============================
const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(`${protocol}//${window.location.host}`);

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.status === "force_logout") {
    Swal.fire({
      title: "Sesi Berakhir",
      text: "Koneksi WhatsApp terputus. Silakan login kembali.",
      icon: "warning",
      confirmButtonText: "OK",
    }).then(() => (window.location.href = "/"));
  }
};

async function duplicatePreviousMonthData() {
  try {
    const result = await Swal.fire({
      title: "Duplikasi Data Bulan Lalu?",
      text: `Anda akan menduplikasi data dari bulan sebelumnya untuk ${currentCompany === "hisana" ? "Hisana" : "Enakko"}.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Ya, Duplikasi",
    });

    if (!result.isConfirmed) return;

    Swal.fire({ title: "Sedang Memproses...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const response = await fetch(`/duplicate-data?company=${currentCompany}`, { method: "POST" });
    const data = await response.json();
    Swal.close();

    if (!response.ok) {
      Swal.fire("Gagal!", data.message || "Terjadi kesalahan", "error");
      return;
    }

    if (data.success) {
      Swal.fire({ title: "Berhasil!", html: `<div style="background:#f0fdf4;border-radius:12px;padding:15px"><p>${data.message}</p></div>`, icon: "success" });
      await loadData();

      // Sembunyikan tombol duplikasi, tampilkan tombol batal
      const duplicateBtn = document.getElementById("duplicateDataBtn");
      const cancelBtn = document.getElementById("cancelDuplicateBtn");
      if (duplicateBtn && cancelBtn) {
        duplicateBtn.style.display = "none";
        cancelBtn.style.display = "inline-block";
      }
      startGajiDuplicateStatusCheck();
    }
  } catch (err) {
    console.error("Duplicate error:", err);
    Swal.fire("Error!", err.message, "error");
  }
}

async function cancelDuplicate() {
  try {
    const result = await Swal.fire({
      title: "Batalkan Duplikasi?",
      html: `<p>Data hasil duplikasi akan dihapus permanen!</p>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Ya, Batalkan",
    });

    if (!result.isConfirmed) return;

    Swal.fire({ title: "Sedang Memproses...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const response = await fetch(`/cancel-duplicate?company=${currentCompany}`, { method: "POST" });
    const data = await response.json();
    Swal.close();

    if (!response.ok) {
      Swal.fire("Gagal!", data.message || "Terjadi kesalahan", "error");
      return;
    }

    if (data.success) {
      Swal.fire({ title: "Berhasil!", html: `<div style="background:#fef2e8;border-radius:12px;padding:15px"><p>${data.message}</p></div>`, icon: "success" });
      await loadData();

      // Tampilkan kembali tombol duplikasi, sembunyikan tombol batal
      const duplicateBtn = document.getElementById("duplicateDataBtn");
      const cancelBtn = document.getElementById("cancelDuplicateBtn");
      if (duplicateBtn && cancelBtn) {
        duplicateBtn.style.display = "inline-block";
        cancelBtn.style.display = "none";
      }
      stopGajiDuplicateStatusCheck();
    }
  } catch (err) {
    console.error("Cancel duplicate error:", err);
    Swal.fire("Error!", err.message, "error");
  }
}

async function checkDuplicateStatus() {
  try {
    const response = await fetch(`/check-duplicate-status?company=${currentCompany}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    const duplicateBtn = document.getElementById("duplicateDataBtn");
    const cancelBtn = document.getElementById("cancelDuplicateBtn");

    if (duplicateBtn && cancelBtn) {
      if (data.hasRecentDuplicate) {
        duplicateBtn.style.display = "none";
        cancelBtn.style.display = "inline-block";
      } else {
        duplicateBtn.style.display = "inline-block";
        cancelBtn.style.display = "none";
      }
    }
  } catch (err) {
    console.error("Check duplicate status error:", err);
  }
}

const duplicateBtn = document.getElementById("duplicateDataBtn");
if (duplicateBtn) duplicateBtn.addEventListener("click", duplicatePreviousMonthData);

const cancelDuplicateBtn = document.getElementById("cancelDuplicateBtn");
if (cancelDuplicateBtn) cancelDuplicateBtn.addEventListener("click", cancelDuplicate);

const duplicateBonusBtn = document.getElementById("duplicateBonusBtn");
if (duplicateBonusBtn) duplicateBonusBtn.addEventListener("click", duplicatePreviousMonthBonus);

const cancelDuplicateBonusBtn = document.getElementById("cancelDuplicateBonusBtn");
if (cancelDuplicateBonusBtn) cancelDuplicateBonusBtn.addEventListener("click", cancelBonusDuplicate);

// =============================
// THR FUNCTIONS
// =============================

function resetThrProgress() {
  if (thrProgressInterval) {
    clearInterval(thrProgressInterval);
    thrProgressInterval = null;
  }

  thrProgress = { running: false, total: 0, sent: 0, failed: 0 };

  const progressContainer = document.getElementById("thrProgressContainer");
  const progressBar = document.getElementById("thrProgressBar");
  const progressStatus = document.getElementById("thrProgressStatus");

  if (progressContainer) progressContainer.style.display = "none";
  if (progressBar) progressBar.style.width = "0%";
  if (progressStatus) progressStatus.innerText = "Siap mengirim THR.";

  const btn = document.getElementById("sendThrSelected");
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim THR Terpilih';
  }
}

async function loadThrData() {
  try {
    console.log("Loading THR data for company:", currentCompany);
    console.log("Loading THR data for year:", currentThrYear);

    let url;
    if (currentThrYear && currentThrYear !== "all") {
      url = `/thr/year/${currentThrYear}?company=${currentCompany}`;
    } else {
      url = `/thr?company=${currentCompany}&year=all`;
    }

    const res = await fetch(url);
    thrData = await res.json();
    console.log("THR data loaded:", thrData.length, "records");
    renderThrTable();

    await loadAvailableYears();
    await checkThrDuplicateStatus();
  } catch (err) {
    console.error("Load THR data error:", err);
  }
}

async function loadAvailableYears() {
  try {
    const res = await fetch(`/thr-years?company=${currentCompany}`);
    const data = await res.json();
    if (data.success) {
      const yearSelect = document.getElementById("thrYearSelect");
      if (yearSelect) {
        const currentSelection = yearSelect.value;
        yearSelect.innerHTML = '<option value="all">Semua Tahun</option>';
        data.years.forEach((year) => {
          const option = document.createElement("option");
          option.value = year;
          option.textContent = year;
          yearSelect.appendChild(option);
        });
        if (currentSelection && (currentSelection === "all" || data.years.includes(parseInt(currentSelection)))) {
          yearSelect.value = currentSelection;
        } else if (currentThrYear !== "all") {
          yearSelect.value = currentThrYear;
        }
      }
    }
  } catch (err) {
    console.error("Load available years error:", err);
  }
}

function renderThrTable() {
  const tbody = document.querySelector("#tableTHR tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const query = document.getElementById("searchThrInput")?.value.toLowerCase() || "";
  const filtered = thrData.filter((d) => d.nama?.toLowerCase().includes(query) || d.no_induk?.toLowerCase().includes(query));

  const totalPages = Math.ceil(filtered.length / pageSizeThr);
  if (currentThrPage > totalPages) currentThrPage = 1;
  const start = (currentThrPage - 1) * pageSizeThr;
  const pageData = filtered.slice(start, start + pageSizeThr);

  if (pageData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 40px;">
          <i class="fas fa-calendar-alt" style="font-size: 48px; color: #cbd5e1; margin-bottom: 10px; display: block;"></i>
          <p style="color: #64748b;">Belum ada data THR${currentThrYear !== "all" ? ` untuk tahun ${currentThrYear}` : ""}</p>
          <button class="btn-primary" onclick="openThrModal()" style="margin-top: 10px;">
            <i class="fas fa-plus"></i> Tambah Data THR
          </button>
        </td>
      </tr>
    `;
    const thrPageInfo = document.getElementById("thrPageInfo");
    if (thrPageInfo) thrPageInfo.innerText = `Halaman 0 dari 0`;
    return;
  }

  pageData.forEach((d, i) => {
    const tr = document.createElement("tr");
    const statusBadge = d.status === "terkirim" ? '<span class="status-badge success"><i class="fas fa-check-circle"></i> Terkirim</span>' : '<span class="status-badge pending"><i class="fas fa-clock"></i> Belum Dikirim</span>';
    const isChecked = selectedThrSet.has(d.id) ? "checked" : "";

    tr.innerHTML = `
      <td style="text-align: center;"><input type="checkbox" class="chk-thr" data-id="${d.id}" ${isChecked} ${d.status === "terkirim" ? "disabled" : ""}>
      <td style="text-align: center;">${start + i + 1}
      <td>${escapeHtml(d.no_induk)}
      <td style="font-weight:600">${escapeHtml(d.nama)}
      <td style="text-align: center;">${d.tahun}
      <td class="money">${rupiah(d.jumlah_thr)}
      <td>${escapeHtml(d.nohp)}
      <td>${statusBadge}
      <td style="font-size:0.8rem; text-align: center;">${new Date(d.created_at).toLocaleDateString("id-ID")}
      <td style="text-align: center;">
        <button class="btn-primary" style="padding:5px 10px; margin-right: 5px;" onclick='openThrModalById(${d.id})'><i class="fas fa-edit"></i></button>
        <button class="btn-danger" style="padding:5px 10px;" onclick='deleteThr(${d.id})'><i class="fas fa-trash"></i></button>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll(".chk-thr").forEach((chk) => {
    if (!chk.disabled) {
      chk.onchange = (e) => {
        const id = parseInt(e.target.dataset.id);
        if (e.target.checked) selectedThrSet.add(id);
        else selectedThrSet.delete(id);
      };
    }
  });

  const thrPageInfo = document.getElementById("thrPageInfo");
  if (thrPageInfo) thrPageInfo.innerText = `Halaman ${currentThrPage} dari ${totalPages || 1}`;
}

function openThrModal(item = null) {
  const modal = document.getElementById("thrModal");
  if (!modal) return;
  modal.style.display = "flex";

  if (item) {
    document.getElementById("thr_id").value = item.id;
    document.getElementById("thr_no_induk").value = item.no_induk;
    document.getElementById("thr_nama").value = item.nama;
    document.getElementById("thr_tahun").value = item.tahun;
    document.getElementById("thr_jumlah_thr").value = item.jumlah_thr;
    document.getElementById("thr_nohp").value = item.nohp;
  } else {
    document.getElementById("thrForm").reset();
    document.getElementById("thr_id").value = "";
    const currentYear = new Date().getFullYear();
    document.getElementById("thr_tahun").value = currentYear;
  }
}

window.openThrModalById = (id) => {
  const item = thrData.find((d) => d.id == id);
  openThrModal(item);
};

window.deleteThr = async (id) => {
  const result = await Swal.fire({
    title: "Apakah Anda yakin?",
    text: "Data THR ini akan dihapus secara permanen!",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    confirmButtonText: "Ya, hapus!",
    cancelButtonText: "Batal",
  });

  if (!result.isConfirmed) return;

  try {
    const res = await fetch(`/thr/${id}?company=${currentCompany}`, { method: "DELETE" });
    const resultData = await res.json();

    if (resultData.success) {
      Swal.fire("Berhasil!", "Data THR berhasil dihapus.", "success");
      await loadThrData();
    } else {
      Swal.fire("Gagal!", resultData.message || "Data tidak ditemukan.", "error");
    }
  } catch (err) {
    console.error(err);
    Swal.fire("Error!", "Server error: " + err.message, "error");
  }
};

document.getElementById("thrForm").onsubmit = async (e) => {
  e.preventDefault();

  const id = document.getElementById("thr_id").value;
  const payload = {
    no_induk: document.getElementById("thr_no_induk").value,
    nama: document.getElementById("thr_nama").value,
    tahun: parseInt(document.getElementById("thr_tahun").value),
    jumlah_thr: parseFloat(document.getElementById("thr_jumlah_thr").value),
    nohp: document.getElementById("thr_nohp").value,
    company: currentCompany,
  };

  console.log("📤 Sending THR data:", payload);

  if (!payload.no_induk || !payload.nama || !payload.tahun || !payload.jumlah_thr || !payload.nohp) {
    Swal.fire("Error", "Semua field harus diisi", "error");
    return;
  }

  const method = id ? "PUT" : "POST";
  const url = id ? `/thr/${id}?company=${currentCompany}` : `/thr?company=${currentCompany}`;

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await res.json();

    if (result.success) {
      document.getElementById("thrModal").style.display = "none";
      await loadThrData();
      Swal.fire("Berhasil!", id ? "THR berhasil diperbarui." : "THR berhasil ditambahkan.", "success");
    } else {
      Swal.fire("Gagal", result.message || "Tidak dapat menyimpan data.", "error");
    }
  } catch (err) {
    console.error("Submit error:", err);
    Swal.fire("Error", `Terjadi kesalahan: ${err.message}`, "error");
  }
};

document.getElementById("sendThrSelected")?.addEventListener("click", async () => {
  const selected = Array.from(selectedThrSet);
  if (selected.length === 0) {
    Swal.fire({
      title: "Peringatan",
      text: "Tidak ada THR yang dipilih. Silakan pilih THR terlebih dahulu.",
      icon: "warning",
      confirmButtonText: "OK",
    });
    return;
  }

  const selectedData = thrData.filter((d) => selected.includes(d.id) && d.status !== "terkirim");

  if (selectedData.length === 0) {
    Swal.fire({
      title: "Peringatan",
      text: "THR yang dipilih sudah terkirim semua. Silakan pilih THR yang belum terkirim.",
      icon: "warning",
      confirmButtonText: "OK",
    });
    return;
  }

  const result = await Swal.fire({
    title: "Konfirmasi",
    text: `Kirim THR ke ${selectedData.length} karyawan terpilih?`,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Ya, Kirim!",
    cancelButtonText: "Batal",
  });

  if (result.isConfirmed) {
    const btn = document.getElementById("sendThrSelected");
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...';

    try {
      const res = await fetch("/send-thr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected: selectedData.map((d) => d.id), company: currentCompany }),
      });

      const data = await res.json();

      if (data.success) {
        resetThrProgress();
        thrProgress = {
          running: true,
          total: selectedData.length,
          sent: 0,
          failed: 0,
        };
        const progressContainer = document.getElementById("thrProgressContainer");
        if (progressContainer) progressContainer.style.display = "block";
        startThrProgressTracking();
      } else {
        Swal.fire("Error", data.message || "Gagal memulai pengiriman", "error");
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim THR Terpilih';
      }
    } catch (err) {
      console.error("Send THR error:", err);
      Swal.fire("Error", "Gagal memulai pengiriman: " + err.message, "error");
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim THR Terpilih';
    }
  }
});

function updateThrProgressDisplay() {
  const progressContainer = document.getElementById("thrProgressContainer");
  const progressBar = document.getElementById("thrProgressBar");
  const progressStatus = document.getElementById("thrProgressStatus");

  if (!progressContainer || !progressBar || !progressStatus) return;

  if (thrProgress.running || thrProgress.total > 0) {
    progressContainer.style.display = "block";
    const percent = thrProgress.total > 0 ? ((thrProgress.sent + thrProgress.failed) / thrProgress.total) * 100 : 0;
    progressBar.style.width = percent + "%";
    progressStatus.innerText = `THR: ${thrProgress.sent} Berhasil, ${thrProgress.failed} Gagal dari ${thrProgress.total} Total`;

    if (!thrProgress.running && thrProgress.sent + thrProgress.failed >= thrProgress.total && thrProgress.total > 0) {
      Swal.fire({
        title: "Laporan Pengiriman THR",
        html: `
          <div style="margin-top:15px">
            <div style="display:flex; justify-content:space-around; margin-bottom:20px">
              <div style="text-align:center">
                <div style="font-size:0.8rem;color:#666">TOTAL</div>
                <div style="font-size:1.5rem;font-weight:bold;color:#2563eb">${thrProgress.total}</div>
              </div>
              <div style="text-align:center">
                <div style="font-size:0.8rem;color:#666">BERHASIL</div>
                <div style="font-size:1.5rem;font-weight:bold;color:#16a34a">${thrProgress.sent}</div>
              </div>
              <div style="text-align:center">
                <div style="font-size:0.8rem;color:#666">GAGAL</div>
                <div style="font-size:1.5rem;font-weight:bold;color:#dc2626">${thrProgress.failed}</div>
              </div>
            </div>
            <div style="background:#f8fafc;border-radius:12px;padding:15px;border:1px solid #e2e8f0">
              <p style="margin:0;font-size:0.9rem;color:#475569">
                ${
                  thrProgress.failed > 0
                    ? `<i class="fas fa-exclamation-circle" style="color:#f59e0b"></i> Ada ${thrProgress.failed} THR yang gagal dikirim.`
                    : '<i class="fas fa-check-circle" style="color:#16a34a"></i> Semua THR berhasil terkirim sempurna!'
                }
              </p>
            </div>
          </div>
        `,
        icon: thrProgress.failed > 0 ? "warning" : "success",
        confirmButtonText: "Selesai",
      }).then(async () => {
        resetThrProgress();
        await loadThrData();
        selectedThrSet.clear();
        const selectAllThr = document.getElementById("selectAllThr");
        if (selectAllThr) selectAllThr.checked = false;
      });

      if (thrProgressInterval) {
        clearInterval(thrProgressInterval);
        thrProgressInterval = null;
      }
    }
  } else {
    progressContainer.style.display = "none";
  }
}

function startThrProgressTracking() {
  if (thrProgressInterval) {
    clearInterval(thrProgressInterval);
    thrProgressInterval = null;
  }

  thrProgressInterval = setInterval(async () => {
    try {
      const progressRes = await fetch("/thr-progress");
      const progressData = await progressRes.json();
      thrProgress = progressData;
      updateThrProgressDisplay();
    } catch (err) {
      console.error("Gagal memantau progress THR:", err);
    }
  }, 1500);
}

// Reset THR Checkbox Button
document.getElementById("resetThrCheckbox")?.addEventListener("click", () => {
  if (selectedThrSet.size === 0) {
    Swal.fire({
      title: "Info",
      text: "Tidak ada checkbox THR yang dipilih untuk direset.",
      icon: "info",
      toast: true,
      timer: 2000,
      showConfirmButton: false,
    });
    return;
  }

  selectedThrSet.clear();
  renderThrTable();
  const selectAllThr = document.getElementById("selectAllThr");
  if (selectAllThr) selectAllThr.checked = false;

  Swal.fire({
    title: "Berhasil!",
    text: "Semua pilihan checkbox THR telah direset.",
    icon: "success",
    toast: true,
    timer: 2000,
    showConfirmButton: false,
  });
});

// Year selector for THR
document.getElementById("thrYearSelect")?.addEventListener("change", (e) => {
  const selectedYear = e.target.value;
  if (selectedYear === "all") {
    currentThrYear = "all";
  } else {
    currentThrYear = parseInt(selectedYear);
  }
  currentThrPage = 1;
  selectedThrSet.clear();
  loadThrData();
});

// =============================
// THR DUPLICATION FUNCTIONS
// =============================

// Check THR duplicate status
async function checkThrDuplicateStatus() {
  try {
    const response = await fetch(`/check-thr-duplicate-status?company=${currentCompany}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    const duplicateBtn = document.getElementById("duplicateThrBtn");
    const cancelBtn = document.getElementById("cancelDuplicateThrBtn");

    if (duplicateBtn && cancelBtn) {
      if (data.hasRecentDuplicate) {
        // Jika ada data duplikasi, sembunyikan tombol duplikasi, tampilkan tombol batal
        duplicateBtn.style.display = "none";
        cancelBtn.style.display = "inline-block";
      } else {
        // Jika tidak ada data duplikasi, tampilkan tombol duplikasi, sembunyikan tombol batal
        duplicateBtn.style.display = "inline-block";
        cancelBtn.style.display = "none";
      }
    }
  } catch (err) {
    console.error("Check THR duplicate status error:", err);
  }
}

// Start THR duplicate status check interval
function startThrDuplicateStatusCheck() {
  if (thrDuplicateCheckInterval) clearInterval(thrDuplicateCheckInterval);
  thrDuplicateCheckInterval = setInterval(() => checkThrDuplicateStatus(), 5000);
}

// Stop THR duplicate status check interval
function stopThrDuplicateStatusCheck() {
  if (thrDuplicateCheckInterval) {
    clearInterval(thrDuplicateCheckInterval);
    thrDuplicateCheckInterval = null;
  }
}

// Cancel THR duplicate
async function cancelThrDuplicate() {
  try {
    const result = await Swal.fire({
      title: "Batalkan Duplikasi THR?",
      html: `<p>Data THR hasil duplikasi akan dihapus permanen!</p>
             <p style="margin-top: 10px; color: #f59e0b;">
               <i class="fas fa-exclamation-triangle"></i> Data THR yang diinput manual akan tetap dipertahankan.
             </p>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Ya, Batalkan",
      cancelButtonText: "Tidak",
    });

    if (!result.isConfirmed) return;

    Swal.fire({
      title: "Sedang Memproses...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    const response = await fetch(`/cancel-duplicate-thr?company=${currentCompany}`, {
      method: "POST",
    });
    const data = await response.json();
    Swal.close();

    if (!response.ok) {
      Swal.fire("Gagal!", data.message || "Terjadi kesalahan", "error");
      return;
    }

    if (data.success) {
      Swal.fire({
        title: "Berhasil!",
        html: `<div style="background:#fef2e8;border-radius:12px;padding:15px">
                 <p>${data.message}</p>
                 ${data.manualDataCount > 0 ? `<p style="margin-top: 10px;">${data.manualDataCount} data THR input manual tetap dipertahankan.</p>` : ""}
               </div>`,
        icon: "success",
        confirmButtonText: "OK",
      });

      // Setelah batal, tampilkan kembali tombol duplikasi, sembunyikan tombol batal
      const duplicateBtn = document.getElementById("duplicateThrBtn");
      const cancelBtn = document.getElementById("cancelDuplicateThrBtn");
      if (duplicateBtn && cancelBtn) {
        duplicateBtn.style.display = "inline-block";
        cancelBtn.style.display = "none";
      }

      await loadThrData();
      stopThrDuplicateStatusCheck();
    }
  } catch (err) {
    console.error("Cancel THR duplicate error:", err);
    Swal.fire("Error!", err.message, "error");
  }
}

// Duplicate THR from previous year
const duplicateThrBtn = document.getElementById("duplicateThrBtn");
if (duplicateThrBtn) {
  duplicateThrBtn.addEventListener("click", async () => {
    try {
      const currentYear = new Date().getFullYear();
      const previousYear = currentYear - 1;

      const result = await Swal.fire({
        title: "Duplikasi THR Tahun Lalu?",
        html: `
          <div style="text-align: left;">
            <p>Anda akan menduplikasi data THR dari <strong>tahun ${previousYear}</strong> ke <strong>tahun ${currentYear}</strong> untuk ${currentCompany === "hisana" ? "Hisana" : "Enakko"}.</p>
            <p style="margin-top: 10px; color: #f59e0b;">
              <i class="fas fa-info-circle"></i> Pastikan data THR tahun ${previousYear} sudah lengkap sebelum melakukan duplikasi.
            </p>
          </div>
        `,
        icon: "question",
        showCancelButton: true,
        confirmButtonColor: "#2563eb",
        confirmButtonText: "Ya, Duplikasi",
        cancelButtonText: "Batal",
      });

      if (!result.isConfirmed) return;

      Swal.fire({
        title: "Sedang Memproses...",
        text: "Mohon tunggu",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const response = await fetch("/duplicate-thr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: currentCompany }),
      });

      const data = await response.json();
      Swal.close();

      if (data.success) {
        Swal.fire({
          title: "Berhasil!",
          html: `<div style="background:#f0fdf4;border-radius:12px;padding:15px"><p>${data.message}</p></div>`,
          icon: "success",
          confirmButtonText: "OK",
        });

        // Sembunyikan tombol duplikasi, tampilkan tombol batal
        const duplicateBtn = document.getElementById("duplicateThrBtn");
        const cancelBtn = document.getElementById("cancelDuplicateThrBtn");
        if (duplicateBtn && cancelBtn) {
          duplicateBtn.style.display = "none";
          cancelBtn.style.display = "inline-block";
        }

        currentThrYear = currentYear;
        const yearSelect = document.getElementById("thrYearSelect");
        if (yearSelect) yearSelect.value = currentYear;
        await loadThrData();
        startThrDuplicateStatusCheck();
      } else {
        if (data.hasData) {
          Swal.fire({
            title: "Data Sudah Ada",
            html: `
              <div style="text-align: left;">
                <p>${data.message}</p>
                <p style="margin-top: 10px; color: #f59e0b;">
                  <i class="fas fa-exclamation-triangle"></i> Silakan hapus data THR tahun ${currentYear} terlebih dahulu jika ingin menduplikasi ulang.
                </p>
              </div>
            `,
            icon: "warning",
            confirmButtonText: "OK",
            confirmButtonColor: "#2563eb",
          });
        } else {
          Swal.fire({
            title: "Gagal!",
            html: `<div style="background:#fef2e8;border-radius:12px;padding:15px"><p>${data.message}</p></div>`,
            icon: "error",
            confirmButtonText: "OK",
          });
        }
      }
    } catch (err) {
      console.error("Duplicate THR error:", err);
      Swal.fire("Error!", err.message, "error");
    }
  });
}

// Cancel Duplicate THR Button
const cancelDuplicateThrBtn = document.getElementById("cancelDuplicateThrBtn");
if (cancelDuplicateThrBtn) {
  cancelDuplicateThrBtn.addEventListener("click", cancelThrDuplicate);
}

// THR Event Listeners
const addThrBtn = document.getElementById("addThrBtn");
if (addThrBtn) addThrBtn.addEventListener("click", () => openThrModal());

const closeThrModal = document.getElementById("closeThrModal");
if (closeThrModal)
  closeThrModal.addEventListener("click", () => {
    const modal = document.getElementById("thrModal");
    if (modal) modal.style.display = "none";
  });

const cancelThrBtn = document.getElementById("cancelThrBtn");
if (cancelThrBtn)
  cancelThrBtn.addEventListener("click", () => {
    const modal = document.getElementById("thrModal");
    if (modal) modal.style.display = "none";
  });

const searchThrInput = document.getElementById("searchThrInput");
if (searchThrInput) {
  searchThrInput.addEventListener("input", () => {
    currentThrPage = 1;
    renderThrTable();
  });
}

// Select All THR
const selectAllThr = document.getElementById("selectAllThr");
if (selectAllThr) {
  selectAllThr.addEventListener("change", (e) => {
    const checkboxes = document.querySelectorAll(".chk-thr:not(:disabled)");
    checkboxes.forEach((chk) => {
      chk.checked = e.target.checked;
      const id = parseInt(chk.dataset.id);
      if (e.target.checked) selectedThrSet.add(id);
      else selectedThrSet.delete(id);
    });
  });
}

// Pagination THR
const prevThrPage = document.getElementById("prevThrPage");
if (prevThrPage) {
  prevThrPage.addEventListener("click", () => {
    if (currentThrPage > 1) {
      currentThrPage--;
      renderThrTable();
    }
  });
}

const nextThrPage = document.getElementById("nextThrPage");
if (nextThrPage) {
  nextThrPage.addEventListener("click", () => {
    const query = document.getElementById("searchThrInput")?.value.toLowerCase() || "";
    const filtered = thrData.filter((d) => d.nama?.toLowerCase().includes(query) || d.no_induk?.toLowerCase().includes(query));
    if (currentThrPage * pageSizeThr < filtered.length) {
      currentThrPage++;
      renderThrTable();
    }
  });
}

function updateMonthYearDisplay() {
  const now = new Date();
  const bulan = now.toLocaleString("id-ID", { month: "long" });
  const tahun = now.getFullYear();

  // Update untuk Data Slip
  const monthYearElement = document.getElementById("currentMonthYear");
  if (monthYearElement) monthYearElement.textContent = `${bulan} ${tahun}`;

  // Update untuk Kirim Slip
  const monthYearKirimElement = document.getElementById("currentMonthYearKirim");
  if (monthYearKirimElement) monthYearKirimElement.textContent = `${bulan} ${tahun}`;

  // Update untuk Bonus
  const monthYearBonusElement = document.getElementById("currentMonthYearBonus");
  if (monthYearBonusElement) monthYearBonusElement.textContent = `${bulan} ${tahun}`;

  // Update untuk THR
  const currentYearTHRElement = document.getElementById("currentYearTHR");
  if (currentYearTHRElement) currentYearTHRElement.textContent = tahun;
}

window.addEventListener("DOMContentLoaded", () => {
  updateMonthYearDisplay();
  setTimeout(() => {
    checkBonusDuplicateStatus();
    startBonusDuplicateStatusCheck();
  }, 1000);
});

loadData();
