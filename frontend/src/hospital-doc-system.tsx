import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import 'jspdf-autotable';

// 🔗 ลิงก์ Server
const API = 'https://hospital-doc-system.onrender.com';

// ==================== UI Constants ====================
const colors = {
  primary: '#1e3a8a',    // น้ำเงินเข้ม (ตามรูป Header)
  secondary: '#2563eb',  // น้ำเงินสด (ปุ่มเพิ่ม)
  success: '#16a34a',    // เขียว (Excel)
  danger: '#dc2626',     // แดง (PDF/Delete)
  bg: '#f1f5f9',         // พื้นหลังเทาอ่อน
  card: '#ffffff',
  text: '#334155',
  border: '#cbd5e1'
};

const formatDate = (d: string) => {
    if(!d) return '-';
    const date = new Date(d);
    if(isNaN(date.getTime())) return '-';
    return `${date.getDate()}/${date.getMonth()+1}/${date.getFullYear()+543}`;
};

// เมนูตามรูปภาพของคุณ
const mainMenu = [
    { id: 1, title: 'ทะเบียนรับเข้า', icon: '📥', sub: [{ id: 'incoming-director', label: 'รับเข้า (ผอ./กก.บห.)' }, { id: 'incoming-general', label: 'รับเข้า (ทั่วไป)' }] },
    { id: 2, title: 'ทะเบียนส่งออก (ปณ.)', icon: '📮', sub: [{ id: 'outgoing-mail', label: 'ทะเบียนส่งออก' }] },
    { id: 3, title: 'หนังสือภายนอก', icon: '📤', sub: [{ id: 'ext-wrpk', label: 'หนังสือ รพ.วรปก.' }, { id: 'ext-wrpk-sp', label: 'หนังสือ รพ.วรปก.สป' }] },
    { id: 4, title: 'คำสั่ง/แต่งตั้ง', icon: '📜', sub: [{ id: 'orders', label: 'คำสั่ง/แต่งตั้ง' }] },
    { id: 5, title: 'ทะเบียนราษฎร์', icon: '👶', sub: [{ id: 'reg-birth', label: 'แจ้งเกิด' }, { id: 'reg-death', label: 'แจ้งตาย' }] },
    { id: 6, title: 'คุมอากรแสตมป์', icon: '🎫', sub: [{ id: 'stamp', label: 'การ์ดคุมอากร' }] },
    { id: 7, title: 'จองห้องประชุม', icon: '📅', sub: [{ id: 'meeting', label: 'ตารางการใช้ห้อง' }] }
];

