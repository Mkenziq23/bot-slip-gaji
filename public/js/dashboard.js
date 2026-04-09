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

// ============================================
// SESSION CHECKER - WEBSOCKET FORCE LOGOUT
// ============================================

// WebSocket connection untuk menerima force logout dari server
const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(`${protocol}//${window.location.host}`);

socket.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    if (data.status === "force_logout") {
      Swal.fire({
        title: "Sesi Berakhir",
        text: data.message || "Koneksi WhatsApp terputus. Silakan login kembali.",
        icon: "warning",
        confirmButtonText: "OK",
        allowOutsideClick: false,
      }).then(() => {
        window.location.href = "/";
      });
    }
  } catch (err) {
    console.error("WebSocket message error:", err);
  }
};

socket.onerror = (error) => {
  console.error("WebSocket error:", error);
};

// Session checker via HTTP (fallback)
let sessionCheckInterval = null;

function startSessionCheck() {
  if (sessionCheckInterval) clearInterval(sessionCheckInterval);

  sessionCheckInterval = setInterval(async () => {
    try {
      const response = await fetch("/check-session");
      const data = await response.json();

      if (!data.loggedIn) {
        console.log("Session expired or device disconnected");

        Swal.fire({
          title: "Sesi Berakhir",
          text: data.reason || "Sesi Anda telah berakhir. Silakan login ulang.",
          icon: "warning",
          confirmButtonText: "OK",
          allowOutsideClick: false,
        }).then(() => {
          window.location.href = "/";
        });
      }
    } catch (err) {
      console.error("Session check error:", err);
    }
  }, 30000); // Check every 30 seconds
}

// Start session check when dashboard loads
startSessionCheck();

// ============================================
// END OF SESSION CHECKER
// ============================================

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
// DASHBOARD FUNCTIONS
// =============================
let dashboardData = {
  totalKaryawan: 0,
  totalSlip: 0,
  totalBonus: 0,
  totalThr: 0,

  karyawanRingkasan: [],
};
let currentDashboardPage = 1;
const pageSizeDashboard = 10;

async function loadDashboardData() {
  try {
    console.log(`Loading dashboard data for company: ${currentCompany}`);

    const res = await fetch(`/dashboard-data?company=${currentCompany}`);

    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const data = await res.json();

    if (data.success === false) {
      throw new Error(data.error || "Gagal memuat data");
    }

    dashboardData = data;

    // Update statistik cards
    const totalKaryawanEl = document.getElementById("totalKaryawanStat");
    const totalSlipEl = document.getElementById("totalSlipStat");
    const totalBonusEl = document.getElementById("totalBonusStat");
    const totalThrEl = document.getElementById("totalThrStat");

    if (totalKaryawanEl) totalKaryawanEl.innerText = formatNumber(data.totalKaryawan || 0);
    if (totalSlipEl) totalSlipEl.innerText = formatNumber(data.totalSlip || 0);
    if (totalBonusEl) totalBonusEl.innerText = formatNumber(data.totalBonus || 0);
    if (totalThrEl) totalThrEl.innerText = formatNumber(data.totalThr || 0);

    renderDashboardTable();
  } catch (err) {
    console.error("Load dashboard data error:", err);

    const tbody = document.querySelector("#tableDashboard tbody");
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px;">
            <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 10px; display: block;"></i>
            <p style="color: #64748b;">Gagal memuat data dashboard: ${err.message}</p>
            <button class="btn-primary" onclick="loadDashboardData()" style="margin-top: 10px;">
              <i class="fas fa-sync-alt"></i> Coba Lagi
            </button>
          </td>
        </tr>
      `;
    }

    // Reset stats to 0 on error
    const totalKaryawanEl = document.getElementById("totalKaryawanStat");
    const totalSlipEl = document.getElementById("totalSlipStat");
    const totalBonusEl = document.getElementById("totalBonusStat");
    const totalThrEl = document.getElementById("totalThrStat");

    if (totalKaryawanEl) totalKaryawanEl.innerText = "0";
    if (totalSlipEl) totalSlipEl.innerText = "0";
    if (totalBonusEl) totalBonusEl.innerText = "0";
    if (totalThrEl) totalThrEl.innerText = "0";
  }
}

function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "jt";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(0) + "rb";
  }
  return num.toString();
}

function renderDashboardTable() {
  const tbody = document.querySelector("#tableDashboard tbody");
  if (!tbody) return;

  const query = document.getElementById("searchDashboardInput")?.value.toLowerCase() || "";

  let filtered = dashboardData.karyawanRingkasan || [];

  if (query) {
    filtered = filtered.filter((k) => (k.no_induk && k.no_induk.toLowerCase().includes(query)) || (k.nama && k.nama.toLowerCase().includes(query)));
  }

  const totalPages = Math.ceil(filtered.length / pageSizeDashboard);
  if (currentDashboardPage > totalPages && totalPages > 0) currentDashboardPage = totalPages;
  if (currentDashboardPage < 1) currentDashboardPage = 1;

  const start = (currentDashboardPage - 1) * pageSizeDashboard;
  const pageData = filtered.slice(start, start + pageSizeDashboard);

  if (pageData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 40px;">
          <i class="fas fa-chart-line" style="font-size: 48px; color: #cbd5e1; margin-bottom: 10px; display: block;"></i>
          <p style="color: #64748b;">${filtered.length === 0 && query ? "Tidak ada data yang sesuai dengan pencarian" : "Belum ada data karyawan"}</p>
          ${filtered.length === 0 && !query ? '<p style="color: #64748b; margin-top: 5px;">Silakan tambahkan data karyawan terlebih dahulu</p>' : ""}
        </td>
      </tr>
    `;
    const dashboardPageInfo = document.getElementById("dashboardPageInfo");
    if (dashboardPageInfo) dashboardPageInfo.innerText = `Halaman 0 dari 0`;
    return;
  }

  tbody.innerHTML = "";
  pageData.forEach((item) => {
    const tr = document.createElement("tr");

    // Format currency
    const totalGaji = item.total_gaji || 0;
    const totalBonus = item.total_bonus || 0;
    const totalThr = item.total_thr || 0;

    tr.innerHTML = `
      <td style="font-weight: 500;">${escapeHtml(item.no_induk || "-")}</td>
      <td style="font-weight:600">${escapeHtml(item.nama || "-")}</td>
      <td>${escapeHtml(item.jabatan || "-")}</td>
      <td class="money">${rupiah(totalGaji)}</td>
      <td class="money">${rupiah(totalBonus)}</td>
      <td class="money">${rupiah(totalThr)}</td>
    `;
    tbody.appendChild(tr);
  });

  const dashboardPageInfo = document.getElementById("dashboardPageInfo");
  if (dashboardPageInfo) {
    dashboardPageInfo.innerText = `Halaman ${currentDashboardPage} dari ${totalPages || 1}`;
  }
}

function showDashboardSection(company) {
  console.log(`🟢 showDashboardSection dipanggil untuk company: ${company}`);

  // Tutup semua dropdown Data Master
  closeAllDataMasterDropdowns();

  const companyNameSpan = document.getElementById("dashboardCompanyName");
  if (companyNameSpan) {
    companyNameSpan.textContent = company === "hisana" ? "Hisana" : "Enakko";
  }

  currentDashboardPage = 1;

  // Sembunyikan semua section
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));

  // Tampilkan section Dashboard
  const targetSection = document.getElementById("sectionDashboard");
  if (targetSection) {
    targetSection.classList.add("active");
    console.log("✅ Section Dashboard activated");
  } else {
    console.error("❌ Section Dashboard tidak ditemukan!");
    return;
  }

  // Reset search input
  const searchInput = document.getElementById("searchDashboardInput");
  if (searchInput) {
    searchInput.value = "";
  }

  // Load data dashboard
  loadDashboardData();
}

// Setup Dashboard Buttons
function setupDashboardHandlers() {
  // Dashboard Hisana
  const dashboardHisana = document.getElementById("dashboardHisana");
  if (dashboardHisana) {
    const newDashboardHisana = dashboardHisana.cloneNode(true);
    dashboardHisana.parentNode.replaceChild(newDashboardHisana, dashboardHisana);

    newDashboardHisana.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("🖱️ Dashboard Hisana clicked");

      // Tutup semua dropdown Data Master
      closeAllDataMasterDropdowns();

      // Update current company
      currentCompany = "hisana";

      showDashboardSection("hisana");

      document.querySelectorAll(".nav-item").forEach((btn) => btn.classList.remove("active"));
      newDashboardHisana.classList.add("active");
    };
  }

  // Dashboard Enakko
  const dashboardEnakko = document.getElementById("dashboardEnakko");
  if (dashboardEnakko) {
    const newDashboardEnakko = dashboardEnakko.cloneNode(true);
    dashboardEnakko.parentNode.replaceChild(newDashboardEnakko, dashboardEnakko);

    newDashboardEnakko.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("🖱️ Dashboard Enakko clicked");

      // Tutup semua dropdown Data Master
      closeAllDataMasterDropdowns();

      // Update current company
      currentCompany = "enakko";

      showDashboardSection("enakko");

      document.querySelectorAll(".nav-item").forEach((btn) => btn.classList.remove("active"));
      newDashboardEnakko.classList.add("active");
    };
  }

  // ... rest of the function (search and pagination) ...
}
// =============================
// GLOBAL DATA KARYAWAN
// =============================
let karyawanData = [];
let lokasiStoreList = [];
let currentKaryawanPage = 1;
const pageSizeKaryawan = 10;
let currentKaryawanCompany = "hisana";

// =============================
// LOAD LOKASI STORE DROPDOWN
// =============================
async function loadLokasiStoreDropdown() {
  try {
    console.log(`Loading lokasi store dropdown for company: ${currentKaryawanCompany}`);
    const res = await fetch(`/data-karyawan/lokasi-store?company=${currentKaryawanCompany}`);
    const data = await res.json();

    if (data.success) {
      lokasiStoreList = data.data;
      console.log(`Loaded ${lokasiStoreList.length} lokasi store`);
      return lokasiStoreList;
    }
    return [];
  } catch (err) {
    console.error("Load lokasi store dropdown error:", err);
    return [];
  }
}

function renderLokasiStoreDropdown(selectedId = null) {
  const container = document.getElementById("karyawan_lokasi_store_container");
  if (!container) return;

  if (lokasiStoreList.length === 0) {
    container.innerHTML = `
      <div style="color: #ef4444; font-size: 0.8rem; margin-top: 5px;">
        <i class="fas fa-exclamation-triangle"></i> 
        Belum ada data lokasi store. Silakan tambahkan lokasi store terlebih dahulu.
        <button type="button" class="btn-outline" onclick="showLokasiStoreSection(currentKaryawanCompany)" style="margin-left: 10px; padding: 2px 8px;">
          <i class="fas fa-plus"></i> Tambah Lokasi
        </button>
      </div>
    `;
    return;
  }

  let options = '<option value="">Pilih Lokasi Store</option>';
  lokasiStoreList.forEach((store) => {
    options += `<option value="${store.id}" ${selectedId == store.id ? "selected" : ""}>
      ${escapeHtml(store.nama_store)} - ${escapeHtml(store.alamat.substring(0, 50))}${store.alamat.length > 50 ? "..." : ""}
    </option>`;
  });

  container.innerHTML = `
    <select id="karyawan_lokasi_store_id" class="form-control" required style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
      ${options}
    </select>
  `;
}

// =============================
// DATA KARYAWAN CRUD FUNCTIONS
// =============================

// Fungsi untuk format nomor HP
function formatPhoneNumberForDisplay(phoneNumber) {
  if (!phoneNumber) return "";
  let cleaned = phoneNumber.toString().replace(/\D/g, "");
  if (cleaned.startsWith("62")) {
    cleaned = cleaned.substring(2);
  }
  return cleaned;
}

function formatPhoneNumberForDatabase(phoneNumber) {
  if (!phoneNumber) return "";
  let cleaned = phoneNumber.toString().replace(/\D/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "62" + cleaned.substring(1);
  } else if (!cleaned.startsWith("62")) {
    cleaned = "62" + cleaned;
  }
  return cleaned;
}

// Fungsi untuk format tanggal
function formatDateToDisplay(dateString) {
  if (!dateString) return "-";
  if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const parts = dateString.split("-");
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateString;
}

function displayDateFromInput(inputElement) {
  if (!inputElement || !inputElement.value) return "";
  const date = new Date(inputElement.value);
  if (!isNaN(date.getTime())) {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }
  return inputElement.value;
}

// Setup date display
function setupDateDisplay() {
  const tanggalLahirInput = document.getElementById("karyawan_tanggal_lahir");
  if (tanggalLahirInput) {
    const dateDisplaySpan = document.createElement("span");
    dateDisplaySpan.style.cssText = "font-size: 0.75rem; color: #64748b; margin-top: 4px; display: block;";
    tanggalLahirInput.parentNode.appendChild(dateDisplaySpan);

    tanggalLahirInput.addEventListener("change", function () {
      if (this.value) {
        const formatted = displayDateFromInput(this);
        dateDisplaySpan.innerHTML = `<i class="fas fa-calendar-alt"></i> Format: ${formatted}`;
      } else {
        dateDisplaySpan.innerHTML = "";
      }
    });

    if (tanggalLahirInput.value) {
      const formatted = displayDateFromInput(tanggalLahirInput);
      dateDisplaySpan.innerHTML = `<i class="fas fa-calendar-alt"></i> Format: ${formatted}`;
    }
  }
}

// Setup preview gambar
function setupImagePreview() {
  const fotoDiriInput = document.getElementById("karyawan_foto_diri");
  const fotoKtpInput = document.getElementById("karyawan_foto_ktp");

  if (fotoDiriInput) {
    const newFotoDiriInput = fotoDiriInput.cloneNode(true);
    fotoDiriInput.parentNode.replaceChild(newFotoDiriInput, fotoDiriInput);

    newFotoDiriInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      const previewDiv = document.getElementById("preview_foto_diri");

      if (file) {
        if (!file.type.startsWith("image/")) {
          SwalFireWithModal("Error", "File harus berupa gambar", "error");
          newFotoDiriInput.value = "";
          previewDiv.innerHTML = "";
          return;
        }

        if (file.size > 2 * 1024 * 1024) {
          SwalFireWithModal("Error", "Ukuran gambar maksimal 2MB", "error");
          newFotoDiriInput.value = "";
          previewDiv.innerHTML = "";
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          previewDiv.innerHTML = `<img src="${event.target.result}" class="image-preview" style="max-width: 100px; max-height: 100px; object-fit: cover; border-radius: 8px;">`;
        };
        reader.readAsDataURL(file);
      } else {
        previewDiv.innerHTML = "";
      }
    });
  }

  if (fotoKtpInput) {
    const newFotoKtpInput = fotoKtpInput.cloneNode(true);
    fotoKtpInput.parentNode.replaceChild(newFotoKtpInput, fotoKtpInput);

    newFotoKtpInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      const previewDiv = document.getElementById("preview_foto_ktp");

      if (file) {
        if (!file.type.startsWith("image/")) {
          SwalFireWithModal("Error", "File harus berupa gambar", "error");
          newFotoKtpInput.value = "";
          previewDiv.innerHTML = "";
          return;
        }

        if (file.size > 2 * 1024 * 1024) {
          SwalFireWithModal("Error", "Ukuran gambar maksimal 2MB", "error");
          newFotoKtpInput.value = "";
          previewDiv.innerHTML = "";
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          previewDiv.innerHTML = `<img src="${event.target.result}" class="image-preview" style="max-width: 100px; max-height: 100px; object-fit: cover; border-radius: 8px;">`;
        };
        reader.readAsDataURL(file);
      } else {
        previewDiv.innerHTML = "";
      }
    });
  }
}

// Fungsi Swal dengan target modal
function SwalFireWithModal(title, text, icon) {
  const modal = document.getElementById("karyawanModal");
  if (modal && modal.style.display === "flex") {
    Swal.fire({
      title: title,
      text: text,
      icon: icon,
      confirmButtonText: "OK",
      allowOutsideClick: false,
    });
  } else {
    Swal.fire(title, text, icon);
  }
}

// Fungsi untuk mendapatkan nama store dari ID
function getNamaStoreById(storeId) {
  const store = lokasiStoreList.find((s) => s.id == storeId);
  return store ? store.nama_store : "-";
}

// Fungsi untuk mendapatkan alamat store dari ID
function getAlamatStoreById(storeId) {
  const store = lokasiStoreList.find((s) => s.id == storeId);
  return store ? store.alamat : "-";
}

async function loadKaryawanData() {
  try {
    console.log(`📡 Loading karyawan data for company: ${currentKaryawanCompany}`);

    const tbody = document.querySelector("#tableKaryawan tbody");
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="14" style="text-align: center; padding: 40px;">
            <i class="fas fa-spinner fa-spin" style="font-size: 32px; color: #2563eb;"></i>
            <p style="margin-top: 10px; color: #64748b;">Memuat data karyawan...</p>
          </td>
        </tr>
      `;
    }

    // Load lokasi store terlebih dahulu
    await loadLokasiStoreDropdown();

    const res = await fetch(`/data-karyawan?company=${currentKaryawanCompany}`);

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || `HTTP error! status: ${res.status}`);
    }

    karyawanData = await res.json();
    console.log(`✅ Loaded ${karyawanData.length} karyawan records`);
    console.log("Sample karyawan data:", karyawanData[0]);

    renderKaryawanTable();
  } catch (err) {
    console.error("❌ Load karyawan data error:", err);
    const tbody = document.querySelector("#tableKaryawan tbody");
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="14" style="text-align: center; padding: 40px;">
            <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 10px; display: block;"></i>
            <p style="color: #64748b;">Gagal memuat data karyawan: ${err.message}</p>
            <button class="btn-primary" onclick="loadKaryawanData()" style="margin-top: 10px;">
              <i class="fas fa-sync-alt"></i> Coba Lagi
            </button>
          </td>
        </tr>
      `;
    }
  }
}

function renderKaryawanTable() {
  const tbody = document.querySelector("#tableKaryawan tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const query = document.getElementById("searchKaryawanInput")?.value.toLowerCase() || "";

  // Filter data
  const filtered = karyawanData.filter((d) => d.nama_lengkap?.toLowerCase().includes(query) || d.no_induk?.toLowerCase().includes(query) || d.nik?.toLowerCase().includes(query));

  const totalPages = Math.ceil(filtered.length / pageSizeKaryawan);
  if (currentKaryawanPage > totalPages && totalPages > 0) currentKaryawanPage = totalPages;
  if (currentKaryawanPage < 1) currentKaryawanPage = 1;

  const start = (currentKaryawanPage - 1) * pageSizeKaryawan;
  const pageData = filtered.slice(start, start + pageSizeKaryawan);

  if (pageData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="16" style="text-align: center; padding: 40px;">
          <i class="fas fa-users" style="font-size: 48px; color: #cbd5e1; margin-bottom: 10px; display: block;"></i>
          <p style="color: #64748b;">Belum ada data karyawan</p>
          <button class="btn-primary" onclick="openKaryawanModal()" style="margin-top: 10px;">
            <i class="fas fa-plus"></i> Tambah Karyawan
          </button>
        </td>
      </tr>
    `;
    const karyawanPageInfo = document.getElementById("karyawanPageInfo");
    if (karyawanPageInfo) karyawanPageInfo.innerText = `Halaman 0 dari 0`;
    return;
  }

  pageData.forEach((d, i) => {
    const tr = document.createElement("tr");

    // Format tanggal lahir ke format Indonesia
    let tglLahir = "-";
    if (d.tanggal_lahir) {
      const date = new Date(d.tanggal_lahir);
      if (!isNaN(date.getTime())) {
        tglLahir = date.toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
      }
    }

    // Format awal masuk ke format Indonesia
    let awalMasuk = "-";
    if (d.awal_masuk) {
      const date = new Date(d.awal_masuk);
      if (!isNaN(date.getTime())) {
        awalMasuk = date.toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
      }
    }

    // Foto Diri
    let fotoDiriHtml = "-";
    if (d.foto_diri && d.foto_diri !== "") {
      fotoDiriHtml = `<a href="${d.foto_diri}" target="_blank" class="foto-link" style="color: #2563eb; text-decoration: none;" title="Lihat Foto Diri">
        <i class="fas fa-image"></i> Lihat
      </a>`;
    }

    // Foto KTP
    let fotoKtpHtml = "-";
    if (d.foto_ktp && d.foto_ktp !== "") {
      fotoKtpHtml = `<a href="${d.foto_ktp}" target="_blank" class="foto-link" style="color: #2563eb; text-decoration: none;" title="Lihat Foto KTP">
        <i class="fas fa-id-card"></i> Lihat
      </a>`;
    }

    // Format No HP untuk display (hilangkan 62 di awal)
    let noHpDisplay = d.no_hp || "-";
    if (noHpDisplay !== "-" && noHpDisplay.startsWith("62")) {
      noHpDisplay = "0" + noHpDisplay.substring(2);
    }

    // Data Store (dari JOIN dengan tabel lokasi_store)
    const namaGerai = d.nama_store || "-";
    const cabangAlamat = d.alamat_store || "-";

    tr.innerHTML = `
      <td class="text-center" style="width: 50px;">${start + i + 1}</td>
      <td style="font-weight: 500;">${escapeHtml(d.no_induk || "-")}</td>
      <td style="font-weight: 600;">${escapeHtml(d.nama_lengkap || "-")}</td>
      <td>${escapeHtml(d.nik || "-")}</td>
      <td>${tglLahir}</td>
      <td style="max-width: 200px; word-break: break-word;">${escapeHtml(d.alamat_domisili || "-")}</td>
      <td>${escapeHtml(noHpDisplay)}</td>
      <td>${escapeHtml(d.email || "-")}</td>
      <td>${awalMasuk}
      <td>${escapeHtml(d.jabatan || "-")}</td>
      <td><strong>${escapeHtml(namaGerai)}</strong></td>
      <td><small style="color: #64748b; font-size: 11px;">${escapeHtml(cabangAlamat)}</small></td>
      <td class="text-center">${fotoDiriHtml}</td>
      <td class="text-center">${fotoKtpHtml}</td>
      <td class="text-center" style="white-space: nowrap;">
        <button class="btn-primary" style="padding: 5px 10px; margin-right: 5px;" onclick='openKaryawanModalById(${d.id})' title="Edit">
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn-danger" style="padding: 5px 10px;" onclick='deleteKaryawan(${d.id})' title="Hapus">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const karyawanPageInfo = document.getElementById("karyawanPageInfo");
  if (karyawanPageInfo) {
    karyawanPageInfo.innerText = `Halaman ${currentKaryawanPage} dari ${totalPages || 1}`;
  }
}

function openKaryawanModal(item = null) {
  console.log("🔵 openKaryawanModal called, item:", item);

  const modal = document.getElementById("karyawanModal");
  if (!modal) {
    console.error("❌ Modal karyawanModal tidak ditemukan di DOM!");
    return;
  }

  const form = document.getElementById("karyawanForm");
  if (form) form.reset();

  document.getElementById("karyawan_id").value = "";
  document.getElementById("preview_foto_diri").innerHTML = "";
  document.getElementById("preview_foto_ktp").innerHTML = "";

  if (item) {
    // Mode Edit
    document.getElementById("karyawanModalTitle").innerText = "Edit Karyawan";
    document.getElementById("karyawan_id").value = item.id;
    document.getElementById("karyawan_no_induk").value = item.no_induk || "";
    document.getElementById("karyawan_nama_lengkap").value = item.nama_lengkap || "";
    document.getElementById("karyawan_nik").value = item.nik || "";

    if (item.tanggal_lahir) {
      let tglLahir = item.tanggal_lahir;
      if (tglLahir.includes("/")) {
        const parts = tglLahir.split("/");
        if (parts.length === 3) {
          tglLahir = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
      }
      document.getElementById("karyawan_tanggal_lahir").value = tglLahir;

      setTimeout(() => {
        const dateInput = document.getElementById("karyawan_tanggal_lahir");
        if (dateInput && dateInput.value) {
          const displaySpan = dateInput.parentNode.querySelector("span");
          if (displaySpan) {
            const formatted = displayDateFromInput(dateInput);
            displaySpan.innerHTML = `<i class="fas fa-calendar-alt"></i> Format: ${formatted}`;
          }
        }
      }, 100);
    } else {
      document.getElementById("karyawan_tanggal_lahir").value = "";
    }

    // Set awal_masuk
    if (item.awal_masuk) {
      document.getElementById("karyawan_awal_masuk").value = item.awal_masuk;
    } else {
      document.getElementById("karyawan_awal_masuk").value = "";
    }

    document.getElementById("karyawan_alamat_domisili").value = item.alamat_domisili || "";

    let noHp = item.no_hp || "";
    noHp = formatPhoneNumberForDisplay(noHp);
    document.getElementById("karyawan_no_hp").value = noHp;

    document.getElementById("karyawan_email").value = item.email || "";
    document.getElementById("karyawan_jabatan").value = item.jabatan || "";
    document.getElementById("karyawan_foto_diri_url").value = item.foto_diri || "";
    document.getElementById("karyawan_foto_ktp_url").value = item.foto_ktp || "";

    const passwordInput = document.getElementById("karyawan_password");
    if (passwordInput) {
      passwordInput.required = false;
      passwordInput.placeholder = "Kosongkan jika tidak ingin mengubah password";
      passwordInput.value = "";
      const passwordHint = document.getElementById("passwordHint");
      if (passwordHint) {
        passwordHint.innerHTML = "Kosongkan jika tidak ingin mengubah password";
      }
    }

    if (item.foto_diri && item.foto_diri !== "") {
      document.getElementById("preview_foto_diri").innerHTML = `<img src="${item.foto_diri}" class="image-preview" style="max-width: 100px; max-height: 100px; object-fit: cover; border-radius: 8px;">`;
    }
    if (item.foto_ktp && item.foto_ktp !== "") {
      document.getElementById("preview_foto_ktp").innerHTML = `<img src="${item.foto_ktp}" class="image-preview" style="max-width: 100px; max-height: 100px; object-fit: cover; border-radius: 8px;">`;
    }

    // Load lokasi store dropdown dengan selected value
    loadLokasiStoreDropdown().then(() => {
      renderLokasiStoreDropdown(item.lokasi_store_id);
    });
  } else {
    // Mode Tambah
    document.getElementById("karyawanModalTitle").innerText = "Tambah Karyawan Baru";
    document.getElementById("karyawan_no_induk").value = "";
    document.getElementById("karyawan_no_induk").readOnly = false;
    document.getElementById("karyawan_no_induk").style.background = "white";
    document.getElementById("karyawan_no_induk").placeholder = "Contoh: H001 atau E001";

    const passwordInput = document.getElementById("karyawan_password");
    if (passwordInput) {
      passwordInput.required = true;
      passwordInput.placeholder = "Minimal 6 karakter";
      passwordInput.value = "";
      const passwordHint = document.getElementById("passwordHint");
      if (passwordHint) {
        passwordHint.innerHTML = "Minimal 6 karakter";
      }
    }

    document.getElementById("karyawan_nama_lengkap").value = "";
    document.getElementById("karyawan_nik").value = "";
    document.getElementById("karyawan_tanggal_lahir").value = "";
    document.getElementById("karyawan_awal_masuk").value = "";
    document.getElementById("karyawan_alamat_domisili").value = "";
    document.getElementById("karyawan_no_hp").value = "";
    document.getElementById("karyawan_email").value = "";
    document.getElementById("karyawan_jabatan").value = "";

    // Load lokasi store dropdown tanpa selected value
    loadLokasiStoreDropdown().then(() => {
      renderLokasiStoreDropdown(null);
    });
  }

  modal.style.display = "flex";
  console.log("✅ Modal ditampilkan");
}

window.openKaryawanModalById = (id) => {
  console.log("Opening karyawan modal for ID:", id);
  const item = karyawanData.find((d) => d.id == id);
  if (item) {
    openKaryawanModal(item);
  } else {
    SwalFireWithModal("Error", "Data karyawan tidak ditemukan", "error");
  }
};

window.deleteKaryawan = async (id) => {
  const result = await Swal.fire({
    title: "Apakah Anda yakin?",
    text: "Data karyawan ini akan dihapus secara permanen!",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    confirmButtonText: "Ya, hapus!",
    cancelButtonText: "Batal",
  });

  if (!result.isConfirmed) return;

  try {
    const res = await fetch(`/data-karyawan/${id}?company=${currentKaryawanCompany}`, { method: "DELETE" });
    const resultData = await res.json();

    if (resultData.success) {
      Swal.fire("Berhasil!", "Data karyawan berhasil dihapus.", "success");
      await loadKaryawanData();
    } else {
      Swal.fire("Gagal!", resultData.message || "Data tidak ditemukan.", "error");
    }
  } catch (err) {
    console.error(err);
    Swal.fire("Error!", "Server error: " + err.message, "error");
  }
};

function setupKaryawanFormHandler() {
  const karyawanForm = document.getElementById("karyawanForm");
  if (!karyawanForm) {
    console.error("❌ Form karyawanForm tidak ditemukan!");
    return;
  }

  const newKaryawanForm = karyawanForm.cloneNode(true);
  karyawanForm.parentNode.replaceChild(newKaryawanForm, karyawanForm);

  newKaryawanForm.onsubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    console.log("📝 Form karyawan disubmit");

    const id = document.getElementById("karyawan_id").value;
    let password = document.getElementById("karyawan_password")?.value.trim();
    let noHp = document.getElementById("karyawan_no_hp")?.value.trim();
    let tanggalLahir = document.getElementById("karyawan_tanggal_lahir")?.value;
    let awalMasuk = document.getElementById("karyawan_awal_masuk")?.value || "";

    // AMBIL NILAI LOKASI STORE ID dari dropdown
    const lokasiStoreSelect = document.getElementById("karyawan_lokasi_store_id");
    const lokasiStoreId = lokasiStoreSelect ? lokasiStoreSelect.value : "";

    console.log("Lokasi Store ID selected:", lokasiStoreId);

    if (!id && (!password || password === "")) {
      SwalFireWithModal("Error", "Password wajib diisi untuk karyawan baru", "error");
      return;
    }
    if (password && password !== "" && password.length < 6) {
      SwalFireWithModal("Error", "Password minimal 6 karakter", "error");
      return;
    }

    // VALIDASI LOKASI STORE
    if (!lokasiStoreId) {
      SwalFireWithModal("Error", "Lokasi Store / Gerai wajib dipilih", "error");
      return;
    }

    if (noHp) {
      noHp = formatPhoneNumberForDatabase(noHp);
    }

    const formData = new FormData();
    formData.append("no_induk", document.getElementById("karyawan_no_induk")?.value.trim() || "");
    formData.append("nama_lengkap", document.getElementById("karyawan_nama_lengkap")?.value.trim() || "");
    formData.append("nik", document.getElementById("karyawan_nik")?.value.trim() || "");
    formData.append("tanggal_lahir", tanggalLahir || "");
    formData.append("alamat_domisili", document.getElementById("karyawan_alamat_domisili")?.value || "");
    formData.append("no_hp", noHp || "");
    formData.append("email", document.getElementById("karyawan_email")?.value.trim() || "");
    formData.append("awal_masuk", awalMasuk || "");
    formData.append("jabatan", document.getElementById("karyawan_jabatan")?.value.trim() || "");
    formData.append("lokasi_store_id", lokasiStoreId);

    const fotoDiriFile = document.getElementById("karyawan_foto_diri")?.files[0];
    const fotoKtpFile = document.getElementById("karyawan_foto_ktp")?.files[0];

    if (fotoDiriFile) {
      formData.append("foto_diri_file", fotoDiriFile);
    }
    if (fotoKtpFile) {
      formData.append("foto_ktp_file", fotoKtpFile);
    }

    if (password && password !== "") {
      formData.append("password", password);
    }

    // Validasi field wajib
    if (!formData.get("no_induk")) {
      SwalFireWithModal("Error", "No Induk wajib diisi", "error");
      return;
    }
    if (!formData.get("nama_lengkap")) {
      SwalFireWithModal("Error", "Nama Lengkap wajib diisi", "error");
      return;
    }
    if (!formData.get("nik")) {
      SwalFireWithModal("Error", "NIK wajib diisi", "error");
      return;
    }
    if (!formData.get("tanggal_lahir")) {
      SwalFireWithModal("Error", "Tanggal Lahir wajib diisi", "error");
      return;
    }
    if (!formData.get("no_hp")) {
      SwalFireWithModal("Error", "No HP wajib diisi", "error");
      return;
    }
    if (!formData.get("email")) {
      SwalFireWithModal("Error", "Email wajib diisi", "error");
      return;
    }
    if (!formData.get("jabatan")) {
      SwalFireWithModal("Error", "Jabatan wajib diisi", "error");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.get("email"))) {
      SwalFireWithModal("Error", "Format email tidak valid", "error");
      return;
    }

    const nik = formData.get("nik");
    if (nik.length !== 16 || !/^\d+$/.test(nik)) {
      SwalFireWithModal("Error", "NIK harus 16 digit angka", "error");
      return;
    }

    const noHpFinal = formData.get("no_hp");
    if (!noHpFinal.startsWith("62") || noHpFinal.length < 10) {
      SwalFireWithModal("Error", "Nomor HP tidak valid. Pastikan menggunakan format yang benar", "error");
      return;
    }

    const method = id ? "PUT" : "POST";
    const url = id ? `/data-karyawan/${id}?company=${currentKaryawanCompany}` : `/data-karyawan?company=${currentKaryawanCompany}`;

    console.log(`Sending ${method} request to ${url}`);
    console.log("FormData entries:");
    for (let pair of formData.entries()) {
      console.log(pair[0] + ": " + pair[1]);
    }

    try {
      const res = await fetch(url, {
        method,
        body: formData,
      });

      const result = await res.json();
      console.log("Response:", result);

      if (result.success) {
        const modal = document.getElementById("karyawanModal");
        if (modal) modal.style.display = "none";

        newKaryawanForm.reset();
        document.getElementById("karyawan_id").value = "";
        document.getElementById("preview_foto_diri").innerHTML = "";
        document.getElementById("preview_foto_ktp").innerHTML = "";

        await loadKaryawanData();

        Swal.fire("Berhasil!", id ? "Data karyawan berhasil diperbarui." : "Data karyawan berhasil ditambahkan.", "success");
      } else {
        SwalFireWithModal("Gagal", result.message || "Tidak dapat menyimpan data.", "error");
      }
    } catch (err) {
      console.error("Submit error:", err);
      SwalFireWithModal("Error", `Terjadi kesalahan: ${err.message}`, "error");
    }
  };

  console.log("✅ Form handler registered");
}

function setupKaryawanModalButtons() {
  const closeBtn = document.getElementById("closeKaryawanModal");
  if (closeBtn) {
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const modal = document.getElementById("karyawanModal");
      if (modal) modal.style.display = "none";
    };
  }

  const cancelBtn = document.getElementById("cancelKaryawanBtn");
  if (cancelBtn) {
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const modal = document.getElementById("karyawanModal");
      if (modal) modal.style.display = "none";
    };
  }
}

