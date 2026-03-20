import express from "express";
import db from "../db.js";
import multer from "multer";
import { uploadExcel } from "../uploadExcel.js";
import kirimSlip from "../../bot/kirimSlipGajiHisana.js";
import kirimSlipEnakko from "../../bot/kirimSlipGajiEnakko.js";
import { progress } from "../progress.js";

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

/*
========================
GET DATA SLIP (DENGAN PARAMETER COMPANY)
========================
*/
router.get("/my-slip", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    console.log(`[SERVER] GET /my-slip - company: ${company}, table: ${tableName}, user: ${number}`);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);

    if (!users.length) {
      console.log(`[SERVER] User tidak ditemukan untuk nomor: ${number}`);
      return res.json([]);
    }

    const userId = users[0].id;
    console.log(`[SERVER] userId: ${userId}`);

    const [rows] = await db.query(`SELECT * FROM ${tableName} WHERE user_id=? ORDER BY id DESC`, [userId]);

    console.log(`[SERVER] Data ditemukan: ${rows.length} baris`);

    if (rows.length > 0) {
      console.log(`[SERVER] Sample data:`, rows[0]);
    }

    res.json(rows);
  } catch (err) {
    console.error("[SERVER] GET SLIP ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/*
========================
INSERT SLIP (DENGAN PARAMETER COMPANY)
========================
*/
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

    console.log("=".repeat(50));
    console.log("[INSERT] Received data:", JSON.stringify(d, null, 2));
    console.log("[INSERT] Company:", company);
    console.log("[INSERT] Table:", tableName);
    console.log("[INSERT] User ID:", userId);

    if (company === "hisana") {
      // Hisana insert logic
      const query = `
        INSERT INTO ${tableName}
        (user_id, no_induk, nama, posisi, store, awal_masuk, kerja, gaji,
        iuran_bpjs_ketenagakerjaan, kerajinan, cuti, tunj_bpjs_pulsa,
        jumlah, um, keterangan, gaji_total, nohp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [userId, d.no_induk, d.nama, d.posisi, d.store, d.awal_masuk, d.kerja, d.gaji, d.iuran_bpjs_ketenagakerjaan, d.kerajinan, d.cuti, d.tunj_bpjs_pulsa, d.jumlah, d.um, d.keterangan, d.gaji_total, d.nohp];

      console.log("[INSERT Hisana] Query:", query);
      console.log("[INSERT Hisana] Values:", values);

      await db.query(query, values);
    } else {
      // Enakko insert logic - PERBAIKAN UTAMA
      console.log("[INSERT Enakko] Processing...");

      // Validasi field yang diperlukan
      const requiredFields = ["no_induk", "tanggal_masuk", "jabatan", "nohp"];
      const missingFields = requiredFields.filter((field) => !d[field]);

      if (missingFields.length > 0) {
        console.error("[INSERT Enakko] Missing fields:", missingFields);
        return res.status(400).json({
          success: false,
          message: `Field yang diperlukan tidak lengkap: ${missingFields.join(", ")}`,
        });
      }

      // Pastikan field nama_karyawan ada (fallback ke nama jika tidak ada)
      const namaKaryawan = d.nama_karyawan || d.nama;
      if (!namaKaryawan) {
        console.error("[INSERT Enakko] Missing nama_karyawan field");
        return res.status(400).json({
          success: false,
          message: "Nama karyawan harus diisi",
        });
      }

      const query = `
        INSERT INTO ${tableName}
        (user_id, no_induk, nama_karyawan, tanggal_masuk, jabatan, penempatan
        gaji_utuh, gaji_pokok, bpjs_kesehatan, insentif, 
        total_gaji, keterangan, nohp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        userId,
        d.no_induk,
        namaKaryawan,
        d.tanggal_masuk,
        d.jabatan,
        d.penempatan,
        parseFloat(d.gaji_utuh) || 0,
        parseFloat(d.gaji_pokok) || 0,
        parseFloat(d.bpjs_kesehatan) || 0,
        parseFloat(d.insentif) || 0,
        parseFloat(d.total_gaji) || 0,
        d.keterangan || "",
        d.nohp,
      ];

      console.log("[INSERT Enakko] Query:", query);
      console.log("[INSERT Enakko] Values:", values);

      // Execute query
      const [result] = await db.query(query, values);
      console.log("[INSERT Enakko] Result:", result);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("=".repeat(50));
    console.error("[INSERT ERROR] Details:");
    console.error("Error message:", err.message);
    console.error("Error code:", err.code);
    console.error("Error errno:", err.errno);
    console.error("SQL State:", err.sqlState);
    console.error("SQL Message:", err.sqlMessage);
    console.error("Stack trace:", err.stack);
    console.error("=".repeat(50));

    // Kirim error detail ke client (jangan kirim stack trace di production)
    res.status(500).json({
      success: false,
      message: err.sqlMessage || err.message,
      code: err.code,
    });
  }
});

