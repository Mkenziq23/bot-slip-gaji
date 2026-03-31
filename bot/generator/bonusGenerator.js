import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

async function generateBonusPDF(data, company = "hisana") {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync("./bonus_slips")) {
        fs.mkdirSync("./bonus_slips", { recursive: true });
      }

      // Normalisasi data
      const normalized = {};
      Object.keys(data || {}).forEach((key) => {
        const newKey = key.toLowerCase().replace(/[.&]/g, "").replace(/\s+/g, "_");
        normalized[newKey] = data[key];
      });

      const namaKaryawan = (normalized.nama || "karyawan").toString();
      const fileName = namaKaryawan.replace(/[^a-z0-9]/gi, "_").substring(0, 30);
      const filePath = path.join("bonus_slips", `bonus_${company}_${fileName}_${Date.now()}.pdf`);

      const doc = new PDFDocument({ size: "A4", margin: 0 });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // ======================
      // CONFIG & THEME
      // ======================
      const theme = {
        primary: "#F59E0B", // Warna orange untuk bonus
        textMain: "#212121",
        textSecondary: "#757575",
        bgLight: "#FEF3C7",
        line: "#E0E0E0",
        success: "#16A34A",
      };

      const rupiah = (x) => new Intl.NumberFormat("id-ID").format(Math.abs(Number(x || 0)));
      const bulanNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

      const bulanText = bulanNames[normalized.bulan - 1] || "-";
      const tahunText = normalized.tahun || "-";

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
        .text("SLIP BONUS", 410, 55, { align: "right", width: 150 });

      // Body Container (Card Look)
      doc.roundedRect(40, 120, 515, 400, 8).fill("#FFFFFF");
      doc.lineWidth(1).strokeColor(theme.line).roundedRect(40, 120, 515, 400, 8).stroke();

      // ======================
      // INFORMASI KARYAWAN
      // ======================
      let y = 155;
      doc.fillColor(theme.primary).font("Helvetica-Bold").fontSize(12).text("INFORMASI KARYAWAN", 70, y);
      y += 25;

      const drawRow = (label, value, xPos, yPos) => {
        doc.fillColor(theme.textSecondary).font("Helvetica").fontSize(9).text(label, xPos, yPos);
        doc
          .fillColor(theme.textMain)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(value, xPos, yPos + 12);
      };

      drawRow("NAMA LENGKAP", (normalized.nama || "-").toUpperCase(), 70, y);
      drawRow("ID KARYAWAN", normalized.no_induk || "-", 250, y);
      drawRow("PERIODE BONUS", `${bulanText} ${tahunText}`, 430, y);

      y += 40;
      drawRow("PERUSAHAAN", company.toUpperCase(), 70, y);
      drawRow("STATUS", "BONUS", 250, y);

      // Divider Line
      y += 45;
      doc.moveTo(70, y).lineTo(525, y).lineWidth(1).strokeColor(theme.line).stroke();
      y += 20;

      // ======================
      // RINCIAN BONUS
      // ======================
      doc.fillColor(theme.primary).font("Helvetica-Bold").fontSize(12).text("RINCIAN BONUS", 70, y);
      y += 25;

      // Box untuk bonus
      doc.roundedRect(70, y, 455, 100, 8).fill(theme.bgLight);
      doc.roundedRect(70, y, 455, 100, 8).stroke();

      doc.fillColor(theme.textMain).font("Helvetica").fontSize(12);
      doc.text("Jumlah Bonus", 85, y + 20);
      doc
        .fillColor(theme.success)
        .font("Helvetica-Bold")
        .fontSize(20)
        .text(`Rp ${rupiah(normalized.jumlah_bonus || 0)}`, 85, y + 50);

      // Keterangan
      if (normalized.keterangan) {
        doc
          .fillColor(theme.textSecondary)
          .font("Helvetica-Oblique")
          .fontSize(9)
          .text(`Keterangan: ${normalized.keterangan}`, 85, y + 85);
      }

      // ======================
      // FOOTER
      // ======================
      y = 420;
      doc.fillColor(theme.textSecondary).font("Helvetica-Oblique").fontSize(8).text(`Catatan: Bonus ini merupakan tambahan penghasilan di luar gaji pokok.`, 70, y, { width: 250 });

      // // Tanda Tangan
      // doc.fillColor(theme.textMain).font("Helvetica").fontSize(10);
      // doc.text("Diterima Oleh,", 400, y);
      // doc.text("________________________", 400, y + 60);
      // doc.font("Helvetica-Bold").text(namaKaryawan.toUpperCase(), 400, y + 75, { width: 130, align: "center" });

      // Metadata Akhir
      doc
        .fontSize(8)
        .fillColor("#BDC3C7")
        .text(`ID Transaksi: ${Date.now()} | Dicetak pada: ${new Date().toLocaleString("id-ID")}`, 0, 550, { align: "center", width: 595 });

      doc.end();
      stream.on("finish", () => resolve(filePath));
      stream.on("error", (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

export default generateBonusPDF;
