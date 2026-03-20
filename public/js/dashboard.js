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

// =============================
// GLOBAL VARIABLES
// =============================
let dataAll = [];
let filteredData = [];
let currentPageData = 1;
const pageSizeData = 10;
let currentPage = 1;
const pageSize = 10;
let checkedSet = new Set();
let currentCompany = "hisana";

function rupiah(x) {
  if (!x) return "Rp 0";
  return "Rp " + Number(x).toLocaleString("id-ID");
}

async function loadData() {
  try {
    const res = await fetch(`/my-slip?company=${currentCompany}`);
    dataAll = await res.json();
    console.log(`Loaded data for ${currentCompany}:`, dataAll.length, "records");
    if (dataAll.length > 0) {
      console.log(`Sample data:`, dataAll[0]);
    }
    renderTable();
    renderDataTable();
  } catch (err) {
    console.error("Load data error:", err);
  }
}

// =============================
// UPLOAD EXCEL
// =============================
// Fungsi upload Excel umum
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
      // Reset form HTML agar nama file hilang
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

// Upload form untuk Section Kirim
document.getElementById("uploadFormKirim").onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  formData.append("company", currentCompany);
  await uploadExcel(formData, "uploadStatus", "uploadFormKirim");
};

// Upload form untuk Section Data
document.getElementById("uploadFormData").onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  formData.append("company", currentCompany);
  await uploadExcel(formData, "uploadStatus", "uploadFormData");
};

// =============================
// DOWNLOAD TEMPLATE EXCEL SESUAI COMPANY
// =============================
document.getElementById("downloadTemplateBtn").onclick = () => {
  let wb = XLSX.utils.book_new();
  let ws_data = [];

  if (currentCompany === "hisana") {
    // Header template Hisana
    ws_data = [["No Induk", "NAMA", "POSISI", "STORE", "AWAL MASUK", "KERJA", "GAJI", "Iuran BPJS Ketenagakerjaan", "KERAJINAN", "CUTI", "Tunj. BPJS & Pulsa", "JUMLAH", "UM", "KETERANGAN", "GAJI TOTAL", "NO HP"]];
  } else {
    // Header template Enakko
    ws_data = [["No Induk", "Nama Karyawan", "Tanggal Masuk", "Jabatan", "Penempatan", "Gaji Utuh", "Gaji Pokok", "BPJS Kesehatan", "Insentif", "Total Gaji", "Keterangan", "No HP"]];
  }

  let ws = XLSX.utils.aoa_to_sheet(ws_data);
  XLSX.utils.book_append_sheet(wb, ws, "Template");

  const fileName = `Template_${currentCompany}.xlsx`;
  XLSX.writeFile(wb, fileName);
};