function setupKaryawanEventHandlers() {
  const addBtn = document.getElementById("addKaryawanBtn");
  if (addBtn) {
    const newAddBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
    newAddBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("🖱️ Add Karyawan button clicked");
      openKaryawanModal();
    };
  }

  const searchInput = document.getElementById("searchKaryawanInput");
  if (searchInput) {
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);
    newSearchInput.oninput = () => {
      currentKaryawanPage = 1;
      renderKaryawanTable();
    };
  }

  const prevPage = document.getElementById("prevKaryawanPage");
  if (prevPage) {
    const newPrevPage = prevPage.cloneNode(true);
    prevPage.parentNode.replaceChild(newPrevPage, prevPage);
    newPrevPage.onclick = () => {
      if (currentKaryawanPage > 1) {
        currentKaryawanPage--;
        renderKaryawanTable();
      }
    };
  }

  const nextPage = document.getElementById("nextKaryawanPage");
  if (nextPage) {
    const newNextPage = nextPage.cloneNode(true);
    nextPage.parentNode.replaceChild(newNextPage, nextPage);
    newNextPage.onclick = () => {
      const query = document.getElementById("searchKaryawanInput")?.value.toLowerCase() || "";
      const filtered = karyawanData.filter((d) => d.nama_lengkap?.toLowerCase().includes(query) || d.no_induk?.toLowerCase().includes(query));
      if (currentKaryawanPage * pageSizeKaryawan < filtered.length) {
        currentKaryawanPage++;
        renderKaryawanTable();
      }
    };
  }

  // ============================================
  // EXPORT BUTTON
  // ============================================
  const exportBtn = document.getElementById("exportKaryawanBtn");
  if (exportBtn) {
    const newExportBtn = exportBtn.cloneNode(true);
    exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
    newExportBtn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("📥 Export button clicked for company:", currentKaryawanCompany);

      try {
        Swal.fire({
          title: "Sedang mengexport...",
          text: "Mohon tunggu sebentar",
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        const response = await fetch(`/data-karyawan/export?company=${currentKaryawanCompany}`);

        Swal.close();

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "Gagal export data");
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;

        const contentDisposition = response.headers.get("Content-Disposition");
        let filename = currentKaryawanCompany === "hisana" ? "data_karyawan_hisana.zip" : "data_karyawan_enakko.zip";

        if (contentDisposition) {
          const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (match && match[1]) {
            filename = match[1].replace(/['"]/g, "");
          }
        }

        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        Swal.fire("Berhasil!", "Data berhasil diexport dengan foto", "success");
      } catch (err) {
        console.error("Export error:", err);
        Swal.fire("Error", err.message || "Gagal export data", "error");
      }
    };
  }

  // ============================================
  // DOWNLOAD TEMPLATE BUTTON
  // ============================================
  const downloadTemplateBtn = document.getElementById("downloadTemplateKaryawanBtn");
  if (downloadTemplateBtn) {
    const newDownloadTemplateBtn = downloadTemplateBtn.cloneNode(true);
    downloadTemplateBtn.parentNode.replaceChild(newDownloadTemplateBtn, downloadTemplateBtn);
    newDownloadTemplateBtn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("📥 Download template button clicked for company:", currentKaryawanCompany);

      try {
        Swal.fire({
          title: "Mengunduh template...",
          text: "Mohon tunggu sebentar",
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        const response = await fetch(`/data-karyawan/template?company=${currentKaryawanCompany}`);

        Swal.close();

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "Gagal download template");
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;

        const filename = currentKaryawanCompany === "hisana" ? "template_karyawan_hisana.xlsx" : "template_karyawan_enakko.xlsx";

        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        Swal.fire({
          title: "Berhasil!",
          text: "Template berhasil didownload",
          icon: "success",
          timer: 2000,
          showConfirmButton: false,
        });
      } catch (err) {
        console.error("Download template error:", err);
        Swal.fire("Error", err.message || "Gagal download template", "error");
      }
    };
  }

  // ============================================
  // IMPORT BUTTON
  // ============================================
  const importBtn = document.getElementById("importKaryawanBtn");
  const importForm = document.getElementById("importKaryawanForm");
  if (importBtn && importForm) {
    const newImportBtn = importBtn.cloneNode(true);
    importBtn.parentNode.replaceChild(newImportBtn, importBtn);
    newImportBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("📂 Import button clicked");
      if (importForm.style.display === "none" || importForm.style.display === "") {
        importForm.style.display = "block";
      } else {
        importForm.style.display = "none";
      }
    };
  }

  // ============================================
  // CANCEL IMPORT
  // ============================================
  const cancelImport = document.getElementById("cancelImportKaryawan");
  if (cancelImport && importForm) {
    const newCancelImport = cancelImport.cloneNode(true);
    cancelImport.parentNode.replaceChild(newCancelImport, cancelImport);
    newCancelImport.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      importForm.style.display = "none";
      const uploadForm = document.getElementById("uploadFormKaryawan");
      if (uploadForm) uploadForm.reset();
      const fileNameSpan = document.getElementById("fileNameKaryawan");
      if (fileNameSpan) {
        fileNameSpan.textContent = "Tidak ada file dipilih";
        fileNameSpan.style.color = "#64748b";
      }
      const statusEl = document.getElementById("uploadStatusKaryawan");
      if (statusEl) statusEl.innerText = "";
    };
  }

  // ============================================
  // FILE INPUT - Show filename
  // ============================================
  const fileInput = document.getElementById("fileInputKaryawan");
  const fileName = document.getElementById("fileNameKaryawan");
  if (fileInput && fileName) {
    const newFileInput = fileInput.cloneNode(true);
    fileInput.parentNode.replaceChild(newFileInput, fileInput);
    newFileInput.onchange = (e) => {
      console.log("📄 File selected:", e.target.files[0]?.name);
      if (e.target.files.length > 0) {
        fileName.textContent = e.target.files[0].name;
        fileName.style.color = "#2563eb";
      } else {
        fileName.textContent = "Tidak ada file dipilih";
        fileName.style.color = "#64748b";
      }
    };
  }

  // ============================================
  // UPLOAD FORM SUBMIT
  // ============================================
  const uploadForm = document.getElementById("uploadFormKaryawan");
  if (uploadForm) {
    const newUploadForm = uploadForm.cloneNode(true);
    uploadForm.parentNode.replaceChild(newUploadForm, uploadForm);

    const fileInputField = document.getElementById("fileInputKaryawan");
    if (fileInputField) {
      const newFileInput = fileInputField.cloneNode(true);
      fileInputField.parentNode.replaceChild(newFileInput, fileInputField);

      newFileInput.onchange = (e) => {
        console.log("📄 File selected:", e.target.files[0]?.name);
        const fileNameSpan = document.getElementById("fileNameKaryawan");
        if (fileNameSpan) {
          if (e.target.files.length > 0) {
            fileNameSpan.textContent = e.target.files[0].name;
            fileNameSpan.style.color = "#2563eb";
          } else {
            fileNameSpan.textContent = "Tidak ada file dipilih";
            fileNameSpan.style.color = "#64748b";
          }
        }
      };
    }

    newUploadForm.onsubmit = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      console.log("📤 Upload form submitted for company:", currentKaryawanCompany);
      const fileInput_field = document.getElementById("fileInputKaryawan");

      if (!fileInput_field.files || fileInput_field.files.length === 0) {
        Swal.fire("Error", "Silakan pilih file terlebih dahulu", "error");
        return;
      }

      const fileName = fileInput_field.files[0].name;
      const fileExt = fileName.split(".").pop().toLowerCase();
      if (!["xlsx", "xls"].includes(fileExt)) {
        Swal.fire("Error", "File harus berupa Excel (.xlsx atau .xls)", "error");
        return;
      }

      const formData = new FormData();
      formData.append("file", fileInput_field.files[0]);

      const statusEl = document.getElementById("uploadStatusKaryawan");
      if (statusEl) {
        statusEl.innerText = "Sedang memproses...";
        statusEl.style.color = "#2563eb";
      }

      Swal.fire({
        title: "Sedang mengimport...",
        text: "Mohon tunggu sebentar",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      try {
        const res = await fetch(`/data-karyawan/import?company=${currentKaryawanCompany}`, {
          method: "POST",
          body: formData,
        });

        const result = await res.json();
        console.log("Import result:", result);
        Swal.close();

        if (result.success) {
          let messageHtml = `
          <div style="text-align: left;">
            <div style="margin-top: 15px;">
              <div style="display: flex; justify-content: space-around; margin-bottom: 15px;">
                <div style="text-align: center;">
                  <div style="font-size: 0.8rem; color: #666;">BERHASIL</div>
                  <div style="font-size: 1.5rem; font-weight: bold; color: #16a34a;">${result.successCount || 0}</div>
                </div>
                <div style="text-align: center;">
                  <div style="font-size: 0.8rem; color: #666;">DILEWATI</div>
                  <div style="font-size: 1.5rem; font-weight: bold; color: #f59e0b;">${result.skippedCount || 0}</div>
                </div>
                <div style="text-align: center;">
                  <div style="font-size: 0.8rem; color: #666;">GAGAL</div>
                  <div style="font-size: 1.5rem; font-weight: bold; color: #dc2626;">${result.errorCount || 0}</div>
                </div>
              </div>
            </div>
        `;

          if (result.errors && result.errors.length > 0) {
            messageHtml += `
            <div style="margin-top: 15px; max-height: 200px; overflow-y: auto; background: #fef2e8; border-radius: 8px; padding: 10px;">
              <p style="font-weight: 600; margin-bottom: 8px;">Detail Error:</p>
              <ul style="margin: 0; padding-left: 20px; font-size: 0.8rem; color: #dc2626;">
                ${result.errors
                  .slice(0, 15)
                  .map((err) => `<li>${escapeHtml(err)}</li>`)
                  .join("")}
                ${result.errors.length > 15 ? `<li>... dan ${result.errors.length - 15} error lainnya</li>` : ""}
              </ul>
            </div>
          `;
          }

          messageHtml += `</div>`;

          Swal.fire({
            title: result.errorCount > 0 ? "Import Selesai dengan Peringatan" : "Import Berhasil!",
            html: messageHtml,
            icon: result.errorCount > 0 ? "warning" : "success",
            confirmButtonText: "OK",
            width: "500px",
          });

          await loadKaryawanData();

          newUploadForm.reset();
          const fileNameSpan = document.getElementById("fileNameKaryawan");
          if (fileNameSpan) {
            fileNameSpan.textContent = "Tidak ada file dipilih";
            fileNameSpan.style.color = "#64748b";
          }

          const importFormDiv = document.getElementById("importKaryawanForm");
          if (importFormDiv) importFormDiv.style.display = "none";
        } else {
          Swal.fire("Import Gagal", result.message || "Terjadi kesalahan saat import", "error");
        }
      } catch (err) {
        console.error("Import error:", err);
        Swal.close();
        Swal.fire("Import Gagal", "Terjadi kesalahan saat upload: " + err.message, "error");
      } finally {
        if (statusEl) {
          statusEl.innerText = "";
        }
      }
    };
  }
}

// =============================
// SHOW DATA KARYAWAN SECTION
// =============================
function showDataKaryawanSection(company) {
  console.log(`🟢 showDataKaryawanSection dipanggil untuk company: ${company}`);

  currentKaryawanCompany = company;

  const companyNameSpan = document.getElementById("currentCompanyName");
  if (companyNameSpan) {
    companyNameSpan.textContent = company === "hisana" ? "Hisana" : "Enakko";
  }

  currentKaryawanPage = 1;

  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));

  const targetSection = document.getElementById("sectionDataKaryawan");
  if (targetSection) {
    targetSection.classList.add("active");
    console.log("✅ Section Data Karyawan activated");
  } else {
    console.error("❌ Section Data Karyawan tidak ditemukan!");
    return;
  }

  if (company === "hisana") {
    const hisanaToggle = document.getElementById("dataMasterHisanaToggle");
    const hisanaMenu = document.getElementById("dataMasterHisanaMenu");
    if (hisanaToggle && hisanaMenu) {
      hisanaToggle.classList.add("active");
      hisanaMenu.classList.add("show");
    }

    const enakkoToggle = document.getElementById("dataMasterEnakkoToggle");
    const enakkoMenu = document.getElementById("dataMasterEnakkoMenu");
    if (enakkoToggle && enakkoMenu) {
      enakkoToggle.classList.remove("active");
      enakkoMenu.classList.remove("show");
    }
  } else {
    const enakkoToggle = document.getElementById("dataMasterEnakkoToggle");
    const enakkoMenu = document.getElementById("dataMasterEnakkoMenu");
    if (enakkoToggle && enakkoMenu) {
      enakkoToggle.classList.add("active");
      enakkoMenu.classList.add("show");
    }

    const hisanaToggle = document.getElementById("dataMasterHisanaToggle");
    const hisanaMenu = document.getElementById("dataMasterHisanaMenu");
    if (hisanaToggle && hisanaMenu) {
      hisanaToggle.classList.remove("active");
      hisanaMenu.classList.remove("show");
    }
  }

  document.querySelectorAll(".nav-item").forEach((btn) => btn.classList.remove("active"));

  const dataKaryawanBtn = company === "hisana" ? document.getElementById("dataKaryawanHisana") : document.getElementById("dataKaryawanEnakko");
  if (dataKaryawanBtn) {
    dataKaryawanBtn.classList.add("active");
  }

  const dataMasterToggle = company === "hisana" ? document.getElementById("dataMasterHisanaToggle") : document.getElementById("dataMasterEnakkoToggle");
  if (dataMasterToggle) {
    dataMasterToggle.classList.add("active");
  }

  loadKaryawanData();

  const searchInput = document.getElementById("searchKaryawanInput");
  if (searchInput) {
    searchInput.value = "";
  }
}

// =============================
// SETUP DATA KARYAWAN HANDLERS
// =============================
function setupDataKaryawanHandlers() {
  console.log("🔵 setupDataKaryawanHandlers dipanggil");

  const dataKaryawanHisana = document.getElementById("dataKaryawanHisana");
  if (dataKaryawanHisana) {
    const newDataKaryawanHisana = dataKaryawanHisana.cloneNode(true);
    dataKaryawanHisana.parentNode.replaceChild(newDataKaryawanHisana, dataKaryawanHisana);

    newDataKaryawanHisana.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("🖱️ Data Karyawan Hisana clicked");
      showDataKaryawanSection("hisana");

      document.querySelectorAll(".dropdown-item").forEach((item) => item.classList.remove("active"));
      newDataKaryawanHisana.classList.add("active");

      const hisanaToggle = document.getElementById("dataMasterHisanaToggle");
      if (hisanaToggle) {
        hisanaToggle.classList.add("active");
      }

      const hisanaMenu = document.getElementById("dataMasterHisanaMenu");
      if (hisanaMenu) {
        hisanaMenu.classList.add("show");
      }
    };
    console.log("✅ Data Karyawan Hisana button registered");
  } else {
    console.warn("⚠️ dataKaryawanHisana not found");
  }

  const dataKaryawanEnakko = document.getElementById("dataKaryawanEnakko");
  if (dataKaryawanEnakko) {
    const newDataKaryawanEnakko = dataKaryawanEnakko.cloneNode(true);
    dataKaryawanEnakko.parentNode.replaceChild(newDataKaryawanEnakko, dataKaryawanEnakko);

    newDataKaryawanEnakko.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("🖱️ Data Karyawan Enakko clicked");
      showDataKaryawanSection("enakko");

      document.querySelectorAll(".dropdown-item").forEach((item) => item.classList.remove("active"));
      newDataKaryawanEnakko.classList.add("active");

      const enakkoToggle = document.getElementById("dataMasterEnakkoToggle");
      if (enakkoToggle) {
        enakkoToggle.classList.add("active");
      }

      const enakkoMenu = document.getElementById("dataMasterEnakkoMenu");
      if (enakkoMenu) {
        enakkoMenu.classList.add("show");
      }
    };
    console.log("✅ Data Karyawan Enakko button registered");
  } else {
    console.warn("⚠️ dataKaryawanEnakko not found");
  }
}

// =============================
// LOKASI STORE FUNCTIONS - WITH LEAFLET (NO API KEY) - FULLY FIXED
// =============================
let lokasiData = [];
let currentLokasiPage = 1;
const pageSizeLokasi = 10;
let currentLokasiCompany = "hisana";
let mainMap = null;
let modalMap = null;
let mainMarkers = [];
let selectedMarker = null;
let geocoder = null;

// Initialize Leaflet Map (No API Key Required!)
function initMainMap() {
  const mapContainer = document.getElementById("mapContainer");
  if (!mapContainer) {
    console.warn("Map container not found");
    return;
  }

  // Clear container
  mapContainer.innerHTML = "";

  // Center: Jakarta
  const defaultCenter = [-6.2088, 106.8456];

  try {
    // Initialize Leaflet map
    mainMap = L.map(mapContainer).setView(defaultCenter, 11);

    // Satelite layer with SHORT attribution
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Esri", // Very short attribution
      maxZoom: 19,
      minZoom: 3,
    }).addTo(mainMap);

    // Labels overlay with short attribution
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", {
      attribution: "OSM",
      subdomains: "abcd",
      maxZoom: 19,
      minZoom: 3,
    }).addTo(mainMap);

    console.log("✅ Main map initialized with Satellite view");
    updateMapMarkers();
  } catch (err) {
    console.error("Error initializing main map:", err);
    mapContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 400px; background: #fef2e8; border-radius: 12px; padding: 20px;">
        <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 10px;"></i>
        <p style="color: #64748b;">Gagal memuat peta: ${err.message}</p>
        <button class="btn-primary" onclick="retryLoadMap()" style="margin-top: 10px;">
          <i class="fas fa-sync-alt"></i> Coba Lagi
        </button>
      </div>
    `;
  }
}

// Update map markers from lokasiData
function updateMapMarkers() {
  if (!mainMap) {
    console.warn("Main map not ready for markers");
    return;
  }

  // Clear existing markers
  if (mainMarkers.length > 0) {
    mainMarkers.forEach((marker) => {
      if (marker && marker.remove) marker.remove();
    });
    mainMarkers = [];
  }

  if (!lokasiData || lokasiData.length === 0) {
    console.log("No location data to display on map");
    return;
  }

  const bounds = L.latLngBounds();
  let validMarkers = 0;

  // Custom icon with better visibility on satellite
  const storeIcon = L.icon({
    iconUrl: "https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
    className: "custom-marker",
  });

  // Add new markers
  lokasiData.forEach((lokasi) => {
    const lat = parseFloat(lokasi.latitude);
    const lng = parseFloat(lokasi.longitude);

    if (isNaN(lat) || isNaN(lng)) {
      console.warn(`Invalid coordinates for ${lokasi.nama_store}: ${lokasi.latitude}, ${lokasi.longitude}`);
      return;
    }

    const position = [lat, lng];
    validMarkers++;

    try {
      // Create marker with enhanced popup
      const marker = L.marker(position, { icon: storeIcon })
        .bindPopup(
          `
          <div style="padding: 8px; min-width: 200px;">
            <h4 style="margin: 0 0 8px 0; color: #1e293b; font-size: 14px;">🏪 ${escapeHtml(lokasi.nama_store)}</h4>
            <p style="margin: 0 0 5px 0; font-size: 11px; color: #64748b;">
              <i class="fas fa-location-dot"></i> ${escapeHtml(lokasi.alamat.substring(0, 100))}${escapeHtml(lokasi.alamat.length > 100 ? "..." : "")}
            </p>
            <hr style="margin: 5px 0;">
            <p style="margin: 0; font-size: 10px; color: #94a3b8;">
              📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}
            </p>
            <button onclick="centerMapOnLocation(${lat}, ${lng}, '${escapeHtml(lokasi.nama_store)}')" 
                    style="margin-top: 8px; padding: 4px 8px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; width: 100%;">
              <i class="fas fa-crosshairs"></i> Pusatkan Peta
            </button>
          </div>
        `,
          { maxWidth: 300 },
        )
        .addTo(mainMap);

      mainMarkers.push(marker);
      bounds.extend(position);
    } catch (err) {
      console.error(`Error creating marker for ${lokasi.nama_store}:`, err);
    }
  });

  console.log(`✅ Added ${validMarkers} markers to satellite map`);

  // Fit bounds to show all markers
  if (mainMarkers.length > 0 && validMarkers > 0) {
    mainMap.fitBounds(bounds);
    if (mainMarkers.length === 1) {
      mainMap.setZoom(16);
    }
  }
}

// Initialize Modal Map for Add/Edit
function initModalMap(lat, lng) {
  console.log(`🗺️ Initializing modal satellite map at: ${lat}, ${lng}`);

  const mapContainer = document.getElementById("modalMapContainer");
  if (!mapContainer) {
    console.error("❌ Modal map container not found!");
    return;
  }

  mapContainer.innerHTML = '<div class="map-loading"><i class="fas fa-spinner fa-spin"></i> Memuat peta satelit...</div>';

  const defaultCenter = [lat, lng];

  try {
    if (typeof L === "undefined") {
      console.error("❌ Leaflet not loaded!");
      mapContainer.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #fef2e8; border-radius: 12px; padding: 20px;">
          <p style="color: #64748b;">Leaflet library not loaded. Please refresh the page.</p>
        </div>
      `;
      return;
    }

    mapContainer.innerHTML = "";

    if (modalMap) {
      modalMap.remove();
      modalMap = null;
    }

    modalMap = L.map(mapContainer).setView(defaultCenter, 15);

    // Satelite layer with SHORT attribution
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Esri",
      maxZoom: 19,
    }).addTo(modalMap);

    // Labels overlay with short attribution
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", {
      attribution: "OSM",
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(modalMap);

    // Add draggable marker
    const redIcon = L.icon({
      iconUrl: "https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
      className: "custom-marker",
    });

    selectedMarker = L.marker(defaultCenter, { draggable: true, icon: redIcon }).bindPopup("<strong>📍 Drag untuk memindahkan lokasi</strong>").addTo(modalMap);

    selectedMarker.openPopup();

    // Update form when marker is dragged
    selectedMarker.on("dragend", function (e) {
      const position = e.target.getLatLng();
      const newLat = position.lat;
      const newLng = position.lng;

      document.getElementById("lokasi_lat").value = newLat.toFixed(6);
      document.getElementById("lokasi_lng").value = newLng.toFixed(6);

      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${newLat}&lon=${newLng}&accept-language=id`)
        .then((response) => response.json())
        .then((data) => {
          if (data && data.display_name) {
            document.getElementById("lokasi_alamat").value = data.display_name;
          }
        })
        .catch((err) => console.error("Reverse geocode error:", err));
    });

    modalMap.on("click", function (e) {
      const newLat = e.latlng.lat;
      const newLng = e.latlng.lng;

      selectedMarker.setLatLng([newLat, newLng]);
      document.getElementById("lokasi_lat").value = newLat.toFixed(6);
      document.getElementById("lokasi_lng").value = newLng.toFixed(6);

      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${newLat}&lon=${newLng}&accept-language=id`)
        .then((response) => response.json())
        .then((data) => {
          if (data && data.display_name) {
            document.getElementById("lokasi_alamat").value = data.display_name;
          }
        })
        .catch((err) => console.error("Reverse geocode error:", err));
    });

    setTimeout(() => {
      if (modalMap) {
        modalMap.invalidateSize();
      }
    }, 100);

    console.log("✅ Modal map initialized with Satellite view");
  } catch (err) {
    console.error("❌ Error initializing modal map:", err);
    mapContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 300px; background: #fef2e8; border-radius: 12px; padding: 20px;">
        <i class="fas fa-exclamation-triangle" style="font-size: 32px; color: #ef4444; margin-bottom: 10px;"></i>
        <p style="color: #64748b; font-size: 12px;">Gagal memuat peta satelit: ${err.message}</p>
        <button class="btn-primary" onclick="retryModalMap()" style="margin-top: 10px; padding: 5px 10px; font-size: 12px;">
          <i class="fas fa-sync-alt"></i> Coba Lagi
        </button>
      </div>
    `;
  }
}

window.retryModalMap = function () {
  console.log("🔄 Retrying modal map...");
  const latInput = document.getElementById("lokasi_lat");
  const lngInput = document.getElementById("lokasi_lng");

  let lat = -6.2088;
  let lng = 106.8456;

  if (latInput && latInput.value) {
    lat = parseFloat(latInput.value);
  }
  if (lngInput && lngInput.value) {
    lng = parseFloat(lngInput.value);
  }

  if (isNaN(lat)) lat = -6.2088;
  if (isNaN(lng)) lng = 106.8456;

  initModalMap(lat, lng);
};

// Setup Location Search using Nominatim API
function setupLocationSearch() {
  const searchInput = document.getElementById("locationSearchInput");
  if (!searchInput) return;

  // Remove existing listeners
  const newSearchInput = searchInput.cloneNode(true);
  searchInput.parentNode.replaceChild(newSearchInput, searchInput);

  let debounceTimer;

  newSearchInput.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    const query = e.target.value;

    if (query.length < 3) {
      const dropdown = document.getElementById("locationSearchDropdown");
      if (dropdown) dropdown.style.display = "none";
      return;
    }

    debounceTimer = setTimeout(() => {
      // Use Nominatim API for geocoding (free, no API key)
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1&accept-language=id`)
        .then((response) => response.json())
        .then((data) => {
          const dropdown = document.getElementById("locationSearchDropdown");
          if (!dropdown) return;

          if (data && data.length > 0) {
            dropdown.innerHTML = data
              .map(
                (item) => `
              <div class="location-dropdown-item" data-lat="${item.lat}" data-lon="${item.lon}">
                <div class="location-dropdown-name">${escapeHtml(item.display_name.split(",")[0])}</div>
                <div class="location-dropdown-address">${escapeHtml(item.display_name.substring(0, 100))}...</div>
              </div>
            `,
              )
              .join("");
            dropdown.style.display = "block";

            // Add click handlers
            document.querySelectorAll(".location-dropdown-item").forEach((item) => {
              item.addEventListener("click", () => {
                const lat = parseFloat(item.dataset.lat);
                const lon = parseFloat(item.dataset.lon);
                const name = item.querySelector(".location-dropdown-name")?.innerText || "";
                const address = item.querySelector(".location-dropdown-address")?.innerText || "";

                // Update form
                document.getElementById("lokasi_nama").value = name;
                document.getElementById("lokasi_alamat").value = address;
                document.getElementById("lokasi_lat").value = lat.toFixed(6);
                document.getElementById("lokasi_lng").value = lon.toFixed(6);

                // Update map
                if (modalMap && selectedMarker) {
                  modalMap.setView([lat, lon], 17);
                  selectedMarker.setLatLng([lat, lon]);
                }

                dropdown.style.display = "none";
                newSearchInput.value = name;
              });
            });
          } else {
            dropdown.style.display = "none";
          }
        })
        .catch((err) => {
          console.error("Geocoding error:", err);
          const dropdown = document.getElementById("locationSearchDropdown");
          if (dropdown) dropdown.style.display = "none";
        });
    }, 500);
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    const dropdown = document.getElementById("locationSearchDropdown");
    if (dropdown && !newSearchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });
}

