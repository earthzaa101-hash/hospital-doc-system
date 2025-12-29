const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// สร้างโฟลเดอร์ uploads (ถ้าไม่มี)
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --------------------------------------------------------
// 🔗 ตั้งค่าฐานข้อมูลแบบแยกส่วน (ไม่ต้องแปลงรหัสผ่าน)
// --------------------------------------------------------
const pool = new Pool({
  host: 'aws-1-ap-southeast-1.pooler.supabase.com',  // กลับมาใช้ aws-1 ตามข้อมูลแรกของคุณ
  port: 6543,
  user: 'postgres.brrmhtplavomtxdfadds',            // ชื่อ User ต้องมี .ตามด้วย Project ID
  password: 'Hos*Esarab#159',                       // ใส่รหัสจริงที่มี # ได้เลย (ระบบจะจัดการเอง)
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

// ตรวจสอบการเชื่อมต่อ
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ ยังเชื่อมต่อไม่ได้:', err.message);
    // กรณี aws-1 ไม่ได้จริงๆ ให้ลองเปลี่ยน host เป็น 'aws-0-ap-southeast-1.pooler.supabase.com'
  } else {
    console.log('✅ เชื่อมต่อ Supabase สำเร็จแล้ว! (Time):', res.rows[0].now);
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, Date.now() + '-' + safeName);
  }
});
const upload = multer({ storage });

// --- API Routes ---

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query("SELECT id, username, fullname, department FROM users WHERE username = $1 AND password = $2", [username, password]);
        if (result.rows.length === 0) return res.status(401).send({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        res.json(result.rows[0]);
    } catch (err) { res.status(500).send(err.message); }
});

app.get('/docs/:tab', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM documents WHERE tab = $1 ORDER BY id DESC", [req.params.tab]);
        res.json(result.rows.map(r => ({ id: r.id, ...r.data, filePath: r.filePath })));
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/docs/:tab', upload.single('file'), async (req, res) => {
    const { body, params, file } = req;
    const data = JSON.parse(body.data || '{}');
    const filePath = file ? `/uploads/${file.filename}` : null;
    try {
        const result = await pool.query(
            "INSERT INTO documents (tab, data, \"filePath\") VALUES ($1, $2, $3) RETURNING id",
            [params.tab, data, filePath]
        );
        res.json({ id: result.rows[0].id, ...data, filePath });
    } catch (err) { res.status(500).send(err.message); }
});

app.delete('/docs/:tab/:id', async (req, res) => {
    try {
        await pool.query("DELETE FROM documents WHERE id = $1 AND tab = $2", [req.params.id, req.params.tab]);
        res.status(200).send({ message: 'Deleted' });
    } catch (err) { res.status(500).send(err.message); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});