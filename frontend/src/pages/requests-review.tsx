// frontend/src/pages/requests-review.tsx
import { useAuth } from '@/context/AuthContext';
import { fetchWithAuth, getJson } from '@/lib/api';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type Row = {
  id:number; kind:'EXTRA_HOURS'|'ABSENCE';
  name:string; email:string|null;
  date?: string; rangeStart?: string; rangeEnd?: string;
  startMin?: number; endMin?: number; minutes?: number;
  reason?: string|null;
  comment?: string|null;
  status: 'PENDING'|'APPROVED'|'REJECTED';
  submittedAt: string;
  reviewNote?: string|null;
};

const minToLabel = (m:number)=>{ 
  const h=Math.floor(m/60), mm=m%60; 
  const ampm=h>=12?'PM':'AM'; 
  const h12=((h+11)%12)+1; 
  return `${h12}:${String(mm).padStart(2,'0')} ${ampm}`; 
};

export default function RequestsReview() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState<Record<number,string>>({});
  const [activeTab, setActiveTab] = useState<'all' | 'absence' | 'extra'>('all');
  const [isLoading, setIsLoading] = useState(false);
  
  // Rejection modal state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [pendingRejection, setPendingRejection] = useState<{id: number, name: string} | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isActing, setIsActing] = useState(false);


  const load = async () => {
    setIsLoading(true);
    try {
      const data = await getJson<Row[]>(`/api/requests`);
      setRows(data);
    } catch (error) {
      console.error('Failed to load requests:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadApprovedSheetUrl = async () => {
  try {
    const data = await getJson<{ url: string }>(`/api/requests/approved-sheet`);
    setApprovedSheetUrl(data?.url || null);
  } catch {
    setApprovedSheetUrl(null);
  }
};


  useEffect(() => {
  if (!loading && user && (user.role === 'hr' || user.role === 'super_admin')) {
    load();
    loadApprovedSheetUrl();
  }
}, [loading, user]);


  // Filter rows based on active tab
  const filteredRows = rows.filter(row => {
    if (activeTab === 'all') return true;
    if (activeTab === 'absence') return row.kind === 'ABSENCE';
    if (activeTab === 'extra') return row.kind === 'EXTRA_HOURS';
    return true;
  });

  const absenceCount = rows.filter(r => r.kind === 'ABSENCE').length;
  const extraCount = rows.filter(r => r.kind === 'EXTRA_HOURS').length;
  const totalCount = rows.length;

  const [approvedSheetUrl, setApprovedSheetUrl] = useState<string | null>(null);


  const act = async (id: number, action: 'approve' | 'reject') => {
  try {
    let n = (note[id] ?? rows.find(r => r.id === id)?.reviewNote ?? '').trim();

    if (action === 'reject' && !n) {
      // open modal for reason
      const request = rows.find(r => r.id === id);
      setPendingRejection({ id, name: request?.name || 'Unknown' });
      setRejectionReason('');
      setRejectModalOpen(true);
      return;
    }

    setIsActing(true);
    await fetchWithAuth(`/api/requests/${id}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, note: n }),
    });
    await load();
  } catch (e: any) {
    alert(e?.message || 'Action failed');
  } finally {
    setIsActing(false);
  }
};


  const handleRejectConfirm = async () => {
  if (!pendingRejection) return;
  if (!rejectionReason.trim()) {
    alert('Please provide a reason for rejection.');
    return;
  }

  try {
    setIsActing(true);
    await fetchWithAuth(`/api/requests/${pendingRejection.id}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', note: rejectionReason.trim() }),
    });
    setNote(s => ({ ...s, [pendingRejection.id]: rejectionReason.trim() }));
    await load();
    setRejectModalOpen(false);
    setPendingRejection(null);
    setRejectionReason('');
  } catch (e: any) {
    alert(e?.message || 'Rejection failed');
  } finally {
    setIsActing(false);
  }
};


  const handleRejectCancel = () => {
    setRejectModalOpen(false);
    setPendingRejection(null);
    setRejectionReason('');
  };

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
  
  if (!(user.role==='hr'||user.role==='super_admin')) return (
    <div style={{ 
      maxWidth: '400px', 
      margin: '4rem auto', 
      padding: '2rem',
      backgroundColor: 'white',
      borderRadius: '12px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      textAlign: 'center',
      color: '#dc2626'
    }}>
      Access Denied. You don't have permission to view this page.
    </div>
  );

  return (
    <>
      <main style={{ 
        maxWidth: '1200px', 
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <h1 style={{ 
                margin: '0 0 0.5rem 0',
                fontSize: '28px',
                fontWeight: '700',
                color: '#1f2937'
              }}>
                Request Review
              </h1>
              <p style={{ 
                margin: 0,
                color: '#6b7280',
                fontSize: '16px'
              }}>
                Review and manage employee time off and extra hours requests
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
  <button
    onClick={() => {
      if (approvedSheetUrl) window.open(approvedSheetUrl, '_blank', 'noopener,noreferrer');
    }}
    disabled={!approvedSheetUrl}
    style={{
      padding: '10px 20px',
      backgroundColor: approvedSheetUrl ? '#0f766e' : '#94a3b8',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      fontWeight: '500',
      cursor: approvedSheetUrl ? 'pointer' : 'not-allowed',
      opacity: approvedSheetUrl ? 1 : 0.8,
      transition: 'all 0.2s',
    }}
    title={approvedSheetUrl ? 'Open the Google Sheet where approved requests are stored' : 'Google Sheets is not configured'}
  >
    Open Google Sheet
  </button>

  <button
    onClick={() => {
      void load();
      void loadApprovedSheetUrl();
    }}
    disabled={isLoading}
    style={{
      padding: '10px 20px',
      backgroundColor: '#2563eb',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      fontWeight: '500',
      cursor: isLoading ? 'not-allowed' : 'pointer',
      opacity: isLoading ? 0.6 : 1,
      transition: 'all 0.2s',
    }}
  >
    {isLoading ? 'Refreshing...' : 'Refresh'}
  </button>
</div>

          </div>

          {/* Stats Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1.5rem' }}>
            <div style={{ 
              backgroundColor: '#f8fafc',
              padding: '1.5rem',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#2563eb' }}>{totalCount}</div>
              <div style={{ color: '#64748b', fontSize: '14px', fontWeight: '500' }}>Total Pending</div>
            </div>
            <div style={{ 
              backgroundColor: '#f0f9ff',
              padding: '1.5rem',
              borderRadius: '8px',
              border: '1px solid #bae6fd',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#0369a1' }}>{absenceCount}</div>
              <div style={{ color: '#0c4a6e', fontSize: '14px', fontWeight: '500' }}>Absence Requests</div>
            </div>
            <div style={{ 
              backgroundColor: '#f0fdf4',
              padding: '1.5rem',
              borderRadius: '8px',
              border: '1px solid #bbf7d0',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#16a34a' }}>{extraCount}</div>
              <div style={{ color: '#166534', fontSize: '14px', fontWeight: '500' }}>Extra Hours</div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div style={{ 
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden'
        }}>
          {/* Tab Navigation */}
          <div style={{ 
            display: 'flex',
            backgroundColor: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            padding: '0 2rem'
          }}>
            <button 
              onClick={() => setActiveTab('all')}
              style={{ 
                padding: '16px 24px',
                border: 'none',
                backgroundColor: activeTab === 'all' ? 'white' : 'transparent',
                color: activeTab === 'all' ? '#2563eb' : '#64748b',
                fontWeight: '500',
                cursor: 'pointer',
                borderBottom: activeTab === 'all' ? '2px solid #2563eb' : '2px solid transparent',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              All Requests
              <span style={{ 
                backgroundColor: activeTab === 'all' ? '#2563eb' : '#64748b',
                color: 'white',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                {totalCount}
              </span>
            </button>
            <button 
              onClick={() => setActiveTab('absence')}
              style={{ 
                padding: '16px 24px',
                border: 'none',
                backgroundColor: activeTab === 'absence' ? 'white' : 'transparent',
                color: activeTab === 'absence' ? '#2563eb' : '#64748b',
                fontWeight: '500',
                cursor: 'pointer',
                borderBottom: activeTab === 'absence' ? '2px solid #2563eb' : '2px solid transparent',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              Absence
              <span style={{ 
                backgroundColor: activeTab === 'absence' ? '#2563eb' : '#64748b',
                color: 'white',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                {absenceCount}
              </span>
            </button>
            <button 
              onClick={() => setActiveTab('extra')}
              style={{ 
                padding: '16px 24px',
                border: 'none',
                backgroundColor: activeTab === 'extra' ? 'white' : 'transparent',
                color: activeTab === 'extra' ? '#2563eb' : '#64748b',
                fontWeight: '500',
                cursor: 'pointer',
                borderBottom: activeTab === 'extra' ? '2px solid #2563eb' : '2px solid transparent',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              Extra Hours
              <span style={{ 
                backgroundColor: activeTab === 'extra' ? '#2563eb' : '#64748b',
                color: 'white',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                {extraCount}
              </span>
            </button>
          </div>

          <div style={{ padding: '2rem' }}>
            {isLoading ? (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                padding: '3rem',
                color: '#666'
              }}>
                Loading requests...
              </div>
            ) : filteredRows.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '3rem',
                color: '#6b7280'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '1rem' }}>📋</div>
                <h3 style={{ margin: '0 0 0.5rem 0', color: '#374151' }}>No pending requests</h3>
                <p>There are no {activeTab !== 'all' ? activeTab : ''} requests waiting for review.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ 
                  width: '100%', 
                  borderCollapse: 'collapse',
                  fontSize: '14px'
                }}>
                  <thead>
                    <tr style={{ 
                      backgroundColor: '#f8fafc',
                      borderBottom: '2px solid #e2e8f0'
                    }}>
                      <th style={{ 
                        padding: '12px 16px',
                        textAlign: 'left',
                        fontWeight: '600',
                        color: '#374151',
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>Employee</th>
                      {activeTab === 'all' && (
                        <th style={{ 
                          padding: '12px 16px',
                          textAlign: 'left',
                          fontWeight: '600',
                          color: '#374151',
                          fontSize: '12px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em'
                        }}>Type</th>
                      )}
                      <th style={{ 
                        padding: '12px 16px',
                        textAlign: 'left',
                        fontWeight: '600',
                        color: '#374151',
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>Date(s)</th>
                      {(activeTab === 'all' || activeTab === 'extra') && (
                        <th style={{ 
                          padding: '12px 16px',
                          textAlign: 'left',
                          fontWeight: '600',
                          color: '#374151',
                          fontSize: '12px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em'
                        }}>Time Window</th>
                      )}
                      {(activeTab === 'all' || activeTab === 'absence') && (
                        <th style={{ 
                          padding: '12px 16px',
                          textAlign: 'left',
                          fontWeight: '600',
                          color: '#374151',
                          fontSize: '12px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em'
                        }}>Reason & Details</th>
                      )}
                      <th style={{ 
                        padding: '12px 16px',
                        textAlign: 'left',
                        fontWeight: '600',
                        color: '#374151',
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        width: '300px'
                      }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map(r => {
                      const dates = r.date
                        ? r.date
                        : (r.rangeStart && r.rangeEnd ? `${r.rangeStart} to ${r.rangeEnd}` : '—');
                      const windowLabel = r.startMin != null && r.endMin != null ? `${minToLabel(r.startMin)} – ${minToLabel(r.endMin)}` : '—';
                      
                      return (
                        <tr key={r.id} style={{ 
                          borderBottom: '1px solid #f1f5f9',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <td style={{ padding: '16px' }}>
                            <div style={{ fontWeight: '500', color: '#1f2937' }}>{r.name}</div>
                            <div style={{ color: '#6b7280', fontSize: '12px', marginTop: '2px' }}>{r.email || '—'}</div>
                          </td>
                          {activeTab === 'all' && (
                            <td style={{ padding: '16px' }}>
                              <span style={{ 
                                display: 'inline-block',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: '500',
                                backgroundColor: r.kind === 'EXTRA_HOURS' ? '#f0fdf4' : '#f0f9ff',
                                color: r.kind === 'EXTRA_HOURS' ? '#166534' : '#0369a1',
                                border: `1px solid ${r.kind === 'EXTRA_HOURS' ? '#bbf7d0' : '#bae6fd'}`
                              }}>
                                {r.kind === 'EXTRA_HOURS' ? 'Extra Hours' : 'Absence'}
                              </span>
                            </td>
                          )}
                          <td style={{ padding: '16px', color: '#374151', fontWeight: '500' }}>
                            {dates}
                          </td>
                          {(activeTab === 'all' || activeTab === 'extra') && (
                            <td style={{ padding: '16px', color: '#6b7280' }}>
                              {windowLabel}
                            </td>
                          )}
                          {(activeTab === 'all' || activeTab === 'absence') && (
                            <td style={{ padding: '16px' }}>
                              <div style={{ fontWeight: '500', color: '#1f2937' }}>{r.reason || '—'}</div>
                              {r.comment && (
                                <div style={{ 
                                  color: '#6b7280', 
                                  fontSize: '12px', 
                                  marginTop: '4px',
                                  fontStyle: 'italic'
                                }}>
                                  {r.comment}
                                </div>
                              )}
                            </td>
                          )}
                          <td style={{ padding: '16px' }}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                              <input
                                placeholder="Review notes..."
                                value={note[r.id] ?? r.reviewNote ?? ''}
                                onChange={e => setNote(s => ({ ...s, [r.id]: e.target.value }))}
                                style={{
                                  flex: 1,
                                  padding: '8px 12px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '6px',
                                  fontSize: '14px',
                                  transition: 'border-color 0.2s'
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                                onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                              />
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <button
  onClick={() => act(r.id, 'approve')}
  disabled={isActing}
  style={{
    padding: '8px 16px',
    backgroundColor: '#16a34a',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: isActing ? 'not-allowed' : 'pointer',
    opacity: isActing ? 0.6 : 1,
    transition: 'background-color 0.2s',
    whiteSpace: 'nowrap'
  }}
>
  Approve
</button>

<button
  onClick={() => act(r.id, 'reject')}
  disabled={isActing}
  style={{
    padding: '8px 16px',
    backgroundColor: 'transparent',
    color: '#dc2626',
    border: '1px solid #dc2626',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: isActing ? 'not-allowed' : 'pointer',
    opacity: isActing ? 0.6 : 1,
    transition: 'all 0.2s',
    whiteSpace: 'nowrap'
  }}
>
  Reject
</button>
{isActing && (
  <div
    aria-busy="true"
    style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.35)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'all'
    }}
  >
    <div
      style={{
        background: 'white',
        padding: '14px 18px',
        borderRadius: 8,
        boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
        fontWeight: 600,
        color: '#374151',
        minWidth: 160,
        textAlign: 'center'
      }}
    >
      Processing…
    </div>
  </div>
)}

                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Rejection Reason Modal */}
      {rejectModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '2rem',
            width: '100%',
            maxWidth: '500px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{
                margin: '0 0 0.5rem 0',
                fontSize: '20px',
                fontWeight: '600',
                color: '#1f2937'
              }}>
                Rejection Reason Required
              </h2>
              <p style={{
                margin: 0,
                color: '#6b7280',
                fontSize: '14px'
              }}>
                Please provide a reason for rejecting {pendingRejection?.name}'s request.
              </p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151'
              }}>
                Rejection Reason *
              </label>
              <textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="Explain why this request is being rejected..."
                rows={4}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  resize: 'vertical',
                  transition: 'border-color 0.2s',
                  fontFamily: 'inherit'
                }}
                onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
              />
              <p style={{
                margin: '0.5rem 0 0 0',
                fontSize: '12px',
                color: '#6b7280'
              }}>
                This reason will be visible to the employee.
              </p>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px'
            }}>
              <button
                onClick={handleRejectCancel}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'transparent',
                  color: '#6b7280',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                  e.currentTarget.style.borderColor = '#9ca3af';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.borderColor = '#d1d5db';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRejectConfirm}
                disabled={!rejectionReason.trim()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: !rejectionReason.trim() ? '#9ca3af' : '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: !rejectionReason.trim() ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => {
                  if (rejectionReason.trim()) {
                    e.currentTarget.style.backgroundColor = '#b91c1c';
                  }
                }}
                onMouseOut={(e) => {
                  if (rejectionReason.trim()) {
                    e.currentTarget.style.backgroundColor = '#dc2626';
                  }
                }}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}