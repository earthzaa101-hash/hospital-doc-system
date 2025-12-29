import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import 'jspdf-autotable';

// 🔗 ลิงก์ Server (Backend) บน Render
// ตรวจสอบให้แน่ใจว่า Server บน Render ทำงานอยู่ (สถานะเป็นสีเขียว)
const API = 'https://hospital-doc-system.onrender.com';

// ==================== Constants & Formatters ====================
const colors = {
  primary: '#0e7490', secondary: '#3b82f6', success: '#16a34a',
  danger: '#dc2626', bg: '#f8fafc', card: '#ffffff', text: '#334155',
  border: '#94a3b8', header: '#cbd5e1'
};

const formatDate = (d: string) => {
    if(!d) return '-';
    const date = new Date(d);
    if(isNaN(date.getTime())) return '-';
    return `${date.getDate()}/${date.getMonth()+1}/${date.getFullYear()+543}`;
};

// เมนูหลัก (แสดงให้ทุกคนเห็น)
const mainMenu = [
    { id: 1, title: 'ทะเบียนจดหมายรับเข้า', icon: '📥', sub: [{ id: 'incoming-director', label: 'รับเข้า (ผอ.)' }, { id: 'incoming-general', label: 'รับเข้า (ทั่วไป)' }] },
    { id: 2, title: 'ทะเบียนส่งออก', icon: '📮', sub: [{ id: 'outgoing-mail', label: 'ไปรษณีย์ส่งออก' }] },
    { id: 3, title: 'หนังสือภายนอก', icon: '📤', sub: [{ id: 'ext-wrpk', label: 'หนังสือ รพ.' }] },
    { id: 4, title: 'คำสั่ง/ประกาศ', icon: '📜', sub: [{ id: 'orders', label: 'คำสั่งภายใน' }] },
    { id: 5, title: 'ทะเบียนราษฎร์', icon: '👶', sub: [{ id: 'reg-birth', label: 'แจ้งเกิด' }, { id: 'reg-death', label: 'แจ้งตาย' }] },
    { id: 7, title: 'จองห้องประชุม', icon: '📅', sub: [{ id: 'meeting', label: 'ตารางห้องประชุม' }] }
];