// Center map on specific location
window.centerMapOnLocation = (lat, lng, name) => {
  if (!mainMap) {
    console.warn("Main map not ready");
    Swal.fire("Info", "Peta sedang dimuat, silakan tunggu sebentar", "info");
    setTimeout(() => {
      if (mainMap) {
        centerMapOnLocation(lat, lng, name);
      }
    }, 1000);
    return;
  }

  const position = [parseFloat(lat), parseFloat(lng)];

  if (isNaN(position[0]) || isNaN(position[1])) {
    Swal.fire("Error", "Koordinat tidak valid", "error");
    return;
  }

  mainMap.setView(position, 18);

  // Find and bounce the marker
  const marker = mainMarkers.find((m) => {
    const markerPos = m.getLatLng();
    return Math.abs(markerPos.lat - position[0]) < 0.0001 && Math.abs(markerPos.lng - position[1]) < 0.0001;
  });

  if (marker) {
    marker.openPopup();
    // Simple bounce effect
    const originalIcon = marker.options.icon;
    marker.setIcon(
      L.icon({
        iconUrl: "https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      }),
    );
    setTimeout(() => {
      marker.setIcon(originalIcon);
    }, 1000);
  }
};

// Retry load map function
window.retryLoadMap = function () {
  console.log("🔄 Retrying main map...");
  const mapContainer = document.getElementById("mapContainer");
  if (mapContainer) {
    mapContainer.innerHTML = '<div class="map-loading"><i class="fas fa-spinner fa-spin"></i> Memuat peta...</div>';
  }
  initMainMap();
};

// Load Lokasi Data
async function loadLokasiData() {
  try {
    console.log(`📡 Loading lokasi data for company: ${currentLokasiCompany}`);

    const tbody = document.querySelector("#tableLokasi tbody");
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 40px;">
            <i class="fas fa-spinner fa-spin" style="font-size: 32px; color: #2563eb;"></i>
            <p style="margin-top: 10px; color: #64748b;">Memuat data lokasi...</p>
          </td>
        </tr>
      `;
    }

    const res = await fetch(`/api/lokasi-store?company=${currentLokasiCompany}`);

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    lokasiData = await res.json();
    console.log(`✅ Loaded ${lokasiData.length} lokasi records`);

    renderLokasiTable();
    updateMapMarkers();
  } catch (err) {
    console.error("❌ Load lokasi data error:", err);
    const tbody = document.querySelector("#tableLokasi tbody");
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 40px;">
            <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 10px; display: block;"></i>
            <p style="color: #64748b;">Gagal memuat data lokasi: ${err.message}</p>
            <button class="btn-primary" onclick="loadLokasiData()" style="margin-top: 10px;">
              <i class="fas fa-sync-alt"></i> Coba Lagi
            </button>
          </td>
        </tr>
      `;
    }
  }
}

// Render Lokasi Table
function renderLokasiTable() {
  const tbody = document.querySelector("#tableLokasi tbody");
  if (!tbody) return;

  const query = document.getElementById("searchLokasiInput")?.value.toLowerCase() || "";
  const filtered = lokasiData.filter((d) => d.nama_store?.toLowerCase().includes(query) || d.alamat?.toLowerCase().includes(query));

  const totalPages = Math.ceil(filtered.length / pageSizeLokasi);
  if (currentLokasiPage > totalPages && totalPages > 0) currentLokasiPage = totalPages;
  if (currentLokasiPage < 1) currentLokasiPage = 1;

  const start = (currentLokasiPage - 1) * pageSizeLokasi;
  const pageData = filtered.slice(start, start + pageSizeLokasi);

  if (pageData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 40px;">
          <i class="fas fa-map-marker-alt" style="font-size: 48px; color: #cbd5e1; margin-bottom: 10px; display: block;"></i>
          <p style="color: #64748b;">${filtered.length === 0 && lokasiData.length === 0 ? "Belum ada data lokasi store" : "Tidak ada data yang sesuai dengan pencarian"}</p>
          ${
            lokasiData.length === 0
              ? `
            <button class="btn-primary" onclick="openLokasiModal()" style="margin-top: 10px;">
              <i class="fas fa-plus"></i> Tambah Lokasi Pertama
            </button>
          `
              : ""
          }
        </td>
      </tr>
    `;
    const lokasiPageInfo = document.getElementById("lokasiPageInfo");
    if (lokasiPageInfo) lokasiPageInfo.innerText = `Halaman 0 dari 0`;
    return;
  }

  tbody.innerHTML = "";
  pageData.forEach((item, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="text-center" style="width: 50px;">${start + i + 1}</td>
      <td style="font-weight: 600;">${escapeHtml(item.nama_store)}</td>
      <td style="max-width: 350px; word-break: break-word; white-space: normal;">${escapeHtml(item.alamat)}</td>
      <td class="text-center">${item.latitude}</td>
      <td class="text-center">${item.longitude}</td>
      <td class="text-center" style="white-space: nowrap;">
        <button class="btn-primary" style="padding: 5px 10px; margin-right: 5px;" onclick='openLokasiModalById(${item.id})' title="Edit">
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn-danger" style="padding: 5px 10px; margin-right: 5px;" onclick='deleteLokasi(${item.id})' title="Hapus">
          <i class="fas fa-trash"></i>
        </button>
        <button class="btn-outline" style="padding: 5px 10px;" onclick='centerMapOnLocation(${item.latitude}, ${item.longitude}, "${escapeHtml(item.nama_store)}")' title="Lokasi di Peta">
          <i class="fas fa-crosshairs"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const lokasiPageInfo = document.getElementById("lokasiPageInfo");
  if (lokasiPageInfo) {
    lokasiPageInfo.innerText = `Halaman ${currentLokasiPage} dari ${totalPages || 1}`;
  }
}

// Open Lokasi Modal
function openLokasiModal(item = null) {
  console.log("🔵 Opening lokasi modal, item:", item);

  const modal = document.getElementById("lokasiModal");
  if (!modal) {
    console.error("❌ Lokasi modal not found in DOM!");
    Swal.fire("Error", "Modal tidak ditemukan", "error");
    return;
  }

  const form = document.getElementById("lokasiForm");
  if (!form) {
    console.error("❌ Lokasi form not found!");
    Swal.fire("Error", "Form tidak ditemukan", "error");
    return;
  }

  // Reset form
  form.reset();
  document.getElementById("lokasi_id").value = "";
  document.getElementById("locationSearchInput").value = "";
  document.getElementById("lokasi_lat").value = "";
  document.getElementById("lokasi_lng").value = "";
  document.getElementById("lokasi_nama").value = "";
  document.getElementById("lokasi_alamat").value = "";

  // Clear map container
  const mapContainer = document.getElementById("modalMapContainer");
  if (mapContainer) {
    mapContainer.innerHTML = '<div class="map-loading"><i class="fas fa-spinner fa-spin"></i> Memuat peta...</div>';
  }

  if (item) {
    // Mode Edit
    console.log("✏️ Edit mode for ID:", item.id);
    document.getElementById("lokasiModalTitle").innerText = "✏️ Edit Lokasi Store";
    document.getElementById("lokasi_id").value = item.id;
    document.getElementById("lokasi_nama").value = item.nama_store || "";
    document.getElementById("lokasi_alamat").value = item.alamat || "";
    document.getElementById("lokasi_lat").value = item.latitude || "";
    document.getElementById("lokasi_lng").value = item.longitude || "";

    // Initialize modal map with existing location
    setTimeout(() => {
      const lat = parseFloat(item.latitude) || -7.977275;
      const lng = parseFloat(item.longitude) || 112.633028;
      initModalMap(lat, lng);
    }, 200);
  } else {
    // Mode Tambah
    console.log("➕ Add mode");
    document.getElementById("lokasiModalTitle").innerText = "📍 Tambah Lokasi Store Baru";

    // Initialize modal map with default center (Jakarta)
    setTimeout(() => {
      initModalMap(-7.977275, 112.633028);
    }, 200);
  }

  // Tampilkan modal - pastikan display = flex
  modal.style.display = "flex";
  console.log("✅ Modal displayed with flex");

  // Setup location search after modal is shown
  setTimeout(() => {
    setupLocationSearch();
  }, 100);
}

window.openLokasiModalById = (id) => {
  const item = lokasiData.find((d) => d.id == id);
  if (item) {
    openLokasiModal(item);
  } else {
    Swal.fire("Error", "Data lokasi tidak ditemukan", "error");
  }
};

// Delete Lokasi
window.deleteLokasi = async (id) => {
  const result = await Swal.fire({
    title: "Apakah Anda yakin?",
    text: "Data lokasi ini akan dihapus secara permanen!",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    confirmButtonText: "Ya, hapus!",
    cancelButtonText: "Batal",
  });

  if (!result.isConfirmed) return;

  try {
    const res = await fetch(`/api/lokasi-store/${id}?company=${currentLokasiCompany}`, { method: "DELETE" });
    const resultData = await res.json();

    if (resultData.success) {
      Swal.fire("Berhasil!", "Data lokasi berhasil dihapus.", "success");
      await loadLokasiData();
    } else {
      Swal.fire("Gagal!", resultData.message || "Data tidak ditemukan.", "error");
    }
  } catch (err) {
    console.error(err);
    Swal.fire("Error!", "Server error: " + err.message, "error");
  }
};

// Show Lokasi Store Section
function showLokasiStoreSection(company) {
  console.log(`📍 Showing Lokasi Store section for company: ${company}`);

  currentLokasiCompany = company;
  currentLokasiPage = 1;

  const companyNameSpan = document.getElementById("lokasiStoreCompanyName");
  if (companyNameSpan) {
    companyNameSpan.textContent = company === "hisana" ? "Hisana" : "Enakko";
  }

  // Sembunyikan semua section
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));

  // Tampilkan Lokasi Store section
  const targetSection = document.getElementById("sectionLokasiStore");
  if (targetSection) {
    targetSection.classList.add("active");
    console.log("✅ Lokasi Store section activated");
  } else {
    console.error("❌ Lokasi Store section not found!");
    return;
  }

  // JANGAN tutup dropdown Data Master - biarkan tetap terbuka
  // Hapus panggilan closeAllDataMasterDropdowns() dari sini

  // Update active state di sidebar untuk Data Master dropdown
  if (company === "hisana") {
    const hisanaToggle = document.getElementById("dataMasterHisanaToggle");
    const hisanaMenu = document.getElementById("dataMasterHisanaMenu");
    if (hisanaToggle && hisanaMenu) {
      hisanaToggle.classList.add("active");
      hisanaMenu.classList.add("show");
    }

    const enakkoToggle = document.getElementById("dataMasterEnakkoToggle");
    const enakkoMenu = document.getElementById("dataMasterEnakkoMenu");
    if (enakkoToggle && enakkoMenu) {
      enakkoToggle.classList.remove("active");
      enakkoMenu.classList.remove("show");
    }
  } else {
    const enakkoToggle = document.getElementById("dataMasterEnakkoToggle");
    const enakkoMenu = document.getElementById("dataMasterEnakkoMenu");
    if (enakkoToggle && enakkoMenu) {
      enakkoToggle.classList.add("active");
      enakkoMenu.classList.add("show");
    }

    const hisanaToggle = document.getElementById("dataMasterHisanaToggle");
    const hisanaMenu = document.getElementById("dataMasterHisanaMenu");
    if (hisanaToggle && hisanaMenu) {
      hisanaToggle.classList.remove("active");
      hisanaMenu.classList.remove("show");
    }
  }

  // Update active class untuk nav-item - HAPUS active dari semua nav-item
  document.querySelectorAll(".nav-item").forEach((btn) => btn.classList.remove("active"));

  // Set active untuk menu Lokasi Store yang dipilih
  const dataLokasiBtn = company === "hisana" ? document.getElementById("dataLokasiHisana") : document.getElementById("dataLokasiEnakko");
  if (dataLokasiBtn) {
    dataLokasiBtn.classList.add("active");
  }

  // Pastikan dropdown toggle tetap active (tidak diubah)
  const dataMasterToggle = company === "hisana" ? document.getElementById("dataMasterHisanaToggle") : document.getElementById("dataMasterEnakkoToggle");
  if (dataMasterToggle) {
    dataMasterToggle.classList.add("active");
  }

  // Load data
  loadLokasiData();

  // Initialize map
  if (!mainMap) {
    setTimeout(initMainMap, 300);
  } else {
    setTimeout(() => {
      if (mainMap) {
        mainMap.invalidateSize();
        updateMapMarkers();
      }
    }, 300);
  }

  // Reset search input
  const searchInput = document.getElementById("searchLokasiInput");
  if (searchInput) {
    searchInput.value = "";
  }
}

// Setup Lokasi Store Form Handler
function setupLokasiFormHandler() {
  const lokasiForm = document.getElementById("lokasiForm");
  if (!lokasiForm) {
    console.error("Lokasi form not found");
    return;
  }

  const newLokasiForm = lokasiForm.cloneNode(true);
  lokasiForm.parentNode.replaceChild(newLokasiForm, lokasiForm);

  newLokasiForm.onsubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const id = document.getElementById("lokasi_id").value;
    const nama = document.getElementById("lokasi_nama").value.trim();
    const alamat = document.getElementById("lokasi_alamat").value.trim();
    const lat = document.getElementById("lokasi_lat").value;
    const lng = document.getElementById("lokasi_lng").value;

    if (!nama) {
      Swal.fire("Error", "Nama Store wajib diisi", "error");
      return;
    }
    if (!alamat) {
      Swal.fire("Error", "Alamat wajib diisi", "error");
      return;
    }
    if (!lat || !lng) {
      Swal.fire("Error", "Pilih lokasi di peta terlebih dahulu", "error");
      return;
    }

    const payload = {
      nama_store: nama,
      alamat: alamat,
      latitude: parseFloat(lat),
      longitude: parseFloat(lng),
    };

    const method = id ? "PUT" : "POST";
    const url = id ? `/api/lokasi-store/${id}?company=${currentLokasiCompany}` : `/api/lokasi-store?company=${currentLokasiCompany}`;

    Swal.fire({
      title: id ? "Menyimpan perubahan..." : "Menambahkan lokasi...",
      text: "Mohon tunggu sebentar",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      Swal.close();

      if (result.success) {
        const modal = document.getElementById("lokasiModal");
        if (modal) modal.style.display = "none";

        newLokasiForm.reset();
        document.getElementById("lokasi_id").value = "";

        await loadLokasiData();

        Swal.fire({
          title: "Berhasil!",
          text: id ? "Data lokasi berhasil diperbarui." : "Data lokasi berhasil ditambahkan.",
          icon: "success",
          timer: 2000,
          showConfirmButton: false,
        });
      } else {
        Swal.fire("Gagal", result.message || "Tidak dapat menyimpan data.", "error");
      }
    } catch (err) {
      console.error("Submit error:", err);
      Swal.close();
      Swal.fire("Error", `Terjadi kesalahan: ${err.message}`, "error");
    }
  };
}

// Setup Lokasi Modal Buttons
function setupLokasiModalButtons() {
  const closeBtn = document.getElementById("closeLokasiModal");
  if (closeBtn) {
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn.onclick = () => {
      const modal = document.getElementById("lokasiModal");
      if (modal) modal.style.display = "none";
    };
  }

  const cancelBtn = document.getElementById("cancelLokasiBtn");
  if (cancelBtn) {
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.onclick = () => {
      const modal = document.getElementById("lokasiModal");
      if (modal) modal.style.display = "none";
    };
  }
}

// Setup Lokasi Event Handlers
function setupLokasiEventHandlers() {
  const addBtn = document.getElementById("addLokasiBtn");
  if (addBtn) {
    const newAddBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
    newAddBtn.onclick = () => {
      openLokasiModal();
    };
  }

  const refreshBtn = document.getElementById("refreshMapBtn");
  if (refreshBtn) {
    const newRefreshBtn = refreshBtn.cloneNode(true);
    refreshBtn.parentNode.replaceChild(newRefreshBtn, refreshBtn);
    newRefreshBtn.onclick = () => {
      if (mainMap) {
        mainMap.invalidateSize();
        updateMapMarkers();
        Swal.fire({
          title: "Refresh",
          text: "Peta telah diperbarui",
          icon: "success",
          timer: 1500,
          showConfirmButton: false,
        });
      } else {
        initMainMap();
        Swal.fire({
          title: "Info",
          text: "Memuat ulang peta...",
          icon: "info",
          timer: 1500,
          showConfirmButton: false,
        });
      }
    };
  }

  const searchInput = document.getElementById("searchLokasiInput");
  if (searchInput) {
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);
    newSearchInput.oninput = () => {
      currentLokasiPage = 1;
      renderLokasiTable();
    };
  }

  const prevPage = document.getElementById("prevLokasiPage");
  if (prevPage) {
    const newPrevPage = prevPage.cloneNode(true);
    prevPage.parentNode.replaceChild(newPrevPage, prevPage);
    newPrevPage.onclick = () => {
      if (currentLokasiPage > 1) {
        currentLokasiPage--;
        renderLokasiTable();
      }
    };
  }

  const nextPage = document.getElementById("nextLokasiPage");
  if (nextPage) {
    const newNextPage = nextPage.cloneNode(true);
    nextPage.parentNode.replaceChild(newNextPage, nextPage);
    newNextPage.onclick = () => {
      const query = document.getElementById("searchLokasiInput")?.value.toLowerCase() || "";
      const filtered = lokasiData.filter((d) => d.nama_store?.toLowerCase().includes(query) || d.alamat?.toLowerCase().includes(query));
      if (currentLokasiPage * pageSizeLokasi < filtered.length) {
        currentLokasiPage++;
        renderLokasiTable();
      }
    };
  }
}

// Setup Lokasi Store Menu Handlers
// Setup Lokasi Store Menu Handlers - FIXED (Dropdown tetap terbuka)
function setupLokasiStoreHandlers() {
  // Hisana
  const dataLokasiHisana = document.getElementById("dataLokasiHisana");
  if (dataLokasiHisana) {
    const newBtn = dataLokasiHisana.cloneNode(true);
    dataLokasiHisana.parentNode.replaceChild(newBtn, dataLokasiHisana);
    newBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Update current company
      currentLokasiCompany = "hisana";
      currentCompany = "hisana";

      // Tampilkan section Lokasi Store
      showLokasiStoreSection("hisana");

      // Update active class untuk dropdown items
      document.querySelectorAll(".dropdown-item").forEach((item) => item.classList.remove("active"));
      newBtn.classList.add("active");

      // Pastikan dropdown toggle tetap active (TIDAK ditutup)
      const hisanaToggle = document.getElementById("dataMasterHisanaToggle");
      if (hisanaToggle) {
        hisanaToggle.classList.add("active");
      }

      // Pastikan dropdown menu tetap terbuka (TIDAK ditutup)
      const hisanaMenu = document.getElementById("dataMasterHisanaMenu");
      if (hisanaMenu) {
        hisanaMenu.classList.add("show");
      }

      // Tutup dropdown Enakko jika terbuka
      const enakkoToggle = document.getElementById("dataMasterEnakkoToggle");
      const enakkoMenu = document.getElementById("dataMasterEnakkoMenu");
      if (enakkoToggle && enakkoMenu) {
        enakkoToggle.classList.remove("active");
        enakkoMenu.classList.remove("show");
      }

      console.log("✅ Lokasi Hisana button registered - dropdown tetap terbuka");
    };
    console.log("✅ Lokasi Hisana button registered");
  }

  // Enakko
  const dataLokasiEnakko = document.getElementById("dataLokasiEnakko");
  if (dataLokasiEnakko) {
    const newBtn = dataLokasiEnakko.cloneNode(true);
    dataLokasiEnakko.parentNode.replaceChild(newBtn, dataLokasiEnakko);
    newBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Update current company
      currentLokasiCompany = "enakko";
      currentCompany = "enakko";

      // Tampilkan section Lokasi Store
      showLokasiStoreSection("enakko");

      // Update active class untuk dropdown items
      document.querySelectorAll(".dropdown-item").forEach((item) => item.classList.remove("active"));
      newBtn.classList.add("active");

      // Pastikan dropdown toggle tetap active (TIDAK ditutup)
      const enakkoToggle = document.getElementById("dataMasterEnakkoToggle");
      if (enakkoToggle) {
        enakkoToggle.classList.add("active");
      }

      // Pastikan dropdown menu tetap terbuka (TIDAK ditutup)
      const enakkoMenu = document.getElementById("dataMasterEnakkoMenu");
      if (enakkoMenu) {
        enakkoMenu.classList.add("show");
      }

      // Tutup dropdown Hisana jika terbuka
      const hisanaToggle = document.getElementById("dataMasterHisanaToggle");
      const hisanaMenu = document.getElementById("dataMasterHisanaMenu");
      if (hisanaToggle && hisanaMenu) {
        hisanaToggle.classList.remove("active");
        hisanaMenu.classList.remove("show");
      }

      console.log("✅ Lokasi Enakko button registered - dropdown tetap terbuka");
    };
    console.log("✅ Lokasi Enakko button registered");
  }
}

// =============================
// GLOBAL GAJI
// =============================
let dataAll = [];
let currentPage = 1;
const pageSize = 10;
let checkedSet = new Set();
let currentCompany = "hisana";
let slipEmployeeList = [];
let selectedSlipEmployee = null;
let gajiDuplicateCheckInterval = null;
let cancelSlipProgress = {
  running: false,
  total: 0,
  sent: 0,
  failed: 0,
};
let cancelSlipProgressInterval = null;

let currentSlipMonth = "all";
let currentSlipYear = "all";
let availableSlipYears = [];

// =============================
// GLOBAL BONUS
// =============================
let bonusData = [];
let currentBonusPage = 1;
const pageSizeBonus = 10;
let selectedBonusSet = new Set();
let bonusDuplicateCheckInterval = null;
let bonusProgressInterval = null;
let currentBonusMonth = "all";
let currentBonusYear = "all";
let availableBonusYears = [];

let bonusProgress = {
  running: false,
  total: 0,
  sent: 0,
  failed: 0,
};

let cancelBonusProgress = {
  running: false,
  total: 0,
  sent: 0,
  failed: 0,
};

let cancelBonusProgressInterval = null;

function parseRupiah(value) {
  if (!value) return 0;
  let cleanValue = value.toString().replace(/[^\d]/g, "");
  return parseInt(cleanValue) || 0;
}

// =============================
// THR GLOBAL
// =============================
let thrData = [];
let currentThrPage = 1;
const pageSizeThr = 10;
let thrProgressInterval = null;
let selectedThrSet = new Set();
let currentThrYear = new Date().getFullYear();
let thrDuplicateCheckInterval = null;
let thrProgress = {
  running: false,
  total: 0,
  sent: 0,
  failed: 0,
};
let cancelThrProgress = {
  running: false,
  total: 0,
  sent: 0,
  failed: 0,
};
let cancelThrProgressInterval = null;

// Employee search for bonus
let employeeList = [];
let selectedEmployee = null;

// Employee search for THR
let thrEmployeeList = [];
let selectedThrEmployee = null;

function rupiah(x) {
  if (!x) return "Rp 0";
  return "Rp " + Number(x).toLocaleString("id-ID");
}

function handleThrJumlahInput(e) {
  const input = e.target;
  let value = input.value;
  const cursorPosition = input.selectionStart;
  let cleanValue = value.replace(/[^\d]/g, "");

  if (cleanValue) {
    let formattedValue = "";
    let counter = 0;
    for (let i = cleanValue.length - 1; i >= 0; i--) {
      counter++;
      formattedValue = cleanValue[i] + formattedValue;
      if (counter % 3 === 0 && i !== 0) {
        formattedValue = "." + formattedValue;
      }
    }
    input.value = formattedValue;
    const newPosition = formattedValue.length - (cleanValue.length - cursorPosition);
    setTimeout(() => {
      input.setSelectionRange(newPosition, newPosition);
    }, 0);
  } else {
    input.value = "";
  }
}

async function loadAvailableSlipYears() {
  try {
    console.log(`Loading available years for company: ${currentCompany}`);
    const res = await fetch(`/slip-years?company=${currentCompany}`);
    const data = await res.json();

    if (data.success) {
      const yearSelect = document.getElementById("slipYearSelect");
      if (yearSelect) {
        const currentSelection = yearSelect.value;

        // Simpan nilai yang dipilih saat ini
        yearSelect.innerHTML = '<option value="all">Pilih Tahun</option>';

        data.years.forEach((year) => {
          const option = document.createElement("option");
          option.value = year;
          option.textContent = year;
          yearSelect.appendChild(option);
        });

        // Kembalikan pilihan sebelumnya jika masih valid
        if (currentSelection && (currentSelection === "all" || data.years.includes(parseInt(currentSelection)))) {
          yearSelect.value = currentSelection;
          currentSlipYear = currentSelection;
        } else if (currentSlipYear !== "all") {
          // Jika tahun yang dipilih sebelumnya tidak tersedia, set ke "all"
          yearSelect.value = "all";
          currentSlipYear = "all";
        }

        console.log(`Available years loaded: ${data.years.join(", ")}`);
        console.log(`Current year selection: ${yearSelect.value}`);
      }
    }
  } catch (err) {
    console.error("Load available slip years error:", err);
  }
}

function initializeSlipFilters() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  currentSlipMonth = currentMonth.toString();
  currentSlipYear = currentYear.toString();

  const monthSelect = document.getElementById("slipMonthSelect");
  const yearSelect = document.getElementById("slipYearSelect");

  if (monthSelect) {
    monthSelect.value = currentSlipMonth;
  }

  if (yearSelect) {
    window.pendingSlipYear = currentSlipYear;
  }

  console.log("Slip filters initialized to current month:", currentMonth, "year:", currentYear);
}

function setupFilterListeners() {
  const monthSelect = document.getElementById("slipMonthSelect");
  const yearSelect = document.getElementById("slipYearSelect");

  if (monthSelect) {
    // Hapus event listener lama
    const newMonthSelect = monthSelect.cloneNode(true);
    monthSelect.parentNode.replaceChild(newMonthSelect, monthSelect);

    newMonthSelect.addEventListener("change", async (e) => {
      const selectedMonth = e.target.value;
      console.log(`Month filter changed to: ${selectedMonth}`);

      currentSlipMonth = selectedMonth;
      currentPage = 1;
      checkedSet.clear();

      await loadData();
    });
  }

  if (yearSelect) {
    // Hapus event listener lama
    const newYearSelect = yearSelect.cloneNode(true);
    yearSelect.parentNode.replaceChild(newYearSelect, yearSelect);

    newYearSelect.addEventListener("change", async (e) => {
      const selectedYear = e.target.value;
      console.log(`Year filter changed to: ${selectedYear}`);

      currentSlipYear = selectedYear;
      currentPage = 1;
      checkedSet.clear();

      await loadData();
    });
  }
}

// Panggil fungsi ini di inisialisasi
setupFilterListeners();

function resetFiltersToCurrent() {
  const { month, year } = getCurrentMonthYear();

  currentSlipMonth = month;
  currentSlipYear = year;

  const monthSelect = document.getElementById("slipMonthSelect");
  const yearSelect = document.getElementById("slipYearSelect");

  if (monthSelect) monthSelect.value = month;
  if (yearSelect) yearSelect.value = year;

  // Reload data
  loadData();
}

// =============================
// UPLOAD EXCEL
// =============================
async function uploadExcel(formData, statusId, formId) {
  const statusEl = document.getElementById(statusId);
  const formEl = document.getElementById(formId);

  if (statusEl) statusEl.innerText = "Sedang memproses...";

  // Tampilkan loading
  Swal.fire({
    title: "Sedang mengimport...",
    text: "Mohon tunggu sebentar",
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    },
  });

  try {
    const res = await fetch("/upload", { method: "POST", body: formData });
    const result = await res.json();
    console.log("Upload result:", result);
    Swal.close();

    if (result.success) {
      // Tampilkan alert dengan ringkasan seperti data karyawan
      let messageHtml = `
        <div style="text-align: left;">
          <div style="margin-top: 15px;">
            <div style="display: flex; justify-content: space-around; margin-bottom: 15px;">
              <div style="text-align: center;">
                <div style="font-size: 0.8rem; color: #666;">BERHASIL</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: #16a34a;">${result.successCount || 0}</div>
              </div>
              <div style="text-align: center;">
                <div style="font-size: 0.8rem; color: #666;">DILEWATI</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: #f59e0b;">${result.skippedCount || 0}</div>
              </div>
              <div style="text-align: center;">
                <div style="font-size: 0.8rem; color: #666;">GAGAL</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: #dc2626;">${result.errorCount || 0}</div>
              </div>
            </div>
          </div>
      `;

      if (result.errors && result.errors.length > 0) {
        messageHtml += `
          <div style="margin-top: 15px; max-height: 200px; overflow-y: auto; background: #fef2e8; border-radius: 8px; padding: 10px;">
            <p style="font-weight: 600; margin-bottom: 8px;">Detail Error:</p>
            <ul style="margin: 0; padding-left: 20px; font-size: 0.8rem; color: #dc2626;">
              ${result.errors
                .slice(0, 15)
                .map((err) => `<li>${escapeHtml(err)}</li>`)
                .join("")}
              ${result.errors.length > 15 ? `<li>... dan ${result.errors.length - 15} error lainnya</li>` : ""}
            </ul>
          </div>
        `;
      }

      messageHtml += `</div>`;

      Swal.fire({
        title: result.errorCount > 0 ? "Import Selesai dengan Peringatan" : "Import Berhasil!",
        html: messageHtml,
        icon: result.errorCount > 0 ? "warning" : "success",
        confirmButtonText: "OK",
        width: "500px",
      });

      await loadData();
      formEl.reset();

      // Reset file name display
      const fileNameSpan = document.getElementById("fileNameKirim");
      if (fileNameSpan) {
        fileNameSpan.textContent = "Tidak ada file dipilih";
        fileNameSpan.style.color = "#64748b";
      }
    } else {
      Swal.fire("Import Gagal", result.message || "Terjadi kesalahan saat import", "error");
    }
  } catch (err) {
    console.error("Upload error:", err);
    Swal.close();
    Swal.fire("Import Gagal", "Terjadi kesalahan saat upload: " + err.message, "error");
  } finally {
    if (statusEl) statusEl.innerText = "";
  }
}

// Update uploadFormKirim handler
document.getElementById("uploadFormKirim").onsubmit = async (e) => {
  e.preventDefault();

  const fileInput = document.getElementById("fileInputKirim");
  if (!fileInput.files || fileInput.files.length === 0) {
    Swal.fire("Error", "Silakan pilih file terlebih dahulu", "error");
    return;
  }

  // Validasi ekstensi file
  const fileName = fileInput.files[0].name;
  const fileExt = fileName.split(".").pop().toLowerCase();
  if (!["xlsx", "xls"].includes(fileExt)) {
    Swal.fire("Error", "File harus berupa Excel (.xlsx atau .xls)", "error");
    return;
  }

  const formData = new FormData(e.target);
  formData.append("company", currentCompany);

  const statusEl = document.getElementById("uploadStatus");
  if (statusEl) {
    statusEl.innerText = "Sedang memproses...";
  }

  // Tampilkan loading
  Swal.fire({
    title: "Sedang mengimport...",
    text: "Mohon tunggu sebentar",
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    },
  });

  try {
    const res = await fetch("/upload", {
      method: "POST",
      body: formData,
    });

    const result = await res.json();
    console.log("Upload result:", result);
    Swal.close();

    if (result.success) {
      // Tampilkan alert dengan ringkasan seperti data karyawan
      let messageHtml = `
        <div style="text-align: left;">
          <div style="margin-top: 15px;">
            <div style="display: flex; justify-content: space-around; margin-bottom: 15px;">
              <div style="text-align: center;">
                <div style="font-size: 0.8rem; color: #666;">BERHASIL</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: #16a34a;">${result.successCount || 0}</div>
              </div>
              <div style="text-align: center;">
                <div style="font-size: 0.8rem; color: #666;">DILEWATI</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: #f59e0b;">${result.skippedCount || 0}</div>
              </div>
              <div style="text-align: center;">
                <div style="font-size: 0.8rem; color: #666;">GAGAL</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: #dc2626;">${result.errorCount || 0}</div>
              </div>
            </div>
          </div>
      `;

      if (result.errors && result.errors.length > 0) {
        messageHtml += `
          <div style="margin-top: 15px; max-height: 200px; overflow-y: auto; background: #fef2e8; border-radius: 8px; padding: 10px;">
            <p style="font-weight: 600; margin-bottom: 8px;">Detail Error:</p>
            <ul style="margin: 0; padding-left: 20px; font-size: 0.8rem; color: #dc2626;">
              ${result.errors
                .slice(0, 15)
                .map((err) => `<li>${escapeHtml(err)}</li>`)
                .join("")}
              ${result.errors.length > 15 ? `<li>... dan ${result.errors.length - 15} error lainnya</li>` : ""}
            </ul>
          </div>
        `;
      }

      messageHtml += `</div>`;

      Swal.fire({
        title: result.errorCount > 0 ? "Import Selesai dengan Peringatan" : "Import Berhasil!",
        html: messageHtml,
        icon: result.errorCount > 0 ? "warning" : "success",
        confirmButtonText: "OK",
        width: "500px",
      });

      await loadData();
      e.target.reset();

      // Reset file name display
      const fileNameSpan = document.getElementById("fileNameKirim");
      if (fileNameSpan) {
        fileNameSpan.textContent = "Tidak ada file dipilih";
        fileNameSpan.style.color = "#64748b";
      }
    } else {
      Swal.fire("Import Gagal", result.message || "Terjadi kesalahan saat import", "error");
    }
  } catch (err) {
    console.error("Upload error:", err);
    Swal.close();
    Swal.fire("Import Gagal", "Terjadi kesalahan saat upload: " + err.message, "error");
  } finally {
    if (statusEl) statusEl.innerText = "";
  }
};

function handleCurrencyInput(e) {
  const input = e.target;
  let value = input.value;
  const cursorPosition = input.selectionStart;

  // Hapus semua karakter non-digit
  let cleanValue = value.replace(/[^\d]/g, "");

  if (cleanValue) {
    // Format dengan pemisah ribuan
    let formattedValue = "";
    let counter = 0;
    for (let i = cleanValue.length - 1; i >= 0; i--) {
      counter++;
      formattedValue = cleanValue[i] + formattedValue;
      if (counter % 3 === 0 && i !== 0) {
        formattedValue = "." + formattedValue;
      }
    }
    input.value = formattedValue;

    // Kembalikan posisi kursor
    const newPosition = formattedValue.length - (cleanValue.length - cursorPosition);
    setTimeout(() => {
      input.setSelectionRange(newPosition, newPosition);
    }, 0);
  } else {
    input.value = "";
  }
}

// Fungsi parse currency (sama seperti di atas)
function parseCurrency(value) {
  if (!value) return 0;
  let cleanValue = value.toString().replace(/[^\d]/g, "");
  return parseInt(cleanValue, 10) || 0;
}

// =============================
// FORM RENDER FUNCTIONS
// =============================
function renderFormFields() {
  const formGrid = document.getElementById("formFields");
  if (!formGrid) return;

  if (currentCompany === "hisana") {
    formGrid.innerHTML = `
      <input type="hidden" id="slip_karyawan_id" />
      <input type="hidden" id="slip_no_induk" />
      <input type="hidden" id="slip_nama" />
      <input type="hidden" id="slip_nohp" />
      
      <div class="formGroup" style="grid-column: span 2;">
        <label>Pilih Karyawan *</label>
        <div class="employee-search-container">
          <input type="text" id="employeeSearchSlip" placeholder="Cari berdasarkan No Induk atau Nama..." class="employee-search-input" autocomplete="off" />
          <div id="employeeDropdownSlip" class="employee-dropdown" style="display: none">
            <div class="dropdown-search">
              <input type="text" id="dropdownSearchSlip" placeholder="Cari..." class="dropdown-search-input" />
            </div>
            <div id="employeeListSlip" class="employee-list"></div>
          </div>
        </div>
      </div>
      
      <!-- Read-only fields that auto-fill from employee selection -->
      <div class="formGroup">
        <label>No Induk</label>
        <input type="text" id="no_induk_display" readonly style="background:#f3f4f6; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" placeholder="-" value="" />
      </div>
      <div class="formGroup">
        <label>Nama Karyawan</label>
        <input type="text" id="nama_display" readonly style="background:#f3f4f6; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" placeholder="-" value="" />
      </div>
      <div class="formGroup">
        <label>Posisi / Jabatan</label>
        <input type="text" id="jabatan_display" readonly style="background:#f3f4f6; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" placeholder="-" value="" />
      </div>
      <div class="formGroup">
        <label>Store / Penempatan</label>
        <input type="text" id="store_display" readonly style="background:#f3f4f6; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" placeholder="-" value="" />
      </div>
      <div class="formGroup">
        <label>Awal Masuk</label>
        <input type="text" id="awal_masuk_display" readonly style="background:#f3f4f6; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" placeholder="-" value="" />
      </div>
      <div class="formGroup">
        <label>No HP Karyawan *</label>
        <input type="text" id="nohp" required placeholder="Contoh: 628123456789" style="width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" value="" />
      </div>
      
      <div class="formGroup"><label>Jumlah Hari Kerja *</label><input type="number" id="kerja" required value="0" step="1" style="width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" /></div>
      <div class="formGroup"><label>Gaji Pokok *</label><input type="text" id="gaji" required placeholder="0" class="currency-input" autocomplete="off" style="text-align: right; font-family: monospace; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" /></div>
      <div class="formGroup"><label>Iuran BPJS Ketenagakerjaan</label><input type="text" id="iuran_bpjs_ketenagakerjaan" placeholder="0" class="currency-input" autocomplete="off" style="text-align: right; font-family: monospace; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" /></div>
      <div class="formGroup"><label>Kerajinan</label><input type="text" id="kerajinan" placeholder="0" class="currency-input" autocomplete="off" style="text-align: right; font-family: monospace; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" /></div>
      <div class="formGroup"><label>Cuti</label><input type="text" id="cuti" placeholder="0" class="currency-input" autocomplete="off" style="text-align: right; font-family: monospace; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" /></div>
      <div class="formGroup"><label>Tunjangan BPJS & Pulsa</label><input type="text" id="tunj_bpjs_pulsa" placeholder="0" class="currency-input" autocomplete="off" style="text-align: right; font-family: monospace; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" /></div>
      <div class="formGroup"><label>Total Perhitungan</label><input type="text" id="jumlah" readonly style="background:#f3f4f6; text-align: right; font-family: monospace; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" /></div>
      <div class="formGroup"><label>Uang Makan (UM) *</label><input type="text" id="um" required placeholder="0" class="currency-input" autocomplete="off" style="text-align: right; font-family: monospace; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" /></div>
      <div class="formGroup"><label>Keterangan</label><input type="text" id="keterangan" placeholder="Opsional" style="width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" /></div>
      <div class="formGroup"><label>Total Gaji</label><input type="text" id="gaji_total" readonly style="background:#f3f4f6; text-align: right; font-family: monospace; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" /></div>
    `;

    // Setup currency inputs
    const currencyFields = ["gaji", "iuran_bpjs_ketenagakerjaan", "kerajinan", "cuti", "tunj_bpjs_pulsa", "um"];
    currencyFields.forEach((fieldId) => {
      const element = document.getElementById(fieldId);
      if (element) {
        element.removeEventListener("input", handleCurrencyInput);
        element.addEventListener("input", handleCurrencyInput);
      }
    });

    const triggerIds = ["gaji", "iuran_bpjs_ketenagakerjaan", "kerajinan", "cuti", "tunj_bpjs_pulsa", "um"];
    triggerIds.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.removeEventListener("input", calculatePayrollWithFormat);
        element.addEventListener("input", calculatePayrollWithFormat);
      }
    });

    calculatePayrollWithFormat();
  } else {
    // Enakko form (similar structure)
    formGrid.innerHTML = `
      <input type="hidden" id="slip_karyawan_id" />
      <input type="hidden" id="slip_no_induk" />
      <input type="hidden" id="slip_nama" />
      <input type="hidden" id="slip_nohp" />
      
      <div class="formGroup" style="grid-column: span 2;">
        <label>Pilih Karyawan *</label>
        <div class="employee-search-container">
          <input type="text" id="employeeSearchSlip" placeholder="Cari berdasarkan No Induk atau Nama..." class="employee-search-input" autocomplete="off" />
          <div id="employeeDropdownSlip" class="employee-dropdown" style="display: none">
            <div class="dropdown-search">
              <input type="text" id="dropdownSearchSlip" placeholder="Cari..." class="dropdown-search-input" />
            </div>
            <div id="employeeListSlip" class="employee-list"></div>
          </div>
        </div>
      </div>
      
      <!-- Read-only fields -->
      <div class="formGroup"><label>No Induk</label><input type="text" id="no_induk_display" readonly style="background:#f3f4f6; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" /></div>
      <div class="formGroup"><label>Nama Karyawan</label><input type="text" id="nama_display" readonly style="background:#f3f4f6; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" /></div>
      <div class="formGroup"><label>Jabatan</label><input type="text" id="jabatan_display" readonly style="background:#f3f4f6; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" /></div>
      <div class="formGroup"><label>Penempatan / Store</label><input type="text" id="penempatan_display" readonly style="background:#f3f4f6; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" /></div>
      <div class="formGroup"><label>Tanggal Masuk</label><input type="text" id="tanggal_masuk_display" readonly style="background:#f3f4f6; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" /></div>
      <div class="formGroup"><label>No HP Karyawan *</label><input type="text" id="nohp" required placeholder="Contoh: 628123456789" style="width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" /></div>
      
      <div class="formGroup"><label>Gaji Pokok *</label><input type="text" id="gaji_pokok" required placeholder="0" class="currency-input" autocomplete="off" style="text-align: right; font-family: monospace; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" /></div>
      <div class="formGroup"><label>BPJS Kesehatan</label><input type="text" id="bpjs_kesehatan" placeholder="0" class="currency-input" autocomplete="off" style="text-align: right; font-family: monospace; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" /></div>
      <div class="formGroup"><label>Insentif</label><input type="text" id="insentif" placeholder="0" class="currency-input" autocomplete="off" style="text-align: right; font-family: monospace; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" /></div>
      <div class="formGroup"><label>Total Gaji</label><input type="text" id="total_gaji" readonly style="background:#f3f4f6; text-align: right; font-family: monospace; width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" /></div>
      <div class="formGroup"><label>Keterangan</label><input type="text" id="keterangan" placeholder="Opsional" style="width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;" /></div>
    `;

    const currencyFieldsEnakko = ["gaji_pokok", "bpjs_kesehatan", "insentif"];
    currencyFieldsEnakko.forEach((fieldId) => {
      const element = document.getElementById(fieldId);
      if (element) {
        element.removeEventListener("input", handleCurrencyInput);
        element.addEventListener("input", handleCurrencyInput);
      }
    });

    const triggerIdsEnakko = ["gaji_pokok", "bpjs_kesehatan", "insentif"];
    triggerIdsEnakko.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.removeEventListener("input", calculateEnakkoTotalWithFormat);
        element.addEventListener("input", calculateEnakkoTotalWithFormat);
      }
    });
    calculateEnakkoTotalWithFormat();
  }

  // Setup employee search untuk slip gaji
  setupSlipEmployeeSearch();
}

// Di dalam loadSlipEmployeeList, tambahkan log
async function loadSlipEmployeeList() {
  try {
    console.log(`Loading employee list for slip from data_karyawan for company: ${currentCompany}`);
    const res = await fetch(`/slip-employees?company=${currentCompany}`);
    const data = await res.json();

    console.log("Raw response from /slip-employees:", data);

    if (data.success && data.employees) {
      slipEmployeeList = data.employees;
      console.log(`Employee list loaded for slip: ${slipEmployeeList.length} employees`);
      console.log("First employee:", slipEmployeeList[0]);
      return slipEmployeeList;
    } else {
      console.error("Failed to load employees for slip:", data);
      slipEmployeeList = [];
      return [];
    }
  } catch (err) {
    console.error("Load slip employee list error:", err);
    slipEmployeeList = [];
    return [];
  }
}

function renderSlipEmployeeDropdown(filterText = "") {
  const employeeListContainer = document.getElementById("employeeListSlip");
  if (!employeeListContainer) return;

  const filtered = slipEmployeeList.filter((emp) => emp.no_induk.toLowerCase().includes(filterText.toLowerCase()) || emp.nama.toLowerCase().includes(filterText.toLowerCase()));

  if (filtered.length === 0) {
    employeeListContainer.innerHTML = '<div class="employee-empty">Tidak ada karyawan ditemukan</div>';
    return;
  }

  employeeListContainer.innerHTML = filtered
    .map(
      (emp) => `
    <div class="employee-item" 
         data-karyawan-id="${emp.karyawan_id}"
         data-no-induk="${escapeHtml(emp.no_induk)}" 
         data-nama="${escapeHtml(emp.nama)}" 
         data-nohp="${escapeHtml(emp.no_hp || "")}" 
         data-jabatan="${escapeHtml(emp.jabatan || "")}" 
         data-awal-masuk="${escapeHtml(emp.awal_masuk || "")}"
         data-store-name="${escapeHtml(emp.store_name || "")}">
      <div class="employee-no-induk">${escapeHtml(emp.no_induk)}</div>
      <div class="employee-name">${escapeHtml(emp.nama)}</div>
      <div class="employee-detail">${escapeHtml(emp.jabatan || "")} ${emp.store_name ? " - " + escapeHtml(emp.store_name) : ""}</div>
      ${emp.awal_masuk ? `<div class="employee-detail" style="font-size: 11px; color: #666;">📅 Awal Masuk: ${emp.awal_masuk}</div>` : ""}
    </div>
  `,
    )
    .join("");

  document.querySelectorAll("#employeeListSlip .employee-item").forEach((item) => {
    // Hapus event listener lama dengan clone
    const newItem = item.cloneNode(true);
    item.parentNode.replaceChild(newItem, item);

    newItem.addEventListener("click", () => {
      const karyawanId = newItem.dataset.karyawanId;
      const noInduk = newItem.dataset.noInduk;
      const nama = newItem.dataset.nama;
      const nohp = newItem.dataset.nohp;
      const jabatan = newItem.dataset.jabatan;
      const awalMasuk = newItem.dataset.awalMasuk;
      const storeName = newItem.dataset.storeName;

      console.log("Selected employee:", { karyawanId, noInduk, nama, jabatan, awalMasuk, storeName });

      selectSlipEmployee(karyawanId, noInduk, nama, nohp, jabatan, awalMasuk, storeName);
    });
  });
}

function renderSlipEmployeeDropdown(filterText = "") {
  const employeeListContainer = document.getElementById("employeeListSlip");
  if (!employeeListContainer) return;

  const filtered = slipEmployeeList.filter((emp) => emp.no_induk.toLowerCase().includes(filterText.toLowerCase()) || emp.nama.toLowerCase().includes(filterText.toLowerCase()));

  if (filtered.length === 0) {
    employeeListContainer.innerHTML = '<div class="employee-empty">Tidak ada karyawan ditemukan</div>';
    return;
  }

  employeeListContainer.innerHTML = filtered
    .map(
      (emp) => `
    <div class="employee-item" 
         data-karyawan-id="${emp.karyawan_id}"
         data-no-induk="${escapeHtml(emp.no_induk)}" 
         data-nama="${escapeHtml(emp.nama)}" 
         data-nohp="${escapeHtml(emp.no_hp || "")}" 
         data-jabatan="${escapeHtml(emp.jabatan || "")}" 
         data-awal-masuk="${escapeHtml(emp.awal_masuk || "")}"
         data-store-name="${escapeHtml(emp.store_name || "")}">
      <div class="employee-no-induk">${escapeHtml(emp.no_induk)}</div>
      <div class="employee-name">${escapeHtml(emp.nama)}</div>
      <div class="employee-detail">${escapeHtml(emp.jabatan || "")} ${emp.store_name ? " - " + escapeHtml(emp.store_name) : ""}</div>
      ${emp.awal_masuk ? `<div class="employee-detail" style="font-size: 11px; color: #666;">📅 Awal Masuk: ${emp.awal_masuk}</div>` : ""}
    </div>
  `,
    )
    .join("");

  document.querySelectorAll("#employeeListSlip .employee-item").forEach((item) => {
    item.addEventListener("click", () => {
      const karyawanId = item.dataset.karyawanId;
      const noInduk = item.dataset.noInduk;
      const nama = item.dataset.nama;
      const nohp = item.dataset.nohp;
      const jabatan = item.dataset.jabatan;
      const awalMasuk = item.dataset.awalMasuk;
      const storeName = item.dataset.storeName;

      console.log("Selected employee:", { karyawanId, noInduk, nama, jabatan, awalMasuk, storeName });

      selectSlipEmployee(karyawanId, noInduk, nama, nohp, jabatan, awalMasuk, storeName);
    });
  });
}

function setupSlipEmployeeSearch() {
  const searchInput = document.getElementById("employeeSearchSlip");
  const dropdown = document.getElementById("employeeDropdownSlip");
  const dropdownSearch = document.getElementById("dropdownSearchSlip");

  if (!searchInput || !dropdown) {
    console.warn("Employee search elements not found");
    return;
  }

  // Hapus event listener lama dengan clone
  const newSearchInput = searchInput.cloneNode(true);
  searchInput.parentNode.replaceChild(newSearchInput, searchInput);

  const newDropdown = dropdown.cloneNode(true);
  dropdown.parentNode.replaceChild(newDropdown, dropdown);

  newSearchInput.addEventListener("focus", async () => {
    console.log("Search input focused, loading employees...");
    if (slipEmployeeList.length === 0) {
      await loadSlipEmployeeList();
    }
    renderSlipEmployeeDropdown(newSearchInput.value.split(" - ")[0] || "");
    newDropdown.style.display = "block";
  });

  newSearchInput.addEventListener("input", (e) => {
    const value = e.target.value.split(" - ")[0] || e.target.value;
    renderSlipEmployeeDropdown(value);
    newDropdown.style.display = "block";
  });

  document.addEventListener("click", (e) => {
    if (!newSearchInput.contains(e.target) && !newDropdown.contains(e.target)) {
      newDropdown.style.display = "none";
    }
  });

  const newDropdownSearch = document.getElementById("dropdownSearchSlip");
  if (newDropdownSearch) {
    const newDropdownSearchInput = newDropdownSearch.cloneNode(true);
    newDropdownSearch.parentNode.replaceChild(newDropdownSearchInput, newDropdownSearch);

    newDropdownSearchInput.addEventListener("input", (e) => {
      renderSlipEmployeeDropdown(e.target.value);
    });
    newDropdownSearchInput.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  newDropdown.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  console.log("Slip employee search setup complete");
}

function selectSlipEmployee(karyawanId, noInduk, nama, nohp, jabatan, awalMasuk, storeName) {
  console.log("🔵 selectSlipEmployee called with:", {
    karyawanId,
    noInduk,
    nama,
    nohp,
    jabatan,
    awalMasuk,
    storeName,
  });

  selectedSlipEmployee = {
    karyawan_id: karyawanId,
    no_induk: noInduk,
    nama: nama,
    nohp: nohp,
  };

  // Set hidden fields
  const karyawanIdInput = document.getElementById("slip_karyawan_id");
  const noIndukInput = document.getElementById("slip_no_induk");
  const namaInput = document.getElementById("slip_nama");

  if (karyawanIdInput) karyawanIdInput.value = karyawanId;
  if (noIndukInput) noIndukInput.value = noInduk;
  if (namaInput) namaInput.value = nama;

  // Set search input display
  const searchInput = document.getElementById("employeeSearchSlip");
  if (searchInput) {
    searchInput.value = `${noInduk} - ${nama}`;
  }

  // Set nohp field
  const nohpInput = document.getElementById("nohp");
  if (nohpInput) {
    nohpInput.value = nohp || "";
  }

  // PERBAIKAN: Isi display fields dengan DOM manipulation langsung
  if (currentCompany === "hisana") {
    // Hisana - fill readonly display fields
    const noIndukDisplay = document.getElementById("no_induk_display");
    const namaDisplay = document.getElementById("nama_display");
    const jabatanDisplay = document.getElementById("jabatan_display");
    const storeDisplay = document.getElementById("store_display");
    const awalMasukDisplay = document.getElementById("awal_masuk_display");

    console.log("Setting Hisana display fields - elements found:", {
      noIndukDisplay: !!noIndukDisplay,
      namaDisplay: !!namaDisplay,
      jabatanDisplay: !!jabatanDisplay,
      storeDisplay: !!storeDisplay,
      awalMasukDisplay: !!awalMasukDisplay,
    });

    if (noIndukDisplay) {
      noIndukDisplay.value = noInduk || "-";
      console.log("Set no_induk_display to:", noIndukDisplay.value);
    }
    if (namaDisplay) {
      namaDisplay.value = nama || "-";
      console.log("Set nama_display to:", namaDisplay.value);
    }
    if (jabatanDisplay) {
      jabatanDisplay.value = jabatan || "-";
      console.log("Set jabatan_display to:", jabatanDisplay.value);
    }
    if (storeDisplay) {
      storeDisplay.value = storeName || "-";
      console.log("Set store_display to:", storeDisplay.value);
    }
    if (awalMasukDisplay) {
      // Format tanggal jika perlu
      let formattedDate = awalMasuk;
      if (awalMasuk && awalMasuk.includes("-")) {
        const parts = awalMasuk.split("-");
        if (parts.length === 3) {
          formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }
      awalMasukDisplay.value = formattedDate || "-";
      console.log("Set awal_masuk_display to:", awalMasukDisplay.value);
    }
  } else {
    // Enakko - fill readonly display fields
    const noIndukDisplay = document.getElementById("no_induk_display");
    const namaDisplay = document.getElementById("nama_display");
    const jabatanDisplay = document.getElementById("jabatan_display");
    const penempatanDisplay = document.getElementById("penempatan_display");
    const tanggalMasukDisplay = document.getElementById("tanggal_masuk_display");

    console.log("Setting Enakko display fields - elements found:", {
      noIndukDisplay: !!noIndukDisplay,
      namaDisplay: !!namaDisplay,
      jabatanDisplay: !!jabatanDisplay,
      penempatanDisplay: !!penempatanDisplay,
      tanggalMasukDisplay: !!tanggalMasukDisplay,
    });

    if (noIndukDisplay) {
      noIndukDisplay.value = noInduk || "-";
    }
    if (namaDisplay) {
      namaDisplay.value = nama || "-";
    }
    if (jabatanDisplay) {
      jabatanDisplay.value = jabatan || "-";
    }
    if (penempatanDisplay) {
      penempatanDisplay.value = storeName || "-";
    }
    if (tanggalMasukDisplay) {
      let formattedDate = awalMasuk;
      if (awalMasuk && awalMasuk.includes("-")) {
        const parts = awalMasuk.split("-");
        if (parts.length === 3) {
          formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }
      tanggalMasukDisplay.value = formattedDate || "-";
    }
  }

  const dropdown = document.getElementById("employeeDropdownSlip");
  if (dropdown) dropdown.style.display = "none";
}

function resetSlipEmployeeSelection() {
  selectedSlipEmployee = null;
  const searchInput = document.getElementById("employeeSearchSlip");
  const karyawanIdInput = document.getElementById("slip_karyawan_id");
  const noIndukInput = document.getElementById("slip_no_induk");
  const namaInput = document.getElementById("slip_nama");

  if (searchInput) searchInput.value = "";
  if (karyawanIdInput) karyawanIdInput.value = "";
  if (noIndukInput) noIndukInput.value = "";
  if (namaInput) namaInput.value = "";
}

// Fungsi untuk format currency (pemisah ribuan dengan titik)
function formatCurrency(angka) {
  if (!angka) return "";
  // Hapus semua karakter non-digit
  let cleanNumber = angka.toString().replace(/[^\d]/g, "");
  if (!cleanNumber) return "";
  const number = parseInt(cleanNumber, 10);
  if (isNaN(number)) return "";
  // Format dengan pemisah ribuan menggunakan titik
  return number.toLocaleString("id-ID").replace(/,/g, ".");
}

// Fungsi untuk parse currency (mengembalikan angka)
function parseCurrency(value) {
  if (!value) return 0;
  let cleanValue = value.toString().replace(/[^\d]/g, "");
  return parseInt(cleanValue, 10) || 0;
}

// Fungsi handle input untuk bonus jumlah
function handleBonusJumlahInput(e) {
  const input = e.target;
  let value = input.value;

  // Simpan posisi kursor
  const cursorPosition = input.selectionStart;

  // Hapus semua karakter non-digit
  let cleanValue = value.replace(/[^\d]/g, "");

  if (cleanValue) {
    // Format dengan pemisah ribuan
    let formattedValue = "";
    let counter = 0;
    for (let i = cleanValue.length - 1; i >= 0; i--) {
      counter++;
      formattedValue = cleanValue[i] + formattedValue;
      if (counter % 3 === 0 && i !== 0) {
        formattedValue = "." + formattedValue;
      }
    }
    input.value = formattedValue;

    // Kembalikan posisi kursor
    const newPosition = formattedValue.length - (cleanValue.length - cursorPosition);
    setTimeout(() => {
      input.setSelectionRange(newPosition, newPosition);
    }, 0);
  } else {
    input.value = "";
  }
}

function calculatePayrollWithFormat() {
  const gaji = parseCurrency(document.getElementById("gaji")?.value);
  const iuran = parseCurrency(document.getElementById("iuran_bpjs_ketenagakerjaan")?.value);
  const kerajinan = parseCurrency(document.getElementById("kerajinan")?.value);
  const cuti = parseCurrency(document.getElementById("cuti")?.value);
  const tunjangan = parseCurrency(document.getElementById("tunj_bpjs_pulsa")?.value);
  const um = parseCurrency(document.getElementById("um")?.value);

  const jumlah = gaji - iuran + kerajinan + cuti + tunjangan;
  const gajiTotal = jumlah + um;

  const jumlahField = document.getElementById("jumlah");
  const gajiTotalField = document.getElementById("gaji_total");

  if (jumlahField) {
    jumlahField.value = jumlah.toLocaleString("id-ID");
  }
  if (gajiTotalField) {
    gajiTotalField.value = gajiTotal.toLocaleString("id-ID");
  }
}

function calculateEnakkoTotalWithFormat() {
  const gajiPokok = parseCurrency(document.getElementById("gaji_pokok")?.value);
  const bpjsKesehatan = parseCurrency(document.getElementById("bpjs_kesehatan")?.value);
  const insentif = parseCurrency(document.getElementById("insentif")?.value);

  const totalGaji = gajiPokok + bpjsKesehatan + insentif;

  const totalGajiField = document.getElementById("total_gaji");
  if (totalGajiField) {
    totalGajiField.value = totalGaji.toLocaleString("id-ID");
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
  // Tutup semua dropdown Data Master saat pindah ke menu lain
  closeAllDataMasterDropdowns();

  // Hapus active class dari semua nav-item
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));

  // Update active state pada button di sidebar
  const btn = document.getElementById(btnId);
  if (btn) {
    btn.classList.add("active");
  }

  // Tampilkan section yang dipilih
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  const targetSection = document.getElementById(sectionId);
  if (targetSection) {
    targetSection.classList.add("active");
  }
}

function activateKirimSlipMenu() {
  if (currentCompany === "hisana") {
    const menuKirimHisana = document.getElementById("menuKirimHisana");
    if (menuKirimHisana) {
      menuKirimHisana.click();
    }
  } else {
    const menuKirimEnakko = document.getElementById("menuKirimEnakko");
    if (menuKirimEnakko) {
      menuKirimEnakko.click();
    }
  }
}

// =============================
// SWITCH MAIN MENU
// =============================
function switchMainMenu(company) {
  console.log("Switching to company:", company);

  closeAllDataMasterDropdowns();
  currentCompany = company;
  currentLokasiCompany = company;

  checkedSet.clear();
  selectedBonusSet.clear();
  selectedThrSet.clear();
  currentPage = 1;
  currentBonusPage = 1;
  currentThrPage = 1;

  const { month, year } = getCurrentMonthYear();

  currentSlipMonth = month;
  currentSlipYear = year;
  currentBonusMonth = month;
  currentBonusYear = year;
  currentThrYear = "all";

  const slipMonthSelect = document.getElementById("slipMonthSelect");
  const slipYearSelect = document.getElementById("slipYearSelect");
  const bonusMonthSelect = document.getElementById("bonusMonthSelect");
  const bonusYearSelect = document.getElementById("bonusYearSelect");

  if (slipMonthSelect) slipMonthSelect.value = currentSlipMonth;
  if (slipYearSelect) slipYearSelect.value = currentSlipYear;
  if (bonusMonthSelect) bonusMonthSelect.value = currentBonusMonth;
  if (bonusYearSelect) bonusYearSelect.value = currentBonusYear;

  resetBonusProgress();
  resetThrProgress();

  const progressContainer = document.getElementById("progressContainer");
  const progressBar = document.getElementById("bar");
  if (progressContainer) progressContainer.style.display = "none";
  if (progressBar) progressBar.style.width = "0%";

  // Update company buttons active state
  if (company === "hisana") {
    menuHisanaBtn.classList.add("active");
    menuEnakkoBtn.classList.remove("active");

    // Tampilkan menu Hisana, sembunyikan menu Enakko
    const submenuHisana = document.getElementById("submenuHisana");
    const submenuEnakko = document.getElementById("submenuEnakko");
    if (submenuHisana) submenuHisana.style.display = "block";
    if (submenuEnakko) submenuEnakko.style.display = "none";

    updateDataMasterDropdown("hisana");

    const dashboardHisanaBtn = document.getElementById("dashboardHisana");
    if (dashboardHisanaBtn) {
      dashboardHisanaBtn.click();
    }
  } else {
    menuEnakkoBtn.classList.add("active");
    menuHisanaBtn.classList.remove("active");

    // Tampilkan menu Enakko, sembunyikan menu Hisana
    const submenuHisana = document.getElementById("submenuHisana");
    const submenuEnakko = document.getElementById("submenuEnakko");
    if (submenuHisana) submenuHisana.style.display = "none";
    if (submenuEnakko) submenuEnakko.style.display = "block";

    updateDataMasterDropdown("enakko");

    const dashboardEnakkoBtn = document.getElementById("dashboardEnakko");
    if (dashboardEnakkoBtn) {
      dashboardEnakkoBtn.click();
    }
  }

  slipEmployeeList = [];
  selectedEmployee = null;
  resetEmployeeSelection();
  thrEmployeeList = [];
  selectedThrEmployee = null;
  resetThrEmployeeSelection();

  stopBonusDuplicateStatusCheck();
  stopThrDuplicateStatusCheck();
  stopGajiDuplicateStatusCheck();

  renderTableHeader();
  loadData();
  loadBonusData();
  loadThrData();

  setTimeout(() => {
    initializeBonusDuplicationButtons();
    initializeThrDuplicationButtons();
    checkBonusDuplicateStatus();
    startBonusDuplicateStatusCheck();
    checkThrDuplicateStatus();
    startThrDuplicateStatusCheck();
    checkDuplicateStatus();
    startGajiDuplicateStatusCheck();
  }, 500);
}

// =============================
// DATA MASTER DROPDOWN FUNCTIONS
// =============================
function initDataMasterDropdown() {
  // Hisana dropdown
  const hisanaToggle = document.getElementById("dataMasterHisanaToggle");
  const hisanaMenu = document.getElementById("dataMasterHisanaMenu");

  if (hisanaToggle && hisanaMenu) {
    // Hapus event listener lama
    const newHisanaToggle = hisanaToggle.cloneNode(true);
    hisanaToggle.parentNode.replaceChild(newHisanaToggle, hisanaToggle);

    newHisanaToggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Tutup dropdown Enakko jika terbuka
      const enakkoToggleElem = document.getElementById("dataMasterEnakkoToggle");
      const enakkoMenuElem = document.getElementById("dataMasterEnakkoMenu");
      if (enakkoToggleElem && enakkoMenuElem) {
        enakkoToggleElem.classList.remove("active");
        enakkoMenuElem.classList.remove("show");
      }

      // Toggle dropdown Hisana
      newHisanaToggle.classList.toggle("active");
      hisanaMenu.classList.toggle("show");
    });
  }

  // Enakko dropdown
  const enakkoToggle = document.getElementById("dataMasterEnakkoToggle");
  const enakkoMenu = document.getElementById("dataMasterEnakkoMenu");

  if (enakkoToggle && enakkoMenu) {
    // Hapus event listener lama
    const newEnakkoToggle = enakkoToggle.cloneNode(true);
    enakkoToggle.parentNode.replaceChild(newEnakkoToggle, enakkoToggle);

    newEnakkoToggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Tutup dropdown Hisana jika terbuka
      const hisanaToggleElem = document.getElementById("dataMasterHisanaToggle");
      const hisanaMenuElem = document.getElementById("dataMasterHisanaMenu");
      if (hisanaToggleElem && hisanaMenuElem) {
        hisanaToggleElem.classList.remove("active");
        hisanaMenuElem.classList.remove("show");
      }

      // Toggle dropdown Enakko
      newEnakkoToggle.classList.toggle("active");
      enakkoMenu.classList.toggle("show");
    });
  }

  // Event untuk mencegah dropdown tertutup saat klik di dalam menu
  // Gunakan variabel yang berbeda, ambil ulang dari DOM
  const hisanaMenuElement = document.getElementById("dataMasterHisanaMenu");
  const enakkoMenuElement = document.getElementById("dataMasterEnakkoMenu");

  if (hisanaMenuElement) {
    hisanaMenuElement.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  if (enakkoMenuElement) {
    enakkoMenuElement.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }
}

// Fungsi untuk menutup semua dropdown Data Master
function closeAllDataMasterDropdowns() {
  const hisanaToggle = document.getElementById("dataMasterHisanaToggle");
  const hisanaMenu = document.getElementById("dataMasterHisanaMenu");
  const enakkoToggle = document.getElementById("dataMasterEnakkoToggle");
  const enakkoMenu = document.getElementById("dataMasterEnakkoMenu");

  if (hisanaToggle && hisanaMenu) {
    hisanaToggle.classList.remove("active");
    hisanaMenu.classList.remove("show");
  }

  if (enakkoToggle && enakkoMenu) {
    enakkoToggle.classList.remove("active");
    enakkoMenu.classList.remove("show");
  }
}

// =============================
// DATA KARYAWAN FUNCTIONS
// =============================
function updateDataMasterDropdown(company) {
  // Hisana dropdown
  const hisanaDropdown = document.getElementById("dataMasterHisanaToggle");
  const hisanaMenu = document.getElementById("dataMasterHisanaMenu");
  const hisanaSubmenu = document.getElementById("submenuHisana");

  // Enakko dropdown
  const enakkoDropdown = document.getElementById("dataMasterEnakkoToggle");
  const enakkoMenu = document.getElementById("dataMasterEnakkoMenu");
  const enakkoSubmenu = document.getElementById("submenuEnakko");

  if (company === "hisana") {
    // Tampilkan menu Hisana, sembunyikan menu Enakko
    if (hisanaSubmenu) hisanaSubmenu.style.display = "block";
    if (enakkoSubmenu) enakkoSubmenu.style.display = "none";

    // Aktifkan dropdown Hisana, nonaktifkan Enakko
    if (hisanaDropdown && hisanaMenu) {
      hisanaDropdown.classList.add("active");
      hisanaMenu.classList.add("show");
    }
    if (enakkoDropdown && enakkoMenu) {
      enakkoDropdown.classList.remove("active");
      enakkoMenu.classList.remove("show");
    }
  } else {
    // Tampilkan menu Enakko, sembunyikan menu Hisana
    if (enakkoSubmenu) enakkoSubmenu.style.display = "block";
    if (hisanaSubmenu) hisanaSubmenu.style.display = "none";

    // Aktifkan dropdown Enakko, nonaktifkan Hisana
    if (enakkoDropdown && enakkoMenu) {
      enakkoDropdown.classList.add("active");
      enakkoMenu.classList.add("show");
    }
    if (hisanaDropdown && hisanaMenu) {
      hisanaDropdown.classList.remove("active");
      hisanaMenu.classList.remove("show");
    }
  }
}

window.addEventListener("load", () => {
  // Set default company
  currentCompany = "hisana";

  // Aktifkan Dashboard sebagai default (bukan Data Slip Gaji)
  showDashboardSection("hisana");

  // Update active state di sidebar untuk Dashboard
  const dashboardHisanaBtn = document.getElementById("dashboardHisana");
  if (dashboardHisanaBtn) {
    document.querySelectorAll(".nav-item").forEach((btn) => btn.classList.remove("active"));
    dashboardHisanaBtn.classList.add("active");
  }
});

menuHisanaBtn.onclick = () => switchMainMenu("hisana");
menuEnakkoBtn.onclick = () => switchMainMenu("enakko");

// =============================
// SUBMENU HANDLERS
// =============================
// Hisana menus
document.getElementById("menuKirimHisana").onclick = () => {
  activateSubmenu("menuKirimHisana", "sectionKirim");
  renderTable();
};

document.getElementById("menuBonusHisana").onclick = () => {
  activateSubmenu("menuBonusHisana", "sectionBonus");
  if (currentBonusMonth === "all" || currentBonusYear === "all") {
    const now = new Date();
    currentBonusMonth = (now.getMonth() + 1).toString();
    currentBonusYear = now.getFullYear().toString();
    const monthSelect = document.getElementById("bonusMonthSelect");
    const yearSelect = document.getElementById("bonusYearSelect");
    if (monthSelect) monthSelect.value = currentBonusMonth;
    if (yearSelect) yearSelect.value = currentBonusYear;
  }
  loadBonusData();
};

document.getElementById("menuTHRHisana").onclick = () => {
  activateSubmenu("menuTHRHisana", "sectionTHR");
  loadThrData();
};

// Enakko menus
document.getElementById("menuKirimEnakko").onclick = () => {
  activateSubmenu("menuKirimEnakko", "sectionKirim");
  renderTable();
};

document.getElementById("menuBonusEnakko").onclick = () => {
  activateSubmenu("menuBonusEnakko", "sectionBonus");
  if (currentBonusMonth === "all" || currentBonusYear === "all") {
    const now = new Date();
    currentBonusMonth = (now.getMonth() + 1).toString();
    currentBonusYear = now.getFullYear().toString();
    const monthSelect = document.getElementById("bonusMonthSelect");
    const yearSelect = document.getElementById("bonusYearSelect");
    if (monthSelect) monthSelect.value = currentBonusMonth;
    if (yearSelect) yearSelect.value = currentBonusYear;
  }
  loadBonusData();
};

document.getElementById("menuTHREnakko").onclick = () => {
  activateSubmenu("menuTHREnakko", "sectionTHR");
  loadThrData();
};

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
        <th style="width: 150px">Alasan Pembatalan</th>
        <th>Aksi</th>
      </tr>
    `;
  } else {
    thead.innerHTML = `
      <tr>
        <th><input type="checkbox" id="selectAllSlip" class="select-all-checkbox"></th>
        <th>No</th>
        <th>No Induk</th>
        <th>Nama</th>
        <th>Tanggal Masuk</th>
        <th>Jabatan</th>
        <th>Penempatan</th>
        <th>Gaji Pokok</th>
        <th>BPJS Kesehatan</th>
        <th>Insentif</th>
        <th>Total Gaji</th>
        <th>Keterangan</th>
        <th>No HP</th>
        <th>Status Slip</th>
        <th style="width: 150px">Alasan Pembatalan</th>
        <th>Aksi</th>
      </tr>
    `;
  }
}

function renderTable() {
  const tbody = document.querySelector("#table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const query = document.getElementById("searchInput")?.value.toLowerCase() || "";
  const filtered = dataAll.filter((d) => Object.values(d).some((v) => String(v).toLowerCase().includes(query)) || (d.no_induk && d.no_induk.toLowerCase().includes(query)) || (d.nama && d.nama.toLowerCase().includes(query)));
  const totalPages = Math.ceil(filtered.length / pageSize);
  if (currentPage > totalPages) currentPage = 1;
  const start = (currentPage - 1) * pageSize;
  const pageData = filtered.slice(start, start + pageSize);

  pageData.forEach((d, i) => {
    const tr = document.createElement("tr");

    if (d.status_slip === "terkirim") {
      tr.classList.add("status-sent");
    } else if (d.status_slip === "dibatalkan") {
      tr.classList.add("status-cancelled");
    }

    const checked = checkedSet.has(d.id) ? "checked" : "";
    let statusBadge = "";
    if (d.status_slip === "terkirim") {
      statusBadge = '<span class="status-badge success"><i class="fas fa-check-circle"></i> Terkirim</span>';
    } else if (d.status_slip === "dibatalkan") {
      statusBadge = '<span class="status-badge cancelled"><i class="fas fa-ban"></i> Dibatalkan</span>';
    } else {
      statusBadge = '<span class="status-badge pending"><i class="fas fa-clock"></i> Belum Dikirim</span>';
    }

    let cancellationNoteDisplay = "-";
    if (d.status_slip === "dibatalkan" && d.cancellation_note) {
      cancellationNoteDisplay = `<span class="cancellation-note" title="${escapeHtml(d.cancellation_note)}">${escapeHtml(d.cancellation_note.length > 30 ? d.cancellation_note.substring(0, 30) + "..." : d.cancellation_note)}</span>`;
    } else if (d.status_slip === "dibatalkan") {
      cancellationNoteDisplay = '<span class="cancellation-note" style="color: #f59e0b;"><i class="fas fa-info-circle"></i> Alasan tidak tersedia</span>';
    }

    // Tombol Edit dan Delete (hanya untuk status belum_dikirim)
    let actionButtons = "";
    if (d.status_slip !== "terkirim") {
      actionButtons = `
        <button class="btn-primary" style="padding: 5px 10px; margin-right: 5px;" onclick='openModalById(${d.id})'>
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn-danger" style="padding: 5px 10px;" onclick='deleteData(${d.id})'>
          <i class="fas fa-trash"></i>
        </button>
      `;
    } else {
      actionButtons = '<span style="color: #64748b; font-size: 0.7rem;">Tidak dapat diedit</span>';
    }

    if (currentCompany === "hisana") {
      let awalMasukFormatted = d.awal_masuk ? new Date(d.awal_masuk).toISOString().split("T")[0] : "";
      tr.innerHTML = `
        <td><input type="checkbox" class="chk chk-slip" data-id="${d.id}" ${checked}>
        <td class="text-center">${start + i + 1}</td>
        <td>${d.no_induk || "-"}</td>
        <td style="font-weight:600">${d.nama || "-"}</td>
        <td>${d.jabatan || "-"}</td>
        <td>${d.store_name || "-"}</td>
        <td>${awalMasukFormatted}</td>
        <td>${d.kerja || 0}</td>
        <td class="money">${rupiah(d.gaji || 0)}</td>
        <td class="deduction">-${rupiah(d.iuran_bpjs_ketenagakerjaan || 0)}</td>
        <td>${rupiah(d.kerajinan || 0)}</td>
        <td>${rupiah(d.cuti || 0)}</td>
        <td>${rupiah(d.tunj_bpjs_pulsa || 0)}</td>
        <td class="total-bold">${rupiah(d.jumlah || 0)}</td>
        <td>${rupiah(d.um || 0)}</td>
        <td style="font-style:italic; color:var(--text-muted)">${d.keterangan || "-"}</td>
        <td class="total-bold" style="background:#f0f9ff">${rupiah(d.gaji_total || 0)}</td>        <td>${d.nohp || "-"}</td>
        <td>${statusBadge}</td>
        <td style="font-size:0.85rem;">${cancellationNoteDisplay}</td>
        <td class="text-center">${actionButtons}</td>
      `;
    } else {
      let tanggalMasukFormatted = d.awal_masuk ? new Date(d.awal_masuk).toISOString().split("T")[0] : "";
      tr.innerHTML = `
        <td><input type="checkbox" class="chk chk-slip" data-id="${d.id}" ${checked}>
        <td class="text-center">${start + i + 1}</td>
        <td>${d.no_induk || "-"}</td>
        <td style="font-weight:600">${d.nama || "-"}</td>
        <td>${tanggalMasukFormatted}</td>
        <td>${d.jabatan || "-"}</td>
        <td>${d.store_name || "-"}</td>
        <td class="money">${rupiah(d.gaji_pokok || 0)}</td>
        <td>${rupiah(d.bpjs_kesehatan || 0)}</td>
        <td>${rupiah(d.insentif || 0)}</td>
        <td class="total-bold">${rupiah(d.total_gaji || 0)}</td>
        <td style="font-style:italic; color:var(--text-muted)">${d.keterangan || "-"}</td>
        <td>${d.nohp || "-"}</td>
        <td>${statusBadge}</td>
        <td style="font-size:0.85rem;">${cancellationNoteDisplay}</td>
        <td class="text-center">${actionButtons}</td>
      `;
    }
    tbody.appendChild(tr);
  });

  attachIndividualCheckboxHandlers();
  setupSelectAllSlipListener();
  updateSelectAllSlipStatus();
  updateCancelSlipButtonVisibility();

  const pageInfo = document.getElementById("pageInfo");
  if (pageInfo) pageInfo.innerText = `Halaman ${currentPage} dari ${totalPages || 1}`;
}

function attachIndividualCheckboxHandlers() {
  document.querySelectorAll(".chk-slip").forEach((chk) => {
    // Hapus event listener lama dengan clone
    const newChk = chk.cloneNode(true);
    chk.parentNode.replaceChild(newChk, chk);

    if (!newChk.disabled) {
      newChk.onchange = (e) => {
        const id = parseInt(e.target.dataset.id);
        if (e.target.checked) {
          checkedSet.add(id);
        } else {
          checkedSet.delete(id);
        }
        updateSelectAllSlipStatus();
        updateCancelSlipButtonVisibility();
        console.log(`Checkbox ${id} changed, selected count: ${checkedSet.size}`);
      };
    }
  });
}

function setupSelectAllSlipListener() {
  const selectAllCheckbox = document.getElementById("selectAllSlip");
  if (!selectAllCheckbox) return;

  // Hapus event listener lama dengan clone
  const newSelectAll = selectAllCheckbox.cloneNode(true);
  selectAllCheckbox.parentNode.replaceChild(newSelectAll, selectAllCheckbox);

  newSelectAll.addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    const checkboxes = document.querySelectorAll(".chk-slip");

    checkboxes.forEach((chk) => {
      chk.checked = isChecked;
      const id = parseInt(chk.dataset.id);
      if (isChecked) {
        checkedSet.add(id);
      } else {
        checkedSet.delete(id);
      }
    });
    updateCancelSlipButtonVisibility();
    console.log(`Select All - checked: ${isChecked}, total selected: ${checkedSet.size}`);
  });
}

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

