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

    // Dapatkan blob dari response
    const blob = await res.blob();

    // Buat URL untuk download
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    // Nama file berdasarkan bulan dan tahun
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

    // Dapatkan blob dari response
    const blob = await res.blob();

    // Buat URL untuk download
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    // Nama file berdasarkan bulan dan tahun
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

    // Dapatkan blob dari response
    const blob = await res.blob();

    // Buat URL untuk download
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    // Nama file berdasarkan tahun
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

function renderProfile(data) {
  const profile = data.profile;
  const container = document.getElementById("profileContent");
  const company = data.company;

  console.log("Rendering profile with data:", profile);
  console.log("Company:", company);
  console.log("Foto diri URL:", profile.foto_diri_url);
  console.log("Foto KTP URL:", profile.foto_ktp_url);

  // Tentukan URL foto dengan benar
  let fotoDiriUrl = "https://ui-avatars.com/api/?background=6366f1&color=fff&rounded=true&bold=true&size=200&name=" + encodeURIComponent(profile.nama_lengkap);
  let fotoKtpUrl = null;

  // Gunakan foto_diri_url dari server jika ada dan valid
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
                <i class="fas fa-building"></i>
                <div>
                  <div class="info-label">Cabang</div>
                  <div class="info-value">${escapeHtml(profile.cabang || "-")}</div>
                </div>
              </div>
              <div class="info-item">
                <i class="fas fa-store"></i>
                <div>
                  <div class="info-label">Nama Gerai</div>
                  <div class="info-value">${escapeHtml(profile.nama_gerai || "-")}</div>
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

  // Ambil total gaji berdasarkan company
  // Hisana: gaji_total, Enakko: total_gaji
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

  // Pastikan bulan valid (1-12)
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
  // Update tab buttons
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach((btn) => btn.classList.remove("active"));

  // Find the clicked button and add active class
  const clickedBtn = Array.from(buttons).find((btn) => {
    const onclickAttr = btn.getAttribute("onclick");
    return onclickAttr && onclickAttr.includes(tabName);
  });
  if (clickedBtn) clickedBtn.classList.add("active");

  // Show selected tab content
  const slipTab = document.getElementById("slipTab");
  const bonusTab = document.getElementById("bonusTab");
  const thrTab = document.getElementById("thrTab");

  if (slipTab) slipTab.classList.remove("active");
  if (bonusTab) bonusTab.classList.remove("active");
  if (thrTab) thrTab.classList.remove("active");

  const selectedTab = document.getElementById(`${tabName}Tab`);
  if (selectedTab) selectedTab.classList.add("active");
}

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

function openPasswordModal() {
  document.getElementById("currentPassword").value = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmPassword").value = "";
  document.getElementById("changePasswordModal").style.display = "flex";

  // Reset password strength
  const strengthBarFill = document.getElementById("strengthBarFill");
  const strengthText = document.getElementById("strengthText");
  if (strengthBarFill) strengthBarFill.style.width = "0%";
  if (strengthText) strengthText.textContent = "";

  // Add password strength listener
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

  if (event.target === editModal) {
    closeEditModal();
  }
  if (event.target === passwordModal) {
    closePasswordModal();
  }
};

// Menu Absensi Functions
function openAttendanceMenu() {
  const modal = document.getElementById("attendanceMenuModal");
  if (modal) {
    modal.style.display = "flex";
    loadTodayAttendanceStatus();
  }
}

function closeAttendanceMenu() {
  const modal = document.getElementById("attendanceMenuModal");
  if (modal) {
    modal.style.display = "none";
  }
}

function loadTodayAttendanceStatus() {
  // Ambil data absensi hari ini dari localStorage atau API
  const today = new Date().toISOString().split("T")[0];
  const attendanceData = JSON.parse(localStorage.getItem(`attendance_${today}`)) || {
    checkIn: null,
    checkOut: null,
    status: "belum",
  };

  const checkInStatus = document.getElementById("checkInStatus");
  const checkOutStatus = document.getElementById("checkOutStatus");
  const attendanceBadge = document.getElementById("attendanceBadge");

  if (checkInStatus) {
    checkInStatus.textContent = attendanceData.checkIn || "Belum absen";
  }
  if (checkOutStatus) {
    checkOutStatus.textContent = attendanceData.checkOut || "Belum absen";
  }
  if (attendanceBadge) {
    let statusText = "";
    let statusClass = "";

    if (attendanceData.status === "hadir") {
      statusText = "Hadir";
      statusClass = "hadir";
    } else if (attendanceData.status === "izin") {
      statusText = "Izin";
      statusClass = "izin";
    } else if (attendanceData.status === "sakit") {
      statusText = "Sakit";
      statusClass = "sakit";
    } else if (attendanceData.status === "terlambat") {
      statusText = "Terlambat";
      statusClass = "terlambat";
    } else {
      statusText = "Belum absen";
      statusClass = "belum";
    }

    attendanceBadge.textContent = statusText;
    attendanceBadge.className = `status-badge ${statusClass}`;
  }
}