// ==================== Main Component ====================
export default function HospitalDocSystem() {
  // --- User State ---
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  // --- App State ---
  const [menuId, setMenuId] = useState<number | null>(null);
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
      // โหลดข้อมูล User เก่าที่เคย Login ไว้
      const savedUser = localStorage.getItem('hospital_user');
      if (savedUser) {
          try {
             setCurrentUser(JSON.parse(savedUser));
          } catch(e) { localStorage.removeItem('hospital_user'); }
      }
  }, []);

  // --- Load Data (Real-time) ---
  const loadData = useCallback(async () => {
    if(!tab) return;
    try {
        const res = await axios.get(`${API}/docs/${tab}`);
        setData(res.data || []);
    } catch(e) { console.error("Load Error (อาจเป็นเพราะ Server ยังไม่ตื่น):", e); }
  }, [tab]);

  useEffect(() => {
      loadData();
      const interval = setInterval(() => {
          if (!showForm) loadData(); 
      }, 3000); // Auto refresh ทุก 3 วิ
      return () => clearInterval(interval);
  }, [loadData, showForm]);

  // --- Login Logic (แก้ไขให้ Debug ง่ายขึ้น) ---
  const handleLogin = async () => {
      setLoginError('');
      try {
          console.log("กำลังส่งข้อมูล Login...", loginForm);
          const res = await axios.post(`${API}/login`, loginForm);
          
          if (res.data) {
              const user = res.data;
              setCurrentUser(user);
              localStorage.setItem('hospital_user', JSON.stringify(user));
              setIsLoginModalOpen(false);
              setLoginForm({ username: '', password: '' }); // Clear form
              alert(`ยินดีต้อนรับ: ${user.fullname}`);
          }
      } catch (e: any) {
          console.error("Login Failed:", e);
          if (e.response) {
              // Server ตอบกลับมาว่า Error
              setLoginError(`เข้าสู่ระบบไม่สำเร็จ: ${e.response.data.error || 'ชื่อ/รหัสผิด'}`);
          } else if (e.request) {
              // Server ไม่ตอบ (Render อาจจะหลับอยู่ หรือเน็ตหลุด)
              setLoginError('เชื่อมต่อ Server ไม่ได้ (รอสักครู่แล้วลองใหม่)');
          } else {
              setLoginError('เกิดข้อผิดพลาดในระบบ');
          }
      }
  };

  const handleLogout = () => {
      if(confirm('ต้องการออกจากระบบ?')) {
          setCurrentUser(null);
          localStorage.removeItem('hospital_user');
          // ไม่ต้อง setMenuId(null) เพื่อให้ดูข้อมูลต่อได้ในฐานะคนทั่วไป
      }
  };

  const handleInput = (k: string, v: any) => setForm((p:any) => ({...p, [k]: v}));

  // --- CRUD Actions ---
  const save = async () => {
      if(!currentUser) return alert("กรุณา Login ก่อนทำรายการ");
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
      } catch(e: any) { 
          alert(`บันทึกไม่สำเร็จ: ${e.message}`); 
      }
  };

  const del = async (id: number) => {
      if(!currentUser) return;
      if(!confirm('ยืนยันลบรายการนี้?')) return;
      try {
          await axios.delete(`${API}/docs/${tab}/${id}`);
          loadData();
      } catch(e) { alert('ลบไม่สำเร็จ!'); }
  };

  // ==================== Render UI ====================
  
  // ส่วน Header (แสดงตลอดเวลา)
  const renderHeader = () => (
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:30, borderBottom:`1px solid ${colors.border}`, paddingBottom:15}}>
          <div>
              <h1 style={{color: colors.primary, fontSize: 24, margin:0}}>🏥 ระบบงานสารบรรณ (Hospital E-Saraban)</h1>
              <span style={{fontSize:14, color:'#666'}}>ระบบสืบค้นและจัดเก็บเอกสารออนไลน์</span>
          </div>
          
          <div>
              {currentUser ? (
                  <div style={{display:'flex', alignItems:'center', gap:10}}>
                      <div style={{textAlign:'right'}}>
                          <div style={{fontWeight:'bold', color:colors.success}}>👤 {currentUser.fullname}</div>
                          <div style={{fontSize:12, color:'#666'}}>สถานะ: เจ้าหน้าที่ (แก้ไขได้)</div>
                      </div>
                      <button onClick={handleLogout} style={{background:colors.danger, color:'white', padding:'8px 15px', border:'none', borderRadius:5, cursor:'pointer'}}>Logout</button>
                  </div>
              ) : (
                  <div style={{display:'flex', alignItems:'center', gap:10}}>
                      <div style={{fontSize:12, color:'#666', textAlign:'right'}}>สถานะ: บุคคลทั่วไป<br/>(ดูได้อย่างเดียว)</div>
                      <button onClick={()=>setIsLoginModalOpen(true)} style={{background:colors.primary, color:'white', padding:'8px 20px', border:'none', borderRadius:5, cursor:'pointer', fontWeight:'bold'}}>🔒 Login เจ้าหน้าที่</button>
                  </div>
              )}
          </div>
      </div>
  );

  // 1. หน้า Dashboard เมนูหลัก (ถ้ายังไม่ได้เลือกเมนู)
  if(!menuId) return (
      <div style={{padding: 30, background: colors.bg, minHeight:'100vh', fontFamily:'sans-serif'}}>
          {renderHeader()}
          
          <div style={{textAlign:'center', marginBottom:20, color:'#64748b'}}>เลือกรายการที่ต้องการดูข้อมูล</div>
          
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:20}}>
              {mainMenu.map(m => (
                  <div key={m.id} onClick={()=>{ setMenuId(m.id); if(m.sub.length) setTab(m.sub[0].id); }} 
                       style={{background: colors.card, padding: 30, borderRadius: 15, cursor:'pointer', border:`1px solid #cbd5e1`, textAlign:'center', boxShadow:'0 4px 6px -1px rgba(0,0,0,0.1)', transition:'transform 0.2s'}}>
                      <div style={{fontSize: 40, marginBottom: 10}}>{m.icon}</div>
                      <div style={{fontSize: 18, fontWeight:'bold', color: colors.text}}>{m.title}</div>
                      <div style={{fontSize: 14, color: '#94a3b8', marginTop:5}}>คลิกเพื่อดูข้อมูล</div>
                  </div>
              ))}
          </div>

          {/* Modal Login */}
          {isLoginModalOpen && (
              <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:1000}}>
                  <div style={{background:'white', padding:30, borderRadius:10, width:350, boxShadow:'0 10px 25px rgba(0,0,0,0.2)'}}>
                      <h3 style={{textAlign:'center', marginTop:0, color:colors.primary}}>🔐 เข้าสู่ระบบเจ้าหน้าที่</h3>
                      
                      {loginError && <div style={{background:'#fee2e2', color:'#b91c1c', padding:10, borderRadius:5, marginBottom:10, fontSize:14}}>{loginError}</div>}
                      
                      <div style={{marginBottom:10}}>
                          <label style={{fontSize:14, fontWeight:'bold'}}>Username</label>
                          <input value={loginForm.username} onChange={e=>setLoginForm({...loginForm, username:e.target.value})} style={{width:'100%', padding:10, marginTop:5, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}} />
                      </div>
                      <div style={{marginBottom:20}}>
                          <label style={{fontSize:14, fontWeight:'bold'}}>Password</label>
                          <input type="password" value={loginForm.password} onChange={e=>setLoginForm({...loginForm, password:e.target.value})} style={{width:'100%', padding:10, marginTop:5, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}} />
                      </div>
                      
                      <button onClick={handleLogin} style={{width:'100%', padding:12, background:colors.primary, color:'white', border:'none', borderRadius:5, cursor:'pointer', fontWeight:'bold', fontSize:16}}>เข้าสู่ระบบ</button>
                      <button onClick={()=>setIsLoginModalOpen(false)} style={{width:'100%', padding:10, background:'transparent', color:'#666', border:'none', marginTop:10, cursor:'pointer'}}>ยกเลิก</button>
                  </div>
              </div>
          )}
      </div>
  );

  // 2. หน้าตารางข้อมูล (เมื่อเลือกเมนูแล้ว)
  const currentMenu = mainMenu.find(m => m.id === menuId);

  return (
    <div style={{padding: 20, background: colors.card, minHeight:'100vh', fontFamily:'sans-serif'}}>
        {/* Header ย่อ */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:`2px solid ${colors.primary}`, paddingBottom:15, marginBottom:20}}>
            <div style={{display:'flex', alignItems:'center'}}>
                <button onClick={()=>setMenuId(null)} style={{background:'#f1f5f9', border:`1px solid ${colors.border}`, padding:'8px 15px', marginRight:15, borderRadius:5, cursor:'pointer', fontWeight:'bold'}}>⬅ กลับเมนูหลัก</button>
                <h2 style={{margin:0, color: colors.primary}}>{currentMenu?.icon} {currentMenu?.title}</h2>
            </div>
            {currentUser ? (
                 <div style={{textAlign:'right'}}>
                     <span style={{fontWeight:'bold', color:colors.success}}>👤 {currentUser.fullname}</span>
                     <button onClick={handleLogout} style={{marginLeft:10, fontSize:12, color:'red', background:'none', border:'none', cursor:'pointer', textDecoration:'underline'}}>Logout</button>
                 </div>
            ) : (
                 <button onClick={()=>setIsLoginModalOpen(true)} style={{background:colors.primary, color:'white', padding:'5px 15px', border:'none', borderRadius:5, cursor:'pointer', fontSize:14}}>🔐 Login</button>
            )}
        </div>

        {/* Sub Tabs */}
        <div style={{marginBottom: 20, display:'flex', gap:10, overflowX:'auto'}}>
            {currentMenu?.sub.map(s => (
                <button key={s.id} onClick={()=>setTab(s.id)} 
                        style={{padding:'8px 20px', border:'none', borderRadius:20, fontWeight:'bold', cursor:'pointer',
                        background: tab===s.id ? colors.primary : '#e2e8f0', color: tab===s.id ? 'white' : colors.text}}>
                    {s.label}
                </button>
            ))}
        </div>

        {/* Action Bar */}
        <div style={{display:'flex', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10}}>
            <div>
                {/* 🔒 ปุ่มเพิ่มรายการ: แสดงเฉพาะตอน Login แล้วเท่านั้น */}
                {currentUser ? (
                    <button onClick={()=>{setShowForm(true); setEditingId(null); setForm({});}} style={{background: colors.secondary, color:'white', padding:'10px 20px', border:'none', borderRadius:5, cursor:'pointer', boxShadow:'0 2px 4px rgba(0,0,0,0.1)'}}>
                        + เพิ่มรายการใหม่
                    </button>
                ) : (
                    <span style={{color:'#64748b', fontStyle:'italic', padding:'5px 0'}}>เข้าสู่ระบบเพื่อ เพิ่ม/แก้ไข ข้อมูล</span>
                )}
            </div>
            
            <div style={{display:'flex', gap:5}}>
                <input placeholder="ค้นหาข้อมูล..." value={tempSearchTerm} onChange={e=>setTempSearchTerm(e.target.value)} onKeyDown={e=>e.key==='Enter' && setActiveSearchTerm(tempSearchTerm)} style={{padding:8, borderRadius:4, border:'1px solid #ccc', width:200}} />
                <button onClick={()=>setActiveSearchTerm(tempSearchTerm)} style={{cursor:'pointer', padding:'8px 15px', background:'#cbd5e1', border:'none', borderRadius:4}}>🔍</button>
            </div>
        </div>

        {/* Table Content */}
        <div style={{overflowX:'auto'}}>
            <table style={{width:'100%', borderCollapse:'collapse', border: `1px solid ${colors.border}`, minWidth:600}}>
                <thead>
                    <tr style={{background: colors.header}}>
                        <th style={{padding:12, border: `1px solid ${colors.border}`, textAlign:'left'}}>วันที่</th>
                        <th style={{padding:12, border: `1px solid ${colors.border}`, textAlign:'left'}}>รายละเอียด</th>
                        <th style={{padding:12, border: `1px solid ${colors.border}`, textAlign:'center', width:100}}>ไฟล์แนบ</th>
                        {/* 🔒 คอลัมน์จัดการ: แสดงเฉพาะตอน Login */}
                        {currentUser && <th style={{padding:12, border: `1px solid ${colors.border}`, textAlign:'center', width:100}}>จัดการ</th>}
                    </tr>
                </thead>
                <tbody>
                    {data.length === 0 ? (
                        <tr><td colSpan={4} style={{padding:20, textAlign:'center', color:'#999'}}>ไม่พบข้อมูล</td></tr>
                    ) : (
                        data.filter(d => JSON.stringify(d).toLowerCase().includes(activeSearchTerm.toLowerCase())).map((d, i) => (
                            <tr key={d.id} style={{background: i%2===0?'white':'#f8fafc'}}>
                                <td style={{padding:12, border: `1px solid ${colors.border}`, verticalAlign:'top'}}>
                                    {formatDate(d.receiveDate || d.date || d.bookingDate || d.effectiveDate || d.createdAt)}
                                    {d.time ? <div style={{fontSize:12, color:'#666'}}>{d.time} น.</div> : null}
                                </td>
                                <td style={{padding:12, border: `1px solid ${colors.border}`, verticalAlign:'top'}}>
                                    <div style={{fontWeight:'bold', color:colors.primary}}>{d.docNumber || d.receiptNumber}</div>
                                    <div>{d.subject || d.purpose || d.childName || d.deceasedName}</div>
                                    <div style={{fontSize:13, color:'#64748b', marginTop:4}}>
                                        {d.source && <span>จาก: {d.source} </span>}
                                        {d.recipientName && <span>ถึง: {d.recipientName} </span>}
                                        {d.room && <span style={{color:d.room.includes('ทับทิม')?'red':'blue'}}>({d.room})</span>}
                                    </div>
                                </td>
                                <td style={{padding:12, border: `1px solid ${colors.border}`, textAlign:'center', verticalAlign:'top'}}>
                                    {d.filePath ? (
                                        <button onClick={()=>setPreviewUrl(`${API}${d.filePath}`)} style={{cursor:'pointer', color:colors.secondary, background:'none', border:'1px solid #ddd', padding:'4px 8px', borderRadius:4}}>📎 ดูไฟล์</button>
                                    ) : '-'}
                                </td>
                                {/* 🔒 ปุ่มแก้ไข/ลบ: แสดงเฉพาะตอน Login */}
                                {currentUser && (
                                    <td style={{padding:12, border: `1px solid ${colors.border}`, textAlign:'center', verticalAlign:'top'}}>
                                        <button onClick={()=>{setForm(d); setEditingId(d.id); setShowForm(true);}} style={{marginRight:8, cursor:'pointer', border:'none', background:'none', fontSize:16}} title="แก้ไข">📝</button>
                                        <button onClick={()=>del(d.id)} style={{cursor:'pointer', border:'none', background:'none', fontSize:16}} title="ลบ">❌</button>
                                    </td>
                                )}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>

        {/* Form Modal (ใช้ฟอร์มเดียวครอบจักรวาล) */}
        {showForm && (
            <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:900}}>
                <div style={{background:'white', padding:20, borderRadius:8, width:500, maxHeight:'90vh', overflowY:'auto'}}>
                    <h3>{editingId ? 'แก้ไขรายการ' : 'เพิ่มรายการใหม่'}</h3>
                    <div style={{marginBottom:15}}>
                        <label style={{display:'block', marginBottom:5}}>วันที่</label>
                        <input type="date" value={form.date || form.receiveDate || form.bookingDate || form.effectiveDate || ''} 
                               onChange={e=>handleInput(tab.includes('incoming')?'receiveDate': tab==='meeting'?'bookingDate': tab==='orders'?'effectiveDate':'date', e.target.value)} 
                               style={{width:'100%', padding:8, border:'1px solid #ccc', borderRadius:4}}/>
                    </div>
                    
                    {/* Input แบบปรับเปลี่ยนตาม Tab */}
                    {['incoming-director', 'incoming-general', 'ext-wrpk', 'orders'].some(t => tab.includes(t)) && (
                         <div style={{marginBottom:15}}><label style={{display:'block', marginBottom:5}}>เลขที่หนังสือ</label><input value={form.docNumber||''} onChange={e=>handleInput('docNumber', e.target.value)} style={{width:'100%', padding:8, border:'1px solid #ccc', borderRadius:4}}/></div>
                    )}
                    
                    {tab === 'outgoing-mail' && (
                         <div style={{marginBottom:15}}><label style={{display:'block', marginBottom:5}}>เลขที่ใบเสร็จ</label><input value={form.receiptNumber||''} onChange={e=>handleInput('receiptNumber', e.target.value)} style={{width:'100%', padding:8, border:'1px solid #ccc', borderRadius:4}}/></div>
                    )}

                    <div style={{marginBottom:15}}>
                        <label style={{display:'block', marginBottom:5}}>รายละเอียด / เรื่อง / ชื่อ</label>
                        <input value={form.subject || form.childName || form.deceasedName || form.purpose || ''} 
                               onChange={e=>handleInput(tab.includes('reg-birth')?'childName': tab.includes('reg-death')?'deceasedName': tab==='meeting'?'purpose':'subject', e.target.value)} 
                               style={{width:'100%', padding:8, border:'1px solid #ccc', borderRadius:4}}/>
                    </div>
                    
                    {/* Inputs เพิ่มเติมแบบง่าย */}
                    <div style={{marginBottom:15}}><label style={{display:'block', marginBottom:5}}>หน่วยงาน/ผู้รับ/ผู้ส่ง (ถ้ามี)</label><input value={form.source || form.recipientName || form.department || ''} onChange={e=>handleInput(tab==='meeting'?'department': tab==='outgoing-mail'?'recipientName':'source', e.target.value)} style={{width:'100%', padding:8, border:'1px solid #ccc', borderRadius:4}}/></div>
                    
                    <div style={{marginBottom:15}}>
                        <label style={{display:'block', marginBottom:5}}>แนบไฟล์ (PDF/รูปภาพ)</label>
                        <input type="file" onChange={e => { if (e.target.files && e.target.files.length > 0) handleInput('file', e.target.files[0]); }} style={{marginTop:5}} />
                    </div>
                    
                    <div style={{display:'flex', gap:10, marginTop:20}}>
                        <button onClick={save} style={{flex:1, background:colors.primary, color:'white', padding:10, border:'none', borderRadius:5, cursor:'pointer'}}>บันทึก</button>
                        <button onClick={()=>setShowForm(false)} style={{flex:1, background:'#ddd', padding:10, border:'none', borderRadius:5, cursor:'pointer'}}>ยกเลิก</button>
                    </div>
                </div>
            </div>
        )}

        {/* Modal Login (ซ้ำเพื่อให้เรียกใช้ได้ทุกหน้า) */}
        {isLoginModalOpen && (
              <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:1000}}>
                  <div style={{background:'white', padding:30, borderRadius:10, width:350, boxShadow:'0 10px 25px rgba(0,0,0,0.2)'}}>
                      <h3 style={{textAlign:'center', marginTop:0, color:colors.primary}}>🔐 เข้าสู่ระบบเจ้าหน้าที่</h3>
                      {loginError && <div style={{background:'#fee2e2', color:'#b91c1c', padding:10, borderRadius:5, marginBottom:10, fontSize:14}}>{loginError}</div>}
                      <div style={{marginBottom:10}}><label>Username</label><input value={loginForm.username} onChange={e=>setLoginForm({...loginForm, username:e.target.value})} style={{width:'100%', padding:10, marginTop:5, border:'1px solid #ccc'}} /></div>
                      <div style={{marginBottom:20}}><label>Password</label><input type="password" value={loginForm.password} onChange={e=>setLoginForm({...loginForm, password:e.target.value})} style={{width:'100%', padding:10, marginTop:5, border:'1px solid #ccc'}} /></div>
                      <button onClick={handleLogin} style={{width:'100%', padding:12, background:colors.primary, color:'white', border:'none', borderRadius:5, cursor:'pointer'}}>เข้าสู่ระบบ</button>
                      <button onClick={()=>setIsLoginModalOpen(false)} style={{width:'100%', padding:10, background:'transparent', color:'#666', border:'none', marginTop:10, cursor:'pointer'}}>ยกเลิก</button>
                  </div>
              </div>
        )}

        {/* File Preview */}
        {previewUrl && (
            <div style={{position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.9)', zIndex: 1200, display:'flex', justifyContent:'center', alignItems:'center'}}>
                <div style={{width:'90%', height:'90%', background:'white', position:'relative'}}>
                     <button onClick={()=>setPreviewUrl(null)} style={{position:'absolute', right:-15, top:-15, background:'red', color:'white', borderRadius:'50%', width:35, height:35, cursor:'pointer', border:'2px solid white', fontSize:16}}>X</button>
                     <iframe src={previewUrl} width="100%" height="100%" style={{border:'none'}} />
                </div>
            </div>
        )}
    </div>
  );
}
