// frontend/src/pages/projects/[id].tsx
import {useEffect, useState, type FormEvent} from 'react';
import {useRouter} from 'next/router';
import Link from 'next/link';
import {useAuth} from '@/context/AuthContext';
import {fetchWithAuth} from '@/lib/api';
import Drawer from '@/components/Drawer';
import {
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  ArrowLeft,
  Users,
  Layout,
  Plus,
  Trash2,
  User,
  X,
  ListTodo,
} from 'lucide-react';

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

  return 'IN_PROGRESS';
}

function computeProgress(tasks: Task[]): number {
  if (!tasks || tasks.length === 0) return 0;
  const completed = tasks.filter(t => t.status === 'COMPLETED').length;
  return Math.round((completed / tasks.length) * 100);
}

const statusConfig = {
  NOT_STARTED: {
    label: 'Not Started',
    color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    icon: Clock,
  },
  IN_PROGRESS: {
    label: 'In Progress',
    color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
    icon: Clock,
  },
  BLOCKED: {
    label: 'Blocked',
    color: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
    icon: AlertCircle,
  },
  COMPLETED: {
    label: 'Completed',
    color:
      'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
    icon: CheckCircle,
  },
  ON_HOLD: {
    label: 'On Hold',
    color:
      'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
    icon: AlertCircle,
  },
};

