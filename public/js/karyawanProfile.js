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

// Fungsi untuk mengambil slip gaji bulan berjalan
async function loadCurrentMonthSlip() {
  try {
    const res = await fetch("/api/karyawan/current-slip");
    const data = await res.json();

    if (data.success && data.data) {
      currentSlipData = data.data;
      console.log("Current month slip data:", currentSlipData);
    } else {
      currentSlipData = null;
      console.log("No slip data for current month");
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
      console.log("No bonus data for current month");
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
      console.log("No THR data for current year");
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

    const res = await fetch("/api/karyawan/download-slip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slipData: currentSlipData,
        company: company,
      }),
    });

    if (!res.ok) {
      throw new Error("Gagal mengunduh slip");
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

    const res = await fetch("/api/karyawan/download-bonus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bonusData: currentBonusData,
        company: company,
      }),
    });

    if (!res.ok) {
      throw new Error("Gagal mengunduh bonus");
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

    const res = await fetch("/api/karyawan/download-thr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        thrData: currentThrData,
        company: company,
      }),
    });

    if (!res.ok) {
      throw new Error("Gagal mengunduh THR");
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
  const company = data.company;

  console.log("Rendering profile with data:", profile);
  console.log("Company:", company);
  console.log("Foto diri URL:", profile.foto_diri_url);
  console.log("Foto KTP URL:", profile.foto_ktp_url);

  let fotoDiriUrl = "https://ui-avatars.com/api/?background=6366f1&color=fff&rounded=true&bold=true&size=200&name=" + encodeURIComponent(profile.nama_lengkap);
  let fotoKtpUrl = null;

  if (profile.foto_diri_url && profile.foto_diri_url !== "" && profile.foto_diri_url !== "null") {
    fotoDiriUrl = profile.foto_diri_url;
    console.log("Using foto_diri_url:", fotoDiriUrl);
  } else {
    console.log("No foto_diri_url found, using avatar fallback");
  }

  if (profile.foto_ktp_url && profile.foto_ktp_url !== "" && profile.foto_ktp_url !== "null") {
    fotoKtpUrl = profile.foto_ktp_url;
    console.log("Using foto_ktp_url:", fotoKtpUrl);
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
        <!-- Data Diri -->
        <div class="info-section">
          <div class="info-title">
            <i class="fas fa-id-card"></i> Data Diri
          </div>
          <div class="info-grid">
            <div class="info-item">
              <i class="fas fa-hashtag"></i>
              <div>
                <div class="info-label">No Induk</div>
                <div class="info-value">${escapeHtml(profile.no_induk || "-")}</div>
              </div>
            </div>
            <div class="info-item">
              <i class="fas fa-id-card"></i>
              <div>
                <div class="info-label">NIK</div>
                <div class="info-value">${escapeHtml(profile.nik || "-")}</div>
              </div>
            </div>
            <div class="info-item">
              <i class="fas fa-user"></i>
              <div>
                <div class="info-label">Nama Lengkap</div>
                <div class="info-value">${escapeHtml(profile.nama_lengkap || "-")}</div>
              </div>
            </div>
            <div class="info-item">
              <i class="fas fa-calendar"></i>
              <div>
                <div class="info-label">Tanggal Lahir</div>
                <div class="info-value">${profile.tanggal_lahir_formatted || formatDate(profile.tanggal_lahir)}</div>
              </div>
            </div>
            <div class="info-item">
              <i class="fas fa-map-marker-alt"></i>
              <div>
                <div class="info-label">Alamat Domisili</div>
                <div class="info-value">${escapeHtml(profile.alamat_domisili || "-")}</div>
              </div>
            </div>
            <div class="info-item">
              <i class="fas fa-phone"></i>
              <div>
                <div class="info-label">No HP</div>
                <div class="info-value">${escapeHtml(profile.no_hp || "-")}</div>
              </div>
            </div>
            <div class="info-item">
              <i class="fas fa-envelope"></i>
              <div>
                <div class="info-label">Email</div>
                <div class="info-value">${escapeHtml(profile.email || "-")}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Data Perusahaan -->
        <div class="info-section">
          <div class="info-title">
            <i class="fas fa-briefcase"></i> Data Perusahaan
          </div>
          <div class="info-grid">
            <div class="info-item">
              <i class="fas fa-store"></i>
              <div>
                <div class="info-label">Nama Gerai (Store)</div>
                <div class="info-value">${escapeHtml(profile.nama_gerai || "-")}</div>
              </div>
            </div>
            <div class="info-item">
              <i class="fas fa-location-dot"></i>
              <div>
                <div class="info-label">Cabang (Alamat Store)</div>
                <div class="info-value">${escapeHtml(profile.cabang || "-")}</div>
              </div>
            </div>
            <div class="info-item">
              <i class="fas fa-chart-line"></i>
              <div>
                <div class="info-label">Jabatan</div>
                <div class="info-value">${escapeHtml(profile.jabatan || "-")}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Foto KTP -->
        ${
          fotoKtpUrl
            ? `
        <div class="info-section">
          <div class="info-title">
            <i class="fas fa-id-card"></i> Dokumen KTP
          </div>
          <div class="photo-ktp">
            <img src="${fotoKtpUrl}" alt="Foto KTP" onclick="showImageModal(this.src)" 
                 onerror="this.onerror=null; this.style.display='none'; this.parentElement.innerHTML='<p class=\\'photo-error\\' style=\\'text-align:center; color:#999; padding:20px;\\'><i class=\\'fas fa-image\\' style=\\'font-size:48px;\\'></i><br>Foto KTP tidak tersedia</p>'">
            <p class="photo-caption">Klik untuk memperbesar</p>
          </div>
        </div>
        `
            : '<div class="info-section"><div class="info-title"><i class="fas fa-id-card"></i> Dokumen KTP</div><div class="photo-ktp" style="text-align:center; padding:20px; color:#999;"><i class="fas fa-image" style="font-size:48px;"></i><p>Belum ada foto KTP</p></div></div>'
        }

        <!-- Data Penggajian -->
        <div class="salary-section">
          <div class="info-title">
            <i class="fas fa-money-bill-wave"></i> Data Penggajian
          </div>
          <div class="salary-tabs">
            <button class="tab-btn active" onclick="showTab('slip')">Slip Gaji</button>
            <button class="tab-btn" onclick="showTab('bonus')">Bonus</button>
            <button class="tab-btn" onclick="showTab('thr')">THR</button>
          </div>
          <div id="slipTab" class="tab-content active">
            ${renderCurrentSlip()}
          </div>
          <div id="bonusTab" class="tab-content">
            ${renderCurrentBonus()}
          </div>
          <div id="thrTab" class="tab-content">
            ${renderCurrentThr()}
          </div>
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
    return `
      <div class="empty-state">
        <i class="fas fa-folder-open"></i>
        <p>Belum ada data slip gaji untuk ${currentMonth} ${currentYear}</p>
      </div>
    `;
  }

  const formatRupiahDisplay = (amount) => {
    if (!amount && amount !== 0) return "Rp 0";
    return `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;
  };

  let totalGaji = 0;
  if (company === "hisana") {
    totalGaji = currentSlipData.gaji_total || 0;
  } else {
    totalGaji = currentSlipData.total_gaji || 0;
  }

  return `
    <div class="salary-card current-slip-card" style="text-align: center;">
      <div style="padding: 30px 20px;">
        <i class="fas fa-file-invoice-dollar" style="font-size: 48px; color: #667eea; margin-bottom: 15px;"></i>
        <h3 style="margin-bottom: 10px; color: #333;">Slip Gaji ${currentMonth} ${currentYear}</h3>
        <div style="background: #EEF2FF; padding: 15px; border-radius: 12px; margin: 20px 0;">
          <p style="color: #667eea; font-weight: 600; margin-bottom: 5px;">Total Gaji</p>
          <p style="font-size: 24px; font-weight: bold; color: #10B981;">${formatRupiahDisplay(totalGaji)}</p>
        </div>
        <p style="margin-bottom: 20px; color: #6c757d; font-size: 14px;">
          Klik tombol di bawah untuk mengunduh slip gaji lengkap
        </p>
        <button class="btn-download-slip" onclick="downloadSlip()">
          <i class="fas fa-download"></i> Unduh Slip Gaji
        </button>
      </div>
    </div>
  `;
}

function renderCurrentBonus() {
  const now = new Date();
  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const currentMonth = monthNames[now.getMonth()];
  const currentYear = now.getFullYear();

  if (!currentBonusData) {
    return `
      <div class="empty-state">
        <i class="fas fa-gift"></i>
        <p>Belum ada data bonus untuk ${currentMonth} ${currentYear}</p>
      </div>
    `;
  }

  const formatRupiahDisplay = (amount) => {
    if (!amount && amount !== 0) return "Rp 0";
    return `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;
  };

  const bonusMonth = currentBonusData.bulan || now.getMonth() + 1;
  const bonusYear = currentBonusData.tahun || now.getFullYear();
  const monthIndex = bonusMonth - 1;
  const monthName = monthNames[monthIndex] || currentMonth;

  return `
    <div class="salary-card current-bonus-card" style="text-align: center;">
      <div style="padding: 30px 20px;">
        <i class="fas fa-gift" style="font-size: 48px; color: #F59E0B; margin-bottom: 15px;"></i>
        <h3 style="margin-bottom: 10px; color: #333;">Bonus ${monthName} ${bonusYear}</h3>
        <div style="background: #FEF3C7; padding: 15px; border-radius: 12px; margin: 20px 0;">
          <p style="color: #F59E0B; font-weight: 600; margin-bottom: 5px;">Jumlah Bonus</p>
          <p style="font-size: 24px; font-weight: bold; color: #16A34A;">${formatRupiahDisplay(currentBonusData.jumlah_bonus)}</p>
        </div>
        ${
          currentBonusData.keterangan
            ? `
          <p style="margin: 15px 0; color: #6c757d;">
            <i class="fas fa-info-circle"></i> Keterangan: ${escapeHtml(currentBonusData.keterangan)}
          </p>
        `
            : ""
        }
        <p style="margin-bottom: 20px; color: #6c757d; font-size: 14px;">
          Klik tombol di bawah untuk mengunduh slip bonus lengkap
        </p>
        <button class="btn-download-bonus" onclick="downloadBonus()">
          <i class="fas fa-download"></i> Unduh Slip Bonus
        </button>
      </div>
    </div>
  `;
}

