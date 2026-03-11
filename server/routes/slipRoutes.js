import express from "express";
import db from "../db.js";
import multer from "multer";
import { uploadExcel } from "../uploadExcel.js";
import kirimSlip from "../../bot/kirimSlip.js";
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
GET DATA SLIP
========================
*/
router.get("/my-slip", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);

    if (!users.length) return res.json([]);

    const userId = users[0].id;

    const [rows] = await db.query("SELECT * FROM slip_gaji WHERE user_id=? ORDER BY id DESC", [userId]);

    res.json(rows);
  } catch (err) {
    console.error("GET SLIP ERROR:", err);
    res.status(500).json([]);
  }
});

/*
========================
INSERT SLIP
========================
*/
router.post("/slip", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);

    if (!users.length) return res.json({ success: false });

    const userId = users[0].id;
    const d = req.body;

    await db.query(
      `INSERT INTO slip_gaji
      (user_id,no_induk,nama,posisi,store,awal_masuk,kerja,gaji,
      iuran_bpjs_ketenagakerjaan,kerajinan,cuti,tunj_bpjs_pulsa,
      jumlah,um,keterangan,gaji_total,nohp)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [userId, d.no_induk, d.nama, d.posisi, d.store, d.awal_masuk, d.kerja, d.gaji, d.iuran_bpjs_ketenagakerjaan, d.kerajinan, d.cuti, d.tunj_bpjs_pulsa, d.jumlah, d.um, d.keterangan, d.gaji_total, d.nohp],
    );

    res.json({ success: true });
  } catch (err) {
    console.error("INSERT ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/*
========================
UPDATE SLIP
========================
*/
router.put("/slip/:id", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const id = req.params.id;

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);

    if (!users.length) return res.json({ success: false });

    const userId = users[0].id;
    const d = req.body;

    const [result] = await db.query(
      `UPDATE slip_gaji SET
        no_induk=?,
        nama=?,
        posisi=?,
        store=?,
        awal_masuk=?,
        kerja=?,
        gaji=?,
        iuran_bpjs_ketenagakerjaan=?,
        kerajinan=?,
        cuti=?,
        tunj_bpjs_pulsa=?,
        jumlah=?,
        um=?,
        keterangan=?,
        gaji_total=?,
        nohp=?
      WHERE id=? AND user_id=?`,
      [d.no_induk, d.nama, d.posisi, d.store, d.awal_masuk, d.kerja, d.gaji, d.iuran_bpjs_ketenagakerjaan, d.kerajinan, d.cuti, d.tunj_bpjs_pulsa, d.jumlah, d.um, d.keterangan, d.gaji_total, d.nohp, id, userId],
    );

    res.json({
      success: result.affectedRows > 0,
    });
  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/*
========================
DELETE SLIP
========================
*/
router.delete("/slip/:id", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const id = req.params.id;

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);

    if (!users.length) return res.json({ success: false });

    const userId = users[0].id;

    const [result] = await db.query("DELETE FROM slip_gaji WHERE id=? AND user_id=?", [id, userId]);

    res.json({
      success: result.affectedRows > 0,
    });
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/*
========================
UPLOAD EXCEL
========================
*/
router.post("/upload", upload.single("file"), (req, res) => {
  const number = checkLogin(req, res);
  if (!number) return;

  uploadExcel(req, res, number);
});

/*
========================
KIRIM SLIP WHATSAPP
========================
*/
router.post("/start-send", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const selected = req.body.selected || [];
    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);

    if (!users.length) return res.status(400).send("User tidak ditemukan");

    const userId = users[0].id;
    const [rows] = await db.query("SELECT * FROM slip_gaji WHERE user_id=?", [userId]);

    // Filter data berdasarkan No Induk yang dipilih
    const toSend = rows.filter((d) => selected.includes(d.no_induk));

    if (toSend.length === 0) {
      return res.status(400).json({ success: false, message: "Tidak ada data dipilih" });
    }

    // Reset Progress
    progress.running = true;
    progress.total = toSend.length;
    progress.sent = 0;
    progress.failed = 0;

    res.json({ success: true });

    // Jalankan pengiriman di background agar tidak timeout
    (async () => {
      for (const karyawan of toSend) {
        try {
          // Pastikan pengirim (number) disertakan agar bot tahu session mana yang dipakai
          await kirimSlip(karyawan, number);
          progress.sent++;
        } catch (err) {
          console.error(`Gagal kirim ke ${karyawan.nama}:`, err.message);
          progress.failed++;
        }
        // Jeda 3 detik untuk menghindari blokir WhatsApp
        await new Promise((r) => setTimeout(r, 3000));
      }
      progress.running = false;
    })();
  } catch (err) {
    console.error("SEND ERROR:", err);
    progress.running = false;
    if (!res.headersSent) res.status(500).json({ success: false });
  }
});

export default router;