function updateCancelSlipButtonVisibility() {
  const selectedCancellable = Array.from(checkedSet).filter((id) => {
    const item = dataAll.find((d) => d.id === id);
    return item && item.status_slip === "terkirim";
  });

  const cancelButton = document.getElementById("cancelSendSelected");
  if (cancelButton) {
    cancelButton.style.display = selectedCancellable.length > 0 ? "inline-flex" : "none";
  }
}

async function cancelSelectedSlips() {
  const selectedCancellable = Array.from(checkedSet).filter((id) => {
    const item = dataAll.find((d) => d.id === id);
    return item && item.status_slip === "terkirim";
  });

  if (selectedCancellable.length === 0) {
    Swal.fire({
      title: "Peringatan",
      text: "Tidak ada slip terkirim yang dipilih untuk dibatalkan. Silakan pilih slip dengan status 'Terkirim'.",
      icon: "warning",
      confirmButtonText: "OK",
    });
    return;
  }

  const companyName = currentCompany === "hisana" ? "Hisana" : "Enakko";

  const result = await Swal.fire({
    title: "Konfirmasi Pembatalan Slip Gaji",
    html: `
      <div style="text-align: left;">
        <p>Anda akan membatalkan <strong>${selectedCancellable.length}</strong> slip gaji yang sudah terkirim untuk <strong>${companyName}</strong>.</p>
        <p style="margin-top: 10px; color: #dc2626;">
          <i class="fas fa-exclamation-triangle"></i> Tindakan ini akan:
        </p>
        <ul style="text-align: left; margin-top: 5px; color: #666;">
          <li>Mengubah status slip menjadi "Dibatalkan"</li>
          <li>Mengirim pesan notifikasi WhatsApp ke karyawan yang bersangkutan</li>
          <li>Slip dapat dikirim ulang setelah dibatalkan</li>
          <li>Mencatat waktu dan alasan pembatalan</li>
        </ul>
      </div>
    `,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#dc2626",
    confirmButtonText: "Ya, Batalkan!",
    cancelButtonText: "Batal",
    input: "textarea",
    inputPlaceholder: "Alasan pembatalan (opsional)...",
  });

  if (!result.isConfirmed) return;

  const cancellationNote = result.value || "Pembatalan oleh user";

  const btn = document.getElementById("cancelSendSelected");
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Membatalkan...';

  const progressContainer = document.getElementById("cancelSlipProgressContainer");
  const progressBar = document.getElementById("cancelSlipProgressBar");
  const progressStatus = document.getElementById("cancelSlipProgressStatus");

  if (progressContainer) progressContainer.style.display = "block";
  if (progressBar) progressBar.style.width = "0%";
  if (progressStatus) progressStatus.innerText = `Memulai pembatalan ${selectedCancellable.length} slip...`;

  try {
    const res = await fetch("/undo-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selected: selectedCancellable,
        company: currentCompany,
        cancellation_note: cancellationNote,
      }),
    });

    const data = await res.json();

    if (data.success) {
      await loadData();
      checkedSet.clear();
      const allCheckboxes = document.querySelectorAll(".chk-slip");
      allCheckboxes.forEach((chk) => {
        chk.checked = false;
      });
      const selectAllCheckbox = document.getElementById("selectAllSlip");
      if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
      }
      updateCancelSlipButtonVisibility();

      Swal.fire({
        title: "Berhasil!",
        html: `
          <div style="text-align: left;">
            <p><strong>Berhasil membatalkan ${selectedCancellable.length} slip gaji ${companyName}.</strong></p>
            ${data.successCount > 0 ? `<p style="margin-top: 10px; color: #16a34a;"><i class="fas fa-check-circle"></i> ${data.successCount} notifikasi berhasil terkirim</p>` : ""}
            ${data.failedCount > 0 ? `<p style="margin-top: 10px; color: #f59e0b;"><i class="fas fa-exclamation-triangle"></i> ${data.failedCount} notifikasi gagal terkirim</p>` : ""}
            <p style="margin-top: 10px; color: #2563eb;">
              <i class="fas fa-info-circle"></i> Status slip telah berhasil dibatalkan.
            </p>
          </div>
        `,
        icon: "success",
        confirmButtonText: "OK",
      });
    } else {
      Swal.fire("Gagal!", data.message || "Terjadi kesalahan saat membatalkan slip.", "error");
    }
  } catch (err) {
    console.error("Cancel slip error:", err);
    Swal.fire("Error", "Gagal membatalkan slip: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-ban"></i> Batalkan Kirim Terpilih';
    if (progressContainer) progressContainer.style.display = "none";
  }
}

