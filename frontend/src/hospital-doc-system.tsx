import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// 🔗 ลิงก์ Server
const API = 'https://hospital-doc-system.onrender.com';

// ==================== UI Constants ====================
const colors = {
  primary: '#1e3a8a', secondary: '#2563eb', success: '#16a34a',
  danger: '#dc2626', bg: '#f1f5f9', card: '#ffffff', text: '#334155', border: '#cbd5e1',
  roomRuby: '#fee2e2', roomRubyText: '#991b1b', // สีห้องทับทิม
  room8: '#dbeafe', room8Text: '#1e40af'        // สีห้องชั้น 8
};

const formatDate = (d: string) => {
    if(!d) return '-';
    const date = new Date(d);
    if(isNaN(date.getTime())) return '-';
    return `${date.getDate()}/${date.getMonth()+1}/${date.getFullYear()+543}`;
};

const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

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
  const [menuId, setMenuId] = useState<number | null>(null);
  const [tab, setTab] = useState<string>('');
  const [data, setData] = useState<any[]>([]);
  const [form, setForm] = useState<any>({});
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string|null>(null);

  // --- View State (Calendar/List) & Search ---
  const [meetingView, setMeetingView] = useState<'calendar' | 'list'>('calendar');
  const [calDate, setCalDate] = useState(new Date());
  const [expandedReceipts, setExpandedReceipts] = useState<string[]>([]); // สำหรับไปรษณีย์
  const [activeSearchTerm, setActiveSearchTerm] = useState('');
  const [tempSearchTerm, setTempSearchTerm] = useState('');
  const [stampBalance, setStampBalance] = useState(0);

  // --- Init ---
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

        // คำนวณยอดอากรคงเหลือ (ถ้าเป็นหมวดอากร)
        if(tab === 'stamp') {
            let bal = 0;
            rawData.forEach((d:any) => {
                if(d.transactionType === 'ADD') bal += (d.amount || 0);
                else bal -= (d.amount || 0);
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

  // --- Login Logic ---
  const handleLogin = async (e?: React.FormEvent) => {
      if(e) e.preventDefault();
      setLoginLoading(true);
      try {
          const res = await axios.post(`${API}/login`, loginForm);
          setCurrentUser(res.data);
          localStorage.setItem('hospital_user', JSON.stringify(res.data));
          setIsLoginModalOpen(false);
          setLoginForm({ username: '', password: '' });
          alert(`ยินดีต้อนรับ: ${res.data.fullname} ✅`);
      } catch (err: any) {
          alert(`เข้าสู่ระบบไม่สำเร็จ: ${err.response?.data?.error || 'เชื่อมต่อ Server ไม่ได้'}`);
      } finally { setLoginLoading(false); }
  };

  const handleLogout = () => {
      if(confirm('ยืนยันออกจากระบบ?')) { setCurrentUser(null); localStorage.removeItem('hospital_user'); }
  };

  // --- Action Logic ---
  const handleInput = (k: string, v: any) => setForm((p:any) => ({...p, [k]: v}));

  const save = async () => {
      try {
          const fd = new FormData();
          // Auto-fill logic
          if(tab === 'stamp' && !form.transactionType) form.transactionType = 'USE';
          
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
      try { await axios.delete(`${API}/docs/${tab}/${id}`); loadData(); } catch(e) { alert('ลบไม่สำเร็จ!'); }
  };

  // --- Export Logic ---
  const handleExport = (type: 'excel' | 'pdf') => {
      if(data.length === 0) return alert('ไม่พบข้อมูล');
      let headers: string[] = [];
      let body: any[] = [];

      // กำหนดหัวตารางตามหมวดงาน
      if(tab.includes('incoming')) {
          headers = ['วันที่รับ', 'เลขที่หนังสือ', 'จาก', 'ถึง', 'เรื่อง'];
          body = data.map(d => [formatDate(d.receiveDate), d.docNumber, d.source, d.recipientName, d.subject]);
      } else if (tab === 'outgoing-mail') {
          headers = ['วันที่ส่ง', 'เลขที่ใบเสร็จ', 'เรื่อง', 'ผู้รับปลายทาง', 'ค่าส่ง (บาท)'];
          body = data.map(d => [formatDate(d.sendDate), d.receiptNumber, d.subject, d.recipientName, d.amount]);
      } else if (tab === 'meeting') {
          headers = ['วันที่จอง', 'เวลา', 'ห้อง', 'แผนก', 'วัตถุประสงค์'];
          body = data.map(d => [formatDate(d.bookingDate), `${d.startTime}-${d.endTime}`, d.room, d.department, d.purpose]);
      } else {
          headers = ['วันที่', 'รายละเอียด', 'หมายเหตุ'];
          body = data.map(d => [formatDate(d.date||d.createdAt), d.subject||d.docNumber, d.remark||'-']);
      }

      if (type === 'excel') {
          const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Report");
          XLSX.writeFile(wb, `Report_${tab}.xlsx`);
      } else {
          const doc = new jsPDF() as any;
          doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal'); // Note: ต้องมี Font ในโปรเจกต์ถึงจะแสดงไทยได้ (ในโค้ดนี้อาจจะไม่แสดงไทยถ้าไม่มีไฟล์ฟอนต์)
          doc.text(`Report: ${tab}`, 10, 10);
          doc.autoTable({ head: [headers], body: body, startY: 20 });
          doc.save(`Report_${tab}.pdf`);
      }
  };

  // --- Helper: Grouping Data for Outgoing Mail ---
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

  // ==================== Render Functions ====================

  // 1. Render Table Content (Logic แยกตามหมวดงาน)
  const renderContent = () => {
      // 📮 หมวดไปรษณีย์ (จัดกลุ่มตามใบเสร็จ)
      if (tab === 'outgoing-mail') {
          return (
              <div>
                   {Object.entries(groupedReceipts).map(([rNum, group]: any) => (
                       <div key={rNum} style={{marginBottom: 15, border: `1px solid ${colors.secondary}`, borderRadius: 8, overflow:'hidden'}}>
                           <div style={{padding: 10, background: '#eff6ff', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer'}}
                                onClick={() => setExpandedReceipts(prev => prev.includes(rNum) ? prev.filter(x=>x!==rNum) : [...prev, rNum])}>
                                <div>
                                    <span style={{fontWeight:'bold', color: colors.primary}}>🧾 ใบเสร็จ: {rNum}</span>
                                    <span style={{marginLeft: 15, color: '#64748b'}}>วันที่: {formatDate(group.date)}</span>
                                    <span style={{marginLeft: 15, background: 'white', padding:'2px 8px', borderRadius:10, fontSize:12, border:'1px solid #ccc'}}>✉️ {group.count} ฉบับ</span>
                                </div>
                                <div style={{fontWeight:'bold', color: colors.success}}>รวม: {group.totalCost.toLocaleString()} บาท {expandedReceipts.includes(rNum) ? '▲' : '▼'}</div>
                           </div>
                           {expandedReceipts.includes(rNum) && (
                               <table style={{width:'100%', borderCollapse:'collapse'}}>
                                   <thead style={{background:'#f8fafc'}}><tr><th style={{padding:8, textAlign:'left'}}>เรื่อง</th><th style={{padding:8, textAlign:'left'}}>ผู้รับ</th><th style={{padding:8}}>ค่าส่ง</th><th style={{padding:8}}>จัดการ</th></tr></thead>
                                   <tbody>
                                       {group.items.map((item:any) => (
                                           <tr key={item.id} style={{borderTop:'1px solid #eee'}}>
                                               <td style={{padding:8}}>{item.subject}</td>
                                               <td style={{padding:8}}>{item.recipientName}</td>
                                               <td style={{padding:8, textAlign:'center'}}>{item.amount}</td>
                                               {currentUser && <td style={{padding:8, textAlign:'center'}}><button onClick={()=>del(item.id)} style={{color:'red', border:'none', background:'none', cursor:'pointer'}}>ลบ</button></td>}
                                           </tr>
                                       ))}
                                   </tbody>
                               </table>
                           )}
                       </div>
                   ))}
              </div>
          );
      }

      // 📅 หมวดห้องประชุม (Calendar / List View)
      if (tab === 'meeting') {
          const renderCalendar = () => {
              const year = calDate.getFullYear();
              const month = calDate.getMonth();
              const daysInMonth = new Date(year, month + 1, 0).getDate();
              const firstDay = new Date(year, month, 1).getDay();

              return (
                  <div>
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                          <button onClick={()=>setCalDate(new Date(year, month-1, 1))}>◀ เดือนก่อน</button>
                          <h3 style={{margin:0}}>{months[month]} {year+543}</h3>
                          <button onClick={()=>setCalDate(new Date(year, month+1, 1))}>เดือนหน้า ▶</button>
                      </div>
                      <div style={{display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:1, background:'#ccc', border:'1px solid #ccc'}}>
                          {['อา','จ','อ','พ','พฤ','ศ','ส'].map(d=><div key={d} style={{background:colors.primary, color:'white', textAlign:'center', padding:5}}>{d}</div>)}
                          {[...Array(firstDay)].map((_,i)=><div key={`empty-${i}`} style={{background:'white', height:100}}></div>)}
                          {[...Array(daysInMonth)].map((_,i) => {
                              const day = i+1;
                              const bookings = data.filter((b:any) => {
                                  const d = new Date(b.bookingDate);
                                  return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
                              });
                              return (
                                  <div key={day} style={{background:'white', height:100, padding:5, overflowY:'auto'}}>
                                      <div style={{fontWeight:'bold', textAlign:'right', fontSize:12, marginBottom:2}}>{day}</div>
                                      {bookings.map((b:any) => (
                                          <div key={b.id} style={{fontSize:10, padding:2, marginBottom:2, borderRadius:3, 
                                               background: b.room?.includes('ทับทิม') ? colors.roomRuby : colors.room8,
                                               color: b.room?.includes('ทับทิม') ? colors.roomRubyText : colors.room8Text,
                                               cursor:'pointer'}}
                                               onClick={()=>{if(currentUser){setForm(b); setEditingId(b.id); setShowForm(true);}}}>
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

          return (
              <div>
                  <div style={{marginBottom:15}}>
                      <button onClick={()=>setMeetingView('calendar')} style={{padding:'5px 15px', marginRight:5, background: meetingView==='calendar'?colors.primary:'white', color: meetingView==='calendar'?'white':'black', border:'1px solid #ccc'}}>ปฏิทิน</button>
                      <button onClick={()=>setMeetingView('list')} style={{padding:'5px 15px', background: meetingView==='list'?colors.primary:'white', color: meetingView==='list'?'white':'black', border:'1px solid #ccc'}}>รายการ</button>
                  </div>
                  {meetingView === 'calendar' ? renderCalendar() : renderStandardTable(['วันที่', 'เวลา', 'ห้อง', 'แผนก', 'เรื่อง', 'ไฟล์'], ['bookingDate', 'timeRange', 'room', 'department', 'purpose', 'filePath'])}
              </div>
          );
      }

      // 🎫 หมวดอากรแสตมป์
      if (tab === 'stamp') {
          return (
              <div>
                  <div style={{background:'#fff7ed', border:'1px solid #fdba74', padding:20, borderRadius:10, marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                      <div>
                          <div style={{color:'#9a3412', fontSize:14}}>ยอดเงินคงเหลือ</div>
                          <div style={{fontSize:36, fontWeight:'bold', color: stampBalance < 100 ? 'red' : '#ea580c'}}>{stampBalance.toLocaleString()} บาท</div>
                      </div>
                      {currentUser && <button onClick={()=>{setForm({transactionType:'ADD', date: new Date().toISOString().split('T')[0]}); setShowForm(true);}} style={{background:colors.success, color:'white', padding:'10px 20px', border:'none', borderRadius:5, cursor:'pointer'}}>+ ซื้อเพิ่ม</button>}
                  </div>
                  {renderStandardTable(['วันที่', 'รายการ', 'รับ', 'จ่าย', 'ผู้เบิก'], ['date', 'reason', 'income', 'expense', 'requester'])}
              </div>
          );
      }

      // 📄 หมวดทั่วไป (รับเข้า / ราษฎร์ / ภายนอก) - ใช้ตารางมาตรฐาน
      let headers = ['วันที่', 'เรื่อง/รายละเอียด', 'ไฟล์'];
      let keys = ['date', 'subject', 'filePath'];

      if(tab.includes('incoming')) { headers = ['วันที่รับ', 'เลขที่หนังสือ', 'จาก', 'ถึง', 'เรื่อง', 'Tracking', 'ไฟล์']; keys = ['receiveDate', 'docNumber', 'source', 'recipientName', 'subject', 'trackingNo', 'filePath']; }
      if(tab.includes('reg-birth')) { headers = ['เกิดวันที่', 'เวลา', 'ชื่อเด็ก', 'ชื่อบิดา-มารดา', 'ไฟล์']; keys = ['date', 'time', 'childName', 'parents', 'filePath']; }
      if(tab.includes('reg-death')) { headers = ['เสียชีวิตวันที่', 'เวลา', 'ชื่อผู้เสียชีวิต', 'สาเหตุ', 'จัดการศพ']; keys = ['date', 'time', 'deceasedName', 'cause', 'funeral']; }

      return renderStandardTable(headers, keys);
  };

  // Helper: Standard Table Renderer
  const renderStandardTable = (headers: string[], keys: string[]) => (
      <div style={{overflowX:'auto'}}>
      <table style={{width:'100%', borderCollapse:'collapse', background:'white'}}>
          <thead style={{background:'#e2e8f0'}}><tr>{headers.map(h=><th key={h} style={{padding:10, textAlign:'left', color:colors.primary}}>{h}</th>)}{currentUser && <th style={{width:80}}>จัดการ</th>}</tr></thead>
          <tbody>
              {data.filter(d => JSON.stringify(d).toLowerCase().includes(activeSearchTerm.toLowerCase())).map((d, i) => (
                  <tr key={d.id} style={{borderBottom:'1px solid #eee', background: i%2===0?'white':'#f8fafc'}}>
                      {keys.map((k, idx) => {
                          let val = d[k];
                          if(k === 'date' || k === 'receiveDate' || k === 'bookingDate') val = formatDate(val);
                          if(k === 'timeRange') val = `${d.startTime} - ${d.endTime}`;
                          if(k === 'income') val = d.transactionType==='ADD' ? d.amount : '-';
                          if(k === 'expense') val = d.transactionType==='USE' ? d.amount : '-';
                          if(k === 'parents') val = `บ:${d.fatherName} ม:${d.motherName}`;
                          if(k === 'filePath') return <td key={k}>{val && <button onClick={()=>setPreviewUrl(`${API}${val}`)}>📎</button>}</td>;
                          return <td key={k} style={{padding:10}}>{val}</td>;
                      })}
                      {currentUser && (
                          <td style={{textAlign:'center'}}>
                              <button onClick={()=>{setForm(d); setEditingId(d.id); setShowForm(true);}} style={{marginRight:5, cursor:'pointer'}}>✏️</button>
                              <button onClick={()=>del(d.id)} style={{color:'red', cursor:'pointer'}}>✖</button>
                          </td>
                      )}
                  </tr>
              ))}
          </tbody>
      </table>
      </div>
  );

  // 4. Modal Form (Dynamic Inputs)
  const renderFormModal = () => (
      <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:1000}}>
          <div style={{background:'white', padding:20, borderRadius:10, width:500, maxHeight:'90vh', overflowY:'auto'}}>
              <h3>{editingId ? 'แก้ไข' : 'เพิ่ม'} ข้อมูล</h3>
              
              {/* Common Fields */}
              <div style={{marginBottom:10}}><label>วันที่</label><input type="date" value={form.date || form.receiveDate || form.bookingDate || form.sendDate || ''} onChange={e=>handleInput(tab.includes('incoming')?'receiveDate':tab==='meeting'?'bookingDate':tab==='outgoing-mail'?'sendDate':'date', e.target.value)} style={{width:'100%', padding:8, border:'1px solid #ccc'}}/></div>
              
              {/* Conditional Fields */}
              {tab === 'outgoing-mail' && <>
                  <div style={{marginBottom:10}}><label>เลขที่ใบเสร็จ</label><input value={form.receiptNumber||''} onChange={e=>handleInput('receiptNumber', e.target.value)} style={{width:'100%', padding:8, border:'1px solid #ccc'}}/></div>
                  <div style={{marginBottom:10}}><label>ค่าส่ง (บาท)</label><input type="number" value={form.amount||''} onChange={e=>handleInput('amount', e.target.value)} style={{width:'100%', padding:8, border:'1px solid #ccc'}}/></div>
                  <div style={{marginBottom:10}}><label>ผู้รับปลายทาง</label><input value={form.recipientName||''} onChange={e=>handleInput('recipientName', e.target.value)} style={{width:'100%', padding:8, border:'1px solid #ccc'}}/></div>
              </>}

              {tab === 'meeting' && <>
                  <div style={{display:'flex', gap:10}}>
                       <div style={{flex:1}}><label>เริ่ม</label><input type="time" value={form.startTime||''} onChange={e=>handleInput('startTime', e.target.value)} style={{width:'100%', padding:8, border:'1px solid #ccc'}}/></div>
                       <div style={{flex:1}}><label>ถึง</label><input type="time" value={form.endTime||''} onChange={e=>handleInput('endTime', e.target.value)} style={{width:'100%', padding:8, border:'1px solid #ccc'}}/></div>
                  </div>
                  <div style={{marginBottom:10}}><label>ห้อง</label><select value={form.room||'ห้องทับทิม'} onChange={e=>handleInput('room', e.target.value)} style={{width:'100%', padding:8, border:'1px solid #ccc'}}><option>ห้องทับทิม</option><option>ห้องประชุมชั้น 8</option></select></div>
                  <div style={{marginBottom:10}}><label>แผนก</label><input value={form.department||''} onChange={e=>handleInput('department', e.target.value)} style={{width:'100%', padding:8, border:'1px solid #ccc'}}/></div>
                  <div style={{marginBottom:10}}><label>วัตถุประสงค์</label><input value={form.purpose||''} onChange={e=>handleInput('purpose', e.target.value)} style={{width:'100%', padding:8, border:'1px solid #ccc'}}/></div>
              </>}

              {/* Generic Inputs for Others */}
              {!['meeting', 'outgoing-mail'].includes(tab) && <>
                  <div style={{marginBottom:10}}><label>เรื่อง / ชื่อ / รายละเอียด</label><input value={form.subject || form.childName || form.deceasedName || form.reason || ''} onChange={e=>handleInput(tab.includes('reg-birth')?'childName':tab.includes('reg-death')?'deceasedName':tab==='stamp'?'reason':'subject', e.target.value)} style={{width:'100%', padding:8, border:'1px solid #ccc'}}/></div>
                  {(tab.includes('incoming') || tab.includes('ext')) && <div style={{marginBottom:10}}><label>เลขที่หนังสือ</label><input value={form.docNumber||''} onChange={e=>handleInput('docNumber', e.target.value)} style={{width:'100%', padding:8, border:'1px solid #ccc'}}/></div>}
                  {tab.includes('incoming') && <div style={{marginBottom:10}}><label>จากหน่วยงาน</label><input value={form.source||''} onChange={e=>handleInput('source', e.target.value)} style={{width:'100%', padding:8, border:'1px solid #ccc'}}/></div>}
              </>}

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
  );

  // ==================== Main Render ====================
  // Login Modal
  if(isLoginModalOpen) return (
      <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:2000}}>
          <form onSubmit={handleLogin} style={{background:'white', padding:30, borderRadius:10, width:350}}>
              <h3 style={{textAlign:'center'}}>🔐 เข้าสู่ระบบ</h3>
              <input autoFocus placeholder="Username" value={loginForm.username} onChange={e=>setLoginForm({...loginForm, username:e.target.value})} style={{width:'100%', padding:10, marginBottom:10}} />
              <input type="password" placeholder="Password" value={loginForm.password} onChange={e=>setLoginForm({...loginForm, password:e.target.value})} style={{width:'100%', padding:10, marginBottom:20}} />
              <button type="submit" style={{width:'100%', padding:10, background:colors.primary, color:'white', border:'none', cursor:'pointer'}}>{loginLoading?'...':'Login'}</button>
              <button type="button" onClick={()=>setIsLoginModalOpen(false)} style={{width:'100%', marginTop:10, background:'none', border:'none', cursor:'pointer'}}>Cancel</button>
          </form>
      </div>
  );

  // Home Menu Grid
  if(!menuId) return (
      <div style={{padding: 20, background: colors.bg, minHeight:'100vh', fontFamily:'Sarabun, sans-serif'}}>
          <div style={{display:'flex', justifyContent:'center', alignItems:'center', marginBottom:30, position:'relative'}}>
               <h1 style={{color: '#1e293b'}}>🏥 Hospital E-Saraban System</h1>
               <div style={{position:'absolute', right:0}}>
                   {currentUser ? (
                       <span>👤 {currentUser.fullname} <button onClick={handleLogout} style={{color:'red', cursor:'pointer', border:'none', background:'none'}}>Logout</button></span>
                   ) : (
                       <button onClick={()=>setIsLoginModalOpen(true)} style={{padding:'5px 15px', cursor:'pointer'}}>🔐 Login</button>
                   )}
               </div>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(250px, 1fr))', gap:20, maxWidth:1200, margin:'0 auto'}}>
              {mainMenu.map(m => (
                  <div key={m.id} onClick={()=>{ setMenuId(m.id); if(m.sub.length) setTab(m.sub[0].id); }} 
                       style={{background: 'white', padding: 30, borderRadius: 15, cursor:'pointer', textAlign:'center', boxShadow:'0 2px 5px rgba(0,0,0,0.05)', height:150, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center'}}>
                      <div style={{fontSize: 40, marginBottom: 10}}>{m.icon}</div>
                      <div style={{fontSize: 18, fontWeight:'bold'}}>{m.title}</div>
                  </div>
              ))}
          </div>
      </div>
  );

  // Content Page
  const currentMenu = mainMenu.find(m => m.id === menuId);
  return (
    <div style={{padding: 20, background: colors.bg, minHeight:'100vh', fontFamily:'Sarabun, sans-serif'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20}}>
            <div>
                <button onClick={()=>setMenuId(null)} style={{background:'white', border:'1px solid #ccc', padding:'5px 15px', marginRight:10, cursor:'pointer'}}>⬅ หน้าหลัก</button>
                <span style={{fontSize:20, fontWeight:'bold'}}>{currentMenu?.title}</span>
            </div>
            {currentUser && <div>👤 {currentUser.fullname} <button onClick={handleLogout} style={{color:'red', cursor:'pointer', border:'none', background:'none'}}>Logout</button></div>}
        </div>
        
        <div style={{marginBottom: 20}}>
            {currentMenu?.sub.map(s => (
                <button key={s.id} onClick={()=>setTab(s.id)} style={{padding:'8px 20px', border:'none', borderRadius:20, marginRight:10, cursor:'pointer', background: tab===s.id ? '#1e293b' : '#cbd5e1', color: tab===s.id ? 'white' : 'black'}}>
                    {s.label}
                </button>
            ))}
        </div>

        <div style={{background:'white', padding:15, borderRadius:10, marginBottom:20, display:'flex', gap:10}}>
            {currentUser && <button onClick={()=>{setShowForm(true); setEditingId(null); setForm({});}} style={{background: colors.secondary, color:'white', padding:'8px 15px', border:'none', borderRadius:5, cursor:'pointer'}}>+ เพิ่มรายการ</button>}
            <div style={{flexGrow:1}} />
            <input placeholder="ค้นหา..." value={tempSearchTerm} onChange={e=>setTempSearchTerm(e.target.value)} style={{padding:8, border:'1px solid #ccc'}} />
            <button onClick={()=>setActiveSearchTerm(tempSearchTerm)} style={{cursor:'pointer'}}>🔍</button>
            <button onClick={()=>handleExport('excel')} style={{background:colors.success, color:'white', border:'none', padding:'5px 10px', borderRadius:5, cursor:'pointer'}}>Excel</button>
            <button onClick={()=>handleExport('pdf')} style={{background:colors.danger, color:'white', border:'none', padding:'5px 10px', borderRadius:5, cursor:'pointer'}}>PDF</button>
        </div>

        {renderContent()}
        {showForm && renderFormModal()}
        {previewUrl && <div style={{position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.9)', zIndex: 3000, display:'flex', justifyContent:'center', alignItems:'center'}}>
            <div style={{width:'90%', height:'90%', background:'white', position:'relative'}}>
                 <button onClick={()=>setPreviewUrl(null)} style={{position:'absolute', right:-15, top:-15, background:'red', color:'white', borderRadius:'50%', width:30, height:30, cursor:'pointer', border:'2px solid white'}}>X</button>
                 <iframe src={previewUrl} width="100%" height="100%" />
            </div>
        </div>}
    </div>
  );
}
