// ============= GLOBAL VARIABLES =============
let currentEditUserId = null;
let currentAdminRole = null;
let currentAdminId = null;
let editTargetAdminId = null;
let editTargetAdminUsername = null;
let editTargetAdminEmail = null;
let editTargetAdminRole = null;

// ============= SWEETALERT2 CUSTOM CONFIG =============
const swalConfig = {
  customClass: {
    container: "swal-container-top",
    popup: "swal-popup-top",
  },
  zIndex: 2000,
  backdrop: true,
  allowOutsideClick: true,
  allowEscapeKey: true,
};

async function showAlert(icon, title, text = null, options = {}) {
  const config = {
    ...swalConfig,
    icon: icon,
    title: title,
    text: text,
    ...options,
  };
  return await Swal.fire(config);
}

// ============= UPDATE ADMIN PROFILE IN SIDEBAR =============
function updateAdminProfile(username, role) {
  const adminUsernameElement = document.getElementById("adminUsername");
  const adminRoleElement = document.getElementById("adminRole");
  const adminAvatar = document.getElementById("adminAvatar");
  const headerAdminName = document.getElementById("headerAdminName");

  // Update username
  if (adminUsernameElement) {
    adminUsernameElement.textContent = username || "Administrator";
  }

  // Update role with badge
  if (adminRoleElement) {
    const roleText = role === "superadmin" ? "Super Administrator" : "Administrator";
    const roleIcon = role === "superadmin" ? "fa-crown" : "fa-user-shield";
    adminRoleElement.innerHTML = `<i class="fas ${roleIcon}"></i> ${roleText}`;
  }

  // Update avatar with username initial
  if (adminAvatar && username) {
    const initial = username.charAt(0).toUpperCase();
    adminAvatar.src = `https://ui-avatars.com/api/?background=6366f1&color=fff&rounded=true&bold=true&size=128&font-size=0.5&name=${encodeURIComponent(username)}`;
  }

  // Update header admin name
  if (headerAdminName) {
    headerAdminName.textContent = username || "Admin";
  }
}

// ============= SIDEBAR FUNCTIONS =============
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("active");
  document.getElementById("sidebarOverlay").classList.toggle("active");
}

// ============= LOGOUT FUNCTION =============
async function confirmLogout() {
  const result = await Swal.fire({
    title: "Konfirmasi Keluar",
    text: "Apakah Anda yakin ingin mengakhiri sesi ini?",
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#6366f1",
    cancelButtonColor: "#64748b",
    confirmButtonText: "Ya, Keluar",
    cancelButtonText: "Batal",
    borderRadius: "20px",
    zIndex: 2000,
  });

  if (result.isConfirmed) {
    Swal.fire({
      title: "Sedang Keluar...",
      allowOutsideClick: false,
      zIndex: 2000,
      didOpen: () => Swal.showLoading(),
    });
    window.location.href = "/admin-logout";
  }
}

// ============= TAB SWITCHING =============
function switchTab(tab) {
  const usersTab = document.getElementById("usersTab");
  const adminsTab = document.getElementById("adminsTab");
  const tabs = document.querySelectorAll(".tab-btn");
  const navItems = document.querySelectorAll(".nav-item");

  if (tab === "users") {
    usersTab.classList.add("active");
    adminsTab.classList.remove("active");
    if (tabs[0]) tabs[0].classList.add("active");
    if (tabs[1]) tabs[1].classList.remove("active");
    if (navItems[0]) navItems[0].classList.add("active");
    if (navItems[1]) navItems[1].classList.remove("active");
    loadUsers();
  } else {
    usersTab.classList.remove("active");
    adminsTab.classList.add("active");
    if (tabs[1]) tabs[1].classList.add("active");
    if (tabs[0]) tabs[0].classList.remove("active");
    if (navItems[1]) navItems[1].classList.add("active");
    if (navItems[0]) navItems[0].classList.remove("active");
    loadAdmins();
  }
}

