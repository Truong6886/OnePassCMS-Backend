import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { createClient } from "@supabase/supabase-js";
import multer from "multer";
import bcrypt from "bcryptjs";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import { PDFDocument, rgb } from "pdf-lib";
import fetch from "node-fetch";
import nodemailer from "nodemailer";
import { google } from "googleapis";

dotenv.config();

function translateServiceName(name) {
  const map = {
    "인증 센터": "Chứng thực",
    "결혼 이민": "Kết hôn",
    "출생신고 대행": "Khai sinh, khai tử",
    "출입국 행정 대행": "Xuất nhập cảnh",
    "신분증명 서류 대행": "Giấy tờ tuỳ thân",
    "입양 절차 대행": "Nhận nuôi",
    "비자 대행": "Thị thực",
    "법률 컨설팅": "Tư vấn pháp lý",
    "B2B 서비스": "Dịch vụ B2B",
    "기타": "Khác",
  };

  return map[name?.trim()] || name?.trim() || "";
}

const OAuth2 = google.auth.OAuth2;

async function sendEmailToAdmin(subject, message, adminEmails = []) {
  if (!adminEmails || adminEmails.length === 0) {
    console.log("⚠️ Không có admin để gửi email");
    return;
  }

  
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GOOGLE_EMAIL,
      pass: process.env.GOOGLE_APP_PASSWORD, 
    },
  });

  await transporter.sendMail({
    from: `"OnePass CMS" <${process.env.GOOGLE_EMAIL}>`,
    to: adminEmails.join(","), 
    subject,
    html: message,
  });

  console.log("📧 Email đã gửi đến admin:", adminEmails);
}


async function getAdminEmails() {
  const { data, error } = await supabase
    .from("User")
    .select("email")
    .eq("role", "admin");  
  if (error) {
    console.error("❌ Lỗi lấy email admin:", error);
    return [];
  }

  return data.map((u) => u.email).filter(Boolean);
}


// ==== Lấy thông tin Supabase ====
const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("⚠️  Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_KEY trong file .env hoặc Render environment!");
  process.exit(1);
}
// ==== Init Express & Supabase ====
const app = express();

// CORS configuration - QUAN TRỌNG
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://onepass-gamma.vercel.app",
    "http://localhost:8080",
    "https://onepasscms.vercel.app" 
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));


app.use(bodyParser.json());

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

// ==== Helper: handle supabase errors ====
const handleSupabaseError = (error) => {
  if (error) throw new Error(error.message || "Supabase error");
};

// ==== Start Server với Socket.io ====
const server = http.createServer(app);

