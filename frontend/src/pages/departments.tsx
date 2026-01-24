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

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>;
  if (!user)
    return (
      <div className="p-8 text-gray-500">
        <Link href="/login" className="text-blue-600 hover:underline">
          Login
        </Link>{' '}
        required.
      </div>
    );
  if (!['hr', 'super_admin'].includes(user.role))
    return <div className="p-8 text-red-600">Forbidden.</div>;

  const filtered = rows.filter(d =>
    d.departmentName.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <main className="max-w-[1000px] mx-auto my-8 p-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="mr-auto text-2xl font-bold text-gray-900">
          Departments & Positions
        </h1>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search department…"
          className="p-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-600"
        />
      </div>

      {/* Create department */}
      <section className="border border-gray-300 p-5 rounded-xl mt-3 bg-white shadow-sm">
        <h3 className="text-lg font-bold text-gray-800 mb-3">
          Create Department
        </h3>
        <form onSubmit={submitDept} className="grid gap-2 max-w-[600px]">
          <label>
            <div className="text-xs text-gray-500 mb-1">Department name</div>
            <input
              value={deptName}
              onChange={e => setDeptName(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </label>
          <div>
            <div className="text-xs text-gray-500 mb-1">Positions</div>
            {pos.map((p, i) => (
              <div key={i} className="flex gap-2 mb-1.5">
                <input
                  value={p}
                  onChange={e => setPosVal(i, e.target.value)}
                  className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-600"
                />
                {pos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => rmPosInput(i)}
                    className="px-3 border border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100"
                  >
                    −
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addPosInput}
              className="text-sm text-blue-600 font-medium hover:underline mt-1"
            >
              + Add position
            </button>
          </div>
          <div className="mt-2">
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Create
            </button>
          </div>
        </form>
      </section>

      {/* List */}
      <section className="mt-4">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left">
              <th className="w-[260px] pb-2 border-b-2 border-gray-300 font-semibold text-gray-700">
                Department
              </th>
              <th className="pb-2 border-b-2 border-gray-300 font-semibold text-gray-700">
                Positions
              </th>
              <th className="w-[160px] pb-2 border-b-2 border-gray-300 font-semibold text-gray-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => (
              <React.Fragment key={d.id}>
                <tr>
                  <td className="py-3 pr-4 align-top font-medium text-gray-800">
                    {d.departmentName}
                  </td>
                  <td className="py-3 pr-4 align-top">
                    <div className="flex gap-3 flex-wrap">
                      {d.positions.map(p => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1.5 border border-gray-300 px-2.5 py-1.5 rounded-full bg-gray-50 text-sm"
                        >
                          <span className="font-medium text-gray-700">
                            {p.name}
                          </span>
                          <button
                            type="button"
                            title="Rename"
                            onClick={() => renamePos(p)}
                            className="w-5 h-5 flex items-center justify-center border border-gray-300 rounded bg-white cursor-pointer hover:bg-gray-100 text-xs text-gray-500"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            onClick={() => delPos(p.id)}
                            className="w-5 h-5 flex items-center justify-center border border-red-200 rounded bg-white text-red-600 cursor-pointer hover:bg-red-50 text-xs"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => addPosition(d.id)}
                        className="text-sm text-blue-600 font-medium hover:underline self-center"
                      >
                        + add
                      </button>
                    </div>
                  </td>
                  <td className="py-3 align-top whitespace-nowrap">
                    <button
                      onClick={() => renameDept(d)}
                      className="text-blue-600 hover:underline mr-3 font-medium text-sm bg-transparent border-none cursor-pointer"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => delDept(d.id)}
                      className="text-red-600 hover:underline font-medium text-sm bg-transparent border-none cursor-pointer"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
                <tr aria-hidden>
                  <td colSpan={3}>
                    <div className="h-px bg-gray-200 my-2" />
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