// ============= USER MANAGEMENT =============
async function loadUsers() {
  try {
    const res = await fetch("/api/users");
    const users = await res.json();
    const tbody = document.getElementById("userTableBody");
    tbody.innerHTML = users
      .map(
        (u, index) => `
        <tr>
          <td data-label="No"><span style="font-weight:700; color:#4f46e5;">${index + 1}</span></td>
          <td data-label="Nama Lengkap"><strong>${escapeHtml(u.nama || "-")}</strong></td>
          <td data-label="WhatsApp"><code style="background:#f1f5f9; padding:4px 10px; border-radius:20px;">${escapeHtml(u.nomor_wa)}</code></td>
          <td data-label="Aksi">
            <div class="action-group">
              <button class="btn btn-icon btn-edit" onclick="prepareEditUser(${u.id}, '${escapeHtml(u.nama)}', '${escapeHtml(u.nomor_wa)}')"><i class="fas fa-pen"></i></button>
              ${currentAdminRole === "superadmin" ? `<button class="btn btn-icon btn-danger" onclick="deleteUser(${u.id}, '${escapeHtml(u.nama)}')"><i class="fas fa-trash"></i></button>` : ""}
            </div>
          </td>
        </tr>
      `,
      )
      .join("");
  } catch (err) {
    console.error(err);
    await showAlert("error", "Error", "Gagal memuat data user");
  }
}

async function deleteUser(id, nama) {
  const result = await Swal.fire({
    title: "Hapus User?",
    html: `Apakah Anda yakin ingin menghapus user <strong>${escapeHtml(nama)}</strong>?<br><small style="color:#ef4444;">Data akan dihapus secara permanen!</small>`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    confirmButtonText: "Ya, Hapus",
    cancelButtonText: "Batal",
    borderRadius: "20px",
    zIndex: 2000,
  });

  if (result.isConfirmed) {
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (res.ok) {
        await showAlert("success", "Terhapus!", `User "${nama}" berhasil dihapus dari sistem`);
        loadUsers();
      } else {
        const data = await res.json();
        await showAlert("error", "Error", data.error || "Gagal menghapus");
      }
    } catch (err) {
      await showAlert("error", "Error", "Gagal menghapus user");
    }
  }
}

function openUserModal() {
  currentEditUserId = null;
  document.getElementById("userModalTitle").innerText = "Tambah User Baru";
  document.getElementById("namaInput").value = "";
  document.getElementById("nomorInput").value = "";
  document.getElementById("userModal").style.display = "flex";
}

function prepareEditUser(id, nama, nomor_wa) {
  currentEditUserId = id;
  document.getElementById("userModalTitle").innerText = "Edit Data User";
  document.getElementById("namaInput").value = nama;
  document.getElementById("nomorInput").value = nomor_wa;
  document.getElementById("userModal").style.display = "flex";
}

function closeUserModal() {
  document.getElementById("userModal").style.display = "none";
}

async function saveUser() {
  const nama = document.getElementById("namaInput").value.trim();
  const nomor_wa = document.getElementById("nomorInput").value.trim();
  if (!nama || !nomor_wa) {
    await showAlert("warning", "Perhatian", "Semua kolom wajib diisi");
    return;
  }

  const url = currentEditUserId ? `/api/users/${currentEditUserId}` : "/api/users";
  const method = currentEditUserId ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nama, nomor_wa }),
    });
    if (res.ok) {
      const action = currentEditUserId ? "diperbarui" : "ditambahkan";
      await showAlert("success", "Berhasil!", `User "${nama}" dengan nomor WhatsApp ${nomor_wa} berhasil ${action}`);
      closeUserModal();
      loadUsers();
    } else {
      const data = await res.json();
      await showAlert("error", "Gagal", data.error || "Terjadi kesalahan");
    }
  } catch (err) {
    await showAlert("error", "Error", "Gagal menyimpan data");
  }
}

