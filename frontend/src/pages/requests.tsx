// frontend/src/pages/requests.tsx
import { useAuth } from '@/context/AuthContext';
import { postJson } from '@/lib/api';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

const TIME = ['15:00','15:30','16:00','16:30','17:00','17:30','18:00'];
const ymd = (d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const rangeHasWeekend = (from:string, to:string) => {
  const d1 = new Date(`${from}T00:00:00`);
  const d2 = new Date(`${to}T00:00:00`);
  for (let d = new Date(d1); d <= d2; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay(); // 0 Sun, 6 Sat
    if (wd === 0 || wd === 6) return true;
  }
  return false;
};

export default function RequestsPage() {
  const { user, loading } = useAuth();

  const [tab, setTab] = useState<'extra'|'absence'>('extra');
  const [mode, setMode] = useState<'single'|'range'>('single');
  const [date, setDate] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [start,setStart]=useState('15:00');
  const [end,setEnd]=useState('18:00');
  const [msg,setMsg]=useState<string|null>(null);
  const [err,setErr]=useState<string|null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(()=>{
    const t = ymd(new Date());
    setDate(t); setFrom(t); setTo(t);
  },[]);

  useEffect(()=>{
    if (tab === 'absence') setMode('range');
  },[tab]);

  const endOpts = useMemo(()=>TIME.filter(t=>t>start),[start]);
  const minutes = useMemo(()=>{
    const toM=(s:string)=>{const[a,b]=s.split(':').map(Number);return a*60+b;};
    return toM(end)-toM(start);
  },[start,end]);

  if (loading) return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '400px',
      fontSize: '18px',
      color: '#666'
    }}>
      Loading...
    </div>
  );
  
  if (!user) return (
    <div style={{ 
      maxWidth: '400px', 
      margin: '4rem auto', 
      padding: '2rem',
      backgroundColor: 'white',
      borderRadius: '12px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      textAlign: 'center'
    }}>
      <p style={{ marginBottom: '1.5rem', color: '#666', fontSize: '16px' }}>
        Authentication required to access this page
      </p>
      <Link 
        href="/login" 
        style={{
          display: 'inline-block',
          backgroundColor: '#2563eb',
          color: 'white',
          padding: '12px 24px',
          borderRadius: '8px',
          textDecoration: 'none',
          fontWeight: '500',
          transition: 'background-color 0.2s'
        }}
        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
      >
        Login to Continue
      </Link>
    </div>
  );

  const submit = async (e:React.FormEvent) => {
    e.preventDefault(); 
    setIsSubmitting(true);
    setMsg(null); 
    setErr(null);

    const modeToSend: 'single' | 'range' = tab === 'absence' ? 'range' : mode;

    if (tab === 'extra' && modeToSend === 'range' && rangeHasWeekend(from, to)) {
      setErr('Weekends are not allowed for extra hours. Please adjust the range.');
      setIsSubmitting(false);
      return;
    }

    try {
      const body:any = {
        kind: tab === 'extra' ? 'EXTRA_HOURS' : 'ABSENCE',
        mode: modeToSend,
        reason: tab === 'absence' ? (reason || null) : null,
        comment: tab === 'absence' ? (comment || null) : null,
      };
      if (modeToSend==='single') body.date = date; else { body.startDate = from; body.endDate = to; }
      if (tab==='extra') { body.start = start; body.end = end; }

      const out = await postJson<any>('/api/requests', body);

      if (modeToSend === 'single') {
        if (out?.duplicate) setMsg('Already requested for that date.');
        else if (out?.skippedWeekend) setMsg('Skipped weekend date.');
        else setMsg('Request submitted successfully!');
      } else {
        const parts:string[] = [`Created ${out?.created ?? 0} request(s)`];
        if (out?.duplicates) parts.push(`duplicates: ${out.duplicates}`);
        if (out?.skippedWeekend) parts.push(`weekends skipped: ${out.skippedWeekend}`);
        setMsg(parts.join(', ') + '.');
      }
    } catch (e:any) {
      if (e?.message === 'WEEKEND_NOT_ALLOWED') {
        setErr('Weekends are not allowed for extra hours. Please pick a weekday.');
      } else {
        setErr(e?.message || 'Submission failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main style={{ 
      maxWidth: '600px', 
      margin: '2rem auto', 
      padding: '0 1rem',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Header */}
      <div style={{ 
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '2rem',
        marginBottom: '1.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <h1 style={{ 
          margin: '0 0 0.5rem 0',
          fontSize: '28px',
          fontWeight: '700',
          color: '#1f2937'
        }}>
          Time Off & Extra Hours
        </h1>
        <p style={{ 
          margin: 0,
          color: '#6b7280',
          fontSize: '16px'
        }}>
          Submit absence requests or log extra working hours
        </p>
      </div>

      {/* Main Card */}
      <div style={{ 
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '2rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        {/* Tab Navigation */}
        <div style={{ 
          display: 'flex',
          backgroundColor: '#f8fafc',
          borderRadius: '8px',
          padding: '4px',
          marginBottom: '2rem'
        }}>
          <button 
            onClick={()=>setTab('extra')}
            style={{ 
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: tab === 'extra' ? 'white' : 'transparent',
              color: tab === 'extra' ? '#2563eb' : '#64748b',
              fontWeight: '500',
              cursor: 'pointer',
              boxShadow: tab === 'extra' ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            Extra Hours
          </button>
          <button 
            onClick={()=>setTab('absence')}
            style={{ 
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: tab === 'absence' ? 'white' : 'transparent',
              color: tab === 'absence' ? '#2563eb' : '#64748b',
              fontWeight: '500',
              cursor: 'pointer',
              boxShadow: tab === 'absence' ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            Absence Request
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Mode Selection - Only for Extra Hours */}
          {tab === 'extra' && (
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.75rem',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151'
              }}>
                Request Type
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  type="button" 
                  onClick={()=>setMode('single')}
                  style={{ 
                    flex: 1,
                    padding: '12px 16px',
                    border: `2px solid ${mode==='single' ? '#2563eb' : '#e5e7eb'}`,
                    borderRadius: '8px',
                    backgroundColor: mode==='single' ? '#eff6ff' : 'white',
                    color: mode==='single' ? '#2563eb' : '#6b7280',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Single Day
                </button>
                <button 
                  type="button" 
                  onClick={()=>setMode('range')}
                  style={{ 
                    flex: 1,
                    padding: '12px 16px',
                    border: `2px solid ${mode==='range' ? '#2563eb' : '#e5e7eb'}`,
                    borderRadius: '8px',
                    backgroundColor: mode==='range' ? '#eff6ff' : 'white',
                    color: mode==='range' ? '#2563eb' : '#6b7280',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Date Range
                </button>
              </div>
            </div>
          )}

          {/* Date Selection */}
          <div style={{ display: 'grid', gridTemplateColumns: tab === 'absence' || mode === 'range' ? '1fr 1fr' : '1fr', gap: '1rem' }}>
            {tab === 'absence' ? (
              <>
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '0.5rem',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    Start Date
                  </label>
                  <input 
                    type="date" 
                    value={from} 
                    onChange={e=>setFrom(e.target.value)} 
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '16px',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                    onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                  />
                </div>
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '0.5rem',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    End Date
                  </label>
                  <input 
                    type="date" 
                    value={to} 
                    onChange={e=>setTo(e.target.value)} 
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '16px',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                    onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                  />
                </div>
              </>
            ) : mode === 'single' ? (
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '0.5rem',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  Date
                </label>
                <input 
                  type="date" 
                  value={date} 
                  onChange={e=>setDate(e.target.value)} 
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '16px',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                  onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                />
              </div>
            ) : (
              <>
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '0.5rem',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    From Date
                  </label>
                  <input 
                    type="date" 
                    value={from} 
                    onChange={e=>setFrom(e.target.value)} 
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '16px',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                    onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                  />
                </div>
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '0.5rem',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    To Date
                  </label>
                  <input 
                    type="date" 
                    value={to} 
                    onChange={e=>setTo(e.target.value)} 
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '16px',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                    onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                  />
                </div>
              </>
            )}
          </div>

          {/* Extra-hours time window */}
          {tab === 'extra' && (
            <div style={{ 
              backgroundColor: '#f8fafc',
              padding: '1.5rem',
              borderRadius: '8px',
              border: '1px solid #e2e8f0'
            }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '1rem',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151'
              }}>
                Time Period
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '0.5rem',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    Start Time
                  </label>
                  <select 
                    value={start} 
                    onChange={e=>setStart(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '16px',
                      backgroundColor: 'white',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                    onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                  >
                    {TIME.slice(0,TIME.length-1).map(t=>
                      <option key={t} value={t}>{t}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '0.5rem',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    End Time
                  </label>
                  <select 
                    value={end} 
                    onChange={e=>setEnd(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '16px',
                      backgroundColor: 'white',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                    onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                  >
                    {endOpts.map(t=>
                      <option key={t} value={t}>{t}</option>
                    )}
                  </select>
                </div>
              </div>
              <div style={{ 
                fontSize: '14px', 
                color: '#6b7280',
                padding: '8px 12px',
                backgroundColor: 'white',
                borderRadius: '6px',
                border: '1px solid #e5e7eb'
              }}>
                Planned duration: <span style={{ fontWeight: '600', color: '#1f2937' }}>
                  {Math.floor(minutes/60)}h{minutes%60 ? ` ${minutes%60}m` : ''}
                </span> ({start} – {end})
              </div>
            </div>
          )}

          {/* Absence reason + optional comment */}
          {tab === 'absence' && (
            <>
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '0.5rem',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  Reason for Absence
                </label>
                <select 
                  value={reason} 
                  onChange={e=>setReason(e.target.value)} 
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '16px',
                    backgroundColor: 'white',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                  onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                >
                  <option value="">Please select a reason</option>
                  <option value="Sick Leave">Sick Leave</option>
                  <option value="Vacation">Vacation</option>
                  <option value="Personal Reasons">Personal Reasons</option>
                  <option value="Family Emergency">Family Emergency</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '0.5rem',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  Additional Details (Optional)
                </label>
                <textarea
                  value={comment}
                  onChange={e=>setComment(e.target.value)}
                  placeholder="Provide any additional context or details for your request..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '16px',
                    resize: 'vertical',
                    minHeight: '100px',
                    transition: 'border-color 0.2s',
                    fontFamily: 'inherit'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                  onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                />
              </div>
            </>
          )}

          {/* Status Messages */}
          {msg && (
            <div style={{ 
              padding: '12px 16px',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
              color: '#166534',
              fontSize: '14px'
            }}>
              {msg}
            </div>
          )}

          {err && (
            <div style={{ 
              padding: '12px 16px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#dc2626',
              fontSize: '14px'
            }}>
              {err}
            </div>
          )}

          {/* Submit Button */}
          <button 
            type="submit" 
            disabled={isSubmitting}
            style={{ 
              width: '100%',
              padding: '14px 24px',
              backgroundColor: isSubmitting ? '#9ca3af' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s',
              marginTop: '0.5rem'
            }}
            onMouseOver={(e) => {
              if (!isSubmitting) e.currentTarget.style.backgroundColor = '#1d4ed8';
            }}
            onMouseOut={(e) => {
              if (!isSubmitting) e.currentTarget.style.backgroundColor = '#2563eb';
            }}
          >
            {isSubmitting ? 'Processing...' : `Submit ${tab === 'extra' ? 'Extra Hours' : 'Absence'} Request`}
          </button>
        </form>
      </div>
    </main>
  );
}