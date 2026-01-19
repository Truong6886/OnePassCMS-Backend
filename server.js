import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { createClient } from "@supabase/supabase-js";
import multer from "multer";
import bcrypt from "bcryptjs";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import fetch from "node-fetch";
import nodemailer from "nodemailer";
import emailjs from '@emailjs/nodejs';
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });
function getInitials(str) {
  if (!str) return "";
  return str
    .normalize('NFD') // Tách dấu ra khỏi ký tự
    .replace(/[\u0300-\u036f]/g, '') // Xóa các dấu
    .replace(/đ/g, 'd').replace(/Đ/g, 'D') // Xử lý chữ Đ
    .replace(/[^a-zA-Z0-9 ]/g, "") // Chỉ giữ lại chữ và số
    .trim()
    .split(/\s+/) // Tách theo khoảng trắng
    .map(word => word[0]) // Lấy ký tự đầu
    .join('')
    .toUpperCase();
}
function translateServiceName(name) {
    const map = {
      "인증 센터": "Hợp pháp hóa, công chứng",
      "결혼 이민": "Kết hôn",
      "출생신고 대행": "Khai sinh, khai tử",
      "국적 대행": "Quốc tịch",
      "여권 • 호적 대행": "Hộ chiếu, Hộ tịch",
      "입양 절차 대행": "Nhận nuôi",
      "비자 대행": "Thị thực",
      "법률 컨설팅": "Tư vấn pháp lý",
      "B2B 서비스": "Dịch vụ B2B",
      "기타": "Bài viết",
    };
  return map[name?.trim()] || name?.trim() || "";
}

// [MỚI] Hàm dịch tên cơ sở/chi nhánh
function translateBranchName(name) {
    const map = {
        "서울": "Seoul",
        "부산": "Busan"
    };
    return map[name?.trim()] || name?.trim() || "";
}

const SERVICE_MAPPING = {
  "Hộ chiếu, Hộ tịch": {
    "Hộ chiếu cấp mới (Hợp pháp - Trẻ em)": "HCCM",
    "Hộ chiếu cấp đổi (Hợp pháp - Còn hạn)": "HCCL A1",
    "Hộ chiếu cấp đổi (Hợp pháp - Hết hạn)": "HCCL A2",
    "Hộ chiếu cấp đổi (Bất hợp pháp - Còn hạn)": "HCCL B1",
    "Hộ chiếu cấp đổi (Bất hợp pháp - Hết hạn)": "HCCL B2",
    "Hộ chiếu cấp đổi rút gọn (công tác ngắn hạn, du lịch, trục xuất)": "HCRG",
    "Hộ chiếu bị chú": "BCHC",
    "Dán ảnh trẻ em": "DCDA",
    "Cải chính hộ tịch": "CCHT",
    "Trích lục khai sinh (sao)": "TLKS",
    "Ghi chú kết hôn (Ghi vào sổ hộ tịch việc kết hôn)": "GCKH",
    "Ghi chú ly hôn": "GCLH",
    "Ghi chú khai sinh": "GCKS"
  },
  "Quốc tịch": {
    "Thôi quốc tịch Việt Nam": "TQT",
    "Giấy xác nhận có quốc tịch Việt Nam": "XNQT",
    "Cấp giấy xác nhận người gốc Việt": "XNQT"
  },
  "Nhận nuôi": {
    "Đăng ký việc nuôi con nuôi": "NCN",
    "Đăng ký việc nhận cha, mẹ, con": "CNC"
  },
  "Thị thực": {
    "Giấy miễn thị thực": "MTT"
  },
  "Khai sinh, khai tử": {
    "Đăng ký khai sinh": "KS"
  },
  "Kết hôn": {
    "Đăng ký kết hôn Việt - Việt": "KHV-V",
    "Giấy xác nhận tình trạng hôn nhân": "TTHN",
    "Giấy chứng nhận đủ điều kiện kết hôn Việt - Hàn": "KHV-H"
  },
  "Hợp pháp hóa, công chứng": {
    "Hợp pháp hoá lãnh sự/Chứng nhận lãnh sự": "HPH",
    "Công chứng, chứng thực hợp đồng giao dịch": "CCHD",
    "Hợp đồng ủy quyền": "HDUQ",
    "Ủy quyền": "UQ",
    "Ủy quyền đưa con về nước": "UQĐTE",
    "Chứng thực chữ ký": "CTCK",
    "Sao y bản chính": "SYBC"
  },
  "Khác": {
    "Xác minh": "XM",
    "Dịch Việt - Hàn": "DTVH",
    "Dịch Hàn - Việt": "DTHV",
    "Dịch BLX": "DTBLX"
  },
  "Dịch thuật": {
    "Công chứng bản dịch": "CNBD",
    "Xin cấp hộ hồ sơ": "XCHS"
  }
};


function getInitialsService(str) {
  if (!str) return "OT";
  return str
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') 
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .match(/[A-Z0-9]/gi) // Lấy chữ cái và số
    ?.join('').toUpperCase().slice(0, 4) || "OT";
}




async function generateServiceCode(supabase, loaiDichVu, yeuCauHoaDon, danhMuc) {
  let prefix = "";
  const mainCategory = danhMuc ? danhMuc.split(" + ")[0].trim() : "";

  if (loaiDichVu && mainCategory && SERVICE_MAPPING[loaiDichVu] && SERVICE_MAPPING[loaiDichVu][mainCategory]) {
    prefix = SERVICE_MAPPING[loaiDichVu][mainCategory];
  }

  if (!prefix) {
     const cleanLoai = loaiDichVu ? loaiDichVu.trim() : "";
     prefix =  getInitialsService(cleanLoai); 
  }

  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yy}${mm}${dd}`; 

  const isInvoice = ["yes", "có", "true", "y"].includes(String(yeuCauHoaDon).toLowerCase());
  const invoiceCode = isInvoice ? "Y" : "N";

  const searchString = `${prefix}-${dateStr}-%`; 

  const { data: lastRecord, error } = await supabase
    .from("B2B_SERVICES")
    .select("ServiceID, CreatedAt") 
    .like("ServiceID", searchString)
    .order("CreatedAt", { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextSequence = 1;
  if (lastRecord && lastRecord.ServiceID) {
    const parts = lastRecord.ServiceID.split('-');
    const lastNum = parseInt(parts[parts.length - 1]);
    if (!isNaN(lastNum)) nextSequence = lastNum + 1;
  }

  const sequenceStr = String(nextSequence).padStart(3, "0");
  
  return `${prefix}-${dateStr}-${invoiceCode}-${sequenceStr}`;
}


async function generateB2CServiceCode(supabase, loaiDichVu, yeuCauHoaDon, danhMuc) {
  let prefix = "";
  

  const mainCategory = danhMuc ? danhMuc.split(" + ")[0].trim() : "";

  
  if (loaiDichVu && mainCategory && SERVICE_MAPPING[loaiDichVu] && SERVICE_MAPPING[loaiDichVu][mainCategory]) {
    prefix = SERVICE_MAPPING[loaiDichVu][mainCategory];
  }

  if (!prefix) {
     const cleanLoai = loaiDichVu ? loaiDichVu.trim() : "";
     prefix = getInitialsService(cleanLoai); 
  }

  if (!prefix) prefix = "OT";


  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yy}${mm}${dd}`; 

  const isInvoice = ["yes", "có", "true", "y"].includes(String(yeuCauHoaDon).toLowerCase());
  const invoiceCode = isInvoice ? "Y" : "N";


  const searchString = `${prefix}-${dateStr}-%`; 

  const { data: lastRecord } = await supabase
    .from("YeuCau")
    .select("MaHoSo")
    .like("MaHoSo", searchString)
    .order("MaHoSo", { ascending: false }) 
    .limit(1)
    .maybeSingle();

  let nextSequence = 1;
  if (lastRecord && lastRecord.MaHoSo) {
   
    const parts = lastRecord.MaHoSo.split('-');
    const lastNum = parseInt(parts[parts.length - 1]);
    if (!isNaN(lastNum)) nextSequence = lastNum + 1;
  }

  const sequenceStr = String(nextSequence).padStart(3, "0");
  

  return `${prefix}-${dateStr}-${invoiceCode}-${sequenceStr}`;
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
     "http://localhost:5174",
    "https://www.onepasskr.com", 
    "https://b2bonepass.vercel.app",
    "https://onepass-gamma.vercel.app",
    "http://localhost:8080",
    "https://onepasscms.vercel.app" 
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// Increase body size limits for FormData with file upload
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Multer instances tách biệt để tránh ảnh hưởng lẫn nhau
// - uploadDocs: cho PDF/Word và ảnh (dùng cho CV, invoice, đăng ký B2B)
// - uploadImages: chỉ cho ảnh (dùng cho tin tức, avatar,...)
const uploadDocs = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedDocs = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    const isAllowedImage = file.mimetype?.startsWith('image/');
    const isAllowedDoc = allowedDocs.includes(file.mimetype);

    if (isAllowedDoc || isAllowedImage) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ hỗ trợ file PDF, Word hoặc ảnh (jpg, png)'), false);
    }
  }
});

const uploadImages = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ hỗ trợ file ảnh'), false);
    }
  }
});
// Bucket riêng cho tin tức (dùng bucket 'invoice' đã tồn tại)
const NEWS_BUCKET = "invoice";

