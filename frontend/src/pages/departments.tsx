import {useEffect, useState} from 'react';
import React from 'react';
import {useAuth} from '@/context/AuthContext';
import {fetchWithAuth} from '@/lib/api';
import {Search, Plus, Trash2, Edit2, Building2, ChevronUp} from 'lucide-react';

type Position = {id: number; name: string};
type Dept = {id: number; departmentName: string; positions: Position[]};

export default function DepartmentsPage() {
  const {user, loading} = useAuth();
  const [rows, setRows] = useState<Dept[]>([]);
  const [q, setQ] = useState('');

  // new department form
  const [showCreate, setShowCreate] = useState(false);
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
      setShowCreate(false);
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

  if (loading) return null;
  if (!user)
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Authentication required.
      </div>
    );
  if (!['hr', 'super_admin'].includes(user.role))
    return (
      <div className="flex h-screen items-center justify-center text-red-600">
        Access Denied.
      </div>
    );

  const filtered = rows.filter(d =>
    d.departmentName.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 shrink-0 pl-16">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            Departments & Positions
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage company structure and roles
          </p>
        </div>

        <button
          onClick={() => setShowCreate(!showCreate)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            showCreate
              ? 'bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {showCreate ? <ChevronUp size={16} /> : <Plus size={16} />}
          {showCreate ? 'Close Form' : 'New Department'}
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="mb-6 p-6 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm shrink-0 animate-[slideDown_0.2s_ease-out]">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide mb-4">
            Create Department
          </h3>
          <form onSubmit={submitDept} className="space-y-4 max-w-2xl">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                Department Name
              </label>
              <input
                value={deptName}
                onChange={e => setDeptName(e.target.value)}
                placeholder="e.g. Engineering"
                className="w-full p-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                Positions
              </label>
              <div className="space-y-2">
                {pos.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={p}
                      onChange={e => setPosVal(i, e.target.value)}
                      placeholder={`Position ${i + 1}`}
                      className="flex-1 p-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                    {pos.length > 1 && (
                      <button
                        type="button"
                        onClick={() => rmPosInput(i)}
                        className="px-3 bg-gray-100 dark:bg-white/5 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addPosInput}
                className="text-sm text-blue-600 dark:text-blue-400 font-medium hover:underline mt-2 flex items-center gap-1"
              >
                <Plus size={14} /> Add position
              </button>
            </div>
            <div className="pt-2">
              <button
                type="submit"
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Create Department
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-4 mb-4 shrink-0">
        <div className="relative flex-1 max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search departments..."
            value={q}
            onChange={e => setQ(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="flex-1 overflow-hidden border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-[#111] shadow-sm flex flex-col">
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50/90 dark:bg-[#111]/90 backdrop-blur sticky top-0 z-10">
              <tr>
                <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800 w-1/3">
                  Department
                </th>
                <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                  Positions
                </th>
                <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800 text-right w-[150px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-gray-500">
                    No departments found.
                  </td>
                </tr>
              ) : (
                filtered.map(d => (
                  <tr
                    key={d.id}
                    className="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <td className="p-6 align-top">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg">
                          <Building2 size={20} />
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-white text-base">
                            {d.departmentName}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            ID: {d.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-6 align-top">
                      <div className="flex flex-wrap gap-2">
                        {d.positions.map(p => (
                          <div
                            key={p.id}
                            className="inline-flex items-center gap-2 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-full text-sm group/pos hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                          >
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              {p.name}
                            </span>
                            <div className="flex items-center gap-1 opacity-0 group-hover/pos:opacity-100 transition-opacity">
                              <button
                                onClick={() => renamePos(p)}
                                className="text-gray-400 hover:text-blue-600 transition-colors"
                                title="Rename"
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                onClick={() => delPos(p.id)}
                                className="text-gray-400 hover:text-red-600 transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                        <button
                          onClick={() => addPosition(d.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                        >
                          <Plus size={14} /> Add
                        </button>
                      </div>
                    </td>
                    <td className="p-6 align-top text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => renameDept(d)}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          title="Rename Department"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => delDept(d.id)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Delete Department"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
