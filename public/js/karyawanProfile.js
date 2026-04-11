// =============================
// KARYAWAN PROFILE JS
// =============================

// Konfigurasi SweetAlert2 agar responsif
const swalConfig = {
  confirmButtonColor: "#667eea",
  cancelButtonColor: "#f56565",
  customClass: {
    popup: "swal-responsive",
    title: "swal-title",
    content: "swal-content",
    confirmButton: "swal-button",
    cancelButton: "swal-button",
  },
  width: "auto",
  padding: "1.5rem",
  backdrop: true,
  allowOutsideClick: true,
  allowEscapeKey: true,
  allowEnterKey: true,
};

// Helper function untuk menampilkan SweetAlert dengan konfigurasi responsif
function showSwal(options) {
  const defaultOptions = {
    ...swalConfig,
    ...options,
    width: window.innerWidth < 768 ? "90%" : "auto",
    padding: window.innerWidth < 768 ? "1rem" : "1.5rem",
  };
  return Swal.fire(defaultOptions);
}

// Update window resize untuk menyesuaikan width SweetAlert
window.addEventListener("resize", () => {
  if (Swal.isVisible()) {
    const newWidth = window.innerWidth < 768 ? "90%" : "auto";
    Swal.getPopup().style.width = newWidth;
  }
});

let profileData = null;
let isEditing = false;
let company = null;
let currentSlipData = null;
let currentBonusData = null;
let currentThrData = null;

// =============================
// LOAD PROFILE DATA
// =============================
async function loadProfile() {
  try {
    const res = await fetch("/api/karyawan/profile");
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.message);
    }

    profileData = data.profile;
    company = data.company;

    console.log("Company loaded:", company);
    console.log("Profile data:", profileData);

    await loadCurrentMonthSlip();
    await loadCurrentMonthBonus();
    await loadCurrentYearThr();

    renderProfile(data);
  } catch (err) {
    console.error("Error loading profile:", err);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "Gagal memuat data profile. Silakan login kembali.",
      confirmButtonColor: "#667eea",
    }).then(() => {
      window.location.href = "/login";
    });
  }
}

async function loadCurrentMonthSlip() {
  try {
    const res = await fetch("/api/karyawan/current-slip");
    const data = await res.json();
    if (data.success && data.data) {
      currentSlipData = data.data;
      console.log("Current month slip data:", currentSlipData);
    } else {
      currentSlipData = null;
    }
  } catch (err) {
    console.error("Error loading current slip:", err);
    currentSlipData = null;
  }
}

async function loadCurrentMonthBonus() {
  try {
    const res = await fetch("/api/karyawan/current-bonus");
    const data = await res.json();
    if (data.success && data.data) {
      currentBonusData = data.data;
      console.log("Current month bonus data:", currentBonusData);
    } else {
      currentBonusData = null;
    }
  } catch (err) {
    console.error("Error loading current bonus:", err);
    currentBonusData = null;
  }
}

async function loadCurrentYearThr() {
  try {
    const res = await fetch("/api/karyawan/current-thr");
    const data = await res.json();
    if (data.success && data.data) {
      currentThrData = data.data;
      console.log("Current year THR data:", currentThrData);
    } else {
      currentThrData = null;
    }
  } catch (err) {
    console.error("Error loading current THR:", err);
    currentThrData = null;
  }
}

