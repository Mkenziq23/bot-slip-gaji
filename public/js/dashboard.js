// Identical Logic from original code remains here
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

let dataAll = [];
let filteredData = [];
let currentPageData = 1;
const pageSizeData = 10;
let currentPage = 1;
const pageSize = 10;
let checkedSet = new Set();

function rupiah(x) {
  if (!x) return "Rp 0";
  return "Rp " + Number(x).toLocaleString("id-ID");
}

async function loadData() {
  try {
    const res = await fetch("/my-slip");
    dataAll = await res.json();

    renderTable();
    renderDataTable();
  } catch (err) {
    console.error("Load data error:", err);
  }
}

const menuKirim = document.getElementById("menuKirim");
const menuData = document.getElementById("menuData");
const sectionKirim = document.getElementById("sectionKirim");
const sectionData = document.getElementById("sectionData");

menuKirim.onclick = () => {
  menuKirim.classList.add("active");
  menuData.classList.remove("active");
  sectionKirim.classList.add("active");
  sectionData.classList.remove("active");
};
menuData.onclick = () => {
  menuData.classList.add("active");
  menuKirim.classList.remove("active");
  sectionData.classList.add("active");
  sectionKirim.classList.remove("active");
  renderDataTable();
};

document.getElementById("uploadForm").onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  document.getElementById("uploadStatus").innerText = "Sedang memproses...";
  const res = await fetch("/upload", { method: "POST", body: formData });
  const result = await res.json();
  if (result.success) {
    Swal.fire("Import Berhasil!", result.message, "success");
    await loadData();
    e.target.reset();
  } else {
    Swal.fire("Import Gagal", result.message, "error");
  }
};

function renderTable() {
  const tbody = document.querySelector("#table tbody");
  tbody.innerHTML = "";
  const query = document.getElementById("searchInput").value.toLowerCase();
  const filtered = dataAll.filter((d) => Object.values(d).some((v) => String(v).toLowerCase().includes(query)));
  const totalPages = Math.ceil(filtered.length / pageSize);
  if (currentPage > totalPages) currentPage = 1;
  const start = (currentPage - 1) * pageSize;
  const pageData = filtered.slice(start, start + pageSize);

  pageData.forEach((d, i) => {
    let awalMasukFormatted = d.awal_masuk ? new Date(d.awal_masuk).toISOString().split("T")[0] : "";
    const tr = document.createElement("tr");
    const checked = checkedSet.has(d.no_induk) ? "checked" : "";
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
    tbody.appendChild(tr);
  });

  document.querySelectorAll(".chk").forEach((chk) => {
    chk.onchange = (e) => {
      const no = e.target.dataset.noinduk;
      if (e.target.checked) checkedSet.add(no);
      else checkedSet.delete(no);
    };
  });
  document.getElementById("pageInfo").innerText = `Halaman ${currentPage} dari ${totalPages || 1}`;
}

document.getElementById("searchInput").addEventListener("input", () => {
  currentPage = 1;
  renderTable();
});
document.getElementById("prevPage").onclick = () => {
  if (currentPage > 1) {
    currentPage--;
    renderTable();
  }
};
document.getElementById("nextPage").onclick = () => {
  const query = document.getElementById("searchInput").value.toLowerCase();
  const filtered = dataAll.filter((d) => Object.values(d).some((v) => String(v).toLowerCase().includes(query)));
  if (currentPage * pageSize < filtered.length) {
    currentPage++;
    renderTable();
  }
};

document.getElementById("sendSelected").onclick = async () => {
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
        body: JSON.stringify({ selected }),
      });

      const data = await res.json();
      if (data.success) {
        // Mulai memantau progress
        trackProgress();
      }
    } catch (err) {
      Swal.fire("Error", "Gagal memulai pengiriman", "error");
    }
  }
};

