import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateBonusPDF(data, company = "hisana") {
  return new Promise((resolve, reject) => {
    try {
      // Create directory if not exists
      const bonusDir = path.join(process.cwd(), "bonus_slips");
      if (!fs.existsSync(bonusDir)) {
        fs.mkdirSync(bonusDir, { recursive: true });
      }

      // Normalisasi data
      const normalized = {};
      Object.keys(data || {}).forEach((key) => {
        const newKey = key.toLowerCase().replace(/[.&]/g, "").replace(/\s+/g, "_");
        normalized[newKey] = data[key];
      });

      // Validate required data
      if (!normalized.nama) {
        throw new Error("Nama karyawan tidak ditemukan");
      }

      const namaKaryawan = normalized.nama.toString();
      const fileName = namaKaryawan.replace(/[^a-z0-9]/gi, "_").substring(0, 30);
      const timestamp = Date.now();
      const filePath = path.join(bonusDir, `bonus_${company}_${fileName}_${timestamp}.pdf`);

      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        layout: "portrait",
      });

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // ======================
      // CONFIG & THEME
      // ======================
      const theme = {
        primary: company === "hisana" ? "#F59E0B" : "#F59E0B", // Orange for Hisana, Green for Enakko
        primaryLight: company === "hisana" ? "#FEF3C7" : "#D1FAE5",
        textMain: "#1E293B",
        textSecondary: "#64748B",
        bgLight: "#F8FAFC",
        line: "#E2E8F0",
        success: "#16A34A",
        border: "#CBD5E1",
      };

      const rupiah = (x) => {
        const num = Number(x || 0);
        return new Intl.NumberFormat("id-ID").format(Math.abs(num));
      };

      const bulanNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

      const bulanText = bulanNames[normalized.bulan - 1] || "-";
      const tahunText = normalized.tahun || "-";

      // Company display name
      const companyDisplay = company === "hisana" ? "HISANA" : "ENAKKO";
      const companyFullName = company === "hisana" ? "PT Hisana Cipta Karya" : "PT Enakko Food Indonesia";

      // ======================
      // HEADER DESIGN
      // ======================
      let y = 0;

      // Header background
      doc.rect(0, 0, doc.page.width, 140).fill(theme.primary);

      // Logo
      const logoPaths = [
        path.join(process.cwd(), "assets", company === "hisana" ? "hisanna.jpeg" : "enakko.jpeg"),
        path.join(process.cwd(), "public", "assets", company === "hisana" ? "hisanna.jpeg" : "enakko.jpeg"),
        path.join(__dirname, "..", "assets", company === "hisana" ? "hisanna.jpeg" : "enakko.jpeg"),
      ];

      let logoLoaded = false;
      for (const logoPath of logoPaths) {
        if (fs.existsSync(logoPath)) {
          try {
            doc.image(logoPath, 50, 35, { width: 70 });
            logoLoaded = true;
            break;
          } catch (err) {
            console.log(`Failed to load logo from ${logoPath}:`, err.message);
          }
        }
      }

      if (!logoLoaded) {
        // Draw placeholder circle if logo not found
        doc.circle(85, 70, 30).fill("#FFFFFF").opacity(0.3);
        doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(14);
        doc.text(companyDisplay.charAt(0), 78, 60, { align: "center" });
      }

      // Company Name & Title
      doc
        .fillColor("#FFFFFF")
        .font("Helvetica-Bold")
        .fontSize(24)
        .text(companyDisplay, 135, 45)
        .font("Helvetica")
        .fontSize(10)
        .text(companyFullName, 135, 75)
        .font("Helvetica-Bold")
        .fontSize(16)
        .text("SLIP BONUS", doc.page.width - 150, 55, { align: "right", width: 130 });

      // Body Container
      const bodyY = 160;
      doc.roundedRect(40, bodyY, doc.page.width - 80, 380, 12).fill("#FFFFFF");
      doc
        .lineWidth(1.5)
        .strokeColor(theme.border)
        .roundedRect(40, bodyY, doc.page.width - 80, 380, 12)
        .stroke();

      // ======================
      // INFORMASI KARYAWAN
      // ======================
      y = bodyY + 25;

      // Section title with line
      doc.fillColor(theme.primary).font("Helvetica-Bold").fontSize(14).text("INFORMASI KARYAWAN", 60, y);
      doc
        .moveTo(60, y + 18)
        .lineTo(doc.page.width - 60, y + 18)
        .lineWidth(1)
        .strokeColor(theme.line)
        .stroke();
      y += 35;

      const drawInfoRow = (label, value, xPos, rowY) => {
        doc.fillColor(theme.textSecondary).font("Helvetica").fontSize(9).text(label, xPos, rowY);
        doc
          .fillColor(theme.textMain)
          .font("Helvetica-Bold")
          .fontSize(11)
          .text(value || "-", xPos, rowY + 14);
      };

      // Row 1
      drawInfoRow("NAMA LENGKAP", normalized.nama?.toUpperCase() || "-", 60, y);
      drawInfoRow("ID KARYAWAN", normalized.no_induk || "-", 220, y);
      drawInfoRow("PERIODE BONUS", `${bulanText} ${tahunText}`, 380, y);

      y += 48;

      // Row 2
      drawInfoRow("PERUSAHAAN", companyDisplay, 60, y);
      drawInfoRow("JENIS", "BONUS KINERJA", 220, y);
      drawInfoRow("TANGGAL", new Date().toLocaleDateString("id-ID"), 380, y);

      y += 48;

      // Divider
      doc
        .moveTo(60, y)
        .lineTo(doc.page.width - 60, y)
        .lineWidth(1)
        .strokeColor(theme.line)
        .stroke();
      y += 25;

      // ======================
      // RINCIAN BONUS
      // ======================
      doc.fillColor(theme.primary).font("Helvetica-Bold").fontSize(14).text("RINCIAN BONUS", 60, y);
      doc
        .moveTo(60, y + 18)
        .lineTo(doc.page.width - 60, y + 18)
        .lineWidth(1)
        .strokeColor(theme.line)
        .stroke();
      y += 40;

      // Bonus Box
      const boxHeight = 100;
      doc.roundedRect(60, y, doc.page.width - 120, boxHeight, 10).fill(theme.primaryLight);
      doc
        .roundedRect(60, y, doc.page.width - 120, boxHeight, 10)
        .strokeColor(theme.border)
        .stroke();

      // Bonus amount
      doc.fillColor(theme.textMain).font("Helvetica").fontSize(12);
      doc.text("JUMLAH BONUS", 75, y + 20);

      const bonusAmount = rupiah(normalized.jumlah_bonus || 0);
      doc
        .fillColor(theme.success)
        .font("Helvetica-Bold")
        .fontSize(24)
        .text(`Rp ${bonusAmount}`, 75, y + 45);

      // Keterangan if exists
      if (normalized.keterangan) {
        doc
          .fillColor(theme.textSecondary)
          .font("Helvetica-Oblique")
          .fontSize(9)
          .text(`Keterangan: ${normalized.keterangan}`, 75, y + 80);
      }

      y += boxHeight + 30;

      // ======================
      // TERMS & CONDITIONS
      // ======================
      doc.fillColor(theme.textSecondary).font("Helvetica-Oblique").fontSize(8);
      doc.text("Catatan: Bonus ini merupakan tambahan penghasilan di luar gaji pokok dan " + "diberikan berdasarkan pencapaian kinerja. Bonus akan dipotong pajak sesuai ketentuan yang berlaku.", 60, y, {
        width: doc.page.width - 120,
        align: "left",
      });

      y += 40;

      // ======================
      // SIGNATURE SECTION
      // ======================
      // Garis tanda tangan
      const signY = y;
      doc.moveTo(60, signY).lineTo(200, signY).lineWidth(0.5).strokeColor(theme.border).stroke();
      doc.fillColor(theme.textSecondary).font("Helvetica").fontSize(8);
      doc.text("Penerima", 60, signY + 5);

      doc
        .moveTo(doc.page.width - 200, signY)
        .lineTo(doc.page.width - 60, signY)
        .lineWidth(0.5)
        .strokeColor(theme.border)
        .stroke();
      doc.text("Admin Payroll", doc.page.width - 190, signY + 5);

      // ======================
      // FOOTER
      // ======================
      const footerY = doc.page.height - 40;
      doc
        .fontSize(7)
        .fillColor("#94A3B8")
        .text(`ID Transaksi: BONUS/${companyDisplay}/${normalized.no_induk || "UNK"}/${timestamp}`, 50, footerY, { align: "center", width: doc.page.width - 100 })
        .text(`Dicetak pada: ${new Date().toLocaleString("id-ID")}`, 50, footerY + 12, { align: "center", width: doc.page.width - 100 });

      // ======================
      // WATERMARK (if status is dibatalkan)
      // ======================
      if (normalized.status === "dibatalkan") {
        doc.save();
        doc.rotate(-30, { origin: { x: doc.page.width / 2, y: doc.page.height / 2 } });
        doc.fillColor("#EF4444").opacity(0.15);
        doc.font("Helvetica-Bold").fontSize(60);
        doc.text("DIBATALKAN", doc.page.width / 2 - 100, doc.page.height / 2 - 30);
        doc.restore();
      }

      doc.end();

      stream.on("finish", () => {
        console.log(`✅ PDF Bonus generated: ${filePath}`);
        resolve(filePath);
      });

      stream.on("error", (err) => {
        console.error(`❌ Stream error:`, err);
        reject(err);
      });
    } catch (err) {
      console.error(`❌ generateBonusPDF error:`, err);
      reject(err);
    }
  });
}

export default generateBonusPDF;