// ============= ADMIN MANAGEMENT =============
async function loadAdmins() {
  if (currentAdminRole !== "superadmin") {
    const tbody = document.getElementById("adminTableBody");
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:48px;"><i class="fas fa-lock" style="font-size:48px; color:#94a3b8; margin-bottom:16px; display:block;"></i><p style="color:#475569;">🔒 Akses terbatas. Hanya Superadmin yang dapat mengelola admin accounts.</p></td></tr>`;
    return;
  }

  try {
    const res = await fetch("/api/admins");
    if (!res.ok) throw new Error();
    const admins = await res.json();
    const tbody = document.getElementById("adminTableBody");
    tbody.innerHTML = admins
      .map(
        (admin, index) => `
        <tr>
          <td data-label="No"><span style="font-weight:700; color:#4f46e5;">${index + 1}</span></td>
          <td data-label="Username"><strong>${escapeHtml(admin.username)}</strong></td>
          <td data-label="Email"><span style="color:#475569;">${escapeHtml(admin.email || "-")}</span></td>
          <td data-label="Role"><span class="role-badge ${admin.role === "superadmin" ? "superadmin" : "admin"}"><i class="fas ${admin.role === "superadmin" ? "fa-crown" : "fa-user-shield"}"></i> ${admin.role === "superadmin" ? "Superadmin" : "Admin"}</span></td>
          <td data-label="Dibuat Pada">${new Date(admin.created_at).toLocaleDateString("id-ID")}</td>
          <td data-label="Aksi">
            <div class="action-group">
              <button class="btn btn-icon btn-edit" onclick="openEditAdminModal(${admin.id}, '${escapeHtml(admin.username)}', '${escapeHtml(admin.email || "")}', '${admin.role}')"><i class="fas fa-key"></i></button>
              ${admin.id !== currentAdminId ? `<button class="btn btn-icon btn-danger" onclick="deleteAdmin(${admin.id}, '${escapeHtml(admin.username)}', '${escapeHtml(admin.role)}')"><i class="fas fa-trash"></i></button>` : ""}
            </div>
          </td>
        </tr>
      `,
      )
      .join("");
  } catch (err) {
    await showAlert("error", "Error", "Gagal memuat data admin");
  }
}

function openAdminModal() {
  if (currentAdminRole !== "superadmin") {
    showAlert("warning", "Akses Ditolak", "Hanya Superadmin yang dapat menambah admin");
    return;
  }
  document.getElementById("adminModalTitle").innerText = "Tambah Admin Baru";
  document.getElementById("adminUsernameInput").value = "";
  document.getElementById("adminEmailInput").value = "";
  document.getElementById("adminPasswordInput").value = "";
  document.getElementById("adminRoleInput").value = "admin";
  document.getElementById("adminModal").style.display = "flex";
}

function closeAdminModal() {
  document.getElementById("adminModal").style.display = "none";
}

async function saveAdmin() {
  if (currentAdminRole !== "superadmin") {
    await showAlert("warning", "Akses Ditolak", "");
    return;
  }

  const username = document.getElementById("adminUsernameInput").value.trim();
  const email = document.getElementById("adminEmailInput").value.trim();
  const password = document.getElementById("adminPasswordInput").value;
  const role = document.getElementById("adminRoleInput").value;
  const roleText = role === "superadmin" ? "Superadmin" : "Admin";

  if (!username || !password) {
    await showAlert("warning", "Perhatian", "Username dan password wajib diisi");
    return;
  }
  if (username.length < 3) {
    await showAlert("warning", "Perhatian", "Username minimal 3 karakter");
    return;
  }
  if (password.length < 6) {
    await showAlert("warning", "Perhatian", "Password minimal 6 karakter");
    return;
  }

  if (email && !isValidEmail(email)) {
    await showAlert("warning", "Perhatian", "Format email tidak valid");
    return;
  }

  try {
    const res = await fetch("/api/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password, role }),
    });
    const data = await res.json();
    if (res.ok) {
      await showAlert("success", "Berhasil", `Admin baru "${username}" dengan role ${roleText} berhasil ditambahkan`);
      closeAdminModal();
      loadAdmins();
    } else {
      await showAlert("error", "Error", data.error || "Gagal menambahkan");
    }
  } catch (err) {
    await showAlert("error", "Error", "Terjadi kesalahan server");
  }
}