// =============================
// DOWNLOAD FUNCTIONS
// =============================
async function downloadSlip() {
  if (!currentSlipData) {
    Swal.fire({
      icon: "warning",
      title: "Perhatian",
      text: "Tidak ada slip gaji untuk bulan ini",
      confirmButtonColor: "#667eea",
    });
    return;
  }

  try {
    Swal.fire({
      title: "Mengunduh...",
      text: "Sedang memproses slip gaji",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const slipDataToSend = {
      ...currentSlipData,
      nama: currentSlipData.nama || profileData?.nama_lengkap,
      no_induk: currentSlipData.no_induk || profileData?.no_induk,
      jabatan: currentSlipData.jabatan || profileData?.jabatan,
      store_name: currentSlipData.store_name || profileData?.nama_gerai,
      awal_masuk: currentSlipData.awal_masuk || profileData?.awal_masuk,
      awal_masuk_formatted: currentSlipData.awal_masuk_formatted || profileData?.awal_masuk_formatted,
    };

    const res = await fetch("/api/karyawan/download-slip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slipData: slipDataToSend,
        company: company,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || "Gagal mengunduh slip");
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    const now = new Date();
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const fileName = `Slip_Gaji_${profileData?.nama_lengkap || "Karyawan"}_${monthNames[now.getMonth()]}_${now.getFullYear()}.pdf`;
    a.download = fileName;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    Swal.fire({
      icon: "success",
      title: "Berhasil!",
      text: "Slip gaji berhasil diunduh",
      confirmButtonColor: "#667eea",
    });
  } catch (err) {
    console.error("Error downloading slip:", err);
    Swal.fire({
      icon: "error",
      title: "Gagal",
      text: err.message,
      confirmButtonColor: "#667eea",
    });
  }
}

async function downloadBonus() {
  if (!currentBonusData) {
    Swal.fire({
      icon: "warning",
      title: "Perhatian",
      text: "Tidak ada bonus untuk bulan ini",
      confirmButtonColor: "#667eea",
    });
    return;
  }

  try {
    Swal.fire({
      title: "Mengunduh...",
      text: "Sedang memproses slip bonus",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const bonusDataToSend = {
      ...currentBonusData,
      nama: currentBonusData.nama || profileData?.nama_lengkap,
      no_induk: currentBonusData.no_induk || profileData?.no_induk,
      jabatan: currentBonusData.jabatan || profileData?.jabatan,
      store_name: currentBonusData.store_name || profileData?.nama_gerai,
      awal_masuk: currentBonusData.awal_masuk || profileData?.awal_masuk,
      awal_masuk_formatted: currentBonusData.awal_masuk_formatted || profileData?.awal_masuk_formatted,
    };

    const res = await fetch("/api/karyawan/download-bonus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bonusData: bonusDataToSend,
        company: company,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || "Gagal mengunduh bonus");
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const fileName = `Bonus_${profileData?.nama_lengkap || "Karyawan"}_${monthNames[currentBonusData.bulan - 1]}_${currentBonusData.tahun}.pdf`;
    a.download = fileName;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    Swal.fire({
      icon: "success",
      title: "Berhasil!",
      text: "Slip bonus berhasil diunduh",
      confirmButtonColor: "#667eea",
    });
  } catch (err) {
    console.error("Error downloading bonus:", err);
    Swal.fire({
      icon: "error",
      title: "Gagal",
      text: err.message,
      confirmButtonColor: "#667eea",
    });
  }
}

async function downloadThr() {
  if (!currentThrData) {
    Swal.fire({
      icon: "warning",
      title: "Perhatian",
      text: "Tidak ada THR untuk tahun ini",
      confirmButtonColor: "#667eea",
    });
    return;
  }

  try {
    Swal.fire({
      title: "Mengunduh...",
      text: "Sedang memproses slip THR",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const thrDataToSend = {
      ...currentThrData,
      nama: currentThrData.nama || profileData?.nama_lengkap,
      no_induk: currentThrData.no_induk || profileData?.no_induk,
      jabatan: currentThrData.jabatan || profileData?.jabatan,
      store_name: currentThrData.store_name || profileData?.nama_gerai,
      awal_masuk: currentThrData.awal_masuk || profileData?.awal_masuk,
      awal_masuk_formatted: currentThrData.awal_masuk_formatted || profileData?.awal_masuk_formatted,
    };

    const res = await fetch("/api/karyawan/download-thr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        thrData: thrDataToSend,
        company: company,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || "Gagal mengunduh THR");
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    const fileName = `THR_${profileData?.nama_lengkap || "Karyawan"}_${currentThrData.tahun}.pdf`;
    a.download = fileName;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    Swal.fire({
      icon: "success",
      title: "Berhasil!",
      text: "Slip THR berhasil diunduh",
      confirmButtonColor: "#667eea",
    });
  } catch (err) {
    console.error("Error downloading THR:", err);
    Swal.fire({
      icon: "error",
      title: "Gagal",
      text: err.message,
      confirmButtonColor: "#667eea",
    });
  }
}

// =============================
// RENDER PROFILE
// =============================
function renderProfile(data) {
  const profile = data.profile;
  const container = document.getElementById("profileContent");

  let fotoDiriUrl = "https://ui-avatars.com/api/?background=6366f1&color=fff&rounded=true&bold=true&size=200&name=" + encodeURIComponent(profile.nama_lengkap);
  let fotoKtpUrl = null;

  if (profile.foto_diri_url && profile.foto_diri_url !== "" && profile.foto_diri_url !== "null") {
    fotoDiriUrl = profile.foto_diri_url;
  }

  if (profile.foto_ktp_url && profile.foto_ktp_url !== "" && profile.foto_ktp_url !== "null") {
    fotoKtpUrl = profile.foto_ktp_url;
  }

  container.innerHTML = `
    <div class="profile-card">
      <div class="profile-header">
        <div class="profile-avatar">
          <img src="${fotoDiriUrl}" alt="Foto Profil" 
               onerror="this.onerror=null; this.src='https://ui-avatars.com/api/?background=6366f1&color=fff&rounded=true&bold=true&size=200&name=${encodeURIComponent(profile.nama_lengkap)}'">
        </div>
        <h2>${escapeHtml(profile.nama_lengkap)}</h2>
        <p>${escapeHtml(profile.jabatan || "-")}</p>
        <div class="profile-actions">
          <button class="btn-password" onclick="openPasswordModal()">
            <i class="fas fa-key"></i> Ganti Password
          </button>
        </div>
      </div>
      
      <div class="profile-body">
        <div class="info-section">
          <div class="info-title"><i class="fas fa-id-card"></i> Data Diri</div>
          <div class="info-grid">
            <div class="info-item"><i class="fas fa-hashtag"></i><div><div class="info-label">No Induk</div><div class="info-value">${escapeHtml(profile.no_induk || "-")}</div></div></div>
            <div class="info-item"><i class="fas fa-id-card"></i><div><div class="info-label">NIK</div><div class="info-value">${escapeHtml(profile.nik || "-")}</div></div></div>
            <div class="info-item"><i class="fas fa-user"></i><div><div class="info-label">Nama Lengkap</div><div class="info-value">${escapeHtml(profile.nama_lengkap || "-")}</div></div></div>
            <div class="info-item"><i class="fas fa-calendar"></i><div><div class="info-label">Tanggal Lahir</div><div class="info-value">${profile.tanggal_lahir_formatted || formatDate(profile.tanggal_lahir)}</div></div></div>
            <div class="info-item"><i class="fas fa-calendar-check"></i><div><div class="info-label">Awal Masuk</div><div class="info-value">${profile.awal_masuk_formatted || formatDate(profile.awal_masuk)}</div></div></div>
            <div class="info-item"><i class="fas fa-map-marker-alt"></i><div><div class="info-label">Alamat Domisili</div><div class="info-value">${escapeHtml(profile.alamat_domisili || "-")}</div></div></div>
            <div class="info-item"><i class="fas fa-phone"></i><div><div class="info-label">No HP</div><div class="info-value">${escapeHtml(profile.no_hp || "-")}</div></div></div>
            <div class="info-item"><i class="fas fa-envelope"></i><div><div class="info-label">Email</div><div class="info-value">${escapeHtml(profile.email || "-")}</div></div></div>
          </div>
        </div>

        <div class="info-section">
          <div class="info-title"><i class="fas fa-briefcase"></i> Data Perusahaan</div>
          <div class="info-grid">
            <div class="info-item"><i class="fas fa-store"></i><div><div class="info-label">Nama Gerai (Store)</div><div class="info-value">${escapeHtml(profile.nama_gerai || "-")}</div></div></div>
            <div class="info-item"><i class="fas fa-location-dot"></i><div><div class="info-label">Cabang (Alamat Store)</div><div class="info-value">${escapeHtml(profile.cabang || "-")}</div></div></div>
            <div class="info-item"><i class="fas fa-briefcase"></i><div><div class="info-label">Jabatan</div><div class="info-value">${escapeHtml(profile.jabatan || "-")}</div></div></div>
          </div>
        </div>

        ${
          fotoKtpUrl
            ? `
        <div class="info-section">
          <div class="info-title"><i class="fas fa-id-card"></i> Dokumen KTP</div>
          <div class="photo-ktp">
            <img src="${fotoKtpUrl}" alt="Foto KTP" onclick="showImageModal(this.src)" onerror="this.onerror=null; this.style.display='none';">
            <p class="photo-caption">Klik untuk memperbesar</p>
          </div>
        </div>
        `
            : '<div class="info-section"><div class="info-title"><i class="fas fa-id-card"></i> Dokumen KTP</div><div class="photo-ktp" style="text-align:center; padding:20px; color:#999;"><i class="fas fa-image" style="font-size:48px;"></i><p>Belum ada foto KTP</p></div></div>'
        }

        <div class="salary-section">
          <div class="info-title"><i class="fas fa-money-bill-wave"></i> Data Penggajian</div>
          <div class="salary-tabs">
            <button class="tab-btn active" onclick="showTab('slip')">Slip Gaji</button>
            <button class="tab-btn" onclick="showTab('bonus')">Bonus</button>
            <button class="tab-btn" onclick="showTab('thr')">THR</button>
          </div>
          <div id="slipTab" class="tab-content active">${renderCurrentSlip()}</div>
          <div id="bonusTab" class="tab-content">${renderCurrentBonus()}</div>
          <div id="thrTab" class="tab-content">${renderCurrentThr()}</div>
        </div>
      </div>
    </div>
  `;
}

function renderCurrentSlip() {
  const now = new Date();
  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const currentMonth = monthNames[now.getMonth()];
  const currentYear = now.getFullYear();

  if (!currentSlipData) {
    return `<div class="empty-state"><i class="fas fa-folder-open"></i><p>Belum ada data slip gaji untuk ${currentMonth} ${currentYear}</p></div>`;
  }

  const formatRupiahDisplay = (amount) => {
    if (!amount && amount !== 0) return "Rp 0";
    return `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;
  };

  let totalGaji = 0;
  let slipDetails = [];

  const karyawanInfo = `
    <div class="karyawan-info" style="background: #f8fafc; padding: 16px; border-radius: 16px; margin-bottom: 20px;">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
        <div><div style="font-size: 11px; color: #94a3b8;">Jabatan</div><div style="font-weight: 600;">${escapeHtml(currentSlipData.jabatan || "-")}</div></div>
        <div><div style="font-size: 11px; color: #94a3b8;">Store / Unit</div><div style="font-weight: 600;">${escapeHtml(currentSlipData.store_name || "-")}</div></div>
        <div><div style="font-size: 11px; color: #94a3b8;">Tanggal Bergabung</div><div style="font-weight: 600;">${currentSlipData.awal_masuk_formatted || formatDate(currentSlipData.awal_masuk) || "-"}</div></div>
      </div>
    </div>
  `;

  if (company === "hisana") {
    totalGaji = currentSlipData.gaji_total || 0;
    slipDetails = [
      { label: "Jumlah Hari Kerja", value: currentSlipData.kerja || 0, icon: "fa-calendar-day", isNumber: true },
      { label: "Gaji Pokok", value: formatRupiahDisplay(currentSlipData.gaji || 0), icon: "fa-money-bill-wave" },
      { label: "Iuran BPJS Ketenagakerjaan", value: `- ${formatRupiahDisplay(currentSlipData.iuran_bpjs_ketenagakerjaan || 0)}`, icon: "fa-shield-alt", isDeduction: true },
      { label: "Kerajinan", value: formatRupiahDisplay(currentSlipData.kerajinan || 0), icon: "fa-hand-sparkles" },
      { label: "Cuti", value: formatRupiahDisplay(currentSlipData.cuti || 0), icon: "fa-umbrella-beach" },
      { label: "Tunjangan BPJS & Pulsa", value: formatRupiahDisplay(currentSlipData.tunj_bpjs_pulsa || 0), icon: "fa-phone-alt" },
      { label: "Total Perhitungan", value: formatRupiahDisplay(currentSlipData.jumlah || 0), icon: "fa-calculator", isBold: true },
      { label: "Uang Makan (UM)", value: formatRupiahDisplay(currentSlipData.um || 0), icon: "fa-utensils" },
    ];
  } else {
    totalGaji = currentSlipData.total_gaji || 0;
    slipDetails = [
      { label: "Gaji Pokok", value: formatRupiahDisplay(currentSlipData.gaji_pokok || 0), icon: "fa-money-bill-wave" },
      { label: "BPJS Kesehatan", value: formatRupiahDisplay(currentSlipData.bpjs_kesehatan || 0), icon: "fa-shield-alt" },
      { label: "Insentif", value: formatRupiahDisplay(currentSlipData.insentif || 0), icon: "fa-star" },
    ];
  }

  const detailsHtml = slipDetails
    .map(
      (detail) => `
    <div class="salary-detail-item ${detail.isBold ? "salary-detail-bold" : ""}">
      <div class="salary-detail-icon"><i class="fas ${detail.icon}"></i></div>
      <div class="salary-detail-info">
        <span class="salary-detail-label">${detail.label}</span>
        <span class="salary-detail-value ${detail.isDeduction ? "deduction" : ""} ${detail.isBold ? "bold-value" : ""}">${detail.value}</span>
      </div>
    </div>
  `,
    )
    .join("");

  return `
    <div class="salary-card">
      <div class="salary-card-header">
        <div class="header-icon"><i class="fas fa-file-invoice-dollar"></i></div>
        <div class="header-info"><h3>Slip Gaji</h3><p>${currentMonth} ${currentYear}</p></div>
        <div class="header-badge ${currentSlipData.status_slip === "terkirim" ? "badge-sent" : "badge-pending"}">
          <i class="fas ${currentSlipData.status_slip === "terkirim" ? "fa-check-circle" : "fa-clock"}"></i>
          ${currentSlipData.status_slip === "terkirim" ? "Terkirim" : "Belum Dikirim"}
        </div>
      </div>
      <div class="salary-card-body">
        ${karyawanInfo}
        <div class="salary-details">${detailsHtml}</div>
        <div class="salary-total"><div class="total-label">Total Gaji</div><div class="total-amount">${formatRupiahDisplay(totalGaji)}</div></div>
        ${currentSlipData.keterangan ? `<div class="salary-note"><i class="fas fa-info-circle"></i><span>${escapeHtml(currentSlipData.keterangan)}</span></div>` : ""}
        <div class="salary-date"><i class="fas fa-calendar-alt"></i><span>Dibuat: ${currentSlipData.created_at ? new Date(currentSlipData.created_at).toLocaleDateString("id-ID") : "-"}</span></div>
        <button class="btn-download" onclick="downloadSlip()"><i class="fas fa-download"></i> Unduh Slip Gaji</button>
      </div>
    </div>
  `;
}

function renderCurrentBonus() {
  const now = new Date();
  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const currentMonth = monthNames[now.getMonth()];

  if (!currentBonusData) {
    return `<div class="empty-state"><i class="fas fa-gift"></i><p>Belum ada data bonus untuk ${currentMonth}</p></div>`;
  }

  const formatRupiahDisplay = (amount) => {
    if (!amount && amount !== 0) return "Rp 0";
    return `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;
  };

  const bonusMonth = currentBonusData.bulan || now.getMonth() + 1;
  const bonusYear = currentBonusData.tahun || now.getFullYear();
  const monthName = monthNames[bonusMonth - 1] || currentMonth;

  return `
    <div class="salary-card">
      <div class="salary-card-header">
        <div class="header-icon"><i class="fas fa-gift"></i></div>
        <div class="header-info"><h3>Bonus</h3><p>${monthName} ${bonusYear}</p></div>
        <div class="header-badge ${currentBonusData.status === "terkirim" ? "badge-sent" : "badge-pending"}">
          <i class="fas ${currentBonusData.status === "terkirim" ? "fa-check-circle" : "fa-clock"}"></i>
          ${currentBonusData.status === "terkirim" ? "Terkirim" : "Belum Dikirim"}
        </div>
      </div>
      <div class="salary-card-body">
        <div class="bonus-amount"><div class="bonus-label">Jumlah Bonus</div><div class="bonus-value">${formatRupiahDisplay(currentBonusData.jumlah_bonus)}</div></div>
        <div class="salary-date"><i class="fas fa-calendar-alt"></i><span>Dibuat: ${currentBonusData.created_at ? new Date(currentBonusData.created_at).toLocaleDateString("id-ID") : "-"}</span></div>
        <button class="btn-download" onclick="downloadBonus()"><i class="fas fa-download"></i> Unduh Slip Bonus</button>
      </div>
    </div>
  `;
}

function renderCurrentThr() {
  const now = new Date();
  const currentYear = now.getFullYear();

  if (!currentThrData) {
    return `<div class="empty-state"><i class="fas fa-star-of-life"></i><p>Belum ada data THR untuk tahun ${currentYear}</p></div>`;
  }

  const formatRupiahDisplay = (amount) => {
    if (!amount && amount !== 0) return "Rp 0";
    return `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;
  };

  const thrYear = currentThrData.tahun || currentYear;

  return `
    <div class="salary-card">
      <div class="salary-card-header">
        <div class="header-icon"><i class="fas fa-star-of-life"></i></div>
        <div class="header-info"><h3>THR</h3><p>Tahun ${thrYear}</p></div>
        <div class="header-badge ${currentThrData.status === "terkirim" ? "badge-sent" : "badge-pending"}">
          <i class="fas ${currentThrData.status === "terkirim" ? "fa-check-circle" : "fa-clock"}"></i>
          ${currentThrData.status === "terkirim" ? "Terkirim" : "Belum Dikirim"}
        </div>
      </div>
      <div class="salary-card-body">
        <div class="thr-amount"><div class="thr-label">Jumlah THR</div><div class="thr-value">${formatRupiahDisplay(currentThrData.jumlah_thr)}</div></div>
        <div class="salary-date"><i class="fas fa-calendar-alt"></i><span>Dibuat: ${currentThrData.created_at ? new Date(currentThrData.created_at).toLocaleDateString("id-ID") : "-"}</span></div>
        <button class="btn-download" onclick="downloadThr()"><i class="fas fa-download"></i> Unduh Slip THR</button>
      </div>
    </div>
  `;
}

function showTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
  document.getElementById("slipTab")?.classList.remove("active");
  document.getElementById("bonusTab")?.classList.remove("active");
  document.getElementById("thrTab")?.classList.remove("active");
  document.getElementById(`${tabName}Tab`)?.classList.add("active");

  const clickedBtn = Array.from(document.querySelectorAll(".tab-btn")).find((btn) => btn.getAttribute("onclick")?.includes(tabName));
  if (clickedBtn) clickedBtn.classList.add("active");
}

// =============================
// EDIT PROFILE FUNCTIONS
// =============================
function toggleEditMode() {
  if (!profileData) return;
  document.getElementById("editNoHp").value = profileData.no_hp || "";
  document.getElementById("editEmail").value = profileData.email || "";
  document.getElementById("editAlamat").value = profileData.alamat_domisili || "";
  document.getElementById("editProfileModal").style.display = "flex";
}

function closeEditModal() {
  document.getElementById("editProfileModal").style.display = "none";
}

async function saveProfile() {
  const noHp = document.getElementById("editNoHp").value.trim();
  const email = document.getElementById("editEmail").value.trim();
  const alamat = document.getElementById("editAlamat").value.trim();

  try {
    const res = await fetch("/api/karyawan/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ no_hp: noHp, email: email, alamat_domisili: alamat }),
    });
    const data = await res.json();
    if (data.success) {
      Swal.fire({ icon: "success", title: "Berhasil!", text: "Profil berhasil diupdate", confirmButtonColor: "#667eea" });
      closeEditModal();
      loadProfile();
    } else {
      throw new Error(data.message);
    }
  } catch (err) {
    Swal.fire({ icon: "error", title: "Gagal", text: err.message, confirmButtonColor: "#667eea" });
  }
}

// =============================
// PASSWORD FUNCTIONS
// =============================
function openPasswordModal() {
  document.getElementById("currentPassword").value = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmPassword").value = "";
  document.getElementById("changePasswordModal").style.display = "flex";

  const strengthBarFill = document.getElementById("strengthBarFill");
  const strengthText = document.getElementById("strengthText");
  if (strengthBarFill) strengthBarFill.style.width = "0%";
  if (strengthText) strengthText.textContent = "";

  const newPasswordInput = document.getElementById("newPassword");
  if (newPasswordInput) {
    newPasswordInput.removeEventListener("input", updatePasswordStrengthHandler);
    newPasswordInput.addEventListener("input", updatePasswordStrengthHandler);
  }
}

function updatePasswordStrengthHandler() {
  updatePasswordStrength(this.value);
}

function updatePasswordStrength(password) {
  let strength = 0;
  if (password.length >= 6) strength++;
  if (password.length >= 8) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;

  const strengthTextArr = ["Sangat Lemah", "Lemah", "Sedang", "Kuat", "Sangat Kuat"];
  const strengthColor = ["#ef4444", "#f59e0b", "#eab308", "#10b981", "#059669"];

  const strengthBarFill = document.getElementById("strengthBarFill");
  const strengthTextEl = document.getElementById("strengthText");

  if (strengthBarFill && password.length > 0) {
    strengthBarFill.style.width = `${strength * 20}%`;
    strengthBarFill.style.backgroundColor = strengthColor[strength - 1] || "#e2e8f0";
    if (strengthTextEl) {
      strengthTextEl.textContent = strengthTextArr[strength - 1] || "";
      strengthTextEl.style.color = strengthColor[strength - 1] || "#94a3b8";
    }
  } else if (strengthBarFill) {
    strengthBarFill.style.width = "0%";
    if (strengthTextEl) strengthTextEl.textContent = "";
  }
}

function closePasswordModal() {
  document.getElementById("changePasswordModal").style.display = "none";
}

async function changePassword() {
  const currentPassword = document.getElementById("currentPassword").value;
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (!currentPassword || !newPassword || !confirmPassword) {
    Swal.fire({ icon: "warning", title: "Perhatian", text: "Semua field harus diisi", confirmButtonColor: "#667eea" });
    return;
  }
  if (newPassword.length < 6) {
    Swal.fire({ icon: "warning", title: "Perhatian", text: "Password baru minimal 6 karakter", confirmButtonColor: "#667eea" });
    return;
  }
  if (newPassword !== confirmPassword) {
    Swal.fire({ icon: "warning", title: "Perhatian", text: "Password baru dan konfirmasi tidak cocok", confirmButtonColor: "#667eea" });
    return;
  }

  try {
    const res = await fetch("/api/karyawan/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    if (data.success) {
      Swal.fire({ icon: "success", title: "Berhasil!", text: "Password berhasil diubah. Silakan login kembali.", confirmButtonColor: "#667eea" }).then(() => (window.location.href = "/logout"));
    } else {
      throw new Error(data.message);
    }
  } catch (err) {
    Swal.fire({ icon: "error", title: "Gagal", text: err.message, confirmButtonColor: "#667eea" });
  }
}

// =============================
// HELPER FUNCTIONS
// =============================
function showImageModal(src) {
  Swal.fire({ imageUrl: src, imageAlt: "Foto KTP", showCloseButton: true, showConfirmButton: false, width: "auto", customClass: { popup: "image-modal" } });
}

function formatDate(dateString) {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  } catch (e) {
    return "-";
  }
}

function escapeHtml(text) {
  if (!text) return "-";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function handleLogout() {
  const result = await Swal.fire({
    title: "Konfirmasi Logout",
    text: "Apakah Anda yakin ingin logout?",
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#f56565",
    cancelButtonColor: "#667eea",
    confirmButtonText: "Ya, Logout",
    cancelButtonText: "Batal",
  });
  if (result.isConfirmed) window.location.href = "/logout";
}

window.onclick = function (event) {
  if (event.target === document.getElementById("editProfileModal")) closeEditModal();
  if (event.target === document.getElementById("changePasswordModal")) closePasswordModal();
  if (event.target === document.getElementById("attendanceMenuModal")) closeAttendanceMenu();
};

// =============================
// FUNGSI AMBIL FOTO DENGAN KAMERA
// =============================

async function takePhoto() {
  return new Promise((resolve, reject) => {
    let stream = null;

    const modalHtml = `
      <div style="text-align: center;">
        <div style="position: relative; width: 100%; max-width: 400px; margin: 0 auto;">
          <video id="cameraVideo" autoplay playsinline style="width: 100%; border-radius: 16px; background: #1e293b; transform: scaleX(-1);"></video>
          <canvas id="cameraCanvas" style="display: none;"></canvas>
          <div style="margin-top: 15px; display: flex; gap: 12px; justify-content: center;">
            <button id="capturePhotoBtn" style="padding: 12px 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 12px; cursor: pointer;">
              <i class="fas fa-camera"></i> Ambil Foto
            </button>
            <button id="closeCameraBtn" style="padding: 12px 24px; background: #e2e8f0; color: #475569; border: none; border-radius: 12px; cursor: pointer;">
              <i class="fas fa-times"></i> Batal
            </button>
          </div>
          <p style="font-size: 12px; color: #64748b; margin-top: 12px;">
            <i class="fas fa-info-circle"></i> Pastikan wajah Anda terlihat jelas
          </p>
        </div>
      </div>
    `;

    Swal.fire({
      title: "📸 Ambil Foto Selfie",
      html: modalHtml,
      showConfirmButton: false,
      showCancelButton: false,
      allowOutsideClick: false,
      allowEscapeKey: true,
      didOpen: async () => {
        const videoElement = document.getElementById("cameraVideo");
        const canvasElement = document.getElementById("cameraCanvas");

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          });
          videoElement.srcObject = stream;
          videoElement.play();
        } catch (err) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
            });
            videoElement.srcObject = stream;
            videoElement.play();
          } catch (err2) {
            Swal.close();
            reject(new Error("Tidak dapat mengakses kamera. Pastikan kamera tersedia dan izin diberikan."));
            return;
          }
        }

        document.getElementById("capturePhotoBtn").onclick = () => {
          try {
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
            const ctx = canvasElement.getContext("2d");
            ctx.save();
            ctx.scale(-1, 1);
            ctx.drawImage(videoElement, -canvasElement.width, 0, canvasElement.width, canvasElement.height);
            ctx.restore();
            const imageData = canvasElement.toDataURL("image/jpeg", 0.8);
            if (stream) stream.getTracks().forEach((track) => track.stop());
            Swal.close();
            resolve(imageData);
          } catch (err) {
            if (stream) stream.getTracks().forEach((track) => track.stop());
            Swal.close();
            reject(new Error("Gagal mengambil foto: " + err.message));
          }
        };

        document.getElementById("closeCameraBtn").onclick = () => {
          if (stream) stream.getTracks().forEach((track) => track.stop());
          Swal.close();
          reject(new Error("Pengambilan foto dibatalkan"));
        };
      },
      willClose: () => {
        if (stream) stream.getTracks().forEach((track) => track.stop());
      },
    });
  });
}

async function previewPhoto(fotoBase64) {
  return new Promise((resolve) => {
    Swal.fire({
      title: "Preview Foto",
      html: `
        <div style="text-align: center;">
          <img src="${fotoBase64}" style="max-width: 100%; max-height: 300px; border-radius: 16px; margin-bottom: 15px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <p style="margin-bottom: 15px;">Apakah foto sudah sesuai?</p>
          <div style="display: flex; gap: 12px; justify-content: center;">
            <button id="confirmPhotoBtn" style="padding: 10px 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 12px; cursor: pointer;">
              <i class="fas fa-check"></i> Ya, Lanjutkan
            </button>
            <button id="retakePhotoBtn" style="padding: 10px 20px; background: #e2e8f0; color: #475569; border: none; border-radius: 12px; cursor: pointer;">
              <i class="fas fa-redo-alt"></i> Ambil Ulang
            </button>
          </div>
        </div>
      `,
      showConfirmButton: false,
      allowOutsideClick: false,
      didOpen: () => {
        document.getElementById("confirmPhotoBtn").onclick = () => {
          Swal.close();
          resolve(true);
        };
        document.getElementById("retakePhotoBtn").onclick = () => {
          Swal.close();
          resolve(false);
        };
      },
    });
  });
}

async function takePhotoWithPreview() {
  let retake = true;
  let fotoBase64 = null;

  while (retake) {
    try {
      Swal.fire({ title: "Membuka Kamera...", text: "Harap izinkan akses kamera", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      fotoBase64 = await takePhoto();
      Swal.close();
      retake = !(await previewPhoto(fotoBase64));
    } catch (err) {
      Swal.close();
      throw err;
    }
  }
  return fotoBase64;
}

// =============================
// ABSENSI FUNCTIONS
// =============================

function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation tidak didukung oleh browser ini"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      (error) => {
        let errorMessage = "Gagal mendapatkan lokasi";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Izin lokasi ditolak. Silakan aktifkan lokasi untuk absensi.";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Informasi lokasi tidak tersedia";
            break;
          case error.TIMEOUT:
            errorMessage = "Waktu permintaan lokasi habis";
            break;
        }
        reject(new Error(errorMessage));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

async function loadTodayAttendanceStatus() {
  try {
    const res = await fetch("/api/karyawan/today-attendance");
    const data = await res.json();
    const checkInStatus = document.getElementById("checkInStatus");
    const checkOutStatus = document.getElementById("checkOutStatus");
    const attendanceBadge = document.getElementById("attendanceBadge");

    if (data.success && data.data) {
      const attendance = data.data;
      if (checkInStatus) checkInStatus.textContent = attendance.check_in || "Belum absen";
      if (checkOutStatus) checkOutStatus.textContent = attendance.check_out || "Belum absen";
      if (attendanceBadge) {
        let statusText = "",
          statusClass = "";
        switch (attendance.status) {
          case "hadir":
            statusText = "Hadir";
            statusClass = "hadir";
            break;
          case "izin":
            statusText = "Izin";
            statusClass = "izin";
            break;
          case "sakit":
            statusText = "Sakit";
            statusClass = "sakit";
            break;
          default:
            statusText = "Belum absen";
            statusClass = "belum";
        }
        attendanceBadge.textContent = statusText;
        attendanceBadge.className = `status-badge ${statusClass}`;
      }
    }
  } catch (err) {
    console.error("Error loading today attendance:", err);
  }
}

async function handleCheckIn() {
  try {
    if (!navigator.onLine) {
      await Swal.fire({ icon: "error", title: "Tidak Ada Koneksi Internet", text: "Harap periksa koneksi internet Anda.", confirmButtonColor: "#ef4444" });
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      await Swal.fire({ icon: "error", title: "Kamera Tidak Didukung", text: "Browser Anda tidak mendukung akses kamera.", confirmButtonColor: "#ef4444" });
      return;
    }

    const result = await Swal.fire({
      title: "📍 Absen Masuk",
      html: `<div style="text-align: left;"><p style="font-weight: 600;">📋 Sebelum absen, pastikan:</p><ul><li>✅ GPS perangkat Anda aktif</li><li>✅ Browser diizinkan mengakses lokasi</li><li>✅ Kamera siap digunakan</li><li>✅ Anda berada di area store/toko</li></ul><div style="background: #f0fdf4; padding: 10px; border-radius: 10px;"><p style="font-size: 12px; margin: 0;"><i class="fas fa-info-circle"></i> Foto selfie akan digunakan sebagai bukti absensi</p></div></div>`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Ya, Saya Siap Absen",
      cancelButtonText: "Batal",
      confirmButtonColor: "#667eea",
      cancelButtonColor: "#ef4444",
    });
    if (!result.isConfirmed) return;

    let fotoBase64 = null;
    try {
      fotoBase64 = await takePhotoWithPreview();
    } catch (err) {
      if (err.message === "Pengambilan foto dibatalkan") return;
      await Swal.fire({ icon: "error", title: "Gagal Mengambil Foto", text: err.message, confirmButtonColor: "#ef4444" });
      return;
    }

    const loadingLocation = Swal.fire({
      title: "📍 Mendeteksi Lokasi...",
      html: `<div class="loading-location"><i class="fas fa-map-marker-alt fa-spin" style="font-size: 48px; color: #667eea;"></i><p>Mengambil data GPS Anda...</p><p class="small-text">Harap izinkan akses lokasi jika diminta</p></div>`,
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    });

    let location = null;
    try {
      location = await getCurrentLocation();
      await loadingLocation.close();
    } catch (err) {
      await loadingLocation.close();
      await Swal.fire({ icon: "error", title: "Gagal Mendapatkan Lokasi", html: `<p>${err.message}</p><p class="small-text">Aktifkan GPS dan izinkan akses lokasi</p>`, confirmButtonColor: "#ef4444" });
      return;
    }

    const prosesSwal = Swal.fire({ title: "Memproses Absen...", text: "Sedang memverifikasi lokasi dan menyimpan foto", allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });

    const res = await fetch("/api/karyawan/check-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: location.latitude, longitude: location.longitude, foto: fotoBase64 }),
    });
    const data = await res.json();
    await prosesSwal.close();

    if (data.success) {
      await Swal.fire({
        icon: "success",
        title: "✅ Absen Masuk Berhasil!",
        html: `<div style="text-align: center;"><p><strong>Waktu:</strong> ${data.data.time}</p><p><strong>Lokasi:</strong> ${data.data.store_name}</p><p><strong>Jarak:</strong> ${data.data.distance} meter</p><p style="color: #10b981;">✓ Foto selfie telah tersimpan</p></div>`,
        confirmButtonColor: "#667eea",
      });
      loadTodayAttendanceStatus();
      closeAttendanceMenu();
    } else if (data.code === "OUT_OF_RANGE") {
      await Swal.fire({
        icon: "error",
        title: "⛔ Di Luar Area Absensi!",
        html: `<p>Jarak Anda: ${data.data.distance} meter</p><p>Maksimal jarak: ${data.data.maxDistance} meter</p><p>Silakan mendekat ke area store/toko.</p>`,
        confirmButtonColor: "#ef4444",
      });
    } else {
      await Swal.fire({ icon: "error", title: "Gagal", text: data.message, confirmButtonColor: "#ef4444" });
    }
  } catch (err) {
    console.error("Check In error:", err);
    Swal.close();
    await Swal.fire({ icon: "error", title: "Terjadi Kesalahan", text: err.message || "Silakan coba lagi", confirmButtonColor: "#ef4444" });
  }
}

async function handleCheckOut() {
  try {
    if (!navigator.onLine) {
      await Swal.fire({ icon: "error", title: "Tidak Ada Koneksi Internet", text: "Harap periksa koneksi internet Anda.", confirmButtonColor: "#ef4444" });
      return;
    }

    const result = await Swal.fire({
      title: "📍 Absen Pulang",
      html: `<div style="text-align: left;"><p>Pastikan Anda sudah:</p><ul><li>Menyelesaikan semua pekerjaan</li><li>Berada di area store/toko</li><li>GPS perangkat aktif</li><li>Kamera siap digunakan</li></ul></div>`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Ya, Absen Pulang",
      cancelButtonText: "Batal",
      confirmButtonColor: "#667eea",
      cancelButtonColor: "#ef4444",
    });
    if (!result.isConfirmed) return;

    let fotoBase64 = null;
    try {
      fotoBase64 = await takePhotoWithPreview();
    } catch (err) {
      if (err.message === "Pengambilan foto dibatalkan") return;
      await Swal.fire({ icon: "error", title: "Gagal Mengambil Foto", text: err.message, confirmButtonColor: "#ef4444" });
      return;
    }

    const loadingLocation = Swal.fire({ title: "Mendeteksi Lokasi...", text: "Mengambil data GPS Anda", allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
    let location = null;
    try {
      location = await getCurrentLocation();
      await loadingLocation.close();
    } catch (err) {
      await loadingLocation.close();
      await Swal.fire({ icon: "error", title: "Gagal Mendapatkan Lokasi", html: `<p>${err.message}</p><p>Aktifkan GPS dan izinkan akses lokasi</p>`, confirmButtonColor: "#ef4444" });
      return;
    }

    const prosesSwal = Swal.fire({ title: "Memproses Absen...", text: "Sedang memverifikasi lokasi", allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
    const res = await fetch("/api/karyawan/check-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: location.latitude, longitude: location.longitude, foto: fotoBase64 }),
    });
    const data = await res.json();
    await prosesSwal.close();

    if (data.success) {
      await Swal.fire({
        icon: "success",
        title: "✅ Absen Pulang Berhasil!",
        html: `<div style="text-align: center;"><p><strong>Waktu:</strong> ${data.data.time}</p><p><strong>Lokasi:</strong> ${data.data.store_name}</p><p><strong>Jarak:</strong> ${data.data.distance} meter</p><p style="color: #10b981;">✓ Foto selfie telah tersimpan</p></div>`,
        confirmButtonColor: "#667eea",
      });
      loadTodayAttendanceStatus();
      closeAttendanceMenu();
    } else if (data.code === "OUT_OF_RANGE") {
      await Swal.fire({
        icon: "error",
        title: "⛔ Di Luar Area Absensi!",
        html: `<p>Jarak Anda: ${data.data.distance} meter</p><p>Maksimal jarak: ${data.data.maxDistance} meter</p><p>Silakan mendekat ke area store/toko.</p>`,
        confirmButtonColor: "#ef4444",
      });
    } else {
      await Swal.fire({ icon: "error", title: "Gagal", text: data.message, confirmButtonColor: "#ef4444" });
    }
  } catch (err) {
    console.error("Check Out error:", err);
    Swal.close();
    await Swal.fire({ icon: "error", title: "Terjadi Kesalahan", text: err.message || "Silakan coba lagi", confirmButtonColor: "#ef4444" });
  }
}

function handlePermit() {
  // Reset form
  document.getElementById("permitStartDate").value = "";
  document.getElementById("permitEndDate").value = "";
  document.getElementById("permitReason").value = "";
  document.querySelector('input[name="permitType"][value="izin"]').checked = true;

  // Tampilkan modal
  document.getElementById("permitModal").style.display = "flex";
}

// Fungsi submit untuk modal HTML
async function submitPermit() {
  const type = document.querySelector('input[name="permitType"]:checked').value;
  const startDate = document.getElementById("permitStartDate").value;
  const endDate = document.getElementById("permitEndDate").value;
  const reason = document.getElementById("permitReason").value;

  console.log("Form values:", { type, startDate, endDate, reason });

  // Validasi
  if (!startDate) {
    Swal.fire({
      icon: "warning",
      title: "Perhatian",
      text: "Harap pilih tanggal mulai!",
      confirmButtonColor: "#667eea",
    });
    return;
  }

  if (!reason || reason.trim() === "") {
    Swal.fire({
      icon: "warning",
      title: "Perhatian",
      text: "Harap isi alasan!",
      confirmButtonColor: "#667eea",
    });
    return;
  }

  try {
    Swal.fire({
      title: "Memproses...",
      text: "Sedang mengajukan permohonan",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const res = await fetch("/api/karyawan/permit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: type,
        reason: reason,
        startDate: startDate,
        endDate: endDate || startDate,
      }),
    });

    const data = await res.json();
    Swal.close();

    if (data.success) {
      Swal.fire({
        icon: "success",
        title: "Pengajuan Berhasil!",
        html: `Jenis: <strong>${type === "izin" ? "Izin" : "Sakit"}</strong><br>${data.message}`,
        confirmButtonColor: "#667eea",
      });

      closePermitModal();
      loadTodayAttendanceStatus();
      closeAttendanceMenu();
    } else {
      Swal.fire({
        icon: "error",
        title: "Gagal",
        text: data.message,
        confirmButtonColor: "#ef4444",
      });
    }
  } catch (err) {
    console.error("Permit error:", err);
    Swal.close();
    Swal.fire({
      icon: "error",
      title: "Error",
      text: err.message || "Terjadi kesalahan saat mengajukan izin",
      confirmButtonColor: "#ef4444",
    });
  }
}

function closePermitModal() {
  document.getElementById("permitModal").style.display = "none";
}
async function viewAttendanceHistory() {
  try {
    Swal.fire({ title: "Memuat data...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const res = await fetch("/api/karyawan/attendance-history?limit=30");
    const data = await res.json();
    Swal.close();

    if (!data.success || !data.data || data.data.length === 0) {
      Swal.fire({ icon: "info", title: "Belum Ada Data", text: "Anda belum memiliki riwayat absensi.", confirmButtonColor: "#667eea" });
      return;
    }

    let historyHTML = '<div style="max-height: 400px; overflow-y: auto;">';
    data.data.forEach((item) => {
      let statusText = "",
        statusColor = "";
      switch (item.status) {
        case "hadir":
          statusText = "Hadir";
          statusColor = "#10b981";
          break;
        case "izin":
          statusText = "Izin";
          statusColor = "#ef4444";
          break;
        case "sakit":
          statusText = "Sakit";
          statusColor = "#ef4444";
          break;
        default:
          statusText = "Alpha";
          statusColor = "#94a3b8";
      }
      historyHTML += `<div style="padding: 12px; margin-bottom: 8px; background: #f8fafc; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><strong>${item.date || "-"}</strong><span style="color: ${statusColor}">${statusText}</span></div>
        <div style="font-size: 13px; color: #64748b;">Check In: ${item.check_in || "-"} | Check Out: ${item.check_out || "-"}</div>
        ${item.reason ? `<div style="font-size: 12px; margin-top: 4px;">Alasan: ${escapeHtml(item.reason)}</div>` : ""}
      </div>`;
    });
    historyHTML += "</div>";
    Swal.fire({ title: "Riwayat Absensi (30 hari terakhir)", html: historyHTML, confirmButtonText: "Tutup", confirmButtonColor: "#667eea" });
    closeAttendanceMenu();
  } catch (err) {
    Swal.close();
    Swal.fire({ icon: "error", title: "Error", text: err.message, confirmButtonColor: "#ef4444" });
  }
}

function viewMonthlyReport() {
  // Isi dropdown tahun
  const now = new Date();
  const currentYear = now.getFullYear();
  const reportYearSelect = document.getElementById("reportYear");

  if (reportYearSelect) {
    reportYearSelect.innerHTML = "";
    for (let year = currentYear - 2; year <= currentYear + 1; year++) {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      if (year === currentYear) {
        option.selected = true;
      }
      reportYearSelect.appendChild(option);
    }
  }

  // Set default bulan ke bulan saat ini
  const currentMonth = now.getMonth() + 1;
  const reportMonthSelect = document.getElementById("reportMonth");
  if (reportMonthSelect) {
    reportMonthSelect.value = currentMonth;
  }

  // Reset content
  const reportContent = document.getElementById("reportContent");
  if (reportContent) {
    reportContent.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-chart-line"></i>
        <p>Pilih bulan dan tahun untuk melihat rekap</p>
      </div>
    `;
  }

  // Tampilkan modal
  const modal = document.getElementById("monthlyReportModal");
  if (modal) {
    modal.style.display = "flex";
  }

  closeAttendanceMenu();
}

function closeMonthlyReportModal() {
  const modal = document.getElementById("monthlyReportModal");
  if (modal) {
    modal.style.display = "none";
  }
}

async function loadMonthlyReport() {
  const month = document.getElementById("reportMonth").value;
  const year = document.getElementById("reportYear").value;
  const reportContent = document.getElementById("reportContent");

  if (!month || !year) {
    reportContent.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Harap pilih bulan dan tahun terlebih dahulu</p>
      </div>
    `;
    return;
  }

  try {
    // Tampilkan loading
    reportContent.innerHTML = `
      <div class="loading-spinner">
        <div class="spinner-small"></div>
        <p>Memuat data...</p>
      </div>
    `;

    const res = await fetch(`/api/karyawan/monthly-report?month=${month}&year=${year}`);
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.message || "Gagal mengambil data");
    }

    const stats = data.data;
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const monthName = monthNames[parseInt(month) - 1];

    // Hitung persentase kehadiran
    const totalHadir = stats.hadir || 0;
    const totalHari = stats.total_hari || 0;
    const persentase = totalHari > 0 ? Math.round((totalHadir / totalHari) * 100) : 0;

    // Buat HTML laporan
    const reportHtml = `
      <div class="report-container">
        <div class="report-header">
          <h4>Laporan Kehadiran</h4>
          <p>${monthName} ${year}</p>
        </div>
        
        <div class="report-stats">
          <div class="stat-card hadir">
            <div class="stat-icon">
              <i class="fas fa-check-circle"></i>
            </div>
            <div class="stat-number">${stats.hadir || 0}</div>
            <div class="stat-label">Hadir</div>
          </div>
          
          <div class="stat-card izin">
            <div class="stat-icon">
              <i class="fas fa-file-alt"></i>
            </div>
            <div class="stat-number">${stats.izin || 0}</div>
            <div class="stat-label">Izin</div>
          </div>
          
          <div class="stat-card sakit">
            <div class="stat-icon">
              <i class="fas fa-notes-medical"></i>
            </div>
            <div class="stat-number">${stats.sakit || 0}</div>
            <div class="stat-label">Sakit</div>
          </div>
          
          <div class="stat-card alpha">
            <div class="stat-icon">
              <i class="fas fa-times-circle"></i>
            </div>
            <div class="stat-number">${stats.alpha || 0}</div>
            <div class="stat-label">Alpha</div>
          </div>
        </div>
        
        <div class="report-summary">
          <div class="summary-item">
            <span class="summary-label">Total Hari Kerja</span>
            <span class="summary-value">${stats.total_hari_kerja || 0} Hari</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Total Kehadiran</span>
            <span class="summary-value">${totalHari} Hari</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Persentase Kehadiran</span>
            <span class="summary-value ${persentase >= 80 ? "high" : persentase >= 60 ? "medium" : "low"}">
              ${persentase}%
            </span>
          </div>
        </div>
        
        <div class="progress-bar-container">
          <div class="progress-label">
            <span>Tingkat Kehadiran</span>
            <span>${persentase}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${persentase}%;"></div>
          </div>
        </div>
      </div>
    `;

    reportContent.innerHTML = reportHtml;
  } catch (err) {
    console.error("Load monthly report error:", err);
    reportContent.innerHTML = `
      <div class="empty-state error">
        <i class="fas fa-exclamation-circle"></i>
        <p>Gagal memuat data: ${err.message}</p>
        <button class="btn-retry" onclick="loadMonthlyReport()">
          <i class="fas fa-redo-alt"></i> Coba Lagi
        </button>
      </div>
    `;
  }
}

function getMonthName(monthNumber) {
  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  return monthNames[monthNumber - 1] || "Januari";
}

function generateYearOptions(currentYear) {
  let options = "";
  for (let year = currentYear - 2; year <= currentYear + 1; year++) {
    options += `<option value="${year}" ${year === currentYear ? "selected" : ""}>${year}</option>`;
  }
  return options;
}

function openAttendanceMenu() {
  const modal = document.getElementById("attendanceMenuModal");
  if (modal) {
    modal.style.display = "flex";
    loadTodayAttendanceStatus();
  }
}

function closeAttendanceMenu() {
  const modal = document.getElementById("attendanceMenuModal");
  if (modal) modal.style.display = "none";
}

// Submit Izin / Sakit
function submitPermit() {
  const type = document.querySelector('input[name="permitType"]:checked').value;
  const startDate = document.getElementById("permitStartDate").value;
  const endDate = document.getElementById("permitEndDate").value;
  const reason = document.getElementById("permitReason").value;

  console.log("Type:", type);
  console.log("Start Date:", startDate);
  console.log("End Date:", endDate);
  console.log("Reason:", reason);

  // Validasi
  if (!startDate) {
    Swal.fire({
      icon: "warning",
      title: "Perhatian",
      text: "Harap pilih tanggal mulai!",
      confirmButtonColor: "#667eea",
    });
    return;
  }

  if (!reason || reason.trim() === "") {
    Swal.fire({
      icon: "warning",
      title: "Perhatian",
      text: "Harap isi alasan!",
      confirmButtonColor: "#667eea",
    });
    return;
  }

  submitPermitToServer(type, reason, startDate, endDate || startDate);
}

async function submitPermitToServer(type, reason, startDate, endDate) {
  try {
    Swal.fire({
      title: "Memproses...",
      text: "Sedang mengajukan permohonan",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const res = await fetch("/api/karyawan/permit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: type,
        reason: reason,
        startDate: startDate,
        endDate: endDate,
      }),
    });

    const data = await res.json();
    Swal.close();

    if (data.success) {
      Swal.fire({
        icon: "success",
        title: "Pengajuan Berhasil!",
        html: `Jenis: <strong>${type === "izin" ? "Izin" : "Sakit"}</strong><br>${data.message}`,
        confirmButtonColor: "#667eea",
      });

      closePermitModal();
      loadTodayAttendanceStatus();
      closeAttendanceMenu();
    } else {
      Swal.fire({
        icon: "error",
        title: "Gagal",
        text: data.message,
        confirmButtonColor: "#ef4444",
      });
    }
  } catch (err) {
    console.error("Permit error:", err);
    Swal.close();
    Swal.fire({
      icon: "error",
      title: "Error",
      text: err.message || "Terjadi kesalahan saat mengajukan izin",
      confirmButtonColor: "#ef4444",
    });
  }
}

function closePermitModal() {
  const modal = document.getElementById("permitModal");
  if (modal) {
    modal.style.display = "none";
  }
  // Reset form
  document.getElementById("permitStartDate").value = "";
  document.getElementById("permitEndDate").value = "";
  document.getElementById("permitReason").value = "";
}

function openPermitModal() {
  const modal = document.getElementById("permitModal");
  if (modal) {
    modal.style.display = "flex";
  }
}

function closePermitModal() {
  document.getElementById("permitModal").style.display = "none";
  document.getElementById("permitForm").reset();
}

// Download Name Tag
async function downloadNameTag() {
  try {
    Swal.fire({
      title: "Membuat Name Tag...",
      text: "Sedang memproses name tag Anda",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const res = await fetch("/api/karyawan/download-nametag");

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || "Gagal mengunduh name tag");
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Nametag_${profileData?.nama_lengkap?.replace(/\s/g, "_") || "Karyawan"}.pdf`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    Swal.fire({
      icon: "success",
      title: "Berhasil!",
      text: "Name tag berhasil diunduh",
      confirmButtonColor: "#667eea",
    });
  } catch (err) {
    console.error("Error downloading name tag:", err);
    Swal.fire({
      icon: "error",
      title: "Gagal",
      text: err.message,
      confirmButtonColor: "#ef4444",
    });
  }
}

// Load profile on page load
loadProfile();