function handleCheckIn() {
  const now = new Date();
  const timeString = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const today = now.toISOString().split("T")[0];
  const checkInHour = now.getHours();

  // Tentukan status (terlambat jika lebih dari jam 08:00)
  let status = "hadir";
  if (checkInHour >= 8 && now.getMinutes() > 0) {
    status = "terlambat";
  }

  // Simpan data absensi
  const attendanceData = {
    checkIn: timeString,
    checkOut: null,
    status: status,
    date: today,
  };

  localStorage.setItem(`attendance_${today}`, JSON.stringify(attendanceData));

  Swal.fire({
    icon: "success",
    title: "Absen Masuk Berhasil!",
    html: `Waktu: <strong>${timeString}</strong><br>Status: <strong>${status === "hadir" ? "Hadir" : "Terlambat"}</strong>`,
    confirmButtonColor: "#667eea",
    confirmButtonText: "OK",
  });

  loadTodayAttendanceStatus();
  closeAttendanceMenu();
}

function handleCheckOut() {
  const now = new Date();
  const timeString = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const today = now.toISOString().split("T")[0];

  // Ambil data yang sudah ada
  let attendanceData = JSON.parse(localStorage.getItem(`attendance_${today}`));

  if (!attendanceData || !attendanceData.checkIn) {
    Swal.fire({
      icon: "warning",
      title: "Belum Absen Masuk",
      text: "Silakan absen masuk terlebih dahulu sebelum absen pulang!",
      confirmButtonColor: "#667eea",
    });
    return;
  }

  attendanceData.checkOut = timeString;
  localStorage.setItem(`attendance_${today}`, JSON.stringify(attendanceData));

  Swal.fire({
    icon: "success",
    title: "Absen Pulang Berhasil!",
    html: `Waktu: <strong>${timeString}</strong>`,
    confirmButtonColor: "#667eea",
  });

  loadTodayAttendanceStatus();
  closeAttendanceMenu();
}

function handlePermit() {
  Swal.fire({
    title: "Ajukan Izin / Sakit",
    html: `
            <select id="permitType" class="swal2-select" style="width: 100%; padding: 8px; border-radius: 8px;">
                <option value="izin">Izin</option>
                <option value="sakit">Sakit</option>
            </select>
            <textarea id="permitReason" class="swal2-textarea" placeholder="Alasan..." style="margin-top: 10px;"></textarea>
        `,
    showCancelButton: true,
    confirmButtonText: "Ajukan",
    cancelButtonText: "Batal",
    confirmButtonColor: "#667eea",
    cancelButtonColor: "#ef4444",
    preConfirm: () => {
      const type = document.getElementById("permitType").value;
      const reason = document.getElementById("permitReason").value;
      if (!reason) {
        Swal.showValidationMessage("Harap isi alasan!");
        return false;
      }
      return { type, reason };
    },
  }).then((result) => {
    if (result.isConfirmed) {
      const today = new Date().toISOString().split("T")[0];
      const attendanceData = {
        checkIn: null,
        checkOut: null,
        status: result.value.type,
        reason: result.value.reason,
        date: today,
      };

      localStorage.setItem(`attendance_${today}`, JSON.stringify(attendanceData));

      Swal.fire({
        icon: "success",
        title: "Pengajuan Berhasil!",
        html: `Jenis: <strong>${result.value.type === "izin" ? "Izin" : "Sakit"}</strong><br>Alasan: ${result.value.reason}`,
        confirmButtonColor: "#667eea",
      });

      loadTodayAttendanceStatus();
      closeAttendanceMenu();
    }
  });
}