const cancelSlipBtn = document.getElementById("cancelSendSelected");
if (cancelSlipBtn) {
  cancelSlipBtn.addEventListener("click", cancelSelectedSlips);
}

async function loadData() {
  try {
    const { month: currentMonth, year: currentYear } = getCurrentMonthYear();

    if (currentSlipMonth === "all") {
      currentSlipMonth = currentMonth;
      const monthSelect = document.getElementById("slipMonthSelect");
      if (monthSelect) monthSelect.value = currentMonth;
    }

    if (currentSlipYear === "all") {
      currentSlipYear = currentYear;
      const yearSelect = document.getElementById("slipYearSelect");
      if (yearSelect) yearSelect.value = currentYear;
    }

    console.log(`Loading slip data - Company: ${currentCompany}, Month filter: ${currentSlipMonth}, Year filter: ${currentSlipYear}`);

    let url = `/my-slip?company=${currentCompany}`;

    if (currentSlipMonth && currentSlipMonth !== "all") {
      url += `&month=${currentSlipMonth}`;
      console.log(`Adding month filter: ${currentSlipMonth}`);
    }

    if (currentSlipYear && currentSlipYear !== "all") {
      url += `&year=${currentSlipYear}`;
      console.log(`Adding year filter: ${currentSlipYear}`);
    }

    console.log(`Fetching URL: ${url}`);

    const res = await fetch(url);
    let data = await res.json();
    dataAll = data;

    console.log(`Loaded ${dataAll.length} records for ${currentCompany}`);

    renderTable();

    await loadAvailableSlipYears();

    setTimeout(() => {
      updateSelectAllSlipStatus();
    }, 100);
  } catch (err) {
    console.error("Load data error:", err);
    Swal.fire("Error", "Gagal memuat data: " + err.message, "error");
  }
}

function getCurrentMonthYear() {
  const now = new Date();
  return {
    month: (now.getMonth() + 1).toString(),
    year: now.getFullYear().toString(),
  };
}

// =============================
// GAJI CRUD OPERATIONS
// =============================
function openModal(item = null) {
  const modal = document.getElementById("dataModal");
  if (!modal) return;

  // Reset form terlebih dahulu
  const form = document.getElementById("dataForm");
  if (form) form.reset();
  document.getElementById("dataId").value = "";

  // Reset employee selection
  resetSlipEmployeeSelection();

  modal.style.display = "flex";
  renderFormFields();

  if (item) {
    document.getElementById("modalTitle").innerText = "Edit Data Slip";
    document.getElementById("dataId").value = item.id;

    // Set employee selection based on item
    const karyawanId = item.karyawan_id;
    const noInduk = item.no_induk;
    const nama = item.nama;
    const nohp = item.nohp;
    const jabatan = item.jabatan;
    const awalMasuk = item.awal_masuk;
    const storeName = item.store_name;

    // Select employee in dropdown (this will fill the hidden fields and search input)
    selectSlipEmployee(karyawanId, noInduk, nama, nohp, jabatan, awalMasuk, storeName);

    if (currentCompany === "hisana") {
      const fields = ["kerja", "keterangan"];
      fields.forEach((k) => {
        const el = document.getElementById(k);
        if (el) el.value = item[k] || "";
      });

      const currencyFields = ["gaji", "iuran_bpjs_ketenagakerjaan", "kerajinan", "cuti", "tunj_bpjs_pulsa", "um", "jumlah", "gaji_total"];
      currencyFields.forEach((k) => {
        const el = document.getElementById(k);
        if (el && item[k] !== undefined && item[k] !== null) {
          const value = parseFloat(item[k]);
          if (!isNaN(value) && value !== 0) {
            el.value = value.toLocaleString("id-ID");
          } else if (value === 0) {
            el.value = "";
          }
        }
      });

      // Set nohp field
      const nohpField = document.getElementById("nohp");
      if (nohpField && item.nohp) {
        nohpField.value = item.nohp;
      }

      calculatePayrollWithFormat();
    } else {
      const fields = ["keterangan"];
      fields.forEach((k) => {
        const el = document.getElementById(k);
        if (el) el.value = item[k] || "";
      });

      const currencyFields = ["gaji_pokok", "bpjs_kesehatan", "insentif", "total_gaji"];
      currencyFields.forEach((k) => {
        const el = document.getElementById(k);
        if (el && item[k] !== undefined && item[k] !== null) {
          const value = parseFloat(item[k]);
          if (!isNaN(value) && value !== 0) {
            el.value = value.toLocaleString("id-ID");
          } else if (value === 0) {
            el.value = "";
          }
        }
      });

      // Set nohp field
      const nohpField = document.getElementById("nohp");
      if (nohpField && item.nohp) {
        nohpField.value = item.nohp;
      }

      calculateEnakkoTotalWithFormat();
    }
  } else {
    document.getElementById("modalTitle").innerText = "Tambah Data Slip Baru";
    document.getElementById("dataForm").reset();
    document.getElementById("dataId").value = "";

    if (currentCompany === "hisana") {
      const currencyFields = ["gaji", "iuran_bpjs_ketenagakerjaan", "kerajinan", "cuti", "tunj_bpjs_pulsa", "um", "jumlah", "gaji_total"];
      currencyFields.forEach((k) => {
        const el = document.getElementById(k);
        if (el) el.value = "";
      });

      const numberFields = ["kerja"];
      numberFields.forEach((k) => {
        const el = document.getElementById(k);
        if (el) el.value = 0;
      });

      calculatePayrollWithFormat();
    } else {
      const currencyFields = ["gaji_pokok", "bpjs_kesehatan", "insentif", "total_gaji"];
      currencyFields.forEach((k) => {
        const el = document.getElementById(k);
        if (el) el.value = "";
      });

      calculateEnakkoTotalWithFormat();
    }
  }
}

window.openModalById = (id) => {
  console.log("Opening modal for ID:", id);
  const item = dataAll.find((d) => d.id == id);
  if (item) {
    // Load employee list before opening modal
    if (slipEmployeeList.length === 0) {
      loadSlipEmployeeList().then(() => {
        openModal(item);
      });
    } else {
      openModal(item);
    }
  } else {
    console.error("Item not found for ID:", id);
    Swal.fire("Error", "Data tidak ditemukan", "error");
  }
};

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
      // Refresh employee list if needed
      if (slipEmployeeList.length > 0) {
        await loadSlipEmployeeList();
      }
    } else {
      Swal.fire("Gagal!", resultData.message || "Data tidak ditemukan.", "error");
    }
  } catch (err) {
    console.error(err);
    Swal.fire("Error!", "Server error: " + err.message, "error");
  }
};

