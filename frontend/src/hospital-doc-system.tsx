import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// ⚠️ IP Address ของเครื่อง Host (Server)
const API_IP = '192.168.203.16'; 
const API = 'https://hospital-doc-system.onrender.com';

// ==================== Interfaces ====================
interface DocumentBase { id: number; filePath?: string; createdAt?: string; [key: string]: any; }

interface IncomingMail extends DocumentBase {
  seq: number; receiveDate: string; docNumber: string; source: string; 
  subject: string; receiver: string; 
  mailType: 'ธรรมดา' | 'ลงทะเบียน' | 'EMS'; trackingNo?: string;
}

interface OutgoingMail extends DocumentBase {
  sendDate: string; receiptNumber: string; subject: string; recipientName: string;
  senderOfficer: string; requestingDept: string; amount: number; trackingNo?: string;
}

interface ExternalDoc extends DocumentBase {
  docNumber: string; issueDate: string; subject: string; recipient: string;
  issuingDept: string; reference?: string;
}

interface StampUsage extends DocumentBase {
  transactionType: 'ADD' | 'USE'; 
  date: string; reason: string; requestingDept: string; requester: string;
  amount: number; // บาท
}

interface RegistryData extends DocumentBase {
  dataType: 'birth' | 'death';
  seq: string; date: string; time: string;
  childName?: string; motherName?: string; fatherName?: string;
  deceasedName?: string; cause?: string; unit?: string; 
  isForensic?: boolean; funeralType?: string; funeralLocation?: string;
}

interface MeetingBooking extends DocumentBase {
    bookingDate: string; startTime: string; endTime: string;
    department: string; purpose: string; pax: number;
    room: 'ห้องทับทิม' | 'ห้องประชุมชั้น 8';
}

interface HospitalOrder extends DocumentBase {
    docNumber: string; effectiveDate: string; subject: string;
}

type FormType = IncomingMail | OutgoingMail | ExternalDoc | StampUsage | RegistryData | MeetingBooking | HospitalOrder | any;

// ==================== Constants ====================
const colors = {
  primary: '#0e7490', secondary: '#3b82f6', success: '#16a34a',
  danger: '#dc2626', bg: '#f8fafc', card: '#ffffff', text: '#334155',
  border: '#94a3b8', header: '#cbd5e1'
};

const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

const mainMenu = [
    { id: 1, title: 'ทะเบียนจดหมายรับเข้า', icon: '📥', sub: [
        { id: 'incoming-director', label: 'รับเข้า (ผู้อำนวยการ)' },
        { id: 'incoming-general', label: 'รับเข้า (หน่วยงานทั่วไป)' }
    ]},
    { id: 2, title: 'ทะเบียนจดหมายส่งออก (ไปรษณีย์)', icon: '📮', sub: [{ id: 'outgoing-mail', label: 'ไปรษณีย์ส่งออก' }]},
    { id: 3, title: 'หนังสือภายนอก', icon: '📤', sub: [
        { id: 'ext-wrpk', label: 'หนังสือ รพ.วรปก.' },
        { id: 'ext-wrpk-sp', label: 'หนังสือ รพ.วรปก.สป' }
    ]},
    { id: 4, title: 'ทะเบียนคำสั่ง/แต่งตั้ง', icon: '📜', sub: [{ id: 'orders', label: 'คำสั่งภายใน' }]},
    { id: 5, title: 'ทะเบียนราษฎร์', icon: '👶', sub: [
        { id: 'reg-birth', label: 'แจ้งเกิด' },
        { id: 'reg-death', label: 'แจ้งตาย' }
    ]},
    { id: 6, title: 'คุมอากรแสตมป์', icon: '🎫', sub: [{ id: 'stamp', label: 'การ์ดคุมอากร' }]},
    { id: 7, title: 'การจองใช้ห้องประชุม', icon: '📅', sub: [{ id: 'meeting', label: 'ตารางการใช้ห้อง' }]},
];

const formatDate = (d: string) => {
    if(!d) return '-';
    const date = new Date(d);
    if(isNaN(date.getTime())) return '-';
    return `${date.getDate()}/${date.getMonth()+1}/${date.getFullYear()+543}`;
};