// Ensure bucket exists (idempotent)
const ensureBucket = async (bucket) => {
  const { data: bucketData, error: bucketError } = await supabase.storage.getBucket(bucket);
  if (bucketData) return bucketData;
  if (bucketError && bucketError.statusCode !== 404) throw bucketError;

  const { data, error } = await supabase.storage.createBucket(bucket, { public: true });
  if (error) {
    console.error("❌ Tạo bucket thất bại:", error);
    throw error;
  }
  console.log(`✅ Đã tạo bucket mới: ${bucket}`);
  return data;
};

// ==== Helper: handle supabase errors ====
const handleSupabaseError = (error) => {
  if (error) throw new Error(error.message || "Supabase error");
};

const verifySession = async (req, res, next) => {
  try {

    const authHeader = req.headers['authorization'];
    const userId = req.headers['x-user-id'];

    if (!authHeader || !userId) {

      return next(); 
    }

    const clientToken = authHeader.split(' ')[1]; 

    const { data, error } = await supabase
      .from("User")
      .select("session_token")
      .eq("id", userId)
      .single();

    if (error || !data) {
      return res.status(401).json({ success: false, message: "User không tồn tại or Lỗi DB", code: "SESSION_INVALID" });
    }

    // SO SÁNH: Nếu token client gửi lên KHÁC token trong DB -> Đã có người khác đăng nhập
    if (data.session_token !== clientToken) {
      return res.status(401).json({ 
        success: false, 
        message: "Tài khoản đã được đăng nhập ở nơi khác. Vui lòng đăng nhập lại.", 
        code: "SESSION_EXPIRED" 
      });
    }

    next(); // Token khớp, cho phép đi tiếp
  } catch (err) {
    console.error("Session check error:", err);
    res.status(500).json({ success: false, message: "Lỗi kiểm tra phiên" });
  }
};


app.use('/api', verifySession);
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







