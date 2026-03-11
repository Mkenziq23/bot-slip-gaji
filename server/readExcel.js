import XLSX from "xlsx";
import fs from "fs";

function normalizePhone(phone) {
  if (!phone) return "";

  phone = String(phone).replace(/\D/g, "");

  if (phone.startsWith("0")) {
    phone = "62" + phone.slice(1);
  }

  if (!phone.startsWith("62")) {
    phone = "62" + phone;
  }

  return phone;
}

export function readExcel() {
  if (!fs.existsSync("./data/karyawan.xlsx")) return [];

  const workbook = XLSX.readFile("./data/karyawan.xlsx");
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const dataRaw = XLSX.utils.sheet_to_json(sheet);

  const data = dataRaw.map((row) => {
    const obj = {};

    for (let key in row) {
      let newKey = key.toLowerCase().replace(/[&.]/g, "").replace(/\s+/g, "_").replace(/_+/g, "_").trim();

      if (newKey.includes("tunj") && newKey.includes("bpjs")) {
        newKey = "tunj_bpjs_pulsa";
      }

      let value = row[key];

      if (newKey === "awal_masuk" && value) {
        let date;

        if (typeof value === "number") {
          date = new Date((value - 25569) * 86400 * 1000);
        } else {
          date = new Date(value);
        }

        if (!isNaN(date)) {
          const day = String(date.getDate()).padStart(2, "0");
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const year = date.getFullYear();
          value = `${day}/${month}/${year}`;
        }
      }

      if (newKey === "nohp") {
        value = normalizePhone(value);
      }

      obj[newKey] = value ?? "";
    }

    return obj;
  });

  return data;
}