export default function HospitalDocSystem() {
  // --- User State ---
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginLoading, setLoginLoading] = useState(false);

  // --- App State ---
  const [menuId, setMenuId] = useState<number | null>(null); // null = หน้า Home Grid
  const [tab, setTab] = useState<string>('');
  
  const [data, setData] = useState<any[]>([]);
  const [form, setForm] = useState<any>({});
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string|null>(null);

  const [activeSearchTerm, setActiveSearchTerm] = useState('');
  const [tempSearchTerm, setTempSearchTerm] = useState('');

  // --- Init ---
  useEffect(() => {
      const savedUser = localStorage.getItem('hospital_user');
      if (savedUser) setCurrentUser(JSON.parse(savedUser));
  }, []);

  // --- Load Data ---
  const loadData = useCallback(async () => {
    if(!tab) return;
    try {
        const res = await axios.get(`${API}/docs/${tab}`);
        setData(res.data || []);
    } catch(e) { console.error("Load Error:", e); }
  }, [tab]);

  useEffect(() => {
      loadData();
      const interval = setInterval(() => { if (!showForm) loadData(); }, 3000);
      return () => clearInterval(interval);
  }, [loadData, showForm]);

  // --- Login Logic (แก้ Bug กดแล้วนิ่ง) ---
  const handleLogin = async (e?: React.FormEvent) => {
      if(e) e.preventDefault(); // 🟢 ป้องกันรีเฟรชหน้า
      setLoginLoading(true);
      try {
          // alert("กำลังเชื่อมต่อ Server..."); // เอาออกได้ถ้าไม่อยากให้เด้ง
          const res = await axios.post(`${API}/login`, loginForm);
          const user = res.data;
          setCurrentUser(user);
          localStorage.setItem('hospital_user', JSON.stringify(user));
          setIsLoginModalOpen(false);
          setLoginForm({ username: '', password: '' });
          alert(`ยินดีต้อนรับ: ${user.fullname} ✅`);
      } catch (err: any) {
          console.error(err);
          alert(`เข้าสู่ระบบไม่สำเร็จ: ${err.response?.data?.error || 'เชื่อมต่อ Server ไม่ได้'}`);
      } finally {
          setLoginLoading(false);
      }
  };

  const handleLogout = () => {
      if(confirm('ยืนยันออกจากระบบ?')) {
          setCurrentUser(null);
          localStorage.removeItem('hospital_user');
      }
  };

  const handleInput = (k: string, v: any) => setForm((p:any) => ({...p, [k]: v}));

  // --- Save / Delete ---
  const save = async () => {
      try {
          const fd = new FormData();
          fd.append('data', JSON.stringify(form));
          if(form.file) fd.append('file', form.file);

          let url = `${API}/docs/${tab}`;
          if(editingId) url += `/${editingId}`;

          if (editingId) await axios.put(url, fd);
          else await axios.post(url, fd);

          setShowForm(false); setForm({}); setEditingId(null);
          loadData(); 
          alert('บันทึกข้อมูลสำเร็จ ✅');
      } catch(e: any) { alert(`บันทึกไม่สำเร็จ: ${e.message}`); }
  };

  const del = async (id: number) => {
      if(!confirm('ยืนยันลบรายการนี้?')) return;
      try {
          await axios.delete(`${API}/docs/${tab}/${id}`);
          loadData();
      } catch(e) { alert('ลบไม่สำเร็จ!'); }
  };

  // ==================== Render Views ====================

  // 1. หน้า Login Modal (แสดงเมื่อกดปุ่ม Login หรือ isLoginModalOpen = true)
  const renderLoginModal = () => (
      <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:2000}}>
          <form onSubmit={handleLogin} style={{background:'white', padding:30, borderRadius:10, width:350, boxShadow:'0 4px 20px rgba(0,0,0,0.2)'}}>
              <h3 style={{textAlign:'center', color: colors.primary, marginTop:0}}>🔐 เข้าสู่ระบบ (เจ้าหน้าที่)</h3>
              <div style={{marginBottom:15}}>
                  <label>Username</label>
                  <input autoFocus value={loginForm.username} onChange={e=>setLoginForm({...loginForm, username:e.target.value})} style={{width:'100%', padding:10, marginTop:5, border:'1px solid #ccc', borderRadius:5}} />
              </div>
              <div style={{marginBottom:20}}>
                  <label>Password</label>
                  <input type="password" value={loginForm.password} onChange={e=>setLoginForm({...loginForm, password:e.target.value})} style={{width:'100%', padding:10, marginTop:5, border:'1px solid #ccc', borderRadius:5}} />
              </div>
              <button type="submit" disabled={loginLoading} style={{width:'100%', padding:12, background: loginLoading ? '#ccc' : colors.primary, color:'white', border:'none', borderRadius:5, cursor:'pointer', fontSize:16}}>
                  {loginLoading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
              </button>
              <button type="button" onClick={()=>setIsLoginModalOpen(false)} style={{width:'100%', padding:10, background:'transparent', color:'#666', border:'none', marginTop:10, cursor:'pointer'}}>ยกเลิก</button>
          </form>
      </div>
  );

  // 2. หน้า Home (Grid Menu) - ตามรูป 1000077782.jpg
  if(!menuId) return (
      <div style={{padding: 20, background: colors.bg, minHeight:'100vh', fontFamily:'Sarabun, sans-serif'}}>
          {isLoginModalOpen && renderLoginModal()}
          
          <div style={{display:'flex', justifyContent:'center', alignItems:'center', marginBottom:30, position:'relative'}}>
               <h1 style={{color: '#1e293b', fontSize: 28, margin:0}}>🏥 Hospital E-Saraban System</h1>
               <div style={{position:'absolute', right:0}}>
                   {currentUser ? (
                       <div style={{textAlign:'right'}}>
                           <span style={{color:'green', fontWeight:'bold', marginRight:10}}>👤 {currentUser.fullname}</span>
                           <button onClick={handleLogout} style={{background: colors.danger, color:'white', border:'none', padding:'5px 10px', borderRadius:5, cursor:'pointer'}}>Logout</button>
                       </div>
                   ) : (
                       <button onClick={()=>setIsLoginModalOpen(true)} style={{background:'white', border:'1px solid #ccc', padding:'5px 10px', borderRadius:5, cursor:'pointer'}}>🔐 Login</button>
                   )}
               </div>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:25, maxWidth:1200, margin:'0 auto'}}>
              {mainMenu.map(m => (
                  <div key={m.id} onClick={()=>{ setMenuId(m.id); if(m.sub.length) setTab(m.sub[0].id); }} 
                       style={{background: 'white', padding: 40, borderRadius: 15, cursor:'pointer', border:'1px solid #e2e8f0', textAlign:'center', boxShadow:'0 2px 5px rgba(0,0,0,0.05)', transition:'transform 0.2s', height:180, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center'}}>
                      <div style={{fontSize: 50, marginBottom: 15}}>{m.icon}</div>
                      <div style={{fontSize: 20, fontWeight:'bold', color: '#334155'}}>{m.title}</div>
                  </div>
              ))}
          </div>
      </div>
  );

  // 3. หน้า Table Data (เมื่อกดเลือกเมนูแล้ว) - ตามรูป 1000077783.jpg
  const currentMenu = mainMenu.find(m => m.id === menuId);

  return (
    <div style={{padding: 20, background: colors.bg, minHeight:'100vh', fontFamily:'Sarabun, sans-serif'}}>
        {isLoginModalOpen && renderLoginModal()}

        {/* Header Bar */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20}}>
            <div style={{display:'flex', alignItems:'center'}}>
                <button onClick={()=>setMenuId(null)} style={{background:'white', border:`1px solid ${colors.border}`, padding:'8px 15px', marginRight:15, borderRadius:5, cursor:'pointer', fontWeight:'bold'}}>⬅ กลับหน้าหลัก</button>
                <h2 style={{margin:0, color: '#1e293b'}}>{currentMenu?.title}</h2>
            </div>
            {currentUser && (
                <div>
                     <span style={{color:'green', fontWeight:'bold', marginRight:10}}>👤 {currentUser.fullname}</span>
                     <button onClick={handleLogout} style={{background: colors.danger, color:'white', border:'none', padding:'5px 10px', borderRadius:5, cursor:'pointer'}}>Logout</button>
                </div>
            )}
        </div>
        
        <hr style={{borderColor:'#e2e8f0', opacity:0.5, marginBottom:20}}/>

        {/* Tabs */}
        <div style={{marginBottom: 20}}>
            {currentMenu?.sub.map(s => (
                <button key={s.id} onClick={()=>setTab(s.id)} 
                        style={{padding:'10px 25px', border:'none', borderRadius:30, fontWeight:'bold', cursor:'pointer', marginRight:10,
                        background: tab===s.id ? '#1e293b' : '#cbd5e1', color: tab===s.id ? 'white' : '#475569', boxShadow: tab===s.id ? '0 4px 6px -1px rgba(0,0,0,0.2)' : 'none'}}>
                    {s.label}
                </button>
            ))}
        </div>

        {/* Action Bar (Search & Add) */}
        <div style={{background:'white', padding:15, borderRadius:10, marginBottom:20, border:'1px solid #e2e8f0', display:'flex', alignItems:'center', flexWrap:'wrap', gap:15}}>
            {/* 🟢 ปุ่มเพิ่ม: แสดงเฉพาะเจ้าหน้าที่ */}
            {currentUser ? (
                <button onClick={()=>{setShowForm(true); setEditingId(null); setForm({});}} style={{background: colors.secondary, color:'white', padding:'10px 20px', border:'none', borderRadius:5, cursor:'pointer', fontWeight:'bold', display:'flex', alignItems:'center', gap:5}}>
                    + เพิ่มรายการ
                </button>
            ) : (
                <div style={{fontStyle:'italic', color:'#64748b', padding:'5px 10px', background:'#f1f5f9', borderRadius:5}}>🔒 เข้าสู่ระบบเพื่อจัดการข้อมูล</div>
            )}

            <div style={{flexGrow:1}}></div>

            <span style={{fontWeight:'bold'}}>ค้นหาจาก:</span>
            <select style={{padding:8, borderRadius:5, border:'1px solid #ccc'}}>
                <option>เรื่อง/ชื่อ</option>
                <option>เลขที่หนังสือ</option>
            </select>
            <input placeholder="ระบุคำค้นหา..." value={tempSearchTerm} onChange={e=>setTempSearchTerm(e.target.value)} style={{padding:8, width:250, borderRadius:5, border:'1px solid #ccc'}} />
            <button onClick={()=>setActiveSearchTerm(tempSearchTerm)} style={{background:'#1e293b', color:'white', padding:'8px 15px', border:'none', borderRadius:5, cursor:'pointer'}}>🔍 ค้นหา</button>
            
            <div style={{borderLeft:'2px solid #eee', paddingLeft:15, display:'flex', gap:5}}>
                <button style={{background:colors.success, color:'white', padding:'8px 15px', border:'none', borderRadius:5}}>Excel</button>
                <button style={{background:colors.danger, color:'white', padding:'8px 15px', border:'none', borderRadius:5}}>PDF</button>
            </div>
        </div>

        {/* Table Data */}
        <div style={{background:'white', borderRadius:10, overflow:'hidden', border:'1px solid #e2e8f0', boxShadow:'0 2px 5px rgba(0,0,0,0.05)'}}>
            <table style={{width:'100%', borderCollapse:'collapse'}}>
                <thead style={{background:'#e0e7ff'}}>
                    <tr>
                        <th style={{padding:12, borderBottom:'2px solid #cbd5e1', textAlign:'left', color:'#1e3a8a'}}>ลำดับ</th>
                        <th style={{padding:12, borderBottom:'2px solid #cbd5e1', textAlign:'left', color:'#1e3a8a'}}>วันที่</th>
                        <th style={{padding:12, borderBottom:'2px solid #cbd5e1', textAlign:'left', color:'#1e3a8a'}}>รายละเอียด / เรื่อง</th>
                        <th style={{padding:12, borderBottom:'2px solid #cbd5e1', textAlign:'center', color:'#1e3a8a'}}>ไฟล์</th>
                        {/* 🟢 คอลัมน์จัดการ: แสดงเฉพาะเจ้าหน้าที่ */}
                        {currentUser && <th style={{padding:12, borderBottom:'2px solid #cbd5e1', textAlign:'center', color:'#1e3a8a'}}>จัดการ</th>}
                    </tr>
                </thead>
                <tbody>
                    {data.filter(d => JSON.stringify(d).toLowerCase().includes(activeSearchTerm.toLowerCase())).map((d, i) => (
                        <tr key={d.id} style={{background: i%2===0?'white':'#f8fafc', borderBottom:'1px solid #eee'}}>
                            <td style={{padding:12}}>{i+1}</td>
                            <td style={{padding:12}}>{formatDate(d.date || d.receiveDate || d.bookingDate || d.createdAt)}</td>
                            <td style={{padding:12}}>
                                <div style={{fontWeight:'bold'}}>{d.docNumber || d.receiptNumber}</div>
                                <div>{d.subject || d.purpose || d.childName}</div>
                                <div style={{fontSize:12, color:'#64748b'}}>{d.source ? `จาก: ${d.source}` : ''} {d.recipientName ? `ถึง: ${d.recipientName}` : ''}</div>
                            </td>
                            <td style={{padding:12, textAlign:'center'}}>
                                {d.filePath && <button onClick={()=>setPreviewUrl(`${API}${d.filePath}`)} style={{background:'none', border:'none', cursor:'pointer', fontSize:18}}>📎</button>}
                            </td>
                            {currentUser && (
                                <td style={{padding:12, textAlign:'center'}}>
                                    <button onClick={()=>{setForm(d); setEditingId(d.id); setShowForm(true);}} style={{background:'none', border:'none', cursor:'pointer', marginRight:10}}>✏️</button>
                                    <button onClick={()=>del(d.id)} style={{background:'none', border:'none', cursor:'pointer', color:'red'}}>❌</button>
                                </td>
                            )}
                        </tr>
                    ))}
                    {data.length === 0 && <tr><td colSpan={5} style={{padding:20, textAlign:'center', color:'#999'}}>ไม่พบข้อมูล</td></tr>}
                </tbody>
            </table>
        </div>

        {/* Modal Form */}
        {showForm && (
            <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:1000}}>
                <div style={{background:'white', padding:20, borderRadius:10, width:500, maxHeight:'90vh', overflowY:'auto'}}>
                    <h3 style={{marginTop:0}}>{editingId ? 'แก้ไขรายการ' : 'เพิ่มรายการใหม่'}</h3>
                    {/* Form Fields (ปรับใช้ร่วมกัน) */}
                    <div style={{marginBottom:10}}><label>วันที่</label><input type="date" value={form.date || form.receiveDate || ''} onChange={e=>handleInput(tab.includes('incoming')?'receiveDate':'date', e.target.value)} style={{width:'100%', padding:8, border:'1px solid #ccc', borderRadius:5}}/></div>
                    <div style={{marginBottom:10}}><label>เลขที่/ลำดับ</label><input value={form.docNumber || form.receiptNumber || ''} onChange={e=>handleInput('docNumber', e.target.value)} style={{width:'100%', padding:8, border:'1px solid #ccc', borderRadius:5}}/></div>
                    <div style={{marginBottom:10}}><label>เรื่อง/รายละเอียด</label><input value={form.subject || form.childName || ''} onChange={e=>handleInput('subject', e.target.value)} style={{width:'100%', padding:8, border:'1px solid #ccc', borderRadius:5}}/></div>
                    <div style={{marginBottom:10}}><label>หน่วยงาน/ผู้ส่ง/ผู้รับ</label><input value={form.source || form.recipientName || ''} onChange={e=>handleInput('source', e.target.value)} style={{width:'100%', padding:8, border:'1px solid #ccc', borderRadius:5}}/></div>
                    
                    <div style={{marginBottom:10}}>
                        <label>แนบไฟล์</label>
                        <input type="file" onChange={e => { if(e.target.files && e.target.files[0]) handleInput('file', e.target.files[0]); }} style={{marginTop:5}} />
                    </div>

                    <div style={{display:'flex', gap:10, marginTop:20}}>
                        <button onClick={save} style={{flex:1, background:colors.secondary, color:'white', padding:10, border:'none', borderRadius:5, cursor:'pointer'}}>บันทึก</button>
                        <button onClick={()=>setShowForm(false)} style={{flex:1, background:'#e2e8f0', padding:10, border:'none', borderRadius:5, cursor:'pointer'}}>ยกเลิก</button>
                    </div>
                </div>
            </div>
        )}

        {/* File Preview */}
        {previewUrl && (
            <div style={{position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.9)', zIndex: 3000, display:'flex', justifyContent:'center', alignItems:'center'}}>
                <div style={{width:'90%', height:'90%', background:'white', position:'relative'}}>
                     <button onClick={()=>setPreviewUrl(null)} style={{position:'absolute', right:-15, top:-15, background:'red', color:'white', borderRadius:'50%', width:30, height:30, cursor:'pointer', border:'2px solid white'}}>X</button>
                     <iframe src={previewUrl} width="100%" height="100%" />
                </div>
            </div>
        )}
    </div>
  );
}
