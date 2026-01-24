// frontend/src/pages/projects/[id].tsx
import {useEffect, useState, type FormEvent} from 'react';
import {useRouter} from 'next/router';
import Link from 'next/link';
import {useAuth} from '@/context/AuthContext';
import {fetchWithAuth} from '@/lib/api';

type Member = {id: number; name: string; email?: string};
type ChecklistItem = {id: number; title: string; done: boolean; sort: number};
type Task = {
  id: number;
  title: string;
  description?: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED';
  dueDate?: string | null;
  assignedTo: {id: number; name: string} | null;
  checklistEnabled: boolean;
  checklistItems: ChecklistItem[];
};
type ProjectDetail = {
  id: number;
  createdById?: number | null;
  title: string;
  description?: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED';
  dueDate?: string | null;
  members: Member[];
  tasks: Task[];
};

function computeProjectStatus(
  tasks: {status: Task['status']}[],
): 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' {
  if (!tasks || tasks.length === 0) return 'NOT_STARTED';

  const allCompleted = tasks.every(t => t.status === 'COMPLETED');
  if (allCompleted) return 'COMPLETED';

  const allNotStarted = tasks.every(t => t.status === 'NOT_STARTED');
  if (allNotStarted) return 'NOT_STARTED';

  // Any mix (including BLOCKED) => in progress
  return 'IN_PROGRESS';
}

function computeProgress(tasks: Task[]): number {
  if (!tasks || tasks.length === 0) return 0;
  const completed = tasks.filter(t => t.status === 'COMPLETED').length;
  return Math.round((completed / tasks.length) * 100);
}