export default function ProjectDetailPage() {
  const router = useRouter();
  const projId = Number(router.query.id);
  const {user} = useAuth();

  const [proj, setProj] = useState<ProjectDetail | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tasks' | 'team' | 'files'>(
    'tasks',
  );

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
  const [tChecklistItems, setTChecklistItems] = useState<string[]>([]);
  const [newItemText, setNewItemText] = useState('');

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
      } catch {
        // ignore
      }
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

  async function removeMember(userId: number, memberName: string) {
    if (!proj) return;
    if (!confirm(`Remove ${memberName} from this project?`)) return;

    try {
      const res = await fetchWithAuth(
        `/api/projects/${projId}/members/${userId}`,
        {method: 'DELETE'},
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (j?.error === 'user_has_assigned_tasks') {
          alert('Cannot remove user: they have assigned tasks.');
          return;
        }
        throw new Error(j?.error || `${res.status} ${res.statusText}`);
      }
      await refresh();
    } catch (e: any) {
      alert(e?.message || 'Failed to remove member');
    }
  }

  function handleAddChecklistItem() {
    if (!newItemText.trim()) return;
    setTChecklistItems([...tChecklistItems, newItemText.trim()]);
    setNewItemText('');
  }

  function handleRemoveChecklistItem(index: number) {
    setTChecklistItems(tChecklistItems.filter((_, i) => i !== index));
  }

  async function toggleChecklistItem(
    taskId: number,
    itemId: number,
    done: boolean,
  ) {
    setProj(prev => {
      if (!prev) return null;
      return {
        ...prev,
        tasks: prev.tasks.map(t => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            checklistItems: t.checklistItems.map(i =>
              i.id === itemId ? {...i, done} : i,
            ),
          };
        }),
      };
    });

    try {
      const res = await fetchWithAuth(
        `/api/projects/tasks/${taskId}/checklist/${itemId}`,
        {
          method: 'PATCH',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({done}),
        },
      );

      if (!res.ok) {
        throw new Error('Failed to update checklist item');
      }
    } catch {
      alert('Failed to update item');
      await refresh();
    }
  }

  async function createTask(e: FormEvent) {
    e.preventDefault();
    setCreatingTask(true);
    try {
      // If there are items, we enable checklist
      const checklistEnabled = tChecklistItems.length > 0;
      const cleanItems = tChecklistItems;

      const res = await fetchWithAuth(`/api/projects/${projId}/tasks`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          title: tTitle,
          description: tDesc || null,
          dueDate: tDue || null,
          assigneeId: tAssign || null,
          status: 'NOT_STARTED',
          checklistEnabled: checklistEnabled,
          checklistItems: cleanItems,
        }),
      });
      if (!res.ok) throw new Error('Failed to create task');
      setTTitle('');
      setTDesc('');
      setTDue('');
      setTAssign('');
      setTChecklistItems([]);
      setNewItemText('');
      setShowTaskModal(false);
      await refresh();
    } catch (e: any) {
      alert(e?.message || 'Failed to create task');
    } finally {
      setCreatingTask(false);
    }
  }

  async function deleteTask(taskId: number) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      const res = await fetchWithAuth(`/api/projects/tasks/${taskId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete task');
      await refresh();
    } catch (e: any) {
      alert(e?.message || 'Failed to delete task');
    }
  }

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Loading...
      </div>
    );

  if (err)
    return (
      <div className="flex h-screen items-center justify-center text-red-600">
        {err}
      </div>
    );

  if (!proj)
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Project not found.
      </div>
    );

  const computedStatus = computeProjectStatus(proj.tasks);
  const projectProgress = computeProgress(proj.tasks);
  const StatusIcon = statusConfig[computedStatus as keyof typeof statusConfig]
    ? statusConfig[computedStatus as keyof typeof statusConfig].icon
    : Clock;

  return (
    <div className="max-w-7xl mx-auto p-6 my-8 font-sans">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 mb-4 transition-colors"
        >
          <ArrowLeft size={16} /> Back to Projects
        </Link>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
              {proj.title}
              <span
                className={`text-sm px-3 py-1 rounded-full font-medium flex items-center gap-1.5 ${
                  statusConfig[computedStatus as keyof typeof statusConfig]
                    ?.color || statusConfig.NOT_STARTED.color
                }`}
              >
                <StatusIcon size={14} />
                {computedStatus.replace('_', ' ')}
              </span>
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2 max-w-2xl">
              {proj.description || 'No description provided.'}
            </p>
          </div>

          <div className="w-full md:w-64 bg-white dark:bg-[#111] p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="flex justify-between text-sm mb-2 font-medium">
              <span className="text-gray-600 dark:text-gray-400">Progress</span>
              <span className="text-blue-600 dark:text-blue-400">
                {projectProgress}%
              </span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-500"
                style={{width: `${projectProgress}%`}}
              />
            </div>
            <div className="mt-3 flex justify-between text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <CheckCircle size={12} /> {proj.tasks.length} Tasks
              </div>
              <div className="flex items-center gap-1">
                <Users size={12} /> {proj.members.length} Team
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 bg-gray-100 dark:bg-white/5 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'tasks'
              ? 'bg-white dark:bg-[#222] text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <Layout size={16} /> Tasks
        </button>
        <button
          onClick={() => setActiveTab('team')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'team'
              ? 'bg-white dark:bg-[#222] text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <Users size={16} /> Team
        </button>
        <button
          onClick={() => setActiveTab('files')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'files'
              ? 'bg-white dark:bg-[#222] text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <AlertCircle size={16} /> Files
        </button>
      </div>

      {activeTab === 'tasks' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Project Tasks
            </h2>
            {canManage && (
              <button
                onClick={() => setShowTaskModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                <Plus size={16} /> Create Task
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {proj.tasks.length === 0 ? (
              <div className="col-span-full py-12 text-center text-gray-500 bg-white dark:bg-[#111] rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
                No tasks yet.
              </div>
            ) : (
              proj.tasks.map(t => {
                const StatusIcon = statusConfig[t.status].icon;
                const totalItems = t.checklistItems.length;
                const completedItems = t.checklistItems.filter(
                  i => i.done,
                ).length;
                const taskProgress =
                  totalItems > 0
                    ? Math.round((completedItems / totalItems) * 100)
                    : 0;

                return (
                  <div
                    key={t.id}
                    className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow group relative"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide flex items-center gap-1 ${statusConfig[t.status].color}`}
                      >
                        <StatusIcon size={10} />
                        {statusConfig[t.status].label}
                      </span>
                      {canManage && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => deleteTask(t.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2">
                      {t.title}
                    </h3>

                    {t.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-3">
                        {t.description}
                      </p>
                    )}

                    {(t.checklistEnabled || totalItems > 0) && (
                      <div className="mb-4">
                        {totalItems > 0 && (
                          <div className="mb-3">
                            <div className="flex justify-between text-xs mb-1.5 font-medium">
                              <span className="text-gray-500 dark:text-gray-400">
                                Checklist
                              </span>
                              <span className="text-blue-600 dark:text-blue-400">
                                {taskProgress}%
                              </span>
                            </div>
                            <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-600 transition-all duration-500"
                                style={{width: `${taskProgress}%`}}
                              />
                            </div>
                          </div>
                        )}

                        {totalItems > 0 && (
                          <div className="space-y-2">
                            {t.checklistItems.map(item => {
                              const canToggle =
                                user?.role === 'super_admin' ||
                                Number(user?.id) === t.assignedTo?.id;

                              return (
                                <label
                                  key={item.id}
                                  className={`flex items-start gap-2 text-sm ${
                                    canToggle
                                      ? 'cursor-pointer'
                                      : 'cursor-default opacity-80'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={item.done}
                                    disabled={!canToggle}
                                    onChange={e =>
                                      toggleChecklistItem(
                                        t.id,
                                        item.id,
                                        e.target.checked,
                                      )
                                    }
                                    className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                                  />
                                  <span
                                    className={`flex-1 break-words ${
                                      item.done
                                        ? 'text-gray-400 line-through'
                                        : 'text-gray-700 dark:text-gray-300'
                                    }`}
                                  >
                                    {item.title}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-xs text-gray-500 mt-auto pt-4 border-t border-gray-50 dark:border-gray-800">
                      <div className="flex items-center gap-1.5">
                        <User size={14} />
                        {t.assignedTo?.name || 'Unassigned'}
                      </div>
                      {t.dueDate && (
                        <div className="flex items-center gap-1.5">
                          <Calendar size={14} />
                          {new Date(t.dueDate).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {activeTab === 'files' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Files
            </h2>
          </div>
          <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl p-12 text-center text-gray-500">
            <AlertCircle size={48} className="mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No Files Yet
            </h3>
            <p className="max-w-md mx-auto">
              File management is coming soon. You can currently manage personal
              documents in the Documents section.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'team' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Team Members
            </h2>
            {canManage && (
              <button
                onClick={() => setShowMemberModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                <Plus size={16} /> Add Member
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {proj.members.length === 0 ? (
              <div className="col-span-full py-12 text-center text-gray-500 bg-white dark:bg-[#111] rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
                No team members yet.
              </div>
            ) : (
              proj.members.map(m => (
                <div
                  key={m.id}
                  className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm flex items-center gap-4 group"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 dark:text-white truncate">
                      {m.name}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {m.email}
                    </div>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => removeMember(m.id, m.name)}
                      className="p-2 text-gray-400 hover:text-red-600 rounded opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Drawer for Task Creation */}
      <Drawer
        open={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        title="Create New Task"
      >
        <form onSubmit={createTask} className="flex flex-col gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                value={tTitle}
                onChange={e => setTTitle(e.target.value)}
                className="w-full p-2.5 bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                required
                placeholder="Task title"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <textarea
                value={tDesc}
                onChange={e => setTDesc(e.target.value)}
                className="w-full p-2.5 bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 min-h-[100px] resize-y"
                placeholder="Detailed description..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Assign To
                </label>
                <select
                  value={tAssign}
                  onChange={e =>
                    setTAssign(e.target.value ? Number(e.target.value) : '')
                  }
                  className="w-full p-2.5 bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none"
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={tDue}
                  onChange={e => setTDue(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Checklist Builder */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                <ListTodo size={16} /> Checklist
              </label>

              <div className="flex gap-2 mb-3">
                <input
                  value={newItemText}
                  onChange={e => setNewItemText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddChecklistItem();
                    }
                  }}
                  placeholder="Add item..."
                  className="flex-1 p-2.5 bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddChecklistItem}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Add
                </button>
              </div>

              <div className="space-y-2">
                {tChecklistItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-lg group"
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-300 break-all">
                      {item}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveChecklistItem(idx)}
                      className="text-gray-400 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                {tChecklistItems.length === 0 && (
                  <p className="text-sm text-gray-400 italic text-center py-2">
                    No items added.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="pt-4 mt-auto">
            <button
              type="submit"
              disabled={creatingTask}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 shadow-lg shadow-blue-600/20"
            >
              {creatingTask ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </Drawer>

      {showMemberModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#1A1A1A] rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Add Team Member
            </h3>
            <form onSubmit={addMembers} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Search
                </label>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Name or email..."
                  className="w-full p-2.5 bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-lg p-2 bg-gray-50 dark:bg-[#111]">
                {candidates.length === 0 ? (
                  <p className="text-center text-gray-500 text-sm py-2">
                    No users found.
                  </p>
                ) : (
                  candidates.map(c => (
                    <label
                      key={c.id}
                      className="flex items-center gap-3 p-2 hover:bg-white dark:hover:bg-white/5 rounded-md cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(c.id)}
                        onChange={() => {
                          setSelectedIds(s =>
                            s.includes(c.id)
                              ? s.filter(id => id !== c.id)
                              : [...s, c.id],
                          );
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="text-sm">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {c.name}
                        </div>
                        <div className="text-xs text-gray-500">{c.email}</div>
                      </div>
                    </label>
                  ))
                )}
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowMemberModal(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={selectedIds.length === 0 || addingMembers}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Add Selected
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
