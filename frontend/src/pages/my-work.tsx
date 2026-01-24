// frontend/src/pages/my-work.tsx
import {useEffect, useMemo, useState} from 'react';
import Link from 'next/link';
import {fetchWithAuth} from '@/lib/api';
import {useAuth} from '@/context/AuthContext';
import {
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  CheckSquare,
  ArrowRight,
  LayoutDashboard,
} from 'lucide-react';

type Member = {id: number; name: string};
type ProjectSummary = {
  id: number;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  members: Member[];
  status?: string;
  progress?: number;
};
type ChecklistItem = {id: number; title: string; done: boolean; sort: number};
type MyTask = {
  id: number;
  title: string;
  description?: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED';
  dueDate?: string | null;
  project: {id: number; title: string};
  checklistEnabled: boolean;
};

const statusConfig = {
  NOT_STARTED: {
    icon: Clock,
    label: 'Not Started',
    color: 'text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-800',
  },
  IN_PROGRESS: {
    icon: RefreshIcon,
    label: 'In Progress',
    color: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20',
  },
  BLOCKED: {
    icon: AlertCircle,
    label: 'Blocked',
    color: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20',
  },
  COMPLETED: {
    icon: CheckCircle,
    label: 'Completed',
    color:
      'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/20',
  },
};

function RefreshIcon(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 21h5v-5" />
    </svg>
  );
}