function trackProgress() {
  // Disable tombol agar tidak klik dua kali
  const btn = document.getElementById("sendSelected");
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...';

  const interval = setInterval(async () => {
    try {
      const res = await fetch("/progress");
      const p = await res.json();

      // Update progress bar secara visual
      const percent = p.total > 0 ? ((p.sent + p.failed) / p.total) * 100 : 0;
      document.getElementById("bar").style.width = percent + "%";
      document.getElementById("status").innerText = `Proses: ${p.sent} Berhasil, ${p.failed} Gagal dari ${p.total} Total`;

      // Jika proses selesai (running: false)
      if (!p.running && p.sent + p.failed >= p.total && p.total > 0) {
        clearInterval(interval);

        // Munculkan Alert Hasil Akhir
        Swal.fire({
          title: "Pengiriman Selesai!",
          html: `
            <div style="text-align: left;">
              <p>Total Data: <b>${p.total}</b></p>
              <p style="color: green;">Berhasil: <b>${p.sent}</b></p>
              <p style="color: red;">Gagal: <b>${p.failed}</b></p>
            </div>
          `,
          icon: "success",
          confirmButtonText: "OK",
          allowOutsideClick: false,
        }).then((result) => {
          if (result.isConfirmed) {
            // Refresh Halaman & Reset data
            // window.location.reload();
            checkedSet.clear();
            loadData();
            document.getElementById("bar").style.width = "0%";
          }
        });

        // Reset tombol
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim Slip Terpilih';
      }
    } catch (err) {
      console.error("Gagal memantau progress:", err);
    }
  }, 1500); // Cek setiap 1.5 detik
}

function calculatePayroll() {
  // Ambil nilai dari input, konversi ke angka (default 0 jika kosong)
  const gaji = parseFloat(document.getElementById("gaji").value) || 0;
  const iuran = parseFloat(document.getElementById("iuran_bpjs_ketenagakerjaan").value) || 0;
  const kerajinan = parseFloat(document.getElementById("kerajinan").value) || 0;
  const cuti = parseFloat(document.getElementById("cuti").value) || 0;
  const tunjangan = parseFloat(document.getElementById("tunj_bpjs_pulsa").value) || 0;
  const um = parseFloat(document.getElementById("um").value) || 0;

  // Rumus 1: gaji - iuran + kerajinan + cuti + tunjangan = jumlah
  const jumlah = gaji - iuran + kerajinan + cuti + tunjangan;

  // Rumus 2: jumlah + um = gaji total
  const gajiTotal = jumlah + um;

  // Masukkan ke field target
  document.getElementById("jumlah").value = Math.round(jumlah);
  document.getElementById("gaji_total").value = Math.round(gajiTotal);
}

// Daftar ID input yang memicu perubahan total
const triggerIds = ["gaji", "iuran_bpjs_ketenagakerjaan", "kerajinan", "cuti", "tunj_bpjs_pulsa", "um"];

triggerIds.forEach((id) => {
  document.getElementById(id).addEventListener("input", calculatePayroll);
});

function openModal(item = null) {
  const modal = document.getElementById("dataModal");
  modal.style.display = "flex";
  if (item) {
    document.getElementById("modalTitle").innerText = "Edit Data Slip";
    document.getElementById("dataId").value = item.id;
    ["no_induk", "nama", "posisi", "store", "awal_masuk", "kerja", "gaji", "iuran_bpjs_ketenagakerjaan", "kerajinan", "cuti", "tunj_bpjs_pulsa", "jumlah", "um", "keterangan", "gaji_total", "nohp"].forEach((k) => {
      const el = document.getElementById(k);
      if (!el) return;
      if (k === "awal_masuk" && item[k]) {
        el.value = new Date(item[k]).toISOString().split("T")[0];
      } else {
        el.value = item[k] || "";
      }
    });
  } else {
    document.getElementById("modalTitle").innerText = "Tambah Data Slip Baru";
    document.getElementById("dataForm").reset();
    document.getElementById("dataId").value = "";
  }
}