function renderCurrentThr() {
  const now = new Date();
  const currentYear = now.getFullYear();

  if (!currentThrData) {
    return `
      <div class="empty-state">
        <i class="fas fa-star-of-life"></i>
        <p>Belum ada data THR untuk tahun ${currentYear}</p>
      </div>
    `;
  }

  const formatRupiahDisplay = (amount) => {
    if (!amount && amount !== 0) return "Rp 0";
    return `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;
  };

  const thrYear = currentThrData.tahun || currentYear;

  return `
    <div class="salary-card current-thr-card" style="text-align: center;">
      <div style="padding: 30px 20px;">
        <i class="fas fa-star-of-life" style="font-size: 48px; color: #065F46; margin-bottom: 15px;"></i>
        <h3 style="margin-bottom: 10px; color: #333;">THR ${thrYear}</h3>
        <div style="background: #ECFDF5; padding: 15px; border-radius: 12px; margin: 20px 0;">
          <p style="color: #065F46; font-weight: 600; margin-bottom: 5px;">Jumlah THR</p>
          <p style="font-size: 24px; font-weight: bold; color: #10B981;">${formatRupiahDisplay(currentThrData.jumlah_thr)}</p>
        </div>
        <p style="margin-bottom: 20px; color: #6c757d; font-size: 14px;">
          Klik tombol di bawah untuk mengunduh slip THR lengkap
        </p>
        <button class="btn-download-thr" onclick="downloadThr()">
          <i class="fas fa-download"></i> Unduh Slip THR
        </button>
      </div>
    </div>
  `;
}

function showTab(tabName) {
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach((btn) => btn.classList.remove("active"));

  const clickedBtn = Array.from(buttons).find((btn) => {
    const onclickAttr = btn.getAttribute("onclick");
    return onclickAttr && onclickAttr.includes(tabName);
  });
  if (clickedBtn) clickedBtn.classList.add("active");

  const slipTab = document.getElementById("slipTab");
  const bonusTab = document.getElementById("bonusTab");
  const thrTab = document.getElementById("thrTab");

  if (slipTab) slipTab.classList.remove("active");
  if (bonusTab) bonusTab.classList.remove("active");
  if (thrTab) thrTab.classList.remove("active");

  const selectedTab = document.getElementById(`${tabName}Tab`);
  if (selectedTab) selectedTab.classList.add("active");
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
      body: JSON.stringify({
        no_hp: noHp,
        email: email,
        alamat_domisili: alamat,
      }),
    });

    const data = await res.json();

    if (data.success) {
      Swal.fire({
        icon: "success",
        title: "Berhasil!",
        text: "Profil berhasil diupdate",
        confirmButtonColor: "#667eea",
      });
      closeEditModal();
      loadProfile();
    } else {
      throw new Error(data.message);
    }
  } catch (err) {
    Swal.fire({
      icon: "error",
      title: "Gagal",
      text: err.message,
      confirmButtonColor: "#667eea",
    });
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
    Swal.fire({
      icon: "warning",
      title: "Perhatian",
      text: "Semua field harus diisi",
      confirmButtonColor: "#667eea",
    });
    return;
  }

  if (newPassword.length < 6) {
    Swal.fire({
      icon: "warning",
      title: "Perhatian",
      text: "Password baru minimal 6 karakter",
      confirmButtonColor: "#667eea",
    });
    return;
  }

  if (newPassword !== confirmPassword) {
    Swal.fire({
      icon: "warning",
      title: "Perhatian",
      text: "Password baru dan konfirmasi tidak cocok",
      confirmButtonColor: "#667eea",
    });
    return;
  }

  try {
    const res = await fetch("/api/karyawan/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: currentPassword,
        newPassword: newPassword,
      }),
    });

    const data = await res.json();

    if (data.success) {
      Swal.fire({
        icon: "success",
        title: "Berhasil!",
        text: "Password berhasil diubah. Silakan login kembali.",
        confirmButtonColor: "#667eea",
      }).then(() => {
        window.location.href = "/logout";
      });
    } else {
      throw new Error(data.message);
    }
  } catch (err) {
    Swal.fire({
      icon: "error",
      title: "Gagal",
      text: err.message,
      confirmButtonColor: "#667eea",
    });
  }
}

// =============================
// HELPER FUNCTIONS
// =============================
function showImageModal(src) {
  Swal.fire({
    imageUrl: src,
    imageAlt: "Foto KTP",
    showCloseButton: true,
    showConfirmButton: false,
    width: "auto",
    customClass: {
      popup: "image-modal",
    },
  });
}

function formatDate(dateString) {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch (e) {
    return "-";
  }
}

function formatRupiah(amount) {
  if (!amount && amount !== 0) return "0";
  return new Intl.NumberFormat("id-ID").format(amount);
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

  if (result.isConfirmed) {
    window.location.href = "/logout";
  }
}

// Close modals when clicking outside
window.onclick = function (event) {
  const editModal = document.getElementById("editProfileModal");
  const passwordModal = document.getElementById("changePasswordModal");
  const attendanceModal = document.getElementById("attendanceMenuModal");

  if (event.target === editModal) {
    closeEditModal();
  }
  if (event.target === passwordModal) {
    closePasswordModal();
  }
  if (event.target === attendanceModal) {
    closeAttendanceMenu();
  }
};

// =============================
// ABSENSI FUNCTIONS
// =============================

// Fungsi untuk mendapatkan lokasi pengguna
function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation tidak didukung oleh browser ini"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
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
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  });
}

// Load status absensi hari ini dari database
async function loadTodayAttendanceStatus() {
  try {
    const res = await fetch("/api/karyawan/today-attendance");
    const data = await res.json();

    const checkInStatus = document.getElementById("checkInStatus");
    const checkOutStatus = document.getElementById("checkOutStatus");
    const attendanceBadge = document.getElementById("attendanceBadge");

    if (data.success && data.data) {
      const attendance = data.data;

      if (checkInStatus) {
        checkInStatus.textContent = attendance.check_in || "Belum absen";
      }
      if (checkOutStatus) {
        checkOutStatus.textContent = attendance.check_out || "Belum absen";
      }
      if (attendanceBadge) {
        let statusText = "";
        let statusClass = "";

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
          case "belum":
            statusText = "Belum absen";
            statusClass = "belum";
            break;
          default:
            statusText = attendance.status === "alpha" ? "Alpha" : "Belum absen";
            statusClass = attendance.status === "alpha" ? "alpha" : "belum";
        }

        attendanceBadge.textContent = statusText;
        attendanceBadge.className = `status-badge ${statusClass}`;
      }
    } else {
      if (checkInStatus) checkInStatus.textContent = "Belum absen";
      if (checkOutStatus) checkOutStatus.textContent = "Belum absen";
      if (attendanceBadge) {
        attendanceBadge.textContent = "Belum absen";
        attendanceBadge.className = "status-badge belum";
      }
    }
  } catch (err) {
    console.error("Error loading today attendance:", err);
  }
}

// Check In - Absen Masuk (Flexible)
async function handleCheckIn() {
  try {
    Swal.fire({
      title: "Mengambil lokasi...",
      text: "Harap izinkan akses lokasi untuk absensi",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    let location = null;
    try {
      location = await getCurrentLocation();
    } catch (err) {
      Swal.close();
      const confirmLocation = await Swal.fire({
        icon: "warning",
        title: "Gagal Mendapatkan Lokasi",
        text: err.message + "\n\nApakah Anda tetap ingin absen tanpa lokasi?",
        showCancelButton: true,
        confirmButtonText: "Ya, Tetap Absen",
        cancelButtonText: "Batal",
        confirmButtonColor: "#f59e0b",
      });

      if (!confirmLocation.isConfirmed) {
        return;
      }
    }

    Swal.fire({
      title: "Memproses...",
      text: "Sedang melakukan absen masuk",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const res = await fetch("/api/karyawan/check-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
      }),
    });

    const data = await res.json();
    Swal.close();

    if (data.success) {
      Swal.fire({
        icon: "success",
        title: "Absen Masuk Berhasil!",
        html: `Waktu: <strong>${data.data.time}</strong>`,
        confirmButtonColor: "#667eea",
      });

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
    console.error("Check In error:", err);
    Swal.close();
    Swal.fire({
      icon: "error",
      title: "Error",
      text: err.message || "Terjadi kesalahan saat absen masuk",
      confirmButtonColor: "#ef4444",
    });
  }
}

// Check Out - Absen Pulang (Flexible)
async function handleCheckOut() {
  try {
    Swal.fire({
      title: "Mengambil lokasi...",
      text: "Harap izinkan akses lokasi untuk absensi",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    let location = null;
    try {
      location = await getCurrentLocation();
    } catch (err) {
      Swal.close();
      const confirmLocation = await Swal.fire({
        icon: "warning",
        title: "Gagal Mendapatkan Lokasi",
        text: err.message + "\n\nApakah Anda tetap ingin absen tanpa lokasi?",
        showCancelButton: true,
        confirmButtonText: "Ya, Tetap Absen",
        cancelButtonText: "Batal",
        confirmButtonColor: "#f59e0b",
      });

      if (!confirmLocation.isConfirmed) {
        return;
      }
    }

    Swal.fire({
      title: "Memproses...",
      text: "Sedang melakukan absen pulang",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const res = await fetch("/api/karyawan/check-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
      }),
    });

    const data = await res.json();
    Swal.close();

    if (data.success) {
      Swal.fire({
        icon: "success",
        title: "Absen Pulang Berhasil!",
        html: `Waktu: <strong>${data.data.time}</strong>`,
        confirmButtonColor: "#667eea",
      });

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
    console.error("Check Out error:", err);
    Swal.close();
    Swal.fire({
      icon: "error",
      title: "Error",
      text: err.message || "Terjadi kesalahan saat absen pulang",
      confirmButtonColor: "#ef4444",
    });
  }
}

// Ajukan Izin / Sakit (Flexible)
async function handlePermit() {
  const { value: formValues } = await Swal.fire({
    title: "Ajukan Izin / Sakit",
    html: `
      <div style="text-align: left;">
        <label style="display: block; font-weight: 600;">Jenis</label>
        <select id="permitType" class="swal2-select" style="width: 100%; padding: 8px; border-radius: 8px; margin-bottom: 15px; margin-left:0;">
          <option value="izin">Izin</option>
          <option value="sakit">Sakit</option>
        </select>
        
        <label style="display: block; font-weight: 600;">Tanggal Mulai</label>
        <input type="date" id="startDate" class="swal2-input" style="width: 100%; margin-bottom: 15px; margin-left:0;">
        
        <label style="display: block; font-weight: 600;">Tanggal Selesai (Opsional)</label>
        <input type="date" id="endDate" class="swal2-input" style="width: 100%; margin-bottom: 15px; margin-left:0;">
        
        <label style="display: block; font-weight: 600;">Alasan</label>
        <textarea id="permitReason" class="swal2-textarea" rows="3" placeholder="Tuliskan alasan..." style="width: 100%; margin-left:0;"></textarea>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: "Ajukan",
    cancelButtonText: "Batal",
    confirmButtonColor: "#667eea",
    cancelButtonColor: "#ef4444",
    preConfirm: () => {
      const type = document.getElementById("permitType").value;
      const reason = document.getElementById("permitReason").value;
      const startDate = document.getElementById("startDate").value;
      const endDate = document.getElementById("endDate").value;

      if (!reason) {
        Swal.showValidationMessage("Harap isi alasan!");
        return false;
      }
      if (!startDate) {
        Swal.showValidationMessage("Harap pilih tanggal mulai!");
        return false;
      }

      return { type, reason, startDate, endDate: endDate || startDate };
    },
  });

  if (formValues) {
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
        body: JSON.stringify(formValues),
      });

      const data = await res.json();
      Swal.close();

      if (data.success) {
        Swal.fire({
          icon: "success",
          title: "Pengajuan Berhasil!",
          html: `Jenis: <strong>${formValues.type === "izin" ? "Izin" : "Sakit"}</strong><br>${data.message}`,
          confirmButtonColor: "#667eea",
        });

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
}