async function sendNotificationToApprovers(payload) {
  if (!global.io) return;
  try {
    
    const { data: approvers, error } = await supabase
      .from("User")
      .select("id")
      .or("is_director.eq.true,perm_approve_b2c.eq.true");

    if (error) {
      console.error("❌ Lỗi lấy người duyệt:", error.message);
      return;
    }

    if (approvers && approvers.length > 0) {
      approvers.forEach((user) => {
        const socketId = userSocketMap.get(String(user.id));
        if (socketId) {
     
          global.io.to(socketId).emit("new_request", {
             ...payload,
             title: "Yêu cầu mới cần duyệt",
             type: "needs_approval"
          });
          console.log(`📡 Đã gửi thông báo DUYỆT tới User ID ${user.id}`);
        }
      });
    }
  } catch (err) {
    console.error("❌ Socket Error:", err);
  }
}
async function sendNotificationToAdmins(payload) {
  if (!global.io) return;
  try {
    // Lấy danh sách Admin
    const { data: admins, error } = await supabase
      .from("User")
      .select("id")
      .eq("is_admin", true);

    if (error) {
       console.error("❌ Lỗi lấy admin:", error.message);
       return;
    }

    if (admins && admins.length > 0) {
      admins.forEach((user) => {
        const socketId = userSocketMap.get(String(user.id));
        if (socketId) {
          // Gửi sự kiện thông báo đã duyệt
          global.io.to(socketId).emit("new_request", {
            ...payload,
             title: "Hồ sơ đã được duyệt & cấp mã",
             type: "approved_done"
          });
          console.log(`📡 Đã gửi thông báo HOÀN THÀNH tới Admin ID ${user.id}`);
        }
      });
    }
  } catch (err) {
    console.error("❌ Socket Error:", err);
  }
}
app.put("/api/yeucau/approve/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      userId, NguoiPhuTrachId, HoTen, SoDienThoai, Email, MaVung,
      LoaiDichVu, TenDichVu, GoiDichVu, TenHinhThuc, CoSoTuVan,
      ChonNgay, Gio, NoiDung, GhiChu, DanhMuc, ChiTietDichVu,NgayBatDau, 
      NgayKetThuc
    } = req.body; 

    // --- 1. TÍNH TOÁN DOANH THU & CHIẾT KHẤU ---
    let totalRevenue = 0;
    let totalDiscountAmt = 0;
    
    let details = ChiTietDichVu;
    if (typeof details === 'string') {
        try { details = JSON.parse(details); } catch (e) { details = null; }
    }

    if (details && details.main) {
        const mainRev = parseFloat(details.main.revenue) || 0;
        const mainDisc = parseFloat(details.main.discount) || 0;
        totalRevenue += mainRev;
        totalDiscountAmt += mainRev * (mainDisc / 100);

        if (details.sub && Array.isArray(details.sub)) {
            details.sub.forEach(sub => {
                const subRev = parseFloat(sub.revenue) || 0;
                const subDisc = parseFloat(sub.discount) || 0;
                totalRevenue += subRev;
                totalDiscountAmt += subRev * (subDisc / 100);
            });
        }
    } else {
        totalRevenue = parseInt(req.body.DoanhThuTruocChietKhau) || 0;
        const phanTram = parseFloat(req.body.MucChietKhau) || 0;
        totalDiscountAmt = Math.round((totalRevenue * phanTram) / 100);
    }

   
    const currentNetRevenue = totalRevenue - totalDiscountAmt;

    const { data: historyData } = await supabase
        .from("YeuCau")
        .select("DoanhThuSauChietKhau")
        .eq("SoDienThoai", SoDienThoai)
        .neq("YeuCauID", id); 

    const historyTotal = historyData?.reduce((sum, item) => sum + (item.DoanhThuSauChietKhau || 0), 0) ?? 0;
    const newTongDoanhThuTichLuy = historyTotal + currentNetRevenue;


    const { data: currentReq } = await supabase.from("YeuCau").select("*").eq("YeuCauID", id).single();
    let newServiceCode = currentReq.MaHoSo;
    
 
    if (!newServiceCode || newServiceCode.length < 5) {
         newServiceCode = await generateB2CServiceCode(supabase, LoaiDichVu || currentReq.LoaiDichVu, currentReq.Invoice, DanhMuc || currentReq.DanhMuc);
    }


    const { data: updatedData, error: updateError } = await supabase
      .from("YeuCau")
      .update({
        HoTen, SoDienThoai, Email, MaVung, LoaiDichVu, TenDichVu, GoiDichVu,
        TenHinhThuc, CoSoTuVan, ChonNgay, Gio, NoiDung, GhiChu, DanhMuc,
        MaHoSo: newServiceCode,
        NguoiPhuTrachId: NguoiPhuTrachId || userId,
        ChiTietDichVu: details,
        DoanhThuTruocChietKhau: totalRevenue,
        MucChietKhau: totalRevenue > 0 ? (totalDiscountAmt / totalRevenue * 100) : 0,
        SoTienChietKhau: totalDiscountAmt,
        DoanhThuSauChietKhau: currentNetRevenue,
        TongDoanhThuTichLuy: newTongDoanhThuTichLuy,
        NgayBatDau: NgayBatDau || null, 
        NgayKetThuc: NgayKetThuc || null 
      })
      .eq("YeuCauID", id)
      .select().single();

    if (updateError) throw updateError;

    if (global.io) {
        const adminPayload = {
            YeuCauID: id,
            HoTen: HoTen || currentReq.HoTen, 
            MaHoSo: newServiceCode,     
            ThoiGian: new Date().toISOString(),
        };
        await sendNotificationToAdmins(adminPayload);
        console.log(`📡 Đã gửi thông báo duyệt hồ sơ ${newServiceCode} tới Admin`);
    }

    res.json({ success: true, message: `Duyệt thành công. Mã: ${newServiceCode}`, data: updatedData });

  } catch (err) {
    console.error("❌ Lỗi duyệt yêu cầu:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});
const userSocketMap = new Map();

io.on("connection", (socket) => {
  console.log("📡 Client connected:", socket.id);

  
socket.on("register_user", (userId) => {
    if (!userId) return;

    const oldSocketId = userSocketMap.get(String(userId));

  
    if (oldSocketId && oldSocketId !== socket.id) {
      console.log(`⚠️ Gửi lệnh logout đến máy cũ: ${oldSocketId}`);
      

      io.to(oldSocketId).emit("force_logout", "Tài khoản của bạn đã được đăng nhập ở thiết bị khác.");
    }

    // Cập nhật socketId mới nhất cho User
    userSocketMap.set(String(userId), socket.id);
    socket.userId = String(userId); 
});
  socket.on("disconnect", (reason) => {
    console.log("❌ Client disconnected:", socket.id, "Reason:", reason);
   
    if (socket.userId && userSocketMap.get(socket.userId) === socket.id) {
      userSocketMap.delete(socket.userId);
    }
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
// Health check cho Socket.io
app.get("/api/socket-health", (req, res) => {
  const connectedClients = io.engine.clientsCount;
  res.json({
    success: true,
    connectedClients,
    timestamp: new Date().toISOString()
  });
});


app.post("/api/upload-cv", uploadDocs.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: "Vui lòng chọn file" });
    }

    console.log("📁 Uploading CV:", {
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype
    });

    const fileExt = file.originalname.split(".").pop().toLowerCase();
    const fileName = `cv_${Date.now()}_${Math.round(Math.random() * 1000)}.${fileExt}`;

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from("cv") 
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      console.error("❌ Supabase upload error:", error);
      throw error;
    }

    console.log("✅ File uploaded to Supabase:", fileName);

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from("cv")
      .getPublicUrl(fileName);

    if (!publicUrlData || !publicUrlData.publicUrl) {
        throw new Error("Không lấy được đường dẫn file");
    }

    console.log("✅ Public URL:", publicUrlData.publicUrl);

    // Return success response
    res.json({ 
      success: true, 
      message: "Upload thành công", 
      url: publicUrlData.publicUrl 
    });

  } catch (err) {
    console.error("❌ Lỗi upload CV:", err.message || err);
    res.status(500).json({ 
      success: false, 
      message: err.message || "Lỗi khi upload file" 
    });
  }
});
app.post("/api/upload-invoice", uploadDocs.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: "Vui lòng chọn file" });
    }

    // Tạo tên file unique
    const fileExt = file.originalname.split(".").pop();
    const fileName = `invoice_${Date.now()}_${Math.round(Math.random() * 1000)}.${fileExt}`;

    // Upload vào bucket "invoice" (Bạn cần tạo bucket này trên Supabase và set Public)
    const { data, error } = await supabase.storage
      .from("invoice") 
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) throw error;

    // Lấy Public URL
    const { data: publicUrlData } = supabase.storage
      .from("invoice")
      .getPublicUrl(fileName);

    if (!publicUrlData || !publicUrlData.publicUrl) {
        throw new Error("Không lấy được đường dẫn file");
    }

    res.json({ 
      success: true, 
      message: "Upload thành công", 
      url: publicUrlData.publicUrl 
    });

  } catch (err) {
    console.error("❌ Lỗi upload Invoice:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});
app.post("/api/upload-news-image", uploadImages.single("file"), async (req, res) => {
  try {
    console.log("📸 Upload news image request received");
    console.log("File:", req.file ? { name: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype } : "NO FILE");
    
    const file = req.file;
    if (!file) {
      console.warn("⚠️ No file provided");
      return res.status(400).json({ success: false, message: "Vui lòng chọn file" });
    }

    // Ensure bucket exists (dùng bucket mặc định đã có sẵn)
    try {
      console.log(`📦 Ensuring bucket exists: ${NEWS_BUCKET}`);
      await ensureBucket(NEWS_BUCKET);
      console.log(`✅ Bucket ${NEWS_BUCKET} ready`);
    } catch (bucketErr) {
      console.error("❌ Không tạo/đọc được bucket:", bucketErr);
      return res.status(500).json({ success: false, message: bucketErr.message || "Bucket error" });
    }

    const sanitizedName = (file.originalname || "news-image")
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9.-]/g, "");
    const fileExt = path.extname(sanitizedName) || "";
    const baseName = sanitizedName.replace(fileExt, "") || "news-image";
    const uniqueName = `${baseName}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const filePath = `${uniqueName}${fileExt}`;
    
    console.log(`📝 File path: ${filePath}`);

    const { error } = await supabase.storage
      .from(NEWS_BUCKET)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      console.error("❌ Supabase upload error:", error);
      throw error;
    }
    
    console.log("✅ File uploaded to Supabase");

    const { data: publicUrlData } = supabase.storage
      .from(NEWS_BUCKET)
      .getPublicUrl(filePath);

    if (!publicUrlData || !publicUrlData.publicUrl) {
      console.error("❌ No public URL returned");
      throw new Error("Không lấy được đường dẫn file");
    }
    
    console.log("✅ Public URL obtained:", publicUrlData.publicUrl);

    res.json({
      success: true,
      message: "Upload thành công",
      url: publicUrlData.publicUrl,
      path: filePath,
    });

  } catch (err) {
    console.error("❌ Lỗi upload ảnh tin tức:", err.message || err);
    res.status(500).json({ success: false, message: err.message || "Upload failed" });
  }
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
app.post("/api/b2b/register", (req, res) => {
  uploadDocs.single("giayDangKyKinhDoanh")(req, res, async (multerErr) => {
    if (multerErr) {
      console.error("❌ Multer Error:", multerErr);
      return res.status(400).json({ success: false, message: "File upload error: " + multerErr.message });
    }

    try {
      console.log("📝 B2B Register Request Body:", req.body);
      console.log("📁 File uploaded:", req.file ? req.file.originalname : "No file");
      const {
        tenDoanhNghiep,
        soDKKD,
        nguoiDaiDienPhapLuat,
        nganhNgheChinh,
        soDienThoaiLienHe,
        email,
        matKhau,
        dichVuChinh,
        website
      } = req.body;

    // Giới hạn độ dài để tránh lỗi Supabase
    const truncate = (val, limit = 100) => {
      if (val === undefined || val === null) return "";
      const str = String(val).trim();
      return str.length > limit ? str.slice(0, limit) : str;
    };

    const limits = {
      TenDoanhNghiep: 100,
      SoDKKD: 50,
      Email: 100,
      Website: 255,
      SoDienThoai: 30,
      NguoiDaiDien: 100,
      DichVu: 255,
      NganhNgheChinh: 255,
      PdfPath: 255,
      MatKhau: 255,
    };

    // Chuẩn hóa dữ liệu đầu vào
    const cleanSoDKKD = truncate(soDKKD, limits.SoDKKD);
    const cleanEmail = truncate(email, limits.Email);

    // Bắt buộc các trường tối thiểu
    const requiredFields = [
      ["tenDoanhNghiep", tenDoanhNghiep],
      ["soDKKD", cleanSoDKKD],
      ["email", cleanEmail],
      ["matKhau", matKhau],
      ["nguoiDaiDienPhapLuat", nguoiDaiDienPhapLuat],
      ["nganhNgheChinh", nganhNgheChinh],
      ["soDienThoaiLienHe", soDienThoaiLienHe],
      ["dichVuChinh", dichVuChinh]
    ];

    const missing = requiredFields
      .filter(([_, v]) => v === undefined || v === null || String(v).trim() === "")
      .map(([k]) => k);

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Thiếu dữ liệu: ${missing.join(", ")}`
      });
    }

    if (!cleanSoDKKD) {
      return res.status(400).json({ success: false, message: "Số ĐKKD không được để trống" });
    }

    // Kiểm tra trong bảng ĐÃ DUYỆT (B2B_APPROVED)
    const { data: existingApproved, error: errApproved } = await supabase
      .from("B2B_APPROVED")
      .select("ID, TenDoanhNghiep")
      .eq("SoDKKD", cleanSoDKKD)
      .maybeSingle();

    if (errApproved) throw errApproved;
    
    if (existingApproved) {
      return res.status(400).json({
        success: false,
        message: `Số ĐKKD ${cleanSoDKKD} đã tồn tại trong hệ thống (Doanh nghiệp: ${existingApproved.TenDoanhNghiep}). Vui lòng trở về trang đăng nhập.`
      });
    }

    // Upload file nếu có
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

    // Hash mật khẩu
    const hashedPassword = await bcrypt.hash(matKhau, 10);

    // Lưu trực tiếp vào B2B_APPROVED
    const { data, error } = await supabase
      .from("B2B_APPROVED")
      .insert([
        {
          TenDoanhNghiep: truncate(tenDoanhNghiep, limits.TenDoanhNghiep),
          SoDKKD: cleanSoDKKD,
          Email: cleanEmail,
          MatKhau: hashedPassword,
          SoDienThoai: truncate(soDienThoaiLienHe, limits.SoDienThoai),
          Website: truncate(website || "", limits.Website),
          NguoiDaiDien: truncate(nguoiDaiDienPhapLuat, limits.NguoiDaiDien),
          DichVu: truncate(dichVuChinh, limits.DichVu),
          NganhNgheChinh: truncate(nganhNgheChinh, limits.NganhNgheChinh),
          PdfPath: truncate(PdfPath, limits.PdfPath)
        }
      ])
      .select();

    if (error) {
      console.error("Supabase insert B2B_APPROVED error:", error);
      throw error;
    }
    
    const newB2B = data[0];

    // Gửi notification qua socket
    if (global.io) {
      const notificationPayload = {
        YeuCauID: newB2B.ID,               
        HoTen: tenDoanhNghiep,  
        TenDichVu: "Đăng ký Doanh nghiệp B2B",
        TenHinhThuc: "Đăng ký trực tiếp",
        SoDienThoai: soDienThoaiLienHe,
        Email: cleanEmail,
        NgayTao: new Date().toISOString(),
        LoaiThongBao: "B2B_APPROVED"       
      };
      global.io.emit("new_request", notificationPayload);
    }

    // Gửi email xác nhận
    try {
      const emailContent = `
        <div style="max-width: 600px; margin: auto; padding: 20px; font-family: 'Segoe UI', Arial, sans-serif; border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff;">
          <div style="text-align: center; border-bottom: 2px solid #2C4D9E; padding-bottom: 15px; margin-bottom: 20px;">
            <h2 style="color: #2C4D9E; margin: 0; font-size: 22px;">Đăng ký tài khoản B2B thành công</h2>
            <h3 style="color: #666; margin: 5px 0 0 0; font-size: 16px; font-weight: normal; font-style: italic;">Successful B2B Account Registration</h3>
          </div>
          <div style="padding: 0 10px;">
            <p style="color: #333; font-size: 15px; line-height: 1.6;">
              Xin chào <strong>${tenDoanhNghiep}</strong>,
            </p>
            <p style="color: #333; font-size: 15px; line-height: 1.6;">
              Cảm ơn bạn đã đăng ký tài khoản B2B với <strong>OnePass</strong>. Tài khoản của bạn đã được tạo thành công!
            </p>
            <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 5px 0; color: #555;"><strong>Tên doanh nghiệp:</strong> ${tenDoanhNghiep}</p>
              <p style="margin: 5px 0; color: #555;"><strong>Số ĐKKD:</strong> ${cleanSoDKKD}</p>
              <p style="margin: 5px 0; color: #555;"><strong>Email:</strong> ${cleanEmail}</p>
              <p style="margin: 5px 0; color: #555;"><strong>Dịch vụ:</strong> ${dichVuChinh}</p>
            </div>
            <p style="color: #333; font-size: 15px; line-height: 1.6;">
              Bạn có thể đăng nhập vào hệ thống để sử dụng các dịch vụ B2B của chúng tôi.
            </p>
            <div style="text-align: center; margin: 25px 0;">
              <a href="https://onepass-cms.vercel.app/b2b" style="display: inline-block; background: #2C4D9E; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">Đăng nhập ngay</a>
            </div>
          </div>
          <div style="border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 20px; text-align: center; color: #666; font-size: 12px;">
            <p>Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.</p>
            <p style="margin: 5px 0;"><strong>OnePass Support Team</strong></p>
            <p style="margin: 5px 0;">Email: support@onepass.com | Phone: +84 123 456 789</p>
          </div>
        </div>
      `;

      await sendEmailToCustomer(cleanEmail, "OnePass - Xác nhận đăng ký B2B | B2B Registration Confirmation", emailContent);
    } catch (mailError) {
      console.error("⚠️ Lỗi gửi mail khách:", mailError);
    }

    // Gửi email cho admin
    try {
      const adminEmails = await getAdminEmails();
      const adminEmailContent = `
        <div style="max-width: 600px; margin: auto; padding: 20px; font-family: 'Segoe UI', Arial, sans-serif; border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff;">
          <h2 style="color: #2C4D9E; text-align: center; margin-bottom: 20px; border-bottom: 2px solid #2C4D9E; padding-bottom: 10px;">
            Doanh nghiệp mới đăng ký B2B
          </h2>
          <p style="font-size: 16px; color: #333;">
            Một doanh nghiệp vừa đăng ký tài khoản B2B. Thông tin chi tiết:
          </p>
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #2C4D9E; margin-top: 10px; font-size: 15px; color: #333;">
            <p><b>Tên doanh nghiệp:</b> ${tenDoanhNghiep}</p>
            <p><b>Số ĐKKD:</b> ${cleanSoDKKD}</p>
            <p><b>Người đại diện:</b> ${nguoiDaiDienPhapLuat}</p>
            <p><b>Email:</b> ${cleanEmail}</p>
            <p><b>Số điện thoại:</b> ${soDienThoaiLienHe}</p>
            <p><b>Ngành nghề:</b> ${nganhNgheChinh}</p>
            <p><b>Dịch vụ:</b> ${dichVuChinh}</p>
          </div>
          <div style="margin-top: 25px; text-align: center;">
            <a href="https://onepasscms.vercel.app/B2B" style="background: #2C4D9E; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: bold; display: inline-block;">
              Xem trong CMS
            </a>
          </div>
          <p style="margin-top: 20px; font-size: 13px; color: #6c757d; text-align: center;">
            Email được gửi tự động từ hệ thống OnePass CMS.
          </p>
        </div>
      `;
      
      await sendEmailToAdmin(
        "OnePass - Doanh nghiệp B2B mới đăng ký",
        adminEmailContent,
        adminEmails
      );
    } catch (adminMailErr) {
      console.error("⚠️ Lỗi gửi mail admin:", adminMailErr);
    }

    res.json({ 
      success: true, 
      message: "Đăng ký doanh nghiệp B2B thành công!", 
      data: newB2B 
    });

    } catch (err) {
      console.error("❌ Lỗi API đăng ký B2B:", err);
      const detail = err?.message || err?.toString?.() || "Internal Error";
      const supaDetails = err?.details || err?.hint || err?.code || "";
      res.status(500).json({ success: false, message: detail, details: supaDetails });
    }
  });
});