// =============================
// FORM RENDER FUNCTIONS
// =============================
function renderFormFields() {
  const formGrid = document.getElementById("formFields");
  if (!formGrid) return;

  if (currentCompany === "hisana") {
    formGrid.innerHTML = `
      <div class="formGroup"><label>No Induk</label><input type="text" id="no_induk" required /></div>
      <div class="formGroup"><label>Nama Karyawan</label><input type="text" id="nama" required /></div>
      <div class="formGroup"><label>Posisi</label><input type="text" id="posisi" required /></div>
      <div class="formGroup"><label>Store</label><input type="text" id="store" required /></div>
      <div class="formGroup"><label>Tanggal Awal Masuk</label><input type="date" id="awal_masuk" required /></div>
      <div class="formGroup"><label>Jumlah Hari Kerja</label><input type="number" id="kerja" required /></div>
      <div class="formGroup"><label>Gaji Pokok</label><input type="number" id="gaji" required /></div>
      <div class="formGroup"><label>Iuran BPJS Ketenagakerjaan</label><input type="number" id="iuran_bpjs_ketenagakerjaan" required /></div>
      <div class="formGroup"><label>Kerajinan</label><input type="number" id="kerajinan" required /></div>
      <div class="formGroup"><label>Cuti</label><input type="number" id="cuti" required /></div>
      <div class="formGroup"><label>Tunjangan BPJS & Pulsa</label><input type="number" id="tunj_bpjs_pulsa" required /></div>
      <div class="formGroup"><label>Total Perhitungan</label><input type="number" id="jumlah" required readonly style="background:#f3f4f6" /></div>
      <div class="formGroup"><label>Uang Makan (UM)</label><input type="number" id="um" required /></div>
      <div class="formGroup"><label>Keterangan</label><input type="text" id="keterangan" /></div>
      <div class="formGroup"><label>Total Gaji</label><input type="number" id="gaji_total" required readonly style="background:#f3f4f6" /></div>
      <div class="formGroup"><label>No HP Karyawan (WhatsApp)</label><input type="text" id="nohp" required /></div>
    `;

    // Re-attach event listeners for Hisana
    const triggerIds = ["gaji", "iuran_bpjs_ketenagakerjaan", "kerajinan", "cuti", "tunj_bpjs_pulsa", "um"];
    triggerIds.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.removeEventListener("input", calculatePayroll);
        element.addEventListener("input", calculatePayroll);
      }
    });
  } else {
    // Form untuk Enakko - PERBAIKAN: pastikan semua field memiliki ID yang benar
    formGrid.innerHTML = `
      <div class="formGroup"><label>No Induk *</label><input type="text" id="no_induk" required placeholder="Contoh: E001" /></div>
      <div class="formGroup"><label>Nama Karyawan *</label><input type="text" id="nama_karyawan" required placeholder="Nama lengkap" /></div>
      <div class="formGroup"><label>Tanggal Masuk *</label><input type="date" id="tanggal_masuk" required /></div>
      <div class="formGroup"><label>Jabatan *</label><input type="text" id="jabatan" required placeholder="Contoh: Staff, Supervisor" /></div>
      <div class="formGroup"><label>Penempatan *</label><input type="text" id="penempatan" required placeholder="Contoh: Blimbing, Kepanjen" /></div>
      <div class="formGroup"><label>Gaji Utuh</label><input type="number" id="gaji_utuh" value="0" step="1000" /></div>
      <div class="formGroup"><label>Gaji Pokok *</label><input type="number" id="gaji_pokok" required value="0" step="1000" /></div>
      <div class="formGroup"><label>BPJS Kesehatan</label><input type="number" id="bpjs_kesehatan" value="0" step="1000" /></div>
      <div class="formGroup"><label>Insentif</label><input type="number" id="insentif" value="0" step="1000" /></div>
      <div class="formGroup"><label>Total Gaji</label><input type="number" id="total_gaji" readonly style="background:#f3f4f6" /></div>
      <div class="formGroup"><label>Keterangan</label><input type="text" id="keterangan" placeholder="Opsional" /></div>
      <div class="formGroup"><label>No HP Karyawan *</label><input type="text" id="nohp" required placeholder="Contoh: 628123456789" /></div>
    `;

    // Add event listeners for Enakko auto-calculate
    const triggerIdsEnakko = ["gaji_utuh", "gaji_pokok", "bpjs_kesehatan", "insentif"];
    triggerIdsEnakko.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.removeEventListener("input", calculateEnakkoTotal);
        element.addEventListener("input", calculateEnakkoTotal);
      }
    });

    // Initial calculation
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
// NAVIGASI MENU UTAMA & SUBMENU
// =============================
const menuHisanaBtn = document.getElementById("menuHisana");
const menuEnakkoBtn = document.getElementById("menuEnakko");
const submenuHisana = document.getElementById("submenuHisana");
const submenuEnakko = document.getElementById("submenuEnakko");

// Fungsi untuk aktifkan submenu
function activateSubmenu(btnId, sectionId) {
  const parent = document.getElementById(btnId).parentNode;
  parent.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  document.getElementById(btnId).classList.add("active");

  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  document.getElementById(sectionId).classList.add("active");
}

// Fungsi untuk switch menu utama
function switchMainMenu(company) {
  currentCompany = company;
  checkedSet.clear();
  currentPage = 1;
  currentPageData = 1;

  renderTableHeader();
  renderDataTableHeader();
  loadData();

  if (company === "hisana") {
    menuHisanaBtn.classList.add("active");
    menuEnakkoBtn.classList.remove("active");
    submenuHisana.style.display = "flex";
    submenuEnakko.style.display = "none";

    // Default aktifkan submenu DATA Hisana
    document.getElementById("menuDataHisana").click();
  } else {
    menuEnakkoBtn.classList.add("active");
    menuHisanaBtn.classList.remove("active");
    submenuEnakko.style.display = "flex";
    submenuHisana.style.display = "none";

    // Default aktifkan submenu DATA Enakko
    document.getElementById("menuDataEnakko").click();
  }
}