// View Attendance History
async function viewAttendanceHistory() {
  try {
    Swal.fire({
      title: "Memuat data...",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const res = await fetch("/api/karyawan/attendance-history?limit=30");
    const data = await res.json();
    Swal.close();

    if (!data.success || !data.data || data.data.length === 0) {
      Swal.fire({
        icon: "info",
        title: "Belum Ada Data",
        text: "Anda belum memiliki riwayat absensi.",
        confirmButtonColor: "#667eea",
      });
      return;
    }

    let historyHTML = '<div style="max-height: 400px; overflow-y: auto;">';

    data.data.forEach((item) => {
      let statusText = "";
      let statusColor = "";

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
        case "alpha":
          statusText = "Alpha";
          statusColor = "#94a3b8";
          break;
        default:
          statusText = item.status || "Alpha";
          statusColor = "#94a3b8";
      }

      historyHTML += `
        <div style="padding: 12px; margin-bottom: 8px; background: #f8fafc; border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <strong>${item.date || "-"}</strong>
            <span style="color: ${statusColor}">${statusText}</span>
          </div>
          <div style="font-size: 13px; color: #64748b;">
            Check In: ${item.check_in || "-"} | Check Out: ${item.check_out || "-"}
          </div>
          ${item.reason ? `<div style="font-size: 12px; color: #64748b; margin-top: 4px;">Alasan: ${escapeHtml(item.reason)}</div>` : ""}
        </div>
      `;
    });

    historyHTML += "</div>";

    Swal.fire({
      title: "Riwayat Absensi (30 hari terakhir)",
      html: historyHTML,
      confirmButtonText: "Tutup",
      confirmButtonColor: "#667eea",
    });

    closeAttendanceMenu();
  } catch (err) {
    console.error("View history error:", err);
    Swal.close();
    Swal.fire({
      icon: "error",
      title: "Error",
      text: err.message || "Terjadi kesalahan",
      confirmButtonColor: "#ef4444",
    });
  }
}

// View Monthly Report
async function viewMonthlyReport() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // JavaScript months are 0-11, so add 1
  const currentYear = now.getFullYear();

  console.log(`Current date: ${now}, Month: ${currentMonth}, Year: ${currentYear}`);

  const { value: dateRange } = await Swal.fire({
    title: "Pilih Bulan dan Tahun",
    html: `
      <div style="text-align: left;">
        <label style="display: block; font-weight: 600;">Bulan</label>
        <select id="reportMonthSelect" class="swal2-select" style="width: 100%; margin-bottom: 15px; padding: 8px; margin-left:0;">
          <option value="1" ${currentMonth === 1 ? "selected" : ""}>Januari</option>
          <option value="2" ${currentMonth === 2 ? "selected" : ""}>Februari</option>
          <option value="3" ${currentMonth === 3 ? "selected" : ""}>Maret</option>
          <option value="4" ${currentMonth === 4 ? "selected" : ""}>April</option>
          <option value="5" ${currentMonth === 5 ? "selected" : ""}>Mei</option>
          <option value="6" ${currentMonth === 6 ? "selected" : ""}>Juni</option>
          <option value="7" ${currentMonth === 7 ? "selected" : ""}>Juli</option>
          <option value="8" ${currentMonth === 8 ? "selected" : ""}>Agustus</option>
          <option value="9" ${currentMonth === 9 ? "selected" : ""}>September</option>
          <option value="10" ${currentMonth === 10 ? "selected" : ""}>Oktober</option>
          <option value="11" ${currentMonth === 11 ? "selected" : ""}>November</option>
          <option value="12" ${currentMonth === 12 ? "selected" : ""}>Desember</option>
        </select>
        
        <label style="display: block; font-weight: 600; margin-top: 10px;">Tahun</label>
        <select id="reportYearSelect" class="swal2-select" style="width: 100%; padding: 8px; margin-left:0;">
          ${generateYearOptions(currentYear)}
        </select>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: "Lihat Rekap",
    cancelButtonText: "Batal",
    confirmButtonColor: "#667eea",
    preConfirm: () => {
      const month = document.getElementById("reportMonthSelect").value;
      const year = document.getElementById("reportYearSelect").value;

      // Parse as integers
      const monthInt = parseInt(month, 10);
      const yearInt = parseInt(year, 10);

      console.log(`Selected - Month: ${monthInt} (${month}), Year: ${yearInt} (${year})`);

      // Validate
      if (isNaN(monthInt) || monthInt < 1 || monthInt > 12) {
        Swal.showValidationMessage("Bulan tidak valid!");
        return false;
      }

      if (isNaN(yearInt) || yearInt < 2000 || yearInt > 2100) {
        Swal.showValidationMessage("Tahun tidak valid!");
        return false;
      }

      return { month: monthInt, year: yearInt };
    },
  });

  if (dateRange) {
    try {
      Swal.fire({
        title: "Memuat data...",
        text: `Mengambil data untuk ${getMonthName(dateRange.month)} ${dateRange.year}`,
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      // Send request with correct parameters
      const url = `/api/karyawan/monthly-report?month=${dateRange.month}&year=${dateRange.year}`;
      console.log("Fetching URL:", url);

      const res = await fetch(url);
      const data = await res.json();
      Swal.close();

      console.log("API Response:", data);

      if (!data.success) {
        throw new Error(data.message || "Gagal mengambil data");
      }

      const stats = data.data;

      // Use the month from response or from selection
      const displayMonth = stats.month || dateRange.month;
      const displayYear = stats.year || dateRange.year;
      const monthName = getMonthName(displayMonth);

      // Create report HTML
      let reportHtml = `
        <div style="text-align: left;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h3 style="margin: 0; color: #333;">Laporan Kehadiran</h3>
            <p style="margin: 5px 0 0; color: #666;">${monthName} ${displayYear}</p>
          </div>
          
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px;">
            <div style="background: #d1fae5; padding: 15px; border-radius: 12px; text-align: center;">
              <div style="font-size: 28px; font-weight: bold; color: #065f46;">${stats.hadir || 0}</div>
              <div style="font-size: 13px; color: #065f46; margin-top: 5px;">
                <i class="fas fa-check-circle"></i> Hadir
              </div>
            </div>
            <div style="background: #fee2e2; padding: 15px; border-radius: 12px; text-align: center;">
              <div style="font-size: 28px; font-weight: bold; color: #dc2626;">${stats.izin || 0}</div>
              <div style="font-size: 13px; color: #dc2626; margin-top: 5px;">
                <i class="fas fa-file-alt"></i> Izin
              </div>
            </div>
            <div style="background: #fef3c7; padding: 15px; border-radius: 12px; text-align: center;">
              <div style="font-size: 28px; font-weight: bold; color: #d97706;">${stats.sakit || 0}</div>
              <div style="font-size: 13px; color: #d97706; margin-top: 5px;">
                <i class="fas fa-notes-medical"></i> Sakit
              </div>
            </div>
            <div style="background: #e0e7ff; padding: 15px; border-radius: 12px; text-align: center;">
              <div style="font-size: 28px; font-weight: bold; color: #4338ca;">${stats.alpha || 0}</div>
              <div style="font-size: 13px; color: #4338ca; margin-top: 5px;">
                <i class="fas fa-times-circle"></i> Alpha
              </div>
            </div>
          </div>
          
          <div style="background: #f3f4f6; padding: 15px; border-radius: 12px; text-align: center;">
            <div style="font-size: 14px; color: #6b7280;">Total Hari Kerja</div>
            <div style="font-size: 20px; font-weight: bold; color: #374151;">${stats.total_hari || 0} Hari</div>
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e5e7eb;">
              <div style="font-size: 14px; color: #10b981; font-weight: 600;">
                Persentase Kehadiran: ${stats.persentase_kehadiran || 0}%
              </div>
            </div>
          </div>
        </div>
      `;

      await Swal.fire({
        title: `📊 Rekap Kehadiran`,
        html: reportHtml,
        confirmButtonText: "Tutup",
        confirmButtonColor: "#667eea",
        width: "500px",
        customClass: {
          popup: "report-modal",
        },
      });

      closeAttendanceMenu();
    } catch (err) {
      console.error("Monthly report error:", err);
      Swal.close();
      await Swal.fire({
        icon: "error",
        title: "Gagal Memuat Data",
        text: err.message || "Terjadi kesalahan saat mengambil data rekap",
        confirmButtonColor: "#ef4444",
      });
    }
  }
}

function getMonthName(monthNumber) {
  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  return monthNames[monthNumber - 1] || "Januari";
}

// Helper function to generate year options
function generateYearOptions(currentYear) {
  let options = "";
  const startYear = currentYear - 2;
  const endYear = currentYear + 1;

  for (let year = startYear; year <= endYear; year++) {
    options += `<option value="${year}" ${year === currentYear ? "selected" : ""}>${year}</option>`;
  }
  return options;
}

// Helper function to generate year options
function generateYearOptions(currentYear) {
  let options = "";
  for (let year = currentYear - 2; year <= currentYear + 1; year++) {
    options += `<option value="${year}" ${year === currentYear ? "selected" : ""}>${year}</option>`;
  }
  return options;
}
// Buka menu absensi
function openAttendanceMenu() {
  const modal = document.getElementById("attendanceMenuModal");
  if (modal) {
    modal.style.display = "flex";
    loadTodayAttendanceStatus();
  }
}

// Tutup menu absensi
function closeAttendanceMenu() {
  const modal = document.getElementById("attendanceMenuModal");
  if (modal) {
    modal.style.display = "none";
  }
}

// Load profile on page load
loadProfile();