// =============================
// DATA FORM SUBMIT HANDLER
// =============================
document.getElementById("dataForm").onsubmit = async (e) => {
  e.preventDefault();

  const id = document.getElementById("dataId").value;

  // Ambil karyawan_id dari hidden field
  const selectedKaryawanId = document.getElementById("slip_karyawan_id")?.value || "";
  const selectedNohp = document.getElementById("nohp")?.value || "";

  let payload = {};

  if (currentCompany === "hisana") {
    // Validasi field wajib
    if (!selectedKaryawanId) {
      Swal.fire("Error", "Pilih karyawan terlebih dahulu", "error");
      return;
    }
    if (!selectedNohp) {
      Swal.fire("Error", "No HP wajib diisi", "error");
      return;
    }

    payload = {
      karyawan_id: parseInt(selectedKaryawanId),
      kerja: parseInt(document.getElementById("kerja")?.value) || 0,
      gaji: parseCurrency(document.getElementById("gaji")?.value),
      iuran_bpjs_ketenagakerjaan: parseCurrency(document.getElementById("iuran_bpjs_ketenagakerjaan")?.value),
      kerajinan: parseCurrency(document.getElementById("kerajinan")?.value),
      cuti: parseCurrency(document.getElementById("cuti")?.value),
      tunj_bpjs_pulsa: parseCurrency(document.getElementById("tunj_bpjs_pulsa")?.value),
      jumlah: parseCurrency(document.getElementById("jumlah")?.value),
      um: parseCurrency(document.getElementById("um")?.value),
      keterangan: document.getElementById("keterangan")?.value || "",
      gaji_total: parseCurrency(document.getElementById("gaji_total")?.value),
      nohp: selectedNohp,
    };
  } else {
    // Enakko
    if (!selectedKaryawanId) {
      Swal.fire("Error", "Pilih karyawan terlebih dahulu", "error");
      return;
    }
    if (!selectedNohp) {
      Swal.fire("Error", "No HP wajib diisi", "error");
      return;
    }

    payload = {
      karyawan_id: parseInt(selectedKaryawanId),
      gaji_pokok: parseCurrency(document.getElementById("gaji_pokok")?.value),
      bpjs_kesehatan: parseCurrency(document.getElementById("bpjs_kesehatan")?.value),
      insentif: parseCurrency(document.getElementById("insentif")?.value),
      total_gaji: parseCurrency(document.getElementById("total_gaji")?.value),
      keterangan: document.getElementById("keterangan")?.value || "",
      nohp: selectedNohp,
    };
  }

  const method = id ? "PUT" : "POST";
  const url = id ? `/slip/${id}?company=${currentCompany}` : `/slip?company=${currentCompany}`;

  console.log(`Sending ${method} request to ${url}`);
  console.log("Payload:", payload);

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await res.json();
    console.log("Response:", result);

    if (result.success) {
      closeGajiModal();
      await loadData();
      // Refresh employee list if needed
      if (slipEmployeeList.length > 0) {
        await loadSlipEmployeeList();
      }
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
// GAJI EVENT LISTENERS
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

// =============================
// GAJI - KIRIM SLIP WHATSAPP
// =============================
document.getElementById("sendSelected")?.addEventListener("click", async () => {
  const selected = Array.from(checkedSet);
  if (selected.length === 0) {
    Swal.fire({
      title: "Peringatan",
      text: "Tidak ada slip yang dipilih. Silakan pilih slip terlebih dahulu.",
      icon: "warning",
      confirmButtonText: "OK",
    });
    return;
  }

  const selectedData = dataAll.filter((d) => selected.includes(d.id) && d.status_slip !== "terkirim");

  if (selectedData.length === 0) {
    Swal.fire({
      title: "Peringatan",
      text: "Tidak ada slip yang dapat dikirim. Slip yang dipilih sudah terkirim semua.",
      icon: "warning",
      confirmButtonText: "OK",
    });
    return;
  }

  const result = await Swal.fire({
    title: "Konfirmasi",
    text: `Kirim slip ke ${selectedData.length} karyawan terpilih?`,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Ya, Kirim!",
  });

  if (result.isConfirmed) {
    try {
      const res = await fetch("/start-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selected: selectedData.map((d) => d.id),
          company: currentCompany,
        }),
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
          if (progressBar) progressBar.style.width = "0%";
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

// =============================
// KIRIM SECTION MENU HANDLERS
// =============================
function setupKirimSectionMenus() {
  // Tambah Data button
  const addDataBtnKirim = document.getElementById("addDataBtnKirim");
  if (addDataBtnKirim) {
    const newAddBtn = addDataBtnKirim.cloneNode(true);
    addDataBtnKirim.parentNode.replaceChild(newAddBtn, addDataBtnKirim);
    newAddBtn.addEventListener("click", () => {
      if (slipEmployeeList.length === 0) {
        loadSlipEmployeeList().then(() => {
          openModal();
        });
      } else {
        openModal();
      }
    });
  }

  // ============================================
  // EXPORT BUTTON WITH DROPDOWN
  // ============================================
  const exportBtnKirim = document.getElementById("exportBtnKirim");
  const exportDropdownMenu = document.getElementById("exportDropdownMenu");
  const exportMonthSelect = document.getElementById("exportMonthSelect");
  const exportYearSelect = document.getElementById("exportYearSelect");
  const doExportBtn = document.getElementById("doExportBtn");

  // Load available years for export dropdown
  async function loadExportYears() {
    try {
      const res = await fetch(`/slip-years?company=${currentCompany}`);
      const data = await res.json();

      if (data.success && exportYearSelect) {
        const currentValue = exportYearSelect.value;
        exportYearSelect.innerHTML = '<option value="all">Semua Tahun</option>';

        data.years.forEach((year) => {
          const option = document.createElement("option");
          option.value = year;
          option.textContent = year;
          exportYearSelect.appendChild(option);
        });

        if (currentValue && (currentValue === "all" || data.years.includes(parseInt(currentValue)))) {
          exportYearSelect.value = currentValue;
        } else {
          const currentYear = new Date().getFullYear();
          if (data.years.includes(currentYear)) {
            exportYearSelect.value = currentYear;
          }
        }
      }
    } catch (err) {
      console.error("Load export years error:", err);
    }
  }

  // Toggle dropdown menu
  if (exportBtnKirim && exportDropdownMenu) {
    const newExportBtn = exportBtnKirim.cloneNode(true);
    exportBtnKirim.parentNode.replaceChild(newExportBtn, exportBtnKirim);

    newExportBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      loadExportYears();

      if (exportDropdownMenu.style.display === "none" || exportDropdownMenu.style.display === "") {
        exportDropdownMenu.style.display = "block";
      } else {
        exportDropdownMenu.style.display = "none";
      }
    });

    document.addEventListener("click", (e) => {
      if (!newExportBtn.contains(e.target) && !exportDropdownMenu.contains(e.target)) {
        exportDropdownMenu.style.display = "none";
      }
    });
  }

  // Export function - FIXED: menggunakan blob response, bukan JSON
  if (doExportBtn) {
    const newDoExportBtn = doExportBtn.cloneNode(true);
    doExportBtn.parentNode.replaceChild(newDoExportBtn, doExportBtn);

    newDoExportBtn.addEventListener("click", async () => {
      const selectedMonth = exportMonthSelect ? exportMonthSelect.value : "all";
      const selectedYear = exportYearSelect ? exportYearSelect.value : "all";

      if (selectedMonth === "all" && selectedYear === "all") {
        const confirmResult = await Swal.fire({
          title: "Export Semua Data?",
          text: "Anda akan mengexport SEMUA data slip gaji. Lanjutkan?",
          icon: "question",
          showCancelButton: true,
          confirmButtonText: "Ya, Export Semua",
          cancelButtonText: "Batal",
        });

        if (!confirmResult.isConfirmed) {
          exportDropdownMenu.style.display = "none";
          return;
        }
      }

      Swal.fire({
        title: "Sedang mengexport...",
        text: "Mohon tunggu sebentar",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      try {
        let url = `/export-slip?company=${currentCompany}`;
        if (selectedMonth !== "all") url += `&month=${selectedMonth}`;
        if (selectedYear !== "all") url += `&year=${selectedYear}`;

        console.log(`Exporting with URL: ${url}`);

        const response = await fetch(url);

        // Cek apakah response error (tidak ada data) - response akan berupa JSON
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const result = await response.json();
          Swal.close();

          if (result.noData === true) {
            Swal.fire({
              title: "Maaf, Data Tidak Tersedia",
              html: `
              <div style="text-align: center; padding: 10px;">
                <i class="fas fa-folder-open" style="font-size: 64px; color: #f59e0b; margin-bottom: 15px; display: inline-block;"></i>
                <p style="font-size: 16px; color: #475569; margin-bottom: 10px;">${result.message}</p>
                <div style="background: #fef2e8; border-radius: 12px; padding: 12px; margin-top: 15px;">
                  <i class="fas fa-info-circle" style="color: #f59e0b; margin-right: 8px;"></i>
                  <span style="color: #64748b; font-size: 13px;">Silakan pilih periode lain atau tambahkan data terlebih dahulu.</span>
                </div>
              </div>
            `,
              icon: "info",
              confirmButtonText: "OK",
              confirmButtonColor: "#2563eb",
            });
            exportDropdownMenu.style.display = "none";
            return;
          } else {
            throw new Error(result.message || "Gagal export data");
          }
        }

        // Jika response ok dan berupa file (blob)
        if (response.ok) {
          const blob = await response.blob();
          const downloadUrl = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = downloadUrl;

          let filename = "";
          const contentDisposition = response.headers.get("Content-Disposition");
          if (contentDisposition) {
            const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (match && match[1]) {
              filename = match[1].replace(/['"]/g, "");
            }
          }

          if (!filename) {
            const companyName = currentCompany === "hisana" ? "Hisana" : "Enakko";
            const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
            filename = `Slip_Gaji_${companyName}`;
            if (selectedMonth !== "all") filename += `_${monthNames[parseInt(selectedMonth) - 1]}`;
            if (selectedYear !== "all") filename += `_${selectedYear}`;
            if (selectedMonth === "all" && selectedYear === "all") filename += `_Semua_Data`;
            filename += `.xlsx`;
          }

          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(downloadUrl);

          exportDropdownMenu.style.display = "none";
          Swal.close();
          Swal.fire({
            title: "Berhasil!",
            text: "Data slip gaji berhasil diexport",
            icon: "success",
            timer: 2000,
            showConfirmButton: false,
          });
        } else {
          throw new Error("Gagal export data");
        }
      } catch (err) {
        console.error("Export error:", err);
        Swal.close();
        Swal.fire({
          title: "Error",
          text: err.message || "Gagal export data",
          icon: "error",
        });
      }
    });
  }

  // =============================
  // DOWNLOAD TEMPLATE BUTTON
  // =============================
  const downloadTemplateBtnKirim = document.getElementById("downloadTemplateBtnKirim");
  if (downloadTemplateBtnKirim) {
    const newTemplateBtn = downloadTemplateBtnKirim.cloneNode(true);
    downloadTemplateBtnKirim.parentNode.replaceChild(newTemplateBtn, downloadTemplateBtnKirim);
    newTemplateBtn.addEventListener("click", async () => {
      try {
        Swal.fire({
          title: "Mengunduh template...",
          text: "Mohon tunggu sebentar",
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        const response = await fetch(`/download-template-slip?company=${currentCompany}`);

        Swal.close();

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "Gagal download template");
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;

        const filename = currentCompany === "hisana" ? "template_slip_gaji_hisana.xlsx" : "template_slip_gaji_enakko.xlsx";
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        Swal.fire({
          title: "Berhasil!",
          text: "Template slip gaji berhasil didownload",
          icon: "success",
          timer: 2000,
          showConfirmButton: false,
        });
      } catch (err) {
        console.error("Download template error:", err);
        Swal.fire("Error", err.message || "Gagal download template", "error");
      }
    });
  }

  // =============================
  // IMPORT EXCEL SLIP GAJI
  // =============================
  const uploadFormKirim = document.getElementById("uploadFormKirim");
  if (uploadFormKirim) {
    const newUploadForm = uploadFormKirim.cloneNode(true);
    uploadFormKirim.parentNode.replaceChild(newUploadForm, uploadFormKirim);

    // File input change handler
    const fileInputKirim = document.getElementById("fileInputKirim");
    const fileNameKirim = document.getElementById("fileNameKirim");
    if (fileInputKirim && fileNameKirim) {
      const newFileInput = fileInputKirim.cloneNode(true);
      fileInputKirim.parentNode.replaceChild(newFileInput, fileInputKirim);

      newFileInput.onchange = (e) => {
        if (e.target.files.length > 0) {
          fileNameKirim.textContent = e.target.files[0].name;
          fileNameKirim.style.color = "#2563eb";
        } else {
          fileNameKirim.textContent = "Tidak ada file dipilih";
          fileNameKirim.style.color = "#64748b";
        }
      };
    }

    newUploadForm.onsubmit = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const fileInput = document.getElementById("fileInputKirim");
      if (!fileInput.files || fileInput.files.length === 0) {
        Swal.fire("Error", "Silakan pilih file terlebih dahulu", "error");
        return;
      }

      const fileName = fileInput.files[0].name;
      const fileExt = fileName.split(".").pop().toLowerCase();
      if (!["xlsx", "xls"].includes(fileExt)) {
        Swal.fire("Error", "File harus berupa Excel (.xlsx atau .xls)", "error");
        return;
      }

      const formData = new FormData();
      formData.append("file", fileInput.files[0]);

      const statusEl = document.getElementById("uploadStatus");
      if (statusEl) {
        statusEl.innerText = "Sedang memproses...";
        statusEl.style.color = "#2563eb";
      }

      Swal.fire({
        title: "Sedang mengimport...",
        text: "Mohon tunggu sebentar",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      try {
        const res = await fetch(`/import-slip?company=${currentCompany}`, {
          method: "POST",
          body: formData,
        });

        const result = await res.json();
        console.log("Import result:", result);
        Swal.close();

        if (result.success) {
          let messageHtml = `
          <div style="text-align: left;">
            <div style="margin-top: 15px;">
              <div style="display: flex; justify-content: space-around; margin-bottom: 15px;">
                <div style="text-align: center;">
                  <div style="font-size: 0.8rem; color: #666;">BERHASIL</div>
                  <div style="font-size: 1.5rem; font-weight: bold; color: #16a34a;">${result.successCount || 0}</div>
                </div>
                <div style="text-align: center;">
                  <div style="font-size: 0.8rem; color: #666;">DILEWATI</div>
                  <div style="font-size: 1.5rem; font-weight: bold; color: #f59e0b;">${result.skippedCount || 0}</div>
                </div>
                <div style="text-align: center;">
                  <div style="font-size: 0.8rem; color: #666;">GAGAL</div>
                  <div style="font-size: 1.5rem; font-weight: bold; color: #dc2626;">${result.errorCount || 0}</div>
                </div>
              </div>
            </div>
        `;

          if (result.errors && result.errors.length > 0) {
            messageHtml += `
            <div style="margin-top: 15px; max-height: 200px; overflow-y: auto; background: #fef2e8; border-radius: 8px; padding: 10px;">
              <p style="font-weight: 600; margin-bottom: 8px;">Detail Error:</p>
              <ul style="margin: 0; padding-left: 20px; font-size: 0.8rem; color: #dc2626;">
                ${result.errors
                  .slice(0, 15)
                  .map((err) => `<li>${escapeHtml(err)}</li>`)
                  .join("")}
                ${result.errors.length > 15 ? `<li>... dan ${result.errors.length - 15} error lainnya</li>` : ""}
              </ul>
            </div>
          `;
          }

          messageHtml += `</div>`;

          Swal.fire({
            title: result.errorCount > 0 ? "Import Selesai dengan Peringatan" : "Import Berhasil!",
            html: messageHtml,
            icon: result.errorCount > 0 ? "warning" : "success",
            confirmButtonText: "OK",
            width: "500px",
          });

          await loadData();
          newUploadForm.reset();

          const fileNameSpan = document.getElementById("fileNameKirim");
          if (fileNameSpan) {
            fileNameSpan.textContent = "Tidak ada file dipilih";
            fileNameSpan.style.color = "#64748b";
          }
        } else {
          Swal.fire("Import Gagal", result.message || "Terjadi kesalahan saat import", "error");
        }
      } catch (err) {
        console.error("Import error:", err);
        Swal.close();
        Swal.fire("Import Gagal", "Terjadi kesalahan saat upload: " + err.message, "error");
      } finally {
        if (statusEl) {
          statusEl.innerText = "";
        }
      }
    };
  }

  // Duplicate Data button
  const duplicateDataBtnKirim = document.getElementById("duplicateDataBtnKirim");
  if (duplicateDataBtnKirim) {
    const newDuplicateBtn = duplicateDataBtnKirim.cloneNode(true);
    duplicateDataBtnKirim.parentNode.replaceChild(newDuplicateBtn, duplicateDataBtnKirim);
    newDuplicateBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      console.log("Duplicate button clicked from Kirim section!");
      await duplicatePreviousMonthData();
    });
  }

  // Cancel Duplicate button
  const cancelDuplicateBtnKirim = document.getElementById("cancelDuplicateBtnKirim");
  if (cancelDuplicateBtnKirim) {
    const newCancelBtn = cancelDuplicateBtnKirim.cloneNode(true);
    cancelDuplicateBtnKirim.parentNode.replaceChild(newCancelBtn, cancelDuplicateBtnKirim);
    newCancelBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      console.log("Cancel duplicate button clicked from Kirim section!");
      await cancelDuplicate();
    });
  }
}

// Override fungsi checkDuplicateStatus untuk update tombol di kedua section
async function checkDuplicateStatus() {
  try {
    const response = await fetch(`/check-duplicate-status?company=${currentCompany}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    // Update tombol di sectionData (jika ada)
    const duplicateBtnData = document.getElementById("duplicateDataBtn");
    const cancelBtnData = document.getElementById("cancelDuplicateBtn");

    // Update tombol di sectionKirim
    const duplicateBtnKirim = document.getElementById("duplicateDataBtnKirim");
    const cancelBtnKirim = document.getElementById("cancelDuplicateBtnKirim");

    if (data.hasRecentDuplicate) {
      // Sembunyikan tombol duplikasi, tampilkan tombol batal
      if (duplicateBtnData) duplicateBtnData.style.display = "none";
      if (cancelBtnData) cancelBtnData.style.display = "inline-block";
      if (duplicateBtnKirim) duplicateBtnKirim.style.display = "none";
      if (cancelBtnKirim) cancelBtnKirim.style.display = "inline-block";
    } else {
      // Tampilkan tombol duplikasi, sembunyikan tombol batal
      if (duplicateBtnData) duplicateBtnData.style.display = "inline-block";
      if (cancelBtnData) cancelBtnData.style.display = "none";
      if (duplicateBtnKirim) duplicateBtnKirim.style.display = "inline-block";
      if (cancelBtnKirim) cancelBtnKirim.style.display = "none";
    }
  } catch (err) {
    console.error("Check duplicate status error:", err);
  }
}

// =============================
// MODAL GAJI (DATA SLIP)
// =============================
function closeGajiModal() {
  const modal = document.getElementById("dataModal");
  if (modal) {
    modal.style.display = "none";
    // Reset form saat modal ditutup
    const form = document.getElementById("dataForm");
    if (form) form.reset();
    document.getElementById("dataId").value = "";
    // Reset employee selection
    resetSlipEmployeeSelection();
  }
}

function setupGajiModalButtons() {
  // Close button (X)
  const closeBtn = document.getElementById("closeModal");
  if (closeBtn) {
    // Hapus event listener lama
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeGajiModal();
    };
  }

  // Cancel button
  const cancelBtn = document.getElementById("cancelModalBtn");
  if (cancelBtn) {
    // Hapus event listener lama
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeGajiModal();
    };
  }
}

function initializeGajiModal() {
  setupGajiModalButtons();
}

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

  const checkboxes = document.querySelectorAll(".chk-slip");
  checkboxes.forEach((chk) => {
    chk.checked = false;
  });

  const selectAllSlip = document.getElementById("selectAllSlip");
  if (selectAllSlip) {
    selectAllSlip.checked = false;
    selectAllSlip.indeterminate = false;
  }

  renderTable();
  updateCancelSlipButtonVisibility();

  Swal.fire({
    title: "Berhasil!",
    text: "Semua pilihan checkbox slip gaji telah direset.",
    icon: "success",
    toast: true,
    timer: 2000,
    showConfirmButton: false,
  });
});

// =============================
// GAJI DUPLICATION FUNCTIONS
// =============================
async function duplicatePreviousMonthData() {
  console.log("duplicatePreviousMonthData called for company:", currentCompany);

  try {
    const result = await Swal.fire({
      title: "Duplikasi Data Bulan Lalu?",
      html: `
        <div style="text-align: left;">
          <p>Anda akan menduplikasi data slip gaji dari <strong>bulan sebelumnya</strong> untuk <strong>${currentCompany === "hisana" ? "Hisana" : "Enakko"}</strong>.</p>
          <p style="margin-top: 10px; color: #f59e0b;">
            <i class="fas fa-info-circle"></i> Hanya data karyawan yang belum memiliki data di bulan ini yang akan diduplikasi.
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
      text: "Mohon tunggu, sedang menduplikasi data",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    console.log(`Sending duplicate request to /duplicate-data?company=${currentCompany}`);

    const response = await fetch(`/duplicate-data?company=${currentCompany}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    console.log("Duplicate response:", data);
    Swal.close();

    if (response.ok && data.success) {
      Swal.fire({
        title: "Berhasil!",
        html: `
          <div style="background:#f0fdf4;border-radius:12px;padding:15px">
            <p>${data.message}</p>
            ${data.duplicatedCount ? `<p style="margin-top: 10px;"><strong>${data.duplicatedCount}</strong> data berhasil diduplikasi</p>` : ""}
            ${data.skippedCount ? `<p style="margin-top: 5px; color: #f59e0b;">${data.skippedCount} data dilewati (sudah ada)</p>` : ""}
          </div>
        `,
        icon: "success",
        confirmButtonText: "OK",
      });

      await loadData();

      const duplicateBtn = document.getElementById("duplicateDataBtn");
      const cancelBtn = document.getElementById("cancelDuplicateBtn");
      const duplicateBtnKirim = document.getElementById("duplicateDataBtnKirim");
      const cancelBtnKirim = document.getElementById("cancelDuplicateBtnKirim");

      if (duplicateBtn && cancelBtn) {
        duplicateBtn.style.display = "none";
        cancelBtn.style.display = "inline-block";
      }
      if (duplicateBtnKirim && cancelBtnKirim) {
        duplicateBtnKirim.style.display = "none";
        cancelBtnKirim.style.display = "inline-block";
      }
      startGajiDuplicateStatusCheck();
    } else {
      Swal.fire("Gagal!", data.message || "Terjadi kesalahan saat menduplikasi data", "error");
    }
  } catch (err) {
    console.error("Duplicate data error:", err);
    Swal.close();
    Swal.fire("Error!", err.message || "Terjadi kesalahan pada server", "error");
  }
}

async function cancelDuplicate() {
  try {
    const result = await Swal.fire({
      title: "Batalkan Duplikasi?",
      html: `<p>Data hasil duplikasi akan dihapus permanen!</p>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Ya, Batalkan",
      cancelButtonText: "Tidak",
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
      Swal.fire({ title: "Berhasil!", html: `<div style="background:#fef2e8;border-radius:12px;padding:15px"><p>${data.message}</p></div>`, icon: "success", confirmButtonText: "OK" });
      await loadData();

      const duplicateBtn = document.getElementById("duplicateDataBtn");
      const cancelBtn = document.getElementById("cancelDuplicateBtn");
      const duplicateBtnKirim = document.getElementById("duplicateDataBtnKirim");
      const cancelBtnKirim = document.getElementById("cancelDuplicateBtnKirim");

      if (duplicateBtn && cancelBtn) {
        duplicateBtn.style.display = "inline-block";
        cancelBtn.style.display = "none";
      }
      if (duplicateBtnKirim && cancelBtnKirim) {
        duplicateBtnKirim.style.display = "inline-block";
        cancelBtnKirim.style.display = "none";
      }
      stopGajiDuplicateStatusCheck();
    }
  } catch (err) {
    console.error("Cancel duplicate error:", err);
    Swal.fire("Error!", err.message, "error");
  }
}

function startGajiDuplicateStatusCheck() {
  if (gajiDuplicateCheckInterval) clearInterval(gajiDuplicateCheckInterval);
  gajiDuplicateCheckInterval = setInterval(() => checkDuplicateStatus(), 5000);
}

function stopGajiDuplicateStatusCheck() {
  if (gajiDuplicateCheckInterval) {
    clearInterval(gajiDuplicateCheckInterval);
    gajiDuplicateCheckInterval = null;
  }
}

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

function initializeBonusFilters() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  currentBonusMonth = currentMonth.toString();
  currentBonusYear = currentYear.toString();

  const monthSelect = document.getElementById("bonusMonthSelect");
  const yearSelect = document.getElementById("bonusYearSelect");

  if (monthSelect) {
    monthSelect.value = currentBonusMonth;
  }

  if (yearSelect) {
    window.pendingBonusYear = currentBonusYear;
  }

  console.log("Bonus filters initialized to current month:", currentMonth, "year:", currentYear);
}

async function loadBonusData() {
  try {
    console.log("Loading bonus data with filters - Month:", currentBonusMonth, "Year:", currentBonusYear);

    let url = `/bonus?company=${currentCompany}`;

    if (currentBonusMonth && currentBonusMonth !== "all") {
      url += `&month=${currentBonusMonth}`;
    }
    if (currentBonusYear && currentBonusYear !== "all") {
      url += `&year=${currentBonusYear}`;
    }

    console.log(`Fetching bonus URL: ${url}`);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    bonusData = await res.json();
    console.log("Bonus data loaded:", bonusData.length, "records");

    // Log sample data untuk debugging
    if (bonusData.length > 0) {
      console.log("Sample bonus data:", bonusData[0]);
    }

    // Reset selected set (hapus ID yang tidak ada di data baru)
    const validIds = new Set(bonusData.map((d) => d.id));
    for (const id of selectedBonusSet) {
      if (!validIds.has(id)) {
        selectedBonusSet.delete(id);
      }
    }

    renderBonusTable();
    await loadAvailableBonusYears();

    setTimeout(() => {
      checkBonusDuplicateStatus();
    }, 100);
  } catch (err) {
    console.error("Load bonus data error:", err);
    const tbody = document.querySelector("#tableBonus tbody");
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="12" style="text-align: center; padding: 40px;">
            <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 10px; display: block;"></i>
            <p style="color: #64748b;">Gagal memuat data bonus: ${err.message}</p>
            <button class="btn-primary" onclick="loadBonusData()" style="margin-top: 10px;">
              <i class="fas fa-sync-alt"></i> Coba Lagi
            </button>
          </td>
        </tr>
      `;
    }
  }
}

async function loadAvailableBonusYears() {
  try {
    console.log(`Loading available bonus years for company: ${currentCompany}`);
    const res = await fetch(`/bonus-years?company=${currentCompany}`);
    const data = await res.json();

    if (data.success) {
      const yearSelect = document.getElementById("bonusYearSelect");
      if (yearSelect) {
        const currentSelection = yearSelect.value;

        // Simpan nilai yang dipilih saat ini
        yearSelect.innerHTML = '<option value="all">Pilih Tahun</option>';

        data.years.forEach((year) => {
          const option = document.createElement("option");
          option.value = year;
          option.textContent = year;
          yearSelect.appendChild(option);
        });

        // Kembalikan pilihan sebelumnya jika masih valid
        if (currentSelection && (currentSelection === "all" || data.years.includes(parseInt(currentSelection)))) {
          yearSelect.value = currentSelection;
          currentBonusYear = currentSelection;
        } else if (currentBonusYear !== "all") {
          // Jika tahun yang dipilih sebelumnya tidak tersedia, set ke "all"
          yearSelect.value = "all";
          currentBonusYear = "all";
        }

        console.log(`Available bonus years loaded: ${data.years.join(", ")}`);
        console.log(`Current bonus year selection: ${yearSelect.value}`);
      }
    }
  } catch (err) {
    console.error("Load available bonus years error:", err);
  }
}

function setupBonusFilterListeners() {
  const monthSelect = document.getElementById("bonusMonthSelect");
  const yearSelect = document.getElementById("bonusYearSelect");

  if (monthSelect) {
    const newMonthSelect = monthSelect.cloneNode(true);
    monthSelect.parentNode.replaceChild(newMonthSelect, monthSelect);

    newMonthSelect.addEventListener("change", async (e) => {
      const selectedMonth = e.target.value;
      console.log(`Bonus month filter changed to: ${selectedMonth}`);

      currentBonusMonth = selectedMonth;
      currentBonusPage = 1;
      selectedBonusSet.clear();

      await loadBonusData();
    });
  }

  if (yearSelect) {
    const newYearSelect = yearSelect.cloneNode(true);
    yearSelect.parentNode.replaceChild(newYearSelect, yearSelect);

    newYearSelect.addEventListener("change", async (e) => {
      const selectedYear = e.target.value;
      console.log(`Bonus year filter changed to: ${selectedYear}`);

      currentBonusYear = selectedYear;
      currentBonusPage = 1;
      selectedBonusSet.clear();

      await loadBonusData();
    });
  }
}
// Panggil di inisialisasi
setupBonusFilterListeners();

function renderBonusTable() {
  const tbody = document.querySelector("#tableBonus tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const query = document.getElementById("searchBonusInput")?.value.toLowerCase() || "";
  const filtered = bonusData.filter((d) => d.nama?.toLowerCase().includes(query) || false || d.no_induk?.toLowerCase().includes(query) || false);

  const totalPages = Math.ceil(filtered.length / pageSizeBonus);
  if (currentBonusPage > totalPages && totalPages > 0) currentBonusPage = totalPages;
  if (currentBonusPage < 1) currentBonusPage = 1;

  const start = (currentBonusPage - 1) * pageSizeBonus;
  const pageData = filtered.slice(start, start + pageSizeBonus);

  const bulanNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  if (pageData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" style="text-align: center; padding: 40px;">
          <i class="fas fa-calendar-alt" style="font-size: 48px; color: #cbd5e1; margin-bottom: 10px; display: block;"></i>
          <p style="color: #64748b;">Belum ada data bonus</p>
          <button class="btn-primary" onclick="openBonusModal()" style="margin-top: 10px;">
            <i class="fas fa-plus"></i> Tambah Data Bonus
          </button>
        </td>
      </tr>
    `;
    const bonusPageInfo = document.getElementById("bonusPageInfo");
    if (bonusPageInfo) bonusPageInfo.innerText = `Halaman 0 dari 0`;

    const selectAllCheckbox = document.getElementById("selectAllBonus");
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }
    return;
  }

  pageData.forEach((d, i) => {
    const tr = document.createElement("tr");

    if (d.status === "terkirim") {
      tr.classList.add("status-sent");
    } else if (d.status === "dibatalkan") {
      tr.classList.add("status-cancelled");
    }

    let statusBadge = "";
    if (d.status === "terkirim") {
      statusBadge = '<span class="status-badge success"><i class="fas fa-check-circle"></i> Terkirim</span>';
    } else if (d.status === "dibatalkan") {
      statusBadge = '<span class="status-badge cancelled"><i class="fas fa-ban"></i> Dibatalkan</span>';
    } else {
      statusBadge = '<span class="status-badge pending"><i class="fas fa-clock"></i> Belum Dikirim</span>';
    }

    let cancellationNoteDisplay = "-";
    if (d.status === "dibatalkan" && d.cancellation_note) {
      cancellationNoteDisplay = `<span class="cancellation-note" title="${escapeHtml(d.cancellation_note)}">${escapeHtml(d.cancellation_note.length > 30 ? d.cancellation_note.substring(0, 30) + "..." : d.cancellation_note)}</span>`;
    } else if (d.status === "dibatalkan") {
      cancellationNoteDisplay = '<span class="cancellation-note" style="color: #f59e0b;"><i class="fas fa-info-circle"></i> Alasan tidak tersedia</span>';
    }

    const isChecked = selectedBonusSet.has(d.id) ? "checked" : "";

    // Tombol Edit dan Delete (hanya untuk status belum_dikirim)
    let actionButtons = "";
    if (d.status !== "terkirim" && d.status !== "dibatalkan") {
      actionButtons = `
        <button class="btn-primary" style="padding: 5px 10px; margin-right: 5px;" onclick='openBonusModalById(${d.id})' title="Edit">
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn-danger" style="padding: 5px 10px;" onclick='deleteBonus(${d.id})' title="Hapus">
          <i class="fas fa-trash"></i>
        </button>
      `;
    } else if (d.status === "terkirim") {
      actionButtons = '<span style="color: #64748b; font-size: 0.7rem;">Tidak dapat diedit</span>';
    } else {
      actionButtons = '<span style="color: #64748b; font-size: 0.7rem;">Dibatalkan</span>';
    }

    tr.innerHTML = `
      <td style="text-align: center;"><input type="checkbox" class="chk-bonus" data-id="${d.id}" ${isChecked}></td>
      <td style="text-align: center;">${start + i + 1}</td>
      <td style="font-weight: 500;">${escapeHtml(d.no_induk || "-")}</td>
      <td style="font-weight: 600;">${escapeHtml(d.nama || "-")}</td>
      <td style="text-align: center;">${bulanNames[d.bulan - 1] || "-"}</td>
      <td style="text-align: center;">${d.tahun || "-"}</td>
      <td class="money">${rupiah(d.jumlah_bonus || 0)}</td>
      <td>${escapeHtml(d.nohp || "-")}</td>
      <td>${statusBadge}</td>
      <td style="font-size:0.85rem;">${cancellationNoteDisplay}</td>
      <td style="font-size:0.8rem; text-align: center;">${d.created_at ? new Date(d.created_at).toLocaleDateString("id-ID") : "-"}</td>
      <td class="text-center" style="white-space: nowrap;">${actionButtons}</td>
    `;
    tbody.appendChild(tr);
  });

  // Attach individual checkbox handlers
  attachIndividualBonusCheckboxHandlers();

  // Setup select all checkbox
  setupSelectAllBonusListener();

  // Update select all status
  updateSelectAllBonusStatus();
  updateCancelBonusButtonVisibility();

  const bonusPageInfo = document.getElementById("bonusPageInfo");
  if (bonusPageInfo) {
    bonusPageInfo.innerText = `Halaman ${currentBonusPage} dari ${totalPages || 1}`;
  }
}

function attachIndividualBonusCheckboxHandlers() {
  document.querySelectorAll(".chk-bonus").forEach((chk) => {
    const newChk = chk.cloneNode(true);
    chk.parentNode.replaceChild(newChk, chk);

    newChk.onchange = (e) => {
      const id = parseInt(e.target.dataset.id);
      if (e.target.checked) {
        selectedBonusSet.add(id);
      } else {
        selectedBonusSet.delete(id);
      }
      updateSelectAllBonusStatus();
      updateCancelBonusButtonVisibility();
      console.log("Selected bonus count:", selectedBonusSet.size);
    };
  });
}

function setupSelectAllBonusListener() {
  const selectAllCheckbox = document.getElementById("selectAllBonus");
  if (!selectAllCheckbox) return;

  const newSelectAll = selectAllCheckbox.cloneNode(true);
  selectAllCheckbox.parentNode.replaceChild(newSelectAll, selectAllCheckbox);

  newSelectAll.addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    const checkboxes = document.querySelectorAll(".chk-bonus");

    checkboxes.forEach((chk) => {
      chk.checked = isChecked;
      const id = parseInt(chk.dataset.id);
      if (isChecked) {
        selectedBonusSet.add(id);
      } else {
        selectedBonusSet.delete(id);
      }
    });

    updateSelectAllBonusStatus();
    updateCancelBonusButtonVisibility();
    console.log("Select all bonus - checked:", isChecked, "Total selected:", selectedBonusSet.size);
  });
}

function updateSelectAllBonusStatus() {
  const selectAllCheckbox = document.getElementById("selectAllBonus");
  if (!selectAllCheckbox) return;

  const checkboxes = document.querySelectorAll(".chk-bonus:not(:disabled)");
  const checkedCheckboxes = document.querySelectorAll(".chk-bonus:checked:not(:disabled)");

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
// BONUS RESET CHECKBOX
// =============================
const resetBonusCheckbox = document.getElementById("resetBonusCheckbox");
if (resetBonusCheckbox) {
  const newResetBonusBtn = resetBonusCheckbox.cloneNode(true);
  resetBonusCheckbox.parentNode.replaceChild(newResetBonusBtn, resetBonusCheckbox);

  newResetBonusBtn.addEventListener("click", () => {
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

    const checkboxes = document.querySelectorAll(".chk-bonus");
    checkboxes.forEach((chk) => {
      chk.checked = false;
    });

    const selectAllBonus = document.getElementById("selectAllBonus");
    if (selectAllBonus) {
      selectAllBonus.checked = false;
      selectAllBonus.indeterminate = false;
    }

    updateCancelBonusButtonVisibility();

    Swal.fire({
      title: "Berhasil!",
      text: "Semua pilihan checkbox bonus telah direset.",
      icon: "success",
      toast: true,
      timer: 2000,
      showConfirmButton: false,
    });
  });
}

// =============================
// BONUS FILTER & PAGINATION
// =============================
const prevBonusPage = document.getElementById("prevBonusPage");
if (prevBonusPage) {
  const newPrevBonusBtn = prevBonusPage.cloneNode(true);
  prevBonusPage.parentNode.replaceChild(newPrevBonusBtn, prevBonusPage);

  newPrevBonusBtn.addEventListener("click", () => {
    if (currentBonusPage > 1) {
      currentBonusPage--;
      renderBonusTable();
    }
  });
}

const nextBonusPage = document.getElementById("nextBonusPage");
if (nextBonusPage) {
  const newNextBonusBtn = nextBonusPage.cloneNode(true);
  nextBonusPage.parentNode.replaceChild(newNextBonusBtn, nextBonusPage);

  newNextBonusBtn.addEventListener("click", () => {
    const query = document.getElementById("searchBonusInput")?.value.toLowerCase() || "";
    const filtered = bonusData.filter((d) => d.nama?.toLowerCase().includes(query) || d.no_induk?.toLowerCase().includes(query));
    if (currentBonusPage * pageSizeBonus < filtered.length) {
      currentBonusPage++;
      renderBonusTable();
    }
  });
}

const searchBonusInput = document.getElementById("searchBonusInput");
if (searchBonusInput) {
  const newSearchBonus = searchBonusInput.cloneNode(true);
  searchBonusInput.parentNode.replaceChild(newSearchBonus, searchBonusInput);

  newSearchBonus.addEventListener("input", () => {
    currentBonusPage = 1;
    renderBonusTable();
  });
}

function updateCancelBonusButtonVisibility() {
  const selectedCancellable = Array.from(selectedBonusSet).filter((id) => {
    const item = bonusData.find((d) => d.id === id);
    return item && item.status === "terkirim";
  });

  const cancelButton = document.getElementById("cancelSendBonusSelected");
  if (cancelButton) {
    cancelButton.style.display = selectedCancellable.length > 0 ? "inline-flex" : "none";
  }
}

// =============================
// BONUS MODAL FUNCTIONS
// =============================
function openBonusModal(item = null) {
  const modal = document.getElementById("bonusModal");
  if (!modal) return;

  // Reset form
  document.getElementById("bonusForm").reset();
  document.getElementById("bonus_id").value = "";
  resetEmployeeSelection();

  const bonusJumlahInput = document.getElementById("bonus_jumlah");
  if (bonusJumlahInput) {
    bonusJumlahInput.value = "";
  }

  if (item) {
    console.log("Editing bonus:", item);
    document.getElementById("bonus_id").value = item.id;

    // Pilih karyawan dari data yang ada
    selectEmployee(item.no_induk, item.nama, item.nohp);

    // Set periode
    const year = item.tahun;
    const month = String(item.bulan).padStart(2, "0");
    document.getElementById("bonus_periode").value = `${year}-${month}`;

    // Set jumlah bonus
    if (bonusJumlahInput && item.jumlah_bonus) {
      const formatted = item.jumlah_bonus.toLocaleString("id-ID");
      bonusJumlahInput.value = formatted;
    }
  } else {
    // Set default periode ke bulan saat ini
    const now = new Date();
    const defaultPeriode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    document.getElementById("bonus_periode").value = defaultPeriode;
  }

  modal.style.display = "flex";

  // Load employee list from data_karyawan API
  if (employeeList.length === 0) {
    loadEmployeeList().then(() => {
      // Re-render dropdown jika ada pencarian
      const searchInput = document.getElementById("employeeSearch");
      if (searchInput && searchInput.value) {
        renderEmployeeDropdown(searchInput.value.split(" - ")[0] || "");
      }
    });
  }
}

// Setup bonus form handler dengan format currency
const bonusFormElement = document.getElementById("bonusForm");
if (bonusFormElement) {
  const newBonusForm = bonusFormElement.cloneNode(true);
  bonusFormElement.parentNode.replaceChild(newBonusForm, bonusFormElement);

  // Setup currency input untuk bonus_jumlah
  const bonusJumlahInput = document.getElementById("bonus_jumlah");
  if (bonusJumlahInput) {
    // Hapus event listener lama
    const newBonusJumlahInput = bonusJumlahInput.cloneNode(true);
    bonusJumlahInput.parentNode.replaceChild(newBonusJumlahInput, bonusJumlahInput);

    // Tambahkan event listener untuk format currency
    newBonusJumlahInput.addEventListener("input", handleBonusJumlahInput);

    // Restrict input hanya angka
    newBonusJumlahInput.addEventListener("keypress", function (e) {
      const charCode = e.which ? e.which : e.keyCode;
      // Allow: backspace, delete, tab, escape, enter, arrow keys
      if (charCode === 8 || charCode === 9 || charCode === 13 || charCode === 27 || charCode === 37 || charCode === 38 || charCode === 39 || charCode === 40 || charCode === 46) {
        return;
      }
      // Allow only numbers
      if (charCode < 48 || charCode > 57) {
        e.preventDefault();
      }
    });

    // Handle paste event
    newBonusJumlahInput.addEventListener("paste", function (e) {
      e.preventDefault();
      let pasteData = (e.clipboardData || window.clipboardData).getData("text");
      let cleanData = pasteData.replace(/[^\d]/g, "");
      if (cleanData) {
        // Format the pasted number
        let formatted = "";
        let counter = 0;
        for (let i = cleanData.length - 1; i >= 0; i--) {
          counter++;
          formatted = cleanData[i] + formatted;
          if (counter % 3 === 0 && i !== 0) {
            formatted = "." + formatted;
          }
        }
        this.value = formatted;
      }
      // Trigger input event to ensure any additional formatting
      const event = new Event("input", { bubbles: true });
      this.dispatchEvent(event);
    });
  }

  newBonusForm.onsubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    console.log("📝 Bonus form submitted");

    const id = document.getElementById("bonus_id").value;
    const karyawanId = document.getElementById("bonus_karyawan_id")?.value.trim() || "";
    const noInduk = document.getElementById("bonus_no_induk")?.value.trim() || "";
    const nama = document.getElementById("bonus_nama")?.value.trim() || "";

    // Parse currency dengan benar
    const jumlahBonusInput = document.getElementById("bonus_jumlah")?.value || "0";
    const jumlahBonus = parseCurrency(jumlahBonusInput);
    const periode = document.getElementById("bonus_periode")?.value || "";
    const nohp = document.getElementById("bonus_nohp")?.value.trim() || "";

    console.log("Form values:", { id, karyawanId, noInduk, nama, jumlahBonus, periode, nohp });

    // VALIDASI
    if (!karyawanId) {
      Swal.fire("Error", "Pilih karyawan terlebih dahulu", "error");
      return;
    }
    if (!periode) {
      Swal.fire("Error", "Bulan dan Tahun harus diisi", "error");
      return;
    }
    if (!jumlahBonus || jumlahBonus <= 0) {
      Swal.fire("Error", "Jumlah Bonus harus lebih dari 0", "error");
      return;
    }

    const [year, month] = periode.split("-");

    const payload = {
      karyawan_id: parseInt(karyawanId),
      bulan: parseInt(month),
      tahun: parseInt(year),
      jumlah_bonus: jumlahBonus,
      nohp: nohp || "",
    };

    console.log("📤 Sending payload:", payload);

    const method = id ? "PUT" : "POST";
    const url = id ? `/bonus/${id}?company=${currentCompany}` : `/bonus?company=${currentCompany}`;

    try {
      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      console.log("Response:", result);

      if (result.success) {
        // Tutup modal
        const modal = document.getElementById("bonusModal");
        if (modal) modal.style.display = "none";

        // Reset form
        document.getElementById("bonusForm").reset();
        document.getElementById("bonus_id").value = "";
        document.getElementById("bonus_karyawan_id").value = "";
        document.getElementById("bonus_no_induk").value = "";
        document.getElementById("bonus_nama").value = "";
        resetEmployeeSelection();

        // Reload data
        await loadBonusData();

        Swal.fire({
          title: "Berhasil!",
          text: id ? "Bonus berhasil diperbarui." : "Bonus berhasil ditambahkan.",
          icon: "success",
          timer: 2000,
          showConfirmButton: false,
        });
      } else {
        Swal.fire("Gagal", result.message || "Tidak dapat menyimpan data.", "error");
      }
    } catch (err) {
      console.error("Submit error:", err);
      Swal.fire("Error", `Terjadi kesalahan: ${err.message}`, "error");
    }
  };
}

window.openBonusModalById = (id) => {
  console.log("Open bonus by ID:", id);
  const item = bonusData.find((d) => d.id == id);
  if (item) {
    openBonusModal(item);
  } else {
    console.error("Bonus not found:", id);
    Swal.fire("Error", "Data bonus tidak ditemukan", "error");
  }
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
      if (selectedBonusSet.has(id)) {
        selectedBonusSet.delete(id);
      }
      await loadBonusData();
    } else {
      Swal.fire("Gagal!", resultData.message || "Data tidak ditemukan.", "error");
    }
  } catch (err) {
    console.error(err);
    Swal.fire("Error!", "Server error: " + err.message, "error");
  }
};

const addBonusBtnElement = document.getElementById("addBonusBtn");
if (addBonusBtnElement) {
  const newAddBonusBtn = addBonusBtnElement.cloneNode(true);
  addBonusBtnElement.parentNode.replaceChild(newAddBonusBtn, addBonusBtnElement);

  newAddBonusBtn.addEventListener("click", () => {
    openBonusModal();
  });
}

const closeBonusModalBtn = document.getElementById("closeBonusModal");
if (closeBonusModalBtn) {
  const newCloseBonusBtn = closeBonusModalBtn.cloneNode(true);
  closeBonusModalBtn.parentNode.replaceChild(newCloseBonusBtn, closeBonusModalBtn);
  newCloseBonusBtn.addEventListener("click", () => {
    const modal = document.getElementById("bonusModal");
    if (modal) modal.style.display = "none";
  });
}

const cancelBonusFormBtn = document.getElementById("cancelBonusBtn");
if (cancelBonusFormBtn) {
  const newCancelBonusBtn = cancelBonusFormBtn.cloneNode(true);
  cancelBonusFormBtn.parentNode.replaceChild(newCancelBonusBtn, cancelBonusFormBtn);
  newCancelBonusBtn.addEventListener("click", () => {
    const modal = document.getElementById("bonusModal");
    if (modal) modal.style.display = "none";
  });
}

const sendBonusBtn = document.getElementById("sendBonusSelected");
if (sendBonusBtn) {
  const newSendBonusBtn = sendBonusBtn.cloneNode(true);
  sendBonusBtn.parentNode.replaceChild(newSendBonusBtn, sendBonusBtn);

  newSendBonusBtn.addEventListener("click", async () => {
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

    const selectedData = bonusData.filter((d) => selected.includes(d.id) && d.status !== "terkirim");

    if (selectedData.length === 0) {
      Swal.fire({
        title: "Peringatan",
        text: "Tidak ada bonus yang dapat dikirim. Bonus yang dipilih sudah terkirim semua.",
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

      const progressContainer = document.getElementById("bonusProgressContainer");
      const progressBar = document.getElementById("bonusProgressBar");
      const progressStatus = document.getElementById("bonusProgressStatus");

      if (progressContainer) progressContainer.style.display = "block";
      if (progressBar) progressBar.style.width = "0%";
      if (progressStatus) progressStatus.innerText = `Memulai pengiriman ${selectedData.length} bonus...`;

      try {
        const res = await fetch("/send-bonus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selected: selectedData.map((d) => d.id),
            company: currentCompany,
          }),
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
          startBonusProgressTracking();
        } else {
          Swal.fire("Error", data.message || "Gagal memulai pengiriman", "error");
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim Bonus Terpilih';
          if (progressContainer) progressContainer.style.display = "none";
        }
      } catch (err) {
        console.error("Send bonus error:", err);
        Swal.fire("Error", "Gagal memulai pengiriman: " + err.message, "error");
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim Bonus Terpilih';
        if (progressContainer) progressContainer.style.display = "none";
      }
    }
  });
}

const cancelBonusBtnElement = document.getElementById("cancelSendBonusSelected");
if (cancelBonusBtnElement) {
  const newCancelBonusBtn = cancelBonusBtnElement.cloneNode(true);
  cancelBonusBtnElement.parentNode.replaceChild(newCancelBonusBtn, cancelBonusBtnElement);
  newCancelBonusBtn.addEventListener("click", cancelSelectedBonuses);
}

async function cancelSelectedBonuses() {
  const selectedCancellable = Array.from(selectedBonusSet).filter((id) => {
    const item = bonusData.find((d) => d.id === id);
    return item && item.status === "terkirim";
  });

  if (selectedCancellable.length === 0) {
    Swal.fire({
      title: "Peringatan",
      text: "Tidak ada bonus terkirim yang dipilih untuk dibatalkan.",
      icon: "warning",
      confirmButtonText: "OK",
    });
    return;
  }

  const companyName = currentCompany === "hisana" ? "Hisana" : "Enakko";

  const result = await Swal.fire({
    title: "Konfirmasi Pembatalan Bonus",
    html: `
      <div style="text-align: left;">
        <p>Anda akan membatalkan <strong>${selectedCancellable.length}</strong> slip bonus yang sudah terkirim untuk <strong>${companyName}</strong>.</p>
        <p style="margin-top: 10px; color: #dc2626;">
          <i class="fas fa-exclamation-triangle"></i> Tindakan ini akan:
        </p>
        <ul style="text-align: left; margin-top: 5px; color: #666;">
          <li>Mengubah status bonus menjadi "Dibatalkan"</li>
          <li>Mengirim pesan notifikasi WhatsApp ke karyawan yang bersangkutan</li>
          <li>Bonus dapat dikirim ulang setelah dibatalkan</li>
        </ul>
      </div>
    `,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#dc2626",
    confirmButtonText: "Ya, Batalkan!",
    cancelButtonText: "Batal",
    input: "textarea",
    inputPlaceholder: "Alasan pembatalan (opsional)...",
  });

  if (!result.isConfirmed) return;

  const cancellationNote = result.value || "Pembatalan oleh user";

  const btn = document.getElementById("cancelSendBonusSelected");
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Membatalkan...';

  const progressContainer = document.getElementById("cancelBonusProgressContainer");
  const progressBar = document.getElementById("cancelBonusProgressBar");
  const progressStatus = document.getElementById("cancelBonusProgressStatus");

  if (progressContainer) progressContainer.style.display = "block";
  if (progressBar) progressBar.style.width = "0%";
  if (progressStatus) progressStatus.innerText = `Memulai pembatalan ${selectedCancellable.length} bonus...`;

  try {
    const res = await fetch("/cancel-bonus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selected: selectedCancellable,
        company: currentCompany,
        cancellation_note: cancellationNote,
      }),
    });

    const data = await res.json();

    if (data.success) {
      await loadBonusData();
      selectedBonusSet.clear();
      const allCheckboxes = document.querySelectorAll(".chk-bonus");
      allCheckboxes.forEach((chk) => {
        chk.checked = false;
      });
      const selectAllCheckbox = document.getElementById("selectAllBonus");
      if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
      }
      updateCancelBonusButtonVisibility();

      Swal.fire({
        title: "Berhasil!",
        html: `
          <div style="text-align: left;">
            <p><strong>Berhasil membatalkan ${selectedCancellable.length} bonus ${companyName}.</strong></p>
            ${data.messageSentCount > 0 ? `<p style="margin-top: 10px; color: #16a34a;"><i class="fas fa-check-circle"></i> ${data.messageSentCount} notifikasi berhasil terkirim</p>` : ""}
            ${data.messageFailedCount > 0 ? `<p style="margin-top: 10px; color: #f59e0b;"><i class="fas fa-exclamation-triangle"></i> ${data.messageFailedCount} notifikasi gagal terkirim</p>` : ""}
          </div>
        `,
        icon: "success",
        confirmButtonText: "OK",
      });
    } else {
      Swal.fire("Gagal!", data.message || "Terjadi kesalahan saat membatalkan bonus.", "error");
    }
  } catch (err) {
    console.error("Cancel bonus error:", err);
    Swal.fire("Error", "Gagal membatalkan bonus: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-ban"></i> Batalkan Kirim Terpilih';
    if (progressContainer) progressContainer.style.display = "none";
  }
}

