import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// 🔗 ลิงก์ Server
const API = 'https://hospital-doc-system.onrender.com';

// ==================== Constants & Styles ====================
const colors = {
  primary: '#1e3a8a', secondary: '#2563eb', success: '#16a34a',
  danger: '#dc2626', bg: '#f8fafc', card: '#ffffff', text: '#334155', border: '#cbd5e1',
  roomRuby: '#fee2e2', roomRubyText: '#991b1b',
  room8: '#dbeafe', room8Text: '#1e40af'
};

const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

const formatDate = (d: string) => {
    if(!d) return '-';
    const date = new Date(d);
    if(isNaN(date.getTime())) return '-';
    return `${date.getDate()}/${date.getMonth()+1}/${date.getFullYear()+543}`;
};

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
  // --- States ---
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginLoading, setLoginLoading] = useState(false);

  const [menuId, setMenuId] = useState<number | null>(null);
  const [tab, setTab] = useState<string>('');
  const [data, setData] = useState<any[]>([]);
  const [form, setForm] = useState<any>({});
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string|null>(null);

  const [meetingView, setMeetingView] = useState<'calendar' | 'list'>('calendar');
  const [calDate, setCalDate] = useState(new Date());
  const [expandedReceipts, setExpandedReceipts] = useState<string[]>([]);
  const [activeSearchTerm, setActiveSearchTerm] = useState('');
  const [tempSearchTerm, setTempSearchTerm] = useState('');
  const [stampBalance, setStampBalance] = useState(0);

  // --- Effects ---
  useEffect(() => {
      const savedUser = localStorage.getItem('hospital_user');
      if (savedUser) setCurrentUser(JSON.parse(savedUser));
  }, []);

  const loadData = useCallback(async () => {
    if(!tab) return;
    try {
        const res = await axios.get(`${API}/docs/${tab}`);
        const rawData = res.data || [];
        setData(rawData);
        if(tab === 'stamp') {
            let bal = 0;
            rawData.forEach((d:any) => {
                if(d.transactionType === 'ADD') bal += (parseFloat(d.amount) || 0);
                else bal -= (parseFloat(d.amount) || 0);
            });
            setStampBalance(bal);
        }
    } catch(e) { console.error("Load Error:", e); }
  }, [tab]);

  useEffect(() => {
      loadData();
      const interval = setInterval(() => { if (!showForm) loadData(); }, 3000);
      return () => clearInterval(interval);
  }, [loadData, showForm]);

  // --- Functions ---
  const handleLogin = async () => {
      if(!loginForm.username || !loginForm.password) return alert("กรุณากรอกข้อมูลให้ครบ");
      setLoginLoading(true);
      try {
          const res = await axios.post(`${API}/login`, loginForm);
          setCurrentUser(res.data);
          localStorage.setItem('hospital_user', JSON.stringify(res.data));
          setIsLoginModalOpen(false);
          setLoginForm({ username: '', password: '' });
          alert(`ยินดีต้อนรับ: ${res.data.fullname} ✅`);
      } catch (err: any) {
          alert(`เข้าสู่ระบบไม่สำเร็จ: ${err.response?.data?.error || err.message}`);
      } finally { setLoginLoading(false); }
  };

  const handleLogout = () => {
      if(confirm('ยืนยันออกจากระบบ?')) { setCurrentUser(null); localStorage.removeItem('hospital_user'); }
  };

  const handleInput = (k: string, v: any) => setForm((p:any) => ({...p, [k]: v}));

  const save = async () => {
      try {
          const fd = new FormData();
          const payload = { ...form };
          if(tab === 'stamp' && !payload.transactionType) payload.transactionType = 'USE';
          fd.append('data', JSON.stringify(payload));
          if(form.file) fd.append('file', form.file);

          let url = `${API}/docs/${tab}`;
          if(editingId) url += `/${editingId}`;
          
          if (editingId) await axios.put(url, fd);
          else await axios.post(url, fd);

          setShowForm(false); setForm({}); setEditingId(null);
          loadData(); 
          alert('บันทึกข้อมูลสำเร็จ ✅');
      } catch(e: any) { 
          alert(`บันทึกไม่สำเร็จ!\nServer แจ้งว่า: ${e.response?.data || e.message}`); 
      }
  };

  const del = async (id: number) => {
      if(!confirm('ยืนยันลบรายการนี้?')) return;
      try { await axios.delete(`${API}/docs/${tab}/${id}`); loadData(); } catch(e) { alert('ลบไม่สำเร็จ!'); }
  };

  const handleMainAdd = () => {
      let initForm: any = {};
      if (tab === 'stamp') initForm = { transactionType: 'USE' };
      setForm(initForm);
      setEditingId(null);
      setShowForm(true);
  };

  const groupedReceipts = useMemo(() => {
      if(tab !== 'outgoing-mail') return {};
      return data.reduce((acc:any, item:any) => {
          const r = item.receiptNumber || 'No Receipt';
          if(!acc[r]) acc[r] = { date: item.sendDate, totalCost: 0, count: 0, items: [] };
          acc[r].totalCost += (parseFloat(item.amount) || 0);
          acc[r].count++;
          acc[r].items.push(item);
          return acc;
      }, {});
  }, [data, tab]);

  const handleExport = (type: 'excel' | 'pdf') => {
      if(data.length === 0) return alert('ไม่พบข้อมูล');
      let headers: string[] = [];
      let body: any[] = [];
      
      if(tab.includes('incoming')) {
          headers = ['วันที่รับ', 'เลขที่หนังสือ', 'จาก', 'ถึง', 'เรื่อง', 'Tracking'];
          body = data.map(d => [formatDate(d.receiveDate), d.docNumber, d.source, d.recipientName, d.subject, d.trackingNo]);
      } else if (tab === 'outgoing-mail') {
          headers = ['วันที่ส่ง', 'เลขที่ใบเสร็จ', 'เรื่อง', 'ผู้รับ', 'ค่าส่ง'];
          body = data.map(d => [formatDate(d.sendDate), d.receiptNumber, d.subject, d.recipientName, d.amount]);
      } else if (tab === 'meeting') {
          headers = ['วันที่จอง', 'เวลา', 'ห้อง', 'แผนก', 'เรื่อง'];
          body = data.map(d => [formatDate(d.bookingDate), `${d.startTime}-${d.endTime}`, d.room, d.department, d.purpose]);
      } else if (tab.includes('ext')) {
          headers = ['วันที่ออก', 'เลขที่หนังสือ', 'เรื่อง', 'เรียน'];
          body = data.map(d => [formatDate(d.date), d.docNumber, d.subject, d.recipientName]);
      } else if (tab === 'stamp') {
          headers = ['วันที่', 'รายการ', 'รับ', 'จ่าย', 'ผู้เบิก'];
          body = data.map(d => [formatDate(d.date), d.reason, d.transactionType==='ADD'?d.amount:'-', d.transactionType==='USE'?d.amount:'-', d.requester]);
      } else {
          headers = ['วันที่', 'รายละเอียด'];
          body = data.map(d => [formatDate(d.date||d.createdAt), d.subject]);
      }

      if (type === 'excel') {
          const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Report");
          XLSX.writeFile(wb, `Report_${tab}.xlsx`);
      } else {
          const doc = new jsPDF() as any;
          doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
          doc.text(`Report: ${tab}`, 10, 10);
          doc.autoTable({ head: [headers], body: body, startY: 20 });
          doc.save(`Report_${tab}.pdf`);
      }
  };

  // ==================== Render Components ====================

  const renderCalendar = () => {
      const year = calDate.getFullYear();
      const month = calDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const firstDay = new Date(year, month, 1).getDay();

      return (
          <div style={{background:'white', padding:10, borderRadius:8, border:'1px solid #ccc'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                  <button onClick={()=>setCalDate(new Date(year, month-1, 1))}>◀</button>
                  <h3 style={{margin:0}}>{months[month]} {year+543}</h3>
                  <button onClick={()=>setCalDate(new Date(year, month+1, 1))}>▶</button>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:1, background:'#ddd', border:'1px solid #ddd'}}>
                  {['อา','จ','อ','พ','พฤ','ศ','ส'].map(d=><div key={d} style={{background:colors.primary, color:'white', textAlign:'center', padding:5, fontSize:'0.8rem'}}>{d}</div>)}
                  {[...Array(firstDay)].map((_,i)=><div key={`empty-${i}`} style={{background:'white', minHeight:80}}></div>)}
                  {[...Array(daysInMonth)].map((_,i) => {
                      const day = i+1;
                      const bookings = data.filter((b:any) => {
                          const d = new Date(b.bookingDate);
                          return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
                      });
                      return (
                          <div key={day} style={{background:'white', minHeight:80, padding:2, borderRight:'1px solid #eee', borderBottom:'1px solid #eee'}}>
                              <div style={{textAlign:'right', fontWeight:'bold', fontSize:'0.7rem', marginBottom:2, paddingRight:2}}>{day}</div>
                              {bookings.map((b:any) => (
                                  <div key={b.id} onClick={()=>{if(currentUser){setForm(b); setEditingId(b.id); setShowForm(true);}}}
                                       style={{fontSize:'0.6rem', padding:'2px', marginBottom:1, borderRadius:2, cursor: currentUser?'pointer':'default',
                                               background: b.room?.includes('ทับทิม') ? colors.roomRuby : colors.room8,
                                               color: b.room?.includes('ทับทิม') ? colors.roomRubyText : colors.room8Text,
                                               borderLeft: `2px solid ${b.room?.includes('ทับทิม') ? 'red' : 'blue'}`, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                                      {b.startTime} {b.department}
                                  </div>
                              ))}
                          </div>
                      );
                  })}
              </div>
          </div>
      );
  };

  // Helper: ตารางมาตรฐาน (ทำให้ Scroll แนวนอนได้บนมือถือ)
  const renderStandardTable = (headers: string[], keys: string[]) => (
      <div style={{background:'white', borderRadius:8, overflow:'hidden', boxShadow:'0 2px 4px rgba(0,0,0,0.05)', width:'100%', overflowX:'auto'}}>
          <table style={{width:'100%', borderCollapse:'collapse', minWidth: '600px'}}> {/* min-width บังคับให้ตารางไม่บีบจนเละ */}
              <thead style={{background:'#e2e8f0'}}><tr>{headers.map(h=><th key={h} style={{padding:'12px 8px', textAlign:'left', color:colors.primary, whiteSpace:'nowrap'}}>{h}</th>)}{currentUser && <th style={{width:80}}>จัดการ</th>}</tr></thead>
              <tbody>
                  {data.filter(d => JSON.stringify(d).toLowerCase().includes(activeSearchTerm.toLowerCase())).map((d, i) => (
                      <tr key={d.id} style={{borderBottom:'1px solid #eee', background: i%2===0?'white':'#f8fafc'}}>
                          {keys.map((k, idx) => {
                              let val = d[k];
                              if(k.includes('date') || k.includes('Date')) val = formatDate(val);
                              if(k === 'timeRange') val = `${d.startTime} - ${d.endTime}`;
                              if(k === 'income') val = d.transactionType==='ADD' ? d.amount : '-';
                              if(k === 'expense') val = d.transactionType==='USE' ? d.amount : '-';
                              if(k === 'parents') val = `บ:${d.fatherName} ม:${d.motherName}`;
                              if(k === 'filePath') return <td key={k} style={{padding:'10px 8px'}}>{val && <button onClick={()=>setPreviewUrl(`${API}${val}`)} style={{background:'none', border:'none', cursor:'pointer', fontSize:16}}>📎</button>}</td>;
                              return <td key={k} style={{padding:'10px 8px', fontSize:'0.9rem'}}>{val}</td>;
                          })}
                          {currentUser && (
                              <td style={{textAlign:'center', whiteSpace:'nowrap'}}>
                                  <button onClick={()=>{setForm(d); setEditingId(d.id); setShowForm(true);}} style={{marginRight:5, cursor:'pointer', background:'none', border:'none'}}>✏️</button>
                                  <button onClick={()=>del(d.id)} style={{color:'red', cursor:'pointer', background:'none', border:'none'}}>✖</button>
                              </td>
                          )}
                      </tr>
                  ))}
                  {data.length === 0 && <tr><td colSpan={headers.length+1} style={{padding:20, textAlign:'center', color:'#aaa'}}>ไม่มีข้อมูล</td></tr>}
              </tbody>
          </table>
      </div>
  );

  const renderContent = () => {
      if (tab === 'outgoing-mail') {
          return (
              <div>
                  {Object.entries(groupedReceipts).map(([rNum, group]: any) => (
                       <div key={rNum} style={{marginBottom: 15, border: `1px solid ${colors.secondary}`, borderRadius: 8, overflow:'hidden', background:'white'}}>
                           <div style={{padding: 10, background: '#eff6ff', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', flexWrap:'wrap', gap:5}}
                                onClick={() => setExpandedReceipts(prev => prev.includes(rNum) ? prev.filter(x=>x!==rNum) : [...prev, rNum])}>
                                <div style={{display:'flex', gap:10, flexWrap:'wrap', alignItems:'center'}}>
                                    <span style={{fontWeight:'bold', color: colors.primary}}>🧾 {rNum}</span>
                                    <span style={{color: '#64748b', fontSize:'0.8rem'}}>{formatDate(group.date)}</span>
                                    <span style={{background: 'white', padding:'2px 8px', borderRadius:10, fontSize:'0.8rem', border:'1px solid #ccc'}}>✉️ {group.count} ฉบับ</span>
                                </div>
                                <div style={{fontWeight:'bold', color: colors.success}}>รวม: {group.totalCost.toLocaleString()} บ. {expandedReceipts.includes(rNum) ? '▲' : '▼'}</div>
                           </div>
                           {expandedReceipts.includes(rNum) && (
                               <div style={{overflowX:'auto'}}>
                               <table style={{width:'100%', borderCollapse:'collapse', minWidth:'500px'}}>
                                   <thead style={{background:'#f8fafc'}}><tr><th style={{padding:8, textAlign:'left'}}>เรื่อง</th><th style={{padding:8, textAlign:'left'}}>ผู้รับ</th><th style={{padding:8}}>ค่าส่ง</th>{currentUser&&<th style={{padding:8}}>ลบ</th>}</tr></thead>
                                   <tbody>
                                       {group.items.map((item:any) => (
                                           <tr key={item.id} style={{borderTop:'1px solid #eee'}}><td style={{padding:8}}>{item.subject}</td><td style={{padding:8}}>{item.recipientName}</td><td style={{padding:8}}>{item.amount}</td>{currentUser && <td style={{padding:8}}><button onClick={()=>del(item.id)} style={{color:'red', border:'none', background:'none', cursor:'pointer'}}>x</button></td>}</tr>
                                       ))}
                                   </tbody>
                               </table>
                               </div>
                           )}
                       </div>
                   ))}
              </div>
          );
      }
      if (tab === 'meeting') {
          return (
              <div>
                  <div style={{marginBottom:15}}>
                      <button onClick={()=>setMeetingView('calendar')} style={{padding:'6px 15px', marginRight:5, background: meetingView==='calendar'?colors.primary:'white', color: meetingView==='calendar'?'white':'black', border:'1px solid #ccc', cursor:'pointer', borderRadius:5}}>ปฏิทิน</button>
                      <button onClick={()=>setMeetingView('list')} style={{padding:'6px 15px', background: meetingView==='list'?colors.primary:'white', color: meetingView==='list'?'white':'black', border:'1px solid #ccc', cursor:'pointer', borderRadius:5}}>รายการ</button>
                  </div>
                  {meetingView === 'calendar' ? renderCalendar() : renderStandardTable(['วันที่', 'เวลา', 'ห้อง', 'แผนก', 'เรื่อง'], ['bookingDate', 'timeRange', 'room', 'department', 'purpose'])}
              </div>
          );
      }
      if (tab === 'stamp') {
          return (
              <div>
                  <div style={{background:'#fff7ed', border:'1px solid #fdba74', padding:20, borderRadius:10, marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10}}>
                      <div><div style={{color:'#9a3412', fontSize:14}}>ยอดเงินคงเหลือ</div><div style={{fontSize:32, fontWeight:'bold', color: stampBalance < 100 ? 'red' : '#ea580c'}}>{stampBalance.toLocaleString()} บาท</div></div>
                      {currentUser && <button onClick={()=>{setForm({transactionType:'ADD', date: new Date().toISOString().split('T')[0]}); setShowForm(true);}} style={{background:colors.success, color:'white', padding:'10px 20px', border:'none', borderRadius:5, cursor:'pointer'}}>+ ซื้อเพิ่ม</button>}
                  </div>
                  {renderStandardTable(['วันที่', 'รายการ', 'รับ', 'จ่าย', 'ผู้เบิก'], ['date', 'reason', 'income', 'expense', 'requester'])}
              </div>
          );
      }
      
      let headers = ['วันที่', 'เรื่อง/รายละเอียด', 'ไฟล์'];
      let keys = ['date', 'subject', 'filePath'];
      if(tab.includes('incoming')) { headers = ['วันที่รับ', 'เลขที่หนังสือ', 'จาก', 'ถึง', 'เรื่อง', 'Tracking', 'ไฟล์']; keys = ['receiveDate', 'docNumber', 'source', 'recipientName', 'subject', 'trackingNo', 'filePath']; }
      else if(tab.includes('ext')) { headers = ['วันที่ออก', 'เลขที่หนังสือ', 'เรื่อง', 'เรียน', 'ไฟล์']; keys = ['date', 'docNumber', 'subject', 'recipientName', 'filePath']; }
      else if(tab.includes('reg-birth')) { headers = ['เกิดวันที่', 'เวลา', 'ชื่อเด็ก', 'ชื่อบิดา-มารดา', 'ไฟล์']; keys = ['date', 'time', 'childName', 'parents', 'filePath']; }
      else if(tab.includes('reg-death')) { headers = ['เสียชีวิตวันที่', 'เวลา', 'ชื่อผู้เสียชีวิต', 'สาเหตุ', 'จัดการศพ']; keys = ['date', 'time', 'deceasedName', 'cause', 'funeral']; }
      else if(tab.includes('orders')) { headers = ['วันที่บังคับใช้', 'เลขที่คำสั่ง', 'เรื่อง', 'ไฟล์']; keys = ['effectiveDate', 'docNumber', 'subject', 'filePath']; }

      return renderStandardTable(headers, keys);
  };

  const renderFormModal = () => (
      <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:1000, padding:10}}>
          <div style={{background:'white', padding:20, borderRadius:10, width:'100%', maxWidth:'600px', maxHeight:'90vh', overflowY:'auto', boxSizing:'border-box'}}>
              <h3 style={{marginTop:0, borderBottom:`1px solid ${colors.border}`, paddingBottom:10, color:colors.primary}}>{editingId ? '✏️ แก้ไข' : '➕ เพิ่มรายการ'}</h3>
              <div style={{display:'flex', flexDirection:'column', gap:15}}>
                  
                  {/* Common Date */}
                  <div><label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>วันที่</label><input type="date" value={form.date || form.receiveDate || form.bookingDate || form.sendDate || form.effectiveDate || ''} onChange={e=>handleInput(tab.includes('incoming')?'receiveDate':tab==='meeting'?'bookingDate':tab==='outgoing-mail'?'sendDate':tab==='orders'?'effectiveDate':'date', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}}/></div>

                  {tab === 'outgoing-mail' && <>
                      <div><label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>เลขที่ใบเสร็จ</label><input value={form.receiptNumber||''} onChange={e=>handleInput('receiptNumber', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}}/></div>
                      <div><label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>ค่าส่ง (บาท)</label><input type="number" value={form.amount||''} onChange={e=>handleInput('amount', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}}/></div>
                      <div><label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>ผู้รับปลายทาง</label><input value={form.recipientName||''} onChange={e=>handleInput('recipientName', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}}/></div>
                      <div><label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>เรื่อง</label><input value={form.subject||''} onChange={e=>handleInput('subject', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}}/></div>
                  </>}

                  {tab.includes('ext') && <>
                       <div><label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>เลขที่หนังสือ</label><input value={form.docNumber||''} onChange={e=>handleInput('docNumber', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}}/></div>
                       <div><label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>เรื่อง</label><input value={form.subject||''} onChange={e=>handleInput('subject', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}}/></div>
                       <div><label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>เรียน (ผู้รับ)</label><input value={form.recipientName||''} onChange={e=>handleInput('recipientName', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}}/></div>
                  </>}

                  {tab === 'stamp' && <>
                       <div><label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>รายการ (เหตุผล)</label><input value={form.reason||''} onChange={e=>handleInput('reason', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}}/></div>
                       <div><label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>จำนวนเงิน (บาท)</label><input type="number" value={form.amount||''} onChange={e=>handleInput('amount', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}}/></div>
                       {form.transactionType !== 'ADD' && <div><label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>ผู้เบิก</label><input value={form.requester||''} onChange={e=>handleInput('requester', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}}/></div>}
                  </>}

                  {tab === 'meeting' && <>
                      <div style={{display:'flex', gap:10}}>
                           <div style={{flex:1}}><label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>เริ่ม</label><input type="time" value={form.startTime||''} onChange={e=>handleInput('startTime', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}}/></div>
                           <div style={{flex:1}}><label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>ถึง</label><input type="time" value={form.endTime||''} onChange={e=>handleInput('endTime', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}}/></div>
                      </div>
                      <div><label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>ห้อง</label><select value={form.room||'ห้องทับทิม'} onChange={e=>handleInput('room', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}}><option>ห้องทับทิม</option><option>ห้องประชุมชั้น 8</option></select></div>
                      <div><label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>แผนก</label><input value={form.department||''} onChange={e=>handleInput('department', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}}/></div>
                      <div><label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>วัตถุประสงค์</label><input value={form.purpose||''} onChange={e=>handleInput('purpose', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}}/></div>
                  </>}

                  {(!['meeting', 'outgoing-mail', 'stamp'].includes(tab) && !tab.includes('ext')) && <>
                      {(tab.includes('incoming') || tab==='orders') && <div><label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>เลขที่หนังสือ/คำสั่ง</label><input value={form.docNumber||''} onChange={e=>handleInput('docNumber', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}}/></div>}
                      
                      <div><label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>เรื่อง / ชื่อ</label><input value={form.subject || form.childName || form.deceasedName || ''} onChange={e=>handleInput(tab.includes('reg-birth')?'childName':tab.includes('reg-death')?'deceasedName':'subject', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}}/></div>
                      
                      {tab.includes('incoming') && <>
                          <div><label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>จากหน่วยงาน</label><input value={form.source||''} onChange={e=>handleInput('source', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}}/></div>
                          <div><label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>ถึง</label><input value={form.recipientName||''} onChange={e=>handleInput('recipientName', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}}/></div>
                          <div><label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>Tracking (ถ้ามี)</label><input value={form.trackingNo||''} onChange={e=>handleInput('trackingNo', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}}/></div>
                      </>}
                  </>}

                  <div>
                      <label style={{display:'block', marginBottom:5, fontSize:'0.9rem'}}>แนบไฟล์</label>
                      <input type="file" onChange={e => { if(e.target.files && e.target.files[0]) handleInput('file', e.target.files[0]); }} style={{marginTop:5}} />
                  </div>
              </div>

              <div style={{display:'flex', gap:10, marginTop:20, paddingTop:15, borderTop:`1px solid ${colors.border}`}}>
                  <button onClick={save} style={{flex:1, background:colors.secondary, color:'white', padding:12, border:'none', borderRadius:5, cursor:'pointer', fontWeight:'bold', fontSize:'1rem'}}>บันทึก</button>
                  <button onClick={()=>setShowForm(false)} style={{flex:1, background:'#e2e8f0', color:colors.text, padding:12, border:'none', borderRadius:5, cursor:'pointer', fontSize:'1rem'}}>ยกเลิก</button>
              </div>
          </div>
      </div>
  );

  // ==================== Main Layout (Responsive) ====================
  
  if(isLoginModalOpen) return (
      <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:2000, padding:10}}>
          <div style={{background:'white', padding:30, borderRadius:10, width:'100%', maxWidth:'350px', boxSizing:'border-box'}}>
              <h3 style={{textAlign:'center', color:colors.primary}}>🔐 เข้าสู่ระบบ</h3>
              <input autoFocus placeholder="Username" value={loginForm.username} onChange={e=>setLoginForm({...loginForm, username:e.target.value})} style={{width:'100%', padding:12, marginBottom:10, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}} />
              <input type="password" placeholder="Password" value={loginForm.password} onChange={e=>setLoginForm({...loginForm, password:e.target.value})} style={{width:'100%', padding:12, marginBottom:20, border:'1px solid #ccc', borderRadius:5, boxSizing:'border-box'}} />
              <button onClick={handleLogin} style={{width:'100%', padding:12, background:colors.primary, color:'white', border:'none', borderRadius:5, cursor:'pointer', fontSize:'1rem'}}>{loginLoading?'...':'Login'}</button>
              <button onClick={()=>setIsLoginModalOpen(false)} style={{width:'100%', marginTop:10, background:'none', border:'none', cursor:'pointer', color:'#666'}}>Cancel</button>
          </div>
      </div>
  );

  if(!menuId) return (
      <div style={{padding:'20px', background: colors.bg, minHeight:'100vh', fontFamily:'Sarabun, sans-serif', boxSizing:'border-box'}}>
          {/* Header แบบ Responsive (Flex Wrap) */}
          <div style={{display:'flex', flexWrap:'wrap', justifyContent:'space-between', alignItems:'center', marginBottom:30, gap:15}}>
               <h1 style={{color: '#1e293b', margin:0, fontSize: 'clamp(1.5rem, 4vw, 2rem)'}}>🏥 Hospital E-Saraban</h1>
               <div style={{flexShrink:0}}>
                   {currentUser ? (
                       <div style={{textAlign:'right'}}>
                           <div style={{fontWeight:'bold', color:colors.primary}}>👤 {currentUser.fullname}</div>
                           <button onClick={handleLogout} style={{color:'red', cursor:'pointer', border:'none', background:'none', fontSize:'0.8rem', textDecoration:'underline'}}>Logout</button>
                       </div>
                   ) : (
                       <button onClick={()=>setIsLoginModalOpen(true)} style={{padding:'8px 15px', cursor:'pointer', border:'1px solid #ccc', borderRadius:5, background:'white'}}>🔐 Login</button>
                   )}
               </div>
          </div>
          
          {/* Grid Menu Responsive */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:20, maxWidth:1200, margin:'0 auto'}}>
              {mainMenu.map(m => (
                  <div key={m.id} onClick={()=>{ setMenuId(m.id); if(m.sub.length) setTab(m.sub[0].id); }} 
                       style={{background: 'white', padding: 20, borderRadius: 15, cursor:'pointer', textAlign:'center', boxShadow:'0 2px 5px rgba(0,0,0,0.05)', minHeight:150, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', border:'1px solid #e2e8f0', transition:'transform 0.2s'}}>
                      <div style={{fontSize: '2.5rem', marginBottom: 10}}>{m.icon}</div>
                      <div style={{fontSize: '1rem', fontWeight:'bold', color:colors.text}}>{m.title}</div>
                  </div>
              ))}
          </div>
      </div>
  );

  const currentMenu = mainMenu.find(m => m.id === menuId);
  return (
    <div style={{padding:'10px', background: colors.bg, minHeight:'100vh', fontFamily:'Sarabun, sans-serif', boxSizing:'border-box', maxWidth:'100vw', overflowX:'hidden'}}>
        
        {/* Header Content Page */}
        <div style={{display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between', marginBottom:20, gap:10}}>
            <div style={{display:'flex', alignItems:'center', gap:10, flexGrow:1}}>
                <button onClick={()=>setMenuId(null)} style={{background:'white', border:'1px solid #ccc', padding:'5px 10px', borderRadius:5, cursor:'pointer', fontSize:'1rem'}}>⬅</button>
                <span style={{fontSize:'1.2rem', fontWeight:'bold', color:colors.primary, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{currentMenu?.title}</span>
            </div>
            {currentUser && <div style={{fontSize:'0.9rem', textAlign:'right', whiteSpace:'nowrap'}}>👤 {currentUser.fullname.split(' ')[0]} <br/><span onClick={handleLogout} style={{color:'red', cursor:'pointer', fontSize:'0.8rem'}}>ออกจากระบบ</span></div>}
        </div>
        
        {/* Scrollable Tabs */}
        <div style={{marginBottom: 15, display:'flex', gap:10, overflowX:'auto', paddingBottom:5, scrollbarWidth:'none'}}>
            {currentMenu?.sub.map(s => (
                <button key={s.id} onClick={()=>setTab(s.id)} style={{
                    padding:'8px 16px', border:'none', borderRadius:20, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
                    background: tab===s.id ? '#1e3a8a' : '#cbd5e1', color: tab===s.id ? 'white' : 'black', boxShadow: tab===s.id ? '0 2px 4px rgba(0,0,0,0.2)' : 'none'
                }}>
                    {s.label}
                </button>
            ))}
        </div>

        {/* Responsive Toolbar */}
        <div style={{background:'white', padding:10, borderRadius:10, marginBottom:15, display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
            {currentUser && <button onClick={handleMainAdd} style={{background: colors.secondary, color:'white', padding:'8px 15px', border:'none', borderRadius:5, cursor:'pointer', flexGrow:1, minWidth:'120px', fontWeight:'bold'}}>+ เพิ่มรายการ</button>}
            
            <div style={{display:'flex', gap:5, flexGrow: 999, minWidth:'200px', width:'100%'}}> {/* FlexGrow 999 ดันให้เต็ม */}
                <input placeholder="ค้นหา..." value={tempSearchTerm} onChange={e=>setTempSearchTerm(e.target.value)} style={{padding:'8px', border:'1px solid #ccc', borderRadius:5, width:'100%'}} />
                <button onClick={()=>setActiveSearchTerm(tempSearchTerm)} style={{cursor:'pointer', border:'none', background:'#e2e8f0', borderRadius:5, padding:'0 15px'}}>🔍</button>
            </div>
            
            <div style={{display:'flex', gap:5, marginLeft:'auto', flexGrow:0}}>
                <button onClick={()=>handleExport('excel')} style={{background:colors.success, color:'white', border:'none', padding:'8px 12px', borderRadius:5, cursor:'pointer', fontSize:'0.9rem'}}>Excel</button>
                <button onClick={()=>handleExport('pdf')} style={{background:colors.danger, color:'white', border:'none', padding:'8px 12px', borderRadius:5, cursor:'pointer', fontSize:'0.9rem'}}>PDF</button>
            </div>
        </div>

        {/* Main Content Area */}
        <div style={{width:'100%', overflowX:'hidden'}}>
            {renderContent()}
        </div>

        {/* Modals */}
        {showForm && renderFormModal()}
        {previewUrl && <div style={{position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.9)', zIndex: 3000, display:'flex', justifyContent:'center', alignItems:'center', padding:10}}>
            <div style={{width:'100%', height:'100%', maxWidth:'800px', maxHeight:'90vh', background:'white', position:'relative', borderRadius:5, overflow:'hidden'}}>
                 <button onClick={()=>setPreviewUrl(null)} style={{position:'absolute', right:10, top:10, background:'red', color:'white', borderRadius:'50%', width:30, height:30, cursor:'pointer', border:'2px solid white', fontWeight:'bold', zIndex:10}}>X</button>
                 <iframe src={previewUrl} width="100%" height="100%" style={{border:'none'}} />
            </div>
        </div>}
    </div>
  );
}
