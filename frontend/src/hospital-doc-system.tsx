import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// 🔗 ลิงก์ Server (อย่าลืมแก้เป็นลิงก์ของคุณ)
const API = 'https://hospital-doc-system.onrender.com';

// ==================== Liquid Glass Styles & Constants ====================

// สไตล์กระจก (Reuse ได้)
const glassStyle = {
    background: 'rgba(255, 255, 255, 0.7)', // พื้นขาวโปร่งแสง
    backdropFilter: 'blur(12px)',            // เบลอฉากหลัง
    WebkitBackdropFilter: 'blur(12px)',      // สำหรับ Safari
    border: '1px solid rgba(255, 255, 255, 0.6)', // ขอบขาวจางๆ
    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.1)', // เงาฟุ้งๆ
    borderRadius: '16px'
};

const colors = {
  primary: '#2563eb',    // น้ำเงินสด
  secondary: '#0891b2',  // ฟ้าทะเล
  success: '#059669',    // เขียวมรกต
  danger: '#e11d48',     // แดงกุหลาบ
  text: '#1e293b',       // สีตัวหนังสือเข้ม
  roomRuby: '#ffe4e6', roomRubyText: '#9f1239',
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
    { id: 2, title: 'ทะเบียนส่งออก', icon: '📮', sub: [{ id: 'outgoing-mail', label: 'ทะเบียนส่งออก' }] },
    { id: 3, title: 'หนังสือภายนอก', icon: '📤', sub: [{ id: 'ext-wrpk', label: 'หนังสือ รพ.วรปก.' }, { id: 'ext-wrpk-sp', label: 'หนังสือ รพ.วรปก.สป' }] },
    { id: 4, title: 'คำสั่ง/แต่งตั้ง', icon: '📜', sub: [{ id: 'orders', label: 'คำสั่ง/แต่งตั้ง' }] },
    { id: 5, title: 'ทะเบียนราษฎร์', icon: '👶', sub: [{ id: 'reg-birth', label: 'แจ้งเกิด' }, { id: 'reg-death', label: 'แจ้งตาย' }] },
    { id: 6, title: 'คุมอากรแสตมป์', icon: '🎫', sub: [{ id: 'stamp', label: 'การ์ดคุมอากร' }] },
    { id: 7, title: 'จองห้องประชุม', icon: '📅', sub: [{ id: 'meeting', label: 'ตารางการใช้ห้อง' }] }
];

