// ============= GLOBAL VARIABLES =============
let currentEditUserId = null;
let currentAdminRole = null;
let currentAdminId = null;
let editTargetAdminId = null;
let editTargetAdminUsername = null;
let editTargetAdminRole = null;

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
  });

  if (result.isConfirmed) {
    Swal.fire({
      title: "Sedang Keluar...",
      allowOutsideClick: false,
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

  if (tab === "users") {
    usersTab.classList.add("active");
    adminsTab.classList.remove("active");
    tabs[0].classList.add("active");
    tabs[1].classList.remove("active");
    loadUsers();
  } else {
    usersTab.classList.remove("active");
    adminsTab.classList.add("active");
    tabs[1].classList.add("active");
    tabs[0].classList.remove("active");
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
            ${currentAdminRole === "superadmin" ? `<button class="btn btn-icon btn-danger" onclick="deleteUser(${u.id})"><i class="fas fa-trash"></i></button>` : ""}
          </div>
        </td>
      </tr>
    `,
      )
      .join("");
  } catch (err) {
    console.error(err);
    Swal.fire("Error", "Gagal memuat data user", "error");
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
  if (!nama || !nomor_wa) return Swal.fire("Oops", "Semua kolom wajib diisi", "error");

  const url = currentEditUserId ? `/api/users/${currentEditUserId}` : "/api/users";
  const method = currentEditUserId ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nama, nomor_wa }),
    });
    if (res.ok) {
      Swal.fire("Berhasil!", "Data user telah disimpan", "success");
      closeUserModal();
      loadUsers();
    } else {
      const data = await res.json();
      Swal.fire("Gagal", data.error || "Terjadi kesalahan", "error");
    }
  } catch (err) {
    Swal.fire("Error", "Gagal menyimpan data", "error");
  }
}

async function deleteUser(id) {
  const result = await Swal.fire({
    title: "Hapus User?",
    text: "Data akan dihapus secara permanen",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    confirmButtonText: "Ya, Hapus",
    cancelButtonText: "Batal",
    borderRadius: "20px",
  });
  if (result.isConfirmed) {
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadUsers();
        Swal.fire("Terhapus!", "User berhasil dihapus", "success");
      } else {
        const data = await res.json();
        Swal.fire("Error", data.error || "Gagal menghapus", "error");
      }
    } catch (err) {
      Swal.fire("Error", "Gagal menghapus user", "error");
    }
  }
}

// ============= ADMIN MANAGEMENT =============
async function loadAdmins() {
  if (currentAdminRole !== "superadmin") {
    const tbody = document.getElementById("adminTableBody");
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:48px;"><i class="fas fa-lock" style="font-size:48px; color:#94a3b8; margin-bottom:16px; display:block;"></i><p style="color:#475569;">🔒 Akses terbatas. Hanya Superadmin yang dapat mengelola admin accounts.</p></td></tr>`;
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
        <td data-label="Role"><span class="role-badge ${admin.role === "superadmin" ? "superadmin" : "admin"}"><i class="fas ${admin.role === "superadmin" ? "fa-crown" : "fa-user-shield"}"></i> ${admin.role === "superadmin" ? "Superadmin" : "Admin"}</span></td>
        <td data-label="Dibuat Pada">${new Date(admin.created_at).toLocaleDateString("id-ID")}</td>
        <td data-label="Aksi">
          <div class="action-group">
            <button class="btn btn-icon btn-edit" onclick="openEditAdminModal(${admin.id}, '${escapeHtml(admin.username)}', '${admin.role}')"><i class="fas fa-key"></i></button>
            ${admin.id !== currentAdminId ? `<button class="btn btn-icon btn-danger" onclick="deleteAdmin(${admin.id})"><i class="fas fa-trash"></i></button>` : ""}
          </div>
        </td>
      </tr>
    `,
      )
      .join("");
  } catch (err) {
    Swal.fire("Error", "Gagal memuat data admin", "error");
  }
}

function openAdminModal() {
  if (currentAdminRole !== "superadmin") {
    Swal.fire("Akses Ditolak", "Hanya Superadmin yang dapat menambah admin", "error");
    return;
  }
  document.getElementById("adminModalTitle").innerText = "Tambah Admin Baru";
  document.getElementById("adminUsernameInput").value = "";
  document.getElementById("adminPasswordInput").value = "";
  document.getElementById("adminRoleInput").value = "admin";
  document.getElementById("adminModal").style.display = "flex";
}

function closeAdminModal() {
  document.getElementById("adminModal").style.display = "none";
}

async function saveAdmin() {
  if (currentAdminRole !== "superadmin") return Swal.fire("Akses Ditolak", "", "error");

  const username = document.getElementById("adminUsernameInput").value.trim();
  const password = document.getElementById("adminPasswordInput").value;
  const role = document.getElementById("adminRoleInput").value;

  if (!username || !password) return Swal.fire("Error", "Username dan password wajib diisi", "error");
  if (username.length < 3) return Swal.fire("Error", "Username minimal 3 karakter", "error");
  if (password.length < 6) return Swal.fire("Error", "Password minimal 6 karakter", "error");

  try {
    const res = await fetch("/api/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, role }),
    });
    const data = await res.json();
    if (res.ok) {
      Swal.fire("Berhasil", "Admin baru ditambahkan", "success");
      closeAdminModal();
      loadAdmins();
    } else {
      Swal.fire("Error", data.error || "Gagal menambahkan", "error");
    }
  } catch (err) {
    Swal.fire("Error", "Terjadi kesalahan server", "error");
  }
}

function openEditAdminModal(id, username, role) {
  editTargetAdminId = id;
  editTargetAdminUsername = username;
  editTargetAdminRole = role;

  const isOwnAccount = id === currentAdminId;
  const isSuperadmin = currentAdminRole === "superadmin";

  document.getElementById("editAdminModalTitle").innerHTML = isOwnAccount ? "🔐 Ubah Password" : `✏️ Edit Admin: ${escapeHtml(username)}`;

  const editUsernameField = document.getElementById("editUsernameField");
  const editRoleField = document.getElementById("editRoleField");

  if (isSuperadmin && !isOwnAccount) {
    editUsernameField.style.display = "block";
    document.getElementById("editUsernameInput").value = username;
    editRoleField.style.display = "block";
    document.getElementById("editRoleSelect").value = role;
  } else {
    editUsernameField.style.display = "none";
    editRoleField.style.display = "none";
  }

  document.getElementById("currentPasswordInput").value = "";
  document.getElementById("newPasswordInput").value = "";
  document.getElementById("editAdminModal").style.display = "flex";
}

function closeEditAdminModal() {
  document.getElementById("editAdminModal").style.display = "none";
  editTargetAdminId = null;
}

async function updateAdminCredentials() {
  const newUsername = document.getElementById("editUsernameInput").value.trim();
  const newRole = document.getElementById("editRoleSelect")?.value;
  const currentPassword = document.getElementById("currentPasswordInput").value;
  const newPassword = document.getElementById("newPasswordInput").value;

  const isOwnAccount = editTargetAdminId === currentAdminId;
  const isSuperadmin = currentAdminRole === "superadmin";

  try {
    if (isSuperadmin && !isOwnAccount && newUsername && newUsername !== editTargetAdminUsername) {
      if (newUsername.length < 3) throw new Error("Username minimal 3 karakter");
      const usernameRes = await fetch(`/api/admins/${editTargetAdminId}/username`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername }),
      });
      if (!usernameRes.ok) {
        const data = await usernameRes.json();
        throw new Error(data.error || "Gagal update username");
      }
    }

    if (isSuperadmin && !isOwnAccount && newRole && newRole !== editTargetAdminRole) {
      const roleRes = await fetch(`/api/admins/${editTargetAdminId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!roleRes.ok) {
        const data = await roleRes.json();
        throw new Error(data.error || "Gagal update role");
      }
    }

    if (newPassword) {
      if (newPassword.length < 6) throw new Error("Password minimal 6 karakter");
      if (!currentPassword && isOwnAccount) throw new Error("Password saat ini wajib diisi");

      const passwordRes = await fetch(`/api/admins/${editTargetAdminId}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await passwordRes.json();
      if (!passwordRes.ok) throw new Error(data.error || "Gagal update password");
    }

    Swal.fire("Berhasil!", "Data admin diperbarui", "success");
    closeEditAdminModal();

    if (isOwnAccount && newPassword) {
      Swal.fire("Info", "Silakan login kembali dengan password baru", "info").then(() => {
        window.location.href = "/admin-logout";
      });
    } else {
      loadAdmins();
    }
  } catch (err) {
    Swal.fire("Error", err.message, "error");
  }
}

async function deleteAdmin(id) {
  if (currentAdminRole !== "superadmin") return Swal.fire("Akses Ditolak", "", "error");

  const result = await Swal.fire({
    title: "Hapus Admin?",
    text: "Data admin akan dihapus permanen",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    confirmButtonText: "Ya, Hapus",
  });
  if (result.isConfirmed) {
    try {
      const res = await fetch(`/api/admins/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        Swal.fire("Terhapus", "Admin berhasil dihapus", "success");
        loadAdmins();
      } else {
        Swal.fire("Error", data.error || "Gagal menghapus", "error");
      }
    } catch (err) {
      Swal.fire("Error", "Terjadi kesalahan", "error");
    }
  }
}

// ============= HELPER =============
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

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

    if (data.role === "superadmin") {
      document.getElementById("addAdminBtn").style.display = "flex";
      document.querySelectorAll(".tab-btn")[1].style.display = "flex";
    } else {
      document.getElementById("addAdminBtn").style.display = "none";
      document.querySelectorAll(".tab-btn")[1].style.display = "none";
      document.getElementById("adminsTab").classList.remove("active");
      document.getElementById("usersTab").classList.add("active");
    }
  } catch (err) {
    console.error(err);
  }
}

// ============= INIT =============
document.addEventListener("DOMContentLoaded", () => {
  checkRoleAccess();
  loadUsers();

  // Setup modal click outside close
  window.onclick = function (event) {
    if (event.target.classList.contains("modal")) {
      event.target.style.display = "none";
    }
  };
});