const getPriority = (dueDate?: string | null) => {
  if (!dueDate) return {label: 'Low', color: 'bg-gray-100 text-gray-600'};
  const days = Math.ceil(
    (new Date(dueDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24),
  );
  if (days < 0) return {label: 'Overdue', color: 'bg-red-100 text-red-700'};
  if (days <= 2)
    return {label: 'Urgent', color: 'bg-orange-100 text-orange-700'};
  if (days <= 7) return {label: 'High', color: 'bg-yellow-100 text-yellow-700'};
  return {label: 'Normal', color: 'bg-blue-50 text-blue-700'};
};

export default function MyWorkPage() {
  const {user} = useAuth();
  const myId = Number(user?.id);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // expanded tasks + loaded checklist cache
  const [expandedTaskIds, setExpandedTaskIds] = useState<number[]>([]);
  const [taskDetail, setTaskDetail] = useState<
    Record<number, {checklistEnabled: boolean; checklistItems: ChecklistItem[]}>
  >({});

  const isExpanded = (id: number) => expandedTaskIds.includes(id);
  const toggleExpanded = (id: number) =>
    setExpandedTaskIds(s =>
      s.includes(id) ? s.filter(x => x !== id) : [...s, id],
    );

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        setLoading(true);
        const [projRes, myTasksRes] = await Promise.all([
          fetchWithAuth('/api/projects'),
          fetchWithAuth('/api/projects/me/tasks'),
        ]);
        const [projJson, myTasksJson] = await Promise.all([
          projRes.json(),
          myTasksRes.json(),
        ]);
        if (dead) return;

        setProjects(Array.isArray(projJson) ? projJson : []);
        setTasks(Array.isArray(myTasksJson) ? myTasksJson : []);
        setErr(null);
      } catch (e: any) {
        if (!dead) setErr(e?.message || 'Failed to load');
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  // Only projects where I'm a member
  const memberProjects = useMemo(() => {
    const idSet = new Set<number>();
    return projects.filter(p => {
      const isMember = p.members?.some(m => Number(m.id) === myId);
      if (isMember && !idSet.has(p.id)) idSet.add(p.id);
      return isMember;
    });
  }, [projects, myId]);

  // Group my tasks by projectId
  const tasksByProject = useMemo(() => {
    const map: Record<number, MyTask[]> = {};
    for (const t of tasks) {
      const pid = t.project?.id;
      if (!pid) continue;
      if (!map[pid]) map[pid] = [];
      map[pid].push(t);
    }
    return map;
  }, [tasks]);

  async function ensureTaskDetail(task: MyTask) {
    if (taskDetail[task.id]) return taskDetail[task.id];
    const res = await fetchWithAuth(`/api/projects/${task.project.id}`);
    if (!res.ok) throw new Error('Failed to load task details');
    const proj = await res.json();

    const full = (proj?.tasks || []).find((x: any) => Number(x.id) === task.id);
    const detail = {
      checklistEnabled: !!full?.checklistEnabled,
      checklistItems: Array.isArray(full?.checklistItems)
        ? full.checklistItems.map((i: any) => ({
            id: i.id,
            title: i.title,
            done: !!i.done,
            sort: i.sort ?? 0,
          }))
        : [],
    };
    setTaskDetail(prev => ({...prev, [task.id]: detail}));
    return detail;
  }

  async function updateStatus(taskId: number, status: MyTask['status']) {
    const r = await fetchWithAuth(`/api/projects/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({status}),
    });
    if (!r.ok) throw new Error('Status update failed');
    setTasks(ts => ts.map(t => (t.id === taskId ? {...t, status} : t)));
  }

  async function toggleChecklistItem(
    task: MyTask,
    itemId: number,
    done: boolean,
  ) {
    await ensureTaskDetail(task);
    const r = await fetchWithAuth(
      `/api/projects/tasks/${task.id}/checklist/${itemId}`,
      {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({done}),
      },
    );
    if (!r.ok) throw new Error('Checklist update failed');
    setTaskDetail(prev => ({
      ...prev,
      [task.id]: {
        ...prev[task.id],
        checklistItems: prev[task.id].checklistItems.map(i =>
          i.id === itemId ? {...i, done} : i,
        ),
      },
    }));
  }

  const getProjectProgress = (projectId: number) => {
    const projectTasks = tasksByProject[projectId] || [];
    if (projectTasks.length === 0) return 0;

    const completedTasks = projectTasks.filter(
      t => t.status === 'COMPLETED',
    ).length;
    return Math.round((completedTasks / projectTasks.length) * 100);
  };

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Loading...
      </div>
    );

  if (err)
    return (
      <div className="flex h-screen items-center justify-center text-red-500">
        {err}
      </div>
    );

  return (
    <div className="max-w-7xl mx-auto p-6 my-8 font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            My Work
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Track your tasks and project progress
          </p>
        </div>
        <Link
          href="/projects"
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors shadow-sm"
        >
          <LayoutDashboard size={16} /> All Projects
        </Link>
      </div>

      {memberProjects.length === 0 ? (
        <div className="text-center py-20 px-10 bg-white dark:bg-[#111] rounded-2xl shadow-sm border border-dashed border-gray-200 dark:border-gray-800">
          <div className="text-4xl mb-4">✨</div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            No Projects Assigned
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            You&apos;re not a member of any projects yet.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {memberProjects.map(p => {
            const myTasksForProject = (tasksByProject[p.id] || []).sort(
              (a, b) => a.id - b.id,
            );
            const projectProgress = getProjectProgress(p.id);

            return (
              <div key={p.id}>
                {/* Project Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      {p.title}
                      <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-400">
                        {myTasksForProject.length} Tasks
                      </span>
                    </h2>
                    {p.dueDate && (
                      <div className="text-sm text-gray-500 flex items-center gap-1.5 mt-1">
                        <Calendar size={14} /> Due{' '}
                        {new Date(p.dueDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="flex-1 md:w-48">
                      <div className="flex justify-between text-xs mb-1 text-gray-500">
                        <span>Progress</span>
                        <span>{projectProgress}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all duration-500"
                          style={{width: `${projectProgress}%`}}
                        />
                      </div>
                    </div>
                    <Link
                      href={`/projects/${p.id}`}
                      className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      <ArrowRight size={20} />
                    </Link>
                  </div>
                </div>

                {/* Task Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {myTasksForProject.length > 0 ? (
                    myTasksForProject.map(t => {
                      const detail = taskDetail[t.id];
                      const expanded = isExpanded(t.id);
                      const StatusIcon = statusConfig[t.status].icon;
                      const priority = getPriority(t.dueDate);

                      return (
                        <div
                          key={t.id}
                          className={`bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm hover:shadow-md transition-all group overflow-hidden flex flex-col ${
                            expanded ? 'ring-2 ring-blue-500/20' : ''
                          }`}
                        >
                          <div className="p-5 flex-1">
                            <div className="flex justify-between items-start mb-3">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide ${priority.color}`}
                              >
                                {priority.label}
                              </span>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  updateStatus(
                                    t.id,
                                    t.status === 'COMPLETED'
                                      ? 'IN_PROGRESS'
                                      : 'COMPLETED',
                                  );
                                }}
                                className={`text-gray-400 hover:text-green-600 transition-colors ${
                                  t.status === 'COMPLETED'
                                    ? 'text-green-600'
                                    : ''
                                }`}
                              >
                                <CheckCircle size={20} />
                              </button>
                            </div>

                            <h3
                              onClick={() => {
                                toggleExpanded(t.id);
                                if (!isExpanded(t.id))
                                  ensureTaskDetail(t).catch(() => {});
                              }}
                              className="font-bold text-gray-900 dark:text-white mb-2 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors line-clamp-2"
                            >
                              {t.title}
                            </h3>

                            <div className="flex items-center gap-3 text-xs text-gray-500 mb-4">
                              <span
                                className={`flex items-center gap-1 px-2 py-1 rounded-md ${statusConfig[t.status].color}`}
                              >
                                <StatusIcon size={12} />
                                {statusConfig[t.status].label}
                              </span>
                              {t.dueDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar size={12} />
                                  {new Date(t.dueDate).toLocaleDateString(
                                    undefined,
                                    {month: 'short', day: 'numeric'},
                                  )}
                                </span>
                              )}
                            </div>

                            {/* Checklist Preview */}
                            {detail?.checklistEnabled && (
                              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                                  <CheckSquare size={12} /> Checklist
                                </div>
                                <div className="space-y-1">
                                  {detail.checklistItems
                                    .slice(0, 3)
                                    .map(item => (
                                      <div
                                        key={item.id}
                                        className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
                                      >
                                        <div
                                          className={`w-1.5 h-1.5 rounded-full ${
                                            item.done
                                              ? 'bg-green-500'
                                              : 'bg-gray-300 dark:bg-gray-700'
                                          }`}
                                        />
                                        <span
                                          className={
                                            item.done
                                              ? 'line-through opacity-60'
                                              : ''
                                          }
                                        >
                                          {item.title}
                                        </span>
                                      </div>
                                    ))}
                                  {detail.checklistItems.length > 3 && (
                                    <div className="text-xs text-gray-400 pl-3.5">
                                      + {detail.checklistItems.length - 3} more
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Footer / Expansion */}
                          <div
                            className="bg-gray-50 dark:bg-white/5 p-3 flex justify-between items-center text-xs text-gray-500 border-t border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                            onClick={() => {
                              toggleExpanded(t.id);
                              if (!isExpanded(t.id))
                                ensureTaskDetail(t).catch(() => {});
                            }}
                          >
                            <span>
                              {isExpanded(t.id)
                                ? 'Close Details'
                                : 'View Details'}
                            </span>
                            <ArrowRight
                              size={14}
                              className={`transition-transform ${
                                isExpanded(t.id) ? 'rotate-90' : ''
                              }`}
                            />
                          </div>

                          {expanded && (
                            <div className="p-5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-[#1A1A1A]">
                              <div className="mb-4">
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-2">
                                  Status
                                </label>
                                <div className="flex gap-1">
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
                                      onClick={e => {
                                        e.stopPropagation();
                                        updateStatus(t.id, s);
                                      }}
                                      className={`flex-1 h-8 rounded border text-xs flex items-center justify-center transition-colors ${
                                        t.status === s
                                          ? 'bg-blue-600 border-blue-600 text-white'
                                          : 'bg-white dark:bg-[#222] border-gray-200 dark:border-gray-700 hover:border-blue-300'
                                      }`}
                                      title={s.replace('_', ' ')}
                                    >
                                      {s === 'COMPLETED' ? (
                                        <CheckCircle size={14} />
                                      ) : s === 'BLOCKED' ? (
                                        <AlertCircle size={14} />
                                      ) : (
                                        <div
                                          className={`w-2 h-2 rounded-full ${
                                            s === 'IN_PROGRESS'
                                              ? 'bg-blue-400'
                                              : 'bg-gray-300'
                                          }`}
                                        />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {detail?.checklistEnabled && (
                                <div>
                                  <label className="text-xs font-bold text-gray-500 uppercase block mb-2">
                                    Checklist
                                  </label>
                                  <div className="space-y-2">
                                    {detail.checklistItems.map(item => (
                                      <label
                                        key={item.id}
                                        className="flex items-center gap-2 cursor-pointer hover:bg-white dark:hover:bg-white/5 p-1.5 rounded transition-colors"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={item.done}
                                          onChange={e =>
                                            toggleChecklistItem(
                                              t,
                                              item.id,
                                              e.target.checked,
                                            )
                                          }
                                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span
                                          className={`text-sm ${
                                            item.done
                                              ? 'line-through text-gray-400'
                                              : 'text-gray-700 dark:text-gray-300'
                                          }`}
                                        >
                                          {item.title}
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="col-span-full py-8 text-center text-gray-400 text-sm italic border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-xl">
                      No tasks assigned.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