function openEditAdminModal(id, username, email, role) {
  editTargetAdminId = id;
  editTargetAdminUsername = username;
  editTargetAdminEmail = email;
  editTargetAdminRole = role;

  const isOwnAccount = id === currentAdminId;
  const isSuperadmin = currentAdminRole === "superadmin";

  document.getElementById("editAdminModalTitle").innerHTML = isOwnAccount ? "🔐 Ubah Data Akun" : `✏️ Edit Admin: ${escapeHtml(username)}`;

  const editUsernameField = document.getElementById("editUsernameField");
  const editEmailField = document.getElementById("editEmailField");
  const editRoleField = document.getElementById("editRoleField");
  const currentPasswordField = document.getElementById("currentPasswordField");

  // RESET semua field ke hidden
  editUsernameField.style.display = "none";
  editEmailField.style.display = "none";
  editRoleField.style.display = "none";

  document.getElementById("editUsernameInput").value = "";
  document.getElementById("editEmailInput").value = "";

  // Tampilkan field berdasarkan role dan target
  if (isSuperadmin) {
    editUsernameField.style.display = "block";
    document.getElementById("editUsernameInput").value = username;

    editEmailField.style.display = "block";
    document.getElementById("editEmailInput").value = email || "";

    if (!isOwnAccount) {
      editRoleField.style.display = "block";
      document.getElementById("editRoleSelect").value = role;
      // Jika superadmin mengedit admin lain, sembunyikan field password saat ini
      currentPasswordField.style.display = "none";
    } else {
      // Jika superadmin mengedit akun sendiri, tampilkan field password saat ini
      currentPasswordField.style.display = "block";
    }
  } else {
    // Admin biasa edit sendiri, tampilkan field password saat ini
    currentPasswordField.style.display = "block";
  }

  // Reset password fields
  document.getElementById("currentPasswordInput").value = "";
  document.getElementById("newPasswordInput").value = "";

  // Tampilkan modal
  document.getElementById("editAdminModal").style.display = "flex";
}

function closeEditAdminModal() {
  document.getElementById("editAdminModal").style.display = "none";
  editTargetAdminId = null;
}