function renderDataTable() {
  const tbody = document.querySelector("#tableData tbody");
  tbody.innerHTML = "";
  const query = document.getElementById("searchDataInput").value.toLowerCase();
  filteredData = dataAll.filter((d) => Object.values(d).some((v) => String(v).toLowerCase().includes(query)));
  const totalPages = Math.ceil(filteredData.length / pageSizeData);
  if (currentPageData > totalPages) currentPageData = 1;
  const start = (currentPageData - 1) * pageSizeData;
  const pageData = filteredData.slice(start, start + pageSizeData);

  pageData.forEach((d, i) => {
    let awalMasukFormatted = d.awal_masuk ? new Date(d.awal_masuk).toISOString().split("T")[0] : "";
    const tr = document.createElement("tr");
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
    tbody.appendChild(tr);
  });
  document.getElementById("dataPageInfo").innerText = `Halaman ${currentPageData} dari ${totalPages || 1}`;
}

window.openModalById = (id) => {
  const item = dataAll.find((d) => d.id == id);
  openModal(item);
};

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
    const res = await fetch(`/slip/${id}`, {
      method: "DELETE",
    });

    const result = await res.json();

    if (result.success) {
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

  const payload = {};
  ["no_induk", "nama", "posisi", "store", "awal_masuk", "kerja", "gaji", "iuran_bpjs_ketenagakerjaan", "kerajinan", "cuti", "tunj_bpjs_pulsa", "jumlah", "um", "keterangan", "gaji_total", "nohp"].forEach((k) => {
    payload[k] = document.getElementById(k).value;
  });

  const method = id ? "PUT" : "POST";
  const url = id ? `/slip/${id}` : `/slip`;

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await res.json();

    if (result.success) {
      document.getElementById("dataModal").style.display = "none";

      await loadData();

      Swal.fire({
        title: "Berhasil!",
        text: id ? "Data berhasil diperbarui." : "Data berhasil ditambahkan.",
        icon: "success",
      });
    } else {
      Swal.fire("Gagal", "Tidak dapat menyimpan data.", "error");
    }
  } catch (err) {
    console.error(err);
    Swal.fire("Error", "Server error.", "error");
  }
};

document.getElementById("exportBtn").onclick = () => {
  // Buat salinan data tanpa kolom tertentu
  const exportData = filteredData.map((item) => {
    const { no, id, user_id, created_at, ...rest } = item;

    // Pastikan tanggal awal_masuk dalam format YYYY-MM-DD
    if (rest.awal_masuk) {
      const date = new Date(rest.awal_masuk);
      if (!isNaN(date)) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        rest.awal_masuk = `${year}-${month}-${day}`;
      } else {
        rest.awal_masuk = ""; // kosong jika tidak valid
      }
    }

    // Pastikan semua kolom angka benar-benar number
    const numberFields = ["kerja", "gaji", "iuran_bpjs_ketenagakerjaan", "kerajinan", "cuti", "tunj_bpjs_pulsa", "jumlah", "um", "gaji_total"];
    numberFields.forEach((key) => {
      if (rest[key] !== undefined && rest[key] !== null) {
        rest[key] = Number(rest[key]) || 0;
      }
    });

    return rest;
  });

  // Buat workbook dan sheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(exportData, { dateNF: "yyyy-mm-dd" });

  XLSX.utils.book_append_sheet(wb, ws, "SlipGaji");
  XLSX.writeFile(wb, "Export_Slip_Gaji.xlsx");
};

document.getElementById("closeModal").onclick = () => (document.getElementById("dataModal").style.display = "none");
document.getElementById("addDataBtn").onclick = () => openModal();
document.getElementById("resetCheckbox").onclick = () => {
  checkedSet.clear();
  renderTable();
};
document.getElementById("searchDataInput").oninput = () => {
  currentPageData = 1;
  renderDataTable();
};

// =============================
// WEBSOCKET FOR FORCE LOGOUT
// =============================
const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(`${protocol}//${window.location.host}`);

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);

  // Jika sistem mendeteksi logout dari HP (Force Logout)
  if (data.status === "force_logout") {
    Swal.fire({
      title: "Sesi Berakhir",
      text: "Koneksi WhatsApp terputus dari perangkat mobile Anda. Silakan login kembali.",
      icon: "warning",
      confirmButtonColor: "#2563eb",
      confirmButtonText: "OK",
      allowOutsideClick: false,
    }).then(() => {
      // Redirect ke halaman login/scan
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

loadData();