// Socket.io configuration - SỬA LẠI
const io = new Server(server, {
  cors: {
    origin: [
      "https://onepass-gamma.vercel.app",
      "http://localhost:5173",
      "http://localhost:8080",
      "https://onepasscms.vercel.app"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Socket.io connection handler
io.on("connection", (socket) => {
  console.log("📡 Client connected:", socket.id);
  
  socket.on("disconnect", (reason) => {
    console.log("❌ Client disconnected:", socket.id, "Reason:", reason);
  });
  
  socket.on("error", (error) => {
    console.error("Socket error:", error);
  });
});
// ================= EMAIL LIST =================
app.get("/api/email", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("EmailList")
      .select("*")
      .order("id", { ascending: true });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
app.get("/api/dichvu", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("DichVu")
      .select("*")
      .order("DichVuID", { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error("❌ Lỗi lấy danh sách dịch vụ:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});
// POST /api/email
app.post("/api/email", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Thiếu email" });

    const { data, error } = await supabase
      .from("EmailList")
      .insert([{ Email: email, NgayTao: new Date().toISOString() }]) // 👈 sửa tên cột
      .select();

    if (error) throw error;
    res.json({ success: true, data: data[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/email/:id
app.put("/api/email/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;
    const { data, error } = await supabase
      .from("EmailList")
      .update({ Email: email }) // 👈 sửa tên cột
      .eq("id", id)
      .select();
    if (error) throw error;
    res.json({ success: true, data: data[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


app.delete("/api/email/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from("EmailList")
      .delete()
      .eq("id", id);
    if (error) throw error;
    res.json({ success: true, message: "Đã xóa email" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/b2b/register", upload.single("pdf"), async (req, res) => {
  try {
    const {
      TenDoanhNghiep,
      SoDKKD,
      Email,
      MatKhau,
      SoDienThoai,
      NguoiDaiDien,
      DichVu,
      DichVuKhac
    } = req.body;

    if (!TenDoanhNghiep || !SoDKKD || !Email || !MatKhau) {
      return res.status(400).json({
        success: false,
        message: "Thiếu dữ liệu bắt buộc"
      });
    }

    let PdfPath = null;

    // Upload PDF nếu có
    if (req.file) {
      const fileName = `b2b_${Date.now()}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("b2b_pdf")
        .upload(fileName, req.file.buffer, {
          contentType: "application/pdf",
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage
        .from("b2b_pdf")
        .getPublicUrl(fileName);

      PdfPath = publicUrl.publicUrl;
    }

    const hashedPassword = await bcrypt.hash(MatKhau, 10);

    const { data, error } = await supabase
      .from("B2B_PENDING")
      .insert([
        {
          TenDoanhNghiep,
          SoDKKD,
          Email,
          MatKhau: hashedPassword,
          SoDienThoai,
          NguoiDaiDien,
          DichVu,
          DichVuKhac,
          PdfPath
        }
      ])
      .select();

    if (error) throw error;

    res.json({ success: true, message: "Đăng ký thành công", data: data[0] });
  } catch (err) {
    console.error("❌ Lỗi đăng ký B2B:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});


app.get("/api/b2b/pending", async (req, res) => {
  try {
    // Lấy danh sách pending từ Supabase
    const { data: pendingList, error } = await supabase
      .from("B2B_PENDING")
      .select("*")
      .order("ID", { ascending: false });

    if (error) throw error;

   
    const mappedList = pendingList.map(item => ({
      ...item,
      DichVu: item.DichVu || "",      
      DichVuKhac: item.DichVuKhac || "",
    }));

    res.json({ success: true, data: mappedList });
  } catch (err) {
    console.error("Error fetching B2B_PENDING:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/b2b/approve/:id", async (req, res) => {
  try {
    const { id } = req.params;


    const { data: pendingData, error: pendingError } = await supabase
      .from("B2B_PENDING")
      .select("*")
      .eq("ID", id)
      .maybeSingle();

    if (pendingError) throw pendingError;
    if (!pendingData) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy doanh nghiệp"
      });
    }

    const dichVuNames = pendingData.DichVu || "";

    // 2️⃣ Chèn vào bảng APPROVED
    const { data: approvedData, error: insertError } = await supabase
      .from("B2B_APPROVED")
      .insert([
        {
          TenDoanhNghiep: pendingData.TenDoanhNghiep,
          SoDKKD: pendingData.SoDKKD,
          MatKhau: pendingData.MatKhau,
          Email: pendingData.Email,
          SoDienThoai: pendingData.SoDienThoai,
          NguoiDaiDien: pendingData.NguoiDaiDien,
          NganhNgheChinh: pendingData.NganhNgheChinh || "",
          DiaChi: pendingData.DiaChi || null,
          DichVu: dichVuNames,
          DichVuKhac: pendingData.DichVuKhac || "",
          PdfPath: pendingData.PdfPath || "",
          TongDoanhThu: pendingData.TongDoanhThu || 0,
          XepHang: pendingData.XepHang || "",
        }
      ])
      .select()
      .single();

    if (insertError) throw insertError;

    const approvedId = approvedData.ID;

    // 3️⃣ CHÈN DỊCH VỤ MẶC ĐỊNH VÀO BẢNG B2B_APPROVED_SERVICES
    if (dichVuNames) {
      await supabase.from("B2B_APPROVED_SERVICES").insert([
        {
          DoanhNghiepID: approvedId,
          TenDichVu: dichVuNames,
        }
      ]);
    }

    // 4️⃣ Xóa pending
    const { error: deleteError } = await supabase
      .from("B2B_PENDING")
      .delete()
      .eq("ID", id);

    if (deleteError) throw deleteError;

    return res.json({
      success: true,
      message: "Duyệt doanh nghiệp thành công"
    });

  } catch (err) {
    console.error("❌ Lỗi duyệt B2B:", err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

app.get("/api/b2b/approved-with-services", async (req, res) => {
  try {
    const { data: approvedList, error } = await supabase
      .from("B2B_APPROVED")
      .select(`
        *,
        Services:B2B_APPROVED_SERVICES (*)
      `)
      .order("ID", { ascending: false });

    if (error) throw error;

    res.json({ success: true, data: approvedList });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
// ===================== UPDATE SERVICE ROW =====================
app.put("/api/b2b/services/update/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      TenDichVu,
      NgayThucHien,
      NgayHoanThanh,
      DoanhThuTruocCK,
      MucChietKhau
    } = req.body;

    console.log("📌 Update service:", id, req.body);

    // Tính tiền chiết khấu & doanh thu sau chiết khấu
    const tienChietKhau = Math.round((DoanhThuTruocCK || 0) * (MucChietKhau || 0) / 100);
    const doanhThuSauCK = (DoanhThuTruocCK || 0) - tienChietKhau;

    const { data, error } = await supabase
      .from("B2B_APPROVED_SERVICES")
      .update({
        TenDichVu,
        NgayThucHien,
        NgayHoanThanh,
        DoanhThuTruocCK,
        MucChietKhau,
        TienChietKhau: tienChietKhau,
        DoanhThuSauCK: doanhThuSauCK,
        NgayCapNhat: new Date().toISOString(),
      })
      .eq("ID", id)
      .select()
      .single();

    if (error) throw error;

    return res.json({ success: true, data });
  } catch (err) {
    console.error("❌ Lỗi update service:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/b2b/approved", async (req, res) => {
  try {
    const { SoDKKD } = req.query;

    // Build query
    let query = supabase
      .from("B2B_APPROVED")
      .select("*")
      .order("ID", { ascending: false });

    if (SoDKKD) {
      query = query.eq("SoDKKD", String(SoDKKD).trim());
    }

    const { data: approvedList, error } = await query;
    if (error) throw error;

    // Nếu DichVu đã là tên dịch vụ, chỉ cần đảm bảo không null
    const mappedList = approvedList.map(item => ({
      ...item,
      DichVu: item.DichVu || "",
      DichVuKhac: item.DichVuKhac || "",
    }));

    res.json({ success: true, data: mappedList });
  } catch (err) {
    console.error("Error fetching B2B_APPROVED:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});




app.post("/api/b2b/login", async (req, res) => {
  try {
    const { SoDKKD, MatKhau } = req.body;

    if (!SoDKKD || !MatKhau) {
      return res.status(400).json({ success: false, message: "Thiếu Số ĐKKD hoặc Mật khẩu" });
    }

    // Tìm doanh nghiệp trong bảng đã duyệt
    const { data: userData, error } = await supabase
      .from("B2B_APPROVED")
      .select("*")
      .eq("SoDKKD", SoDKKD)
      .maybeSingle();
   
    if (error) throw error;
    if (!userData) {
      return res.status(404).json({ success: false, message: "Không tìm thấy doanh nghiệp" });
    }

  
    const match = await bcrypt.compare(MatKhau, userData.MatKhau);


    if (!match) {
      return res.status(401).json({ success: false, message: "Sai mật khẩu" });
    }


    res.json({ success: true, message: "Đăng nhập thành công", data: userData });
  } catch (err) {
    console.error("❌ Lỗi login B2B:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/pdf-signature/:mahoso", async (req, res) => {
  try {
    const { mahoso } = req.params;

    // Lấy PDF chưa ký
    const { data: pdfData, error: pdfError } = await supabase
      .from("PdfChuaKy")
      .select("MaHoSo, PdfUrl, NgayTao")
      .eq("MaHoSo", mahoso)
      .maybeSingle();
    if (pdfError) throw pdfError;

    // Lấy danh sách vùng ký
    const { data: areasData, error: areaError } = await supabase
      .from("signatureareas")
      .select("*")
      .eq("MaHoSo", mahoso);
    if (areaError) throw areaError;

    if (!pdfData) {
      return res.status(404).json({ success: false, message: "Không tìm thấy PDF cho hồ sơ này" });
    }

    res.json({
      success: true,
      mahoso,
      pdf: pdfData,
      signatureAreas: areasData || [],
    });
  } catch (err) {
    console.error("❌ Lỗi khi JOIN PDF và vùng ký:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});



// Make io accessible to routes - SỬA LẠI: Tạo biến toàn cục
app.set("socketio", io);
global.io = io; // ✅ THÊM DÒNG NÀY

// ==== ROUTES ====

// GET all Users
app.get("/api/User", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("User")
      .select("id, name, username, email, is_admin, is_accountant, is_director, avatar")
      .order("id", { ascending: true });
    handleSupabaseError(error);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
// DELETE YeuCau
app.delete("/api/yeucau/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log("🗑️ Xóa yêu cầu ID:", id);

    const { error } = await supabase
      .from("YeuCau")
      .delete()
      .eq("YeuCauID", id);

    if (error) throw error;

    console.log("✅ Đã xóa yêu cầu", id);
    res.json({ success: true, message: "Đã xóa yêu cầu" });
  } catch (err) {
    console.error("❌ Lỗi khi xóa yêu cầu:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ================== UPLOAD PDF & TẠO VÙNG KÝ ==================
app.post("/api/upload-pdf", upload.single("pdf"), async (req, res) => {
  try {
    const { MaHoSo } = req.body;
    if (!req.file || !MaHoSo)
      return res.status(400).json({ success: false, message: "Thiếu file hoặc MaHoSo" });

    // 1️⃣ Upload PDF gốc lên bucket 'pdfs_chuaky'
    const fileExt = req.file.originalname.split(".").pop();
    const fileName = `chuaky_${MaHoSo}_${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("pdfs_chuaky")
      .upload(fileName, req.file.buffer, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from("pdfs_chuaky")
      .getPublicUrl(fileName);
    const pdfUrl = publicUrlData.publicUrl;

    // 2️⃣ Lưu PDF gốc vào bảng PdfChuaKy
    await supabase
      .from("PdfChuaKy")
      .upsert(
        { MaHoSo, PdfUrl: pdfUrl, NgayTao: new Date().toISOString() },
        { onConflict: "MaHoSo" }
      );

    // 3️⃣ Tạo vùng ký mặc định (nếu chưa có)
    await supabase
      .from("signatureareas")
      .upsert({
        MaHoSo,
        pageIndex: 1,
        x: 195,
        y: 510,
        width: 90,
        height: 25,
        NgayTao: new Date().toISOString(),
      });

    // 4️⃣ Tạo link ký cho khách hàng
    const signLink = `https://onepasscms.vercel.app/kyhoso/${MaHoSo}`;

    res.json({
      success: true,
      message: "Upload PDF thành công, đã tạo vùng ký.",
      pdfUrl,
      signLink,
    });
  } catch (err) {
    console.error("❌ Lỗi upload PDF:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});


// ================== KHÁCH HÀNG KÝ PDF ==================
app.post("/api/sign-pdf", async (req, res) => {
  try {
    const { MaHoSo, signatureData } = req.body;
    if (!MaHoSo || !signatureData)
      return res.status(400).json({ success: false, message: "Thiếu MaHoSo hoặc chữ ký" });

    // 1️⃣ Lấy PDF gốc từ PdfChuaKy
    const { data: pdfData, error: pdfError } = await supabase
      .from("PdfChuaKy")
      .select("PdfUrl")
      .eq("MaHoSo", MaHoSo)
      .maybeSingle();
    if (pdfError || !pdfData) throw new Error("Không tìm thấy PDF gốc");

    // 2️⃣ Lấy vùng ký
    const { data: area } = await supabase
      .from("signatureareas")
      .select("*")
      .eq("MaHoSo", MaHoSo)
      .maybeSingle();
    if (!area) throw new Error("Không tìm thấy vùng ký!");

    // 3️⃣ Tải PDF và chèn chữ ký
    const pdfBytes = await fetch(pdfData.PdfUrl).then((r) => r.arrayBuffer());
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const page = pdfDoc.getPages()[area.pageIndex - 1];

    const imageBytes = Buffer.from(signatureData.split(",")[1], "base64");
    const pngImage = await pdfDoc.embedPng(imageBytes);
    page.drawImage(pngImage, {
      x: Number(area.x),
      y: Number(area.y),
      width: Number(area.width),
      height: Number(area.height),
    });

    // 4️⃣ Lưu vào bucket 'pdfs_daky'
    const signedBytes = await pdfDoc.save();
    const fileName = `daky_${MaHoSo}_${Date.now()}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("pdfs_daky")
      .upload(fileName, Buffer.from(signedBytes), {
        contentType: "application/pdf",
        upsert: true,
      });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from("pdfs_daky")
      .getPublicUrl(fileName);

    res.json({
      success: true,
      message: "Đã ký PDF và lưu vào pdfs_daky",
      signedUrl: publicUrlData.publicUrl,
    });
  } catch (err) {
    console.error("❌ Lỗi ký PDF:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});




// UPDATE User với avatar
app.put("/api/User/:id", upload.single("avatar"), async (req, res) => {
  try {
    const { id } = req.params;
    
    const { name, username, email, password } = req.body;
    
    console.log("Updating user:", { 
      id,
      name,
      username, 
      email, 
      hasPassword: !!password, 
      hasFile: !!req.file,
      bodyKeys: Object.keys(req.body)
    });

    const updateData = { 
      name,
      username, 
      email,
      updated_at: new Date().toISOString()
    };

    if (password && password.trim() !== "") {
      updateData.password_hash = await bcrypt.hash(password, 10);
      console.log("Password updated");
    }

    if (req.file) {
      console.log("Processing avatar file:", {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      });

      const fileExt = req.file.originalname.split(".").pop() || 'jpg';
      const fileName = `avatar_${id}_${Date.now()}.${fileExt}`;
      
      console.log("Uploading avatar to Supabase storage:", fileName);
      
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, req.file.buffer, { 
          contentType: req.file.mimetype,
          upsert: true 
        });

      if (uploadError) {
        console.error("Supabase storage upload error:", uploadError);
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);
        
      updateData.avatar = publicUrlData.publicUrl;
      console.log("Avatar uploaded successfully. URL:", publicUrlData.publicUrl);
    }

    console.log("Final update data:", updateData);

    const { data, error } = await supabase
      .from("User")
      .update(updateData)
      .eq("id", id)
      .select("id, username, email, avatar, is_admin, is_accountant, is_director, name");

    if (error) {
      console.error("Supabase database update error:", error);
      throw error;
    }

    console.log("User update successful:", data);
    res.json({ 
      success: true, 
      data,
      message: "Cập nhật thông tin thành công" 
    });

  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message,
      message: "Lỗi máy chủ khi cập nhật người dùng" 
    });
  }
});
// ======================== PDF CHƯA KÝ =========================

// ✅ Lưu hoặc cập nhật link PDF chưa ký
app.post("/api/pdf-chuaky", async (req, res) => {
  try {
    const { MaHoSo, PdfUrl } = req.body;
    if (!MaHoSo || !PdfUrl)
      return res.status(400).json({ success: false, message: "Thiếu MaHoSo hoặc PdfUrl" });

    const { data, error } = await supabase
      .from("PdfChuaKy")
      .upsert(
        { MaHoSo, PdfUrl, NgayTao: new Date().toISOString() },
        { onConflict: "MaHoSo" }
      )
      .select();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error("❌ Lỗi lưu PDF:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/pdf-chuaky/:mahoso", async (req, res) => {
  try {
    const { mahoso } = req.params;
    const { data, error } = await supabase
      .from("PdfChuaKy")
      .select("*")
      .eq("MaHoSo", mahoso)
      .maybeSingle();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error("❌ Lỗi lấy PDF:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});


// ✅ Lấy link PDF chưa ký theo mã hồ sơ
app.get("/api/signature-area/:mahoso", async (req, res) => {
  try {
    const { mahoso } = req.params;
    const { data, error } = await supabase
      .from("signatureareas")
      .select("*")
      .eq("MaHoSo", mahoso)
      .order("id");
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error("❌ Lỗi lấy vùng ký:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});// ✅ API: Lấy danh sách vùng ký cho 1 hồ sơ (ví dụ: 2 vùng ký)


app.put("/api/yeucau/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let updateData = req.body;

    console.log("📝 Cập nhật yêu cầu (trước khi xử lý):", { id, updateData });
    for (const key of Object.keys(updateData)) {
      if (updateData[key] === "") updateData[key] = null;
    }

    // Nếu có NguoiPhuTrachId thì ép kiểu về integer, hoặc null nếu không hợp lệ
    if (updateData.NguoiPhuTrachId !== null && updateData.NguoiPhuTrachId !== undefined) {
      const parsed = parseInt(updateData.NguoiPhuTrachId, 10);
      updateData.NguoiPhuTrachId = isNaN(parsed) ? null : parsed;
    }

    console.log("🧹 Dữ liệu sau khi chuẩn hóa:", updateData);

    // Cập nhật trước
    const { error: updateError } = await supabase
      .from("YeuCau")
      .update(updateData)
      .eq("YeuCauID", id);

    if (updateError) throw updateError;

    const { data, error } = await supabase
      .from("YeuCau")
      .select(`
        *,
        NguoiPhuTrach:User!YeuCau_NguoiPhuTrachId_fkey(
          id,
          name,
          username,
          email
        )
      `)
      .eq("YeuCauID", id)
      .single();

    if (error) throw error;

    console.log("✅ Đã cập nhật và lấy lại dữ liệu:", data);
    res.json({ success: true, data });
  } catch (err) {
    console.error("❌ Lỗi cập nhật yêu cầu:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});


// GET all YeuCau
app.get("/api/yeucau", async (req, res) => {
  try {
    const { userId, is_admin, page = 1, limit = 20 } = req.query;

    console.log("📥 Fetching YeuCau | userId:", userId, "| is_admin:", is_admin, "| page:", page, "| limit:", limit);


    const isAdmin = is_admin === true || is_admin === "true";

    
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const from = (pageNum - 1) * pageLimit;
    const to = from + pageLimit - 1;

    // ✅ Tạo query
    let query = supabase
      .from("YeuCau")
      .select(
        `
        *,
        NguoiPhuTrach:User!YeuCau_NguoiPhuTrachId_fkey(
          id,
          name,
          username,
          email
        )
      `,
        { count: "exact" }
      )
      .order("YeuCauID", { ascending: true }) 
      .range(from, to);

    // ✅ Nếu không phải admin → lọc theo người phụ trách
    if (!isAdmin && userId) {
      console.log("🔒 Lọc theo NguoiPhuTrachId =", userId);
      query = query.eq("NguoiPhuTrachId", parseInt(userId, 10));
    }

    const { data, count, error } = await query;
    if (error) throw error;

    const total = count ?? 0;
    const totalPages = Math.ceil(total / pageLimit);

    console.log(
      `✅ Trả về ${data?.length || 0} yêu cầu (page ${pageNum}/${totalPages}) - total: ${total}`
    );

    res.json({
      success: true,
      data,
      total,
      totalPages,
      currentPage: pageNum,
      perPage: pageLimit,
    });
  } catch (err) {
    console.error("❌ Lỗi khi lấy danh sách YeuCau:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});


app.post("/api/tuvan", async (req, res) => {
  try {
    const {
      TenDichVu,
      CoSoTuVan,
      TenHinhThuc,
      HoTen,
      Email,
      MaVung,
      SoDienThoai,
      TieuDe,
      NoiDung,
      ChonNgay,
      Gio
    } = req.body;

    console.log("Nhận yêu cầu tư vấn từ khách hàng:", req.body);

    if (!TenDichVu || !HoTen || !MaVung || !SoDienThoai) {
      return res.status(400).json({ success: false, message: "Thiếu dữ liệu bắt buộc" });
    }

    let insertData = {
      TenDichVu,
      CoSoTuVan: CoSoTuVan || null,
      TenHinhThuc,
      HoTen,
      MaVung,
      SoDienThoai,
      Email: Email || null,
      TieuDe: TieuDe || null,
      NoiDung: NoiDung || null,
      ChonNgay: null,
      Gio: null,
      TrangThai: "Tư vấn",
      NgayTao: new Date().toISOString()
    };

    switch (TenHinhThuc) {
      case "Trực tiếp":
        insertData.ChonNgay = ChonNgay || null;
        insertData.Gio = Gio || null;
        break;
      case "Email":
        if (!Email) return res.status(400).json({ success: false, message: "Email là bắt buộc" });
        break;
      case "Gọi điện":
      default:
        break;
    }

    // 👉 Thêm yêu cầu
    const { data: inserted, error } = await supabase
      .from("YeuCau")
      .insert([insertData])
      .select("YeuCauID")
      .single();

    if (error) throw error;

    // 👉 Lấy lại bản ghi đầy đủ
    const { data: fullRecord } = await supabase
      .from("YeuCau")
      .select(`
        *,
        NguoiPhuTrach:User!YeuCau_NguoiPhuTrachId_fkey(id, name, username, email)
      `)
      .eq("YeuCauID", inserted.YeuCauID)
      .single();

    console.log("✅ Yêu cầu tư vấn đã được tạo:", fullRecord);


    try {
      const adminEmails = await getAdminEmails();

      await sendEmailToAdmin(
        "OnePass - Có yêu cầu tư vấn mới",
            `
        <div style="
          max-width: 600px;
          margin: auto;
          padding: 20px;
          font-family: 'Segoe UI', Arial, sans-serif;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #ffffff;
        ">
          
          <h2 style="
            color: #2C4D9E;
            text-align: center;
            margin-bottom: 20px;
            border-bottom: 2px solid #2C4D9E;
            padding-bottom: 10px;
          ">
            Yêu cầu tư vấn mới
          </h2>

          <p style="font-size: 16px; color: #333;">
            Một khách hàng vừa gửi yêu cầu tư vấn. Vui lòng xem chi tiết bên dưới:
          </p>

          <div style="
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #2C4D9E;
            margin-top: 10px;
            font-size: 15px;
            color: #333;
          ">
            <p><b>Họ tên:</b> ${fullRecord.HoTen}</p>
            <p><b>Dịch vụ yêu cầu:</b> ${translateServiceName(fullRecord.TenDichVu)}</p>
            <p><b>Hình thức liên hệ:</b> ${fullRecord.TenHinhThuc}</p>
            <p><b>Số điện thoại:</b> ${fullRecord.MaVung}${fullRecord.SoDienThoai}</p>
            <p><b>Email khách:</b> ${fullRecord.Email || "Không có"}</p>
            <p><b>Tiêu đề:</b> ${fullRecord.TieuDe || "Không có"}</p>
            <p><b>Nội dung:</b> ${fullRecord.NoiDung || "Không có"}</p>
          </div>

          <div style="margin-top: 25px; text-align: center;">
            <a href="https://onepasscms.vercel.app"
              style="
                background: #2C4D9E;
                color: white;
                padding: 12px 24px;
                border-radius: 6px;
                text-decoration: none;
                font-size: 16px;
                font-weight: bold;
                display: inline-block;
              ">
              Mở CMS để xử lý
            </a>
          </div>

          <p style="margin-top: 20px; font-size: 13px; color: #6c757d; text-align: center;">
            Email được gửi tự động từ hệ thống OnePass CMS. Vui lòng không phản hồi lại email này.
          </p>
        </div>
      `
      ,
        adminEmails
      );

      console.log("Email đã gửi đến admin:", adminEmails);

    } catch (emailErr) {
      console.error("❌ Lỗi gửi email admin:", emailErr);
    }

    if (global.io) {
      global.io.emit("new_request", fullRecord);
    }

    return res.json({
      success: true,
      data: fullRecord,
      message: "Thêm yêu cầu thành công"
    });

  } catch (err) {
    console.error("❌ Lỗi khi thêm yêu cầu tư vấn:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});




app.post("/api/yeucau", async (req, res) => {
  try {
    let newRequestData = { ...req.body };

    console.log("[CMS] Admin đang thêm yêu cầu mới:", newRequestData);

    // ✅ Làm sạch dữ liệu
    for (const key of Object.keys(newRequestData)) {
      if (
        newRequestData[key] === "" ||
        newRequestData[key] === undefined ||
        (typeof newRequestData[key] === "string" && newRequestData[key].trim() === "")
      ) {
        newRequestData[key] = null;
      }
    }

    // ✅ Ép kiểu integer
    if (newRequestData.NguoiPhuTrachId !== null) {
      const parsed = parseInt(newRequestData.NguoiPhuTrachId, 10);
      newRequestData.NguoiPhuTrachId = isNaN(parsed) ? null : parsed;
    }

    // ✅ Ngày tạo hợp lệ
    if (newRequestData.NgayTao && isNaN(Date.parse(newRequestData.NgayTao))) {
      newRequestData.NgayTao = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("YeuCau")
      .insert([newRequestData])
      .select();

    if (error) throw error;

    const newRequest = data[0];
    console.log("✅ [CMS] Yêu cầu mới được tạo:", newRequest);

  

    res.json({
      success: true,
      data: newRequest,
      message: "Thêm yêu cầu thành công",
    });
  } catch (err) {
    console.error("❌ [CMS] Lỗi khi thêm yêu cầu:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi khi thêm yêu cầu: " + err.message,
    });
  }
});
// ====================== DOANH THU ======================
app.get("/api/doanhthu", async (req, res) => {
  try {
    const { userId } = req.query;

    // 🔍 Lấy thông tin user
    const { data: userData, error: userError } = await supabase
      .from("User")
      .select("id, username, is_admin, is_accountant, is_director")
      .eq("id", userId)
      .maybeSingle();

    if (userError) throw userError;
    if (!userData)
      return res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });

    const { is_admin, is_accountant, is_director } = userData;

    // ✅ Chỉ admin, kế toán, giám đốc mới có quyền truy cập
    if (!is_admin && !is_accountant && !is_director) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền truy cập doanh thu"
      });
    }

    console.log("✅ Quyền hợp lệ:", { is_admin, is_accountant, is_director });

    // 👉 Truy vấn dữ liệu doanh thu
    const { data, error } = await supabase
      .from("DoanhThu")
      .select("*")
      .order("Ngay", { ascending: false });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    console.error("❌ Lỗi khi lấy doanh thu:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, message: "Thiếu username hoặc password" });

  try {
    const { data, error } = await supabase
      .from("User")
      .select("*")
      .eq("username", username)
      .limit(1);
    handleSupabaseError(error);

    if (!data || data.length === 0)
      return res.status(401).json({ success: false, message: "Tài khoản không tồn tại" });

    const user = data[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ success: false, message: "Sai mật khẩu" });

    const userInfo = { 
      id: user.id, 
      name:user.name,
      username: user.username, 
      email: user.email, 
      is_admin: user.is_admin || false,
      is_accountant: user.is_accountant || false,
      is_director: user.is_director || false,
      avatar: user.avatar 
    };

    res.json({
      success: true,
      user: userInfo
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


app.post("/api/register", async (req, res) => {
  const { username, email, password, role = "user" } = req.body;
  if (!username || !email || !password) return res.status(400).json({ success: false, message: "Thiếu dữ liệu" });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from("User")
      .insert([{ 
        username, 
        email, 
        password_hash: hashedPassword, 
        name: username
      }])
      .select();
    handleSupabaseError(error);

    res.json({ success: true, user: data[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
app.get("/api/fix-mahoso", async (req, res) => {
  try {
    const { data: yeuCauList, error } = await supabase.from("YeuCau").select("*");
    if (error) throw error;

    // ✅ Bảng mã viết tắt tiếng Việt
    const serviceCodeMap = {
      "Chứng thực": "CT",
      "Kết hôn": "KH",
      "Khai sinh, khai tử": "KS",
      "Xuất nhập cảnh": "XNC",
      "Giấy tờ tuỳ thân": "GT",
      "Nhận nuôi": "NN",
      "Thị thực": "TT",
      "Tư vấn pháp lý": "TV",
      "Dịch vụ B2B": "B2B",
      "Khác": "KHAC",
    };

    // ✅ Dịch tiếng Hàn sang tiếng Việt
    const translateServiceName = (name) => {
      const map = {
        "인증 센터": "Chứng thực",
        "결혼 이민": "Kết hôn",
        "출생신고 대행": "Khai sinh, khai tử",
        "출입국 행정 대행": "Xuất nhập cảnh",
        "신분증명 서류 대행": "Giấy tờ tuỳ thân",
        "입양 절차 대행": "Nhận nuôi",
        "비자 대행": "Thị thực",
        "법률 컨설팅": "Tư vấn pháp lý",
        "B2B 서비스": "Dịch vụ B2B",
        "기타": "Khác",
      };
      return map[name?.trim()] || name?.trim() || "";
    };

    const updates = [];
    let skipped = 0;

    for (const record of yeuCauList) {
      let { MaHoSo, TenDichVu, YeuCauID } = record;

      if (!MaHoSo || !TenDichVu) {
        skipped++;
        continue;
      }

      const hasKorean = /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(MaHoSo);
      const viName = translateServiceName(TenDichVu);
      const prefix = serviceCodeMap[viName] || "HS";

      // 🔹 Nếu không có ký tự Hàn nhưng mã sai prefix → cũng fix luôn
      const missingPrefix = !MaHoSo.startsWith(prefix + "-");

      if (hasKorean || missingPrefix) {
        // Xóa ký tự Hàn
        let clean = MaHoSo.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, "").trim();

        // Nếu thiếu dấu “-” → thêm vào giữa prefix và số
        if (!clean.includes("-")) {
          // Tách phần số (nếu có)
          const numPart = clean.match(/\d+$/)?.[0] || "001";
          clean = `${prefix}-${numPart.padStart(3, "0")}`;
        } else if (!clean.startsWith(prefix)) {
          clean = `${prefix}-${clean.split("-").pop().padStart(3, "0")}`;
        }

        // Nếu vẫn thiếu prefix, thêm
        const fixed = clean.startsWith(prefix) ? clean : `${prefix}-${clean}`;

        // Tránh update trùng dữ liệu
        if (fixed !== MaHoSo) {
          await supabase.from("YeuCau").update({ MaHoSo: fixed }).eq("YeuCauID", YeuCauID);
          updates.push({ id: YeuCauID, old: MaHoSo, new: fixed });
        }
      } else {
        skipped++;
      }
    }

    res.json({
      success: true,
      updated: updates.length,
      skipped,
      details: updates,
    });
  } catch (err) {
    console.error("❌ fix-mahoso error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});


app.post("/api/save-email", async (req, res) => {
  try {
    const { email } = req.body;

    // Kiểm tra đầu vào
    if (!email || !email.includes("@")) {
      return res.status(400).json({ success: false, message: "Email không hợp lệ" });
    }

    console.log("📨 Nhận email đăng ký:", email);

    // Kiểm tra trùng lặp
    const { data: existing, error: checkError } = await supabase
      .from("EmailList")
      .select("id")
      .eq("Email", email)
      .maybeSingle();

    if (checkError) throw checkError;
    if (existing) {
      return res.status(200).json({ success: true, message: "Email đã tồn tại" });
    }

    // Thêm vào bảng EmailList
    const { data, error } = await supabase
      .from("EmailList")
      .insert([{ Email: email, NgayTao: new Date().toISOString() }])
      .select();

    if (error) throw error;

    console.log("✅ Email đã lưu:", data);
    res.json({ success: true, message: "Đăng ký email thành công", data });
  } catch (err) {
    console.error("❌ Lỗi lưu email:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});
app.get("/api/health", (req, res) => {
  res.json({ 
    success: true, 
    message: "Server is running",
    timestamp: new Date().toISOString()
  });
});

// ==== Start Server ====
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
  console.log(`Socket.io ready for connections`);
});
