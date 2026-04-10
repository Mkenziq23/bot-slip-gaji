// server/routes/slipGajiRoutes.js - COMPLETE FIXED VERSION

import express from "express";
import db from "../db.js";
import multer from "multer";
import { uploadExcel } from "../uploadExcel.js";
import kirimSlip from "../../bot/sendMessage/kirimSlipGajiHisana.js";
import kirimSlipEnakko from "../../bot/sendMessage/kirimSlipGajiEnakko.js";
import XLSX from "xlsx";
import { progress } from "../progress.js";
import { kirimPembatalanSlipHisana, kirimPembatalanSlipEnakko } from "../../bot/cancelMessage/cancelSlipGaji.js";
import { getSocketByNumber } from "../../bot/index.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

/*
========================
CHECK LOGIN
========================
*/
function checkLogin(req, res) {
  const number = req.session.number;
  if (!number) {
    res.status(401).json({
      success: false,
      message: "Belum login",
    });
    return null;
  }
  return number;
}

// Helper function untuk mendapatkan nama tabel karyawan
function getKaryawanTableName(company) {
  return company === "hisana" ? "data_karyawan_hisana" : "data_karyawan_enakko";
}

// Helper function untuk mendapatkan nama tabel lokasi store
function getLokasiStoreTableName(company) {
  return company === "hisana" ? "lokasi_store_hisana" : "lokasi_store_enakko";
}

// Helper function untuk parse currency dari Excel
function parseCurrencyFromExcel(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  const cleanValue = String(value).replace(/[^\d]/g, "");
  return parseInt(cleanValue) || 0;
}

// Helper untuk mendapatkan socket yang valid
async function getValidSocket(senderNumber, maxRetries = 5) {
  console.log(`[SOCKET CHECK] Checking socket for ${senderNumber}`);

  for (let i = 0; i < maxRetries; i++) {
    const sock = getSocketByNumber(senderNumber);

    // Log detail socket
    if (sock) {
      console.log(`[SOCKET CHECK] Socket found for ${senderNumber}, user: ${sock.user?.id ? "Yes" : "No"}`);
      if (sock.user && sock.user.id) {
        console.log(`✅ Socket valid untuk ${senderNumber}`);
        return sock;
      }
    } else {
      console.log(`[SOCKET CHECK] No socket found for ${senderNumber}, attempt ${i + 1}/${maxRetries}`);
    }

    // Jika belum ada, coba start bot ulang
    if (i === 2) {
      console.log(`[SOCKET CHECK] Attempting to restart bot for ${senderNumber}`);
      try {
        const { startBot } = await import("../../bot/index.js");
        await startBot({ number: senderNumber });
        console.log(`[SOCKET CHECK] Bot restart initiated for ${senderNumber}`);
      } catch (err) {
        console.error(`[SOCKET CHECK] Failed to restart bot:`, err.message);
      }
    }

    await new Promise((r) => setTimeout(r, 3000));
  }

  throw new Error(`Bot WhatsApp tidak aktif untuk nomor ${senderNumber}. Silakan scan QR code terlebih dahulu atau login ulang.`);
}