function startBonusProgressTracking() {
  if (bonusProgressInterval) {
    clearInterval(bonusProgressInterval);
    bonusProgressInterval = null;
  }

  const progressBar = document.getElementById("bonusProgressBar");
  if (progressBar) {
    progressBar.style.width = "0%";
  }

  bonusProgressInterval = setInterval(async () => {
    try {
      const progressRes = await fetch("/bonus-progress");
      const progressData = await progressRes.json();
      bonusProgress = progressData;
      updateBonusProgressDisplay();
    } catch (err) {
      console.error("Gagal memantau progress bonus:", err);
    }
  }, 1500);
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

    if (!bonusProgress.running && bonusProgress.sent + bonusProgress.failed >= bonusProgress.total && bonusProgress.total > 0) {
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
          </div>
        `,
        icon: bonusProgress.failed > 0 ? "warning" : "success",
        confirmButtonText: "Selesai",
      }).then(async () => {
        resetBonusProgress();
        await loadBonusData();
        selectedBonusSet.clear();
        const allCheckboxes = document.querySelectorAll(".chk-bonus");
        allCheckboxes.forEach((chk) => {
          chk.checked = false;
        });
        const selectAllCheckbox = document.getElementById("selectAllBonus");
        if (selectAllCheckbox) {
          selectAllCheckbox.checked = false;
          selectAllCheckbox.indeterminate = false;
        }
        updateCancelBonusButtonVisibility();
      });

      if (bonusProgressInterval) {
        clearInterval(bonusProgressInterval);
        bonusProgressInterval = null;
      }
    }
  } else {
    progressContainer.style.display = "none";
  }
}

// =============================
// BONUS DUPLICATION FUNCTIONS - DIPERBAIKI SEPERTI GAJI
// =============================

function initializeBonusDuplicationButtons() {
  console.log("Initializing bonus duplication buttons for company:", currentCompany);

  // Tombol duplikasi bonus
  const duplicateBonusBtn = document.getElementById("duplicateBonusBtn");
  if (duplicateBonusBtn) {
    // Hapus semua event listener lama dengan clone
    const newDuplicateBonusBtn = duplicateBonusBtn.cloneNode(true);
    duplicateBonusBtn.parentNode.replaceChild(newDuplicateBonusBtn, duplicateBonusBtn);

    newDuplicateBonusBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("✅ Duplicate bonus button clicked for company:", currentCompany);
      await duplicatePreviousMonthBonus();
    });
    console.log("✅ Duplicate bonus button listener attached");
  } else {
    console.warn("⚠️ Duplicate bonus button not found in DOM");
  }

  // Tombol batal duplikasi bonus
  const cancelDuplicateBonusBtn = document.getElementById("cancelDuplicateBonusBtn");
  if (cancelDuplicateBonusBtn) {
    const newCancelDuplicateBonusBtn = cancelDuplicateBonusBtn.cloneNode(true);
    cancelDuplicateBonusBtn.parentNode.replaceChild(newCancelDuplicateBonusBtn, cancelDuplicateBonusBtn);

    newCancelDuplicateBonusBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("✅ Cancel duplicate bonus button clicked for company:", currentCompany);
      await cancelBonusDuplicate();
    });
    console.log("✅ Cancel duplicate bonus button listener attached");
  } else {
    console.warn("⚠️ Cancel duplicate bonus button not found in DOM");
  }
}

async function duplicatePreviousMonthBonus() {
  console.log("🚀 duplicatePreviousMonthBonus called for company:", currentCompany);

  try {
    // Get current date untuk menampilkan bulan sebelumnya
    const now = new Date();
    let previousMonth = now.getMonth() + 1; // 1-12
    let previousYear = now.getFullYear();
    let currentMonth = previousMonth;
    let currentYear = previousYear;

    // Hitung bulan sebelumnya
    if (previousMonth === 1) {
      previousMonth = 12;
      previousYear = previousYear - 1;
    } else {
      previousMonth = previousMonth - 1;
    }

    const bulanNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

    // Tampilkan konfirmasi seperti data slip gaji
    const result = await Swal.fire({
      title: "Duplikasi Data Bonus Bulan Lalu?",
      html: `
        <div style="text-align: left;">
          <p>Anda akan menduplikasi data bonus dari <strong>bulan sebelumnya</strong> untuk <strong>${currentCompany === "hisana" ? "Hisana" : "Enakko"}</strong>.</p>
          <p style="margin-top: 10px; color: #f59e0b;">
            <i class="fas fa-info-circle"></i> Hanya data karyawan yang belum memiliki data di bulan ini yang akan diduplikasi.
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
      text: "Mohon tunggu, sedang menduplikasi data bonus",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    console.log(`📡 Sending duplicate bonus request to /duplicate-bonus-data?company=${currentCompany}`);

    const response = await fetch(`/duplicate-bonus-data?company=${currentCompany}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    console.log("Duplicate bonus response:", data);
    Swal.close();

    if (response.ok && data.success) {
      let messageHtml = `
        <div style="background:#f0fdf4;border-radius:12px;padding:15px">
          <p>${data.message}</p>
      `;

      if (data.duplicatedCount) {
        messageHtml += `<p style="margin-top: 10px;"><strong>${data.duplicatedCount}</strong> data bonus berhasil diduplikasi</p>`;
      }

      if (data.skippedCount) {
        messageHtml += `<p style="margin-top: 5px; color: #f59e0b;">${data.skippedCount} data bonus dilewati (sudah ada di bulan ini)</p>`;
      }

      messageHtml += `</div>`;

      Swal.fire({
        title: "Berhasil!",
        html: messageHtml,
        icon: "success",
        confirmButtonText: "OK",
      });

      // Reload data bonus
      await loadBonusData();

      // Update tombol
      const duplicateBtn = document.getElementById("duplicateBonusBtn");
      const cancelBtn = document.getElementById("cancelDuplicateBonusBtn");
      if (duplicateBtn && cancelBtn) {
        if (data.duplicatedCount > 0) {
          duplicateBtn.style.display = "none";
          cancelBtn.style.display = "inline-block";
        } else {
          duplicateBtn.style.display = "inline-block";
          cancelBtn.style.display = "none";
        }
      }

      // Mulai cek status duplikasi
      startBonusDuplicateStatusCheck();
    } else {
      Swal.fire({
        title: "Gagal!",
        text: data.message || "Terjadi kesalahan saat menduplikasi data bonus",
        icon: "error",
        confirmButtonText: "OK",
      });
    }
  } catch (err) {
    console.error("❌ Duplicate bonus data error:", err);
    Swal.close();
    Swal.fire({
      title: "Error!",
      text: err.message || "Terjadi kesalahan pada server",
      icon: "error",
      confirmButtonText: "OK",
    });
  }
}

async function cancelBonusDuplicate() {
  console.log("🚀 cancelBonusDuplicate called for company:", currentCompany);

  try {
    // Tampilkan konfirmasi seperti data slip gaji
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

    Swal.fire({
      title: "Sedang Memproses...",
      text: "Mohon tunggu, sedang membatalkan duplikasi bonus",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    console.log(`📡 Sending cancel duplicate request to /cancel-duplicate-bonus?company=${currentCompany}`);

    const response = await fetch(`/cancel-duplicate-bonus?company=${currentCompany}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    console.log("Cancel duplicate bonus response:", data);
    Swal.close();

    if (response.ok && data.success) {
      Swal.fire({
        title: "Berhasil!",
        html: `<div style="background:#fef2e8;border-radius:12px;padding:15px"><p>${data.message}</p></div>`,
        icon: "success",
        confirmButtonText: "OK",
      });

      // Reload data bonus
      await loadBonusData();

      // Update tombol
      const duplicateBtn = document.getElementById("duplicateBonusBtn");
      const cancelBtn = document.getElementById("cancelDuplicateBonusBtn");
      if (duplicateBtn && cancelBtn) {
        duplicateBtn.style.display = "inline-block";
        cancelBtn.style.display = "none";
      }

      // Stop cek status duplikasi
      stopBonusDuplicateStatusCheck();
    } else {
      Swal.fire({
        title: "Gagal!",
        text: data.message || "Terjadi kesalahan saat membatalkan duplikasi bonus",
        icon: "error",
        confirmButtonText: "OK",
      });
    }
  } catch (err) {
    console.error("❌ Cancel bonus duplicate error:", err);
    Swal.close();
    Swal.fire({
      title: "Error!",
      text: err.message || "Terjadi kesalahan pada server",
      icon: "error",
      confirmButtonText: "OK",
    });
  }
}

async function checkBonusDuplicateStatus() {
  try {
    console.log("🔍 Checking bonus duplicate status for company:", currentCompany);
    const response = await fetch(`/check-bonus-duplicate-status?company=${currentCompany}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    console.log("Bonus duplicate status:", data);

    const duplicateBtn = document.getElementById("duplicateBonusBtn");
    const cancelBtn = document.getElementById("cancelDuplicateBonusBtn");

    if (duplicateBtn && cancelBtn) {
      if (data.hasRecentDuplicate) {
        duplicateBtn.style.display = "none";
        cancelBtn.style.display = "inline-block";
        console.log("✅ Bonus - Showing cancel button (has duplicate data)");
      } else {
        duplicateBtn.style.display = "inline-block";
        cancelBtn.style.display = "none";
        console.log("✅ Bonus - Showing duplicate button (no duplicate data)");
      }
    }
  } catch (err) {
    console.error("❌ Check bonus duplicate status error:", err);
  }
}

function startBonusDuplicateStatusCheck() {
  console.log("Starting bonus duplicate status check interval");
  if (bonusDuplicateCheckInterval) clearInterval(bonusDuplicateCheckInterval);
  bonusDuplicateCheckInterval = setInterval(() => checkBonusDuplicateStatus(), 5000);
}

function stopBonusDuplicateStatusCheck() {
  console.log("Stopping bonus duplicate status check interval");
  if (bonusDuplicateCheckInterval) {
    clearInterval(bonusDuplicateCheckInterval);
    bonusDuplicateCheckInterval = null;
  }
}

// =============================
// EMPLOYEE SEARCH DROPDOWN FOR BONUS
// =============================
async function loadEmployeeList() {
  try {
    console.log(`Loading employee list from data_karyawan for company: ${currentCompany}`);
    const res = await fetch(`/bonus-employees?company=${currentCompany}`);
    const data = await res.json();

    if (data.success && data.employees) {
      employeeList = data.employees;
      console.log(`Employee list loaded for ${currentCompany}:`, employeeList.length, "employees");
      return employeeList;
    } else {
      console.error("Failed to load employees:", data);
      employeeList = [];
      return [];
    }
  } catch (err) {
    console.error("Load employee list error:", err);
    employeeList = [];
    return [];
  }
}

function renderEmployeeDropdown(filterText = "") {
  const employeeListContainer = document.getElementById("employeeList");
  if (!employeeListContainer) return;

  console.log("Rendering employee dropdown with filter:", filterText);
  console.log("Employee list:", employeeList);

  const filtered = employeeList.filter((emp) => emp.no_induk.toLowerCase().includes(filterText.toLowerCase()) || emp.nama.toLowerCase().includes(filterText.toLowerCase()));

  if (filtered.length === 0) {
    employeeListContainer.innerHTML = '<div class="employee-empty">Tidak ada karyawan ditemukan</div>';
    return;
  }

  employeeListContainer.innerHTML = filtered
    .map(
      (emp) => `
    <div class="employee-item" 
         data-karyawan-id="${emp.karyawan_id}"
         data-no-induk="${escapeHtml(emp.no_induk)}" 
         data-nama="${escapeHtml(emp.nama)}" 
         data-nohp="${escapeHtml(emp.no_hp || "")}">
      <div class="employee-no-induk">${escapeHtml(emp.no_induk)}</div>
      <div class="employee-name">${escapeHtml(emp.nama)}</div>
      <div class="employee-detail" style="font-size: 11px; color: #666;">
        ${emp.no_hp ? escapeHtml(emp.no_hp) : "No HP tidak tersedia"}
      </div>
    </div>
  `,
    )
    .join("");

  // Attach click handlers
  document.querySelectorAll("#employeeList .employee-item").forEach((item) => {
    // Hapus event listener lama dengan clone
    const newItem = item.cloneNode(true);
    item.parentNode.replaceChild(newItem, item);

    newItem.addEventListener("click", () => {
      const karyawanId = newItem.dataset.karyawanId;
      const noInduk = newItem.dataset.noInduk;
      const nama = newItem.dataset.nama;
      const nohp = newItem.dataset.nohp;

      console.log("Employee selected:", { karyawanId, noInduk, nama, nohp });
      selectEmployee(karyawanId, noInduk, nama, nohp);
    });
  });
}

function selectEmployee(karyawanId, noInduk, nama, nohp) {
  console.log("🔵 selectEmployee called:", { karyawanId, noInduk, nama, nohp });

  selectedEmployee = {
    karyawan_id: karyawanId,
    no_induk: noInduk,
    nama: nama,
    nohp: nohp,
  };

  // Set hidden fields dengan pengecekan
  const karyawanIdInput = document.getElementById("bonus_karyawan_id");
  const noIndukInput = document.getElementById("bonus_no_induk");
  const namaInput = document.getElementById("bonus_nama");

  if (karyawanIdInput) karyawanIdInput.value = karyawanId || "";
  if (noIndukInput) noIndukInput.value = noInduk || "";
  if (namaInput) namaInput.value = nama || "";

  // Set search input display
  const searchInput = document.getElementById("employeeSearch");
  if (searchInput) {
    searchInput.value = `${noInduk || ""} - ${nama || ""}`;
  }

  // Set nohp field
  const nohpInput = document.getElementById("bonus_nohp");
  if (nohpInput) {
    if (nohp) {
      nohpInput.value = nohp;
    } else {
      nohpInput.value = "";
      nohpInput.placeholder = "No HP tidak tersedia, silakan isi manual";
      nohpInput.readOnly = false; // Biarkan user mengisi manual jika tidak ada
    }
  }

  // Close dropdown
  const dropdown = document.getElementById("employeeDropdown");
  if (dropdown) dropdown.style.display = "none";
}

function setupEmployeeSearch() {
  const searchInput = document.getElementById("employeeSearch");
  const dropdown = document.getElementById("employeeDropdown");
  const dropdownSearch = document.getElementById("dropdownSearch");

  if (!searchInput || !dropdown) return;

  // Hapus event listener lama
  const newSearchInput = searchInput.cloneNode(true);
  searchInput.parentNode.replaceChild(newSearchInput, searchInput);

  const newDropdown = dropdown.cloneNode(true);
  dropdown.parentNode.replaceChild(newDropdown, dropdown);

  newSearchInput.addEventListener("focus", async () => {
    if (employeeList.length === 0) {
      await loadEmployeeList();
    }
    renderEmployeeDropdown(newSearchInput.value.split(" - ")[0] || "");
    newDropdown.style.display = "block";
  });

  newSearchInput.addEventListener("input", (e) => {
    const value = e.target.value.split(" - ")[0] || e.target.value;
    renderEmployeeDropdown(value);
    newDropdown.style.display = "block";
  });

  document.addEventListener("click", (e) => {
    if (!newSearchInput.contains(e.target) && !newDropdown.contains(e.target)) {
      newDropdown.style.display = "none";
    }
  });

  const newDropdownSearch = document.getElementById("dropdownSearch");
  if (newDropdownSearch) {
    const newDropdownSearchInput = newDropdownSearch.cloneNode(true);
    newDropdownSearch.parentNode.replaceChild(newDropdownSearchInput, newDropdownSearch);

    newDropdownSearchInput.addEventListener("input", (e) => {
      renderEmployeeDropdown(e.target.value);
    });
    newDropdownSearchInput.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  newDropdown.addEventListener("click", (e) => {
    e.stopPropagation();
  });
}

function resetEmployeeSelection() {
  selectedEmployee = null;

  const searchInput = document.getElementById("employeeSearch");
  const karyawanIdInput = document.getElementById("bonus_karyawan_id");
  const noIndukInput = document.getElementById("bonus_no_induk");
  const namaInput = document.getElementById("bonus_nama");
  const nohpInput = document.getElementById("bonus_nohp");

  if (searchInput) searchInput.value = "";
  if (karyawanIdInput) karyawanIdInput.value = "";
  if (noIndukInput) noIndukInput.value = "";
  if (namaInput) namaInput.value = "";
  if (nohpInput) {
    nohpInput.value = "";
    nohpInput.placeholder = "Akan diisi otomatis dari data karyawan";
    nohpInput.readOnly = true;
  }
}

function openBonusModal(item = null) {
  const modal = document.getElementById("bonusModal");
  if (!modal) return;

  console.log("Opening bonus modal, item:", item);

  // Reset form
  const form = document.getElementById("bonusForm");
  if (form) form.reset();

  const bonusIdInput = document.getElementById("bonus_id");
  if (bonusIdInput) bonusIdInput.value = "";

  resetEmployeeSelection();

  const bonusJumlahInput = document.getElementById("bonus_jumlah");
  if (bonusJumlahInput) {
    bonusJumlahInput.value = "";
  }

  if (item) {
    console.log("Editing bonus:", item);
    const titleElement = document.getElementById("bonusModalTitle");
    if (titleElement) titleElement.innerHTML = '<i class="fas fa-edit"></i> Edit Bonus';

    if (bonusIdInput) bonusIdInput.value = item.id;

    // Pilih karyawan dari data yang ada
    selectEmployee(item.karyawan_id, item.no_induk, item.nama, item.nohp);

    // Set periode
    const year = item.tahun;
    const month = String(item.bulan).padStart(2, "0");
    const periodeInput = document.getElementById("bonus_periode");
    if (periodeInput) periodeInput.value = `${year}-${month}`;

    // Set jumlah bonus dengan format currency
    if (bonusJumlahInput && item.jumlah_bonus) {
      // Format dengan pemisah ribuan
      const formatted = item.jumlah_bonus.toLocaleString("id-ID").replace(/,/g, ".");
      bonusJumlahInput.value = formatted;
    }
  } else {
    const titleElement = document.getElementById("bonusModalTitle");
    if (titleElement) titleElement.innerHTML = '<i class="fas fa-plus"></i> Tambah Bonus Baru';

    // Set default periode ke bulan saat ini
    const now = new Date();
    const defaultPeriode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const periodeInput = document.getElementById("bonus_periode");
    if (periodeInput) periodeInput.value = defaultPeriode;
  }

  modal.style.display = "flex";

  // Load employee list from data_karyawan API
  if (employeeList.length === 0) {
    loadEmployeeList().then(() => {
      const searchInput = document.getElementById("employeeSearch");
      if (searchInput && searchInput.value) {
        renderEmployeeDropdown(searchInput.value.split(" - ")[0] || "");
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setupDashboardHandlers();
  setupDataKaryawanHandlers();

  setupKaryawanFormHandler();
  setupKaryawanModalButtons();
  setupImagePreview();
  setupKaryawanEventHandlers();

  setupLokasiFormHandler();
  setupLokasiModalButtons();
  setupLokasiEventHandlers();
  setupLokasiStoreHandlers();

  if (document.getElementById("sectionLokasiStore")?.classList.contains("active")) {
    setTimeout(initMainMap, 500);
  }

  initDataMasterDropdown();
  setupEmployeeSearch();
  initMobileMenu();
  setupKirimSectionMenus();
  initializeGajiModal();

  // Inisialisasi filter slip gaji
  const { month, year } = getCurrentMonthYear();
  currentSlipMonth = month;
  currentSlipYear = year;

  // Inisialisasi filter bonus
  currentBonusMonth = month;
  currentBonusYear = year;

  const slipMonthSelect = document.getElementById("slipMonthSelect");
  const slipYearSelect = document.getElementById("slipYearSelect");
  const bonusMonthSelect = document.getElementById("bonusMonthSelect");
  const bonusYearSelect = document.getElementById("bonusYearSelect");

  if (slipMonthSelect) slipMonthSelect.value = month;
  if (slipYearSelect) slipYearSelect.value = year;
  if (bonusMonthSelect) bonusMonthSelect.value = month;
  if (bonusYearSelect) bonusYearSelect.value = year;

  // Setup event listeners
  setupFilterListeners();
  setupBonusFilterListeners();
  initializeBonusDuplicationButtons();
  initializeThrDuplicationButtons();

  updateMonthYearDisplay();
  startSessionCheck();

  setTimeout(() => {
    checkDuplicateStatus();
    checkBonusDuplicateStatus();
    checkThrDuplicateStatus();
  }, 1000);
});

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
    console.log("Loading THR data - Company:", currentCompany, "Year filter:", currentThrYear);

    let url = `/thr?company=${currentCompany}`;

    // PERBAIKAN: Selalu kirim filter tahun, default ke tahun sekarang jika "all"
    let yearToSend = currentThrYear;
    if (!yearToSend || yearToSend === "all") {
      // Jika tidak ada filter atau "all", gunakan tahun sekarang
      yearToSend = new Date().getFullYear().toString();
      currentThrYear = yearToSend; // Update currentThrYear

      // Update dropdown select
      const yearSelect = document.getElementById("thrYearSelect");
      if (yearSelect && yearSelect.value !== yearToSend) {
        yearSelect.value = yearToSend;
      }
      console.log(`[loadThrData] No year filter, defaulting to current year: ${yearToSend}`);
    }

    url += `&year=${yearToSend}`;
    console.log(`Fetching THR URL: ${url}`);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    thrData = await res.json();
    console.log("THR data loaded:", thrData.length, "records for year:", yearToSend);

    // Reset selected set
    const validIds = new Set(thrData.map((d) => d.id));
    for (const id of selectedThrSet) {
      if (!validIds.has(id)) {
        selectedThrSet.delete(id);
      }
    }

    renderThrTable();
    await loadAvailableThrYears();

    setTimeout(() => {
      checkThrDuplicateStatus();
    }, 100);
  } catch (err) {
    console.error("Load THR data error:", err);
    const tbody = document.querySelector("#tableTHR tbody");
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="11" style="text-align: center; padding: 40px;">
            <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 10px; display: block;"></i>
            <p style="color: #64748b;">Gagal memuat data THR: ${err.message}</p>
            <button class="btn-primary" onclick="loadThrData()" style="margin-top: 10px;">
              <i class="fas fa-sync-alt"></i> Coba Lagi
            </button>
          </td>
        </tr>
      `;
    }
  }
}

function renderThrTable() {
  const tbody = document.querySelector("#tableTHR tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const query = document.getElementById("searchThrInput")?.value.toLowerCase() || "";
  const filtered = thrData.filter((d) => d.nama?.toLowerCase().includes(query) || false || d.no_induk?.toLowerCase().includes(query) || false);

  const totalPages = Math.ceil(filtered.length / pageSizeThr);
  if (currentThrPage > totalPages && totalPages > 0) currentThrPage = totalPages;
  if (currentThrPage < 1) currentThrPage = 1;

  const start = (currentThrPage - 1) * pageSizeThr;
  const pageData = filtered.slice(start, start + pageSizeThr);

  if (pageData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align: center; padding: 40px;">
          <i class="fas fa-calendar-alt" style="font-size: 48px; color: #cbd5e1; margin-bottom: 10px; display: block;"></i>
          <p style="color: #64748b;">${filtered.length === 0 && query ? "Tidak ada data yang sesuai dengan pencarian" : "Belum ada data THR"}</p>
          ${filtered.length === 0 && !query ? '<button class="btn-primary" onclick="openThrModal()" style="margin-top: 10px;"><i class="fas fa-plus"></i> Tambah Data THR</button>' : ""}
        </td>
      </tr>
    `;
    const thrPageInfo = document.getElementById("thrPageInfo");
    if (thrPageInfo) thrPageInfo.innerText = `Halaman 0 dari 0`;

    // Reset select all checkbox
    const selectAllCheckbox = document.getElementById("selectAllThr");
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }
    return;
  }

  pageData.forEach((d, i) => {
    const tr = document.createElement("tr");

    if (d.status === "terkirim") {
      tr.classList.add("status-sent");
    } else if (d.status === "dibatalkan") {
      tr.classList.add("status-cancelled");
    }

    let statusBadge = "";
    if (d.status === "terkirim") {
      statusBadge = '<span class="status-badge success"><i class="fas fa-check-circle"></i> Terkirim</span>';
    } else if (d.status === "dibatalkan") {
      statusBadge = '<span class="status-badge cancelled"><i class="fas fa-ban"></i> Dibatalkan</span>';
    } else {
      statusBadge = '<span class="status-badge pending"><i class="fas fa-clock"></i> Belum Dikirim</span>';
    }

    let cancellationNoteDisplay = "-";
    if (d.status === "dibatalkan" && d.cancellation_note) {
      cancellationNoteDisplay = `<span class="cancellation-note" title="${escapeHtml(d.cancellation_note)}">${escapeHtml(d.cancellation_note.length > 30 ? d.cancellation_note.substring(0, 30) + "..." : d.cancellation_note)}</span>`;
    }

    const isChecked = selectedThrSet.has(d.id) ? "checked" : "";

    let actionButtons = "";
    if (d.status !== "terkirim" && d.status !== "dibatalkan") {
      actionButtons = `
        <button class="btn-primary" style="padding:5px 10px; margin-right: 5px;" onclick='openThrModalById(${d.id})' title="Edit">
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn-danger" style="padding:5px 10px;" onclick='deleteThr(${d.id})' title="Hapus">
          <i class="fas fa-trash"></i>
        </button>
      `;
    } else if (d.status === "terkirim") {
      actionButtons = '<span style="color: #64748b; font-size: 0.7rem;">Tidak dapat diedit</span>';
    } else {
      actionButtons = '<span style="color: #64748b; font-size: 0.7rem;">Dibatalkan</span>';
    }

    tr.innerHTML = `
      <td style="text-align: center;"><input type="checkbox" class="chk-thr" data-id="${d.id}" ${isChecked} ${d.status === "terkirim" ? "" : ""}></td>
      <td style="text-align: center;">${start + i + 1}</td>
      <td style="font-weight: 500;">${escapeHtml(d.no_induk || "-")}</td>
      <td style="font-weight: 600;">${escapeHtml(d.nama || "-")}</td>
      <td style="text-align: center;">${d.tahun || "-"}</td>
      <td class="money">${rupiah(d.jumlah_thr || 0)}</td>
      <td>${escapeHtml(d.nohp || "-")}</td>
      <td>${statusBadge}</td>
      <td style="font-size:0.85rem;">${cancellationNoteDisplay}</td>
      <td style="font-size:0.8rem; text-align: center;">${d.created_at ? new Date(d.created_at).toLocaleDateString("id-ID") : "-"}</td>
      <td class="text-center" style="white-space: nowrap;">${actionButtons}</td>
    `;
    tbody.appendChild(tr);
  });

  // Attach individual checkbox handlers
  attachIndividualThrCheckboxHandlers();

  // Setup select all checkbox
  setupSelectAllThrListener();

  // Update select all status
  updateSelectAllThrStatus();
  updateCancelThrButtonVisibility();

  const thrPageInfo = document.getElementById("thrPageInfo");
  if (thrPageInfo) {
    thrPageInfo.innerText = `Halaman ${currentThrPage} dari ${totalPages || 1}`;
  }
}

function attachIndividualThrCheckboxHandlers() {
  document.querySelectorAll(".chk-thr").forEach((chk) => {
    const newChk = chk.cloneNode(true);
    chk.parentNode.replaceChild(newChk, chk);

    newChk.onchange = (e) => {
      const id = parseInt(e.target.dataset.id);
      if (e.target.checked) {
        selectedThrSet.add(id);
      } else {
        selectedThrSet.delete(id);
      }
      updateSelectAllThrStatus();
      updateCancelThrButtonVisibility();
      console.log(`Checkbox THR ${id} changed, selected count: ${selectedThrSet.size}`);
    };
  });
}

function setupSelectAllThrListener() {
  const selectAllCheckbox = document.getElementById("selectAllThr");
  if (!selectAllCheckbox) return;

  // Hapus event listener lama dengan clone
  const newSelectAll = selectAllCheckbox.cloneNode(true);
  selectAllCheckbox.parentNode.replaceChild(newSelectAll, selectAllCheckbox);

  newSelectAll.addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    const checkboxes = document.querySelectorAll(".chk-thr");

    checkboxes.forEach((chk) => {
      chk.checked = isChecked;
      const id = parseInt(chk.dataset.id);
      if (isChecked) {
        selectedThrSet.add(id);
      } else {
        selectedThrSet.delete(id);
      }
    });

    updateCancelThrButtonVisibility();
    console.log(`Select All THR - checked: ${isChecked}, total selected: ${selectedThrSet.size}`);
  });
}

function updateSelectAllThrStatus() {
  const selectAllCheckbox = document.getElementById("selectAllThr");
  if (!selectAllCheckbox) return;

  const checkboxes = document.querySelectorAll(".chk-thr:not(:disabled)");
  const checkedCheckboxes = document.querySelectorAll(".chk-thr:checked:not(:disabled)");

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

function updateCancelThrButtonVisibility() {
  const selectedCancellable = Array.from(selectedThrSet).filter((id) => {
    const item = thrData.find((d) => d.id === id);
    return item && item.status === "terkirim";
  });

  const cancelButton = document.getElementById("cancelSendThrSelected");
  if (cancelButton) {
    cancelButton.style.display = selectedCancellable.length > 0 ? "inline-flex" : "none";
  }
}

function resetThrCheckboxSelection() {
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

  const checkboxes = document.querySelectorAll(".chk-thr");
  checkboxes.forEach((chk) => {
    chk.checked = false;
  });

  const selectAllCheckbox = document.getElementById("selectAllThr");
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  }

  updateCancelThrButtonVisibility();

  Swal.fire({
    title: "Berhasil!",
    text: "Semua pilihan checkbox THR telah direset.",
    icon: "success",
    toast: true,
    timer: 2000,
    showConfirmButton: false,
  });
}

// =============================
// THR MODAL FUNCTIONS
// =============================
function openThrModal(item = null) {
  const modal = document.getElementById("thrModal");
  if (!modal) return;

  console.log("Opening THR modal, item:", item);

  const form = document.getElementById("thrForm");
  if (form) form.reset();

  const thrIdInput = document.getElementById("thr_id");
  if (thrIdInput) thrIdInput.value = "";

  resetThrEmployeeSelection();

  const thrJumlahInput = document.getElementById("thr_jumlah_thr");
  if (thrJumlahInput) {
    thrJumlahInput.value = "";
  }

  const nohpInput = document.getElementById("thr_nohp");
  if (nohpInput) {
    nohpInput.placeholder = "Akan diisi otomatis dari data karyawan";
    nohpInput.value = "";
    nohpInput.readOnly = true;
  }

  if (item) {
    console.log("Editing THR:", item);
    const titleElement = document.getElementById("thrModalTitle");
    if (titleElement) titleElement.innerHTML = '<i class="fas fa-edit"></i> Edit THR';

    if (thrIdInput) thrIdInput.value = item.id;

    selectThrEmployee(item.karyawan_id, item.no_induk, item.nama, item.nohp);

    const tahunInput = document.getElementById("thr_tahun");
    if (tahunInput) tahunInput.value = item.tahun;

    if (thrJumlahInput && item.jumlah_thr) {
      const formatted = item.jumlah_thr.toLocaleString("id-ID").replace(/,/g, ".");
      thrJumlahInput.value = formatted;
    }
  } else {
    const titleElement = document.getElementById("thrModalTitle");
    if (titleElement) titleElement.innerHTML = '<i class="fas fa-plus"></i> Tambah THR Baru';

    // Set default tahun ke tahun yang sedang difilter
    let defaultYear = new Date().getFullYear();
    if (currentThrYear && currentThrYear !== "all") {
      defaultYear = parseInt(currentThrYear);
    }
    const tahunInput = document.getElementById("thr_tahun");
    if (tahunInput) tahunInput.value = defaultYear;
  }

  modal.style.display = "flex";

  if (thrEmployeeList.length === 0) {
    loadThrEmployeeList().then(() => {
      const searchInput = document.getElementById("thrEmployeeSearch");
      if (searchInput && searchInput.value) {
        renderThrEmployeeDropdown(searchInput.value.split(" - ")[0] || "");
      }
    });
  }
}

window.openThrModalById = (id) => {
  console.log("Open THR by ID:", id);
  const item = thrData.find((d) => d.id == id);
  if (item) {
    openThrModal(item);
  } else {
    console.error("THR not found:", id);
    Swal.fire("Error", "Data THR tidak ditemukan", "error");
  }
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
      if (selectedThrSet.has(id)) {
        selectedThrSet.delete(id);
      }
      // Reload data dengan filter yang SAMA
      await loadThrData();
    } else {
      Swal.fire("Gagal!", resultData.message || "Data tidak ditemukan.", "error");
    }
  } catch (err) {
    console.error(err);
    Swal.fire("Error!", "Server error: " + err.message, "error");
  }
};

// =============================
// THR FORM HANDLER
// =============================
const thrFormElement = document.getElementById("thrForm");
if (thrFormElement) {
  const newThrForm = thrFormElement.cloneNode(true);
  thrFormElement.parentNode.replaceChild(newThrForm, thrFormElement);

  // Setup currency input
  const thrJumlahInput = document.getElementById("thr_jumlah_thr");
  if (thrJumlahInput) {
    const newThrJumlahInput = thrJumlahInput.cloneNode(true);
    thrJumlahInput.parentNode.replaceChild(newThrJumlahInput, thrJumlahInput);

    newThrJumlahInput.addEventListener("input", handleThrJumlahInput);

    newThrJumlahInput.addEventListener("keypress", function (e) {
      const charCode = e.which ? e.which : e.keyCode;
      if (charCode === 8 || charCode === 9 || charCode === 13 || charCode === 27 || charCode === 37 || charCode === 38 || charCode === 39 || charCode === 40 || charCode === 46) {
        return;
      }
      if (charCode < 48 || charCode > 57) {
        e.preventDefault();
      }
    });

    newThrJumlahInput.addEventListener("paste", function (e) {
      e.preventDefault();
      let pasteData = (e.clipboardData || window.clipboardData).getData("text");
      let cleanData = pasteData.replace(/[^\d]/g, "");
      if (cleanData) {
        let formatted = "";
        let counter = 0;
        for (let i = cleanData.length - 1; i >= 0; i--) {
          counter++;
          formatted = cleanData[i] + formatted;
          if (counter % 3 === 0 && i !== 0) {
            formatted = "." + formatted;
          }
        }
        this.value = formatted;
      }
      const event = new Event("input", { bubbles: true });
      this.dispatchEvent(event);
    });
  }

  newThrForm.onsubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    console.log("📝 THR form submitted");

    const id = document.getElementById("thr_id").value;
    const karyawanId = document.getElementById("thr_karyawan_id")?.value.trim() || "";
    const tahun = document.getElementById("thr_tahun")?.value.trim() || "";
    const jumlahThrInput = document.getElementById("thr_jumlah_thr")?.value || "0";
    const jumlahThr = parseCurrency(jumlahThrInput);
    const nohp = document.getElementById("thr_nohp")?.value.trim() || "";

    console.log("Form values:", { id, karyawanId, tahun, jumlahThr, nohp });

    if (!karyawanId) {
      Swal.fire("Error", "Pilih karyawan terlebih dahulu", "error");
      return;
    }
    if (!tahun) {
      Swal.fire("Error", "Tahun harus diisi", "error");
      return;
    }
    if (!jumlahThr || jumlahThr <= 0) {
      Swal.fire("Error", "Jumlah THR harus lebih dari 0", "error");
      return;
    }

    // Validasi: Pastikan tahun yang dipilih sesuai dengan filter tahun yang aktif
    if (currentThrYear && currentThrYear !== "all" && parseInt(tahun) !== parseInt(currentThrYear)) {
      const confirmResult = await Swal.fire({
        title: "Perhatian!",
        text: `Anda akan menambahkan data untuk tahun ${tahun}, tetapi filter saat ini menampilkan tahun ${currentThrYear}. Data akan tetap tersimpan, tetapi tidak akan tampil di halaman ini sampai filter diubah. Lanjutkan?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Ya, Lanjutkan",
        cancelButtonText: "Batal",
      });

      if (!confirmResult.isConfirmed) {
        return;
      }
    }

    const payload = {
      karyawan_id: parseInt(karyawanId),
      tahun: parseInt(tahun),
      jumlah_thr: jumlahThr,
      nohp: nohp || "",
    };

    console.log("📤 Sending payload:", payload);

    const method = id ? "PUT" : "POST";
    const url = id ? `/thr/${id}?company=${currentCompany}` : `/thr?company=${currentCompany}`;

    try {
      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      console.log("Response:", result);

      if (result.success) {
        const modal = document.getElementById("thrModal");
        if (modal) modal.style.display = "none";

        newThrForm.reset();
        document.getElementById("thr_id").value = "";
        document.getElementById("thr_karyawan_id").value = "";
        resetThrEmployeeSelection();

        // Reload data dengan filter tahun yang SAMA
        await loadThrData();

        Swal.fire({
          title: "Berhasil!",
          text: id ? "THR berhasil diperbarui." : "THR berhasil ditambahkan.",
          icon: "success",
          timer: 2000,
          showConfirmButton: false,
        });
      } else {
        Swal.fire("Gagal", result.message || "Tidak dapat menyimpan data.", "error");
      }
    } catch (err) {
      console.error("Submit error:", err);
      Swal.fire("Error", `Terjadi kesalahan: ${err.message}`, "error");
    }
  };
}

