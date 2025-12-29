const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const app = express();

// --------------------------------------------------------
// 🔧 แก้ไขเรื่อง CORS (อนุญาตให้หน้าเว็บ Vercel เข้าถึงได้ชัวร์ๆ)
// --------------------------------------------------------
app.use(cors({
    origin: '*', // ยอมรับทุกเว็บไซต์ (แก้ปัญหา Edit ไม่ได้)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// สร้างโฟลเดอร์ uploads (ถ้าไม่มี)
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --------------------------------------------------------
// 🔗 ตั้งค่าฐานข้อมูล (เวอร์ชันที่เชื่อมต่อสำเร็จ)
// --------------------------------------------------------
const pool = new Pool({
  host: 'aws-0-ap-southeast-1.pooler.supabase.com', // ใช้ Host นี้ตามที่เคยเชื่อมต่อได้
  port: 6543,
  user: 'postgres.brrmhtplavomtxdfadds',           
  password: 'Hos*Esarab#159',                      
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

// ตรวจสอบการเชื่อมต่อเมื่อเริ่ม Server
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database Connection Failed:', err.message);
  } else {
    console.log('✅ Database Connected Successfully at:', res.rows[0].now);
  }
});

// ตั้งค่าการอัปโหลดไฟล์
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    // แก้ชื่อไฟล์ภาษาไทยให้ไม่เพี้ยน
    const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, Date.now() + '-' + safeName);
  }
});
const upload = multer({ storage });

// --- API Routes ---

// 1. Login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query("SELECT id, username, fullname, department FROM users WHERE username = $1 AND password = $2", [username, password]);
        if (result.rows.length === 0) return res.status(401).send({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        res.json(result.rows[0]);
    } catch (err) { 
        console.error(err);
        res.status(500).send(err.message); 
    }
});

// 2. Get Documents
app.get('/docs/:tab', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM documents WHERE tab = $1 ORDER BY id DESC", [req.params.tab]);
        // แปลงข้อมูลให้ Frontend ใช้งานง่าย
        res.json(result.rows.map(r => ({ id: r.id, ...r.data, filePath: r.filePath })));
    } catch (err) { 
        console.error(err);
        res.status(500).send(err.message); 
    }
});

// 3. Add Document (Create)
app.post('/docs/:tab', upload.single('file'), async (req, res) => {
    const { body, params, file } = req;
    try {
        const data = JSON.parse(body.data || '{}');
        const filePath = file ? `/uploads/${file.filename}` : null;
        
        const result = await pool.query(
            "INSERT INTO documents (tab, data, \"filePath\") VALUES ($1, $2, $3) RETURNING id",
            [params.tab, data, filePath]
        );
        res.json({ id: result.rows[0].id, ...data, filePath });
    } catch (err) { 
        console.error(err);
        res.status(500).send(err.message); 
    }
});

// 4. Update Document (Edit) - เพิ่มส่วนนี้เพื่อให้แก้ไขได้
app.put('/docs/:tab/:id', upload.single('file'), async (req, res) => {
    const { body, params, file } = req;
    try {
        const newData = JSON.parse(body.data || '{}');
        const id = params.id;

        // ดึงข้อมูลเก่ามาก่อนเพื่อดูว่ามีไฟล์เดิมไหม
        const oldDoc = await pool.query("SELECT * FROM documents WHERE id = $1", [id]);
        let filePath = oldDoc.rows[0]?.filePath;

        // ถ้ามีการอัปโหลดไฟล์ใหม่ ให้ใช้ไฟล์ใหม่
        if (file) {
            filePath = `/uploads/${file.filename}`;
        }

        // อัปเดตข้อมูลในฐานข้อมูล
        await pool.query(
            "UPDATE documents SET data = $1, \"filePath\" = $2 WHERE id = $3 AND tab = $4",
            [newData, filePath, id, params.tab]
        );

        res.json({ id, ...newData, filePath });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// 5. Delete Document
app.delete('/docs/:tab/:id', async (req, res) => {
    try {
        await pool.query("DELETE FROM documents WHERE id = $1 AND tab = $2", [req.params.id, req.params.tab]);
        res.status(200).send({ message: 'Deleted' });
    } catch (err) { 
        console.error(err);
        res.status(500).send(err.message); 
    }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
