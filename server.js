import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { createClient } from "@supabase/supabase-js";
import multer from "multer";
import bcrypt from "bcryptjs";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";

// ==== Load biến môi trường (.env) ====
dotenv.config();

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

// Make io accessible to routes - SỬA LẠI: Tạo biến toàn cục
app.set("socketio", io);
global.io = io; // ✅ THÊM DÒNG NÀY

// ==== ROUTES ====

// GET all Users
app.get("/api/User", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("User")
      .select("id, name, username, email, role, is_admin, avatar")
      .order("id", { ascending: true });
    handleSupabaseError(error);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// UPDATE YeuCau
app.put("/api/yeucau/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    console.log("Updating YeuCau:", { id, updateData });

    const { data, error } = await supabase
      .from("YeuCau")
      .update(updateData)
      .eq("YeuCauID", id)
      .select();

    if (error) {
      console.error("Supabase update error:", error);
      throw error;
    }

    console.log("Update successful:", data);
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error updating YeuCau:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// UPDATE User với avatar
app.put("/api/User/:id", upload.single("avatar"), async (req, res) => {
  try {
    const { id } = req.params;
    
    const { username, email, password } = req.body;
    
    console.log("Updating user:", { 
      id, 
      username, 
      email, 
      hasPassword: !!password, 
      hasFile: !!req.file,
      bodyKeys: Object.keys(req.body)
    });

    const updateData = { 
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
      .select("id, username, email, avatar, role, is_admin, name");

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

// GET all YeuCau
app.get("/api/yeucau", async (req, res) => {
  try {
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
      .order("YeuCauID", { ascending: true });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


app.post("/api/tuvan", async (req, res) => {
  try {
    const {
      TenDichVu,
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

    console.log("📨 Nhận yêu cầu tư vấn từ khách hàng:", req.body);

    if (!TenDichVu || !TenHinhThuc || !HoTen || !MaVung || !SoDienThoai) {
      return res.status(400).json({ success: false, message: "Thiếu dữ liệu bắt buộc" });
    }

    let insertData = {
      TenDichVu,
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

    // 👉 Lấy lại bản ghi đầy đủ ngay sau khi insert
    const { data: fullRecord } = await supabase
      .from("YeuCau")
      .select(`
        *,
        NguoiPhuTrach:User!YeuCau_NguoiPhuTrachId_fkey(id, name, username, email)
      `)
      .eq("YeuCauID", inserted.YeuCauID)
      .single();

    console.log("✅ Yêu cầu tư vấn đã được tạo:", fullRecord);
    
    // ✅ QUAN TRỌNG: Emit socket event - SỬA LẠI
    console.log("📡 Emitting new_request event to all connected clients");
    if (global.io) {
      global.io.emit("new_request", fullRecord);
      console.log("✅ Socket event emitted successfully");
    } else {
      console.error("❌ Socket.io not available");
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

    console.log("🧾 [CMS] Admin đang thêm yêu cầu mới:", newRequestData);

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

    // ❌ KHÔNG PHÁT SOCKET ADMIN NỮA
    // (chỉ khách hàng gửi form dùng socket "new_request")

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
      username: user.username, 
      email: user.email, 
      role: user.role || "user",
      is_admin: user.is_admin || false,
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
        role,
        name: username
      }])
      .select();
    handleSupabaseError(error);

    res.json({ success: true, user: data[0] });
  } catch (err) {
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
  console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
  console.log(`📡 Socket.io ready for connections`);
});