app.put("/api/b2b/pending/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      TenDoanhNghiep, 
      SoDKKD, 
      NguoiDaiDien, 
      MaVung,
      LoaiWebsite,
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
        LoaiWebsite: LoaiWebsite || null,
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
app.post("/api/User", async (req, res) => {
  try {
    const { 
      username, password, email, name, 
      is_admin, is_director, is_accountant, is_staff,
      perm_approve_b2b, perm_approve_b2c, perm_view_revenue, perm_view_staff,
      ChucDanh, PhongBan, MaVung, SoDienThoai, NgayVaoLam, LoaiHopDong, CV
    } = req.body;
    
    console.log("📝 POST /api/User - Received body:", {
      username: username ? "✓" : "✗",
      password: password ? "✓" : "✗",
      name,
      email,
      is_admin, is_director, is_accountant, is_staff
    });
  
    if (!username || username.trim() === "") {
      return res.status(400).json({ success: false, message: "Vui lòng nhập tên đăng nhập" });
    }
    
    if (!password || password.trim() === "") {
      return res.status(400).json({ success: false, message: "Vui lòng nhập mật khẩu" });
    }

    const { data: existingUsername } = await supabase
      .from("User")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (existingUsername) {
      return res.status(400).json({ success: false, message: "Tên đăng nhập này đã tồn tại, vui lòng chọn tên khác!" });
    }
    // --------------------------------------

    const emailValue = email && email.trim() !== "" ? email.trim() : null;


    if (emailValue) {
      const { data: existingEmail } = await supabase
        .from("User")
        .select("id")
        .eq("email", emailValue)
        .maybeSingle();
      if (existingEmail) {
        return res.status(400).json({ success: false, message: "Email này đã được sử dụng!" });
      }
    }

    // 3. Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Thêm vào DB
    const { data, error } = await supabase
      .from("User")
      .insert([{ 
        username, 
        email: emailValue, 
        password_hash: hashedPassword, 
        name: name || username,
        is_admin: is_admin || false,
        is_director: is_director || false,
        is_accountant: is_accountant || false,
        is_staff: is_staff || false,
        perm_approve_b2b: perm_approve_b2b || false,
        perm_approve_b2c: perm_approve_b2c || false,
        perm_view_revenue: perm_view_revenue || false,
        perm_view_staff: perm_view_staff || false,

        ChucDanh, PhongBan, MaVung, SoDienThoai, NgayVaoLam, LoaiHopDong, CV
      }])
      .select();

    if (error) throw error;
    
    const createdUser = data[0];
    delete createdUser.password_hash; // Xóa hash pass trước khi trả về client

    res.json({ success: true, message: "Tạo nhân viên thành công", data: createdUser });
  } catch (err) {
    console.error("❌ Lỗi tạo User:", err);
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

// [CẬP NHẬT SỬA LỖI 500] PUT Update User
app.put("/api/User/:id", uploadImages.single("avatar"), async (req, res) => {
  try {
    const { id } = req.params;
    let { 
      name, username, email, password, 
      is_admin, is_director, is_accountant, is_staff,
      perm_approve_b2b, perm_approve_b2c, perm_view_revenue, perm_view_staff,
      ChucDanh, PhongBan, MaVung, SoDienThoai, NgayVaoLam, LoaiHopDong, CV
    } = req.body;

    
    const cleanEmail = email && email.trim() !== "" ? email.trim() : null;
    const cleanDate = (dateStr) => (dateStr && dateStr.trim() !== "" ? dateStr : null); 

    const updateData = {
      name,
      username,
      email: cleanEmail,
      updated_at: new Date().toISOString(),
      is_admin, is_director, is_accountant, is_staff,
      perm_approve_b2b, perm_approve_b2c, perm_view_revenue, perm_view_staff,
      

      ChucDanh: ChucDanh || null,
      PhongBan: PhongBan || null,
      MaVung: MaVung || "+84",
      SoDienThoai: SoDienThoai || null,
      NgayVaoLam: cleanDate(NgayVaoLam),
      LoaiHopDong: LoaiHopDong || null,
      CV: CV || null
    };

    
    if (password && password.trim() !== "") {
      updateData.password_hash = await bcrypt.hash(password, 10);
    }


    const { data, error } = await supabase
      .from("User")
      .update(updateData)
      .eq("id", id)
      .select();

    if (error) throw error;



    const updatedUser = data[0];
    delete updatedUser.password_hash;

    res.json({ success: true, data: updatedUser, message: "Cập nhật thành công" });

  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ success: false, message: "Lỗi Server: " + err.message });
  }
});
app.post("/api/b2b/pending/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const truncate = (val, limit = 20) => {
      if (typeof val !== "string") return val;
      return val.slice(0, limit);
    };

    const limits = {
      TenDoanhNghiep: 20,
      SoDKKD: 20,
      Email: 20,
      MaVung: 20,
      Website: 20,
      LoaiWebsite: 20,
      SoDienThoai: 20,
      NguoiDaiDien: 20,
      DichVu: 20,
      DichVuKhac: 20,
      NganhNgheChinh: 20,
      PdfPath: 255,
      Status: 20,
      LyDoTuChoi: 20
    };

    const clamp = (key, val) => truncate(val || "", limits[key] ?? 20);

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
        TenDoanhNghiep: clamp("TenDoanhNghiep", pendingData.TenDoanhNghiep),
        SoDKKD: clamp("SoDKKD", pendingData.SoDKKD),
        Email: clamp("Email", pendingData.Email),
        MaVung: clamp("MaVung", pendingData.MaVung),
        Website: clamp("Website", pendingData.Website),
        LoaiWebsite: clamp("LoaiWebsite", pendingData.LoaiWebsite),
        SoDienThoai: clamp("SoDienThoai", pendingData.SoDienThoai),
        NguoiDaiDien: clamp("NguoiDaiDien", pendingData.NguoiDaiDien),
        DichVu: clamp("DichVu", pendingData.DichVu),
        DichVuKhac: clamp("DichVuKhac", pendingData.DichVuKhac),
        NganhNgheChinh: clamp("NganhNgheChinh", pendingData.NganhNgheChinh),
        PdfPath: clamp("PdfPath", pendingData.PdfPath),
        LyDoTuChoi: clamp("LyDoTuChoi", reason.trim()),
        NgayTao: new Date().toISOString(),
        Status: clamp("Status", "Đã từ chối")
      }])
      .select()
      .single();

    if (insertError) {
      console.error("Insert rejected failed", insertError);
      return res.status(400).json({ success: false, message: insertError.message });
    }

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
          LoaiWebsite: pendingData.LoaiWebsite,
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

   
   if (dichVuNames) {
      
      const servicesToInsert = [{
        DoanhNghiepID: approvedId,
        TenDichVu: dichVuNames,
      }];
      // ----------------------------------

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

app.get("/api/b2b/services", async (req, res) => {
  try {
    const { page, limit, DoanhNghiepID } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    let query = supabase
      .from("B2B_SERVICES")
    
     .select(`
        *,
        DoanhNghiep:B2B_APPROVED (SoDKKD, TenDoanhNghiep),
        NguoiPhuTrach:User!NguoiPhuTrachId (id, name, username)
      `, { count: "exact" });

    if (DoanhNghiepID) query = query.eq("DoanhNghiepID", DoanhNghiepID);

    const { data, count, error } = await query
      .order("STT", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const formattedData = data.map(item => ({
      ID: item.STT,
      DoanhNghiepID: item.DoanhNghiepID,
      SoDKKD: item.DoanhNghiep?.SoDKKD || "", 
      TenDoanhNghiep: item.DoanhNghiep?.TenDoanhNghiep || "",
      DanhMuc: item.DanhMuc,
      MaDichVu: item.ServiceID,
      LoaiDichVu: item.LoaiDichVu,
      TenDichVu: item.TenDichVu,
      DiaChiNhan: item.DiaChiNhan || "",
      GoiDichVu: item.GoiDichVu || "", 
      YeuCauHoaDon: item.YeuCauHoaDon || "",     
      InvoiceUrl: item.InvoiceUrl || "",           
      NgayThucHien: item.NgayThucHien,
      NgayHoanThanh: item.NgayHoanThanh,
      DoanhThuTruocChietKhau: item.DoanhThuTruocChietKhau,
      MucChietKhau: item.MucChietKhau,
      SoTienChietKhau: item.SoTienChietKhau,
      DoanhThuSauChietKhau: item.DoanhThuSauChietKhau,
      TongDoanhThuTichLuy: item.TongDoanhThuTichLuy,
      Vi: item.Vi,
      ChiTietDichVu: item.ChiTietDichVu,
      NguoiPhuTrachId: item.NguoiPhuTrachId,      
      NguoiPhuTrach: item.NguoiPhuTrach || null, 
      NguoiPhuTrachName: item.NguoiPhuTrach ? item.NguoiPhuTrach.name : "",
      TrangThai: item.TrangThai
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


app.post("/api/b2b/services", async (req, res) => {
  try {
    const { 
      DoanhNghiepID, LoaiDichVu, DanhMuc, TenDichVu, NgayThucHien,
      NgayHoanThanh, YeuCauHoaDon, InvoiceUrl, 
      GhiChu, NguoiPhuTrachId, GoiDichVu,
      DoanhThuTruocChietKhau, Vi, MucChietKhau,
      approveAction, userId, ChiTietDichVu, 
      TrangThai 
    } = req.body;

    if (!DoanhNghiepID || !LoaiDichVu) {
      return res.status(400).json({ success: false, message: "Thiếu dữ liệu bắt buộc" });
    }

    const dtTruoc = DoanhThuTruocChietKhau ? parseInt(DoanhThuTruocChietKhau) : 0;
    const viTien = Vi ? parseInt(Vi) : 0;
    const phanTramCK = MucChietKhau ? parseFloat(MucChietKhau) : 0; 
    const tienCK = Math.round((dtTruoc * phanTramCK) / 100);
    const dtSau = dtTruoc - tienCK - viTien;

    let finalServiceCode = null;


    let finalStatus = TrangThai; 
    

    if (approveAction === "accountant_approve") {
        if (userId) {
            const { data: userCheck } = await supabase
                .from("User")
                .select("is_director, perm_approve_b2b, is_accountant, is_admin")
                .eq("id", userId)
                .single();
            
            if (userCheck && (userCheck.is_director || userCheck.perm_approve_b2b )) {
                
                // Trừ tiền ví nếu có
                if (viTien > 0) {
                    const { data: approvedEnt } = await supabase
                        .from("B2B_APPROVED")
                        .select("SoDuVi")
                        .eq("ID", DoanhNghiepID)
                        .maybeSingle();
                    
                    const soDuHienTai = approvedEnt?.SoDuVi ?? 0;
                    if (soDuHienTai < viTien) {
                        return res.status(400).json({ success: false, message: `Số dư ví không đủ để duyệt ngay (Hiện có: ${soDuHienTai})` });
                    }
                    
                    await supabase.from("B2B_APPROVED")
                        .update({ SoDuVi: soDuHienTai - viTien })
                        .eq("ID", DoanhNghiepID);
                }

           
                finalServiceCode = await generateServiceCode(
                    supabase,
                    LoaiDichVu,
                    YeuCauHoaDon,
                    DanhMuc || ""
                );
            }
        }
    }

    // Insert vào DB
    const { data, error } = await supabase
      .from("B2B_SERVICES")
      .insert([{
        DoanhNghiepID,
        LoaiDichVu,
        DanhMuc: DanhMuc || "",
        TenDichVu: TenDichVu || "",
        DiaChiNhan: DiaChiNhan || "",
        ServiceID: finalServiceCode, 
        NgayThucHien,
        NgayHoanThanh: NgayHoanThanh || null, 
        GhiChu: GhiChu || "",
        NguoiPhuTrachId: NguoiPhuTrachId || null, 
        InvoiceUrl: InvoiceUrl || "",                 
        YeuCauHoaDon: YeuCauHoaDon || "",       
        GoiDichVu: GoiDichVu || "",    
        DoanhThuTruocChietKhau: dtTruoc, 
        MucChietKhau: phanTramCK,
        SoTienChietKhau: tienCK,
        DoanhThuSauChietKhau: dtSau, 
        Vi: viTien,
        ChiTietDichVu: ChiTietDichVu || null,
        
        TrangThai: finalStatus,
        CreatedAt: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data, newCode: finalServiceCode });

  } catch (err) {
    console.error("❌ Lỗi thêm service:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put("/api/b2b/services/update/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { 
        LoaiDichVu, 
        DanhMuc, 
        TenDichVu,
        DiaChiNhan,
        NgayThucHien, 
        NgayHoanThanh,
        DoanhThuTruocChietKhau, 
        Vi, 
        GhiChu,
        YeuCauHoaDon, 
        InvoiceUrl, 
        GoiDichVu, 
        NguoiPhuTrachId, 
        approveAction, 
        userId,
        ChiTietDichVu, 
        TrangThai
    } = req.body;

    // Lấy thông tin hiện tại
    const { data: current } = await supabase
      .from("B2B_SERVICES")
      .select("*")
      .eq("STT", id)
      .single();

    if (!current) return res.status(404).json({ success: false, message: "Không tìm thấy dịch vụ" });
    
    let finalMaDichVu = current.ServiceID;

    if (approveAction === "accountant_approve") {
      if (userId) {
         const { data: userCheck } = await supabase
            .from("User")
            .select("is_director, perm_approve_b2b")
            .eq("id", userId)
            .single();
            
          if (!userCheck || (!userCheck.is_director && !userCheck.perm_approve_b2b)) {
              return res.status(403).json({ success: false, message: "Bạn không có quyền duyệt dịch vụ B2B." });
          }
      }

      // --- TÍNH TOÁN TỪ CHI TIẾT DỊCH VỤ (ƯU TIÊN) ---
      let totalRevenueBeforeDiscount = 0;
      let totalDiscountAmount = 0;
      let totalRevenueAfterDiscount = 0;
      let mucChietKhauFinal = 0;

      // 1. NẾU CÓ ChiTietDichVu → tính từ JSON chi tiết
      if (ChiTietDichVu && ChiTietDichVu.main && ChiTietDichVu.main.revenue !== undefined) {
        console.log("📊 Tính toán từ ChiTietDichVu:", ChiTietDichVu);
        
        // Dịch vụ chính
        const mainRevenue = parseFloat(ChiTietDichVu.main.revenue) || 0;
        const mainDiscountRate = parseFloat(ChiTietDichVu.main.discount) || 0;
        const mainDiscountAmount = mainRevenue * (mainDiscountRate / 100);
        
        totalRevenueBeforeDiscount += mainRevenue;
        totalDiscountAmount += mainDiscountAmount;

        // Dịch vụ phụ
        if (ChiTietDichVu.sub && Array.isArray(ChiTietDichVu.sub)) {
          ChiTietDichVu.sub.forEach(subService => {
            const subRevenue = parseFloat(subService.revenue) || 0;
            const subDiscountRate = parseFloat(subService.discount) || 0;
            const subDiscountAmount = subRevenue * (subDiscountRate / 100);
            
            totalRevenueBeforeDiscount += subRevenue;
            totalDiscountAmount += subDiscountAmount;
          });
        }

        totalRevenueAfterDiscount = totalRevenueBeforeDiscount - totalDiscountAmount;
        
        // Lấy mức chiết khấu chính (từ dịch vụ chính)
        mucChietKhauFinal = mainDiscountRate;
      } 
      // 2. NẾU KHÔNG CÓ ChiTietDichVu → dùng dữ liệu cũ
      else {
        console.log("📊 Sử dụng dữ liệu cũ");
        totalRevenueBeforeDiscount = DoanhThuTruocChietKhau ? parseFloat(DoanhThuTruocChietKhau) : 0;
        
        // Tính chiết khấu từ hạng
        const { data: ds } = await supabase
          .from("B2B_SERVICES")
          .select("DoanhThuSauChietKhau")
          .eq("DoanhNghiepID", current.DoanhNghiepID);

        const totalCurrent = ds?.reduce((sum, i) => sum + (i.DoanhThuSauChietKhau || 0), 0) ?? 0;
        const { chietKhau } = tinhHangVaChietKhau(totalCurrent); 
        mucChietKhauFinal = chietKhau;
        
        totalDiscountAmount = totalRevenueBeforeDiscount * (mucChietKhauFinal / 100);
        totalRevenueAfterDiscount = totalRevenueBeforeDiscount - totalDiscountAmount;
      }

      // 3. Xử lý Ví
      const viMoi = Vi ? parseFloat(Vi) : 0;
      
      // Kiểm tra ví nếu approve
      if (approveAction === "accountant_approve") {
        const { data: approved } = await supabase
          .from("B2B_APPROVED")
          .select("SoDuVi")
          .eq("ID", current.DoanhNghiepID)
          .maybeSingle();

        const soDu = approved?.SoDuVi ?? 0;

        if (soDu < viMoi) {
          return res.status(400).json({ success: false, message: `Số dư ví không đủ (Hiện có: ${soDu})` });
        }

        if (viMoi > 0) {
          await supabase.from("B2B_APPROVED")
            .update({ SoDuVi: soDu - viMoi })
            .eq("ID", current.DoanhNghiepID);
        }
      }


      totalRevenueAfterDiscount = Math.max(0, totalRevenueAfterDiscount - viMoi);

      // 5. Tạo mã dịch vụ mới nếu đang duyệt
      finalMaDichVu = await generateServiceCode(
        supabase,
        LoaiDichVu || current.LoaiDichVu,
        YeuCauHoaDon || current.YeuCauHoaDon,
        DanhMuc || current.DanhMuc 
      );

     
      const { data: dsMoi } = await supabase
        .from("B2B_SERVICES")
        .select("DoanhThuSauChietKhau")
        .eq("DoanhNghiepID", current.DoanhNghiepID);
        
      const totalCurrentMoi = dsMoi?.reduce((sum, i) => sum + (i.DoanhThuSauChietKhau || 0), 0) ?? 0;
      const newTongDoanhThuTichLuy = totalCurrentMoi + totalRevenueAfterDiscount;


      req.body.DoanhThuTruocChietKhau = totalRevenueBeforeDiscount;
      req.body.DoanhThuSauChietKhau = totalRevenueAfterDiscount;
      req.body.SoTienChietKhau = totalDiscountAmount;
      req.body.MucChietKhau = mucChietKhauFinal;
      req.body.TongDoanhThuTichLuy = newTongDoanhThuTichLuy;
      
      console.log("📊 Kết quả tính toán:", {
        totalRevenueBeforeDiscount,
        totalDiscountAmount,
        totalRevenueAfterDiscount,
        mucChietKhauFinal,
        viMoi
      });
    }

  
    const updateData = {
      LoaiDichVu: LoaiDichVu || current.LoaiDichVu,
      DanhMuc: DanhMuc || current.DanhMuc,
      TenDichVu: TenDichVu || current.TenDichVu,
      DiaChiNhan: DiaChiNhan || current.DiaChiNhan,
      ServiceID: finalMaDichVu,
      NgayThucHien: NgayThucHien || current.NgayThucHien,
      NgayHoanThanh: NgayHoanThanh || current.NgayHoanThanh,
      TrangThai: TrangThai || current.TrangThai,

      DoanhThuTruocChietKhau: req.body.DoanhThuTruocChietKhau ?? current.DoanhThuTruocChietKhau,
      DoanhThuSauChietKhau: req.body.DoanhThuSauChietKhau ?? current.DoanhThuSauChietKhau,
      SoTienChietKhau: req.body.SoTienChietKhau ?? current.SoTienChietKhau,
      MucChietKhau: req.body.MucChietKhau ?? current.MucChietKhau,
      TongDoanhThuTichLuy: req.body.TongDoanhThuTichLuy ?? current.TongDoanhThuTichLuy,
      Vi: Vi !== undefined ? Vi : current.Vi, 

     
      YeuCauHoaDon: YeuCauHoaDon || current.YeuCauHoaDon,
      InvoiceUrl: InvoiceUrl || current.InvoiceUrl,    
      GoiDichVu: GoiDichVu || current.GoiDichVu,   
      GhiChu: GhiChu || current.GhiChu,
      NguoiPhuTrachId: NguoiPhuTrachId || current.NguoiPhuTrachId,
      
    
      ChiTietDichVu: ChiTietDichVu || current.ChiTietDichVu,
      
      UpdatedAt: new Date().toISOString()
    };

   

    const { data, error } = await supabase
      .from("B2B_SERVICES")
      .update(updateData)
      .eq("STT", id)
      .select()
      .single();

    if (error) throw error;
    
    res.json({ 
      success: true, 
      data, 
      newCode: finalMaDichVu 
    });

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





app.set("socketio", io);

// ==== ROUTES ====

// GET all Users
app.get("/api/User", async (req, res) => {
  try {
  
    const { data: users, error: userError } = await supabase
      .from("User")
      .select(`
        id, name, username, email, avatar, updated_at,
        is_admin, is_director, is_accountant, is_staff,
        role,
        perm_approve_b2b, perm_approve_b2c, perm_view_revenue, perm_view_staff,
        ChucDanh, PhongBan, MaVung, SoDienThoai, NgayVaoLam, LoaiHopDong, CV
      `)
      .order("id", { ascending: true });
    
    if (userError) throw userError;

   
    const { data: b2cData, error: b2cError } = await supabase
      .from("YeuCau")
      .select("NguoiPhuTrachId, DoanhThuSauChietKhau");
    
    if (b2cError) throw b2cError;

    const { data: b2bData, error: b2bError } = await supabase
      .from("B2B_SERVICES")
      .select("NguoiPhuTrachId, DoanhThuSauChietKhau");

    if (b2bError) throw b2bError;

    const enrichedUsers = users.map(user => {

      const totalB2C = b2cData
        .filter(item => item.NguoiPhuTrachId === user.id)
        .reduce((sum, item) => sum + (item.DoanhThuSauChietKhau || 0), 0);
     
      const totalB2B = b2bData
        .filter(item => item.NguoiPhuTrachId === user.id)
        .reduce((sum, item) => sum + (item.DoanhThuSauChietKhau || 0), 0);

      return {
        ...user,
        DoanhThu: totalB2C + totalB2B 
      };
    });

    res.json({ success: true, data: enrichedUsers });
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




app.put("/api/yeucau/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { 
        autoApprove,      
        ConfirmPassword, 
        ChiTietDichVu,
        SoDienThoai, 
        DoanhThuTruocChietKhau,
        MucChietKhau, 
        Vi,
        NgayBatDau,  
        NgayKetThuc,
        NguoiPhuTrach, 
        User,          
        ...restData     
    } = req.body;


    let updatePayload = { 
        ...restData, 
        SoDienThoai,
        NgayBatDau: NgayBatDau || null,
        NgayKetThuc: NgayKetThuc || null 
    }; 
  
 
    if (ChiTietDichVu || DoanhThuTruocChietKhau !== undefined) {
        let totalRevenue = 0;
        let totalDiscountAmt = 0;
        let details = ChiTietDichVu;
        
      
        if (typeof details === 'string') {
            try { details = JSON.parse(details); } catch (e) { details = null; }
        }

        if (details && details.main) {
            const mainRev = parseFloat(details.main.revenue) || 0;
            const mainDisc = parseFloat(details.main.discount) || 0;
            totalRevenue += mainRev;
            totalDiscountAmt += mainRev * (mainDisc / 100);

            if (details.sub && Array.isArray(details.sub)) {
                details.sub.forEach(sub => {
                    const subRev = parseFloat(sub.revenue) || 0;
                    const subDisc = parseFloat(sub.discount) || 0;
                    totalRevenue += subRev;
                    totalDiscountAmt += subRev * (subDisc / 100);
                });
            }
        } else if (DoanhThuTruocChietKhau !== undefined) {
            totalRevenue = parseFloat(DoanhThuTruocChietKhau) || 0;
            const phanTram = parseFloat(MucChietKhau) || 0;
            totalDiscountAmt = (totalRevenue * phanTram) / 100;
        }

        const currentNetRevenue = totalRevenue - totalDiscountAmt; 


        let targetPhone = SoDienThoai;
        if (!targetPhone) {
             const { data: current } = await supabase.from("YeuCau").select("SoDienThoai").eq("YeuCauID", id).single();
             targetPhone = current?.SoDienThoai;
        }

        if (targetPhone) {
            const { data: historyData } = await supabase
                .from("YeuCau")
                .select("DoanhThuSauChietKhau")
                .eq("SoDienThoai", targetPhone)
                .neq("YeuCauID", id); 

            const historyTotal = historyData?.reduce((sum, item) => sum + (item.DoanhThuSauChietKhau || 0), 0) ?? 0;
            updatePayload.TongDoanhThuTichLuy = historyTotal + currentNetRevenue;
        }

        updatePayload.ChiTietDichVu = details;
        updatePayload.DoanhThuTruocChietKhau = totalRevenue;
        updatePayload.SoTienChietKhau = totalDiscountAmt;
        updatePayload.DoanhThuSauChietKhau = currentNetRevenue;
        updatePayload.MucChietKhau = totalRevenue > 0 ? (totalDiscountAmt / totalRevenue * 100) : 0;
    }

    
    for (const key of Object.keys(updatePayload)) {
      if (updatePayload[key] === "") updatePayload[key] = null;
    }

  
    if (updatePayload.NguoiPhuTrachId && String(updatePayload.NguoiPhuTrachId).trim() !== "") {
        updatePayload.NguoiPhuTrachId = parseInt(updatePayload.NguoiPhuTrachId);
    } else {
        updatePayload.NguoiPhuTrachId = null;
    }

    // 4. Perform Update
    const { error: updateError } = await supabase
      .from("YeuCau")
      .update(updatePayload)
      .eq("YeuCauID", id);

    if (updateError) throw updateError;

    // 5. Return updated data
    const { data } = await supabase
      .from("YeuCau")
      .select(`*, ChiTietDichVu, NguoiPhuTrach:User!YeuCau_NguoiPhuTrachId_fkey(id, name)`)
      .eq("YeuCauID", id)
      .single();

    res.json({ success: true, data });

  } catch (err) {
    console.error("❌ Update Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/b2b/reject", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Lấy dữ liệu từ bảng B2B_REJECTED
    const { data, count, error } = await supabase
      .from("B2B_REJECTED")
      .select("*", { count: "exact" })
      .order("ID", { ascending: true }) // Sắp xếp mới nhất lên đầu
      .range(from, to);

    if (error) throw error;

    res.json({ 
      success: true, 
      data, 
      total: count, 
      page, 
      totalPages: Math.ceil(count / limit) 
    });
  } catch (err) {
    console.error("❌ Lỗi lấy danh sách B2B_REJECTED:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});


app.get("/api/vendors", async (req, res) => {
  try {
    
    const { data, error } = await supabase
      .from("Vendor") 
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


app.post("/api/vendors", async (req, res) => {
  try {
 
    const { 
      TenVendor, SoDKKD, DiaChi, DauMoi, 
      MaVung, SoDienThoai, Email, Service, GhiChu 
    } = req.body;

    if (!TenVendor) return res.status(400).json({ success: false, message: "Tên Vendor là bắt buộc" });

    const { data, error } = await supabase
      .from("Vendor")
      .insert([{
        TenVendor, 
        SoDKKD, 
        DiaChi, 
        DauMoi, 
        MaVung, 
        SoDienThoai, 
        Email, 
        Service, 
        GhiChu
      }])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, message: "Thêm vendor thành công", data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


app.put("/api/vendors/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      TenVendor, SoDKKD, DiaChi, DauMoi, 
      MaVung, SoDienThoai, Email, Service, GhiChu 
    } = req.body;

    const { data, error } = await supabase
      .from("Vendor")
      .update({
        TenVendor, 
        SoDKKD, 
        DiaChi, 
        DauMoi, 
        MaVung, 
        SoDienThoai, 
        Email, 
        Service, 
        GhiChu
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, message: "Cập nhật thành công", data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


app.delete("/api/vendors/:id", async (req, res) => {
  try {
    const { id } = req.params;
    // Sửa tên bảng thành Vendor
    const { error } = await supabase.from("Vendor").delete().eq("id", id);
    if (error) throw error;
    res.json({ success: true, message: "Đã xóa vendor" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


app.get("/api/yeucau", async (req, res) => {
  try {
    const { 
      userId, 
      is_admin, 
      is_staff,       
      is_director,    
      is_accountant,  
      page = 1, 
      limit = 20 
    } = req.query;

    console.log("📥 Fetching YeuCau | userId:", userId, "Roles:", { is_admin, is_staff });

    const hasRole = (val) => val === true || val === "true";


    const canViewAll = 
      hasRole(is_admin) || 
      hasRole(is_director) || 
      hasRole(is_accountant);

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const from = (pageNum - 1) * pageLimit;
    const to = from + pageLimit - 1;


    let query = supabase
      .from("YeuCau")
      .select(
        `*, ChiTietDichVu, NguoiPhuTrach:User!YeuCau_NguoiPhuTrachId_fkey(id, name, username, email)`,
        { count: "exact" }
      )
      .order("YeuCauID", { ascending: false }) 
      .range(from, to);

   
    if (!canViewAll && userId) {
      query = query.eq("NguoiPhuTrachId", parseInt(userId, 10));
    }

    const { data, count, error } = await query;
    if (error) throw error;

 
    let revenueQuery = supabase.from("YeuCau").select("DoanhThuSauChietKhau");

    // Áp dụng CÙNG bộ lọc quyền hạn như trên
    if (!canViewAll && userId) {
      revenueQuery = revenueQuery.eq("NguoiPhuTrachId", parseInt(userId, 10));
    }

    const { data: revenueData, error: revenueError } = await revenueQuery;
    
    // Tính tổng bằng reduce
    let totalRevenueAll = 0;
    if (!revenueError && revenueData) {
      totalRevenueAll = revenueData.reduce((sum, item) => sum + (item.DoanhThuSauChietKhau || 0), 0);
    }

    const total = count ?? 0;
    const totalPages = Math.ceil(total / pageLimit);

    res.json({
      success: true,
      data: data, 
      total,
      totalPages,
      currentPage: pageNum,
      perPage: pageLimit,
      totalRevenue: totalRevenueAll,
    });
  } catch (err) {
    console.error("❌ Lỗi khi lấy danh sách YeuCau:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});
app.post("/api/upload-b2b-doc", uploadDocs.array("files", 10), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: "Vui lòng chọn ít nhất 1 file" });
    }

    const uploadedUrls = [];

    for (const file of files) {
      // Tạo tên file unique (giữ nguyên tên gốc để dễ nhìn, thêm timestamp)
      // Chuyển tên file sang không dấu để tránh lỗi Supabase
      const originalName = getInitials(file.originalname) || "file"; 
      const fileExt = file.originalname.split(".").pop();
      const fileName = `doc_${Date.now()}_${Math.round(Math.random() * 1000)}.${fileExt}`;

      // Upload vào bucket "hosob2b"
      // LƯU Ý: Bạn cần tạo bucket "hosob2b" trên Supabase và set Public
      const { error } = await supabase.storage
        .from("hosob2b") 
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (error) throw error;

      // Lấy Public URL
      const { data: publicUrlData } = supabase.storage
        .from("hosob2b")
        .getPublicUrl(fileName);

      if (publicUrlData && publicUrlData.publicUrl) {
        uploadedUrls.push({
            name: file.originalname,
            url: publicUrlData.publicUrl,
            type: file.mimetype
        });
      }
    }

    res.json({ 
      success: true, 
      message: "Upload hồ sơ thành công", 
      data: uploadedUrls 
    });

  } catch (err) {
    console.error("❌ Lỗi upload Hồ sơ B2B:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});
app.post("/api/verify-password", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Thiếu thông tin xác thực" });
    }

    // 1. Lấy hash mật khẩu từ DB
    const { data, error } = await supabase
      .from("User")
      .select("password_hash")
      .eq("username", username)
      .maybeSingle();

    if (error || !data) {
  
      return res.json({ success: false, message: "User không tồn tại" });
    }


    const match = await bcrypt.compare(password, data.password_hash);
    if (!match) {

      return res.json({ success: false, message: "Mật khẩu không chính xác" });
    }

    // 3. Trả về thành công
    res.json({ success: true, message: "Xác thực thành công" });

  } catch (err) {
    console.error("Lỗi verify-password:", err);
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
      LoaiDichVu,
      NoiDung,
      ChonNgay,
      Gio
    } = req.body;

    console.log("Nhận yêu cầu tư vấn từ khách hàng:", req.body);

    if (!LoaiDichVu || !HoTen || !MaVung || !SoDienThoai) {
      return res.status(400).json({ success: false, message: "Thiếu dữ liệu bắt buộc" });
    }
    
    const viLoaiDichVu = translateServiceName(LoaiDichVu);
    const viCoSo = translateBranchName(CoSoTuVan);

    let insertData = {
      TenDichVu,
      CoSoTuVan: viCoSo || null,
      TenHinhThuc,
      HoTen,
      MaVung,
      SoDienThoai,
      LoaiDichVu: viLoaiDichVu,
      Email: Email || null,
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

    await sendNotificationToApprovers(fullRecord);

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

    const { 
        autoApprove, 
        currentUserId, 
        ConfirmPassword,
        DoanhThuTruocChietKhau, 
        MucChietKhau, 
        ChiTietDichVu,
        NgayBatDau, 
        NgayKetThuc,
        ...restData 
    } = req.body;

    let newRequestData = { ...restData, ChiTietDichVu,NgayBatDau: NgayBatDau || null, 
        NgayKetThuc: NgayKetThuc || null };

    console.log("[CMS] Tạo yêu cầu mới. AutoApprove:", autoApprove);

    // Xử lý dữ liệu rỗng
    for (const key of Object.keys(newRequestData)) {
      if (newRequestData[key] === "" || newRequestData[key] === undefined) {
        newRequestData[key] = null;
      }
    }
    
    if (newRequestData.NguoiPhuTrachId) {
      newRequestData.NguoiPhuTrachId = parseInt(newRequestData.NguoiPhuTrachId, 10) || null;
    }
 
    if (!newRequestData.NgayTao) newRequestData.NgayTao = new Date().toISOString();
    if (autoApprove === true || autoApprove === "true") {
        // a. Tính toán tài chính
        const dtTruoc = parseInt(DoanhThuTruocChietKhau) || 0;
        const phanTram = parseFloat(MucChietKhau) || 0;
        
        const tienChietKhau = Math.round((dtTruoc * phanTram) / 100);
        
      
        const dtSau = dtTruoc - tienChietKhau; 

        
        const newCode = await generateB2CServiceCode(
            supabase, 
            newRequestData.LoaiDichVu, 
            newRequestData.Invoice || newRequestData.YeuCauHoaDon, 
            newRequestData.DanhMuc
        );

  
        newRequestData.MaHoSo = newCode;
        newRequestData.DoanhThuTruocChietKhau = dtTruoc;
        newRequestData.MucChietKhau = phanTram;
        newRequestData.SoTienChietKhau = tienChietKhau;
        newRequestData.DoanhThuSauChietKhau = dtSau;
        
        if (!newRequestData.NguoiPhuTrachId && currentUserId) {
            newRequestData.NguoiPhuTrachId = parseInt(currentUserId);
        }
    } else {
        // Nếu không auto approve thì reset về 0
        newRequestData.DoanhThuTruocChietKhau = 0;
        newRequestData.DoanhThuSauChietKhau = 0;
        newRequestData.SoTienChietKhau = 0;
        newRequestData.MucChietKhau = 0;
    }

    // 4. Insert vào DB
    const { data, error } = await supabase
      .from("YeuCau")
      .insert([newRequestData])
      .select()
      .single();

    if (error) throw error;

    console.log("✅ [CMS] Yêu cầu tạo thành công:", data.MaHoSo ? `Mã: ${data.MaHoSo}` : "Chưa cấp mã");

    res.json({
      success: true,
      data: data,
      message: (autoApprove === true || autoApprove === "true") 
        ? `Đăng ký & Cấp mã thành công: ${data.MaHoSo}` 
        : "Đăng ký dịch vụ mới thành công",
    });

  } catch (err) {
    console.error("❌ [CMS] Lỗi khi thêm yêu cầu:", err);
    res.status(500).json({ success: false, message: "Lỗi Server: " + err.message });
  }
});
app.get("/api/doanhthu", async (req, res) => {
  try {
    const { userId } = req.query;

    // 🔍 Lấy thông tin user (Cần thêm perm_view_revenue vào select)
    const { data: userData, error: userError } = await supabase
      .from("User")
      .select("id, username, is_admin, is_accountant, is_director, perm_view_revenue") 
      .eq("id", userId)
      .maybeSingle();

    if (userError) throw userError;
    if (!userData)
      return res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });

    const { is_accountant, is_director, perm_view_revenue } = userData;
    if (!is_accountant && !is_director && !perm_view_revenue) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền truy cập doanh thu"
      });
    }

    console.log("✅ Quyền hợp lệ:", { is_accountant, is_director, perm_view_revenue });

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


    const sessionToken = crypto.randomBytes(32).toString("hex");

  
    const { error: updateError } = await supabase
      .from("User")
      .update({ session_token: sessionToken })
      .eq("id", user.id);

    if (updateError) throw updateError;
    // ----------------------------------------------

    const userInfo = { 
      id: user.id, 
      name: user.name,
      username: user.username, 
      email: user.email, 
      is_admin: user.is_admin || false,
      is_accountant: user.is_accountant || false,
      is_director: user.is_director || false,
      is_staff: user.is_staff || false,
      avatar: user.avatar,
      perm_approve_b2b: user.perm_approve_b2b || false,
      perm_approve_b2c: user.perm_approve_b2c || false,
      perm_view_revenue: user.perm_view_revenue || false,
      perm_view_staff: user.perm_view_staff || false
    };

    // Trả về thêm session_token
    res.json({
      success: true,
      user: userInfo,
      token: sessionToken // Gửi token về cho client lưu
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
        "기타": "Bài viết",
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
// ================== TIN TỨC (NEWS) API ==================
// GET all news
app.get("/api/tintuc", async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "" } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    let query = supabase
      .from("TinTuc")
      .select("*", { count: "exact" });

    // Search by title (Vietnamese or Korean)
    if (search && search.trim()) {
      query = query.or(`TieuDeVN.ilike.%${search}%,TieuDeKR.ilike.%${search}%,DanhMuc.ilike.%${search}%`);
    }

    const { data, count, error } = await query
      .order("ID", { ascending: false })
      .range(from, to);

    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
      total: count || 0,
      page: pageNum,
      totalPages: Math.ceil((count || 0) / limitNum)
    });
  } catch (err) {
    console.error("❌ Lỗi lấy danh sách tin tức:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST new news
app.post("/api/tintuc", async (req, res) => {
  try {
    console.log("📝 [POST /api/tintuc] Nhận request:", req.body);
    
    const {
      TieuDeVN,
      TieuDeKR,
      DanhMuc,
      TacGia,
      NgayXuatBan,
      UrlHinhAnh,
      NoiDungVN,
      NoiDungKR
    } = req.body;

    console.log("🔍 Kiểm tra dữ liệu:", { TieuDeVN, TieuDeKR, NoiDungVN, NoiDungKR });

    // Validation
    if (!TieuDeVN || !TieuDeKR || !NoiDungVN || !NoiDungKR) {
      console.error("❌ Validation failed - Missing required fields");
      return res.status(400).json({
        success: false,
        message: "Vui lòng điền đầy đủ các trường bắt buộc (Tiêu đề VN, Tiêu đề KR, Nội dung VN, Nội dung KR)"
      });
    }

    const { data, error } = await supabase
      .from("TinTuc")
      .insert([
        {
          TieuDeVN: TieuDeVN.trim(),
          TieuDeKR: TieuDeKR.trim(),
          DanhMuc: DanhMuc || "",
          TacGia: TacGia || "",
          NgayXuatBan: NgayXuatBan || new Date().toISOString().split("T")[0],
          UrlHinhAnh: UrlHinhAnh || "",
          NoiDungVN: NoiDungVN.trim(),
          NoiDungKR: NoiDungKR.trim(),
          NgayTao: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) {
      console.error("❌ Supabase error:", error);
      throw error;
    }

    console.log("✅ Tin tức được tạo thành công:", data);

    try {
      io.emit("news-changed", { action: "create", data });
    } catch (emitErr) {
      console.error("⚠️ Không emit được news-changed (create):", emitErr);
    }

    res.json({
      success: true,
      message: "Thêm tin tức thành công",
      data
    });
  } catch (err) {
    console.error("❌ Lỗi thêm tin tức:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT update news
app.put("/api/tintuc/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      TieuDeVN,
      TieuDeKR,
      DanhMuc,
      TacGia,
      NgayXuatBan,
      UrlHinhAnh,
      NoiDungVN,
      NoiDungKR
    } = req.body;

    console.log("📝 [PUT /api/tintuc/:id] Nhận request update:", { id, body: req.body });

    // Validation
    if (!TieuDeVN || !TieuDeKR || !NoiDungVN || !NoiDungKR) {
      console.error("❌ Validation failed - Missing required fields");
      return res.status(400).json({
        success: false,
        message: "Vui lòng điền đầy đủ các trường bắt buộc"
      });
    }

    const updateData = {
      TieuDeVN: TieuDeVN.trim(),
      TieuDeKR: TieuDeKR.trim(),
      DanhMuc: DanhMuc || "",
      TacGia: TacGia || "",
      NgayXuatBan: NgayXuatBan || new Date().toISOString().split("T")[0],
      UrlHinhAnh: UrlHinhAnh || "",
      NoiDungVN: NoiDungVN.trim(),
      NoiDungKR: NoiDungKR.trim()
    };

    console.log("📊 Update data:", updateData);

    const { data, error } = await supabase
      .from("TinTuc")
      .update(updateData)
      .eq("ID", id)
      .select()
      .single();

    if (error) {
      console.error("❌ Supabase error:", error);
      throw error;
    }

    console.log("✅ Tin tức được cập nhật thành công:", data);

    try {
      io.emit("news-changed", { action: "update", data });
    } catch (emitErr) {
      console.error("⚠️ Không emit được news-changed (update):", emitErr);
    }

    res.json({
      success: true,
      message: "Cập nhật tin tức thành công",
      data
    });
  } catch (err) {
    console.error("❌ Lỗi cập nhật tin tức:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE news
app.delete("/api/tintuc/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("TinTuc")
      .delete()
      .eq("ID", id);

    if (error) throw error;

    try {
      io.emit("news-changed", { action: "delete", id: Number(id) });
    } catch (emitErr) {
      console.error("⚠️ Không emit được news-changed (delete):", emitErr);
    }

    res.json({
      success: true,
      message: "Xóa tin tức thành công"
    });
  } catch (err) {
    console.error("❌ Lỗi xóa tin tức:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== TRANSLATION API ==========
app.post("/api/translate", async (req, res) => {
  try {
    const { text, sourceLang, targetLang } = req.body;

    if (!text || !sourceLang || !targetLang) {
      return res.status(400).json({
        success: false,
        message: "Thiếu thông tin: text, sourceLang, targetLang"
      });
    }

    // Sử dụng Google Translate API miễn phí thông qua translate-google module
    // Hoặc có thể dùng API khác như MyMemory, LibreTranslate
    const translate = require('@vitalets/google-translate-api');
    
    const result = await translate(text, { 
      from: sourceLang, 
      to: targetLang 
    });

    res.json({
      success: true,
      translatedText: result.text,
      originalText: text
    });

  } catch (err) {
    console.error("❌ Lỗi dịch:", err);
    res.status(500).json({ 
      success: false, 
      message: "Lỗi dịch văn bản: " + err.message 
    });
  }
});

// ========================================================

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