export default function HospitalDocSystem() {
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
      // (Export Logic เดิม)
      if(tab.includes('incoming')) { headers = ['วันที่รับ', 'เลขที่หนังสือ', 'จาก', 'ถึง', 'เรื่อง', 'Tracking']; body = data.map(d => [formatDate(d.receiveDate), d.docNumber, d.source, d.recipientName, d.subject, d.trackingNo]); }
      else if (tab === 'outgoing-mail') { headers = ['วันที่ส่ง', 'เลขที่ใบเสร็จ', 'เรื่อง', 'ผู้รับ', 'ค่าส่ง']; body = data.map(d => [formatDate(d.sendDate), d.receiptNumber, d.subject, d.recipientName, d.amount]); }
      else if (tab === 'meeting') { headers = ['วันที่จอง', 'เวลา', 'ห้อง', 'แผนก', 'เรื่อง']; body = data.map(d => [formatDate(d.bookingDate), `${d.startTime}-${d.endTime}`, d.room, d.department, d.purpose]); }
      else if (tab.includes('ext')) { headers = ['วันที่ออก', 'เลขที่หนังสือ', 'เรื่อง', 'เรียน']; body = data.map(d => [formatDate(d.date), d.docNumber, d.subject, d.recipientName]); }
      else if (tab === 'stamp') { headers = ['วันที่', 'รายการ', 'รับ', 'จ่าย', 'ผู้เบิก']; body = data.map(d => [formatDate(d.date), d.reason, d.transactionType==='ADD'?d.amount:'-', d.transactionType==='USE'?d.amount:'-', d.requester]); }
      else { headers = ['วันที่', 'รายละเอียด']; body = data.map(d => [formatDate(d.date||d.createdAt), d.subject]); }

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

  // ==================== Render Components (Glass Style) ====================

  const renderCalendar = () => {
      const year = calDate.getFullYear();
      const month = calDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const firstDay = new Date(year, month, 1).getDay();

      return (
          <div style={{...glassStyle, padding:15}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
                  <button onClick={()=>setCalDate(new Date(year, month-1, 1))} style={{border:'none', background:'transparent', fontSize:'1.2rem', cursor:'pointer'}}>◀</button>
                  <h3 style={{margin:0, color:colors.primary}}>{months[month]} {year+543}</h3>
                  <button onClick={()=>setCalDate(new Date(year, month+1, 1))} style={{border:'none', background:'transparent', fontSize:'1.2rem', cursor:'pointer'}}>▶</button>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:5}}>
                  {['อา','จ','อ','พ','พฤ','ศ','ส'].map(d=><div key={d} style={{textAlign:'center', fontWeight:'bold', fontSize:'0.9rem', color:colors.text}}>{d}</div>)}
                  {[...Array(firstDay)].map((_,i)=><div key={`empty-${i}`} style={{minHeight:80}}></div>)}
                  {[...Array(daysInMonth)].map((_,i) => {
                      const day = i+1;
                      const bookings = data.filter((b:any) => {
                          const d = new Date(b.bookingDate);
                          return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
                      });
                      return (
                          <div key={day} style={{background:'rgba(255,255,255,0.4)', borderRadius:8, minHeight:80, padding:5, border:'1px solid rgba(255,255,255,0.3)'}}>
                              <div style={{textAlign:'right', fontWeight:'bold', fontSize:'0.8rem', opacity:0.7}}>{day}</div>
                              {bookings.map((b:any) => (
                                  <div key={b.id} onClick={()=>{if(currentUser){setForm(b); setEditingId(b.id); setShowForm(true);}}}
                                       style={{fontSize:'0.7rem', padding:'3px', marginBottom:3, borderRadius:4, cursor: currentUser?'pointer':'default',
                                               background: b.room?.includes('ทับทิม') ? 'rgba(255, 99, 132, 0.2)' : 'rgba(54, 162, 235, 0.2)',
                                               color: b.room?.includes('ทับทิม') ? '#991b1b' : '#1e40af',
                                               border: `1px solid ${b.room?.includes('ทับทิม') ? 'rgba(255,99,132,0.5)' : 'rgba(54,162,235,0.5)'}`,
                                               whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
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

  const renderStandardTable = (headers: string[], keys: string[]) => (
      <div style={{...glassStyle, overflowX:'auto', padding:0}}>
          <table style={{width:'100%', borderCollapse:'separate', borderSpacing:0, minWidth: '600px'}}> 
              <thead style={{background:'rgba(255,255,255,0.3)'}}>
                  <tr>{headers.map(h=><th key={h} style={{padding:'15px', textAlign:'left', color:colors.primary, borderBottom:'1px solid rgba(0,0,0,0.05)', whiteSpace:'nowrap'}}>{h}</th>)}{currentUser && <th style={{width:80, borderBottom:'1px solid rgba(0,0,0,0.05)'}}>จัดการ</th>}</tr>
              </thead>
              <tbody>
                  {data.filter(d => JSON.stringify(d).toLowerCase().includes(activeSearchTerm.toLowerCase())).map((d, i) => (
                      <tr key={d.id} style={{background: i%2===0?'rgba(255,255,255,0.1)':'transparent'}}>
                          {keys.map((k, idx) => {
                              let val = d[k];
                              if(k.includes('date') || k.includes('Date')) val = formatDate(val);
                              if(k === 'timeRange') val = `${d.startTime} - ${d.endTime}`;
                              if(k === 'income') val = d.transactionType==='ADD' ? d.amount : '-';
                              if(k === 'expense') val = d.transactionType==='USE' ? d.amount : '-';
                              if(k === 'parents') val = `บ:${d.fatherName} ม:${d.motherName}`;
                              if(k === 'filePath') return <td key={k} style={{padding:'12px'}}>{val && <button onClick={()=>setPreviewUrl(`${API}${val}`)} style={{background:'rgba(59, 130, 246, 0.1)', border:'1px solid rgba(59, 130, 246, 0.3)', borderRadius:'50%', width:30, height:30, cursor:'pointer'}}>📎</button>}</td>;
                              return <td key={k} style={{padding:'12px', fontSize:'0.95rem', color:colors.text, borderBottom:'1px solid rgba(255,255,255,0.2)'}}>{val}</td>;
                          })}
                          {currentUser && (
                              <td style={{textAlign:'center', borderBottom:'1px solid rgba(255,255,255,0.2)'}}>
                                  <button onClick={()=>{setForm(d); setEditingId(d.id); setShowForm(true);}} style={{marginRight:8, cursor:'pointer', background:'none', border:'none', fontSize:'1.1rem'}}>✏️</button>
                                  <button onClick={()=>del(d.id)} style={{color:colors.danger, cursor:'pointer', background:'none', border:'none', fontSize:'1.1rem'}}>✖</button>
                              </td>
                          )}
                      </tr>
                  ))}
                  {data.length === 0 && <tr><td colSpan={headers.length+1} style={{padding:30, textAlign:'center', color:'#64748b'}}>ไม่พบข้อมูล</td></tr>}
              </tbody>
          </table>
      </div>
  );

  const renderContent = () => {
      if (tab === 'outgoing-mail') {
          return (
              <div>
                  {Object.entries(groupedReceipts).map(([rNum, group]: any) => (
                       <div key={rNum} style={{...glassStyle, marginBottom: 15, overflow:'hidden'}}>
                           <div style={{padding: 15, background: 'rgba(255,255,255,0.4)', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', flexWrap:'wrap', gap:10}}
                                onClick={() => setExpandedReceipts(prev => prev.includes(rNum) ? prev.filter(x=>x!==rNum) : [...prev, rNum])}>
                                <div style={{display:'flex', gap:10, flexWrap:'wrap', alignItems:'center'}}>
                                    <span style={{fontWeight:'bold', color: colors.primary, fontSize:'1.1rem'}}>🧾 {rNum}</span>
                                    <span style={{color: '#64748b', fontSize:'0.9rem'}}>{formatDate(group.date)}</span>
                                    <span style={{background: 'rgba(255,255,255,0.8)', padding:'2px 10px', borderRadius:20, fontSize:'0.8rem', border:'1px solid #ccc'}}>✉️ {group.count}</span>
                                </div>
                                <div style={{fontWeight:'bold', color: colors.success}}>รวม: {group.totalCost.toLocaleString()} บ.</div>
                           </div>
                           {expandedReceipts.includes(rNum) && (
                               <div style={{overflowX:'auto'}}>
                               <table style={{width:'100%', minWidth:'500px'}}>
                                   <thead style={{background:'rgba(255,255,255,0.2)'}}><tr><th style={{padding:10, textAlign:'left'}}>เรื่อง</th><th style={{padding:10, textAlign:'left'}}>ผู้รับ</th><th style={{padding:10}}>ค่าส่ง</th>{currentUser&&<th style={{padding:10}}>ลบ</th>}</tr></thead>
                                   <tbody>
                                       {group.items.map((item:any) => (
                                           <tr key={item.id} style={{borderTop:'1px solid rgba(0,0,0,0.05)'}}><td style={{padding:10}}>{item.subject}</td><td style={{padding:10}}>{item.recipientName}</td><td style={{padding:10}}>{item.amount}</td>{currentUser && <td style={{padding:10}}><button onClick={()=>del(item.id)} style={{color:'red', border:'none', background:'none', cursor:'pointer'}}>x</button></td>}</tr>
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
                  <div style={{marginBottom:20}}>
                      <button onClick={()=>setMeetingView('calendar')} style={{...glassStyle, padding:'8px 20px', marginRight:10, background: meetingView==='calendar'?colors.primary:'rgba(255,255,255,0.5)', color: meetingView==='calendar'?'white':colors.text, border:'none', cursor:'pointer'}}>ปฏิทิน</button>
                      <button onClick={()=>setMeetingView('list')} style={{...glassStyle, padding:'8px 20px', background: meetingView==='list'?colors.primary:'rgba(255,255,255,0.5)', color: meetingView==='list'?'white':colors.text, border:'none', cursor:'pointer'}}>รายการ</button>
                  </div>
                  {meetingView === 'calendar' ? renderCalendar() : renderStandardTable(['วันที่', 'เวลา', 'ห้อง', 'แผนก', 'เรื่อง'], ['bookingDate', 'timeRange', 'room', 'department', 'purpose'])}
              </div>
          );
      }
      if (tab === 'stamp') {
          return (
              <div>
                  <div style={{...glassStyle, padding:25, marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:15, background: 'linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(255,237,213,0.4) 100%)'}}>
                      <div><div style={{color:'#ea580c', fontSize:'0.9rem', textTransform:'uppercase', letterSpacing:1}}>ยอดเงินคงเหลือ</div><div style={{fontSize:36, fontWeight:'bold', color: stampBalance < 100 ? '#ef4444' : '#ea580c', textShadow:'0 2px 4px rgba(0,0,0,0.1)'}}>{stampBalance.toLocaleString()} <span style={{fontSize:16}}>บาท</span></div></div>
                      {currentUser && <button onClick={()=>{setForm({transactionType:'ADD', date: new Date().toISOString().split('T')[0]}); setShowForm(true);}} style={{background:colors.success, color:'white', padding:'12px 25px', border:'none', borderRadius:30, cursor:'pointer', boxShadow:'0 4px 6px rgba(0,0,0,0.1)'}}>+ ซื้อเพิ่ม</button>}
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
      <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(5px)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:1000, padding:15}}>
          <div style={{...glassStyle, background:'rgba(255,255,255,0.9)', padding:30, width:'100%', maxWidth:'600px', maxHeight:'90vh', overflowY:'auto', boxSizing:'border-box'}}>
              <h3 style={{marginTop:0, borderBottom:`1px solid ${colors.border}`, paddingBottom:15, color:colors.primary, fontSize:'1.4rem'}}>{editingId ? '✏️ แก้ไขข้อมูล' : '➕ เพิ่มรายการใหม่'}</h3>
              <div style={{display:'flex', flexDirection:'column', gap:15}}>
                  
                  {/* Common Date */}
                  <div><label style={{display:'block', marginBottom:8, fontSize:'0.9rem', color:colors.text}}>วันที่</label><input type="date" value={form.date || form.receiveDate || form.bookingDate || form.sendDate || form.effectiveDate || ''} onChange={e=>handleInput(tab.includes('incoming')?'receiveDate':tab==='meeting'?'bookingDate':tab==='outgoing-mail'?'sendDate':tab==='orders'?'effectiveDate':'date', e.target.value)} style={{width:'100%', padding:12, border:'1px solid rgba(0,0,0,0.1)', borderRadius:10, background:'rgba(255,255,255,0.5)', boxSizing:'border-box'}}/></div>

                  {tab === 'outgoing-mail' && <>
                      <div><label style={{display:'block', marginBottom:8, fontSize:'0.9rem'}}>เลขที่ใบเสร็จ</label><input value={form.receiptNumber||''} onChange={e=>handleInput('receiptNumber', e.target.value)} style={{width:'100%', padding:12, border:'1px solid rgba(0,0,0,0.1)', borderRadius:10, background:'rgba(255,255,255,0.5)', boxSizing:'border-box'}}/></div>
                      <div><label style={{display:'block', marginBottom:8, fontSize:'0.9rem'}}>ค่าส่ง (บาท)</label><input type="number" value={form.amount||''} onChange={e=>handleInput('amount', e.target.value)} style={{width:'100%', padding:12, border:'1px solid rgba(0,0,0,0.1)', borderRadius:10, background:'rgba(255,255,255,0.5)', boxSizing:'border-box'}}/></div>
                      <div><label style={{display:'block', marginBottom:8, fontSize:'0.9rem'}}>ผู้รับปลายทาง</label><input value={form.recipientName||''} onChange={e=>handleInput('recipientName', e.target.value)} style={{width:'100%', padding:12, border:'1px solid rgba(0,0,0,0.1)', borderRadius:10, background:'rgba(255,255,255,0.5)', boxSizing:'border-box'}}/></div>
                      <div><label style={{display:'block', marginBottom:8, fontSize:'0.9rem'}}>เรื่อง</label><input value={form.subject||''} onChange={e=>handleInput('subject', e.target.value)} style={{width:'100%', padding:12, border:'1px solid rgba(0,0,0,0.1)', borderRadius:10, background:'rgba(255,255,255,0.5)', boxSizing:'border-box'}}/></div>
                  </>}
                  {/* (ช่องกรอกอื่นๆ ปรับ Style เหมือนกัน) */}
                  {(!['meeting', 'outgoing-mail', 'stamp'].includes(tab) && !tab.includes('ext')) && <>
                      {(tab.includes('incoming') || tab==='orders') && <div><label style={{display:'block', marginBottom:8, fontSize:'0.9rem'}}>เลขที่หนังสือ/คำสั่ง</label><input value={form.docNumber||''} onChange={e=>handleInput('docNumber', e.target.value)} style={{width:'100%', padding:12, border:'1px solid rgba(0,0,0,0.1)', borderRadius:10, background:'rgba(255,255,255,0.5)', boxSizing:'border-box'}}/></div>}
                      <div><label style={{display:'block', marginBottom:8, fontSize:'0.9rem'}}>เรื่อง / ชื่อ</label><input value={form.subject || form.childName || form.deceasedName || ''} onChange={e=>handleInput(tab.includes('reg-birth')?'childName':tab.includes('reg-death')?'deceasedName':'subject', e.target.value)} style={{width:'100%', padding:12, border:'1px solid rgba(0,0,0,0.1)', borderRadius:10, background:'rgba(255,255,255,0.5)', boxSizing:'border-box'}}/></div>
                      {tab.includes('incoming') && <>
                          <div><label style={{display:'block', marginBottom:8, fontSize:'0.9rem'}}>จากหน่วยงาน</label><input value={form.source||''} onChange={e=>handleInput('source', e.target.value)} style={{width:'100%', padding:12, border:'1px solid rgba(0,0,0,0.1)', borderRadius:10, background:'rgba(255,255,255,0.5)', boxSizing:'border-box'}}/></div>
                          <div><label style={{display:'block', marginBottom:8, fontSize:'0.9rem'}}>ถึง</label><input value={form.recipientName||''} onChange={e=>handleInput('recipientName', e.target.value)} style={{width:'100%', padding:12, border:'1px solid rgba(0,0,0,0.1)', borderRadius:10, background:'rgba(255,255,255,0.5)', boxSizing:'border-box'}}/></div>
                          <div><label style={{display:'block', marginBottom:8, fontSize:'0.9rem'}}>Tracking</label><input value={form.trackingNo||''} onChange={e=>handleInput('trackingNo', e.target.value)} style={{width:'100%', padding:12, border:'1px solid rgba(0,0,0,0.1)', borderRadius:10, background:'rgba(255,255,255,0.5)', boxSizing:'border-box'}}/></div>
                      </>}
                  </>}
                  {/* ... (Copy ส่วน Meeting, Stamp, Ext มาปรับ Style เดียวกัน) ... */}
                  {tab === 'meeting' && <>
                  <div style={{display:'flex', gap:10}}>
                       <div style={{flex:1}}><label style={{display:'block', marginBottom:5}}>เริ่ม</label><input type="time" value={form.startTime||''} onChange={e=>handleInput('startTime', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:10}}/></div>
                       <div style={{flex:1}}><label style={{display:'block', marginBottom:5}}>ถึง</label><input type="time" value={form.endTime||''} onChange={e=>handleInput('endTime', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:10}}/></div>
                  </div>
                  <div><label style={{display:'block', marginBottom:5}}>ห้อง</label><select value={form.room||'ห้องทับทิม'} onChange={e=>handleInput('room', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:10}}><option>ห้องทับทิม</option><option>ห้องประชุมชั้น 8</option></select></div>
                  <div><label style={{display:'block', marginBottom:5}}>แผนก</label><input value={form.department||''} onChange={e=>handleInput('department', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:10}}/></div>
                  <div><label style={{display:'block', marginBottom:5}}>วัตถุประสงค์</label><input value={form.purpose||''} onChange={e=>handleInput('purpose', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:10}}/></div>
                  </>}
                  
                  {tab.includes('ext') && <>
                   <div><label style={{display:'block', marginBottom:5}}>เลขที่หนังสือ</label><input value={form.docNumber||''} onChange={e=>handleInput('docNumber', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:10}}/></div>
                   <div><label style={{display:'block', marginBottom:5}}>เรื่อง</label><input value={form.subject||''} onChange={e=>handleInput('subject', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:10}}/></div>
                   <div><label style={{display:'block', marginBottom:5}}>เรียน (ผู้รับ)</label><input value={form.recipientName||''} onChange={e=>handleInput('recipientName', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:10}}/></div>
                  </>}
                  
                  {tab === 'stamp' && <>
                       <div><label style={{display:'block', marginBottom:5}}>รายการ</label><input value={form.reason||''} onChange={e=>handleInput('reason', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:10}}/></div>
                       <div><label style={{display:'block', marginBottom:5}}>จำนวนเงิน</label><input type="number" value={form.amount||''} onChange={e=>handleInput('amount', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:10}}/></div>
                       {form.transactionType !== 'ADD' && <div><label style={{display:'block', marginBottom:5}}>ผู้เบิก</label><input value={form.requester||''} onChange={e=>handleInput('requester', e.target.value)} style={{width:'100%', padding:10, border:'1px solid #ccc', borderRadius:10}}/></div>}
                  </>}

                  <div>
                      <label style={{display:'block', marginBottom:8, fontSize:'0.9rem'}}>แนบไฟล์</label>
                      <input type="file" onChange={e => { if(e.target.files && e.target.files[0]) handleInput('file', e.target.files[0]); }} style={{marginTop:5}} />
                  </div>
              </div>

              <div style={{display:'flex', gap:10, marginTop:30, paddingTop:15, borderTop:`1px solid ${colors.border}`}}>
                  <button onClick={save} style={{flex:1, background:colors.primary, color:'white', padding:14, border:'none', borderRadius:12, cursor:'pointer', fontWeight:'bold', fontSize:'1rem', boxShadow:'0 4px 6px rgba(37,99,235,0.2)'}}>บันทึก</button>
                  <button onClick={()=>setShowForm(false)} style={{flex:1, background:'#f1f5f9', color:colors.text, padding:14, border:'none', borderRadius:12, cursor:'pointer', fontSize:'1rem'}}>ยกเลิก</button>
              </div>
          </div>
      </div>
  );

  // ==================== Main Layout (Background & Grid) ====================
  
  // Login Modal
  if(isLoginModalOpen) return (
      <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(8px)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:2000, padding:15}}>
          <div style={{...glassStyle, padding:40, width:'100%', maxWidth:'360px', boxSizing:'border-box', background:'rgba(255,255,255,0.85)'}}>
              <h3 style={{textAlign:'center', color:colors.primary, fontSize:'1.5rem', marginBottom:20}}>🔐 เข้าสู่ระบบ</h3>
              <input autoFocus placeholder="Username" value={loginForm.username} onChange={e=>setLoginForm({...loginForm, username:e.target.value})} style={{width:'100%', padding:14, marginBottom:15, border:'1px solid #ccc', borderRadius:10, background:'rgba(255,255,255,0.5)', boxSizing:'border-box'}} />
              <input type="password" placeholder="Password" value={loginForm.password} onChange={e=>setLoginForm({...loginForm, password:e.target.value})} style={{width:'100%', padding:14, marginBottom:25, border:'1px solid #ccc', borderRadius:10, background:'rgba(255,255,255,0.5)', boxSizing:'border-box'}} />
              <button onClick={handleLogin} style={{width:'100%', padding:14, background:colors.primary, color:'white', border:'none', borderRadius:12, cursor:'pointer', fontSize:'1rem', fontWeight:'bold', boxShadow:'0 4px 10px rgba(37,99,235,0.3)'}}>{loginLoading?'กำลังตรวจสอบ...':'เข้าสู่ระบบ'}</button>
              <button onClick={()=>setIsLoginModalOpen(false)} style={{width:'100%', marginTop:15, background:'none', border:'none', cursor:'pointer', color:'#64748b'}}>ยกเลิก</button>
          </div>
      </div>
  );

  if(!menuId) return (
      <div style={{padding:'20px', background: 'linear-gradient(135deg, #dbeafe 0%, #eff6ff 50%, #f3e8ff 100%)', minHeight:'100vh', fontFamily:'Sarabun, sans-serif', boxSizing:'border-box'}}>
          <div style={{display:'flex', flexWrap:'wrap', justifyContent:'space-between', alignItems:'center', marginBottom:40, gap:20}}>
               <h1 style={{color: '#1e3a8a', margin:0, fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', textShadow:'0 2px 4px rgba(0,0,0,0.1)'}}>🏥 Hospital E-Saraban</h1>
               <div style={{flexShrink:0}}>
                   {currentUser ? (
                       <div style={{...glassStyle, padding:'8px 15px', display:'flex', alignItems:'center', gap:10}}>
                           <span style={{fontWeight:'bold', color:colors.primary}}>👤 {currentUser.fullname}</span>
                           <button onClick={handleLogout} style={{color:colors.danger, cursor:'pointer', border:'none', background:'none', fontSize:'0.9rem', fontWeight:'bold'}}>Logout</button>
                       </div>
                   ) : (
                       <button onClick={()=>setIsLoginModalOpen(true)} style={{...glassStyle, padding:'10px 20px', cursor:'pointer', color:colors.primary, fontWeight:'bold'}}>🔐 Login</button>
                   )}
               </div>
          </div>
          
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:25, maxWidth:1200, margin:'0 auto'}}>
              {mainMenu.map(m => (
                  <div key={m.id} onClick={()=>{ setMenuId(m.id); if(m.sub.length) setTab(m.sub[0].id); }} 
                       style={{...glassStyle, padding: 30, cursor:'pointer', textAlign:'center', minHeight:160, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', transition:'all 0.3s ease', transform:'translateY(0)'}}
                       onMouseEnter={e=>e.currentTarget.style.transform='translateY(-5px)'} onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}>
                      <div style={{fontSize: '3rem', marginBottom: 15, filter:'drop-shadow(0 4px 6px rgba(0,0,0,0.1))'}}>{m.icon}</div>
                      <div style={{fontSize: '1.1rem', fontWeight:'bold', color:colors.text}}>{m.title}</div>
                  </div>
              ))}
          </div>
      </div>
  );

  const currentMenu = mainMenu.find(m => m.id === menuId);
  return (
    <div style={{padding:'10px', background: 'linear-gradient(135deg, #dbeafe 0%, #eff6ff 50%, #f3e8ff 100%)', minHeight:'100vh', fontFamily:'Sarabun, sans-serif', boxSizing:'border-box', maxWidth:'100vw', overflowX:'hidden'}}>
        
        {/* Header Content */}
        <div style={{display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between', marginBottom:20, gap:10}}>
            <div style={{display:'flex', alignItems:'center', gap:10, flexGrow:1}}>
                <button onClick={()=>setMenuId(null)} style={{...glassStyle, padding:'8px 15px', cursor:'pointer', fontSize:'1.2rem', color:colors.text}}>⬅</button>
                <span style={{fontSize:'1.3rem', fontWeight:'bold', color:colors.primary, textShadow:'0 1px 2px rgba(255,255,255,0.8)'}}>{currentMenu?.title}</span>
            </div>
            {currentUser && <div style={{...glassStyle, padding:'5px 12px', fontSize:'0.85rem', textAlign:'right'}}>👤 {currentUser.fullname.split(' ')[0]} <br/><span onClick={handleLogout} style={{color:colors.danger, cursor:'pointer', fontWeight:'bold'}}>ออกจากระบบ</span></div>}
        </div>
        
        {/* Tabs */}
        <div style={{marginBottom: 20, display:'flex', gap:10, overflowX:'auto', paddingBottom:5, scrollbarWidth:'none'}}>
            {currentMenu?.sub.map(s => (
                <button key={s.id} onClick={()=>setTab(s.id)} style={{
                    ...glassStyle, padding:'10px 20px', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
                    background: tab===s.id ? colors.primary : 'rgba(255,255,255,0.5)', color: tab===s.id ? 'white' : colors.text,
                    border: tab===s.id ? 'none' : glassStyle.border, fontWeight: tab===s.id ? 'bold' : 'normal'
                }}>
                    {s.label}
                </button>
            ))}
        </div>

        {/* Action Bar */}
        <div style={{...glassStyle, padding:15, marginBottom:20, display:'flex', gap:10, flexWrap:'wrap', alignItems:'center'}}>
            {currentUser && <button onClick={handleMainAdd} style={{background: colors.secondary, color:'white', padding:'10px 20px', border:'none', borderRadius:10, cursor:'pointer', flexGrow:1, minWidth:'120px', fontWeight:'bold', boxShadow:'0 4px 6px rgba(8,145,178,0.2)'}}>+ เพิ่มรายการ</button>}
            
            <div style={{display:'flex', gap:5, flexGrow: 999, minWidth:'200px', width:'100%'}}>
                <input placeholder="ค้นหา..." value={tempSearchTerm} onChange={e=>setTempSearchTerm(e.target.value)} style={{padding:'10px', border:'1px solid rgba(0,0,0,0.1)', borderRadius:10, width:'100%', background:'rgba(255,255,255,0.5)'}} />
                <button onClick={()=>setActiveSearchTerm(tempSearchTerm)} style={{cursor:'pointer', border:'none', background:'rgba(255,255,255,0.5)', borderRadius:10, padding:'0 15px'}}>🔍</button>
            </div>
            
            <div style={{display:'flex', gap:5, marginLeft:'auto', flexGrow:0}}>
                <button onClick={()=>handleExport('excel')} style={{background:colors.success, color:'white', border:'none', padding:'10px 15px', borderRadius:10, cursor:'pointer', fontSize:'0.9rem', boxShadow:'0 2px 4px rgba(5,150,105,0.2)'}}>Excel</button>
                <button onClick={()=>handleExport('pdf')} style={{background:colors.danger, color:'white', border:'none', padding:'10px 15px', borderRadius:10, cursor:'pointer', fontSize:'0.9rem', boxShadow:'0 2px 4px rgba(225,29,72,0.2)'}}>PDF</button>
            </div>
        </div>

        {/* Content */}
        <div style={{width:'100%', overflowX:'hidden'}}>
            {renderContent()}
        </div>

        {/* Modals */}
        {showForm && renderFormModal()}
        {previewUrl && <div style={{position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.8)', backdropFilter:'blur(5px)', zIndex: 3000, display:'flex', justifyContent:'center', alignItems:'center', padding:10}}>
            <div style={{width:'100%', height:'100%', maxWidth:'800px', maxHeight:'90vh', background:'white', position:'relative', borderRadius:10, overflow:'hidden', boxShadow:'0 20px 50px rgba(0,0,0,0.5)'}}>
                 <button onClick={()=>setPreviewUrl(null)} style={{position:'absolute', right:15, top:15, background:'red', color:'white', borderRadius:'50%', width:35, height:35, cursor:'pointer', border:'2px solid white', fontWeight:'bold', zIndex:10, boxShadow:'0 2px 5px rgba(0,0,0,0.3)'}}>X</button>
                 <iframe src={previewUrl} width="100%" height="100%" style={{border:'none'}} />
            </div>
        </div>}
    </div>
  );
}
