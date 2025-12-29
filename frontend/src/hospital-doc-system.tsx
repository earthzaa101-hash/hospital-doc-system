import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// 🔗 แก้ลิงก์ Server ให้ถูกต้อง (ลิงก์ Backend ของคุณ)
const API = 'https://hospital-doc-system.onrender.com';

// ==================== Interfaces ====================
// (คงเดิมไว้)
interface DocumentBase { id: number; filePath?: string; createdAt?: string; [key: string]: any; }
// ... (Interfaces อื่นๆ เหมือนเดิม ไม่ต้องแก้) ...

// ==================== Constants ====================
// (สีและเมนู เหมือนเดิม)
const colors = {
  primary: '#0e7490', secondary: '#3b82f6', success: '#16a34a',
  danger: '#dc2626', bg: '#f8fafc', card: '#ffffff', text: '#334155',
  border: '#94a3b8', header: '#cbd5e1'
};
// ... (MainMenu เหมือนเดิม) ...

const formatDate = (d: string) => {
    if(!d) return '-';
    const date = new Date(d);
    if(isNaN(date.getTime())) return '-';
    return `${date.getDate()}/${date.getMonth()+1}/${date.getFullYear()+543}`;
};

// ==================== Main Component ====================
export default function HospitalDocSystem() {
  // --- State หลัก ---
  const [currentUser, setCurrentUser] = useState<any>(null); // 👤 เก็บข้อมูลคน Login
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });

  const [menuId, setMenuId] = useState<number | null>(null);
  const [tab, setTab] = useState<string>('');
  
  const [data, setData] = useState<any[]>([]);
  const [form, setForm] = useState<any>({});
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string|null>(null);

  // Search & Others
  const [activeSearchTerm, setActiveSearchTerm] = useState('');
  const [tempSearchTerm, setTempSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('subject'); 
  const [stampBalance, setStampBalance] = useState(0);

  // --- Init ---
  // เช็คว่าเคย Login ค้างไว้ไหม
  useEffect(() => {
      const savedUser = localStorage.getItem('hospital_user');
      if (savedUser) setCurrentUser(JSON.parse(savedUser));
  }, []);

  // --- Auto Refresh Data (Real-time) ---
  const loadData = useCallback(async () => {
    if(!tab) return;
    try {
        const res = await axios.get(`${API}/docs/${tab}`);
        setData(res.data || []);
    } catch(e) { console.error("Load Error:", e); }
  }, [tab]);

  useEffect(() => {
      loadData();
      // รีเฟรชข้อมูลทุก 3 วินาที (เพื่อให้เครื่องอื่นเห็นข้อมูลใหม่)
      const interval = setInterval(() => {
          if (!showForm) loadData(); 
      }, 3000);
      return () => clearInterval(interval);
  }, [loadData, showForm]);

  // --- Login / Logout Logic ---
  const handleLogin = async () => {
      try {
          // ยิงไปเช็คที่ Server
          const res = await axios.post(`${API}/login`, loginForm);
          const user = res.data;
          setCurrentUser(user);
          localStorage.setItem('hospital_user', JSON.stringify(user)); // จำการเข้าระบบไว้
          setIsLoginModalOpen(false);
          alert(`ยินดีต้อนรับ: ${user.fullname}`);
      } catch (e) {
          alert('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      }
  };

  const handleLogout = () => {
      setCurrentUser(null);
      localStorage.removeItem('hospital_user');
      setMenuId(null);
  };

  // --- Save Logic (แก้ Bug บันทึกไม่ได้) ---
  const save = async () => {
      try {
          const fd = new FormData();
          fd.append('data', JSON.stringify(form));
          if(form.file) fd.append('file', form.file);

          let url = `${API}/docs/${tab}`;
          if(editingId) url += `/${editingId}`;

          // ตรวจสอบ method: ถ้ามี editingId ให้ใช้ PUT (แก้ไข), ถ้าไม่มีใช้ POST (เพิ่ม)
          if (editingId) await axios.put(url, fd);
          else await axios.post(url, fd);

          setShowForm(false); setForm({}); setEditingId(null);
          loadData(); 
          alert('บันทึกข้อมูลสำเร็จ ✅');
      } catch(e: any) { 
          console.error(e);
          alert(`บันทึกไม่สำเร็จ: ${e.message}`); 
      }
  };

  const del = async (id: number) => {
      if(!confirm('ยืนยันลบรายการนี้?')) return;
      try {
          await axios.delete(`${API}/docs/${tab}/${id}`);
          loadData();
      } catch(e) { alert('ลบไม่สำเร็จ!'); }
  };

  // --- Render Helper ---
  const handleInput = (k: string, v: any) => setForm((p:any) => ({...p, [k]: v}));

  // ==================== UI Rendering ====================

  // 1. ถ้ายังไม่เลือกเมนู (หน้าแรก)
  if(!menuId) return (
      <div style={{padding: 40, background: colors.bg, minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center'}}>
          <div style={{width:'100%', maxWidth:1000, display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:40}}>
              <h1 style={{color: colors.primary, fontSize: 32, margin:0}}>🏥 Hospital E-Saraban</h1>
              
              {/* ปุ่ม Login / Logout */}
              {currentUser ? (
                  <div style={{display:'flex', alignItems:'center', gap:10}}>
                      <span style={{fontWeight:'bold', color:colors.primary}}>👤 {currentUser.fullname}</span>
                      <button onClick={handleLogout} style={{background:colors.danger, color:'white', padding:'8px 15px', border:'none', borderRadius:5, cursor:'pointer'}}>ออกจากระบบ</button>
                  </div>
              ) : (
                  <button onClick={()=>setIsLoginModalOpen(true)} style={{background:colors.success, color:'white', padding:'8px 20px', border:'none', borderRadius:5, cursor:'pointer', fontWeight:'bold'}}>🔒 เข้าสู่ระบบ (สำหรับเจ้าหน้าที่)</button>
              )}
          </div>

          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:20, width:'100%', maxWidth:1000}}>
              {/* เมนูหลัก */}
              {[{ id: 1, title: 'ทะเบียนจดหมายรับเข้า', icon: '📥', sub: [{ id: 'incoming-director', label: 'รับเข้า (ผอ.)' }, { id: 'incoming-general', label: 'รับเข้า (ทั่วไป)' }] },
                { id: 2, title: 'ทะเบียนส่งออก', icon: '📮', sub: [{ id: 'outgoing-mail', label: 'ไปรษณีย์ส่งออก' }] },
                { id: 3, title: 'หนังสือภายนอก', icon: '📤', sub: [{ id: 'ext-wrpk', label: 'หนังสือ รพ.' }] },
                { id: 5, title: 'ทะเบียนราษฎร์', icon: '👶', sub: [{ id: 'reg-birth', label: 'แจ้งเกิด' }, { id: 'reg-death', label: 'แจ้งตาย' }] },
                { id: 7, title: 'จองห้องประชุม', icon: '📅', sub: [{ id: 'meeting', label: 'ตารางห้องประชุม' }] }
              ].map(m => (
                  <div key={m.id} onClick={()=>{ setMenuId(m.id); if(m.sub.length) setTab(m.sub[0].id); }} 
                       style={{background: colors.card, padding: 30, borderRadius: 15, cursor:'pointer', border:`1px solid #cbd5e1`, textAlign:'center', boxShadow:'0 4px 6px -1px rgba(0,0,0,0.1)'}}>
                      <div style={{fontSize: 40, marginBottom: 10}}>{m.icon}</div>
                      <div style={{fontSize: 20, fontWeight:'bold', color: colors.text}}>{m.title}</div>
                  </div>
              ))}
          </div>

          {/* Login Modal */}
          {isLoginModalOpen && (
              <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:1000}}>
                  <div style={{background:'white', padding:30, borderRadius:10, width:350}}>
                      <h3 style={{textAlign:'center', marginTop:0}}>🔐 เข้าสู่ระบบ</h3>
                      <input placeholder="Username" value={loginForm.username} onChange={e=>setLoginForm({...loginForm, username:e.target.value})} style={{width:'100%', padding:10, marginBottom:10, boxSizing:'border-box'}} />
                      <input type="password" placeholder="Password" value={loginForm.password} onChange={e=>setLoginForm({...loginForm, password:e.target.value})} style={{width:'100%', padding:10, marginBottom:20, boxSizing:'border-box'}} />
                      <button onClick={handleLogin} style={{width:'100%', padding:10, background:colors.primary, color:'white', border:'none', borderRadius:5, cursor:'pointer'}}>Login</button>
                      <button onClick={()=>setIsLoginModalOpen(false)} style={{width:'100%', padding:10, background:'transparent', color:'#666', border:'none', marginTop:10, cursor:'pointer'}}>ยกเลิก</button>
                  </div>
              </div>
          )}
      </div>
  );

  // 2. หน้าตารางข้อมูล
  return (
    <div style={{padding: 20, background: colors.card, minHeight:'100vh'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:`2px solid ${colors.primary}`, paddingBottom:15, marginBottom:20}}>
            <div style={{display:'flex', alignItems:'center'}}>
                <button onClick={()=>setMenuId(null)} style={{background:'transparent', border:`1px solid ${colors.border}`, padding:'5px 10px', marginRight:15, borderRadius:5, cursor:'pointer'}}>⬅ หน้าหลัก</button>
                <h2 style={{margin:0, color: colors.primary}}>ระบบงานสารบรรณ</h2>
            </div>
            {/* แสดงชื่อคน Login มุมขวาบน */}
            {currentUser ? <span style={{fontWeight:'bold', color:'green'}}>✅ จนท.: {currentUser.fullname}</span> : <span style={{color:'gray'}}>👁️ มุมมองบุคคลทั่วไป (View Only)</span>}
        </div>

        {/* Action Bar */}
        <div style={{display:'flex', justifyContent:'space-between', marginBottom:20}}>
            {/* 🔒 ปุ่มเพิ่มรายการจะโชว์เฉพาะคน Login แล้วเท่านั้น */}
            {currentUser && (
                <button onClick={()=>{setShowForm(true); setEditingId(null); setForm({});}} style={{background: colors.secondary, color:'white', padding:'8px 15px', border:'none', borderRadius:5, cursor:'pointer'}}>+ เพิ่มรายการใหม่</button>
            )}
            <div style={{flexGrow:1, marginLeft:20, display:'flex', gap:10}}>
                <input placeholder="ค้นหา..." value={tempSearchTerm} onChange={e=>setTempSearchTerm(e.target.value)} onKeyDown={e=>e.key==='Enter' && setActiveSearchTerm(tempSearchTerm)} style={{padding:8, borderRadius:4, border:'1px solid #ccc', flex:1}} />
                <button onClick={()=>setActiveSearchTerm(tempSearchTerm)}>🔍</button>
            </div>
        </div>

        {/* Table - แสดงข้อมูล (คนทั่วไปเห็นได้) */}
        <table style={{width:'100%', borderCollapse:'collapse', border: `1px solid ${colors.border}`}}>
             <thead>
                 <tr style={{background: colors.header}}>
                     <th style={{padding:10, border: `1px solid ${colors.border}`}}>วันที่</th>
                     <th style={{padding:10, border: `1px solid ${colors.border}`}}>รายละเอียด / เรื่อง</th>
                     <th style={{padding:10, border: `1px solid ${colors.border}`}}>ไฟล์แนบ</th>
                     {/* 🔒 คอลัมน์จัดการ โชว์เฉพาะคน Login */}
                     {currentUser && <th style={{padding:10, border: `1px solid ${colors.border}`}}>จัดการ</th>}
                 </tr>
             </thead>
             <tbody>
                 {data.filter(d => JSON.stringify(d).toLowerCase().includes(activeSearchTerm.toLowerCase())).map((d, i) => (
                     <tr key={d.id} style={{background: i%2===0?'white':'#f8fafc'}}>
                         <td style={{padding:10, border: `1px solid ${colors.border}`}}>{formatDate(d.receiveDate || d.date || d.bookingDate || d.createdAt)}</td>
                         <td style={{padding:10, border: `1px solid ${colors.border}`}}>
                             <strong>{d.docNumber || d.receiptNumber}</strong> {d.subject || d.purpose || d.childName} <br/>
                             <span style={{fontSize:'0.85em', color:'#666'}}>{d.source || d.recipientName} {d.amount ? `(${d.amount} บาท)` : ''}</span>
                         </td>
                         <td style={{padding:10, border: `1px solid ${colors.border}`, textAlign:'center'}}>
                             {d.filePath && <button onClick={()=>setPreviewUrl(`${API}${d.filePath}`)} style={{cursor:'pointer'}}>📎 ดูไฟล์</button>}
                         </td>
                         {/* 🔒 ปุ่มแก้ไข/ลบ โชว์เฉพาะคน Login */}
                         {currentUser && (
                             <td style={{padding:10, border: `1px solid ${colors.border}`, textAlign:'center'}}>
                                 <button onClick={()=>{setForm(d); setEditingId(d.id); setShowForm(true);}} style={{marginRight:5}}>✎</button>
                                 <button onClick={()=>del(d.id)} style={{color:'red'}}>✖</button>
                             </td>
                         )}
                     </tr>
                 ))}
             </tbody>
        </table>

        {/* Modal ฟอร์มกรอกข้อมูล (เหมือนเดิม) */}
        {showForm && (
            <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center'}}>
                <div style={{background:'white', padding:20, borderRadius:8, width:500, maxHeight:'90vh', overflowY:'auto'}}>
                    <h3>{editingId ? 'แก้ไข' : 'เพิ่ม'} ข้อมูล</h3>
                    {/* (ตัวอย่างฟอร์มย่อ - ของจริงใช้ชุดเดิมได้เลย) */}
                    <div style={{marginBottom:10}}><label>วันที่</label><input type="date" value={form.date || form.receiveDate || ''} onChange={e=>handleInput(tab.includes('incoming')?'receiveDate':'date', e.target.value)} style={{width:'100%'}}/></div>
                    <div style={{marginBottom:10}}><label>เรื่อง/ชื่อ</label><input value={form.subject || form.childName || ''} onChange={e=>handleInput(tab.includes('reg')?'childName':'subject', e.target.value)} style={{width:'100%'}}/></div>
                    {/* ... ใส่ input fields อื่นๆ ตามต้องการ ... */}
                    
                    <div style={{marginBottom:10}}><label>แนบไฟล์</label><input type="file" onChange={e=>handleInput('file', e.target.files[0])}/></div>
                    
                    <div style={{display:'flex', gap:10, marginTop:20}}>
                        <button onClick={save} style={{flex:1, background:colors.primary, color:'white', padding:10, border:'none', borderRadius:5, cursor:'pointer'}}>บันทึก</button>
                        <button onClick={()=>setShowForm(false)} style={{flex:1, background:'#ddd', padding:10, border:'none', borderRadius:5, cursor:'pointer'}}>ยกเลิก</button>
                    </div>
                </div>
            </div>
        )}

        {/* File Preview Modal */}
        {previewUrl && (
            <div style={{position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.9)', zIndex: 200, display:'flex', justifyContent:'center', alignItems:'center'}}>
                <div style={{width:'80%', height:'80%', background:'white', position:'relative'}}>
                     <button onClick={()=>setPreviewUrl(null)} style={{position:'absolute', right:-10, top:-10, background:'red', color:'white', borderRadius:'50%', width:30, height:30, cursor:'pointer'}}>X</button>
                     <iframe src={previewUrl} width="100%" height="100%" />
                </div>
            </div>
        )}
    </div>
  );
}