// =============================
// EVENT MENU UTAMA
// =============================
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

// =============================
// DEFAULT ACTIVE SUBMENU SAAT HALAMAN LOAD
// =============================
window.addEventListener("DOMContentLoaded", () => {
  // Jika currentCompany belum di-set, default ke 'hisana'
  if (!currentCompany) currentCompany = "hisana";

  // Panggil fungsi switchMainMenu untuk set menu & submenu default
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
        <th><i class="fas fa-check-square"></i></th>
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

    if (currentCompany === "hisana") {
      let awalMasukFormatted = d.awal_masuk ? new Date(d.awal_masuk).toISOString().split("T")[0] : "";
      tr.innerHTML = `
        <td><input type="checkbox" class="chk" data-noinduk="${d.no_induk}" ${checked}></td>
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
        <td style="font-style:italic; color:var(--text-muted)">${d.keterangan || "-"}</td>
        <td class="total-bold" style="background:#f0f9ff">${rupiah(d.gaji_total)}</td>
        <td>${d.nohp}</td>
      `;
    } else {
      let tanggalMasukFormatted = d.tanggal_masuk ? new Date(d.tanggal_masuk).toISOString().split("T")[0] : "";
      tr.innerHTML = `
        <td><input type="checkbox" class="chk" data-noinduk="${d.no_induk}" ${checked}></td>
        <td>${start + i + 1}</td>
        <td>${d.no_induk}</td>
        <td style="font-weight:600">${d.nama_karyawan || d.nama}</td>
        <td>${tanggalMasukFormatted}</td>
        <td>${d.jabatan || "-"}</td>
        <td>${d.penempatan || "-"}</td>
        <td class="money">${rupiah(d.gaji_utuh || 0)}</td>
        <td class="money">${rupiah(d.gaji_pokok || 0)}</td>
        <td>${rupiah(d.bpjs_kesehatan || 0)}</td>
        <td>${rupiah(d.insentif || 0)}</td>
        <td class="total-bold">${rupiah(d.total_gaji || 0)}</td>
        <td style="font-style:italic; color:var(--text-muted)">${d.keterangan || "-"}</td>
        <td>${d.nohp}</td>
      `;
    }
    tbody.appendChild(tr);
  });

  document.querySelectorAll(".chk").forEach((chk) => {
    chk.onchange = (e) => {
      const no = e.target.dataset.noinduk;
      if (e.target.checked) checkedSet.add(no);
      else checkedSet.delete(no);
    };
  });

  const pageInfo = document.getElementById("pageInfo");
  if (pageInfo) pageInfo.innerText = `Halaman ${currentPage} dari ${totalPages || 1}`;
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
        <td>
          <button class="btn-primary" style="padding:5px 10px;" onclick='openModalById(${d.id})'>
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn-danger" style="padding:5px 10px;" onclick='deleteData(${d.id})'>
            <i class="fas fa-trash"></i>
          </button>
        </td>
      `;
    }
    tbody.appendChild(tr);
  });

  const dataPageInfo = document.getElementById("dataPageInfo");
  if (dataPageInfo) dataPageInfo.innerText = `Halaman ${currentPageData} dari ${totalPages || 1}`;
}

// =============================
// MODAL FUNCTIONS
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
    } else {
      // Untuk Enakko
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
    }
  } else {
    document.getElementById("modalTitle").innerText = "Tambah Data Slip Baru";
    document.getElementById("dataForm").reset();
    document.getElementById("dataId").value = "";

    if (currentCompany === "enakko") {
      calculateEnakkoTotal();
    }
  }
}

window.openModalById = (id) => {
  const item = dataAll.find((d) => d.id == id);
  openModal(item);
};

// =============================
// CANCEL BUTTON MODAL
// =============================

// Modal Data Slip
document.getElementById("cancelModalBtn")?.addEventListener("click", () => {
  const modal = document.getElementById("dataModal");
  if (modal) modal.style.display = "none";
});

// Modal Bonus
document.getElementById("cancelBonusBtn")?.addEventListener("click", () => {
  const modal = document.getElementById("bonusModal");
  if (modal) modal.style.display = "none";
});

// Modal THR
document.getElementById("cancelThrBtn")?.addEventListener("click", () => {
  const modal = document.getElementById("thrModal");
  if (modal) modal.style.display = "none";
});

window.addEventListener("click", (e) => {
  const modals = ["dataModal", "bonusModal", "thrModal"];
  modals.forEach((id) => {
    const modal = document.getElementById(id);
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });
});

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
    cancelButtonColor: "#64748b",
    confirmButtonText: "Ya, hapus!",
    cancelButtonText: "Batal",
  });

  if (!result.isConfirmed) return;

  try {
    const res = await fetch(`/slip/${id}?company=${currentCompany}`, {
      method: "DELETE",
    });

    const resultData = await res.json();

    if (resultData.success) {
      Swal.fire("Berhasil!", "Data berhasil dihapus.", "success");
      await loadData();
    } else {
      Swal.fire("Gagal!", "Data tidak ditemukan.", "error");
    }
  } catch (err) {
    console.error(err);
    Swal.fire("Error!", "Server error.", "error");
  }
};

document.getElementById("dataForm").onsubmit = async (e) => {
  e.preventDefault();

  const id = document.getElementById("dataId").value;
  let payload = {};

  if (currentCompany === "hisana") {
    const fields = ["no_induk", "nama", "posisi", "store", "awal_masuk", "kerja", "gaji", "iuran_bpjs_ketenagakerjaan", "kerajinan", "cuti", "tunj_bpjs_pulsa", "jumlah", "um", "keterangan", "gaji_total", "nohp"];
    fields.forEach((k) => {
      payload[k] = document.getElementById(k).value;
    });
  } else {
    // Untuk Enakko - PERBAIKAN: pastikan semua field terisi
    console.log("Preparing Enakko payload...");

    payload = {
      no_induk: document.getElementById("no_induk")?.value || "",
      nama_karyawan: document.getElementById("nama_karyawan")?.value || document.getElementById("nama")?.value || "",
      tanggal_masuk: document.getElementById("tanggal_masuk")?.value || "",
      jabatan: document.getElementById("jabatan")?.value || "",
      penempatan: document.getElementById("penempatan")?.value || "",
      gaji_utuh: document.getElementById("gaji_utuh")?.value || 0,
      gaji_pokok: document.getElementById("gaji_pokok")?.value || 0,
      bpjs_kesehatan: document.getElementById("bpjs_kesehatan")?.value || 0,
      insentif: document.getElementById("insentif")?.value || 0,
      total_gaji: document.getElementById("total_gaji")?.value || 0,
      keterangan: document.getElementById("keterangan")?.value || "",
      nohp: document.getElementById("nohp")?.value || "",
    };

    // Validasi field yang diperlukan
    if (!payload.no_induk) {
      Swal.fire("Error", "No Induk harus diisi", "error");
      return;
    }
    if (!payload.nama_karyawan) {
      Swal.fire("Error", "Nama Karyawan harus diisi", "error");
      return;
    }
    if (!payload.tanggal_masuk) {
      Swal.fire("Error", "Tanggal Masuk harus diisi", "error");
      return;
    }
    if (!payload.jabatan) {
      Swal.fire("Error", "Jabatan harus diisi", "error");
      return;
    }
    if (!payload.penempatan) {
      Swal.fire("Error", "Penempatan harus diisi", "error");
      return;
    }
    if (!payload.nohp) {
      Swal.fire("Error", "No HP harus diisi", "error");
      return;
    }

    console.log("Enakko payload:", payload);
  }

  const method = id ? "PUT" : "POST";
  const url = id ? `/slip/${id}?company=${currentCompany}` : `/slip?company=${currentCompany}`;

  try {
    console.log(`Sending ${method} request to:`, url);
    console.log("Payload:", payload);

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    console.log("Response status:", res.status);

    const result = await res.json();
    console.log("Response data:", result);

    if (result.success) {
      document.getElementById("dataModal").style.display = "none";
      await loadData();
      Swal.fire({
        title: "Berhasil!",
        text: id ? "Data berhasil diperbarui." : "Data berhasil ditambahkan.",
        icon: "success",
      });
    } else {
      // Tampilkan pesan error dari server
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
    return Swal.fire("Peringatan", "Pilih karyawan terlebih dahulu", "warning");
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
      }
    } catch (err) {
      Swal.fire("Error", "Gagal memulai pengiriman", "error");
    }
  }
});

function trackProgress() {
  const btn = document.getElementById("sendSelected");
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...';

  const interval = setInterval(async () => {
    try {
      const res = await fetch("/progress");
      const p = await res.json();

      const percent = p.total > 0 ? ((p.sent + p.failed) / p.total) * 100 : 0;
      const bar = document.getElementById("bar");
      const status = document.getElementById("status");

      if (bar) bar.style.width = percent + "%";
      if (status) status.innerText = `Proses: ${p.sent} Berhasil, ${p.failed} Gagal dari ${p.total} Total`;

      if (!p.running && p.sent + p.failed >= p.total && p.total > 0) {
        clearInterval(interval);

        // --- SWEETALERT VERSI CANTIK ---
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
                  ${
                    p.failed > 0
                      ? `<i class="fas fa-exclamation-circle" style="color: #f59e0b;"></i> Ada ${p.failed} data yang gagal dikirim. Silakan cek koneksi atau nomor WhatsApp.`
                      : '<i class="fas fa-check-circle" style="color: #16a34a;"></i> Semua slip gaji berhasil terkirim sempurna!'
                  }
                </p>
              </div>
            </div>
          `,
          icon: p.failed > 0 ? "warning" : "success",
          iconColor: p.failed > 0 ? "#f59e0b" : "#16a34a",
          showConfirmButton: true,
          confirmButtonText: '<i class="fas fa-check"></i> Selesai',
          confirmButtonColor: "#2563eb",
          background: "#ffffff",
          customClass: {
            title: "swal-title-custom",
            popup: "swal-popup-custom",
          },
          allowOutsideClick: false,
        }).then((result) => {
          if (result.isConfirmed) {
            checkedSet.clear();
            loadData();
            if (bar) bar.style.width = "0%";
          }
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
    // Header Hisana
    ws_data.push(["No Induk", "NAMA", "POSISI", "STORE", "AWAL MASUK", "KERJA", "GAJI", "Iuran BPJS Ketenagakerjaan", "KERAJINAN", "CUTI", "Tunj. BPJS & Pulsa", "JUMLAH", "UM", "KETERANGAN", "GAJI TOTAL", "NO HP"]);

    // Data
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
    // Header Enakko
    ws_data.push(["No Induk", "Nama Karyawan", "Tanggal Masuk", "Jabatan", "Penempatan", "Gaji Utuh", "Gaji Pokok", "BPJS Kesehatan", "Insentif", "Total Gaji", "Keterangan", "No HP"]);

    // Data
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

document.getElementById("resetCheckbox")?.addEventListener("click", () => {
  checkedSet.clear();
  renderTable();
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
// BONUS & THR FUNCTIONS (Placeholder)
// =============================
async function loadBonusData() {
  console.log("Load bonus data for:", currentCompany);
}

async function loadThrData() {
  console.log("Load THR data for:", currentCompany);
}

// =============================
// WEBSOCKET FOR FORCE LOGOUT
// =============================
const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(`${protocol}//${window.location.host}`);

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.status === "force_logout") {
    Swal.fire({
      title: "Sesi Berakhir",
      text: "Koneksi WhatsApp terputus dari perangkat mobile Anda. Silakan login kembali.",
      icon: "warning",
      confirmButtonColor: "#2563eb",
      confirmButtonText: "OK",
      allowOutsideClick: false,
    }).then(() => {
      window.location.href = "/";
    });
  }
};

socket.onclose = () => {
  console.warn("WebSocket connection closed. Reconnecting might be needed.");
};

socket.onerror = (error) => {
  console.error("WebSocket Error: ", error);
};

// =============================
// INITIAL LOAD
// =============================
loadData();