// ==================== Main Component ====================
export default function HospitalDocSystem() {
  const [menuId, setMenuId] = useState<number | null>(null);
  const [tab, setTab] = useState<string>('');
  
  const [data, setData] = useState<any[]>([]);
  const [form, setForm] = useState<FormType>({});
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string|null>(null);

  // Search
  const [tempSearchTerm, setTempSearchTerm] = useState('');
  const [activeSearchTerm, setActiveSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('subject'); 

  // Specific States
  const [currentReceiptNo, setCurrentReceiptNo] = useState(''); 
  const [expandedReceipts, setExpandedReceipts] = useState<string[]>([]); // ใช้ร่วมกับ Group วันที่รับเข้าด้วย
  const [stampBalance, setStampBalance] = useState(0);
  const [showAddStock, setShowAddStock] = useState(false);
  
  // Meeting View State
  const [meetingView, setMeetingView] = useState<'calendar' | 'list'>('calendar'); 
  const [calDate, setCalDate] = useState(new Date()); 

  // --- Init ---
  useEffect(() => {
     if(menuId) {
         const m = mainMenu.find(x => x.id === menuId);
         if(m && m.sub.length > 0) setTab(m.sub[0].id);
     }
  }, [menuId]);

  const loadData = useCallback(async () => {
    if(!tab) return;
    try {
        const res = await axios.get(`${API}/docs/${tab}`);
        const rawData = res.data || [];
        
        if(tab === 'stamp') {
            let bal = 0;
            rawData.forEach((d: StampUsage) => {
                if(d.transactionType === 'ADD') bal += (d.amount || 0);
                else bal -= (d.amount || 0);
            });
            setStampBalance(bal);
        }
        setData(rawData);
    } catch(e) { console.error("Connection Error:", e); }
  }, [tab]);

  // --- Auto Refresh ---
  useEffect(() => {
      loadData();
      const interval = setInterval(() => {
          if (!showForm && !showAddStock) loadData(); 
      }, 3000);
      return () => clearInterval(interval);
  }, [loadData, showForm, showAddStock]);

  useEffect(() => { 
      setTempSearchTerm(''); 
      setActiveSearchTerm(''); 
      if(tab.includes('incoming')) setSearchField('docNumber');
      else if(tab === 'outgoing-mail') setSearchField('receiptNumber');
      else setSearchField('subject');
  }, [tab]);

  // --- Handlers ---
  const handleInput = (k: string, v: any) => setForm((p:any) => ({...p, [k]: v}));
  const handleFile = (e: any) => handleInput('file', e.target.files[0]);

  const handleSearch = () => {
      setActiveSearchTerm(tempSearchTerm);
  };

  const save = async () => {
      try {
          const fd = new FormData();
          if(tab === 'outgoing-mail' && currentReceiptNo && !form.receiptNumber) {
              form.receiptNumber = currentReceiptNo;
          }
          if(tab === 'stamp' && !form.transactionType) {
              form.transactionType = 'USE';
          }

          fd.append('data', JSON.stringify(form));
          if(form.file) fd.append('file', form.file);

          if(editingId) await axios.put(`${API}/docs/${tab}/${editingId}`, fd);
          else await axios.post(`${API}/docs/${tab}`, fd);

          setShowForm(false); setForm({}); setEditingId(null);
          loadData(); 
      } catch(e) { alert('บันทึกไม่สำเร็จ! ตรวจสอบการเชื่อมต่อ Server'); }
  };

  const saveAddStock = async () => {
      try {
          const payload = { ...form, transactionType: 'ADD', reason: 'ซื้อเพิ่ม' };
          const fd = new FormData();
          fd.append('data', JSON.stringify(payload));
          await axios.post(`${API}/docs/${tab}`, fd);
          setShowAddStock(false); setForm({});
          loadData();
      } catch(e) { alert('บันทึกยอดซื้อเพิ่มไม่สำเร็จ'); }
  };

  const del = async (id: number) => {
      if(!confirm('ยืนยันลบรายการนี้?')) return;
      try {
          await axios.delete(`${API}/docs/${tab}/${id}`);
          loadData();
      } catch(e) { alert('ลบไม่สำเร็จ! ตรวจสอบสิทธิ์หรือการเชื่อมต่อ'); }
  };

  const edit = (item: any) => {
      setForm({...item, file: undefined});
      setEditingId(item.id);
      setShowForm(true);
  };

  const addItemToReceipt = (receiptNo: string, sendDate: string) => {
      setForm({
          receiptNumber: receiptNo,
          sendDate: sendDate,
          subject: '', recipientName: '', senderOfficer: '', requestingDept: '', amount: 0, trackingNo: ''
      });
      setEditingId(null);
      setShowForm(true);
  };

  // Add Item to Incoming Date Group
  const addItemToIncomingDate = (date: string) => {
      setForm({
          receiveDate: date,
          docNumber: '', source: '', subject: '', receiver: '', mailType: 'ธรรมดา', trackingNo: ''
      });
      setEditingId(null);
      setShowForm(true);
  };

  const prevMonth = () => setCalDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const nextMonth = () => setCalDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));

  // --- Filter Logic ---
  const filteredData = useMemo(() => {
      if(!activeSearchTerm) return data;
      const lower = activeSearchTerm.toLowerCase();
      
      return data.filter((d: any) => {
          let fieldValue = '';
          switch (searchField) {
              case 'docNumber': fieldValue = d.docNumber || d.runningNumber; break;
              case 'subject': fieldValue = d.subject || d.purpose || d.reason || d.childName || d.deceasedName; break;
              case 'source': fieldValue = d.source || d.requestingDept || d.department; break;
              case 'tracking': fieldValue = d.trackingNo; break;
              case 'receiptNumber': fieldValue = d.receiptNumber; break;
              case 'date': fieldValue = d.receiveDate || d.sendDate || d.issueDate || d.bookingDate || d.date; break;
              default: fieldValue = JSON.stringify(d); 
          }
          return String(fieldValue || '').toLowerCase().includes(lower);
      });
  }, [data, activeSearchTerm, searchField]);

  // --- Grouping Logic ---
  
  // 1. Outgoing Mail Grouping
  const groupedReceipts = useMemo(() => {
      if(tab !== 'outgoing-mail') return {};
      return filteredData.reduce((acc: any, item: OutgoingMail) => {
          const r = item.receiptNumber || 'No Receipt';
          if(!acc[r]) acc[r] = { date: item.sendDate, totalCost: 0, items: [] };
          acc[r].totalCost += (item.amount || 0);
          acc[r].items.push(item);
          return acc;
      }, {});
  }, [filteredData, tab]);

  // 2. Incoming Mail Grouping (NEW)
  const groupedIncoming = useMemo(() => {
      if(!tab.includes('incoming')) return {};
      // Sort data by ID desc first to show latest added last (or change logic if needed)
      const sorted = [...filteredData].sort((a,b) => b.id - a.id);
      
      return sorted.reduce((acc: any, item: IncomingMail) => {
          const d = item.receiveDate || 'No Date';
          if(!acc[d]) acc[d] = [];
          acc[d].push(item);
          return acc;
      }, {});
  }, [filteredData, tab]);

  // --- Export Logic ---
  const handleExport = (type: 'excel' | 'pdf') => {
      if(filteredData.length === 0) { alert('ไม่พบข้อมูล'); return; }
      let headers: string[] = [];
      let body: any[] = [];

      if (tab.includes('incoming')) {
          headers = ['ลำดับ', 'วันที่รับ', 'เลขที่หนังสือ', 'จากหน่วยงาน', tab.includes('director')?'ถึง':'แผนกรับ', 'ประเภท', 'Tracking'];
          body = filteredData.map((d:any, i) => [i+1, formatDate(d.receiveDate), d.docNumber, d.source, d.receiver, d.mailType, d.trackingNo]);
      } else if (tab === 'outgoing-mail') {
          headers = ['วันที่', 'เลขที่ใบเสร็จ', 'ผู้รับ', 'ผู้ส่ง', 'เรื่อง', 'ค่าส่ง'];
          body = filteredData.map((d:any) => [formatDate(d.sendDate), d.receiptNumber, d.recipientName, d.senderOfficer, d.subject, d.amount]);
      } else {
          headers = ['ลำดับ', 'วันที่', 'รายละเอียด']; 
          body = filteredData.map((d:any, i) => [i+1, formatDate(d.date || d.bookingDate), d.subject || d.purpose]);
      }

      if (type === 'excel') {
          const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Report");
          XLSX.writeFile(wb, `Report_${tab}.xlsx`);
      } else {
          const doc = new jsPDF() as any;
          doc.text("Report", 14, 10);
          doc.autoTable({ head: [headers], body: body, startY: 20 });
          doc.save(`Report_${tab}.pdf`);
      }
  };

  // --- Styles ---
  const tableStyle: React.CSSProperties = { width:'100%', borderCollapse:'collapse', border: `1px solid ${colors.border}`, fontSize: '14px' };
  const thStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, padding: '12px', background: colors.header, color: colors.text, textAlign: 'left', fontWeight: 'bold' };
  const tdStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, padding: '10px', color: '#000', verticalAlign: 'top' };

  // --- Render Sections ---
  if(!menuId) return (
      <div style={{padding: 40, background: colors.bg, minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center'}}>
          <h1 style={{color: colors.primary, fontSize: 32, marginBottom:40}}>🏥 Hospital E-Saraban System</h1>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:20, width:'100%', maxWidth:1000}}>
              {mainMenu.map(m => (
                  <div key={m.id} onClick={()=>setMenuId(m.id)} 
                       style={{background: colors.card, padding: 30, borderRadius: 15, cursor:'pointer', border:`1px solid #cbd5e1`, textAlign:'center', boxShadow:'0 4px 6px -1px rgba(0,0,0,0.1)'}}>
                      <div style={{fontSize: 40, marginBottom: 10}}>{m.icon}</div>
                      <div style={{fontSize: 20, fontWeight:'bold', color: colors.text}}>{m.title}</div>
                  </div>
              ))}
          </div>
      </div>
  );

  // Search Bar
  const renderSearch = () => {
      let options = [ {v:'subject', l:'ชื่อเรื่อง/ชื่อบุคคล/เหตุผล'} ];
      if(tab.includes('incoming')) options = [{v:'docNumber',l:'เลขที่หนังสือ'}, {v:'source',l:'ชื่อหน่วยงานที่ส่ง'}, {v:'tracking',l:'Tracking No.'}, {v:'receiveDate',l:'วันที่รับ'}, {v:'receiveDate',l:'หน่วยงานที่รับ'}];
      if(tab === 'outgoing-mail') options = [{v:'receiptNumber',l:'เลขที่ใบเสร็จ'}, {v:'subject',l:'เรื่อง'}, {v:'requestingDept',l:'แผนกส่ง'}, {v:'tracking',l:'Tracking No.'}];
      if(tab.includes('ext')) options = [{v:'docNumber',l:'เลขที่หนังสือ'}, {v:'subject',l:'เรื่อง'}, {v:'recipient',l:'เรียนถึง'},{v:'issueDate',l:'แผนกที่ออก'} ,{v:'issueDate',l:'วันที่ออก'}];
      if(tab === 'meeting') options = [{v:'date',l:'วันที่จอง'}, {v:'subject',l:'เรื่อง/วัตถุประสงค์'}];
      if(tab.includes('reg')) options = [{v:'subject',l:'ชื่อบุคคล'}, {v:'date',l:'วันที่เกิด/ตาย'}];

      return (
          <div style={{marginBottom: 20, display:'flex', gap: 10, width: '100%', alignItems:'center', flexWrap: 'wrap'}}>
              <div style={{whiteSpace:'nowrap', fontWeight:'bold'}}>ค้นหาจาก:</div>
              <select onChange={e=>setSearchField(e.target.value)} value={searchField} style={{padding:8, borderRadius:4, border:'1px solid #ccc'}}>
                  {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
              <input value={tempSearchTerm} onChange={e=>setTempSearchTerm(e.target.value)} 
                     onKeyDown={e => e.key === 'Enter' && handleSearch()}
                     placeholder="ระบุคำค้นหา..." 
                     style={{padding:8, width:'100%', maxWidth:300, borderRadius:4, border:'1px solid #ccc'}} />
              <button onClick={handleSearch} style={{background: colors.primary, color:'white', padding:'8px 15px', border:'none', borderRadius:4, cursor:'pointer'}}>🔍 ค้นหา</button>
              {activeSearchTerm && <button onClick={()=>{setTempSearchTerm(''); setActiveSearchTerm('');}} style={{background: colors.danger, color:'white', padding:'8px 15px', border:'none', borderRadius:4, cursor:'pointer'}}>ล้าง</button>}
              
              <div style={{flexGrow: 1}} />
              <button onClick={()=>handleExport('excel')} style={{background:'#10b981', color:'white', padding:'8px 20px', border:'none', borderRadius:4, cursor:'pointer', fontWeight:'bold'}}>
                  📊 Export Excel
              </button>
          </div>
      );
  };

  // Table Content
  const renderTable = () => {
      // 3.0 Incoming Mail (Grouped by Date)
      if(tab.includes('incoming')) {
          // Sort keys (dates) descending
          const sortedDates = Object.keys(groupedIncoming).sort((a,b) => new Date(b).getTime() - new Date(a).getTime());
          
          return (
              <div>
                  {activeSearchTerm && <div style={{marginBottom:10, color:'green'}}>ผลการค้นหา: พบ {filteredData.length} รายการ</div>}
                  {sortedDates.map((date) => (
                      <div key={date} style={{marginBottom: 15, border: `1px solid ${colors.secondary}`, borderRadius: 8, overflow:'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'}}>
                          <div style={{padding: 10, background: '#eff6ff', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom: `1px solid ${colors.border}`}}>
                                <div>
                                    <span style={{fontSize: 16, fontWeight: 'bold', color: colors.secondary}}>📅 วันที่รับ: {formatDate(date)}</span>
                                    <span style={{marginLeft: 15, background: 'white', padding:'3px 8px', borderRadius:4, fontSize:14, fontWeight:'bold', border:'1px solid #ccc'}}>
                                        ✉️ จำนวน: {groupedIncoming[date].length} ฉบับ
                                    </span>
                                </div>
                                <div style={{display:'flex', alignItems:'center', gap: 10}}>
                                    <button onClick={() => addItemToIncomingDate(date)} style={{background: colors.success, color: 'white', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize:12}}>➕ เพิ่มจดหมายในวันนี้</button>
                                    <button onClick={() => setExpandedReceipts(prev => prev.includes(date) ? prev.filter(x=>x!==date) : [...prev, date])} style={{background: 'white', border: '1px solid #ccc', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize:12}}>
                                        {expandedReceipts.includes(date) ? '▼' : '▶ ดูรายการ'}
                                    </button>
                                </div>
                          </div>
                          {(expandedReceipts.includes(date) || activeSearchTerm) && (
                              <div style={{padding: 0}}>
                                <table style={tableStyle}>
                                    <thead>
                                        <tr>
                                            <th style={thStyle}>ลำดับ</th>
                                            <th style={thStyle}>เลขที่หนังสือ</th>
                                            <th style={thStyle}>จากหน่วยงาน</th>
                                            <th style={thStyle}>{tab.includes('director') ? 'ส่งถึง' : 'ส่งถึงแผนก'}</th>
                                            <th style={thStyle}>เรื่อง</th>
                                            <th style={thStyle}>ประเภท</th>
                                            <th style={thStyle}>Tracking</th>
                                            <th style={{...thStyle, textAlign:'center'}}>จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {groupedIncoming[date].map((m:any, idx:number) => (
                                            <tr key={m.id} style={{background: idx%2===0 ? 'white' : '#f8fafc'}}>
                                                <td style={tdStyle}>{idx+1}</td>
                                                <td style={tdStyle}>{m.docNumber}</td>
                                                <td style={tdStyle}>{m.source}</td>
                                                <td style={tdStyle}>{tab.includes('director') ? 'ผู้อำนวยการ' : m.receiver}</td>
                                                <td style={tdStyle}>{m.subject}</td>
                                                <td style={tdStyle}>{m.mailType}</td>
                                                <td style={tdStyle}>{m.trackingNo}</td>
                                                <td style={{...tdStyle, textAlign:'center'}}>
                                                    <button onClick={()=>edit(m)} style={{marginRight:5, color:'#d97706', background:'none', border:'none', cursor:'pointer'}}>✎</button>
                                                    <button onClick={()=>del(m.id)} style={{color:'red', background:'none', border:'none', cursor:'pointer'}}>✖</button>
                                                </td>
                                            </tr>
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

      // 3.1 Outgoing Mail
      if(tab === 'outgoing-mail') {
          return (
              <div>
                  {activeSearchTerm && <div style={{marginBottom:10, color:'green'}}>ผลการค้นหา: พบ {filteredData.length} รายการ</div>}
                  {Object.entries(groupedReceipts).map(([rNum, group]: any) => (
                      <div key={rNum} style={{marginBottom: 15, border: `1px solid ${colors.primary}`, borderRadius: 8, overflow:'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'}}>
                          <div style={{padding: 10, background: '#e0f2fe', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom: `1px solid ${colors.border}`}}>
                                <div>
                                    <span style={{fontSize: 16, fontWeight: 'bold', color: colors.primary}}>🧾 ใบเสร็จ: {rNum}</span>
                                    <span style={{marginLeft: 15, color: '#64748b'}}>วันที่: {formatDate(group.date)}</span>
                                    <span style={{marginLeft: 15, background: 'white', padding:'3px 8px', borderRadius:4, fontSize:14, fontWeight:'bold', border:'1px solid #ccc'}}>
                                        ✉️ จำนวน: {group.items.length} ฉบับ
                                    </span>
                                </div>
                                <div style={{display:'flex', alignItems:'center', gap: 10}}>
                                    <span style={{fontSize: 16, fontWeight:'bold', color: '#0f766e'}}>รวม: {group.totalCost.toFixed(2)} บ.</span>
                                    <button onClick={() => addItemToReceipt(rNum, group.date)} style={{background: colors.success, color: 'white', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize:12}}>➕ เพิ่มรายการในบิลนี้</button>
                                    <button onClick={() => setExpandedReceipts(prev => prev.includes(rNum) ? prev.filter(x=>x!==rNum) : [...prev, rNum])} style={{background: 'white', border: '1px solid #ccc', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize:12}}>
                                        {expandedReceipts.includes(rNum) ? '▼' : '▶ ดู'}
                                    </button>
                                </div>
                          </div>
                          {(expandedReceipts.includes(rNum) || activeSearchTerm) && (
                              <div style={{padding: 0}}>
                                <table style={tableStyle}>
                                    <thead>
                                        <tr>
                                            <th style={thStyle}>ลำดับ</th><th style={thStyle}>ผู้รับ (ปลายทาง)</th><th style={thStyle}>ผู้ส่ง (จนท.)</th><th style={thStyle}>แผนกส่ง</th>
                                            <th style={thStyle}>เรื่อง</th><th style={thStyle}>ค่าส่ง</th><th style={thStyle}>Tracking</th><th style={{...thStyle, textAlign:'center'}}>จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {group.items.map((m:any, idx:number) => (
                                            <tr key={m.id} style={{background: idx%2===0 ? 'white' : '#f8fafc'}}>
                                                <td style={tdStyle}>{idx+1}</td><td style={tdStyle}>{m.recipientName}</td><td style={tdStyle}>{m.senderOfficer}</td><td style={tdStyle}>{m.requestingDept}</td>
                                                <td style={tdStyle}>{m.subject}</td><td style={tdStyle}>{m.amount}</td><td style={tdStyle}>{m.trackingNo}</td>
                                                <td style={{...tdStyle, textAlign:'center'}}>
                                                    <button onClick={()=>edit(m)} style={{marginRight:5, color:'#d97706', background:'none', border:'none', cursor:'pointer'}}>✎</button>
                                                    <button onClick={()=>del(m.id)} style={{color:'red', background:'none', border:'none', cursor:'pointer'}}>✖</button>
                                                    {m.filePath && <button onClick={()=>setPreviewUrl(`${API}${m.filePath}`)} style={{color:colors.primary, background:'none', border:'none', cursor:'pointer'}}>📎</button>}
                                                </td>
                                            </tr>
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
      
      // 3.3 Meeting Room
      if(tab === 'meeting') {
          const year = calDate.getFullYear();
          const month = calDate.getMonth();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const firstDay = new Date(year, month, 1).getDay();
          
          return (
              <div>
                  <div style={{marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <div>
                          <button onClick={()=>setMeetingView('calendar')} style={{padding:'8px 15px', marginRight:5, border:'1px solid #ccc', borderRadius:5, background: meetingView==='calendar'?colors.primary:'#fff', color: meetingView==='calendar'?'#fff':'#000', cursor:'pointer'}}>📅 ปฏิทิน</button>
                          <button onClick={()=>setMeetingView('list')} style={{padding:'8px 15px', border:'1px solid #ccc', borderRadius:5, background: meetingView==='list'?colors.primary:'#fff', color: meetingView==='list'?'#fff':'#000', cursor:'pointer'}}>📄 รายการ</button>
                      </div>
                      {meetingView === 'calendar' && <div style={{display:'flex', gap:10, alignItems:'center'}}>
                          <button onClick={prevMonth} style={{padding:'5px 15px', cursor:'pointer', border:'1px solid #ccc', borderRadius:5}}>◀</button>
                          <h3 style={{margin:0, width:150, textAlign:'center'}}>{months[month]} {year+543}</h3>
                          <button onClick={nextMonth} style={{padding:'5px 15px', cursor:'pointer', border:'1px solid #ccc', borderRadius:5}}>▶</button>
                      </div>}
                  </div>

                  {meetingView === 'calendar' ? (
                      <div style={{border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden'}}>
                          <div style={{display:'grid', gridTemplateColumns:'repeat(7, 1fr)', background: colors.primary, color:'white'}}>
                              {['อา','จ','อ','พ','พฤ','ศ','ส'].map(d=><div key={d} style={{textAlign:'center', padding:10, fontWeight:'bold'}}>{d}</div>)}
                          </div>
                          
                          <div style={{display:'grid', gridTemplateColumns:'repeat(7, 1fr)', background: '#cbd5e1', gap: '1px'}}>
                              {[...Array(isNaN(firstDay) ? 0 : firstDay)].map((_,i)=><div key={`empty-${i}`} style={{background:'#f1f5f9', minHeight:120}}></div>)}
                              {[...Array(isNaN(daysInMonth) ? 0 : daysInMonth)].map((_,i) => {
                                  const day = i+1;
                                  const bookings = data.filter((b:any) => {
                                      if(!b.bookingDate) return false;
                                      const d = new Date(b.bookingDate);
                                      return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
                                  });
                                  const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
                                  return (
                                      <div key={day} style={{background: isToday ? '#fffbeb' : 'white', minHeight: 140, padding: 5, position:'relative'}}>
                                          <div style={{textAlign:'right', fontWeight:'bold', color: isToday ? 'red' : '#64748b', marginBottom: 5}}>{day}</div>
                                          {bookings.map((b:any) => (
                                              <div key={b.id} onClick={()=>edit(b)}
                                                   style={{
                                                       fontSize:11, padding: '4px 6px', marginBottom: 4, borderRadius: 4, cursor:'pointer',
                                                       background: b.room==='ห้องทับทิม' ? '#fee2e2' : '#dbeafe', 
                                                       borderLeft: `4px solid ${b.room==='ห้องทับทิม' ? '#ef4444' : '#3b82f6'}`, color: '#1e293b'
                                                   }}>
                                                  <div style={{fontWeight:'bold', color: b.room==='ห้องทับทิม' ? '#991b1b' : '#1e40af'}}>{b.room} ({b.startTime}-{b.endTime})</div>
                                                  <div style={{whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                                                      {b.department} - {b.purpose}
                                                  </div>
                                              </div>
                                          ))}
                                      </div>
                                  )
                              })}
                          </div>
                      </div>
                  ) : (
                      <table style={tableStyle}>
                          <thead>
                              <tr>
                                  <th style={thStyle}>วันที่</th><th style={thStyle}>เวลา</th><th style={thStyle}>ห้องประชุม</th><th style={thStyle}>แผนก</th><th style={thStyle}>เรื่อง</th><th style={thStyle}>ไฟล์</th><th style={{...thStyle, textAlign:'center'}}>จัดการ</th>
                              </tr>
                          </thead>
                          <tbody>
                              {filteredData.map((d:any) => (
                                  <tr key={d.id}>
                                      <td style={tdStyle}>{formatDate(d.bookingDate)}</td>
                                      <td style={tdStyle}>{d.startTime}-{d.endTime}</td>
                                      <td style={{...tdStyle, fontWeight:'bold', color: d.room==='ห้องทับทิม'?'#dc2626':'#2563eb'}}>{d.room}</td>
                                      <td style={tdStyle}>{d.department}</td><td style={tdStyle}>{d.purpose}</td>
                                      <td style={tdStyle}>{d.filePath && <button onClick={()=>setPreviewUrl(`${API}${d.filePath}`)}>📎</button>}</td>
                                      <td style={{...tdStyle, textAlign:'center'}}>
                                          <button onClick={()=>edit(d)}>✎</button> 
                                          <button onClick={()=>del(d.id)} style={{color:'red', marginLeft:5}}>✖</button>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  )}
              </div>
          )
      }
      
      // 3.4 General Tables
      let headers: string[] = [];
      let renderRow = (d:any, i:number):React.ReactNode => null;

      if(tab.includes('ext-wrpk')) {
          headers = ['เลขที่หนังสือ', 'วันที่ออก', 'เรื่อง', 'เรียน', 'แผนกที่ออก', 'อ้างอิง', 'ไฟล์', 'จัดการ'];
          renderRow = (d, i) => <>
              <td style={tdStyle}>{d.docNumber}</td><td style={tdStyle}>{formatDate(d.issueDate)}</td>
              <td style={tdStyle}>{d.subject}</td><td style={tdStyle}>{d.recipient}</td>
              <td style={tdStyle}>{d.issuingDept}</td><td style={tdStyle}>{d.reference}</td>
              <td style={tdStyle}>{d.filePath && <button onClick={()=>setPreviewUrl(`${API}${d.filePath}`)}>📎</button>}</td>
          </>;
      } else if (tab.includes('reg-birth')) {
          headers = ['ลำดับ', 'วันเกิด', 'เวลา', 'ชื่อเด็ก', 'ชื่อแม่', 'ชื่อพ่อ', 'จัดการ'];
          renderRow = (d, i) => <>
              <td style={tdStyle}>{d.seq}</td><td style={tdStyle}>{formatDate(d.date)}</td>
              <td style={tdStyle}>{d.time}</td><td style={tdStyle}>{d.childName}</td>
              <td style={tdStyle}>{d.motherName}</td><td style={tdStyle}>{d.fatherName}</td>
          </>;
      } else if (tab.includes('reg-death')) {
          headers = ['ลำดับ', 'วันที่เสียชีวิต', 'เวลา', 'หน่วยงาน', 'ผู้เสียชีวิต', 'สาเหตุ', 'จัดการศพ', 'สถานที่', 'จัดการ'];
          renderRow = (d, i) => <>
              <td style={tdStyle}>{d.seq}</td><td style={tdStyle}>{formatDate(d.date)}</td>
              <td style={tdStyle}>{d.time}</td><td style={tdStyle}>{d.unit}</td>
              <td style={tdStyle}>{d.deceasedName}</td><td style={tdStyle}>{d.cause}</td>
              <td style={{...tdStyle, color: d.isForensic ? 'red' : 'inherit', fontWeight: d.isForensic ? 'bold' : 'normal'}}>
                  {d.isForensic ? 'ส่งนิติเวช' : d.funeralType}
              </td>
              <td style={{...tdStyle, textDecoration: d.isForensic ? 'line-through' : 'none'}}>
                  {d.funeralLocation}
              </td>
          </>;
      } else if (tab === 'orders') {
          headers = ['เลขที่คำสั่ง', 'วันที่บังคับใช้', 'เรื่อง', 'ไฟล์', 'จัดการ'];
          renderRow = (d, i) => <><td style={tdStyle}>{d.docNumber}</td><td style={tdStyle}>{formatDate(d.effectiveDate)}</td><td style={tdStyle}>{d.subject}</td><td style={tdStyle}>{d.filePath && <button onClick={()=>setPreviewUrl(`${API}${d.filePath}`)}>📎</button>}</td></>;
      } else if (tab === 'stamp') {
          return (
              <div>
                 {/* ส่วนแสดงยอดคงเหลือ และปุ่มซื้อเพิ่ม */}
                 <div style={{background:'#fef3c7', padding:20, borderRadius:10, marginBottom:20, border:'2px solid #fbbf24', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                     <div>
                        <div style={{fontSize:18, color:'#92400e'}}>ยอดเงินอากรคงเหลือ</div>
                        <div style={{fontSize:40, fontWeight:'bold', color: stampBalance < 100 ? '#dc2626' : '#059669'}}>
                            {stampBalance.toLocaleString()} บาท
                        </div>
                     </div>
                     <button onClick={() => { setShowAddStock(true); setForm({date: new Date().toISOString().split('T')[0]}); }} 
                             style={{padding:'10px 20px', background: colors.success, color:'white', border:'none', borderRadius:8, fontSize:16, cursor:'pointer', fontWeight:'bold'}}>
                         ➕ ซื้ออากรเพิ่ม
                     </button>
                 </div>

                 <table style={tableStyle}>
                     <thead><tr>
                         <th style={thStyle}>วันที่</th><th style={thStyle}>รายการ</th><th style={thStyle}>แผนก/ผู้เบิก</th>
                         <th style={thStyle}>รับ (บาท)</th><th style={thStyle}>จ่าย (บาท)</th><th style={thStyle}>ไฟล์</th><th style={{...thStyle, textAlign:'center'}}>จัดการ</th>
                     </tr></thead>
                     <tbody>
                         {filteredData.map((d: any, i: number) => (
                             <tr key={d.id} style={{background: i%2===0?'white':'#f8fafc'}}>
                                 <td style={tdStyle}>{formatDate(d.date)}</td>
                                 <td style={tdStyle}>{d.transactionType === 'ADD' ? `ซื้อเพิ่ม` : `เบิกใช้ (${d.reason})`}</td>
                                 <td style={tdStyle}>{d.requestingDept} ({d.requester})</td>
                                 <td style={{...tdStyle, color:'green', fontWeight:'bold'}}>{d.transactionType === 'ADD' ? d.amount : '-'}</td>
                                 <td style={{...tdStyle, color:'red', fontWeight:'bold'}}>{d.transactionType === 'USE' ? d.amount : '-'}</td>
                                 <td style={tdStyle}>{d.filePath && <button onClick={()=>setPreviewUrl(`${API}${d.filePath}`)}>📎</button>}</td>
                                 <td style={{...tdStyle, textAlign:'center'}}>
                                     <button onClick={()=>del(d.id)} style={{color:'red'}}>ลบ</button>
                                 </td>
                             </tr>
                         ))}
                     </tbody>
                 </table>
              </div>
          )
      }

      // Group by Month for External Books
      if(tab.includes('ext-wrpk')) {
          const sorted = [...filteredData].sort((a,b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());
          return (
              <table style={tableStyle}>
                  <thead><tr>{headers.map(h=><th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                  <tbody>
                      {sorted.map((d: any, i: number) => (
                          <tr key={d.id} style={{background: i%2===0?'white':'#f8fafc'}}>
                              {renderRow(d, i)}
                              <td style={{...tdStyle, textAlign:'center'}}>
                                  <button onClick={()=>edit(d)} style={{marginRight:5}}>✎</button>
                                  <button onClick={()=>del(d.id)} style={{color:'red'}}>✖</button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          );
      }

      return (
          <table style={tableStyle}>
              <thead><tr>{headers.map(h=><th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                  {filteredData.map((d: any, i: number) => (
                      <tr key={d.id} style={{background: i%2===0?'white':'#f8fafc'}}>
                          {renderRow(d, i)}
                          <td style={{...tdStyle, textAlign:'center'}}>
                              <button onClick={()=>edit(d)} style={{marginRight:5}}>✎</button>
                              <button onClick={()=>del(d.id)} style={{color:'red'}}>✖</button>
                          </td>
                      </tr>
                  ))}
              </tbody>
          </table>
      );
  };

  // 4. Render Form
  const renderForm = () => {
      const rowStyle = {marginBottom: 10, display:'flex', flexDirection:'column' as const};
      const inputStyle = {padding:8, border:'1px solid #ccc', borderRadius:4};
      const allowFile = ['ext-wrpk', 'ext-wrpk-sp', 'orders', 'stamp', 'meeting'].includes(tab);

      let content = null;
      if(tab.includes('incoming')) {
          content = <>
             {/* ตัดช่องกรอกลำดับออกแล้ว */}
             <div style={rowStyle}><label>วันที่รับ</label><input type="date" value={form.receiveDate||''} onChange={e=>handleInput('receiveDate', e.target.value)} style={inputStyle}/></div>
             <div style={rowStyle}><label>เลขที่หนังสือ</label><input value={form.docNumber||''} onChange={e=>handleInput('docNumber', e.target.value)} style={inputStyle}/></div>
             <div style={rowStyle}><label>จากหน่วยงาน</label><input value={form.source||''} onChange={e=>handleInput('source', e.target.value)} style={inputStyle}/></div>
             {tab.includes('general') && <div style={rowStyle}><label>ส่งถึงแผนก</label><input value={form.receiver||''} onChange={e=>handleInput('receiver', e.target.value)} style={inputStyle}/></div>}
             <div style={rowStyle}><label>เรื่อง</label><input value={form.subject||''} onChange={e=>handleInput('subject', e.target.value)} style={inputStyle}/></div>
             <div style={rowStyle}><label>ประเภท</label><select value={form.mailType||'ธรรมดา'} onChange={e=>handleInput('mailType', e.target.value)} style={inputStyle}><option>ธรรมดา</option><option>ลงทะเบียน</option><option>EMS</option></select></div>
             <div style={rowStyle}><label>Tracking No.</label><input value={form.trackingNo||''} onChange={e=>handleInput('trackingNo', e.target.value)} style={inputStyle}/></div>
          </>;
      } else if (tab === 'outgoing-mail') {
          content = <>
              <div style={rowStyle}>
                  <label>เลขที่ใบเสร็จ</label>
                  <input value={form.receiptNumber||''} onChange={e=>handleInput('receiptNumber', e.target.value)} style={{...inputStyle, background:'#f1f5f9'}} /> 
                  <small style={{color:'gray'}}>*ระบบจำเลขล่าสุดให้ หรือกดเพิ่มจากหน้ารายการได้</small>
              </div>
              <div style={rowStyle}><label>วันที่ส่ง</label><input type="date" value={form.sendDate||''} onChange={e=>handleInput('sendDate', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>เรื่อง</label><input value={form.subject||''} onChange={e=>handleInput('subject', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>ผู้รับ (หน่วยงาน/ชื่อปลายทาง)</label><input value={form.recipientName||''} onChange={e=>handleInput('recipientName', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>ชื่อ จนท. ผู้ฝากส่ง</label><input value={form.senderOfficer||''} onChange={e=>handleInput('senderOfficer', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>แผนกที่ส่ง</label><input value={form.requestingDept||''} onChange={e=>handleInput('requestingDept', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>ค่าส่ง (บาท)</label><input type="number" value={form.amount||''} onChange={e=>handleInput('amount', parseFloat(e.target.value))} style={inputStyle}/></div>
              <div style={rowStyle}><label>Tracking No.</label><input value={form.trackingNo||''} onChange={e=>handleInput('trackingNo', e.target.value)} style={inputStyle}/></div>
          </>;
      } else if (tab.includes('ext-wrpk')) {
          content = <>
              <div style={rowStyle}><label>เลขที่หนังสือ</label><input value={form.docNumber||''} onChange={e=>handleInput('docNumber', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>วันที่ออก</label><input type="date" value={form.issueDate||''} onChange={e=>handleInput('issueDate', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>เรื่อง</label><input value={form.subject||''} onChange={e=>handleInput('subject', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>เรียน</label><input value={form.recipient||''} onChange={e=>handleInput('recipient', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>แผนกออก</label><input value={form.issuingDept||''} onChange={e=>handleInput('issuingDept', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>อ้างอิง/หมายเหตุ</label><input value={form.reference||''} onChange={e=>handleInput('reference', e.target.value)} style={inputStyle}/></div>
          </>;
      } else if (tab === 'stamp') {
          content = <>
             <div style={{background:'#fee2e2', padding:10, borderRadius:5, marginBottom:10, color:'#991b1b', fontWeight:'bold', textAlign:'center'}}>
                 ทำรายการ: ขอเบิกใช้อากร
             </div>
             <div style={rowStyle}><label>วันที่เบิก</label><input type="date" value={form.date||''} onChange={e=>handleInput('date', e.target.value)} style={inputStyle}/></div>
             <div style={rowStyle}><label>จำนวนเงินที่เบิก (บาท)</label>
             <input type="number" value={form.amount||''} onChange={e=>handleInput('amount', parseFloat(e.target.value))} style={{...inputStyle, color:'red'}}/></div>
             <div style={rowStyle}><label>รายละเอียด/เหตุผล</label><input value={form.reason||''} onChange={e=>handleInput('reason', e.target.value)} style={inputStyle}/></div>
             <div style={rowStyle}><label>แผนก/ผู้เบิก</label><input value={form.requestingDept||''} onChange={e=>handleInput('requestingDept', e.target.value)} style={inputStyle}/></div>
             <div style={rowStyle}><label>ผู้ขอเบิก</label><input value={form.requester||''} onChange={e=>handleInput('requester', e.target.value)} style={inputStyle}/></div>
          </>;
      } else if (tab === 'reg-birth') {
          content = <>
              <div style={rowStyle}><label>ลำดับ (e.g. 001/68)</label><input value={form.seq||''} onChange={e=>handleInput('seq', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>วันที่เกิด</label><input type="date" value={form.date||''} onChange={e=>handleInput('date', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>เวลา</label><input type="time" value={form.time||''} onChange={e=>handleInput('time', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>ชื่อเด็ก</label><input value={form.childName||''} onChange={e=>handleInput('childName', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>ชื่อมารดา</label><input value={form.motherName||''} onChange={e=>handleInput('motherName', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>ชื่อบิดา</label><input value={form.fatherName||''} onChange={e=>handleInput('fatherName', e.target.value)} style={inputStyle}/></div>
          </>;
      } else if (tab === 'reg-death') {
          content = <>
              <div style={rowStyle}><label>ลำดับ</label><input value={form.seq||''} onChange={e=>handleInput('seq', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>วันที่เสียชีวิต</label><input type="date" value={form.date||''} onChange={e=>handleInput('date', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>เวลา</label><input type="time" value={form.time||''} onChange={e=>handleInput('time', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>หน่วยงาน/ตึก</label><input value={form.unit||''} onChange={e=>handleInput('unit', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>ชื่อผู้เสียชีวิต</label><input value={form.deceasedName||''} onChange={e=>handleInput('deceasedName', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>สาเหตุการตาย</label><input value={form.cause||''} onChange={e=>handleInput('cause', e.target.value)} style={inputStyle}/></div>
              <div style={{marginBottom:10, display:'flex', alignItems:'center'}}>
                  <input type="checkbox" checked={form.isForensic||false} onChange={e=>handleInput('isForensic', e.target.checked)} style={{marginRight:5, transform:'scale(1.5)'}} />
                  <label style={{color:'red', fontWeight:'bold'}}>ส่งนิติเวช</label>
              </div>
              {!form.isForensic && <>
                  <div style={rowStyle}><label>จัดการศพ</label><select value={form.funeralType||'เผา'} onChange={e=>handleInput('funeralType', e.target.value)} style={inputStyle}><option>เผา</option><option>ฝัง</option><option>เก็บ</option></select></div>
                  <div style={rowStyle}><label>วัด/สถานที่</label><input value={form.funeralLocation||''} onChange={e=>handleInput('funeralLocation', e.target.value)} style={inputStyle}/></div>
              </>}
          </>;
      } else if (tab === 'meeting') {
          content = <>
              <div style={rowStyle}><label>วันที่จอง</label><input type="date" value={form.bookingDate||''} onChange={e=>handleInput('bookingDate', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>เวลาเริ่ม</label><input type="time" value={form.startTime||''} onChange={e=>handleInput('startTime', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>เวลาเลิก</label><input type="time" value={form.endTime||''} onChange={e=>handleInput('endTime', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>ห้อง</label><select value={form.room||'ห้องทับทิม'} onChange={e=>handleInput('room', e.target.value)} style={inputStyle}><option>ห้องทับทิม</option><option>ห้องประชุมชั้น 8</option></select></div>
              <div style={rowStyle}><label>แผนก</label><input value={form.department||''} onChange={e=>handleInput('department', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>วัตถุประสงค์</label><input value={form.purpose||''} onChange={e=>handleInput('purpose', e.target.value)} style={inputStyle}/></div>
              <div style={rowStyle}><label>จำนวนคน</label><input type="number" value={form.pax||''} onChange={e=>handleInput('pax', e.target.value)} style={inputStyle}/></div>
          </>;
      } else if (tab === 'orders') {
          content = <>
             <div style={rowStyle}><label>เลขที่คำสั่ง</label><input value={form.docNumber||''} onChange={e=>handleInput('docNumber', e.target.value)} style={inputStyle}/></div>
             <div style={rowStyle}><label>วันที่บังคับใช้</label><input type="date" value={form.effectiveDate||''} onChange={e=>handleInput('effectiveDate', e.target.value)} style={inputStyle}/></div>
             <div style={rowStyle}><label>เรื่อง</label><input value={form.subject||''} onChange={e=>handleInput('subject', e.target.value)} style={inputStyle}/></div>
          </>;
      }

      return (
          <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center'}}>
              <div style={{background:'white', padding:30, borderRadius:8, width:550, maxHeight:'90vh', overflowY:'auto'}}>
                  <h3>{editingId ? 'แก้ไขรายการ' : 'เพิ่มรายการใหม่'}</h3>
                  {content}
                  {allowFile && <div style={rowStyle}>
                      <label>แนบไฟล์ (PDF/รูปภาพ)</label>
                      <input type="file" accept="image/*,application/pdf" capture="environment" onChange={handleFile} />
                  </div>}
                  <div style={{display:'flex', gap:10, marginTop:20}}>
                      <button onClick={save} style={{flex:1, background: colors.primary, color:'white', padding:12, border:'none', borderRadius:5, cursor:'pointer', fontWeight:'bold'}}>บันทึก</button>
                      <button onClick={()=>setShowForm(false)} style={{flex:1, background:'#e2e8f0', padding:12, border:'none', borderRadius:5, cursor:'pointer'}}>ยกเลิก</button>
                  </div>
              </div>
          </div>
      )
  };

  // Add Stock Modal
  const renderAddStockModal = () => (
      <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center'}}>
          <div style={{background:'white', padding:30, borderRadius:8, width:400}}>
              <h3 style={{color: colors.success}}>➕ ซื้ออากรแสตมป์เพิ่ม</h3>
              <div style={{marginBottom:10}}>
                  <label>วันที่ซื้อ</label>
                  <input type="date" value={form.date||''} onChange={e=>handleInput('date', e.target.value)} style={{width:'100%', padding:8, marginTop:5, borderRadius:4, border:'1px solid #ccc'}}/>
              </div>
              <div style={{marginBottom:10}}>
                  <label>จำนวนเงิน (บาท)</label>
                  <input type="number" value={form.amount||''} onChange={e=>handleInput('amount', parseFloat(e.target.value))} style={{width:'100%', padding:8, marginTop:5, borderRadius:4, border:'1px solid #ccc'}}/>
              </div>
              <div style={{display:'flex', gap:10, marginTop:20}}>
                  <button onClick={saveAddStock} style={{flex:1, background: colors.success, color:'white', padding:10, border:'none', borderRadius:5, cursor:'pointer'}}>บันทึกยอด</button>
                  <button onClick={()=>setShowAddStock(false)} style={{flex:1, background:'#ccc', padding:10, border:'none', borderRadius:5, cursor:'pointer'}}>ยกเลิก</button>
              </div>
          </div>
      </div>
  );

  return (
    <div style={{padding: 20, background: colors.card, minHeight:'100vh', fontFamily: 'Sarabun, sans-serif'}}>
        <div style={{display:'flex', alignItems:'center', borderBottom:`2px solid ${colors.primary}`, paddingBottom:15, marginBottom:20}}>
            <button onClick={()=>setMenuId(null)} style={{background:'transparent', border:`1px solid ${colors.border}`, padding:'5px 10px', marginRight:15, borderRadius:5, cursor:'pointer'}}>⬅ กลับหน้าหลัก</button>
            <h2 style={{margin:0, color: colors.primary}}>{mainMenu.find(m=>m.id===menuId)?.title}</h2>
        </div>

        {/* Sub Tabs */}
        <div style={{marginBottom: 20}}>
            {mainMenu.find(m=>m.id===menuId)?.sub.map(s => (
                <button key={s.id} onClick={()=>setTab(s.id)} 
                        style={{marginRight:10, padding:'8px 15px', border:'none', borderRadius:20, fontWeight:'bold', cursor:'pointer',
                        background: tab===s.id ? colors.primary : '#e2e8f0', color: tab===s.id ? 'white' : colors.text}}>
                    {s.label}
                </button>
            ))}
        </div>

        {/* Action Bar */}
        <div style={{display:'flex', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10}}>
            <button onClick={()=>{setShowForm(true); setEditingId(null); setForm({});}} style={{background: colors.secondary, color:'white', padding:'8px 15px', border:'none', borderRadius:5, cursor:'pointer', whiteSpace:'nowrap'}}>+ เพิ่มรายการ</button>
            <div style={{flexGrow:1, marginLeft:20}}>{renderSearch()}</div>
        </div>

        {/* Table Content */}
        {renderTable()}
        {showForm && renderForm()}
        {showAddStock && renderAddStockModal()}

        {/* File Preview */}
        {previewUrl && (
            <div style={{position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.9)', zIndex: 200, display:'flex', justifyContent:'center', alignItems:'center'}}>
                <div style={{width:'80%', height:'80%', background:'white', position:'relative', borderRadius: 10, overflow:'hidden'}}>
                     <button onClick={()=>setPreviewUrl(null)} style={{position:'absolute', right:10, top:10, background:'red', color:'white', border:'none', padding:'5px 10px', borderRadius:5, cursor:'pointer', zIndex:10}}>ปิด</button>
                     <iframe src={previewUrl} width="100%" height="100%" />
                </div>
            </div>
        )}
    </div>
  );

}
