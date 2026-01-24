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

const statusIcons = {
  NOT_STARTED: '⏳',
  IN_PROGRESS: '🔄',
  BLOCKED: '🚫',
  COMPLETED: '✅',
};

function getStatusClasses(status: string) {
  switch (status) {
    case 'NOT_STARTED':
      return 'bg-gray-100 text-gray-500';
    case 'IN_PROGRESS':
      return 'bg-blue-100 text-blue-800';
    case 'BLOCKED':
      return 'bg-red-100 text-red-600';
    case 'COMPLETED':
      return 'bg-green-100 text-green-800';
    default:
      return 'bg-gray-100 text-gray-500';
  }
}

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
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-30 text-center bg-gray-50 rounded-2xl">
        <div className="w-16 h-16 border-4 border-gray-100 border-t-blue-600 rounded-full animate-spin mb-6"></div>
        <p>Loading your work...</p>
      </div>
    );

  if (err)
    return (
      <div className="text-center py-20 px-10 max-w-[500px] mx-auto mt-10 bg-white rounded-2xl shadow-sm">
        <div className="text-6xl mb-6">⚠️</div>
        <h2 className="text-2xl text-red-600 mb-4 font-bold">
          Error Loading Your Work
        </h2>
        <p>{err}</p>
        <button
          className="bg-blue-600 text-white border-none py-3 px-6 rounded-lg mt-6 cursor-pointer font-semibold transition-colors hover:bg-blue-700"
          onClick={() => window.location.reload()}
        >
          Try Again
        </button>
      </div>
    );

  return (
    <div className="max-w-[1200px] mx-auto p-6 text-gray-900 bg-gray-50 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 pb-6 border-b-2 border-gray-200 gap-4">
        <h1 className="text-4xl font-extrabold m-0 text-transparent bg-clip-text bg-gradient-to-br from-blue-600 to-cyan-500">
          My Work
        </h1>
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 text-gray-500 font-semibold px-5 py-3 rounded-lg bg-white shadow-sm transition-all hover:text-blue-600 hover:-translate-y-0.5 hover:shadow-md no-underline"
        >
          ← Back to Projects
        </Link>
      </div>

      {memberProjects.length === 0 ? (
        <div className="text-center py-20 px-10 bg-white rounded-[20px] shadow-sm border-2 border-dashed border-gray-200">
          <div className="text-6xl mb-5 opacity-70">📊</div>
          <h2 className="text-2xl text-gray-600 mb-3">No Projects Assigned</h2>
          <p className="text-lg text-gray-500">
            You&apos;re not a member of any projects yet.
          </p>
        </div>
      ) : (
        memberProjects.map(p => {
          const myTasksForProject = (tasksByProject[p.id] || []).sort(
            (a, b) => a.id - b.id,
          );
          const projectProgress = getProjectProgress(p.id);

          return (
            <div
              key={p.id}
              className="bg-white rounded-[20px] mb-6 shadow-sm border border-gray-200 overflow-hidden transition-all hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="p-6 bg-gradient-to-br from-gray-50 to-white border-b border-gray-100 flex flex-col md:flex-row justify-between items-start gap-5">
                <div className="flex-1 min-w-0">
                  <h2 className="text-2xl font-bold mb-2 text-gray-800 leading-tight">
                    {p.title}
                  </h2>
                  {p.description && (
                    <p className="text-gray-500 mb-3 leading-relaxed text-base">
                      {p.description}
                    </p>
                  )}
                  <div className="flex gap-5 flex-wrap">
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <span className="text-base">👥</span>
                      <span>{p.members?.length || 0} members</span>
                    </div>
                    {p.dueDate && (
                      <div className="flex items-center gap-1.5 text-sm text-gray-500">
                        <span className="text-base">📅</span>
                        <span>
                          Due {new Date(p.dueDate).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <span className="text-base">📋</span>
                      <span>
                        {myTasksForProject.length} tasks assigned to you
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {myTasksForProject.length > 0 && (
                    <div className="py-4">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider m-0">
                          Your Progress
                        </h3>
                        <span>{projectProgress}%</span>
                      </div>
                      <div className="w-full h-2 bg-gray-200 rounded overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-600 to-cyan-500 rounded transition-[width] duration-300 ease-in-out"
                          style={{width: `${projectProgress}%`}}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>

                <Link
                  href={`/projects/${p.id}`}
                  className="inline-flex items-center gap-2 text-blue-600 font-semibold px-4 py-2.5 rounded-lg bg-blue-500/10 transition-all flex-shrink-0 hover:bg-blue-500/20 hover:translate-x-1 no-underline self-start md:self-auto"
                >
                  Open Project →
                </Link>
              </div>

              <div className="p-6">
                {myTasksForProject.length ? (
                  myTasksForProject.map(t => {
                    const detail = taskDetail[t.id];
                    const expanded = isExpanded(t.id);
                    const statusIcon = statusIcons[t.status];
                    const statusClass = getStatusClasses(t.status);

                    return (
                      <div
                        key={t.id}
                        className={`bg-white border-2 rounded-2xl mb-4 transition-all overflow-hidden hover:shadow-lg ${
                          expanded
                            ? 'border-blue-500 shadow-[0_12px_40px_rgba(0,112,243,0.15)]'
                            : 'border-gray-100 hover:border-gray-200'
                        }`}
                      >
                        <div
                          className="p-5 cursor-pointer flex flex-col md:flex-row items-start md:items-center gap-4 bg-gradient-to-br from-gray-50 to-white transition-colors hover:from-gray-100 hover:to-gray-50"
                          onClick={() => {
                            toggleExpanded(t.id);
                            if (!isExpanded(t.id))
                              ensureTaskDetail(t).catch(() => {});
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-semibold mb-1.5 text-gray-800 leading-snug">
                              {t.title}
                            </h3>
                            <div className="flex gap-4 flex-wrap flex-col md:flex-row">
                              {t.dueDate && (
                                <div
                                  className={`flex items-center gap-1.5 text-sm ${new Date(t.dueDate) < new Date() ? 'text-red-600 font-semibold' : 'text-gray-500'}`}
                                >
                                  <span>📅</span>
                                  <span>
                                    Due{' '}
                                    {new Date(t.dueDate).toLocaleDateString()}
                                  </span>
                                </div>
                              )}
                              <div
                                className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${statusClass}`}
                              >
                                {statusIcon} {t.status.replace('_', ' ')}
                              </div>
                            </div>
                          </div>
                          <div
                            className={`text-xl text-gray-500 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
                          >
                            ▼
                          </div>
                        </div>

                        {expanded && (
                          <div className="p-5 border-t border-gray-100 animate-[slideDown_0.3s_ease]">
                            <div className="mb-5 p-5 bg-gray-50 rounded-xl">
                              <h4 className="m-0 mb-3 text-sm font-semibold text-gray-600 uppercase tracking-wider">
                                Update Status
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                                {(
                                  [
                                    'NOT_STARTED',
                                    'IN_PROGRESS',
                                    'BLOCKED',
                                    'COMPLETED',
                                  ] as const
                                ).map(s => {
                                  const sIcon = statusIcons[s];
                                  const sClass = getStatusClasses(s);
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
                                      className={`p-2.5 border-2 rounded-lg bg-white cursor-pointer transition-all text-xs font-semibold text-center flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-70 disabled:scale-[1.02] ${
                                        t.status === s
                                          ? `${sClass} font-bold border-transparent`
                                          : 'border-gray-200 hover:border-blue-500 hover:-translate-y-px hover:shadow-md'
                                      }`}
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
                                <div className="p-5 bg-gray-50 rounded-xl">
                                  <div className="flex items-center gap-3 mb-4">
                                    <span className="text-xl">📋</span>
                                    <h4 className="text-base font-semibold m-0 text-gray-800">
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
                                            className="flex items-center gap-3 p-3 bg-white border-2 border-gray-100 rounded-lg transition-all hover:border-gray-200 hover:translate-x-1"
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
                                              className="w-5 h-5 rounded-md border-2 border-gray-300 cursor-pointer relative flex-shrink-0 appearance-none checked:bg-blue-600 checked:border-blue-600 after:content-['✓'] after:text-white after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:text-xs after:font-bold"
                                            />
                                            <span
                                              className={`text-sm flex-1 font-medium ${i.done ? 'line-through text-gray-400' : ''}`}
                                            >
                                              {i.title}
                                            </span>
                                          </div>
                                        ))
                                    ) : (
                                      <div className="text-center p-5 text-gray-500 italic">
                                        No checklist items yet.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-center p-5 text-gray-400 italic">
                                  Checklist is disabled for this task.
                                </div>
                              )
                            ) : (
                              <div className="text-center p-5 text-gray-500">
                                Loading checklist...
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center p-10 text-gray-500 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                    <p className="m-0 text-base">
                      No tasks assigned to you in this project.
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
