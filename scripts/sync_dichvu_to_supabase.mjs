import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(rootDir, ".env") });

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in OnePassCMS-Backend/.env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const fallbackPath = path.join(rootDir, "data", "dichvu-fallback.json");

function normalize(row = {}) {
  const now = new Date().toISOString();
  return {
    DichVuID: Number(row.DichVuID || 0),
    LoaiDichVu: String(row.LoaiDichVu || "").trim(),
    TenDichVu: String(row.TenDichVu || "").trim(),
    MaDichVu: String(row.MaDichVu || "").trim(),
    GhiChu: String(row.GhiChu || "").trim(),
    NgayTao: row.NgayTao || now,
    NgayCapNhat: row.NgayCapNhat || now,
    NguoiCapNhat: String(row.NguoiCapNhat || "System").trim() || "System",
  };
}

async function main() {
  const raw = await fs.readFile(fallbackPath, "utf8");
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed)
    ? parsed.map(normalize).filter((r) => r.DichVuID > 0)
    : [];

  if (rows.length === 0) {
    console.log("No fallback rows to sync.");
    return;
  }

  const { error: upsertError } = await supabase
    .from("DichVu")
    .upsert(rows, { onConflict: "DichVuID" });

  if (upsertError) {
    console.error("Upsert error:", upsertError.message);
    process.exit(1);
  }

  const { data, error: countError } = await supabase
    .from("DichVu")
    .select("DichVuID", { count: "exact" });

  if (countError) {
    console.error("Count check error:", countError.message);
    process.exit(1);
  }

  console.log(`Synced ${rows.length} rows to Supabase DichVu.`);
  console.log(`Current Supabase DichVu rows: ${data?.length ?? 0}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