const sendThrBtn = document.getElementById("sendThrSelected");
if (sendThrBtn) {
  const newSendThrBtn = sendThrBtn.cloneNode(true);
  sendThrBtn.parentNode.replaceChild(newSendThrBtn, sendThrBtn);

  newSendThrBtn.addEventListener("click", async () => {
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
        text: "Tidak ada THR yang dapat dikirim. THR yang dipilih sudah terkirim semua.",
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

      const progressContainer = document.getElementById("thrProgressContainer");
      const progressBar = document.getElementById("thrProgressBar");
      const progressStatus = document.getElementById("thrProgressStatus");

      if (progressContainer) progressContainer.style.display = "block";
      if (progressBar) progressBar.style.width = "0%";
      if (progressStatus) progressStatus.innerText = `Memulai pengiriman ${selectedData.length} THR...`;

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
          startThrProgressTracking();
        } else {
          Swal.fire("Error", data.message || "Gagal memulai pengiriman", "error");
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim THR Terpilih';
          if (progressContainer) progressContainer.style.display = "none";
        }
      } catch (err) {
        console.error("Send THR error:", err);
        Swal.fire("Error", "Gagal memulai pengiriman: " + err.message, "error");
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim THR Terpilih';
        if (progressContainer) progressContainer.style.display = "none";
      }
    }
  });
}

const cancelThrBtn = document.getElementById("cancelSendThrSelected");
if (cancelThrBtn) {
  const newCancelThrBtn = cancelThrBtn.cloneNode(true);
  cancelThrBtn.parentNode.replaceChild(newCancelThrBtn, cancelThrBtn);
  newCancelThrBtn.addEventListener("click", cancelSelectedThr);
}

async function cancelSelectedThr() {
  const selectedCancellable = Array.from(selectedThrSet).filter((id) => {
    const item = thrData.find((d) => d.id === id);
    return item && item.status === "terkirim";
  });

  if (selectedCancellable.length === 0) {
    Swal.fire({
      title: "Peringatan",
      text: "Tidak ada THR terkirim yang dipilih untuk dibatalkan.",
      icon: "warning",
      confirmButtonText: "OK",
    });
    return;
  }

  const companyName = currentCompany === "hisana" ? "Hisana" : "Enakko";

  const result = await Swal.fire({
    title: "Konfirmasi Pembatalan THR",
    html: `
      <div style="text-align: left;">
        <p>Anda akan membatalkan <strong>${selectedCancellable.length}</strong> THR yang sudah terkirim untuk <strong>${companyName}</strong>.</p>
        <p style="margin-top: 10px; color: #dc2626;">
          <i class="fas fa-exclamation-triangle"></i> Tindakan ini akan:
        </p>
        <ul style="text-align: left; margin-top: 5px; color: #666;">
          <li>Mengubah status THR menjadi "Dibatalkan"</li>
          <li>Mengirim pesan notifikasi WhatsApp ke karyawan yang bersangkutan</li>
          <li>THR dapat dikirim ulang setelah dibatalkan</li>
        </ul>
      </div>
    `,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#dc2626",
    confirmButtonText: "Ya, Batalkan!",
    cancelButtonText: "Batal",
    input: "textarea",
    inputPlaceholder: "Alasan pembatalan (opsional)...",
  });

  if (!result.isConfirmed) return;

  const cancellationNote = result.value || "Pembatalan oleh user";

  const btn = document.getElementById("cancelSendThrSelected");
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Membatalkan...';

  const progressContainer = document.getElementById("cancelThrProgressContainer");
  const progressBar = document.getElementById("cancelThrProgressBar");
  const progressStatus = document.getElementById("cancelThrProgressStatus");

  if (progressContainer) progressContainer.style.display = "block";
  if (progressBar) progressBar.style.width = "0%";
  if (progressStatus) progressStatus.innerText = `Memulai pembatalan ${selectedCancellable.length} THR...`;

  try {
    const res = await fetch("/cancel-thr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selected: selectedCancellable,
        company: currentCompany,
        cancellation_note: cancellationNote,
      }),
    });

    const data = await res.json();

    if (data.success) {
      await loadThrData();
      selectedThrSet.clear();
      const allCheckboxes = document.querySelectorAll(".chk-thr");
      allCheckboxes.forEach((chk) => {
        chk.checked = false;
      });
      const selectAllCheckbox = document.getElementById("selectAllThr");
      if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
      }
      updateCancelThrButtonVisibility();

      Swal.fire({
        title: "Berhasil!",
        html: `
          <div style="text-align: left;">
            <p><strong>Berhasil membatalkan ${selectedCancellable.length} THR ${companyName}.</strong></p>
            ${data.messageSentCount > 0 ? `<p style="margin-top: 10px; color: #16a34a;"><i class="fas fa-check-circle"></i> ${data.messageSentCount} notifikasi berhasil terkirim</p>` : ""}
            ${data.messageFailedCount > 0 ? `<p style="margin-top: 10px; color: #f59e0b;"><i class="fas fa-exclamation-triangle"></i> ${data.messageFailedCount} notifikasi gagal terkirim</p>` : ""}
          </div>
        `,
        icon: "success",
        confirmButtonText: "OK",
      });
    } else {
      Swal.fire("Gagal!", data.message || "Terjadi kesalahan saat membatalkan THR.", "error");
    }
  } catch (err) {
    console.error("Cancel THR error:", err);
    Swal.fire("Error", "Gagal membatalkan THR: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-ban"></i> Batalkan Kirim Terpilih';
    if (progressContainer) progressContainer.style.display = "none";
  }
}

const resetThrCheckbox = document.getElementById("resetThrCheckbox");
if (resetThrCheckbox) {
  const newResetThrBtn = resetThrCheckbox.cloneNode(true);
  resetThrCheckbox.parentNode.replaceChild(newResetThrBtn, resetThrCheckbox);

  newResetThrBtn.addEventListener("click", resetThrCheckboxSelection);
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
          </div>
        `,
        icon: thrProgress.failed > 0 ? "warning" : "success",
        confirmButtonText: "Selesai",
      }).then(async () => {
        resetThrProgress();
        await loadThrData();
        selectedThrSet.clear();
        const allCheckboxes = document.querySelectorAll(".chk-thr");
        allCheckboxes.forEach((chk) => {
          chk.checked = false;
        });
        const selectAllCheckbox = document.getElementById("selectAllThr");
        if (selectAllCheckbox) {
          selectAllCheckbox.checked = false;
          selectAllCheckbox.indeterminate = false;
        }
        updateCancelThrButtonVisibility();
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

// =============================
// THR DUPLICATION FUNCTIONS - SAMA SEPERTI BONUS
// =============================

function initializeThrDuplicationButtons() {
  console.log("Initializing THR duplication buttons for company:", currentCompany);

  const duplicateThrBtn = document.getElementById("duplicateThrBtn");
  if (duplicateThrBtn) {
    const newDuplicateThrBtn = duplicateThrBtn.cloneNode(true);
    duplicateThrBtn.parentNode.replaceChild(newDuplicateThrBtn, duplicateThrBtn);

    newDuplicateThrBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("✅ Duplicate THR button clicked");
      await duplicatePreviousYearThr();
    });
  }

  const cancelDuplicateThrBtn = document.getElementById("cancelDuplicateThrBtn");
  if (cancelDuplicateThrBtn) {
    const newCancelDuplicateThrBtn = cancelDuplicateThrBtn.cloneNode(true);
    cancelDuplicateThrBtn.parentNode.replaceChild(newCancelDuplicateThrBtn, cancelDuplicateThrBtn);

    newCancelDuplicateThrBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("✅ Cancel duplicate THR button clicked");
      await cancelThrDuplicate();
    });
  }
}

async function loadAvailableThrYears() {
  try {
    console.log(`Loading available THR years for company: ${currentCompany}`);
    const res = await fetch(`/thr-years?company=${currentCompany}`);
    const data = await res.json();

    if (data.success) {
      const yearSelect = document.getElementById("thrYearSelect");
      if (yearSelect) {
        const currentSelection = yearSelect.value;

        // PERBAIKAN: Simpan "Semua Tahun" sebagai opsi, tapi tetap tampilkan
        yearSelect.innerHTML = '<option value="all">Pilih Tahun</option>';

        data.years.forEach((year) => {
          const option = document.createElement("option");
          option.value = year;
          option.textContent = year;
          yearSelect.appendChild(option);
        });

        // PERBAIKAN: Jika currentSelection adalah "all", tetap set ke tahun sekarang
        // karena API akan default ke tahun sekarang
        if (currentSelection && currentSelection !== "all" && data.years.includes(parseInt(currentSelection))) {
          yearSelect.value = currentSelection;
          currentThrYear = currentSelection;
        } else {
          // Default ke tahun sekarang
          const currentYear = new Date().getFullYear();
          if (data.years.includes(currentYear)) {
            yearSelect.value = currentYear;
            currentThrYear = currentYear;
          } else if (data.years.length > 0) {
            yearSelect.value = data.years[0];
            currentThrYear = data.years[0];
          } else {
            yearSelect.value = "all";
            currentThrYear = currentYear;
          }
        }

        console.log(`Available THR years loaded: ${data.years.join(", ")}`);
        console.log(`Current THR year selection: ${yearSelect.value}`);
      }
    }
  } catch (err) {
    console.error("Load available THR years error:", err);
  }
}

async function duplicatePreviousYearThr() {
  console.log("🚀 duplicatePreviousYearThr called for company:", currentCompany);

  try {
    const currentYearForDuplicate = new Date().getFullYear();
    const previousYear = currentYearForDuplicate - 1;

    const result = await Swal.fire({
      title: "Duplikasi Data THR Tahun Lalu?",
      html: `
        <div style="text-align: left;">
          <p>Anda akan menduplikasi data THR dari <strong>tahun ${previousYear}</strong> ke <strong>tahun ${currentYearForDuplicate}</strong> untuk <strong>${currentCompany === "hisana" ? "Hisana" : "Enakko"}</strong>.</p>
          <p style="margin-top: 10px; color: #f59e0b;">
            <i class="fas fa-info-circle"></i> Hanya data karyawan yang belum memiliki data THR di tahun ${currentYearForDuplicate} yang akan diduplikasi.
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
      text: "Mohon tunggu, sedang menduplikasi data THR",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const response = await fetch("/duplicate-thr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: currentCompany }),
    });

    const data = await response.json();
    console.log("Duplicate THR response:", data);
    Swal.close();

    if (response.ok && data.success) {
      let messageHtml = `
        <div style="background:#f0fdf4;border-radius:12px;padding:15px">
          <p>${data.message}</p>
      `;

      if (data.duplicatedCount) {
        messageHtml += `<p style="margin-top: 10px;"><strong>${data.duplicatedCount}</strong> data THR berhasil diduplikasi ke tahun ${currentYearForDuplicate}</p>`;
      }

      if (data.skippedCount) {
        messageHtml += `<p style="margin-top: 5px; color: #f59e0b;">${data.skippedCount} data THR dilewati (sudah ada di tahun ${currentYearForDuplicate})</p>`;
      }

      messageHtml += `</div>`;

      Swal.fire({
        title: "Berhasil!",
        html: messageHtml,
        icon: "success",
        confirmButtonText: "OK",
      });

      // Set filter tahun ke tahun yang baru diduplikasi (tahun ini)
      // agar data hasil duplikasi langsung terlihat
      if (currentThrYear !== "all" && parseInt(currentThrYear) !== currentYearForDuplicate) {
        // Jika filter tahun bukan tahun ini, tawarkan untuk beralih
        const switchFilter = await Swal.fire({
          title: "Lihat Data Hasil Duplikasi?",
          text: `Data THR tahun ${currentYearForDuplicate} berhasil diduplikasi. Apakah Anda ingin beralih ke filter tahun ${currentYearForDuplicate} untuk melihat data yang baru?`,
          icon: "question",
          showCancelButton: true,
          confirmButtonText: `Ya, Tampilkan Tahun ${currentYearForDuplicate}`,
          cancelButtonText: "Tetap di Filter Saat Ini",
        });

        if (switchFilter.isConfirmed) {
          currentThrYear = currentYearForDuplicate.toString();
          const yearSelect = document.getElementById("thrYearSelect");
          if (yearSelect) yearSelect.value = currentThrYear;
        }
      }

      // Reload data dengan filter yang mungkin sudah berubah
      await loadThrData();

      const duplicateBtn = document.getElementById("duplicateThrBtn");
      const cancelBtn = document.getElementById("cancelDuplicateThrBtn");
      if (duplicateBtn && cancelBtn) {
        if (data.duplicatedCount > 0) {
          duplicateBtn.style.display = "none";
          cancelBtn.style.display = "inline-block";
        } else {
          duplicateBtn.style.display = "inline-block";
          cancelBtn.style.display = "none";
        }
      }

      startThrDuplicateStatusCheck();
    } else {
      Swal.fire({
        title: "Gagal!",
        text: data.message || "Terjadi kesalahan saat menduplikasi data THR",
        icon: "error",
        confirmButtonText: "OK",
      });
    }
  } catch (err) {
    console.error("❌ Duplicate THR data error:", err);
    Swal.close();
    Swal.fire({
      title: "Error!",
      text: err.message || "Terjadi kesalahan pada server",
      icon: "error",
      confirmButtonText: "OK",
    });
  }
}

async function cancelThrDuplicate() {
  console.log("🚀 cancelThrDuplicate called for company:", currentCompany);

  try {
    const result = await Swal.fire({
      title: "Batalkan Duplikasi THR?",
      html: `<p>Data THR hasil duplikasi akan dihapus permanen!</p>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Ya, Batalkan",
      cancelButtonText: "Tidak",
    });

    if (!result.isConfirmed) return;

    Swal.fire({
      title: "Sedang Memproses...",
      text: "Mohon tunggu, sedang membatalkan duplikasi THR",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const response = await fetch(`/cancel-duplicate-thr?company=${currentCompany}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const data = await response.json();
    console.log("Cancel duplicate THR response:", data);
    Swal.close();

    if (response.ok && data.success) {
      Swal.fire({
        title: "Berhasil!",
        html: `<div style="background:#fef2e8;border-radius:12px;padding:15px"><p>${data.message}</p></div>`,
        icon: "success",
        confirmButtonText: "OK",
      });

      await loadThrData();

      const duplicateBtn = document.getElementById("duplicateThrBtn");
      const cancelBtn = document.getElementById("cancelDuplicateThrBtn");
      if (duplicateBtn && cancelBtn) {
        duplicateBtn.style.display = "inline-block";
        cancelBtn.style.display = "none";
      }

      stopThrDuplicateStatusCheck();
    } else {
      Swal.fire({
        title: "Gagal!",
        text: data.message || "Terjadi kesalahan saat membatalkan duplikasi THR",
        icon: "error",
        confirmButtonText: "OK",
      });
    }
  } catch (err) {
    console.error("❌ Cancel THR duplicate error:", err);
    Swal.close();
    Swal.fire({
      title: "Error!",
      text: err.message || "Terjadi kesalahan pada server",
      icon: "error",
      confirmButtonText: "OK",
    });
  }
}

async function checkThrDuplicateStatus() {
  try {
    const response = await fetch(`/check-thr-duplicate-status?company=${currentCompany}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    const duplicateBtn = document.getElementById("duplicateThrBtn");
    const cancelBtn = document.getElementById("cancelDuplicateThrBtn");

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
    console.error("❌ Check THR duplicate status error:", err);
  }
}

function startThrDuplicateStatusCheck() {
  if (thrDuplicateCheckInterval) clearInterval(thrDuplicateCheckInterval);
  thrDuplicateCheckInterval = setInterval(() => checkThrDuplicateStatus(), 5000);
}

function stopThrDuplicateStatusCheck() {
  if (thrDuplicateCheckInterval) {
    clearInterval(thrDuplicateCheckInterval);
    thrDuplicateCheckInterval = null;
  }
}

function initThrForCompany() {
  const currentYear = new Date().getFullYear();
  currentThrYear = currentYear.toString();
  const yearSelect = document.getElementById("thrYearSelect");
  if (yearSelect) yearSelect.value = currentThrYear;
  loadThrData();
}

// =============================
// THR EMPLOYEE SEARCH DROPDOWN
// =============================
async function loadThrEmployeeList() {
  try {
    console.log(`Loading THR employee list for company: ${currentCompany}`);
    const res = await fetch(`/thr-employees?company=${currentCompany}`);
    const data = await res.json();

    if (data.success && data.employees) {
      thrEmployeeList = data.employees;
      console.log(`THR Employee list loaded: ${thrEmployeeList.length} employees`);
      return thrEmployeeList;
    } else {
      console.error("Failed to load THR employees:", data);
      thrEmployeeList = [];
      return [];
    }
  } catch (err) {
    console.error("Load THR employee list error:", err);
    thrEmployeeList = [];
    return [];
  }
}

function renderThrEmployeeDropdown(filterText = "") {
  const employeeListContainer = document.getElementById("thrEmployeeList");
  if (!employeeListContainer) return;

  const filtered = thrEmployeeList.filter((emp) => emp.no_induk.toLowerCase().includes(filterText.toLowerCase()) || emp.nama.toLowerCase().includes(filterText.toLowerCase()));

  if (filtered.length === 0) {
    employeeListContainer.innerHTML = '<div class="employee-empty">Tidak ada karyawan ditemukan</div>';
    return;
  }

  employeeListContainer.innerHTML = filtered
    .map(
      (emp) => `
    <div class="employee-item" 
         data-karyawan-id="${emp.karyawan_id}"
         data-no-induk="${escapeHtml(emp.no_induk)}" 
         data-nama="${escapeHtml(emp.nama)}" 
         data-nohp="${escapeHtml(emp.no_hp || "")}">
      <div class="employee-no-induk">${escapeHtml(emp.no_induk)}</div>
      <div class="employee-name">${escapeHtml(emp.nama)}</div>
      <div class="employee-detail" style="font-size: 11px; color: #666;">
        ${emp.no_hp ? escapeHtml(emp.no_hp) : "No HP tidak tersedia"}
      </div>
    </div>
  `,
    )
    .join("");

  document.querySelectorAll("#thrEmployeeList .employee-item").forEach((item) => {
    const newItem = item.cloneNode(true);
    item.parentNode.replaceChild(newItem, item);

    newItem.addEventListener("click", () => {
      const karyawanId = newItem.dataset.karyawanId;
      const noInduk = newItem.dataset.noInduk;
      const nama = newItem.dataset.nama;
      const nohp = newItem.dataset.nohp;
      selectThrEmployee(karyawanId, noInduk, nama, nohp);
    });
  });
}

function selectThrEmployee(karyawanId, noInduk, nama, nohp) {
  console.log("🔵 selectThrEmployee called:", { karyawanId, noInduk, nama, nohp });

  selectedThrEmployee = {
    karyawan_id: karyawanId,
    no_induk: noInduk,
    nama: nama,
    nohp: nohp,
  };

  const karyawanIdInput = document.getElementById("thr_karyawan_id");
  const noIndukInput = document.getElementById("thr_no_induk");
  const namaInput = document.getElementById("thr_nama");

  if (karyawanIdInput) karyawanIdInput.value = karyawanId || "";
  if (noIndukInput) noIndukInput.value = noInduk || "";
  if (namaInput) namaInput.value = nama || "";

  const searchInput = document.getElementById("thrEmployeeSearch");
  if (searchInput) {
    searchInput.value = `${noInduk || ""} - ${nama || ""}`;
  }

  const nohpInput = document.getElementById("thr_nohp");
  if (nohpInput) {
    if (nohp) {
      nohpInput.value = nohp;
    } else {
      nohpInput.value = "";
      nohpInput.placeholder = "No HP tidak tersedia, silakan isi manual";
      nohpInput.readOnly = false;
    }
  }

  const dropdown = document.getElementById("thrEmployeeDropdown");
  if (dropdown) dropdown.style.display = "none";
}

function setupThrEmployeeSearch() {
  const searchInput = document.getElementById("thrEmployeeSearch");
  const dropdown = document.getElementById("thrEmployeeDropdown");
  const dropdownSearch = document.getElementById("thrDropdownSearch");

  if (!searchInput || !dropdown) return;

  const newSearchInput = searchInput.cloneNode(true);
  searchInput.parentNode.replaceChild(newSearchInput, searchInput);

  const newDropdown = dropdown.cloneNode(true);
  dropdown.parentNode.replaceChild(newDropdown, dropdown);

  newSearchInput.addEventListener("focus", async () => {
    if (thrEmployeeList.length === 0) {
      await loadThrEmployeeList();
    }
    renderThrEmployeeDropdown(newSearchInput.value.split(" - ")[0] || "");
    newDropdown.style.display = "block";
  });

  newSearchInput.addEventListener("input", (e) => {
    const value = e.target.value.split(" - ")[0] || e.target.value;
    renderThrEmployeeDropdown(value);
    newDropdown.style.display = "block";
  });

  document.addEventListener("click", (e) => {
    if (!newSearchInput.contains(e.target) && !newDropdown.contains(e.target)) {
      newDropdown.style.display = "none";
    }
  });

  const newDropdownSearch = document.getElementById("thrDropdownSearch");
  if (newDropdownSearch) {
    const newDropdownSearchInput = newDropdownSearch.cloneNode(true);
    newDropdownSearch.parentNode.replaceChild(newDropdownSearchInput, newDropdownSearch);

    newDropdownSearchInput.addEventListener("input", (e) => {
      renderThrEmployeeDropdown(e.target.value);
    });
    newDropdownSearchInput.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  newDropdown.addEventListener("click", (e) => {
    e.stopPropagation();
  });
}

function resetThrEmployeeSelection() {
  selectedThrEmployee = null;

  const searchInput = document.getElementById("thrEmployeeSearch");
  const karyawanIdInput = document.getElementById("thr_karyawan_id");
  const noIndukInput = document.getElementById("thr_no_induk");
  const namaInput = document.getElementById("thr_nama");
  const nohpInput = document.getElementById("thr_nohp");

  if (searchInput) searchInput.value = "";
  if (karyawanIdInput) karyawanIdInput.value = "";
  if (noIndukInput) noIndukInput.value = "";
  if (namaInput) namaInput.value = "";
  if (nohpInput) {
    nohpInput.value = "";
    nohpInput.placeholder = "Akan diisi otomatis dari data karyawan";
    nohpInput.readOnly = true;
  }
}

// THR Event Listeners
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

  const checkboxes = document.querySelectorAll(".chk-thr");
  checkboxes.forEach((chk) => {
    chk.checked = false;
  });

  const selectAllThr = document.getElementById("selectAllThr");
  if (selectAllThr) {
    selectAllThr.checked = false;
    selectAllThr.indeterminate = false;
  }

  renderThrTable();
  updateCancelThrButtonVisibility();

  Swal.fire({
    title: "Berhasil!",
    text: "Semua pilihan checkbox THR telah direset.",
    icon: "success",
    toast: true,
    timer: 2000,
    showConfirmButton: false,
  });
});

// THR Year Filter - Perbaiki agar default ke tahun sekarang
document.getElementById("thrYearSelect")?.addEventListener("change", (e) => {
  const selectedYear = e.target.value;
  console.log("THR year filter changed to:", selectedYear);

  if (selectedYear === "all") {
    currentThrYear = new Date().getFullYear().toString();
    e.target.value = currentThrYear; // Reset dropdown value
    console.log(`"All" selected, defaulting to current year: ${currentThrYear}`);
  } else {
    currentThrYear = selectedYear;
  }

  currentThrPage = 1;
  selectedThrSet.clear();
  loadThrData();
});

const selectAllThr = document.getElementById("selectAllThr");
if (selectAllThr) {
  selectAllThr.addEventListener("change", (e) => {
    const checkboxes = document.querySelectorAll(".chk-thr");
    checkboxes.forEach((chk) => {
      chk.checked = e.target.checked;
      const id = parseInt(chk.dataset.id);
      if (e.target.checked) {
        selectedThrSet.add(id);
      } else {
        selectedThrSet.delete(id);
      }
    });
    updateCancelThrButtonVisibility();
  });
}

const prevThrPage = document.getElementById("prevThrPage");
if (prevThrPage) {
  const newPrevThrPage = prevThrPage.cloneNode(true);
  prevThrPage.parentNode.replaceChild(newPrevThrPage, prevThrPage);
  newPrevThrPage.addEventListener("click", () => {
    if (currentThrPage > 1) {
      currentThrPage--;
      renderThrTable();
    }
  });
}

const nextThrPage = document.getElementById("nextThrPage");
if (nextThrPage) {
  const newNextThrPage = nextThrPage.cloneNode(true);
  nextThrPage.parentNode.replaceChild(newNextThrPage, nextThrPage);
  newNextThrPage.addEventListener("click", () => {
    const query = document.getElementById("searchThrInput")?.value.toLowerCase() || "";
    const filtered = thrData.filter((d) => d.nama?.toLowerCase().includes(query) || d.no_induk?.toLowerCase().includes(query));
    if (currentThrPage * pageSizeThr < filtered.length) {
      currentThrPage++;
      renderThrTable();
    }
  });
}

// THR Search
const searchThrInput = document.getElementById("searchThrInput");
if (searchThrInput) {
  const newSearchThr = searchThrInput.cloneNode(true);
  searchThrInput.parentNode.replaceChild(newSearchThr, searchThrInput);
  newSearchThr.addEventListener("input", () => {
    currentThrPage = 1;
    renderThrTable();
  });
}

// =============================
// THR MODAL BUTTONS
// =============================
const addThrBtn = document.getElementById("addThrBtn");
if (addThrBtn) {
  const newAddThrBtn = addThrBtn.cloneNode(true);
  addThrBtn.parentNode.replaceChild(newAddThrBtn, addThrBtn);
  newAddThrBtn.addEventListener("click", () => {
    openThrModal();
  });
}

const closeThrModal = document.getElementById("closeThrModal");
if (closeThrModal) {
  const newCloseThrModal = closeThrModal.cloneNode(true);
  closeThrModal.parentNode.replaceChild(newCloseThrModal, closeThrModal);
  newCloseThrModal.addEventListener("click", () => {
    const modal = document.getElementById("thrModal");
    if (modal) modal.style.display = "none";
  });
}

const cancelThrFormBtn = document.getElementById("cancelThrBtn");
if (cancelThrFormBtn) {
  const newCancelThrBtn = cancelThrFormBtn.cloneNode(true);
  cancelThrFormBtn.parentNode.replaceChild(newCancelThrBtn, cancelThrFormBtn);
  newCancelThrBtn.addEventListener("click", () => {
    const modal = document.getElementById("thrModal");
    if (modal) modal.style.display = "none";
  });
}

// =============================
// HELPER FUNCTIONS
// =============================
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function updateMonthYearDisplay() {
  const now = new Date();
  const bulan = now.toLocaleString("id-ID", { month: "long" });
  const tahun = now.getFullYear();

  const monthYearElement = document.getElementById("currentMonthYear");
  if (monthYearElement) monthYearElement.textContent = `${bulan} ${tahun}`;

  const monthYearKirimElement = document.getElementById("currentMonthYearKirim");
  if (monthYearKirimElement) monthYearKirimElement.textContent = `${bulan} ${tahun}`;

  const monthYearBonusElement = document.getElementById("currentMonthYearBonus");
  if (monthYearBonusElement) monthYearBonusElement.textContent = `${bulan} ${tahun}`;

  const currentYearTHRElement = document.getElementById("currentYearTHR");
  if (currentYearTHRElement) currentYearTHRElement.textContent = tahun;
}

// Panggil fungsi inisialisasi setelah DOM siap
document.addEventListener("DOMContentLoaded", () => {
  // Inisialisasi filter
  const { month, year } = getCurrentMonthYear();
  currentSlipMonth = month;
  currentSlipYear = year;

  const monthSelect = document.getElementById("slipMonthSelect");
  const yearSelect = document.getElementById("slipYearSelect");

  if (monthSelect) monthSelect.value = month;
  if (yearSelect) yearSelect.value = year;

  // Setup event listeners
  setupFilterListeners();
  setupThrEmployeeSearch();

  // Load data
  loadData();
});

// =============================
// MOBILE MENU (HAMBURGER) FUNCTIONS
// =============================

function initMobileMenu() {
  const mobileMenuToggle = document.getElementById("mobileMenuToggle");
  const sidebar = document.getElementById("sidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");
  const sidebarClose = document.getElementById("sidebarClose");

  if (!mobileMenuToggle || !sidebar) return;

  // Fungsi untuk membuka sidebar
  function openSidebar() {
    if (sidebar) {
      sidebar.classList.add("open");
    }
    if (sidebarOverlay) {
      sidebarOverlay.classList.add("active");
    }
    // Prevent body scroll when sidebar is open
    document.body.style.overflow = "hidden";
  }

  // Fungsi untuk menutup sidebar
  function closeSidebar() {
    if (sidebar) {
      sidebar.classList.remove("open");
    }
    if (sidebarOverlay) {
      sidebarOverlay.classList.remove("active");
    }
    // Restore body scroll
    document.body.style.overflow = "";
  }

  // Toggle sidebar (buka/tutup)
  function toggleSidebar() {
    if (sidebar.classList.contains("open")) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  // Event listener untuk tombol hamburger
  mobileMenuToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSidebar();
  });

  // Event listener untuk tombol close (X)
  if (sidebarClose) {
    sidebarClose.addEventListener("click", (e) => {
      e.stopPropagation();
      closeSidebar();
    });
  }

  // Event listener untuk overlay (klik di luar sidebar)
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", (e) => {
      e.stopPropagation();
      closeSidebar();
    });
  }

  // Tutup sidebar saat window di-resize ke ukuran desktop
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth > 768) {
        // Jika ukuran desktop dan sidebar terbuka, tutup
        if (sidebar.classList.contains("open")) {
          closeSidebar();
        }
      }
    }, 250);
  });

  // Tutup sidebar saat menekan tombol ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sidebar.classList.contains("open")) {
      closeSidebar();
    }
  });

  // Optional: Tutup sidebar saat mengklik link menu di mobile
  const navItems = document.querySelectorAll(".nav-item, .company-btn");
  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      // Tutup sidebar hanya di mobile
      if (window.innerWidth <= 768) {
        setTimeout(() => {
          closeSidebar();
        }, 150);
      }
    });
  });
}

// Initialize
loadData();
updateMonthYearDisplay();
