import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

async function generateSlip(data, company = "hisana") {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync("./slips")) {
        fs.mkdirSync("./slips", { recursive: true });
      }

      // Normalisasi data
      const normalized = {};
      Object.keys(data || {}).forEach((key) => {
        const newKey = key.toLowerCase().replace(/[.&]/g, "").replace(/\s+/g, "_");
        normalized[newKey] = data[key];
      });

      const namaKaryawan = (normalized.nama || normalized.nama_karyawan || "karyawan").toString();
      const fileName = namaKaryawan.replace(/[^a-z0-9]/gi, "_").substring(0, 30);
      const filePath = path.join("slips", `slip_${company}_${fileName}_${Date.now()}.pdf`);

      const doc = new PDFDocument({ size: "A4", margin: 0 });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // ======================
      // CONFIG & THEME
      // ======================
      const theme = {
        primary: company === "hisana" ? "#C62828" : "#C62828", // Merah vs Hijau
        textMain: "#212121",
        textSecondary: "#757575",
        bgLight: "#F8F9FA",
        line: "#E0E0E0",
        danger: "#D32F2F",
      };

      const rupiah = (x) => new Intl.NumberFormat("id-ID").format(Math.abs(Number(x || 0)));
      const formatDate = (d) => (d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "-");

      // ======================
      // HEADER DESIGN
      // ======================
      // Latar belakang header
      doc.rect(0, 0, 600, 140).fill(theme.primary);

      // Logo (jika ada)
      const logoPath = path.join("assets", company === "hisana" ? "hisanna.jpeg" : "enakko.jpeg");
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 35, { width: 70 });
      }

      // Nama Perusahaan & Judul
      doc
        .fillColor("#FFFFFF")
        .font("Helvetica-Bold")
        .fontSize(22)
        .text(company.toUpperCase(), 135, 45)
        .font("Helvetica")
        .fontSize(10)
        .text("Sistem Penggajian Digital Otomatis", 135, 75)
        .font("Helvetica-Bold")
        .fontSize(14)
        .text("SLIP GAJI KARYAWAN", 380, 55, { align: "right", width: 150 });

      // Body Container (Card Look)
      doc.roundedRect(40, 120, 515, 680, 8).fill("#FFFFFF");
      doc.lineWidth(1).strokeColor(theme.line).roundedRect(40, 120, 515, 680, 8).stroke();

      // ======================
      // INFORMASI KARYAWAN
      // ======================
      let y = 155;
      doc.fillColor(theme.primary).font("Helvetica-Bold").fontSize(12).text("PROFIL KARYAWAN", 70, y);
      y += 25;

      const drawRow = (label, value, xPos, yPos) => {
        doc.fillColor(theme.textSecondary).font("Helvetica").fontSize(9).text(label, xPos, yPos);
        doc
          .fillColor(theme.textMain)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(value, xPos, yPos + 12);
      };

      drawRow("NAMA LENGKAP", (normalized.nama || normalized.nama_karyawan || "-").toUpperCase(), 70, y);
      drawRow("ID KARYAWAN", normalized.no_induk || "-", 250, y);
      drawRow("PERIODE", new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" }), 430, y);

      y += 40;
      drawRow("JABATAN", normalized.posisi || normalized.jabatan || "-", 70, y);
      if (company === "hisana") {
        drawRow("STORE/UNIT", normalized.store || "-", 250, y);
        drawRow("TANGGAL BERGABUNG", formatDate(normalized.awal_masuk), 430, y);
      }

      // Divider Line
      y += 45;
      doc.moveTo(70, y).lineTo(525, y).lineWidth(1).strokeColor(theme.line).stroke();
      y += 20;

      // ======================
      // RINCIAN GAJI (TABEL)
      // ======================
      doc.fillColor(theme.primary).font("Helvetica-Bold").fontSize(12).text("RINCIAN PENGHASILAN", 70, y);
      y += 25;

      // Header Tabel
      doc.rect(70, y, 455, 25).fill(theme.bgLight);
      doc
        .fillColor(theme.textSecondary)
        .font("Helvetica-Bold")
        .fontSize(9)
        .text("KOMPONEN", 85, y + 8);
      doc.text("NOMINAL (IDR)", 400, y + 8, { width: 110, align: "right" });
      y += 35;

      let items = [];
      if (company === "hisana") {
        items = [
          ["Gaji Pokok", Number(normalized.gaji)],
          ["Uang Makan (UM)", Number(normalized.um)],
          ["Tunjangan Kerajinan", Number(normalized.kerajinan)],
          ["Tunj. BPJS & Pulsa", Number(normalized.tunj_bpjs_pulsa)],
          ["Cuti", Number(normalized.cuti)],
          ["Iuran BPJS (Potongan)", -Number(normalized.iuran_bpjs_ketenagakerjaan)],
        ];
      } else {
        items = [
          ["Gaji Utuh", Number(normalized.gaji_utuh)],
          ["Gaji Pokok", Number(normalized.gaji_pokok)],
          ["Insentif", Number(normalized.insentif)],
          ["BPJS Kesehatan", Number(normalized.bpjs_kesehatan)],
        ];
      }

      let total = 0;
      items.forEach(([label, value]) => {
        if (!value && value !== 0) return;
        total += value;

        doc.fillColor(theme.textMain).font("Helvetica").fontSize(10).text(label, 85, y);

        if (value < 0) {
          doc.fillColor(theme.danger).text(`(${rupiah(value)})`, 400, y, { width: 110, align: "right" });
        } else {
          doc.fillColor(theme.textMain).text(rupiah(value), 400, y, { width: 110, align: "right" });
        }

        y += 22;
        doc
          .moveTo(85, y - 5)
          .lineTo(510, y - 5)
          .lineWidth(0.5)
          .strokeColor(theme.line)
          .stroke();
      });

      // Total Box
      y += 15;
      doc.rect(300, y, 225, 45).fill(theme.primary);
      doc
        .fillColor("#FFFFFF")
        .font("Helvetica-Bold")
        .fontSize(10)
        .text("TAKE HOME PAY", 315, y + 10);
      doc.fontSize(14).text(`Rp ${rupiah(total)}`, 315, y + 22, { width: 200, align: "right" });

      // ======================
      // FOOTER
      // ======================
      y = 680;
      doc
        .fillColor(theme.textSecondary)
        .font("Helvetica-Oblique")
        .fontSize(8)
        .text(`Catatan: ${normalized.keterangan || "Slip ini adalah dokumen sah yang dihasilkan secara elektronik."}`, 70, y, { width: 250 });

      // // Tanda Tangan
      // doc.fillColor(theme.textMain).font("Helvetica").fontSize(10);
      // doc.text("Diterima Oleh,", 400, y);
      // doc.text("________________________", 400, y + 60);
      // doc.font("Helvetica-Bold").text(namaKaryawan.toUpperCase(), 400, y + 75, { width: 130, align: "center" });

      // Metadata Akhir
      doc
        .fontSize(8)
        .fillColor("#BDC3C7")
        .text(`ID Transaksi: ${Date.now()} | Dicetak pada: ${new Date().toLocaleString("id-ID")}`, 0, 810, { align: "center", width: 595 });

      doc.end();
      stream.on("finish", () => resolve(filePath));
      stream.on("error", (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

export default generateSlip;