function viewAttendanceHistory() {
  // Ambil semua data absensi dari localStorage
  const history = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("attendance_")) {
      const data = JSON.parse(localStorage.getItem(key));
      history.push(data);
    }
  }

  history.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (history.length === 0) {
    Swal.fire({
      icon: "info",
      title: "Belum Ada Data",
      text: "Anda belum memiliki riwayat absensi.",
      confirmButtonColor: "#667eea",
    });
    return;
  }

  let historyHTML = '<div style="max-height: 400px; overflow-y: auto;">';
  history.forEach((item) => {
    const statusText = item.status === "hadir" ? "Hadir" : item.status === "izin" ? "Izin" : item.status === "sakit" ? "Sakit" : item.status === "terlambat" ? "Terlambat" : "Belum";

    historyHTML += `
            <div style="padding: 12px; margin-bottom: 8px; background: #f8fafc; border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <strong>${item.date}</strong>
                    <span style="color: ${item.status === "hadir" ? "#10b981" : item.status === "izin" ? "#ef4444" : "#f59e0b"}">${statusText}</span>
                </div>
                <div style="font-size: 13px; color: #64748b;">
                    Check In: ${item.checkIn || "-"} | Check Out: ${item.checkOut || "-"}
                </div>
                ${item.reason ? `<div style="font-size: 12px; color: #64748b; margin-top: 4px;">Alasan: ${item.reason}</div>` : ""}
            </div>
        `;
  });
  historyHTML += "</div>";

  Swal.fire({
    title: "Riwayat Absensi",
    html: historyHTML,
    confirmButtonText: "Tutup",
    confirmButtonColor: "#667eea",
  });

  closeAttendanceMenu();
}

function viewMonthlyReport() {
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  // Filter data berdasarkan bulan dan tahun
  const monthlyData = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("attendance_")) {
      const data = JSON.parse(localStorage.getItem(key));
      const date = new Date(data.date);
      if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
        monthlyData.push(data);
      }
    }
  }

  const stats = {
    hadir: monthlyData.filter((d) => d.status === "hadir").length,
    terlambat: monthlyData.filter((d) => d.status === "terlambat").length,
    izin: monthlyData.filter((d) => d.status === "izin").length,
    sakit: monthlyData.filter((d) => d.status === "sakit").length,
    total: monthlyData.length,
  };

  Swal.fire({
    title: `Rekap Bulanan ${new Date().toLocaleString("id-ID", { month: "long", year: "numeric" })}`,
    html: `
            <div style="text-align: left;">
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px;">
                    <div style="background: #d1fae5; padding: 12px; border-radius: 12px; text-align: center;">
                        <div style="font-size: 24px; font-weight: bold; color: #065f46;">${stats.hadir}</div>
                        <div style="font-size: 12px; color: #065f46;">Hadir</div>
                    </div>
                    <div style="background: #ffedd5; padding: 12px; border-radius: 12px; text-align: center;">
                        <div style="font-size: 24px; font-weight: bold; color: #ea580c;">${stats.terlambat}</div>
                        <div style="font-size: 12px; color: #ea580c;">Terlambat</div>
                    </div>
                    <div style="background: #fee2e2; padding: 12px; border-radius: 12px; text-align: center;">
                        <div style="font-size: 24px; font-weight: bold; color: #dc2626;">${stats.izin}</div>
                        <div style="font-size: 12px; color: #dc2626;">Izin</div>
                    </div>
                    <div style="background: #fef3c7; padding: 12px; border-radius: 12px; text-align: center;">
                        <div style="font-size: 24px; font-weight: bold; color: #d97706;">${stats.sakit}</div>
                        <div style="font-size: 12px; color: #d97706;">Sakit</div>
                    </div>
                </div>
                <div style="text-align: center; padding-top: 12px; border-top: 1px solid #e2e8f0;">
                    <strong>Total Kehadiran: ${stats.total}</strong>
                </div>
            </div>
        `,
    confirmButtonText: "Tutup",
    confirmButtonColor: "#667eea",
  });

  closeAttendanceMenu();
}

// Tutup modal saat klik di luar modal
window.onclick = function (event) {
  const attendanceModal = document.getElementById("attendanceMenuModal");
  if (event.target === attendanceModal) {
    closeAttendanceMenu();
  }
};

// Load profile on page load
loadProfile();