async function updateAdminCredentials() {
  const editUsernameField = document.getElementById("editUsernameField");
  const editEmailField = document.getElementById("editEmailField");
  const editRoleField = document.getElementById("editRoleField");
  const currentPasswordField = document.getElementById("currentPasswordField");

  const newUsername = editUsernameField.style.display !== "none" ? document.getElementById("editUsernameInput").value.trim() : null;
  const newEmail = editEmailField.style.display !== "none" ? document.getElementById("editEmailInput").value.trim() : null;
  const newRole = editRoleField.style.display !== "none" ? document.getElementById("editRoleSelect")?.value : null;
  const newRoleText = newRole === "superadmin" ? "Superadmin" : "Admin";

  const currentPassword = document.getElementById("currentPasswordInput").value;
  const newPassword = document.getElementById("newPasswordInput").value;

  const isOwnAccount = editTargetAdminId === currentAdminId;
  const isSuperadmin = currentAdminRole === "superadmin";

  // Cek apakah field current password ditampilkan
  const isCurrentPasswordRequired = currentPasswordField.style.display !== "none";

  const targetUsername = editTargetAdminUsername;
  const targetRoleText = editTargetAdminRole === "superadmin" ? "Superadmin" : "Admin";

  try {
    let hasChanges = false;
    let successMessages = [];
    let updatedFields = [];
    let usernameChanged = false;

    // Update username (butuh password jika edit sendiri)
    if (newUsername !== null && newUsername && newUsername !== editTargetAdminUsername) {
      if (newUsername.length < 3) throw new Error("Username minimal 3 karakter");

      const body = { username: newUsername };
      if (isOwnAccount && isCurrentPasswordRequired) {
        if (!currentPassword) throw new Error("Password saat ini wajib diisi untuk verifikasi");
        body.currentPassword = currentPassword;
      }

      const usernameRes = await fetch(`/api/admins/${editTargetAdminId}/username`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!usernameRes.ok) {
        const data = await usernameRes.json();
        throw new Error(data.error || "Gagal update username");
      }
      hasChanges = true;
      updatedFields.push("username");
      usernameChanged = true;
      successMessages.push(`Username berhasil diubah dari "${editTargetAdminUsername}" menjadi "${newUsername}"`);
    }

    // Update email (butuh password jika edit sendiri)
    if (newEmail !== null && newEmail !== editTargetAdminEmail) {
      const emailToUpdate = newEmail || null;
      if (emailToUpdate && !isValidEmail(emailToUpdate)) {
        throw new Error("Format email tidak valid");
      }

      const body = { email: emailToUpdate };
      if (isOwnAccount && isCurrentPasswordRequired) {
        if (!currentPassword) throw new Error("Password saat ini wajib diisi untuk verifikasi");
        body.currentPassword = currentPassword;
      }

      const emailRes = await fetch(`/api/admins/${editTargetAdminId}/email`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!emailRes.ok) {
        const data = await emailRes.json();
        throw new Error(data.error || "Gagal update email");
      }
      hasChanges = true;
      updatedFields.push("email");
      const oldEmailText = editTargetAdminEmail || "kosong";
      const newEmailText = newEmail || "kosong";
      successMessages.push(`Email berhasil diubah dari "${oldEmailText}" menjadi "${newEmailText}"`);
    }

    // Update role (TIDAK PERLU password)
    if (newRole !== null && !isOwnAccount && newRole && newRole !== editTargetAdminRole) {
      const roleRes = await fetch(`/api/admins/${editTargetAdminId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!roleRes.ok) {
        const data = await roleRes.json();
        throw new Error(data.error || "Gagal update role");
      }
      hasChanges = true;
      updatedFields.push("role");
      successMessages.push(`Role untuk admin "${targetUsername}" berhasil diubah dari "${targetRoleText}" menjadi "${newRoleText}"`);
    }

    // Update password
    if (newPassword) {
      if (newPassword.length < 6) throw new Error("Password minimal 6 karakter");

      const body = { newPassword };
      // Hanya kirim currentPassword jika field-nya ditampilkan (edit sendiri)
      if (isCurrentPasswordRequired) {
        if (!currentPassword) throw new Error("Password saat ini wajib diisi untuk verifikasi");
        body.currentPassword = currentPassword;
      }

      const passwordRes = await fetch(`/api/admins/${editTargetAdminId}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await passwordRes.json();
      if (!passwordRes.ok) throw new Error(data.error || "Gagal update password");
      hasChanges = true;
      updatedFields.push("password");
      successMessages.push(`Password untuk admin "${targetUsername}" berhasil diubah`);
    }

    // Show info alert instead of error when no changes
    if (!hasChanges) {
      await showAlert("info", "Tidak Ada Perubahan", `Tidak ada perubahan yang dilakukan untuk admin "${targetUsername}"`);
      return;
    }

    // Tampilkan pesan sukses dengan detail
    let successTitle = "Berhasil!";
    let successMessage = "";

    if (updatedFields.length === 1) {
      successMessage = successMessages[0];
    } else {
      successMessage = `Berhasil mengupdate admin "${targetUsername}":\n\n${successMessages.join("\n")}`;
    }

    await showAlert("success", successTitle, successMessage);
    closeEditAdminModal();

    // Update sidebar profile if this is own account and username changed
    if (isOwnAccount && usernameChanged) {
      const meRes = await fetch("/api/admin/me");
      const meData = await meRes.json();
      if (meData.loggedIn) {
        updateAdminProfile(meData.username, meData.role);
        currentAdminRole = meData.role;
        currentAdminId = meData.id;
      }
    }

    if (isOwnAccount && newPassword) {
      await showAlert("info", "Info", `Halo ${targetUsername}, silakan login kembali dengan password baru Anda`);
      window.location.href = "/admin-logout";
    } else {
      loadAdmins();
    }
  } catch (err) {
    const isVerificationError = err.message.includes("password") || err.message.includes("verifikasi");
    await showAlert(isVerificationError ? "warning" : "error", "Perhatian", err.message);
  }
}

async function deleteAdmin(id, username, role) {
  if (currentAdminRole !== "superadmin") {
    await showAlert("warning", "Akses Ditolak", "");
    return;
  }

  const roleText = role === "superadmin" ? "Superadmin" : "Admin";

  const result = await Swal.fire({
    title: "Hapus Admin?",
    html: `Apakah Anda yakin ingin menghapus admin <strong>${escapeHtml(username)}</strong> dengan role <strong>${roleText}</strong>?<br><small style="color:#ef4444;">Data akan dihapus secara permanen!</small>`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    confirmButtonText: "Ya, Hapus",
    cancelButtonText: "Batal",
    borderRadius: "20px",
    zIndex: 2000,
  });

  if (result.isConfirmed) {
    try {
      const res = await fetch(`/api/admins/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        await showAlert("success", "Terhapus", `Admin "${username}" dengan role ${roleText} berhasil dihapus dari sistem`);
        loadAdmins();
      } else {
        await showAlert("error", "Error", data.error || "Gagal menghapus");
      }
    } catch (err) {
      await showAlert("error", "Error", "Terjadi kesalahan");
    }
  }
}

// ============= CHECK ROLE ACCESS =============
async function checkRoleAccess() {
  try {
    const res = await fetch("/api/admin/me");
    const data = await res.json();

    if (!data.loggedIn) {
      window.location.href = "/admin-login";
      return;
    }

    currentAdminRole = data.role;
    currentAdminId = data.id;

    // Update profile with real data
    updateAdminProfile(data.username, data.role);

    // Show/hide admin management based on role
    const addAdminBtn = document.getElementById("addAdminBtn");
    const adminTabBtn = document.getElementById("adminTabBtn");
    const adminTabNav = document.getElementById("adminTabNav");

    if (data.role === "superadmin") {
      if (addAdminBtn) addAdminBtn.style.display = "flex";
      if (adminTabBtn) adminTabBtn.style.display = "flex";
      if (adminTabNav) adminTabNav.style.display = "block";

      // Show info banner for superadmin
      const infoBanner = document.getElementById("infoBanner");
      if (infoBanner) {
        infoBanner.style.display = "block";
        setTimeout(() => {
          infoBanner.style.display = "none";
        }, 5000);
      }
    } else {
      if (addAdminBtn) addAdminBtn.style.display = "none";
      if (adminTabBtn) adminTabBtn.style.display = "none";
      if (adminTabNav) adminTabNav.style.display = "none";

      // Make sure we're on users tab
      const adminsTab = document.getElementById("adminsTab");
      const usersTab = document.getElementById("usersTab");
      if (adminsTab) adminsTab.classList.remove("active");
      if (usersTab) usersTab.classList.add("active");

      const tabs = document.querySelectorAll(".tab-btn");
      if (tabs[0]) tabs[0].classList.add("active");
      if (tabs[1]) tabs[1].classList.remove("active");
    }
  } catch (err) {
    console.error("Error checking role access:", err);
    updateAdminProfile("Admin", "admin");
  }
}

// ============= HELPER FUNCTIONS =============
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// ============= INIT =============
document.addEventListener("DOMContentLoaded", () => {
  checkRoleAccess();
  loadUsers();

  window.onclick = function (event) {
    if (event.target.classList.contains("modal")) {
      event.target.style.display = "none";
    }
  };
});
