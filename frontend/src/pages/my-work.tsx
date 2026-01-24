import {useEffect, useMemo, useState} from 'react';
import Link from 'next/link';
import {fetchWithAuth} from '@/lib/api';
import {useAuth} from '@/context/AuthContext';
import {
  CheckCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  ArrowLeft,
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

const getStatusColor = (status: string) => {
  switch (status) {
    case 'NOT_STARTED':
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    case 'IN_PROGRESS':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'BLOCKED':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'COMPLETED':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    default:
      return 'bg-gray-100 text-gray-600';
  }
};

const getPriorityColor = (dueDate?: string | null) => {
  if (!dueDate) return 'bg-gray-400';
  const days =
    (new Date(dueDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24);
  if (days < 3) return 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]'; // High
  if (days < 7) return 'bg-yellow-500'; // Medium
  return 'bg-blue-400'; // Low/Normal
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
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );

  if (err)
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Error Loading Work
        </h2>
        <p className="text-gray-500 mb-6">{err}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            My Work
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Track your tasks and project progress.
          </p>
        </div>
        <Link
          href="/projects"
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-[#222] transition-colors"
        >
          <ArrowLeft size={16} /> Back to Projects
        </Link>
      </div>

      {memberProjects.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-[#111] rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
          <div className="mx-auto w-12 h-12 bg-gray-100 dark:bg-[#222] rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="text-gray-400" size={24} />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            No work assigned
          </h3>
          <p className="text-gray-500 mt-1">
            You are not a member of any projects yet.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {memberProjects.map(p => {
            const myTasksForProject = (tasksByProject[p.id] || []).sort(
              (a, b) => a.id - b.id,
            );
            const projectProgress = getProjectProgress(p.id);

            return (
              <div
                key={p.id}
                className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm"
              >
                {/* Project Header */}
                <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-[#1A1A1A]/30">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-3">
                        {p.title}
                        <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                          {p.members.length} members
                        </span>
                      </h2>
                    </div>
                    <div className="flex items-center gap-4 w-full md:w-auto">
                      <div className="flex-1 md:w-48">
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-gray-500 font-medium">
                            Your Progress
                          </span>
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {projectProgress}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full transition-all duration-500"
                            style={{width: `${projectProgress}%`}}
                          />
                        </div>
                      </div>
                      <Link href={`/projects/${p.id}`} className="shrink-0">
                        <button className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-[#222] border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-[#333] transition-colors">
                          View Project
                        </button>
                      </Link>
                    </div>
                  </div>

                  {p.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
                      {p.description}
                    </p>
                  )}
                </div>

                {/* Task List */}
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {myTasksForProject.length > 0 ? (
                    myTasksForProject.map(t => {
                      const expanded = isExpanded(t.id);
                      const detail = taskDetail[t.id];

                      return (
                        <div
                          key={t.id}
                          className="group hover:bg-gray-50 dark:hover:bg-[#1A1A1A]/50 transition-colors"
                        >
                          <div
                            className="p-4 flex items-start gap-4 cursor-pointer"
                            onClick={() => {
                              toggleExpanded(t.id);
                              if (!isExpanded(t.id))
                                ensureTaskDetail(t).catch(() => {});
                            }}
                          >
                            {/* Priority Dot */}
                            <div
                              className={`mt-2 w-2.5 h-2.5 rounded-full shrink-0 ${getPriorityColor(t.dueDate)}`}
                              title="Priority Indicator"
                            />

                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start gap-4">
                                <div>
                                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">
                                    {t.title}
                                  </h3>
                                  <div className="flex items-center gap-3 mt-1.5">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getStatusColor(t.status)}`}
                                    >
                                      {t.status.replace('_', ' ')}
                                    </span>
                                    {t.dueDate && (
                                      <span
                                        className={`flex items-center gap-1 text-xs ${
                                          new Date(t.dueDate) < new Date()
                                            ? 'text-red-500 font-medium'
                                            : 'text-gray-500'
                                        }`}
                                      >
                                        <Calendar size={12} />
                                        {new Date(
                                          t.dueDate,
                                        ).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300">
                                  {expanded ? (
                                    <ChevronUp size={18} />
                                  ) : (
                                    <ChevronDown size={18} />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Expanded Content */}
                          {expanded && (
                            <div className="px-4 pb-4 pl-[3.25rem]">
                              <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                                <div className="mb-4">
                                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                                    Status
                                  </label>
                                  <div className="flex flex-wrap gap-2">
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
                                        disabled={t.status === s}
                                        className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                                          t.status === s
                                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent'
                                            : 'bg-white dark:bg-[#222] border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                                        }`}
                                      >
                                        {s.replace('_', ' ')}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {/* Checklist */}
                                {detail ? (
                                  detail.checklistEnabled ? (
                                    <div>
                                      <div className="flex items-center gap-2 mb-2">
                                        <CheckCircle
                                          size={14}
                                          className="text-gray-400"
                                        />
                                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                          Checklist
                                        </h4>
                                      </div>
                                      <div className="space-y-1">
                                        {detail.checklistItems.length > 0 ? (
                                          detail.checklistItems
                                            .sort(
                                              (a, b) =>
                                                a.sort - b.sort || a.id - b.id,
                                            )
                                            .map(item => (
                                              <div
                                                key={item.id}
                                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#1A1A1A] cursor-pointer group/item"
                                                onClick={e => {
                                                  e.stopPropagation();
                                                  toggleChecklistItem(
                                                    t,
                                                    item.id,
                                                    !item.done,
                                                  );
                                                }}
                                              >
                                                <div
                                                  className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                                    item.done
                                                      ? 'bg-blue-600 border-blue-600 text-white'
                                                      : 'border-gray-300 dark:border-gray-600 group-hover/item:border-blue-500'
                                                  }`}
                                                >
                                                  {item.done && (
                                                    <CheckCircle size={10} />
                                                  )}
                                                </div>
                                                <span
                                                  className={`text-sm ${item.done ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'}`}
                                                >
                                                  {item.title}
                                                </span>
                                              </div>
                                            ))
                                        ) : (
                                          <p className="text-sm text-gray-500 italic pl-7">
                                            No checklist items.
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  ) : null
                                ) : (
                                  <div className="flex items-center gap-2 text-sm text-gray-500">
                                    <Loader2
                                      size={14}
                                      className="animate-spin"
                                    />{' '}
                                    Loading details...
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center text-gray-500">
                      <p className="text-sm">
                        No tasks assigned to you in this project.
                      </p>
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
