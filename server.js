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
import emailjs from '@emailjs/nodejs';
import crypto from "crypto";
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

function tinhHangVaChietKhau(totalRevenue) {
  let hang = "New-bie";
  let chietKhau = 5;

  if (totalRevenue >= 300_000_000) {
    hang = "Diamond";
    chietKhau = 30;
  } else if (totalRevenue >= 250_000_000) {
    hang = "Platinum";
    chietKhau = 17;
  } else if (totalRevenue >= 200_000_000) {
    hang = "Gold";
    chietKhau = 15;
  } else if (totalRevenue >= 150_000_000) {
    hang = "Silver";
    chietKhau = 12;
  } else if (totalRevenue >= 100_000_000) {
    hang = "Bronze";
    chietKhau = 10;
  }

  return { hang, chietKhau };
}


``
emailjs.init({
  publicKey: process.env.EMAILJS_PUBLIC_KEY,
  privateKey: process.env.EMAILJS_PRIVATE_KEY,
});
async function sendEmailToCustomer(toEmail, subject, htmlContent) {
  if (!toEmail) return;

  try {
    const templateParams = {
      subject: subject,
      message: htmlContent,
      to_email: toEmail, 
      name: "OnePass Customer",
      reply_to: "support@onepass.com"
    };

    await emailjs.send(
      process.env.EMAILJS_SERVICE_ID,
      process.env.EMAILJS_TEMPLATE_ID,
      templateParams,
      {
        publicKey: process.env.EMAILJS_PUBLIC_KEY,
        privateKey: process.env.EMAILJS_PRIVATE_KEY,
      }
    );

    console.log("📧 Email xác nhận đã gửi đến khách hàng:", toEmail);
  } catch (err) {
    console.error("❌ Lỗi gửi email khách hàng:", err);
  }
}
async function sendEmailToAdmin(subject, htmlContent, adminEmails = []) {

  if (!adminEmails || adminEmails.length === 0) {
    console.log("⚠️ Không có admin để gửi email");
    return;
  }

  try {
    const sendPromises = adminEmails.map((email) => {
      const templateParams = {
        subject: subject,
        message: htmlContent,
        to_email: email,
        name: "OnePass System",
        reply_to: "no-reply@onepass.com"
      };

      return emailjs.send(
        process.env.EMAILJS_SERVICE_ID,
        process.env.EMAILJS_TEMPLATE_ID,
        templateParams,
        {
          publicKey: process.env.EMAILJS_PUBLIC_KEY,
          privateKey: process.env.EMAILJS_PRIVATE_KEY,
        }
      );
    });

    // CHỜ TẤT CẢ GỬI XONG
    await Promise.all(sendPromises);

    console.log("📧 EmailJS: Đã gửi thành công tới tất cả admin:", adminEmails);
  } catch (err) {
    console.error("❌ Lỗi EmailJS:", err);
  }
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

export { sendEmailToAdmin, getAdminEmails };


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
    "https://www.onepasskr.com", 
    "https://b2bonepass.vercel.app",
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


const server = http.createServer(app);


const io = new Server(server, {
  cors: {
    origin: [
      "https://onepass-gamma.vercel.app",
      "http://localhost:5173",
      "https://www.onepasskr.com",
      "https://b2bonepass.vercel.app",
      "http://localhost:8080",
      "https://onepasscms.vercel.app"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000, // Tăng timeout ping lên 60 giây (TỐT)
  pingInterval: 25000, // Gửi ping mỗi 25 giây (TỐT)
  allowUpgrades: true,
  maxHttpBufferSize: 1e8,
  connectTimeout: 45000 
});


global.io = io;


io.on("connection", (socket) => {
  console.log("📡 Client connected:", socket.id);
  
 
  socket.conn.on("heartbeat", () => {
  });

  socket.on("disconnect", (reason) => {
    console.log("❌ Client disconnected:", socket.id, "Reason:", reason);
    
  });

  socket.on("error", (error) => {
    console.error("Socket error:", error);
  });


  socket.emit("connected", { 
    message: "Successfully connected to server",
    socketId: socket.id,
    timestamp: new Date().toISOString()
  });
});



io.on("connection", (socket) => {
  console.log("📡 Client connected:", socket.id);
  
  // Bật heartbeat để giữ kết nối
  socket.conn.on("heartbeat", () => {
    console.log("Heartbeat received from:", socket.id);
  });

  socket.on("error", (error) => {
    console.error("Socket error:", error);
  });

  // Xác nhận kết nối thành công
  socket.emit("connected", { 
    message: "Successfully connected to server",
    socketId: socket.id,
    timestamp: new Date().toISOString()
  });
});

// Middleware để xử lý kết nối lại
io.engine.on("connection", (rawSocket) => {
  console.log("🔄 Raw connection established");
  
  rawSocket.on("close", (reason) => {
    console.log("🔌 Raw socket closed:", reason);
  });
});

// Health check cho Socket.io
app.get("/api/socket-health", (req, res) => {
  const connectedClients = io.engine.clientsCount;
  res.json({
    success: true,
    connectedClients,
    timestamp: new Date().toISOString()
  });
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
// LẤY DANH SÁCH TẤT CẢ SERVICES ĐƯỢC APPROVED
app.get("/api/b2b/approved-services", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("B2B_APPROVED_SERVICES")
      .select("*")
      .order("ID", { ascending: false });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    console.error("❌ Lỗi load approved services:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});
app.put("/api/b2b/approved/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { TenDoanhNghiep, SoDKKD, NguoiDaiDien, NganhNgheChinh } = req.body;

    const { data, error } = await supabase
      .from("B2B_APPROVED")
      .update({
        TenDoanhNghiep,
        SoDKKD,
        NguoiDaiDien,
        NganhNgheChinh,
        // Có thể thêm các trường khác nếu cần
      })
      .eq("ID", id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, message: "Cập nhật thành công", data });
  } catch (err) {
    console.error("❌ Lỗi update B2B Approved:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});


app.delete("/api/b2b/approved/:id", async (req, res) => {
  try {
    const { id } = req.params;

 
    const { error: deleteServicesError } = await supabase
      .from("B2B_APPROVED_SERVICES")
      .delete()
      .eq("DoanhNghiepID", id);
    
    if (deleteServicesError) {
        console.log("⚠️ Lỗi xóa dịch vụ con (có thể không có dịch vụ nào):", deleteServicesError.message);
        
    }

    const { error: deleteCompanyError } = await supabase
      .from("B2B_APPROVED")
      .delete()
      .eq("ID", id);

    if (deleteCompanyError) throw deleteCompanyError;

    res.json({ success: true, message: "Đã xóa doanh nghiệp và dịch vụ liên quan" });
  } catch (err) {
    console.error("❌ Lỗi xóa B2B Approved:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/b2b/reset-password", async (req, res) => {
  try {
    const { token, SoDKKD, newPassword } = req.body;

    if (!token || !SoDKKD || !newPassword) {
      return res.status(400).json({ success: false, message: "Thiếu thông tin." });
    }

    // Kiểm tra token hợp lệ và chưa hết hạn
    const { data: user, error } = await supabase
      .from("B2B_APPROVED")
      .select("ID, reset_token, reset_token_expiry")
      .eq("SoDKKD", SoDKKD)
      .eq("reset_token", token)
      .maybeSingle();

    if (error) throw error;

    if (!user) {
      return res.status(400).json({ success: false, message: "Link không hợp lệ hoặc sai thông tin." });
    }

    const now = new Date();
    const expiry = new Date(user.reset_token_expiry);

    if (now > expiry) {
      return res.status(400).json({ success: false, message: "Link đã hết hạn. Vui lòng yêu cầu lại." });
    }

    // Hash mật khẩu mới
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Cập nhật mật khẩu và xóa token
    const { error: updateError } = await supabase
      .from("B2B_APPROVED")
      .update({ 
        MatKhau: hashedPassword,
        reset_token: null,
        reset_token_expiry: null 
      })
      .eq("ID", user.ID);

    if (updateError) throw updateError;

    res.json({ success: true, message: "Đổi mật khẩu thành công. Vui lòng đăng nhập lại." });

  } catch (err) {
    console.error("❌ Reset Password Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});
app.post("/api/b2b/forgot-password", async (req, res) => {
  try {
    const { SoDKKD, Email } = req.body;

    // Kiểm tra user có tồn tại và khớp email không
    const { data: user, error } = await supabase
      .from("B2B_APPROVED")
      .select("ID, TenDoanhNghiep, Email, SoDKKD")
      .eq("SoDKKD", SoDKKD)
      .eq("Email", Email)
      .maybeSingle();

    if (error) throw error;
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "Thông tin không chính xác hoặc tài khoản chưa được duyệt." 
      });
    }

    // Tạo token ngẫu nhiên
    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 3600000); // Hết hạn sau 1 giờ

    // Lưu token vào DB
    const { error: updateError } = await supabase
      .from("B2B_APPROVED")
      .update({ 
        reset_token: token, 
        reset_token_expiry: expiry.toISOString() 
      })
      .eq("ID", user.ID);

    if (updateError) throw updateError;

    // Link reset
    const frontendUrl = req.headers.origin || "https://b2bonepass.vercel.app";
    const resetLink = `${frontendUrl}/reset-password?token=${token}&sodkkd=${SoDKKD}`;

    // Gửi email với giao diện bạn yêu cầu
    const emailContent = `
      <div style="
          max-width: 600px;
          margin: auto;
          padding: 20px;
          font-family: 'Segoe UI', Arial, sans-serif;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #ffffff;
        ">
          <div style="text-align: center; border-bottom: 2px solid #2C4D9E; padding-bottom: 15px; margin-bottom: 20px;">
            <h2 style="color: #2C4D9E; margin: 0; font-size: 22px;">
              Yêu cầu đặt lại mật khẩu
            </h2>
            <h3 style="color: #666; margin: 5px 0 0 0; font-size: 16px; font-weight: normal; font-style: italic;">
              Password Reset Request
            </h3>
          </div>

          <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
            Xin chào <strong>${user.TenDoanhNghiep}</strong>,<br>
            <span style="font-size: 14px; color: #666; font-style: italic;">Hello <strong>${user.TenDoanhNghiep}</strong>,</span>
          </p>
          
          <p style="font-size: 15px; color: #333; margin-bottom: 2px;">
            Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản B2B (Số ĐKKD: <strong>${user.SoDKKD}</strong>).
          </p>
          <p style="font-size: 14px; color: #666; font-style: italic; margin-top: 0; margin-bottom: 20px;">
            We received a request to reset the password for B2B account (Business Reg. No.: <strong>${user.SoDKKD}</strong>).
          </p>

          <div style="
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #2C4D9E;
            margin-top: 15px;
            font-size: 15px;
            color: #333;
          ">
             <p style="margin: 0;">Vui lòng nhấn vào nút bên dưới để đặt mật khẩu mới (Link có hiệu lực trong 1 giờ):</p>
             <p style="margin-top: 5px; font-style: italic; color: #666; font-size: 13px;">
               Please click the button below to set a new password (Link valid for 1 hour):
             </p>
          </div>

          <div style="margin-top: 30px; text-align: center;">
            <a href="${resetLink}" 
               style="
                 background-color: #2C4D9E; 
                 color: white; 
                 padding: 12px 30px; 
                 text-decoration: none; 
                 border-radius: 5px; 
                 display: inline-block;
                 text-align: center;
               ">
               <span style="display: block; font-size: 16px; font-weight: bold; line-height: 120%;">Đặt lại mật khẩu</span>
               <span style="display: block; font-size: 13px; font-weight: normal; font-style: italic; margin-top: 2px; opacity: 0.9;">Reset Password</span>
            </a>
          </div>

          <p style="margin-top: 30px; font-size: 14px; color: #333; text-align: center;">
            Trân trọng,<br>
            <span style="font-size: 13px; color: #666; font-style: italic;">Best regards,</span><br><br>
            <strong>Đội ngũ OnePass</strong><br>
            <span style="font-size: 13px; color: #666; font-style: italic;">OnePass Team</span>
          </p>
        </div>
    `;

    await sendEmailToCustomer(user.Email, "OnePass B2B - Đặt lại mật khẩu | Password Reset Request", emailContent);

    res.json({ success: true, message: "Vui lòng kiểm tra email để đặt lại mật khẩu." });

  } catch (err) {
    console.error("❌ Forgot Password Error:", err);
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
      MaVung,
      Website,
      SoDienThoai,
      NguoiDaiDien,
      DichVu,
      DichVuKhac,
      NganhNgheChinh 
    } = req.body;

    // 1. Chuẩn hóa dữ liệu đầu vào (Xóa khoảng trắng thừa)
    const cleanSoDKKD = SoDKKD ? SoDKKD.toString().trim() : "";
    const cleanEmail = Email ? Email.toString().trim() : "";

    if (!cleanSoDKKD) {
      return res.status(400).json({ success: false, message: "Số ĐKKD không được để trống" });
    }


    const { data: existingApproved, error: errApproved } = await supabase
      .from("B2B_APPROVED")
      .select("ID, TenDoanhNghiep")
      .eq("SoDKKD", cleanSoDKKD)
      .maybeSingle();

    if (errApproved) throw errApproved;
    
    if (existingApproved) {
      return res.status(400).json({
        success: false,
        message: `Số ĐKKD ${cleanSoDKKD} đã tồn tại trong hệ thống (Doanh nghiệp: ${existingApproved.TenDoanhNghiep}).  vui lòng trở về trang đăng nhập.`
      });
    }

    // 2.2 Kiểm tra trong bảng CHỜ DUYỆT (B2B_PENDING)
    // Nếu tìm thấy => Đang chờ admin duyệt => Chặn đăng ký để tránh spam
    const { data: existingPending, error: errPending } = await supabase
      .from("B2B_PENDING")
      .select("ID")
      .eq("SoDKKD", cleanSoDKKD)
      .maybeSingle();

    if (errPending) throw errPending;

    if (existingPending) {
      return res.status(400).json({
        success: false,
        message: `Số ĐKKD ${cleanSoDKKD} đang chờ phê duyệt. Vui lòng chờ admin phản hồi.`
      });
    }



    let PdfPath = null;
    if (req.file) {
      const fileExt = req.file.originalname.split(".").pop();
      const fileName = `b2b_${cleanSoDKKD}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("b2b_pdf") 
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true,
        });
        
      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage
          .from("b2b_pdf")
          .getPublicUrl(fileName);
        PdfPath = publicUrlData.publicUrl;
      }
    }

   
    const { data, error } = await supabase
      .from("B2B_PENDING")
      .insert([
        {
          TenDoanhNghiep,
          SoDKKD: cleanSoDKKD,
          Email: cleanEmail,
          MatKhau: MatKhau,
          MaVung: MaVung,
          SoDienThoai,
          Website: Website || null,
          NguoiDaiDien,
          DichVu,
          DichVuKhac,
          NganhNgheChinh,
          PdfPath
        }
      ])
      .select();

    if (error) throw error;
    const newB2B = data[0]; 

    if (global.io) {
      const notificationPayload = {
        YeuCauID: newB2B.ID,               
        HoTen: `${TenDoanhNghiep}`,  
        TenDichVu: "Đăng ký Đối tác B2B",
        TenHinhThuc: "Form đăng ký",
        SoDienThoai: SoDienThoai,
        Email: cleanEmail,
        NgayTao: new Date().toISOString(),
        LoaiThongBao: "B2B_REGISTER"       
      };
      global.io.emit("new_request", notificationPayload);
    }
    try {
    const emailContent = `
        <div style="
          max-width: 600px;
          margin: auto;
          padding: 20px;
          font-family: 'Segoe UI', Arial, sans-serif;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #ffffff;
        ">
          <div style="text-align: center; border-bottom: 2px solid #2C4D9E; padding-bottom: 15px; margin-bottom: 20px;">
            <h2 style="color: #2C4D9E; margin: 0; font-size: 22px;">
              Đăng ký tài khoản B2B thành công
            </h2>
            <h3 style="color: #666; margin: 5px 0 0 0; font-size: 16px; font-weight: normal; font-style: italic;">
              Successful B2B Account Registration
            </h3>
          </div>

          <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
            Xin chào <strong>${TenDoanhNghiep}</strong>,<br>
            <span style="font-size: 14px; color: #666; font-style: italic;">Hello <strong>${TenDoanhNghiep}</strong>,</span>
          </p>
          
          <p style="font-size: 15px; color: #333; margin-bottom: 2px;">
            Cảm ơn Quý doanh nghiệp đã đăng ký trở thành đối tác B2B của OnePass. Hồ sơ của Quý khách hiện đang ở trạng thái <strong>Chờ phê duyệt</strong>.
          </p>
          <p style="font-size: 14px; color: #666; font-style: italic; margin-top: 0; margin-bottom: 20px;">
            Thank you for registering to become a OnePass B2B partner. Your profile is currently <strong>Pending Approval</strong>.
          </p>

          <div style="
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #2C4D9E;
            margin-top: 15px;
            font-size: 15px;
            color: #333;
          ">
            <div style="margin-bottom: 10px;">
              <b>Số ĐKKD:</b> ${SoDKKD}<br>
              <span style="font-size: 13px; color: #666; font-style: italic;">Business Reg. No: ${SoDKKD}</span>
            </div>
            
            <div style="margin-bottom: 10px;">
              <b>Người đại diện:</b> ${NguoiDaiDien}<br>
              <span style="font-size: 13px; color: #666; font-style: italic;">Representative: ${NguoiDaiDien}</span>
            </div>

            <div style="margin-bottom: 10px;">
              <b>Email đăng ký:</b> ${Email}<br>
              <span style="font-size: 13px; color: #666; font-style: italic;">Registered Email: ${Email}</span>
            </div>

            <div>
              <b>SĐT:</b> ${SoDienThoai || "N/A"}<br>
              <span style="font-size: 13px; color: #666; font-style: italic;">Phone: ${SoDienThoai || "N/A"}</span>
            </div>
          </div>

          <div style="margin-top: 25px;">
            <p style="font-size: 15px; color: #333; margin-bottom: 2px;">
              Bộ phận quản lý sẽ kiểm tra và kích hoạt tài khoản trong thời gian sớm nhất. Quý khách sẽ nhận được email thông báo khi tài khoản được kích hoạt.
            </p>
            <p style="font-size: 14px; color: #666; font-style: italic; margin-top: 0;">
              The management team will review and activate your account as soon as possible. You will receive a notification email once the account is activated.
            </p>
          </div>

          <p style="margin-top: 30px; font-size: 14px; color: #333; text-align: center;">
            Trân trọng,<br>
            <span style="font-size: 13px; color: #666; font-style: italic;">Best regards,</span><br><br>
            <strong>Đội ngũ OnePass</strong><br>
            <span style="font-size: 13px; color: #666; font-style: italic;">OnePass Team</span>
          </p>
        </div>
      `;
      await sendEmailToCustomer(Email, "OnePass - Xác nhận đăng ký B2B | B2B Registration Confirmation", emailContent);
    } catch (mailError) {
      console.error("⚠️ Lỗi gửi mail khách:", mailError);
    }

    
   try {
      const adminEmails = await getAdminEmails();
      await sendEmailToAdmin(
        "OnePass - Có doanh nghiệp B2B mới đăng ký",
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
            Doanh nghiệp mới đăng ký đối tác
          </h2>

          <p style="font-size: 16px; color: #333;">
            Một doanh nghiệp vừa gửi hồ sơ đăng ký đối tác. Vui lòng xem chi tiết bên dưới:
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
            <p><b>Tên doanh nghiệp:</b> ${TenDoanhNghiep}</p>
            <p><b>Số ĐKKD:</b> ${SoDKKD}</p>
            <p><b>Người đại diện:</b> ${NguoiDaiDien}</p>
            <p><b>Email:</b> ${Email}</p>
            <p><b>Số điện thoại:</b> ${SoDienThoai || ""}</p>
            <p><b>Ngành nghề:</b> ${NganhNgheChinh || ""}</p>
          </div>

          <div style="margin-top: 25px; text-align: center;">
            <a href="https://onepasscms.vercel.app/B2B"
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
              Mở CMS để duyệt
            </a>
          </div>

          <p style="margin-top: 20px; font-size: 13px; color: #6c757d; text-align: center;">
            Email được gửi tự động từ hệ thống OnePass CMS.
          </p>
        </div>
        `,
        adminEmails
      );
    } catch (adminMailErr) {
      console.error("⚠️ Lỗi gửi mail admin:", adminMailErr);
    }

    res.json({ success: true, message: "Đăng ký thành công", data: newB2B });

  } catch (err) {
    console.error("❌ Lỗi API đăng ký B2B:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put("/api/b2b/pending/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      TenDoanhNghiep, 
      SoDKKD, 
      NguoiDaiDien, 
      MaVung,
      DichVu, 
      DichVuKhac,
      PdfPath,
      Website
    } = req.body;

    // Validate required fields
    if (!TenDoanhNghiep || !SoDKKD) {
      return res.status(400).json({
        success: false,
        message: "Tên doanh nghiệp và Số ĐKKD không được để trống"
      });
    }

    // Kiểm tra xem doanh nghiệp có tồn tại không
    const { data: existingData, error: checkError } = await supabase
      .from("B2B_PENDING")
      .select("ID")
      .eq("ID", id)
      .single();

    if (checkError || !existingData) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy doanh nghiệp cần cập nhật"
      });
    }

    // Chỉ cập nhật thông tin, không xử lý reject ở đây
    const { data, error } = await supabase
      .from("B2B_PENDING")
      .update({
        TenDoanhNghiep: TenDoanhNghiep.trim(),
        SoDKKD: SoDKKD.trim(),
        NguoiDaiDien: NguoiDaiDien?.trim() || "",
        DichVu: DichVu?.trim() || "",
        MaVung: MaVung || "",
        Website: Website || null,
        DichVuKhac: DichVuKhac?.trim() || "",
        PdfPath: PdfPath || null
      })
      .eq("ID", id)
      .select()
      .single();

    if (error) throw error;

    res.json({ 
      success: true, 
      message: "Cập nhật thông tin thành công", 
      data 
    });

  } catch (err) {
    console.error("Lỗi update B2B Pending:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
});
// [SỬA] Tạo User (Email có thể null)
app.post("/api/User", async (req, res) => {
  try {
    const { username, password, email, name, role } = req.body;
    
    // Chỉ kiểm tra username và password, bỏ kiểm tra email
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Thiếu tên đăng nhập hoặc mật khẩu" });
    }

    // Xử lý email: Nếu rỗng thì gán là null
    const emailValue = email && email.trim() !== "" ? email.trim() : null;

    // Chỉ kiểm tra trùng email nếu email có giá trị (không phải null)
    if (emailValue) {
      const { data: existingUser } = await supabase
        .from("User")
        .select("id")
        .eq("email", emailValue)
        .maybeSingle();

      if (existingUser) {
        return res.status(400).json({ success: false, message: "Email này đã được sử dụng bởi tài khoản khác!" });
      }
    }

    // Hash mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);
    const is_admin = role === "admin";
    const is_director = role === "director";
    const is_accountant = role === "accountant";
    const is_staff = role === "staff";

    const { data, error } = await supabase
      .from("User")
      .insert([{ 
        username, 
        email: emailValue, 
        password_hash: hashedPassword, 
        name: name || username,
        is_admin,
        is_director,
        is_accountant,
        is_staff
      }])
      .select();

    if (error) throw error;

    res.json({ success: true, message: "Tạo nhân viên thành công", data: data[0] });
  } catch (err) {
    console.error("❌ Lỗi tạo User:", err);
    if (err.message && err.message.includes("User_email_key")) {
       return res.status(400).json({ success: false, message: "Email đã tồn tại." });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete("/api/User/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // Xóa user
    const { error } = await supabase
      .from("User")
      .delete()
      .eq("id", id);

    if (error) throw error;

    res.json({ success: true, message: "Đã xóa nhân viên" });
  } catch (err) {
    console.error("❌ Lỗi xóa User:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put("/api/User/:id", upload.single("avatar"), async (req, res) => {
  try {
    const { id } = req.params;
    let { name, username, email, password, role } = req.body;

    
    const emailValue = email && email.trim() !== "" ? email.trim() : null;

    if (emailValue) {
      const { data: existingEmail } = await supabase
        .from("User")
        .select("id")
        .eq("email", emailValue)
        .neq("id", id) 
        .maybeSingle();

      if (existingEmail) {
        return res.status(400).json({ success: false, message: "Email này đã thuộc về người khác!" });
      }
    }

    const updateData = {
      name,
      username,
      email: emailValue, // Lưu giá trị đã xử lý (null hoặc string)
      updated_at: new Date().toISOString()
    };

    if (role) {
      updateData.is_admin = role === "admin";
      updateData.is_director = role === "director";
      updateData.is_accountant = role === "accountant";
      updateData.is_staff = role === "staff";
    }

    if (password && password.trim() !== "") {
      updateData.password_hash = await bcrypt.hash(password, 10);
    }

    // // Xử lý upload avatar (Giữ nguyên)
    // if (req.file) {
    //   const fileExt = req.file.originalname.split(".").pop() || 'jpg';
    //   const fileName = `avatar_${id}_${Date.now()}.${fileExt}`;

    //   const { error: uploadError } = await supabase.storage
    //     .from("avatars")
    //     .upload(fileName, req.file.buffer, {
    //       contentType: req.file.mimetype,
    //       upsert: true
    //     });

    //   if (!uploadError) {
    //     const { data: publicUrlData } = supabase.storage
    //       .from("avatars")
    //       .getPublicUrl(fileName);
    //     updateData.avatar = publicUrlData.publicUrl;
    //   }
    // }

    const { data, error } = await supabase
      .from("User")
      .update(updateData)
      .eq("id", id)
      .select();

    if (error) throw error;

    res.json({ success: true, data: data[0], message: "Cập nhật thành công" });
  } catch (err) {
    console.error("Error updating user:", err);
    if (err.message && err.message.includes("User_email_key")) {
       return res.status(400).json({ success: false, message: "Email đã tồn tại." });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});
app.get("/api/b2b/reject", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: rejectedList, count, error } = await supabase
      .from("B2B_REJECTED")
      .select("*", { count: "exact" })
      .order("NgayTao", { ascending: false })
      .range(from, to);

    if (error) throw error;

    res.json({ 
      success: true, 
      data: rejectedList || [],
      total: count,
      page,
      totalPages: Math.ceil(count / limit)
    });
  } catch (err) {
    console.error("Error fetching B2B_REJECTED:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});
app.post("/api/b2b/pending/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập lý do từ chối"
      });
    }

    // 1. Lấy thông tin doanh nghiệp đang chờ (để lấy Email)
    const { data: pendingData, error: fetchError } = await supabase
      .from("B2B_PENDING")
      .select("*")
      .eq("ID", id)
      .single();

    if (fetchError || !pendingData) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy doanh nghiệp cần từ chối"
      });
    }

    // 2. Chuyển sang bảng B2B_REJECTED
    const { data: rejectedData, error: insertError } = await supabase
      .from("B2B_REJECTED")
      .insert([{
        TenDoanhNghiep: pendingData.TenDoanhNghiep,
        SoDKKD: pendingData.SoDKKD,
        Email: pendingData.Email,
        MaVung: pendingData.MaVung,
        Website: pendingData.Website,
        SoDienThoai: pendingData.SoDienThoai,
        NguoiDaiDien: pendingData.NguoiDaiDien,
        DichVu: pendingData.DichVu || "",
        DichVuKhac: pendingData.DichVuKhac || "",
        NganhNgheChinh: pendingData.NganhNgheChinh || "",
        PdfPath: pendingData.PdfPath,
        LyDoTuChoi: reason.trim(),
        NgayTao: new Date().toISOString(),
        Status: "Đã từ chối"
      }])
      .select()
      .single();

    if (insertError) throw insertError;

    // 3. Xóa khỏi B2B_PENDING
    const { error: deleteError } = await supabase
      .from("B2B_PENDING")
      .delete()
      .eq("ID", id);

    if (deleteError) throw deleteError;

   
    try {
   const emailContent = `
        <div style="
          max-width: 600px;
          margin: auto;
          padding: 20px;
          font-family: 'Segoe UI', Arial, sans-serif;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #ffffff;
        ">
          <div style="text-align: center; border-bottom: 2px solid #ef4444; padding-bottom: 15px; margin-bottom: 20px;">
            <h2 style="color: #ef4444; margin: 0; font-size: 22px;">
              Thông báo từ chối đăng ký B2B
            </h2>
            <h3 style="color: #666; margin: 5px 0 0 0; font-size: 16px; font-weight: normal; font-style: italic;">
              B2B Registration Rejected
            </h3>
          </div>

          <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
            Xin chào <strong>${pendingData.TenDoanhNghiep}</strong>,<br>
            <span style="font-size: 14px; color: #666; font-style: italic;">Hello <strong>${pendingData.TenDoanhNghiep}</strong>,</span>
          </p>
          
          <p style="font-size: 15px; color: #333; margin-bottom: 2px;">
            Chúng tôi rất tiếc phải thông báo rằng hồ sơ đăng ký đối tác của Quý doanh nghiệp đã bị từ chối với lý do: <strong>${reason.trim()}</strong>.
          </p>
          <p style="font-size: 14px; color: #666; font-style: italic; margin-top: 0; margin-bottom: 20px;">
            We regret to inform you that your partner registration application has been rejected due to: <strong>${reason.trim()}</strong>.
          </p>

          <div style="margin-top: 25px;">
            <p style="font-size: 15px; color: #333; margin-bottom: 2px;">
              Quý khách có thể cập nhật lại thông tin và gửi lại yêu cầu đăng ký mới, hoặc liên hệ với bộ phận hỗ trợ để biết thêm chi tiết.
            </p>
            <p style="font-size: 14px; color: #666; font-style: italic; margin-top: 0;">
              You may update your information and submit a new registration request, or contact support for more details.
            </p>
          </div>

          <p style="margin-top: 30px; font-size: 14px; color: #333; text-align: center;">
            Trân trọng,<br>
            <span style="font-size: 13px; color: #666; font-style: italic;">Best regards,</span><br><br>
            <strong>Đội ngũ OnePass</strong><br>
            <span style="font-size: 13px; color: #666; font-style: italic;">OnePass Team</span>
          </p>
        </div>
      `;
      // Gọi hàm gửi mail có sẵn trong code của bạn
      await sendEmailToCustomer(
        pendingData.Email, 
        "OnePass - Thông báo từ chối đăng ký đối tác | B2B Registration Rejected", 
        emailContent
      );
      
    } catch (mailError) {
      console.error("⚠️ Lỗi gửi mail từ chối cho khách:", mailError);
      
    }

    return res.json({
      success: true,
      message: "Đã từ chối doanh nghiệp thành công",
      data: rejectedData
    });

  } catch (err) {
    console.error("Lỗi từ chối B2B:", err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});
app.get("/api/b2b/pending", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Lấy data và count
    const { data: pendingList, count, error } = await supabase
      .from("B2B_PENDING")
      .select("*", { count: "exact" })
      .order("ID", { ascending: false })
      .range(from, to);

    if (error) throw error;

    // --- SỬA ĐOẠN NÀY ---
    const mappedList = pendingList.map(item => ({
      ...item,
      DichVu: item.DichVu || "",
      DichVuKhac: item.DichVuKhac || "",
      PdfPath: item.PdfPath || item.pdfpath || null 
    }));
    // --------------------

    res.json({ 
      success: true, 
      data: mappedList, 
      total: count, 
      page, 
      totalPages: Math.ceil(count / limit) 
    });
  } catch (err) {
    console.error("Error fetching B2B_PENDING:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/b2b/approve/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Lấy thông tin từ Pending
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

  
    const hashedPassword = await bcrypt.hash(pendingData.MatKhau, 10);

    // 2. Chèn vào bảng APPROVED với mật khẩu ĐÃ MÃ HÓA
    const { data: approvedData, error: insertError } = await supabase
      .from("B2B_APPROVED")
      .insert([
        {
          TenDoanhNghiep: pendingData.TenDoanhNghiep,
          SoDKKD: pendingData.SoDKKD,
          MatKhau: hashedPassword, // Lưu mật khẩu đã mã hóa để login
          Email: pendingData.Email,
          MaVung: pendingData.MaVung,
          Website: pendingData.Website,
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

    // 3. Chèn dịch vụ vào bảng con B2B_APPROVED_SERVICES
    if (dichVuNames) {
      const servicesArray = dichVuNames.split(",").map(dv => dv.trim());
      
      const servicesToInsert = servicesArray.map(serviceName => ({
        DoanhNghiepID: approvedId,
        TenDichVu: serviceName,
        NgayTao: new Date().toISOString(),
        NgayCapNhat: new Date().toISOString()
      }));

      const { error: servicesError } = await supabase
        .from("B2B_APPROVED_SERVICES")
        .insert(servicesToInsert);

      if (servicesError) throw servicesError;
    }

   
    try {
      const emailContent = `
        <div style="
          max-width: 600px;
          margin: auto;
          padding: 20px;
          font-family: 'Segoe UI', Arial, sans-serif;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #ffffff;
        ">
          <div style="text-align: center; border-bottom: 2px solid #22c55e; padding-bottom: 15px; margin-bottom: 20px;">
            <h2 style="color: #22c55e; margin: 0; font-size: 22px;">
              Hồ sơ đăng ký đối tác đã được phê duyệt
            </h2>
            <h3 style="color: #666; margin: 5px 0 0 0; font-size: 16px; font-weight: normal; font-style: italic;">
              B2B Partner Registration Approved
            </h3>
          </div>

          <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
            Xin chào <strong>${pendingData.TenDoanhNghiep}</strong>,<br>
            <span style="font-size: 14px; color: #666; font-style: italic;">Hello <strong>${pendingData.TenDoanhNghiep}</strong>,</span>
          </p>
          
          <p style="font-size: 15px; color: #333; margin-bottom: 2px;">
            Chúc mừng! Hồ sơ đăng ký đối tác của Quý doanh nghiệp đã được phê duyệt thành công.
          </p>

          <div style="
            background: #f0fdf4;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #22c55e;
            margin-top: 15px;
            font-size: 15px;
            color: #333;
          ">
            <p style="margin: 0 0 10px 0; font-weight: bold; font-size: 16px;">Thông tin đăng nhập hệ thống:</p>
            
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 5px 0; width: 140px; color: #555;">Tên đăng nhập:</td>
                <td style="padding: 5px 0; font-weight: bold; color: #000;">${pendingData.SoDKKD}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; color: #555;">Mật khẩu:</td>
                <td style="padding: 5px 0; font-weight: bold; color: #d32f2f;">${pendingData.MatKhau}</td>
              </tr>
            </table>
          </div>

          <div style="margin-top: 30px; text-align: center;">
            <a href="https://b2bonepass.vercel.app" 
               style="
                 background-color: #2C4D9E; 
                 color: white; 
                 padding: 12px 25px; 
                 text-decoration: none; 
                 border-radius: 5px; 
                 font-weight: bold;
                 font-size: 16px;
               ">
               Đăng nhập ngay / Login Now
            </a>
          </div>

          <p style="margin-top: 30px; font-size: 14px; color: #333; text-align: center;">
            Trân trọng,<br>
            <strong>Đội ngũ OnePass</strong>
          </p>
        </div>
      `;

      await sendEmailToCustomer(
        pendingData.Email, 
        "OnePass - Thông tin đăng nhập B2B | B2B Login Credentials", 
        emailContent
      );
      
    } catch (mailError) {
      console.error("⚠️ Lỗi gửi mail duyệt cho khách:", mailError);
    }

    // 5. Xóa khỏi Pending sau khi đã xử lý xong xuôi
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
// Lấy danh sách dịch vụ
app.get("/api/b2b/services", async (req, res) => {
  try {
    const { page, limit, DoanhNghiepID } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    let query = supabase
      .from("B2B_SERVICES")
      .select("*", { count: "exact" });

    if (DoanhNghiepID) query = query.eq("DoanhNghiepID", DoanhNghiepID);

    const { data, count, error } = await query
      .order("STT", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const formattedData = data.map(item => ({
      ID: item.STT,
      DoanhNghiepID: item.DoanhNghiepID,
      MaDichVu: item.ServiceID,
      LoaiDichVu: item.LoaiDichVu,
      TenDichVu: item.TenDichVu,
      NgayThucHien: item.NgayThucHien,
      NgayHoanThanh: item.NgayHoanThanh,
      DoanhThuTruocChietKhau: item.DoanhThuTruocChietKhau,
      MucChietKhau: item.MucChietKhau,
      SoTienChietKhau: item.SoTienChietKhau,
      DoanhThuSauChietKhau: item.DoanhThuSauChietKhau,
      TongDoanhThuTichLuy: item.TongDoanhThuTichLuy,
      Vi: item.Vi,
    }));

    res.json({
      success: true,
      data: formattedData,
      total: count,
      page: pageNum,
      totalPages: Math.ceil(count / limitNum),
    });
  } catch (err) {
    console.error("Lỗi B2B_SERVICES:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Lấy ví và hạng của doanh nghiệp
app.get("/api/b2b/services/wallet", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, message: "Thiếu userId" });

    const { data, error } = await supabase
      .from("B2B_APPROVED")
      .select("SoDuVi, XepHang")
      .eq("ID", userId)
      .maybeSingle();

    if (error) throw error;

    const soDu = data?.SoDuVi ?? 2000000;
    const hang = data?.XepHang || "New-bie";

    res.json({ success: true, SoDuVi: soDu, Hang: hang });
  } catch (err) {
    console.error("❌ Lỗi lấy ví:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Thêm dịch vụ mới
app.post("/api/b2b/services", async (req, res) => {
  try {
    const { DoanhNghiepID, LoaiDichVu, MaDichVu, NgayThucHien,
            NgayHoanThanh, DoanhThuTruocChietKhau, Vi } = req.body;

    if (!DoanhNghiepID || !LoaiDichVu || Vi == null) {
      return res.status(400).json({ success: false, message: "Thiếu dữ liệu" });
    }

    // Lấy số dư ví hiện tại
    const { data: approved } = await supabase
      .from("B2B_APPROVED")
      .select("SoDuVi")
      .eq("ID", DoanhNghiepID)
      .maybeSingle();

    const SoDuCu = approved?.SoDuVi ?? 0;
    const SoDuMoi = SoDuCu - Vi;

    if (SoDuMoi < 0)
      return res.status(400).json({ success: false, message: "Số dư ví không đủ" });

    // Cập nhật số dư thực tế ở B2B_APPROVED
    await supabase
      .from("B2B_APPROVED")
      .update({ SoDuVi: SoDuMoi })
      .eq("ID", DoanhNghiepID);

    // Lấy tổng doanh thu hiện tại để tính chiết khấu
    const { data: ds } = await supabase
      .from("B2B_SERVICES")
      .select("DoanhThuSauChietKhau")
      .eq("DoanhNghiepID", DoanhNghiepID);

    const totalCurrent = ds?.reduce((sum, i) => sum + (i.DoanhThuSauChietKhau || 0), 0) ?? 0;

    const { hang, chietKhau } = tinhHangVaChietKhau(totalCurrent);
    const SoTienChietKhau = Math.round((DoanhThuTruocChietKhau * chietKhau) / 100);
    const DoanhThuSauChietKhau = DoanhThuTruocChietKhau - SoTienChietKhau;

    const { data, error } = await supabase
      .from("B2B_SERVICES")
      .insert([{
        DoanhNghiepID,
        LoaiDichVu,
        TenDichVu: req.body.TenDichVu || "",
        ServiceID: MaDichVu,
        NgayThucHien,
        NgayHoanThanh,
        DoanhThuTruocChietKhau,
        MucChietKhau: chietKhau,
        SoTienChietKhau,
        DoanhThuSauChietKhau,
        Vi,
        CreatedAt: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data, SoDuCu, SoDuMoi, ViDaTru: Vi });
  } catch (err) {
    console.error("❌ Lỗi thêm service:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});


app.put("/api/b2b/services/update/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { LoaiDichVu, TenDichVu, MaDichVu, NgayThucHien, NgayHoanThanh, DoanhThuTruocChietKhau, Vi } = req.body;

    const { data: current } = await supabase
      .from("B2B_SERVICES")
      .select("*")
      .eq("STT", id)
      .single();

    const DoanhNghiepID = current.DoanhNghiepID;

    // Lấy số dư hiện tại ở B2B_APPROVED
    const { data: approved } = await supabase
      .from("B2B_APPROVED")
      .select("SoDuVi")
      .eq("ID", DoanhNghiepID)
      .maybeSingle();

    const SoDuCu = approved?.SoDuVi ?? 0;
    const ViCu = current.Vi ?? 0;

    const chenhLech = Vi - ViCu;
    const SoDuMoi = SoDuCu - chenhLech;

    if (SoDuMoi < 0)
      return res.status(400).json({ success: false, message: "Số dư ví không đủ" });

    await supabase
      .from("B2B_APPROVED")
      .update({ SoDuVi: SoDuMoi })
      .eq("ID", DoanhNghiepID);

    // Tính chiết khấu mới
    const { data: ds } = await supabase
      .from("B2B_SERVICES")
      .select("DoanhThuSauChietKhau")
      .eq("DoanhNghiepID", DoanhNghiepID)
      .neq("STT", id);

    const totalOld = ds?.reduce((sum, i) => sum + (i.DoanhThuSauChietKhau || 0), 0) ?? 0;
    const { hang, chietKhau } = tinhHangVaChietKhau(totalOld);

    const SoTienChietKhau = Math.round((DoanhThuTruocChietKhau * chietKhau) / 100);
    const DoanhThuSauChietKhau = DoanhThuTruocChietKhau - SoTienChietKhau;

    const { data, error } = await supabase
      .from("B2B_SERVICES")
      .update({
        LoaiDichVu,
        TenDichVu,
        ServiceID: MaDichVu,
        NgayThucHien,
        NgayHoanThanh,
        Vi,
        DoanhThuTruocChietKhau,
        MucChietKhau: chietKhau,
        SoTienChietKhau,
        DoanhThuSauChietKhau,
        UpdatedAt: new Date().toISOString()
      })
      .eq("STT", id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data, SoDuCu, SoDuMoi, ViCu, ViMoi: Vi });
  } catch (err) {
    console.error("❌ Lỗi update B2B_SERVICES:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});



app.post("/api/b2b/update", async (req, res) => {
  try {
    const { 
      SoDKKD, 
      TenDoanhNghiep,
      NguoiDaiDien, 
      DiaChi, 
      Email, 
      SDT, 
      NganhNgheChinh 
    } = req.body;

    if (!SoDKKD) {
      return res.status(400).json({ 
        success: false, 
        message: "Thiếu Số ĐKKD để xác định doanh nghiệp" 
      });
    }

   
    
    const updatePayload = {
      TenDoanhNghiep,
      NguoiDaiDien,
      DiaChi,
      Email,
      SoDienThoai: SDT, 
      NganhNgheChinh
    };

    // Xóa các trường undefined để tránh lỗi
    Object.keys(updatePayload).forEach(key => {
      if (updatePayload[key] === undefined) {
        delete updatePayload[key];
      }
    });

    const { data, error } = await supabase
      .from("B2B_APPROVED")
      .update(updatePayload)
      .eq("SoDKKD", SoDKKD)
      .select()
      .single();

    if (error) throw error;

    const responseData = {
      ...data,
      SDT: data.SoDienThoai 
    };

    res.json({ 
      success: true, 
      message: "Cập nhật thông tin thành công", 
      data: responseData 
    });

  } catch (err) {
    console.error("❌ Lỗi update B2B Info:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});
app.delete("/api/b2b/services/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from("B2B_SERVICES")
      .delete()
      .eq("STT", id);

    if (error) throw error;
    res.json({ success: true, message: "Đã xóa dịch vụ" });
  } catch (err) {
    console.error("❌ Lỗi xóa B2B_SERVICES:", err);
    res.status(500).json({ success: false, message: err.message });
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


app.get("/api/b2b/approved", async (req, res) => {
  try {
    const { SoDKKD, page, limit } = req.query;
    
    
    if (SoDKKD) {
       const { data, error } = await supabase
        .from("B2B_APPROVED")
        .select("*")
        .eq("SoDKKD", String(SoDKKD).trim());
       if (error) throw error;
       return res.json({ success: true, data });
    }


    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    const { data: approvedList, count, error } = await supabase
      .from("B2B_APPROVED")
      .select("*", { count: "exact" })
      .order("ID", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const mappedList = approvedList.map(item => ({
      ...item,
      DichVu: item.DichVu || "",
      DichVuKhac: item.DichVuKhac || "",
    }));

    res.json({ 
      success: true, 
      data: mappedList,
      total: count,
      page: pageNum,
      totalPages: Math.ceil(count / limitNum)
    });
  } catch (err) {
    console.error("Error fetching B2B_APPROVED:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});


app.get("/api/b2b/approved-services/:soDKKD", async (req, res) => {
  try {
    const { soDKKD } = req.params;

    if (!soDKKD) {
      return res.status(400).json({
        success: false,
        message: "Thiếu số đăng ký kinh doanh"
      });
    }

    // Lấy thông tin công ty từ B2B_APPROVED
    const { data: companyData, error: companyError } = await supabase
      .from("B2B_APPROVED")
      .select("ID")
      .eq("SoDKKD", soDKKD)
      .single();

    if (companyError || !companyData) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy doanh nghiệp"
      });
    }

    const companyId = companyData.ID;

    // Lấy danh sách dịch vụ từ B2B_APPROVED_SERVICES
    const { data: services, error: servicesError } = await supabase
      .from("B2B_APPROVED_SERVICES")
      .select("*")
      .eq("DoanhNghiepID", companyId)
      .order("ID", { ascending: true });

    if (servicesError) throw servicesError;

    res.json({
      success: true,
      data: services || []
    });

  } catch (err) {
    console.error("❌ Lỗi lấy danh sách dịch vụ:", err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

// API thêm dịch vụ mới vào B2B_APPROVED_SERVICES
app.post("/api/b2b/approved-services/:soDKKD", async (req, res) => {
  try {
    const { soDKKD } = req.params;
    const {
      TenDichVu,
      MaDichVu,
      NgayBatDau,
      NgayHoanThanh,
      DoanhThuTruocChietKhau,
      MucChietKhau
    } = req.body;

    if (!soDKKD || !TenDichVu) {
      return res.status(400).json({
        success: false,
        message: "Thiếu dữ liệu bắt buộc"
      });
    }

    // Lấy thông tin công ty từ B2B_APPROVED
    const { data: companyData, error: companyError } = await supabase
      .from("B2B_APPROVED")
      .select("ID")
      .eq("SoDKKD", soDKKD)
      .single();

    if (companyError || !companyData) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy doanh nghiệp"
      });
    }

    const companyId = companyData.ID;

    // Tính toán các giá trị
    const SoTienChietKhau = Math.round(DoanhThuTruocChietKhau * (MucChietKhau / 100));
    const DoanhThuSauChietKhau = DoanhThuTruocChietKhau - SoTienChietKhau;
    const TongDoanhThu = DoanhThuSauChietKhau;

    // Thêm dịch vụ mới vào B2B_APPROVED_SERVICES
    const { data: newService, error: insertError } = await supabase
      .from("B2B_APPROVED_SERVICES")
      .insert([
        {
          DoanhNghiepID: companyId,
          TenDichVu,
          MaDichVu: MaDichVu || null,
          NgayThucHien: NgayBatDau,
          NgayHoanThanh: NgayHoanThanh || null,
          DoanhThuTruocCK: DoanhThuTruocChietKhau,
          MucChietKhau: MucChietKhau || 0,
          TienChietKhau: SoTienChietKhau,
          DoanhThuSauCK: DoanhThuSauChietKhau,
          NgayTao: new Date().toISOString(),
          NgayCapNhat: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (insertError) throw insertError;

    res.json({
      success: true,
      message: "Thêm dịch vụ thành công",
      data: newService
    });

  } catch (err) {
    console.error("❌ Lỗi thêm dịch vụ:", err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

// [SỬA] Đăng nhập B2B - Kiểm tra kỹ trạng thái duyệt
app.post("/api/b2b/login", async (req, res) => {
  try {
    const { SoDKKD, MatKhau } = req.body;

    if (!SoDKKD || !MatKhau) {
      return res.status(400).json({ success: false, message: "Thiếu Số ĐKKD hoặc Mật khẩu" });
    }

    
    const { data: approvedUser, error: approvedError } = await supabase
      .from("B2B_APPROVED")
      .select("*")
      .eq("SoDKKD", SoDKKD)
      .maybeSingle();

    if (approvedError) throw approvedError;

    // Nếu tìm thấy trong bảng đã duyệt -> Kiểm tra mật khẩu
    if (approvedUser) {
      const match = await bcrypt.compare(MatKhau, approvedUser.MatKhau);
      if (!match) {
        return res.status(401).json({ success: false, message: "Sai mật khẩu" });
      }
      return res.json({ success: true, message: "Đăng nhập thành công", data: approvedUser });
    }

  
    const { data: pendingUser } = await supabase
      .from("B2B_PENDING")
      .select("ID")
      .eq("SoDKKD", SoDKKD)
      .maybeSingle();

    if (pendingUser) {
      return res.status(403).json({ 
        success: false, 
        message: "Tài khoản của bạn đang chờ Admin phê duyệt. Vui lòng quay lại sau." 
      });
    }

    
    const { data: rejectedUser } = await supabase
      .from("B2B_REJECTED")
      .select("LyDoTuChoi")
      .eq("SoDKKD", SoDKKD)
      .maybeSingle();

    if (rejectedUser) {
      return res.status(403).json({ 
        success: false, 
        message: `Hồ sơ đã bị từ chối. Lý do: ${rejectedUser.LyDoTuChoi || ""}` 
      });
    }

  
    return res.status(404).json({ success: false, message: "Tài khoản không tồn tại hoặc Số ĐKKD sai." });

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




app.set("socketio", io);

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
    
    const { data: existingUser } = await supabase
      .from("User")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({ success: false, message: "Email đã được đăng ký!" });
    }

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
    
    if (error) throw error;

    res.json({ success: true, user: data[0] });
  } catch (err) {
    if (err.message && err.message.includes("User_email_key")) {
       return res.status(400).json({ success: false, message: "Email đã tồn tại." });
    }
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
