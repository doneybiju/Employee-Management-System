// frontend/src/pages/my-work.tsx
import {useEffect, useMemo, useState} from 'react';
import Link from 'next/link';
import {fetchWithAuth} from '@/lib/api';
import {useAuth} from '@/context/AuthContext';

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

// Status colors and icons
const statusColors = {
  NOT_STARTED: {bg: '#f3f4f6', text: '#6b7280'},
  IN_PROGRESS: {bg: '#dbeafe', text: '#1e40af'},
  BLOCKED: {bg: '#fee2e2', text: '#dc2626'},
  COMPLETED: {bg: '#d1fae5', text: '#065f46'},
};

const statusIcons = {
  NOT_STARTED: '⏳',
  IN_PROGRESS: '🔄',
  BLOCKED: '🚫',
  COMPLETED: '✅',
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
    // reflect locally without collapsing
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

  // Calculate progress for each project
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
      <div className="flex-1 p-8 bg-gray-50 h-screen flex flex-col items-center justify-center text-gray-500">
        <p>Loading your work...</p>
      </div>
    );

  if (err)
    return (
      <div className="flex-1 p-8 bg-gray-50 h-screen flex flex-col items-center justify-center text-red-600">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-medium mb-2">Error Loading Your Work</h2>
        <p className="mb-4">{err}</p>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded shadow-sm hover:bg-blue-700 transition-all"
          onClick={() => window.location.reload()}
        >
          Try Again
        </button>
      </div>
    );

  return (
    <div className="flex-1 p-8 bg-gray-50 h-screen overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-medium text-gray-900">My Work</h1>
        <Link href="/projects" className="text-sm text-blue-600 hover:text-blue-800 transition-colors">
          ← Back to Projects
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {memberProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg border border-gray-200 shadow-sm text-gray-500">
            <div className="text-4xl mb-4">📊</div>
            <h2 className="text-lg font-medium mb-2">No Projects Assigned</h2>
            <p>You're not a member of any projects yet.</p>
          </div>
        ) : (
          memberProjects.map(p => {
            const myTasksForProject = (tasksByProject[p.id] || []).sort(
              (a, b) => a.id - b.id,
            );
            const projectProgress = getProjectProgress(p.id);

            return (
              <div key={p.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <div className="flex justify-between items-start mb-6 border-b border-gray-100 pb-4">
                  <div className="flex-1">
                    <h2 className="text-xl font-medium text-gray-900">{p.title}</h2>
                    {p.description && (
                      <p className="text-sm text-gray-500 mt-1">{p.description}</p>
                    )}
                    <div className="flex gap-4 mt-2 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <span>👥</span>
                        <span>{p.members?.length || 0} members</span>
                      </div>
                      {p.dueDate && (
                        <div className="flex items-center gap-1">
                          <span>📅</span>
                          <span>
                            Due {new Date(p.dueDate).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <span>📋</span>
                        <span>
                          {myTasksForProject.length} tasks assigned to you
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {myTasksForProject.length > 0 && (
                      <div className="mt-3 max-w-xs">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Your Progress</span>
                          <span>{projectProgress}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all"
                            style={{width: `${projectProgress}%`}}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>

                  <Link
                    href={`/projects/${p.id}`}
                    className="text-sm text-blue-600 hover:text-blue-800 whitespace-nowrap ml-4"
                  >
                    Open Project →
                  </Link>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {myTasksForProject.length ? (
                    myTasksForProject.map(t => {
                      const detail = taskDetail[t.id];
                      const statusColor = statusColors[t.status];
                      const statusIcon = statusIcons[t.status];
                      const expanded = isExpanded(t.id);

                      return (
                        <div
                          key={t.id}
                          className={`border rounded-lg transition-colors bg-white ${expanded ? 'border-blue-300 ring-1 ring-blue-100' : 'border-gray-200 hover:border-blue-300'}`}
                        >
                          <div
                            className="p-4 cursor-pointer flex justify-between items-start"
                            onClick={() => {
                              toggleExpanded(t.id);
                              if (!isExpanded(t.id))
                                ensureTaskDetail(t).catch(() => {});
                            }}
                          >
                            <div className="flex-1">
                              <h3 className="text-sm font-medium text-gray-900">{t.title}</h3>
                              <div className="flex flex-wrap gap-3 mt-2">
                                {t.dueDate && (
                                  <div
                                    className={`text-xs flex items-center gap-1 ${new Date(t.dueDate) < new Date() ? 'text-red-600 font-medium' : 'text-gray-500'}`}
                                  >
                                    <span>📅</span>
                                    <span>
                                      Due{' '}
                                      {new Date(t.dueDate).toLocaleDateString()}
                                    </span>
                                  </div>
                                )}
                                <div
                                  className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1 font-medium"
                                  style={{
                                    backgroundColor: statusColor.bg,
                                    color: statusColor.text,
                                  }}
                                >
                                  {statusIcon} {t.status.replace('_', ' ')}
                                </div>
                              </div>
                            </div>
                            <div
                              className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                            >
                              ▼
                            </div>
                          </div>

                          {expanded && (
                            <div className="border-t border-gray-100 p-4 bg-gray-50 rounded-b-lg">
                              <div className="mb-4">
                                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Update Status</h4>
                                <div className="flex flex-wrap gap-2">
                                  {(
                                    [
                                      'NOT_STARTED',
                                      'IN_PROGRESS',
                                      'BLOCKED',
                                      'COMPLETED',
                                    ] as const
                                  ).map(s => {
                                    const sColor = statusColors[s];
                                    const sIcon = statusIcons[s];
                                    return (
                                      <button
                                        key={s}
                                        onClick={e => {
                                          e.stopPropagation();
                                          updateStatus(t.id, s).catch(err =>
                                            alert(err.message),
                                          );
                                        }}
                                        disabled={t.status === s}
                                        className={`px-3 py-1.5 rounded text-xs font-medium border transition-all flex items-center gap-1 ${t.status === s ? 'ring-2 ring-offset-1 ring-blue-100' : 'bg-white hover:bg-gray-100'}`}
                                        style={
                                          t.status === s
                                            ? {
                                                backgroundColor: sColor.bg,
                                                color: sColor.text,
                                                borderColor: sColor.bg,
                                              }
                                            : {
                                                borderColor: '#e5e7eb',
                                                color: '#4b5563',
                                              }
                                        }
                                      >
                                        {sIcon} {s.replace('_', ' ')}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Checklist */}
                              {detail ? (
                                detail.checklistEnabled ? (
                                  <div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <span className="text-gray-500">📋</span>
                                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Checklist
                                      </h4>
                                    </div>
                                    <div className="space-y-2">
                                      {detail.checklistItems.length ? (
                                        detail.checklistItems
                                          .sort(
                                            (a, b) =>
                                              a.sort - b.sort || a.id - b.id,
                                          )
                                          .map(i => (
                                            <div
                                              key={i.id}
                                              className="flex items-start gap-2 bg-white p-2 rounded border border-gray-200"
                                            >
                                              <input
                                                type="checkbox"
                                                checked={i.done}
                                                onChange={e => {
                                                  e.stopPropagation();
                                                  toggleChecklistItem(
                                                    t,
                                                    i.id,
                                                    e.target.checked,
                                                  ).catch(err =>
                                                    alert(err.message),
                                                  );
                                                }}
                                                className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                              />
                                              <span
                                                className={`text-sm ${i.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}
                                              >
                                                {i.title}
                                              </span>
                                            </div>
                                          ))
                                      ) : (
                                        <div className="text-sm text-gray-500 italic">
                                          No checklist items yet.
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-sm text-gray-500 italic">
                                    Checklist is disabled for this task.
                                  </div>
                                )
                              ) : (
                                <div className="text-sm text-gray-500 animate-pulse">
                                  Loading checklist...
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                      <p>No tasks assigned to you in this project.</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
