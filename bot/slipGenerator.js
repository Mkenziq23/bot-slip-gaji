import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

async function generateSlip(data) {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync("./slips")) {
        fs.mkdirSync("./slips", { recursive: true });
      }

      const normalized = {};

      Object.keys(data || {}).forEach((key) => {
        const newKey = key.toLowerCase().replace(/[.&]/g, "").replace(/\s+/g, "_");

        normalized[newKey] = data[key];
      });

      const fileName = (normalized.nama || "karyawan").toString().replace(/[^a-z0-9]/gi, "_");

      const filePath = path.join("slips", `slip_${fileName}.pdf`);

      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
      });

      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // ======================
      // HELPER
      // ======================

      function num(x) {
        if (!x) return 0;
        const n = Number(String(x).replace(/[^\d]/g, ""));
        return isNaN(n) ? 0 : n;
      }

      function txt(x) {
        return x || "-";
      }

      function rupiah(x) {
        return new Intl.NumberFormat("id-ID").format(num(x));
      }

      // ======================
      // DATA
      // ======================

      const noInduk = txt(normalized.no_induk);
      const nama = txt(normalized.nama);
      const jabatan = txt(normalized.posisi);
      const store = txt(normalized.store);
      const kerja = txt(normalized.kerja);

      const gaji = num(normalized.gaji);
      const uangMakan = num(normalized.um);
      const kerajinan = num(normalized.kerajinan);
      const tunjangan = num(normalized.tunj_bpjs_pulsa);
      const bpjs = num(normalized.iuran_bpjs_ketenagakerjaan);
      const cuti = num(normalized.cuti);

      const keterangan = txt(normalized.keterangan);

      const total = gaji + uangMakan + kerajinan + tunjangan - bpjs + cuti;

      const today = new Date().toLocaleDateString("id-ID");

      // ======================
      // HEADER
      // ======================

      const logoPath = path.join("assets", "logo.jpeg");

      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 40, { width: 60 });
      }

      doc.fontSize(18).font("Helvetica-Bold").text("HISANA FRIED CHICKEN", 120, 55);

      doc.fontSize(10).font("Helvetica").text(`Tanggal : ${today}`, 400, 60);

      doc.fontSize(16).font("Helvetica-Bold").text("SLIP GAJI KARYAWAN", 0, 110, { align: "center" });

      doc.moveTo(50, 135).lineTo(545, 135).stroke();

      // ======================
      // INFORMASI KARYAWAN
      // ======================

      let y = 160;

      doc.fontSize(11).font("Helvetica");

      doc.text(`No Induk    : ${noInduk}`, 70, y);
      y += 20;

      doc.text(`Nama        : ${nama}`, 70, y);
      y += 20;

      doc.text(`Jabatan     : ${jabatan}`, 70, y);
      y += 20;

      doc.text(`Store       : ${store}`, 70, y);
      y += 20;

      doc.text(`Hari Kerja  : ${kerja}`, 70, y);
      y += 30;

      doc.moveTo(50, y).lineTo(545, y).stroke();

      // ======================
      // TABEL GAJI
      // ======================

      y += 20;

      function row(label, value) {
        doc.text(label, 70, y);
        doc.text(value, 400, y, { width: 120, align: "right" });
        y += 22;
      }

      doc.font("Helvetica-Bold");

      row("Komponen", "Nominal");

      doc
        .moveTo(50, y - 10)
        .lineTo(545, y - 10)
        .stroke();

      doc.font("Helvetica");

      row("Gaji", `Rp ${rupiah(gaji)}`);
      row("Uang Makan", `Rp ${rupiah(uangMakan)}`);
      row("Iuran BPJS", `- Rp ${rupiah(bpjs)}`);
      row("Kerajinan", `Rp ${rupiah(kerajinan)}`);
      row("Cuti", `Rp ${rupiah(cuti)}`);
      row("Tunjangan BPJS & Pulsa", `Rp ${rupiah(tunjangan)}`);

      doc.moveTo(50, y).lineTo(545, y).stroke();

      y += 15;

      doc.font("Helvetica-Bold");

      row("TOTAL GAJI", `Rp ${rupiah(total)}`);

      doc.moveTo(50, y).lineTo(545, y).stroke();

      // ======================
      // KETERANGAN
      // ======================

      y += 30;

      doc.font("Helvetica");

      doc.text(`Keterangan : ${keterangan}`, 70, y);

      doc.end();

      stream.on("finish", () => resolve(filePath));
      stream.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

export default generateSlip;
