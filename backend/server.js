const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const app = express();

// 1. ตั้งค่า CORS (ให้หน้าเว็บ Vercel คุยกับ Server ได้)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // เพิ่ม PUT เพื่อให้แก้ไขได้
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// สร้างโฟลเดอร์เก็บไฟล์
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 2. เชื่อมต่อฐานข้อมูล Supabase
const pool = new Pool({
  host: 'aws-0-ap-southeast-1.pooler.supabase.com', // ใช้ Host ของคุณ
  port: 6543,
  user: 'postgres.brrmhtplavomtxdfadds',            // ตรวจสอบ User ให้ถูก
  password: 'Hos*Esarab#159',                       // รหัสผ่านของคุณ
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    // แก้ชื่อไฟล์ภาษาไทย
    const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, Date.now() + '-' + safeName);
  }
});
const upload = multer({ storage });

// --- API Routes ---

// Login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query("SELECT id, username, fullname, department FROM users WHERE username = $1 AND password = $2", [username, password]);
        if (result.rows.length === 0) return res.status(401).send({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        res.json(result.rows[0]);
    } catch (err) { res.status(500).send(err.message); }
});

// อ่านข้อมูล
app.get('/docs/:tab', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM documents WHERE tab = $1 ORDER BY id DESC", [req.params.tab]);
        res.json(result.rows.map(r => ({ id: r.id, ...r.data, filePath: r.filePath })));
    } catch (err) { res.status(500).send(err.message); }
});

// เพิ่มข้อมูล (Create)
app.post('/docs/:tab', upload.single('file'), async (req, res) => {
    try {
        const data = JSON.parse(req.body.data || '{}');
        const filePath = req.file ? `/uploads/${req.file.filename}` : null;
        const result = await pool.query(
            "INSERT INTO documents (tab, data, \"filePath\") VALUES ($1, $2, $3) RETURNING id",
            [req.params.tab, data, filePath]
        );
        res.json({ id: result.rows[0].id, ...data, filePath });
    } catch (err) { res.status(500).send(err.message); }
});

// 🟢 แก้ไขข้อมูล (Update/PUT) - *ส่วนที่ขาดหายไป*
app.put('/docs/:tab/:id', upload.single('file'), async (req, res) => {
    try {
        const newData = JSON.parse(req.body.data || '{}');
        const id = req.params.id;
        
        // เช็คไฟล์เดิมก่อน
        const oldDoc = await pool.query("SELECT \"filePath\" FROM documents WHERE id = $1", [id]);
        let filePath = oldDoc.rows[0]?.filePath;

        // ถ้าอัปโหลดไฟล์ใหม่ ให้ใช้ไฟล์ใหม่
        if (req.file) filePath = `/uploads/${req.file.filename}`;

        // อัปเดต Database
        await pool.query(
            "UPDATE documents SET data = $1, \"filePath\" = $2 WHERE id = $3 AND tab = $4",
            [newData, filePath, id, req.params.tab]
        );
        
        res.json({ id, ...newData, filePath });
    } catch (err) { 
        console.error(err);
        res.status(500).send(err.message); 
    }
});

// ลบข้อมูล (Delete)
app.delete('/docs/:tab/:id', async (req, res) => {
    try {
        await pool.query("DELETE FROM documents WHERE id = $1 AND tab = $2", [req.params.id, req.params.tab]);
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).send(err.message); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