// ========================
// GET DATA SLIP DENGAN FILTER BULAN & TAHUN (WITH JOIN)
// ========================
router.get("/my-slip", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const month = req.query.month;
    const year = req.query.year;
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";
    const karyawanTable = getKaryawanTableName(company);
    const lokasiTable = getLokasiStoreTableName(company);

    console.log(`[SERVER] GET /my-slip`);
    console.log(`  Company: ${company}`);
    console.log(`  Month filter: ${month || "none"}`);
    console.log(`  Year filter: ${year || "none"}`);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.json([]);
    }

    const userId = users[0].id;

    let query = `
      SELECT 
        s.*,
        k.no_induk,
        k.nama_lengkap as nama,
        k.jabatan,
        DATE_FORMAT(k.awal_masuk, '%Y-%m-%d') as awal_masuk,
        l.nama_store as store_name,
        k.no_hp
      FROM ${tableName} s
      LEFT JOIN ${karyawanTable} k ON s.karyawan_id = k.id
      LEFT JOIN ${lokasiTable} l ON k.lokasi_store_id = l.id
      WHERE s.user_id = ? 
    `;
    const queryParams = [userId];

    if (month === "all") {
      console.log(`[GET SLIP] Showing ALL months`);
    } else if (month && month !== "") {
      query += ` AND MONTH(s.created_at) = ?`;
      queryParams.push(parseInt(month));
      console.log(`[GET SLIP] Filtering month: ${month}`);
    } else {
      const currentMonth = new Date().getMonth() + 1;
      query += ` AND MONTH(s.created_at) = ?`;
      queryParams.push(currentMonth);
      console.log(`[GET SLIP] Default month: ${currentMonth}`);
    }

    if (year === "all") {
      console.log(`[GET SLIP] Showing ALL years`);
    } else if (year && year !== "") {
      query += ` AND YEAR(s.created_at) = ?`;
      queryParams.push(parseInt(year));
      console.log(`[GET SLIP] Filtering year: ${year}`);
    } else {
      const currentYear = new Date().getFullYear();
      query += ` AND YEAR(s.created_at) = ?`;
      queryParams.push(currentYear);
      console.log(`[GET SLIP] Default year: ${currentYear}`);
    }

    query += ` ORDER BY s.created_at DESC, s.id DESC`;

    const [rows] = await db.query(query, queryParams);
    console.log(`[GET SLIP] Found ${rows.length} records`);
    res.json(rows);
  } catch (err) {
    console.error("[SERVER] GET SLIP ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========================
// GET EMPLOYEES FOR SLIP DROPDOWN
// ========================
router.get("/slip-employees", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || "hisana";
    const karyawanTable = getKaryawanTableName(company);
    const lokasiTable = getLokasiStoreTableName(company);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const [rows] = await db.query(
      `SELECT 
        k.id as karyawan_id,
        k.no_induk,
        k.nama_lengkap as nama,
        k.jabatan as posisi,
        DATE_FORMAT(k.awal_masuk, '%Y-%m-%d') as awal_masuk,
        l.nama_store as store,
        k.no_hp
      FROM ${karyawanTable} k
      LEFT JOIN ${lokasiTable} l ON k.lokasi_store_id = l.id
      WHERE k.user_id = ?
      ORDER BY k.no_induk ASC`,
      [userId],
    );

    res.json({ success: true, employees: rows });
  } catch (err) {
    console.error("[SLIP EMPLOYEES ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// GET AVAILABLE YEARS FOR SLIP
// ========================
router.get("/slip-years", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const userId = users[0].id;
    const [rows] = await db.query(`SELECT DISTINCT YEAR(created_at) as tahun FROM ${tableName} WHERE user_id = ? ORDER BY tahun DESC`, [userId]);
    const years = rows.map((row) => row.tahun);

    res.json({ success: true, years });
  } catch (err) {
    console.error("[GET SLIP YEARS ERROR]:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
  }
});

// ========================
// INSERT SLIP
// ========================
router.post("/slip", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const userId = users[0].id;
    const d = req.body;

    if (!d.karyawan_id) {
      return res.status(400).json({ success: false, message: "Pilih karyawan terlebih dahulu" });
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const [existing] = await db.query(
      `SELECT COUNT(*) as count FROM ${tableName} 
       WHERE user_id = ? AND karyawan_id = ? 
       AND MONTH(created_at) = ? AND YEAR(created_at) = ?`,
      [userId, d.karyawan_id, currentMonth, currentYear],
    );

    if (existing[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Karyawan ini sudah memiliki slip gaji untuk bulan ini.`,
      });
    }

    if (company === "hisana") {
      const query = `
        INSERT INTO ${tableName}
        (user_id, karyawan_id, kerja, gaji, iuran_bpjs_ketenagakerjaan, 
         kerajinan, cuti, tunj_bpjs_pulsa, jumlah, um, keterangan, 
         gaji_total, nohp, status_slip)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const values = [
        userId,
        d.karyawan_id,
        d.kerja || 0,
        d.gaji || 0,
        d.iuran_bpjs_ketenagakerjaan || 0,
        d.kerajinan || 0,
        d.cuti || 0,
        d.tunj_bpjs_pulsa || 0,
        d.jumlah || 0,
        d.um || 0,
        d.keterangan || "",
        d.gaji_total || 0,
        d.nohp || "",
        "belum_dikirim",
      ];
      await db.query(query, values);
    } else {
      const query = `
        INSERT INTO ${tableName}
        (user_id, karyawan_id, gaji_pokok, bpjs_kesehatan, 
         insentif, total_gaji, keterangan, nohp, status_slip)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const values = [userId, d.karyawan_id, parseFloat(d.gaji_pokok) || 0, parseFloat(d.bpjs_kesehatan) || 0, parseFloat(d.insentif) || 0, parseFloat(d.total_gaji) || 0, d.keterangan || "", d.nohp, "belum_dikirim"];
      await db.query(query, values);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[INSERT ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// UPDATE SLIP
// ========================
router.put("/slip/:id", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const id = req.params.id;
    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const userId = users[0].id;
    const d = req.body;

    if (!d.karyawan_id) {
      return res.status(400).json({ success: false, message: "Pilih karyawan terlebih dahulu" });
    }

    let result;
    if (company === "hisana") {
      const query = `
        UPDATE ${tableName} SET
          karyawan_id = ?, kerja = ?, gaji = ?, iuran_bpjs_ketenagakerjaan = ?,
          kerajinan = ?, cuti = ?, tunj_bpjs_pulsa = ?, jumlah = ?, um = ?,
          keterangan = ?, gaji_total = ?, nohp = ?
        WHERE id = ? AND user_id = ?
      `;
      const values = [
        d.karyawan_id,
        parseInt(d.kerja) || 0,
        parseFloat(d.gaji) || 0,
        parseFloat(d.iuran_bpjs_ketenagakerjaan) || 0,
        parseFloat(d.kerajinan) || 0,
        parseFloat(d.cuti) || 0,
        parseFloat(d.tunj_bpjs_pulsa) || 0,
        parseFloat(d.jumlah) || 0,
        parseFloat(d.um) || 0,
        d.keterangan || "",
        parseFloat(d.gaji_total) || 0,
        d.nohp || "",
        id,
        userId,
      ];
      [result] = await db.query(query, values);
    } else {
      const query = `
        UPDATE ${tableName} SET
          karyawan_id = ?, gaji_pokok = ?, bpjs_kesehatan = ?,
          insentif = ?, total_gaji = ?, keterangan = ?, nohp = ?
        WHERE id = ? AND user_id = ?
      `;
      const values = [d.karyawan_id, parseFloat(d.gaji_pokok) || 0, parseFloat(d.bpjs_kesehatan) || 0, parseFloat(d.insentif) || 0, parseFloat(d.total_gaji) || 0, d.keterangan || "", d.nohp || "", id, userId];
      [result] = await db.query(query, values);
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    }

    res.json({ success: true, message: "Data berhasil diperbarui" });
  } catch (err) {
    console.error("[UPDATE ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// DELETE SLIP
// ========================
router.delete("/slip/:id", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const id = req.params.id;
    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const userId = users[0].id;
    const [result] = await db.query(`DELETE FROM ${tableName} WHERE id = ? AND user_id = ?`, [id, userId]);

    res.json({ success: result.affectedRows > 0 });
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================
// DOWNLOAD TEMPLATE EXCEL SLIP GAJI
// ========================
router.get("/download-template-slip", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || "hisana";
    let ws_data = [];
    let filename = "";
    let instructions = [];

    if (company === "hisana") {
      ws_data = [
        ["No Induk", "Nama", "Jabatan", "Store", "Awal Masuk", "Kerja", "Gaji", "Iuran BPJS Ketenagakerjaan", "Kerajinan", "Cuti", "Tunj. BPJS & Pulsa", "JUMLAH", "UM", "KETERANGAN", "GAJI TOTAL", "NO HP"],
        ["H001", "Budi Santoso", "Staff", "Hisana Thamrin", "2020-01-15", "25", "5000000", "100000", "50000", "0", "200000", "5050000", "500000", "Bonus kinerja", "5550000", "628123456789"],
      ];
      filename = "template_slip_gaji_hisana.xlsx";
    } else {
      ws_data = [
        ["No Induk", "Nama Karyawan", "Jabatan", "Penempatan", "Tanggal Masuk", "Gaji Pokok", "BPJS Kesehatan", "Insentif", "Total Gaji", "Keterangan", "No HP"],
        ["E002", "Siti Aminah", "Staff", "Enakko Batu", "2026-04-08", "4500000", "100000", "50000", "4650000", "Insentif bulanan", "628123456788"],
      ];
      filename = "template_slip_gaji_enakko.xlsx";
    }

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (err) {
    console.error("[DOWNLOAD TEMPLATE ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// IMPORT EXCEL SLIP GAJI
// ========================
router.post("/import-slip", upload.single("file"), async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";
    const karyawanTable = getKaryawanTableName(company);

    if (!req.file) {
      return res.status(400).json({ success: false, message: "Silakan pilih file Excel terlebih dahulu" });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({ success: false, message: "File Excel tidak mengandung data" });
    }

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const [karyawanList] = await db.query(`SELECT id as karyawan_id, no_induk, nama_lengkap FROM ${karyawanTable} WHERE user_id = ?`, [userId]);
    const karyawanMap = new Map();
    karyawanList.forEach((k) => karyawanMap.set(k.no_induk, k));

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2;

      try {
        const no_induk = (row["No Induk"] || row["no_induk"] || "").toString().trim();
        let nohp = (row["No HP"] || row["nohp"] || "").toString().trim();

        if (!no_induk) {
          errorCount++;
          errors.push(`Baris ${rowNumber}: No Induk tidak boleh kosong`);
          continue;
        }

        let cleanNohp = nohp.replace(/\D/g, "");
        if (!cleanNohp.startsWith("62")) {
          if (cleanNohp.startsWith("0")) cleanNohp = "62" + cleanNohp.substring(1);
          else if (cleanNohp.length >= 10 && cleanNohp.length <= 12) cleanNohp = "62" + cleanNohp;
        }

        const karyawan = karyawanMap.get(no_induk);
        if (!karyawan) {
          errorCount++;
          errors.push(`Baris ${rowNumber}: No Induk "${no_induk}" tidak ditemukan`);
          continue;
        }

        const [existing] = await db.query(`SELECT COUNT(*) as count FROM ${tableName} WHERE user_id = ? AND karyawan_id = ? AND MONTH(created_at) = ? AND YEAR(created_at) = ?`, [userId, karyawan.karyawan_id, currentMonth, currentYear]);

        if (existing[0].count > 0) {
          skippedCount++;
          errors.push(`Baris ${rowNumber}: Slip gaji sudah ada, dilewati`);
          continue;
        }

        if (company === "hisana") {
          const kerja = parseInt(row["Kerja"] || 0);
          const gaji = parseCurrencyFromExcel(row["Gaji"] || 0);
          const iuran = parseCurrencyFromExcel(row["Iuran BPJS Ketenagakerjaan"] || 0);
          const kerajinan = parseCurrencyFromExcel(row["Kerajinan"] || 0);
          const cuti = parseCurrencyFromExcel(row["Cuti"] || 0);
          const tunjangan = parseCurrencyFromExcel(row["Tunj. BPJS & Pulsa"] || 0);
          const um = parseCurrencyFromExcel(row["UM"] || 0);
          const keterangan = row["KETERANGAN"] || "";
          const jumlah = gaji - iuran + kerajinan + cuti + tunjangan;
          const gajiTotal = jumlah + um;

          await db.query(
            `
            INSERT INTO ${tableName} (user_id, karyawan_id, kerja, gaji, iuran_bpjs_ketenagakerjaan, 
             kerajinan, cuti, tunj_bpjs_pulsa, jumlah, um, keterangan, gaji_total, nohp, status_slip, is_imported, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          `,
            [userId, karyawan.karyawan_id, kerja, gaji, iuran, kerajinan, cuti, tunjangan, jumlah, um, keterangan, gajiTotal, cleanNohp, "belum_dikirim", 1],
          );
        } else {
          const gajiPokok = parseCurrencyFromExcel(row["Gaji Pokok"] || 0);
          const bpjsKesehatan = parseCurrencyFromExcel(row["BPJS Kesehatan"] || 0);
          const insentif = parseCurrencyFromExcel(row["Insentif"] || 0);
          const keterangan = row["Keterangan"] || "";
          const totalGaji = gajiPokok + bpjsKesehatan + insentif;

          await db.query(
            `
            INSERT INTO ${tableName} (user_id, karyawan_id, gaji_pokok, bpjs_kesehatan, 
             insentif, total_gaji, keterangan, nohp, status_slip, is_imported, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          `,
            [userId, karyawan.karyawan_id, gajiPokok, bpjsKesehatan, insentif, totalGaji, keterangan, cleanNohp, "belum_dikirim", 1],
          );
        }

        successCount++;
      } catch (err) {
        errorCount++;
        errors.push(`Baris ${rowNumber}: ${err.message}`);
      }
    }

    if (req.file && req.file.path) {
      const fs = await import("fs");
      fs.unlink(req.file.path, () => {});
    }

    res.json({ success: true, successCount, skippedCount, errorCount, errors: errors.slice(0, 30) });
  } catch (err) {
    console.error("[IMPORT SLIP ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// UPLOAD EXCEL (Legacy)
// ========================
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }
    const company = req.query.company || req.body.company || "hisana";
    await uploadExcel(req, res, number, company);
  } catch (err) {
    console.error("[UPLOAD ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// EXPORT SLIP GAJI KE EXCEL
// ========================
router.get("/export-slip", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || "hisana";
    const month = req.query.month;
    const year = req.query.year;
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";
    const karyawanTable = getKaryawanTableName(company);
    const lokasiTable = getLokasiStoreTableName(company);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    let query = `
      SELECT s.*, k.no_induk, k.nama_lengkap as nama, k.jabatan,
             DATE_FORMAT(k.awal_masuk, '%Y-%m-%d') as awal_masuk,
             l.nama_store as store_name, k.no_hp
      FROM ${tableName} s
      LEFT JOIN ${karyawanTable} k ON s.karyawan_id = k.id
      LEFT JOIN ${lokasiTable} l ON k.lokasi_store_id = l.id
      WHERE s.user_id = ?
    `;
    const queryParams = [userId];

    if (month && month !== "all" && month !== "") {
      query += ` AND MONTH(s.created_at) = ?`;
      queryParams.push(parseInt(month));
    }
    if (year && year !== "all" && year !== "") {
      query += ` AND YEAR(s.created_at) = ?`;
      queryParams.push(parseInt(year));
    }
    query += ` ORDER BY s.created_at DESC`;

    const [rows] = await db.query(query, queryParams);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Tidak ada data untuk diexport", noData: true });
    }

    let ws_data = [];
    if (company === "hisana") {
      ws_data.push(["No", "No Induk", "Nama", "Jabatan", "Store", "Awal Masuk", "Kerja", "Gaji", "Iuran BPJS", "Kerajinan", "Cuti", "Tunj. BPJS & Pulsa", "Total", "UM", "Keterangan", "Gaji Total", "No HP", "Status Slip", "Tanggal Dibuat"]);
      rows.forEach((item, index) => {
        ws_data.push([
          index + 1,
          item.no_induk || "",
          item.nama || "",
          item.jabatan || "",
          item.store_name || "",
          item.awal_masuk || "",
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
          item.status_slip || "",
          item.created_at ? new Date(item.created_at).toLocaleDateString("id-ID") : "",
        ]);
      });
    } else {
      ws_data.push(["No", "No Induk", "Nama Karyawan", "Jabatan", "Penempatan", "Tanggal Masuk", "Gaji Pokok", "BPJS Kesehatan", "Insentif", "Total Gaji", "Keterangan", "No HP", "Status Slip", "Tanggal Dibuat"]);
      rows.forEach((item, index) => {
        ws_data.push([
          index + 1,
          item.no_induk || "",
          item.nama || "",
          item.jabatan || "",
          item.store_name || "",
          item.awal_masuk || "",
          item.gaji_pokok || 0,
          item.bpjs_kesehatan || 0,
          item.insentif || 0,
          item.total_gaji || 0,
          item.keterangan || "",
          item.nohp || "",
          item.status_slip || "",
          item.created_at ? new Date(item.created_at).toLocaleDateString("id-ID") : "",
        ]);
      });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    XLSX.utils.book_append_sheet(wb, ws, "Slip Gaji");

    const companyName = company === "hisana" ? "Hisana" : "Enakko";
    const filename = `Slip_Gaji_${companyName}_${new Date().toISOString().split("T")[0]}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.send(buffer);
  } catch (err) {
    console.error("[EXPORT SLIP ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// KIRIM SLIP WHATSAPP - FIXED FOR BOTH HISANA & ENAKKO
// ========================
router.post("/start-send", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const selected = req.body.selected || [];
    const company = req.body.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";
    const karyawanTable = getKaryawanTableName(company);
    const lokasiTable = getLokasiStoreTableName(company);

    const [users] = await db.query("SELECT id, nomor_wa FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const userId = users[0].id;
    const senderNumber = users[0].nomor_wa;

    // CEK SOCKET SEBELUM PROSES
    try {
      await getValidSocket(senderNumber);
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    if (selected.length === 0) {
      return res.status(400).json({ success: false, message: "Tidak ada data yang dipilih" });
    }

    const placeholders = selected.map(() => "?").join(",");

    const [rows] = await db.query(
      `SELECT 
        s.*,
        k.id as karyawan_id,
        k.no_induk,
        k.nama_lengkap as nama,
        k.jabatan,
        DATE_FORMAT(k.awal_masuk, '%Y-%m-%d') as awal_masuk,
        l.nama_store as store_name,
        COALESCE(s.nohp, k.no_hp) as nohp
      FROM ${tableName} s
      LEFT JOIN ${karyawanTable} k ON s.karyawan_id = k.id
      LEFT JOIN ${lokasiTable} l ON k.lokasi_store_id = l.id
      WHERE s.user_id = ? AND s.id IN (${placeholders}) AND s.status_slip != 'terkirim'`,
      [userId, ...selected],
    );

    if (!rows.length) {
      return res.status(400).json({ success: false, message: "Tidak ada data terpilih yang belum terkirim" });
    }

    progress.running = true;
    progress.total = rows.length;
    progress.sent = 0;
    progress.failed = 0;

    res.json({ success: true });

    (async () => {
      for (const slip of rows) {
        try {
          if (!slip.nohp) {
            throw new Error(`Nomor HP tidak tersedia untuk ${slip.nama || slip.no_induk}`);
          }

          console.log(`📨 [${company.toUpperCase()}] Mengirim slip untuk: ${slip.nama} (${slip.no_induk}) ke ${slip.nohp}`);

          const slipData = {
            id: slip.id,
            no_induk: slip.no_induk,
            nama: slip.nama,
            nama_lengkap: slip.nama,
            jabatan: slip.jabatan,
            awal_masuk: slip.awal_masuk,
            store_name: slip.store_name,
            nohp: slip.nohp,
            no_hp: slip.nohp,
            gaji_pokok: slip.gaji_pokok || 0,
            bpjs_kesehatan: slip.bpjs_kesehatan || 0,
            insentif: slip.insentif || 0,
            total_gaji: slip.total_gaji || 0,
            keterangan: slip.keterangan || "",
            kerja: slip.kerja || 0,
            gaji: slip.gaji || 0,
            iuran_bpjs_ketenagakerjaan: slip.iuran_bpjs_ketenagakerjaan || 0,
            kerajinan: slip.kerajinan || 0,
            cuti: slip.cuti || 0,
            tunj_bpjs_pulsa: slip.tunj_bpjs_pulsa || 0,
            jumlah: slip.jumlah || 0,
            um: slip.um || 0,
            gaji_total: slip.gaji_total || 0,
          };

          if (company === "hisana") {
            await kirimSlip(slipData, senderNumber);
          } else {
            await kirimSlipEnakko(slipData, senderNumber);
          }

          await db.query(`UPDATE ${tableName} SET status_slip = 'terkirim' WHERE id = ? AND user_id = ?`, [slip.id, userId]);
          progress.sent++;
          console.log(`✅ [${company.toUpperCase()}] Berhasil terkirim: ${slip.nama}`);
        } catch (err) {
          console.error(`❌ [${company.toUpperCase()}] Gagal kirim ke ${slip.no_induk}:`, err.message);
          progress.failed++;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      progress.running = false;
      console.log(`📊 Selesai: ${progress.sent} berhasil, ${progress.failed} gagal dari ${progress.total}`);
    })();
  } catch (err) {
    console.error("[START SEND ERROR]:", err);
    progress.running = false;
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================
// BATAL KIRIM SLIP (UNDO SEND) - FIXED FOR BOTH HISANA & ENAKKO
// ========================
router.post("/undo-send", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const { selected, company, cancellation_note } = req.body;
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";
    const karyawanTable = getKaryawanTableName(company);
    const lokasiTable = getLokasiStoreTableName(company);

    if (!selected || selected.length === 0) {
      return res.status(400).json({ success: false, message: "Tidak ada data yang dipilih" });
    }

    const [users] = await db.query("SELECT id, nomor_wa FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;
    const senderNumber = users[0].nomor_wa;

    // CEK SOCKET SEBELUM PROSES
    try {
      await getValidSocket(senderNumber);
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    const placeholders = selected.map(() => "?").join(",");

    const [rows] = await db.query(
      `SELECT 
        s.*,
        k.no_induk,
        k.nama_lengkap as nama,
        k.jabatan,
        k.no_hp as nohp,
        l.nama_store as store_name
      FROM ${tableName} s
      LEFT JOIN ${karyawanTable} k ON s.karyawan_id = k.id
      LEFT JOIN ${lokasiTable} l ON k.lokasi_store_id = l.id
      WHERE s.id IN (${placeholders}) AND s.user_id = ? AND s.status_slip = 'terkirim'`,
      [...selected, userId],
    );

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: "Tidak ada data dengan status terkirim yang dipilih" });
    }

    const cancelMessages = [];
    for (const slip of rows) {
      try {
        const nohpToUse = slip.nohp || slip.no_hp;

        let slipData = {
          id: slip.id,
          no_induk: slip.no_induk,
          nama: slip.nama,
          jabatan: slip.jabatan,
          store_name: slip.store_name,
          nohp: nohpToUse,
        };

        if (company === "hisana") {
          slipData = {
            ...slipData,
            gaji: slip.gaji,
            iuran_bpjs_ketenagakerjaan: slip.iuran_bpjs_ketenagakerjaan,
            kerajinan: slip.kerajinan,
            cuti: slip.cuti,
            tunj_bpjs_pulsa: slip.tunj_bpjs_pulsa,
            um: slip.um,
            gaji_total: slip.gaji_total,
          };
        } else {
          slipData = {
            ...slipData,
            gaji_pokok: slip.gaji_pokok,
            bpjs_kesehatan: slip.bpjs_kesehatan,
            insentif: slip.insentif,
            total_gaji: slip.total_gaji,
            keterangan: slip.keterangan,
          };
        }

        let result;
        if (company === "hisana") {
          result = await kirimPembatalanSlipHisana(slipData, senderNumber, cancellation_note);
        } else {
          result = await kirimPembatalanSlipEnakko(slipData, senderNumber, cancellation_note);
        }

        cancelMessages.push({
          id: slip.id,
          no_induk: slip.no_induk,
          nama: slip.nama,
          success: result.success,
          message: result.message,
        });

        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        console.error(`Error sending cancel notification to ${slip.no_induk}:`, err);
        cancelMessages.push({ id: slip.id, no_induk: slip.no_induk, nama: slip.nama, success: false, message: err.message });
      }
    }

    const updateQuery = `
      UPDATE ${tableName} 
      SET status_slip = 'dibatalkan', cancelled_at = NOW(), cancellation_note = ?, cancelled_by = ?
      WHERE id IN (${placeholders}) AND user_id = ? AND status_slip = 'terkirim'
    `;

    const finalCancellationNote = cancellation_note || `Pembatalan kirim slip gaji pada ${new Date().toLocaleString("id-ID")}`;
    const [updateResult] = await db.query(updateQuery, [finalCancellationNote, number, ...selected, userId]);

    const successCount = cancelMessages.filter((m) => m.success).length;
    const failedCount = cancelMessages.filter((m) => !m.success).length;

    res.json({
      success: true,
      message: `Berhasil membatalkan ${updateResult.affectedRows} slip gaji. Notifikasi: ${successCount} berhasil, ${failedCount} gagal.`,
      details: cancelMessages,
      successCount,
      failedCount,
      updatedCount: updateResult.affectedRows,
    });
  } catch (err) {
    console.error("[UNDO SEND ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// CHECK UNDO STATUS
// ========================
router.get("/check-undo-status", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const [result] = await db.query(`SELECT COUNT(*) as count FROM ${tableName} WHERE user_id = ? AND status_slip = 'terkirim'`, [userId]);

    res.json({ success: true, hasSentData: result[0].count > 0, sentCount: result[0].count });
  } catch (err) {
    console.error("[CHECK UNDO STATUS ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// GET DATA DENGAN STATUS TERTENTU
// ========================
router.get("/my-slip/status/:status", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";
    const karyawanTable = getKaryawanTableName(company);
    const status = req.params.status;

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) return res.json([]);

    const userId = users[0].id;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const [rows] = await db.query(
      `SELECT s.*, k.no_induk, k.nama_lengkap as nama
       FROM ${tableName} s
       LEFT JOIN ${karyawanTable} k ON s.karyawan_id = k.id
       WHERE s.user_id = ? AND MONTH(s.created_at) = ? AND YEAR(s.created_at) = ? AND s.status_slip = ?
       ORDER BY s.id DESC`,
      [userId, currentMonth, currentYear, status],
    );

    res.json(rows);
  } catch (err) {
    console.error("[GET SLIP BY STATUS ERROR]:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========================
// GET PROGRESS
// ========================
router.get("/progress", (req, res) => {
  res.json(progress);
});

// ========================
// DUPLIKASI DATA DARI BULAN SEBELUMNYA
// ========================
router.post("/duplicate-data", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    let previousMonth = currentMonth - 1;
    let previousYear = currentYear;
    if (previousMonth === 0) {
      previousMonth = 12;
      previousYear = currentYear - 1;
    }

    const [existingCurrent] = await db.query(`SELECT karyawan_id FROM ${tableName} WHERE user_id = ? AND MONTH(created_at) = ? AND YEAR(created_at) = ?`, [userId, currentMonth, currentYear]);
    const existingKaryawanIds = new Set(existingCurrent.map((row) => row.karyawan_id));

    const [previousData] = await db.query(`SELECT * FROM ${tableName} WHERE user_id = ? AND MONTH(created_at) = ? AND YEAR(created_at) = ? ORDER BY id ASC`, [userId, previousMonth, previousYear]);

    if (previousData.length === 0) {
      return res.status(400).json({ success: false, message: `Tidak ada data slip gaji dari bulan sebelumnya (${previousMonth}/${previousYear}) untuk diduplikasi.` });
    }

    let duplicatedCount = 0;
    let skippedCount = 0;

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      for (const sourceData of previousData) {
        if (existingKaryawanIds.has(sourceData.karyawan_id)) {
          skippedCount++;
          continue;
        }

        const nowDate = new Date();

        if (company === "hisana") {
          await connection.query(
            `
            INSERT INTO ${tableName} (
              user_id, karyawan_id, kerja, gaji, iuran_bpjs_ketenagakerjaan, 
              kerajinan, cuti, tunj_bpjs_pulsa, jumlah, um, keterangan, 
              gaji_total, nohp, status_slip, is_duplicated, duplicated_from_id, 
              duplicated_at, is_imported, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
            [
              userId,
              sourceData.karyawan_id,
              sourceData.kerja,
              sourceData.gaji,
              sourceData.iuran_bpjs_ketenagakerjaan,
              sourceData.kerajinan,
              sourceData.cuti,
              sourceData.tunj_bpjs_pulsa,
              sourceData.jumlah,
              sourceData.um,
              sourceData.keterangan,
              sourceData.gaji_total,
              sourceData.nohp,
              "belum_dikirim",
              1,
              sourceData.id,
              nowDate,
              0,
              nowDate,
            ],
          );
        } else {
          await connection.query(
            `
            INSERT INTO ${tableName} (
              user_id, karyawan_id, gaji_pokok, bpjs_kesehatan, 
              insentif, total_gaji, keterangan, nohp, status_slip,
              is_duplicated, duplicated_from_id, duplicated_at, is_imported, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
            [
              userId,
              sourceData.karyawan_id,
              sourceData.gaji_pokok,
              sourceData.bpjs_kesehatan,
              sourceData.insentif,
              sourceData.total_gaji,
              sourceData.keterangan || "",
              sourceData.nohp,
              "belum_dikirim",
              1,
              sourceData.id,
              nowDate,
              0,
              nowDate,
            ],
          );
        }
        duplicatedCount++;
      }

      await connection.commit();
      res.json({ success: true, message: `Berhasil menduplikasi ${duplicatedCount} data slip gaji`, duplicatedCount, skippedCount });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("[DUPLICATE ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// CHECK DUPLICATE STATUS
// ========================
router.get("/check-duplicate-status", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const [result] = await db.query(`SELECT COUNT(*) as count FROM ${tableName} WHERE user_id = ? AND MONTH(created_at) = ? AND YEAR(created_at) = ? AND is_duplicated = 1`, [userId, currentMonth, currentYear]);

    res.json({ success: true, hasRecentDuplicate: result[0].count > 0 });
  } catch (err) {
    console.error("[CHECK DUPLICATE STATUS ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// BATALKAN DUPLIKASI
// ========================
router.post("/cancel-duplicate", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const [currentData] = await db.query(`SELECT id, is_duplicated FROM ${tableName} WHERE user_id = ? AND MONTH(created_at) = ? AND YEAR(created_at) = ?`, [userId, currentMonth, currentYear]);

    const duplicatedIds = currentData.filter((item) => item.is_duplicated === 1).map((item) => item.id);
    const manualCount = currentData.filter((item) => item.is_duplicated !== 1).length;

    if (duplicatedIds.length === 0) {
      return res.status(400).json({ success: false, message: "Tidak ada data hasil duplikasi untuk dibatalkan" });
    }

    const placeholders = duplicatedIds.map(() => "?").join(",");
    const [result] = await db.query(`DELETE FROM ${tableName} WHERE id IN (${placeholders})`, duplicatedIds);

    let message = `Berhasil membatalkan duplikasi. ${result.affectedRows} data hasil duplikasi telah dihapus.`;
    if (manualCount > 0) message += ` ${manualCount} data input manual tetap dipertahankan.`;

    res.json({ success: true, message, deletedCount: result.affectedRows, manualDataCount: manualCount });
  } catch (err) {
    console.error("[CANCEL DUPLICATE ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
