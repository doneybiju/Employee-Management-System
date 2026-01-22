import {useEffect, useState} from 'react';
import React from 'react';
import {useAuth} from '@/context/AuthContext';
import {fetchWithAuth} from '@/lib/api';
import Link from 'next/link';

type Position = {id: number; name: string};
type Dept = {id: number; departmentName: string; positions: Position[]};

export default function DepartmentsPage() {
  const {user, loading} = useAuth();
  const [rows, setRows] = useState<Dept[]>([]);
  const [q, setQ] = useState('');

  // new department form
  const [deptName, setDeptName] = useState('');
  const [pos, setPos] = useState<string[]>(['']);

  const load = async () => {
    const res = await fetchWithAuth('/api/departments', {cache: 'no-store'});
    if (res.status === 304) return; // nothing changed
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []); // always an array
  };

  useEffect(() => {
    if (!loading && user && ['hr', 'super_admin'].includes(user.role)) load();
  }, [loading, user]);

  const addPosInput = () => setPos(p => [...p, '']);
  const setPosVal = (i: number, v: string) =>
    setPos(p => p.map((x, idx) => (idx === i ? v : x)));
  const rmPosInput = (i: number) =>
    setPos(p => p.filter((_, idx) => idx !== i));

  const submitDept = async (e: React.FormEvent) => {
    e.preventDefault();
    const positions = pos.map(p => p.trim()).filter(Boolean);
    if (!deptName.trim()) return alert('Department name required');
    try {
      await fetchWithAuth('/api/departments', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({departmentName: deptName.trim(), positions}),
      });
      setDeptName('');
      setPos(['']);
      await load();
    } catch (e: any) {
      alert(e.message || 'Create failed');
    }
  };

  const addPosition = async (deptId: number) => {
    const name = prompt('Position name?')?.trim();
    if (!name) return;
    try {
      await fetchWithAuth(`/api/departments/${deptId}/positions`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name}),
      });
      await load();
    } catch (e: any) {
      alert(e.message || 'Create failed');
    }
  };

  const renameDept = async (d: Dept) => {
    const name = prompt('New department name', d.departmentName)?.trim();
    if (!name || name === d.departmentName) return;
    try {
      await fetchWithAuth(`/api/departments/${d.id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({departmentName: name}),
      });
      await load();
    } catch (e: any) {
      alert(e.message || 'Rename failed');
    }
  };

  const renamePos = async (p: Position) => {
    const name = prompt('New position name', p.name)?.trim();
    if (!name || name === p.name) return;
    try {
      await fetchWithAuth(`/api/departments/positions/${p.id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name}),
      });
      await load();
    } catch (e: any) {
      alert(e.message || 'Rename failed');
    }
  };

  const delDept = async (id: number) => {
    if (
      !confirm('Delete this department? Positions will be removed if unused.')
    )
      return;
    try {
      await fetchWithAuth(`/api/departments/${id}`, {method: 'DELETE'});
      await load();
    } catch (e: any) {
      alert(e.message || 'Delete failed');
    }
  };

  const delPos = async (id: number) => {
    if (!confirm('Delete this position?')) return;
    try {
      await fetchWithAuth(`/api/departments/positions/${id}`, {
        method: 'DELETE',
      });
      await load();
    } catch (e: any) {
      alert(e.message || 'Delete failed');
    }
  };

  if (loading) return <div>Loading…</div>;
  if (!user)
    return (
      <div>
        <Link href="/login">Login</Link> required.
      </div>
    );
  if (!['hr', 'super_admin'].includes(user.role)) return <div>Forbidden.</div>;

  const filtered = rows.filter(d =>
    d.departmentName.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <main style={{maxWidth: 1000, margin: '2rem auto', padding: 16}}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h1 style={{marginRight: 'auto'}}>Departments & Positions</h1>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search department…"
          style={{padding: 8}}
        />
      </div>

      {/* Create department */}
      <section
        style={{
          border: '2px solid #d1d5db',
          padding: 20,
          borderRadius: 12,
          marginTop: 12,
          background: '#fff',
        }}
      >
        <h3>Create Department</h3>
        <form
          onSubmit={submitDept}
          style={{display: 'grid', gap: 8, maxWidth: 600}}
        >
          <label>
            <div style={{fontSize: 12, color: '#666'}}>Department name</div>
            <input
              value={deptName}
              onChange={e => setDeptName(e.target.value)}
            />
          </label>
          <div>
            <div style={{fontSize: 12, color: '#666', marginBottom: 4}}>
              Positions
            </div>
            {pos.map((p, i) => (
              <div key={i} style={{display: 'flex', gap: 8, marginBottom: 6}}>
                <input
                  value={p}
                  onChange={e => setPosVal(i, e.target.value)}
                  style={{flex: 1}}
                />
                {pos.length > 1 && (
                  <button type="button" onClick={() => rmPosInput(i)}>
                    −
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={addPosInput}>
              + Add position
            </button>
          </div>
          <div>
            <button type="submit">Create</button>
          </div>
        </form>
      </section>

      {/* List */}
      <section style={{marginTop: 16}}>
        <table
          width="100%"
          cellPadding={10}
          style={{borderCollapse: 'separate', borderSpacing: 0}}
        >
          <thead>
            <tr style={{textAlign: 'left', borderBottom: '2px solid #d1d5db'}}>
              <th style={{width: 260}}>Department</th>
              <th>Positions</th>
              <th style={{width: 160}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => (
              <React.Fragment key={d.id}>
                <tr>
                  <td>{d.departmentName}</td>
                  <td>
                    <div style={{display: 'flex', gap: 12, flexWrap: 'wrap'}}>
                      {d.positions.map(p => (
                        <span
                          key={p.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            border: '2px solid #d1d5db',
                            padding: '6px 10px',
                            borderRadius: 999,
                            background: '#f9fafb',
                          }}
                        >
                          <span style={{fontWeight: 500}}>{p.name}</span>
                          <button
                            type="button"
                            title="Rename"
                            onClick={() => renamePos(p)}
                            style={{
                              width: 22,
                              height: 22,
                              lineHeight: '20px',
                              textAlign: 'center',
                              border: '1px solid #cbd5e1',
                              borderRadius: 6,
                              background: '#fff',
                              cursor: 'pointer',
                            }}
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            onClick={() => delPos(p.id)}
                            style={{
                              width: 22,
                              height: 22,
                              lineHeight: '20px',
                              textAlign: 'center',
                              border: '1px solid #fecaca',
                              borderRadius: 6,
                              background: '#fff',
                              color: '#b91c1c',
                              cursor: 'pointer',
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <button type="button" onClick={() => addPosition(d.id)}>
                        + add
                      </button>
                    </div>
                  </td>
                  <td style={{whiteSpace: 'nowrap'}}>
                    <button onClick={() => renameDept(d)}>Rename</button>{' '}
                    <button
                      onClick={() => delDept(d.id)}
                      style={{color: '#b00'}}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
                <tr aria-hidden>
                  <td colSpan={3}>
                    <div
                      style={{
                        height: 2,
                        background: '#d1d5db',
                        margin: '18px 0',
                      }}
                    />
                  </td>
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