/*
========================
UPDATE SLIP (DENGAN PARAMETER COMPANY)
========================
*/
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

    console.log(`[UPDATE] Company: ${company}, ID: ${id}, Data:`, d);

    let result;
    if (company === "hisana") {
      [result] = await db.query(
        `UPDATE ${tableName} SET
          no_induk = ?,
          nama = ?,
          posisi = ?,
          store = ?,
          awal_masuk = ?,
          kerja = ?,
          gaji = ?,
          iuran_bpjs_ketenagakerjaan = ?,
          kerajinan = ?,
          cuti = ?,
          tunj_bpjs_pulsa = ?,
          jumlah = ?,
          um = ?,
          keterangan = ?,
          gaji_total = ?,
          nohp = ?
        WHERE id = ? AND user_id = ?`,
        [d.no_induk, d.nama, d.posisi, d.store, d.awal_masuk, d.kerja, d.gaji, d.iuran_bpjs_ketenagakerjaan, d.kerajinan, d.cuti, d.tunj_bpjs_pulsa, d.jumlah, d.um, d.keterangan, d.gaji_total, d.nohp, id, userId],
      );
    } else {
      // UPDATE ENAKKO - pastikan field yang digunakan sesuai
      const namaKaryawan = d.nama_karyawan || d.nama; // Fallback jika menggunakan 'nama'

      [result] = await db.query(
        `UPDATE ${tableName} SET
          no_induk = ?,
          nama_karyawan = ?,
          tanggal_masuk = ?,
          jabatan = ?,
          penempatan = ?,
          gaji_utuh = ?,
          gaji_pokok = ?,
          bpjs_kesehatan = ?,
          insentif = ?,
          total_gaji = ?,
          keterangan = ?,
          nohp = ?
        WHERE id = ? AND user_id = ?`,
        [d.no_induk, namaKaryawan, d.tanggal_masuk, d.jabatan, d.penempatan, d.gaji_utuh || 0, d.gaji_pokok || 0, d.bpjs_kesehatan || 0, d.insentif || 0, d.total_gaji || 0, d.keterangan || "", d.nohp, id, userId],
      );
    }

    res.json({
      success: result.affectedRows > 0,
    });
  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/*
========================
DELETE SLIP (DENGAN PARAMETER COMPANY)
========================
*/
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

    res.json({
      success: result.affectedRows > 0,
    });
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================
// UPLOAD EXCEL
// ========================
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || req.body.company || "hisana";
    console.log(`[UPLOAD ROUTE] Company: ${company}, User: ${number}`);

    // Panggil fungsi uploadExcel
    await uploadExcel(req, res, number, company);
  } catch (err) {
    console.error("[UPLOAD ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// KIRIM SLIP WHATSAPP
// ========================
router.post("/start-send", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const selected = req.body.selected || [];
    const company = req.body.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);

    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const userId = users[0].id;

    // Ambil data berdasarkan user_id dan no_induk yang dipilih
    const [rows] = await db.query(`SELECT * FROM ${tableName} WHERE user_id = ?`, [userId]);

    let toSend;
    if (company === "hisana") {
      toSend = rows.filter((d) => selected.includes(d.no_induk));
    } else {
      // Untuk Enakko, filter berdasarkan no_induk
      toSend = rows.filter((d) => selected.includes(d.no_induk));
    }

    if (!toSend.length) {
      return res.status(400).json({ success: false, message: "Tidak ada data terpilih" });
    }

    progress.running = true;
    progress.total = toSend.length;
    progress.sent = 0;
    progress.failed = 0;

    res.json({ success: true });

    // Proses pengiriman secara asynchronous
    (async () => {
      for (const karyawan of toSend) {
        try {
          if (company === "hisana") {
            await kirimSlip(karyawan, number);
          } else {
            await kirimSlipEnakko(karyawan, number);
          }
          progress.sent++;
        } catch (err) {
          console.error(`Gagal kirim ke ${karyawan.no_induk}:`, err);
          progress.failed++;
        }
        await new Promise((r) => setTimeout(r, 2000)); // Delay 2 detik antar pengiriman
      }
      progress.running = false;
    })();
  } catch (err) {
    console.error("START SEND ERROR:", err);
    progress.running = false;
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================
// GET PROGRESS
// ========================
router.get("/progress", (req, res) => {
  res.json(progress);
});

export default router;