export default function ProjectDetailPage() {
  const router = useRouter();
  const projId = Number(router.query.id);
  const {user} = useAuth();

  const isAuthorized =
    !!user && (user.role === 'super_admin' || user?.empType === 'team_lead');

  const [proj, setProj] = useState<ProjectDetail | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // member add UI
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<Member[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [addingMembers, setAddingMembers] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);

  // task create UI
  const [tTitle, setTTitle] = useState('');
  const [tDesc, setTDesc] = useState('');
  const [tDue, setTDue] = useState('');
  const [tAssign, setTAssign] = useState<number | ''>('');
  const [creatingTask, setCreatingTask] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);

  // checklist (creation only)
  const [tChecklistEnabled, setTChecklistEnabled] = useState(false);
  const [tChecklistItems, setTChecklistItems] = useState<string[]>(['']);

  // Status colors mapping
  const statusColors = {
    NOT_STARTED: {bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db'},
    IN_PROGRESS: {bg: '#dbeafe', text: '#1e40af', border: '#93c5fd'},
    BLOCKED: {bg: '#fee2e2', text: '#dc2626', border: '#fca5a5'},
    COMPLETED: {bg: '#d1fae5', text: '#065f46', border: '#6ee7b7'},
    ON_HOLD: {bg: '#fef3c7', text: '#92400e', border: '#fcd34d'},
  };

  const statusIcons = {
    NOT_STARTED: '⏳',
    IN_PROGRESS: '🔄',
    BLOCKED: '🚫',
    COMPLETED: '✅',
    ON_HOLD: '⏸️',
  };

  function normalizeProject(raw: any): ProjectDetail {
    const members: Member[] = (raw?.members ?? []).map((m: any) => {
      const u = m?.user ?? {};
      const name =
        `${u.firstName ?? ''} ${u.surname ?? ''}`.trim() ||
        u.companyEmail ||
        `User #${u.id}`;
      return {id: Number(u.id), name, email: u.companyEmail};
    });

    const tasks: Task[] = (raw?.tasks ?? []).map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description ?? null,
      status: t.status,
      dueDate: t.dueDate ?? null,
      assignedTo: t.assignee
        ? {
            id: Number(t.assignee.id),
            name:
              `${t.assignee.firstName ?? ''} ${t.assignee.surname ?? ''}`.trim() ||
              t.assignee.companyEmail ||
              `User #${t.assignee.id}`,
          }
        : null,
      checklistEnabled: !!t.checklistEnabled,
      checklistItems: Array.isArray(t.checklistItems)
        ? t.checklistItems.map((i: any) => ({
            id: i.id,
            title: i.title,
            done: !!i.done,
            sort: i.sort ?? 0,
          }))
        : [],
    }));

    return {
      id: raw.id,
      createdById: raw?.createdById ?? null,
      title: raw.title,
      description: raw.description ?? null,
      status: raw.status,
      dueDate: raw.dueDate ?? null,
      members,
      tasks,
    };
  }

  useEffect(() => {
    if (!projId) return;
    let dead = false;
    (async () => {
      setLoading(true);
      try {
        const detailRes = await fetchWithAuth(`/api/projects/${projId}`);

        if (detailRes.status === 403) {
          if (!dead) {
            setProj(null);
            setCanManage(false);
            setErr("You don't have access to this project.");
          }
          return;
        }

        if (detailRes.status === 404) {
          if (!dead) {
            setProj(null);
            setCanManage(false);
            setErr(null);
          }
          return;
        }

        if (!detailRes.ok) {
          const j = await detailRes.json().catch(() => ({}));
          throw new Error(j?.error || 'Failed to load project');
        }

        const detail = await detailRes.json();
        const normalized = normalizeProject(detail);

        const meId = Number(user?.id);
        const isMember = normalized.members.some(m => m.id === meId);
        const isCreator = Number(detail?.createdById) === meId;

        const canManageThis =
          user?.role === 'super_admin' ||
          (user?.empType === 'team_lead' && (isMember || isCreator));

        if (!dead) {
          setCanManage(!!canManageThis);
          setProj(normalized);
          setErr(null);
        }
      } catch (e: any) {
        if (!dead) setErr(e?.message || 'Failed to load project');
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, [projId, user?.id, user?.role, user?.empType]);

  // search candidates to add as members (only if manager)
  useEffect(() => {
    if (!canManage) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetchWithAuth(
          `/api/projects/member-candidates?q=${encodeURIComponent(search)}`,
          {signal: ctrl.signal} as any,
        );
        if (!res.ok) return;
        const list: Member[] = await res.json();
        const existing = new Set((proj?.members || []).map(m => m.id));
        setCandidates(list.filter(c => !existing.has(c.id)));
      } catch {}
    })();
    return () => ctrl.abort();
  }, [search, canManage, proj]);

  async function refresh() {
    const res = await fetchWithAuth(`/api/projects/${projId}`);
    const j = await res.json();
    setProj(normalizeProject(j));
  }

  async function addMembers(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedIds.length) return;
    setAddingMembers(true);
    try {
      const res = await fetchWithAuth(`/api/projects/${projId}/members`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({userIds: selectedIds}),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `${res.status} ${res.statusText}`);
      }
      setSelectedIds([]);
      setSearch('');
      setShowMemberModal(false);
      await refresh();
    } catch (e: any) {
      alert(e?.message || 'Failed to add members');
    } finally {
      setAddingMembers(false);
    }
  }

  // Remove a member (only if not assigned to any tasks)
  async function removeMember(userId: number, memberName: string) {
    if (!proj) return;

    // client-side precheck
    const assigned = (proj.tasks || []).filter(
      t => t.assignedTo?.id === userId,
    );
    if (assigned.length) {
      const names = assigned.map(t => `• ${t.title}`).join('\n');
      alert(
        `Cannot remove ${memberName}.\n\nThis user is assigned to the following task(s):\n${names}\n\n` +
          'Please unassign/reassign them first.',
      );
      return;
    }

    if (!confirm(`Remove ${memberName} from this project?`)) return;

    try {
      const res = await fetchWithAuth(
        `/api/projects/${projId}/members/${userId}`,
        {method: 'DELETE'},
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (
          res.status === 409 &&
          j?.error === 'user_has_assigned_tasks' &&
          Array.isArray(j?.tasks)
        ) {
          const names = j.tasks.map((t: any) => `• ${t.title}`).join('\n');
          throw new Error(
            `Cannot remove ${memberName}.\n\nThis user is assigned to:\n${names}\n\n` +
              'Please unassign/reassign them first.',
          );
        }
        throw new Error(j?.error || `${res.status} ${res.statusText}`);
      }
      await refresh();
    } catch (e: any) {
      alert(e?.message || 'Failed to remove member');
    }
  }

  async function createTask(e: FormEvent) {
    e.preventDefault();
    setCreatingTask(true);
    try {
      const cleanItems = tChecklistEnabled
        ? tChecklistItems.map(s => s.trim()).filter(Boolean)
        : [];

      const res = await fetchWithAuth(`/api/projects/${projId}/tasks`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          title: tTitle,
          description: tDesc || null,
          dueDate: tDue || null,
          assigneeId: tAssign || null,
          status: 'NOT_STARTED',
          checklistEnabled: tChecklistEnabled,
          checklistItems: cleanItems,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `${res.status} ${res.statusText}`);
      }
      // reset form
      setTTitle('');
      setTDesc('');
      setTDue('');
      setTAssign('');
      setTChecklistEnabled(false);
      setTChecklistItems(['']);
      setShowTaskModal(false);
      await refresh();
    } catch (e: any) {
      alert(e?.message || 'Failed to create task');
    } finally {
      setCreatingTask(false);
    }
  }

  async function updateStatus(taskId: number, status: Task['status']) {
    try {
      const res = await fetchWithAuth(`/api/projects/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({status}),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `${res.status} ${res.statusText}`);
      }
      await refresh();
    } catch (e: any) {
      alert(e?.message || 'Failed to update status');
    }
  }

  async function deleteTask(taskId: number) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      const res = await fetchWithAuth(`/api/projects/tasks/${taskId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `${res.status} ${res.statusText}`);
      }
      setExpandedTaskIds(s => s.filter(id => id !== taskId));
      await refresh();
    } catch (e: any) {
      alert(e?.message || 'Failed to delete task');
    }
  }

  async function updateTask(
    taskId: number,
    patch: Partial<{
      title: string;
      description: string | null;
      dueDate: string | null;
      assigneeId: number | null;
      status: Task['status'];
      checklistEnabled: boolean;
    }>,
  ) {
    const r = await fetchWithAuth(`/api/projects/tasks/${taskId}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(patch),
    });
    if (!r.ok)
      throw new Error(
        (await r.json().catch(() => ({})))?.error || 'Update failed',
      );
    await refresh();
  }

  async function setChecklistEnabled(taskId: number, enabled: boolean) {
    const r = await fetchWithAuth(
      `/api/projects/tasks/${taskId}/checklist-enabled`,
      {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({checklistEnabled: enabled}),
      },
    );
    if (!r.ok) throw new Error('Checklist toggle failed');
    await refresh();
  }

  async function addChecklistItem(taskId: number, title: string) {
    const r = await fetchWithAuth(`/api/projects/tasks/${taskId}/checklist`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({title}),
    });
    if (!r.ok) throw new Error('Add item failed');
    await refresh();
  }

  async function toggleChecklistItem(
    taskId: number,
    itemId: number,
    done: boolean,
  ) {
    const r = await fetchWithAuth(
      `/api/projects/tasks/${taskId}/checklist/${itemId}`,
      {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({done}),
      },
    );
    if (!r.ok) throw new Error('Toggle item failed');
    await refresh();
  }

  async function removeChecklistItem(taskId: number, itemId: number) {
    const r = await fetchWithAuth(
      `/api/projects/tasks/${taskId}/checklist/${itemId}`,
      {method: 'DELETE'},
    );
    if (!r.ok) throw new Error('Delete item failed');
    await refresh();
  }
  // Members can only act on their own tasks; managers can act on anything.
  const meCanActOnTask = (t: Task) =>
    canManage || (user?.id && t.assignedTo?.id === Number(user.id));

  // --- keep expansion across refreshes ---
  const [expandedTaskIds, setExpandedTaskIds] = useState<number[]>([]);
  const isExpanded = (id: number) => expandedTaskIds.includes(id);
  const toggleExpanded = (id: number) =>
    setExpandedTaskIds(s =>
      s.includes(id) ? s.filter(x => x !== id) : [...s, id],
    );
  // --- single edit mode (parent controls which card is editing) ---
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);

  function TaskCard({
    t,
    members,
    canEdit,
    expanded,
    onToggle,
    isEditing,
    onStartEdit,
    onCancelEdit,
    canAct,
  }: {
    t: Task;
    members: Member[];
    canEdit: boolean;
    expanded: boolean;
    onToggle: () => void;
    isEditing: boolean;
    onStartEdit: () => void;
    onCancelEdit: () => void;
    canAct: boolean;
  }) {
    const [eTitle, setETitle] = useState(t.title);
    const [eDesc, setEDesc] = useState(t.description || '');
    const [eDue, setEDue] = useState(
      t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : '',
    );
    const [eAssign, setEAssign] = useState<number | ''>(t.assignedTo?.id ?? '');
    const [newItem, setNewItem] = useState('');
    const statusColor = statusColors[t.status];
    const statusIcon = statusIcons[t.status];

    // Auto-expand when entering edit mode
    useEffect(() => {
      if (isEditing && !expanded) onToggle();
    }, [isEditing, expanded, onToggle]);

    // Progress calculation for checklist
    const checklistProgress =
      t.checklistEnabled && t.checklistItems.length > 0
        ? Math.round(
            (t.checklistItems.filter(item => item.done).length /
              t.checklistItems.length) *
              100,
          )
        : 0;

    return (
      <div
        className={`bg-white rounded-2xl border-2 transition-all overflow-hidden relative ${
          expanded
            ? 'border-blue-500 shadow-[0_12px_40px_rgba(0,112,243,0.15)]'
            : 'border-gray-100 hover:border-gray-200 hover:shadow-lg hover:-translate-y-0.5'
        }`}
      >
        <div
          className={
            'p-6 cursor-pointer flex justify-between items-start gap-4 transition-colors bg-gradient-to-br from-gray-50 to-white hover:from-gray-100 hover:to-gray-50'
          }
          onClick={() => !isEditing && onToggle()}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-4 mb-3 flex-wrap">
              {!isEditing ? (
                <h4 className="text-xl font-bold m-0 text-gray-800 leading-snug flex-1 min-w-[200px]">
                  {t.title}
                </h4>
              ) : (
                <input
                  className="text-xl font-bold border-2 border-blue-500 rounded-lg p-3 flex-1 bg-white font-inherit"
                  value={eTitle}
                  onChange={e => setETitle(e.target.value)}
                  onClick={e => e.stopPropagation()}
                />
              )}

              <div
                className={
                  'px-4 py-2 rounded-[20px] text-xs font-bold inline-flex items-center gap-1.5 border-2 uppercase tracking-wide'
                }
                style={{
                  backgroundColor: statusColor.bg,
                  color: statusColor.text,
                  borderColor: statusColor.border,
                }}
              >
                <span className="text-base">{statusIcon}</span>
                {t.status.replace('_', ' ')}
              </div>
            </div>

            <div className="flex gap-6 flex-wrap">
              <span className="text-sm text-gray-500 flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-gray-200">
                👤 {t.assignedTo?.name || 'Unassigned'}
              </span>
              {t.dueDate && (
                <span
                  className={`text-sm flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-gray-200 ${
                    new Date(t.dueDate) < new Date()
                      ? 'text-red-600 bg-red-50 border-red-200 font-semibold'
                      : 'text-gray-500'
                  }`}
                >
                  📅 {new Date(t.dueDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          <div
            className="flex gap-2 flex-shrink-0"
            onClick={e => e.stopPropagation()}
          >
            {canEdit && (
              <>
                <button
                  className="bg-white border-2 border-gray-200 rounded-lg cursor-pointer text-sm p-2.5 transition-all flex items-center justify-center w-10 h-10 hover:bg-gray-50 hover:border-gray-300 hover:scale-105"
                  onClick={e => {
                    e.stopPropagation();
                    onStartEdit();
                  }}
                  title="Edit"
                >
                  ✏️
                </button>

                <button
                  className="bg-white border-2 border-gray-200 rounded-lg cursor-pointer text-sm p-2.5 transition-all flex items-center justify-center w-10 h-10 hover:bg-red-50 hover:border-red-200 hover:text-red-600"
                  onClick={() => deleteTask(t.id)}
                  title="Delete task"
                >
                  🗑️
                </button>
              </>
            )}
            <button
              className="bg-white border-2 border-gray-200 rounded-lg cursor-pointer text-sm p-2.5 transition-all flex items-center justify-center w-10 h-10 hover:bg-blue-500 hover:border-blue-500 hover:text-white"
              onClick={onToggle}
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? '↑' : '↓'}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="px-6 pb-6 border-t border-gray-100 animate-[slideDown_0.3s_ease]">
            {!isEditing ? (
              <>
                {t.description && (
                  <div className="mb-6 p-5 bg-gray-50 rounded-xl border-l-4 border-blue-500">
                    <h5 className="text-sm font-bold text-gray-600 m-0 mb-3 uppercase tracking-wide">
                      Description
                    </h5>
                    <p className="text-gray-600 leading-relaxed m-0 text-[15px]">
                      {t.description}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-7 p-5 bg-gray-50 rounded-xl">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-gray-500 font-bold uppercase tracking-wide">
                      Assigned to:
                    </span>
                    <span className="text-sm font-bold text-gray-800 flex items-center gap-2">
                      <span className="text-base">👤</span>
                      {t.assignedTo?.name || 'Unassigned'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-gray-500 font-bold uppercase tracking-wide">
                      Due date:
                    </span>
                    <span
                      className={`text-sm font-bold text-gray-800 flex items-center gap-2 ${
                        t.dueDate && new Date(t.dueDate) < new Date()
                          ? 'text-red-600 font-bold'
                          : ''
                      }`}
                    >
                      <span className="text-base">📅</span>
                      {t.dueDate
                        ? new Date(t.dueDate).toLocaleDateString()
                        : 'No due date'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-gray-500 font-bold uppercase tracking-wide">
                      Created:
                    </span>
                    <span className="text-sm font-bold text-gray-800 flex items-center gap-2">
                      <span className="text-base">🕒</span>
                      Recently
                    </span>
                  </div>
                </div>

                {/* Enhanced Checklist Section */}
                <div className="mb-7 p-5 bg-gray-50 rounded-xl">
                  <div className="flex justify-between items-center mb-5">
                    <div className="flex items-center gap-4 flex-wrap">
                      <h5 className="m-0 text-base font-bold text-gray-800">
                        Checklist
                      </h5>
                      {t.checklistEnabled && t.checklistItems.length > 0 && (
                        <div className="flex items-center gap-3">
                          <div className="w-[100px] h-2 bg-gray-200 rounded overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-[width] duration-300 rounded"
                              style={{width: `${checklistProgress}%`}}
                            ></div>
                          </div>
                          <span className="text-sm font-bold text-gray-600 min-w-[40px]">
                            {checklistProgress}%
                          </span>
                        </div>
                      )}
                    </div>
                    {canEdit && (
                      <button
                        className={`bg-white border-2 border-gray-200 rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer transition-all hover:-translate-y-px ${t.checklistEnabled ? 'bg-green-100 border-green-200 text-green-800' : ''}`}
                        onClick={() =>
                          setChecklistEnabled(t.id, !t.checklistEnabled)
                        }
                      >
                        {t.checklistEnabled ? '✅ Enabled' : '❌ Disabled'}
                      </button>
                    )}
                  </div>

                  {t.checklistEnabled ? (
                    <>
                      <div className="space-y-3 mb-5">
                        {t.checklistItems
                          .sort((a, b) => a.sort - b.sort || a.id - b.id)
                          .map(ci => (
                            <div
                              key={ci.id}
                              className="flex items-center gap-3 p-4 bg-white border-2 border-gray-100 rounded-lg mb-2 transition-all hover:border-gray-200 hover:translate-x-1 group"
                            >
                              <label className="flex items-center gap-3 flex-1 cursor-pointer m-0">
                                <input
                                  type="checkbox"
                                  checked={ci.done}
                                  onChange={e =>
                                    canAct &&
                                    toggleChecklistItem(
                                      t.id,
                                      ci.id,
                                      e.target.checked,
                                    )
                                  }
                                  disabled={!canAct}
                                  className="w-5 h-5 rounded-md border-2 border-gray-300 cursor-pointer relative checked:bg-blue-600 checked:border-blue-600 after:content-['✓'] after:text-white after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:text-sm after:font-bold"
                                />

                                <span
                                  className={`text-sm flex-1 font-medium ${ci.done ? 'line-through text-gray-400' : ''}`}
                                >
                                  {ci.title}
                                </span>
                              </label>
                              {canEdit && (
                                <button
                                  className="bg-transparent border-none cursor-pointer text-xl text-gray-400 p-1 rounded transition-all opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
                                  onClick={() =>
                                    removeChecklistItem(t.id, ci.id)
                                  }
                                  title="Delete item"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          ))}
                      </div>

                      {canEdit && (
                        <div className="flex gap-3">
                          <input
                            placeholder="Add a new checklist item..."
                            value={newItem}
                            onChange={e => setNewItem(e.target.value)}
                            className="flex-1 p-3 border-2 border-gray-200 rounded-lg text-sm transition-colors font-inherit focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                            onKeyPress={e => {
                              if (e.key === 'Enter' && newItem.trim()) {
                                addChecklistItem(t.id, newItem.trim());
                                setNewItem('');
                              }
                            }}
                          />
                          <button
                            className="bg-blue-600 text-white border-none rounded-lg px-5 text-base font-semibold cursor-pointer transition-transform min-w-[60px] disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-700 hover:-translate-y-px"
                            onClick={async () => {
                              const v = newItem.trim();
                              if (!v) return;
                              await addChecklistItem(t.id, v);
                              setNewItem('');
                            }}
                            disabled={!newItem.trim()}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-10 px-5 bg-white rounded-xl border-2 border-dashed border-gray-200">
                      <div className="text-5xl mb-4 opacity-50">📋</div>
                      <p className="m-0 mb-4 text-gray-500 text-base">
                        Checklist is disabled for this task
                      </p>
                      {canEdit && (
                        <button
                          className="bg-blue-600 text-white border-none px-6 py-3 rounded-lg text-sm font-semibold cursor-pointer transition-all hover:bg-blue-700 hover:-translate-y-0.5"
                          onClick={() => setChecklistEnabled(t.id, true)}
                        >
                          Enable Checklist
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {canAct && (
                  <div className="mt-6 p-5 bg-gray-50 rounded-xl">
                    <h5 className="text-sm font-bold text-gray-600 m-0 mb-4 uppercase tracking-wide">
                      Update Status
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      {(
                        [
                          'NOT_STARTED',
                          'IN_PROGRESS',
                          'BLOCKED',
                          'COMPLETED',
                        ] as const
                      ).map(s => (
                        <button
                          key={s}
                          disabled={t.status === s}
                          onClick={() => updateStatus(t.id, s)}
                          className={`flex items-center gap-2.5 px-4 py-3 border-2 rounded-lg bg-white cursor-pointer transition-all text-[13px] font-semibold text-left disabled:cursor-not-allowed disabled:opacity-60 ${
                            t.status === s
                              ? 'active cursor-default font-bold scale-[1.02]'
                              : 'hover:border-blue-500 hover:-translate-y-0.5 hover:shadow-sm'
                          }`}
                          style={
                            t.status === s
                              ? {
                                  backgroundColor: statusColors[s].bg,
                                  color: statusColors[s].text,
                                  borderColor: statusColors[s].border,
                                }
                              : {}
                          }
                        >
                          <span className="text-base">{statusIcons[s]}</span>
                          <span className="flex-1">{s.replace('_', ' ')}</span>
                          {t.status === s && (
                            <span className="font-bold text-base">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              // Enhanced Edit Form
              <div className="space-y-5 p-5 bg-gray-50 rounded-xl">
                <div className="mb-5">
                  <label className="block mb-2 font-bold text-gray-700 text-sm">
                    Title *
                  </label>
                  <input
                    value={eTitle}
                    onChange={e => setETitle(e.target.value)}
                    className="w-full p-3 border-2 border-gray-200 rounded-lg text-sm transition-colors bg-white font-inherit focus:outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(0,112,243,0.1)]"
                    placeholder="Task title"
                  />
                </div>

                <div className="mb-5">
                  <label className="block mb-2 font-bold text-gray-700 text-sm">
                    Description
                  </label>
                  <textarea
                    value={eDesc}
                    onChange={e => setEDesc(e.target.value)}
                    className="w-full p-3 border-2 border-gray-200 rounded-lg text-sm transition-colors bg-white font-inherit focus:outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(0,112,243,0.1)]"
                    placeholder="Task description"
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="mb-5">
                    <label className="block mb-2 font-bold text-gray-700 text-sm">
                      Assign To
                    </label>
                    <select
                      value={eAssign}
                      onChange={e =>
                        setEAssign(e.target.value ? Number(e.target.value) : '')
                      }
                      className="w-full p-3 border-2 border-gray-200 rounded-lg text-sm transition-colors bg-white font-inherit focus:outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(0,112,243,0.1)]"
                    >
                      <option value="">Unassigned</option>
                      {members.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mb-5">
                    <label className="block mb-2 font-bold text-gray-700 text-sm">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={eDue}
                      onChange={e => setEDue(e.target.value)}
                      className="w-full p-3 border-2 border-gray-200 rounded-lg text-sm transition-colors bg-white font-inherit focus:outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(0,112,243,0.1)]"
                    />
                  </div>
                </div>

                <div className="flex gap-3 justify-end mt-6 pt-5 border-t border-gray-200">
                  <button
                    className="bg-blue-600 text-white border-none px-6 py-3 rounded-lg font-semibold cursor-pointer transition-all flex items-center gap-2 hover:bg-blue-700 hover:-translate-y-px disabled:bg-gray-300 disabled:cursor-not-allowed"
                    onClick={async () => {
                      await updateTask(t.id, {
                        title: eTitle,
                        description: eDesc,
                        dueDate: eDue || null,
                        assigneeId: eAssign || null,
                      });
                      onCancelEdit(); // close edit mode
                    }}
                    disabled={!eTitle.trim()}
                  >
                    💾 Save Changes
                  </button>

                  <button
                    className="bg-white border-2 border-gray-200 px-6 py-3 rounded-lg font-semibold cursor-pointer transition-all hover:bg-gray-50 hover:border-gray-300"
                    onClick={() => {
                      onCancelEdit(); // close edit mode
                      // reset local form fields
                      setETitle(t.title);
                      setEDesc(t.description || '');
                      setEDue(
                        t.dueDate
                          ? new Date(t.dueDate).toISOString().slice(0, 10)
                          : '',
                      );
                      setEAssign(t.assignedTo?.id ?? '');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const meCanChangeTask = (t: Task) =>
    canManage || (user?.id && t.assignedTo?.id === Number(user.id));

  if (loading)
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center bg-gray-50 min-h-[60vh] rounded-2xl">
        <div className="w-16 h-16 border-4 border-gray-100 border-t-blue-600 rounded-full animate-spin mb-6"></div>
        <p>Loading project details...</p>
      </div>
    );

  if (err)
    return (
      <div className="text-center py-20 px-10 max-w-[500px] mx-auto bg-white rounded-2xl shadow-sm border border-red-100">
        <div className="text-6xl mb-6 text-red-500">⚠️</div>
        <h2 className="m-0 mb-4 text-2xl text-red-600">
          Error Loading Project
        </h2>
        <p>{err}</p>
        <button
          className="bg-blue-600 text-white border-none px-6 py-3 rounded-lg mt-6 cursor-pointer font-semibold transition-colors hover:bg-blue-700"
          onClick={() => window.location.reload()}
        >
          Try Again
        </button>
      </div>
    );

  if (!proj)
    return (
      <div className="text-center py-20 px-10 max-w-[500px] mx-auto bg-white rounded-2xl shadow-sm">
        <h2 className="m-0 mb-4 text-2xl text-gray-800">Project Not Found</h2>
        <p>
          The project you're looking for doesn't exist or you don't have access
          to it.
        </p>
        {/* no back button for unauthorized users */}
      </div>
    );

  const computedStatus = computeProjectStatus(proj.tasks);
  const projectStatusColor = statusColors[computedStatus];
  const projectStatusIcon = statusIcons[computedStatus];
  const projectProgress = computeProgress(proj.tasks);

  return (
    <div className="max-w-[1200px] mx-auto p-6 font-sans text-gray-900 bg-gray-50 min-h-screen">
      <header className="bg-white rounded-2xl p-8 mb-8 shadow-sm border border-gray-200">
        {user ? (
          <Link
            href="/projects"
            className="inline-flex items-center text-gray-500 no-underline mb-6 font-medium transition-colors px-4 py-2 rounded-lg bg-white shadow-sm border border-gray-100 hover:text-blue-600 hover:bg-gray-50"
          >
            ← Back to Projects
          </Link>
        ) : null}

        <div className="flex items-center gap-2 mb-4">
          <div className="w-[140px] h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-400"
              style={{width: `${projectProgress}%`}}
            />
          </div>
          <span className="text-xs text-gray-500">{projectProgress}%</span>
        </div>

        <div className="flex items-start justify-between mb-5 flex-wrap gap-4">
          <h1 className="text-[2.5rem] font-extrabold m-0 text-gray-800 leading-tight">
            {proj.title}
          </h1>
          <div
            className="px-5 py-2 rounded-[20px] text-sm font-semibold inline-flex items-center gap-2 border-2 whitespace-nowrap"
            style={{
              backgroundColor: projectStatusColor.bg,
              color: projectStatusColor.text,
              borderColor: projectStatusColor.border,
            }}
          >
            <span className="text-base">{projectStatusIcon}</span>
            {computedStatus.replace('_', ' ')}
          </div>
        </div>

        <p className="text-lg leading-relaxed text-gray-500 mb-7 p-5 bg-gray-50 rounded-xl border-l-4 border-blue-500">
          {proj.description || 'No description provided'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 p-5 bg-gray-50 rounded-xl">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-gray-500 font-bold uppercase tracking-wide">
              Due Date:
            </span>
            <span className="text-base font-bold text-gray-800">
              {proj.dueDate
                ? new Date(proj.dueDate).toLocaleDateString()
                : 'No due date'}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-gray-500 font-bold uppercase tracking-wide">
              Tasks:
            </span>
            <span className="text-base font-bold text-gray-800">
              {proj.tasks.length}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-gray-500 font-bold uppercase tracking-wide">
              Members:
            </span>
            <span className="text-base font-bold text-gray-800">
              {proj.members.length}
            </span>
          </div>
        </div>
      </header>

      <div className="grid gap-8">
        {/* Team Section */}
        <section className="bg-white rounded-2xl p-7 shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-gray-200">
            <h2 className="text-[1.75rem] font-bold m-0 text-gray-800">
              Team Members
            </h2>
            {canManage && (
              <button
                className="bg-gradient-to-br from-blue-600 to-cyan-500 text-white border-none px-6 py-3 rounded-xl font-semibold cursor-pointer transition-all flex items-center gap-2 shadow-md hover:-translate-y-0.5 hover:shadow-lg"
                onClick={() => setShowMemberModal(true)}
              >
                + Add Members
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {proj.members.length ? (
              proj.members.map(m => (
                <div
                  key={m.id}
                  className="bg-gray-50 rounded-xl p-5 flex items-center gap-4 transition-all border-2 border-transparent hover:-translate-y-0.5 hover:shadow-md hover:border-blue-500"
                >
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-cyan-400 text-white flex items-center justify-center font-bold text-base flex-shrink-0">
                    {m.name
                      .split(' ')
                      .map(n => n[0])
                      .join('')
                      .toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold mb-1 text-gray-800 text-base">
                      {m.name}
                    </div>
                    {m.email && (
                      <div className="text-sm text-gray-500 break-all">
                        {m.email}
                      </div>
                    )}

                    {canManage && (
                      <button
                        onClick={() => removeMember(m.id, m.name)}
                        title="Remove from project"
                        className="mt-2 py-1.5 px-2.5 text-xs rounded-md border border-red-500 bg-white text-red-500 cursor-pointer hover:bg-red-50"
                      >
                        ✖ Remove
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full text-center py-12 px-10 text-gray-500 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                <p>No team members yet</p>
                {canManage && <p>Add members to get started</p>}
              </div>
            )}
          </div>
        </section>

        {/* Tasks Section */}
        <section className="bg-white rounded-2xl p-7 shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-gray-200">
            <h2 className="text-[1.75rem] font-bold m-0 text-gray-800">
              Tasks
            </h2>
            {canManage && (
              <button
                className="bg-gradient-to-br from-blue-600 to-cyan-500 text-white border-none px-6 py-3 rounded-xl font-semibold cursor-pointer transition-all flex items-center gap-2 shadow-md hover:-translate-y-0.5 hover:shadow-lg"
                onClick={() => setShowTaskModal(true)}
              >
                + Create Task
              </button>
            )}
          </div>

          <div className="grid gap-5">
            {proj.tasks.length ? (
              proj.tasks.map(t => (
                <TaskCard
                  key={t.id}
                  t={t}
                  members={proj.members}
                  canEdit={canManage} // only super_admin/teamLead can edit
                  expanded={isExpanded(t.id)}
                  onToggle={() => toggleExpanded(t.id)}
                  isEditing={editingTaskId === t.id}
                  onStartEdit={() => {
                    if (!isExpanded(t.id)) toggleExpanded(t.id);
                    setEditingTaskId(t.id);
                  }}
                  onCancelEdit={() => setEditingTaskId(null)}
                  canAct={!!meCanActOnTask(t)} // members can update status & check their own tasks
                />
              ))
            ) : (
              <div className="text-center py-12 px-10 text-gray-500 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                <p>No tasks yet</p>
                {canManage && <p>Create your first task to get started</p>}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Add Members Modal */}
      {showMemberModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-5 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto shadow-2xl animate-[modalSlideIn_0.3s_ease]">
            <div className="flex justify-between items-center p-7 border-b border-gray-100">
              <h3 className="m-0 text-2xl font-bold text-gray-800">
                Add Team Members
              </h3>
              <button
                className="bg-gray-100 border-none text-2xl cursor-pointer text-gray-500 p-2 rounded-lg w-10 h-10 flex items-center justify-center transition-all hover:bg-gray-200 hover:text-gray-800"
                onClick={() => setShowMemberModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={addMembers} className="p-7">
              <div className="mb-5">
                <label className="block mb-2 font-semibold text-gray-700 text-sm">
                  Search Users
                </label>
                <input
                  placeholder="Search by name, email..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm transition-colors bg-white font-inherit focus:outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(0,112,243,0.1)]"
                />
              </div>

              {search && (
                <div className="border-2 border-gray-200 rounded-xl p-2 bg-gray-50 max-h-[200px] overflow-y-auto">
                  <h4 className="m-0 mb-2 p-2 text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Select users to add:
                  </h4>
                  {candidates.length ? (
                    candidates.map(c => {
                      const checked = selectedIds.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-blue-600 text-white' : 'hover:bg-gray-200'}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedIds(s =>
                                checked
                                  ? s.filter(x => x !== c.id)
                                  : [...s, c.id],
                              );
                            }}
                            className="w-5 h-5 rounded border-2 border-gray-300 cursor-pointer relative"
                          />
                          <div className="flex-1">
                            <div className="font-semibold">{c.name}</div>
                            {c.email && (
                              <div className="text-xs opacity-70">
                                {c.email}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })
                  ) : (
                    <p className="p-3 text-gray-500 italic text-center m-0">
                      No users found
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg font-semibold border bg-white text-gray-900 border-gray-200 hover:bg-gray-50"
                  onClick={() => setShowMemberModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedIds.length || addingMembers}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg font-semibold border bg-blue-600 text-white border-blue-600 hover:bg-blue-700 hover:border-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {addingMembers
                    ? 'Adding...'
                    : `Add ${selectedIds.length} Member(s)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-5 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto shadow-2xl animate-[modalSlideIn_0.3s_ease]">
            <div className="flex justify-between items-center p-7 border-b border-gray-100">
              <h3 className="m-0 text-2xl font-bold text-gray-800">
                Create New Task
              </h3>
              <button
                className="bg-gray-100 border-none text-2xl cursor-pointer text-gray-500 p-2 rounded-lg w-10 h-10 flex items-center justify-center transition-all hover:bg-gray-200 hover:text-gray-800"
                onClick={() => setShowTaskModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={createTask} className="p-7">
              <div className="mb-5">
                <label className="block mb-2 font-semibold text-gray-700 text-sm">
                  Task Title *
                </label>
                <input
                  required
                  placeholder="Enter task title"
                  value={tTitle}
                  onChange={e => setTTitle(e.target.value)}
                  className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm transition-colors bg-white font-inherit focus:outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(0,112,243,0.1)]"
                />
              </div>

              <div className="mb-5">
                <label className="block mb-2 font-semibold text-gray-700 text-sm">
                  Description
                </label>
                <textarea
                  placeholder="Task description (optional)"
                  value={tDesc}
                  onChange={e => setTDesc(e.target.value)}
                  className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm transition-colors bg-white font-inherit focus:outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(0,112,243,0.1)]"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                <div>
                  <label className="block mb-2 font-semibold text-gray-700 text-sm">
                    Assign To
                  </label>
                  <select
                    value={tAssign}
                    onChange={e =>
                      setTAssign(e.target.value ? Number(e.target.value) : '')
                    }
                    className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm transition-colors bg-white font-inherit focus:outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(0,112,243,0.1)]"
                  >
                    <option value="">Unassigned</option>
                    {proj.members.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block mb-2 font-semibold text-gray-700 text-sm">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={tDue}
                    onChange={e => setTDue(e.target.value)}
                    className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm transition-colors bg-white font-inherit focus:outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(0,112,243,0.1)]"
                  />
                </div>
              </div>

              <div className="mb-5">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none leading-none">
                  <input
                    type="checkbox"
                    checked={tChecklistEnabled}
                    onChange={e => setTChecklistEnabled(e.target.checked)}
                    className="w-[18px] h-[18px] m-0 align-middle"
                  />
                  <span>Enable checklist for this task</span>
                </label>
              </div>

              {tChecklistEnabled && (
                <div className="mb-5 p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <label className="block mb-2 font-semibold text-gray-700 text-sm">
                    Checklist Items
                  </label>
                  {tChecklistItems.map((val, idx) => (
                    <div key={idx} className="flex items-center gap-2 mt-2">
                      <input
                        placeholder={`Item ${idx + 1}`}
                        value={val}
                        onChange={e => {
                          const next = [...tChecklistItems];
                          next[idx] = e.target.value;
                          setTChecklistItems(next);
                        }}
                        className="h-10 px-2.5 leading-tight flex-1 border-2 border-gray-200 rounded-lg text-sm transition-colors bg-white font-inherit focus:outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(0,112,243,0.1)]"
                      />
                      <button
                        type="button"
                        aria-label={`Remove item ${idx + 1}`}
                        onClick={() => {
                          const next = tChecklistItems.filter(
                            (_, i) => i !== idx,
                          );
                          setTChecklistItems(next.length ? next : ['']);
                        }}
                        className="inline-flex items-center justify-center w-10 h-10 p-0 leading-none border border-gray-200 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setTChecklistItems(a => [...a, ''])}
                    className="bg-blue-600 text-white border-none rounded-lg px-5 py-2 mt-3 text-sm font-semibold cursor-pointer transition-transform min-w-[60px] hover:bg-blue-700 hover:-translate-y-px"
                  >
                    + Add Another Item
                  </button>
                </div>
              )}

              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg font-semibold border bg-white text-gray-900 border-gray-200 hover:bg-gray-50"
                  onClick={() => setShowTaskModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingTask}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg font-semibold border bg-blue-600 text-white border-blue-600 hover:bg-blue-700 hover:border-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {creatingTask ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
