// frontend/src/pages/my-work.tsx
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchWithAuth } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import styles from './my-work.module.css';

type Member = { id: number; name: string };
type ProjectSummary = {
  id: number;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  members: Member[];
  status?: string;
  progress?: number;
};
type ChecklistItem = { id: number; title: string; done: boolean; sort: number };
type MyTask = {
  id: number;
  title: string;
  description?: string | null;
  status: 'NOT_STARTED'|'IN_PROGRESS'|'BLOCKED'|'COMPLETED';
  dueDate?: string | null;
  project: { id: number; title: string };
  checklistEnabled: boolean;
};

// Status colors and icons
const statusColors = {
  NOT_STARTED: { bg: '#f3f4f6', text: '#6b7280' },
  IN_PROGRESS: { bg: '#dbeafe', text: '#1e40af' },
  BLOCKED: { bg: '#fee2e2', text: '#dc2626' },
  COMPLETED: { bg: '#d1fae5', text: '#065f46' }
};

const statusIcons = {
  NOT_STARTED: '⏳',
  IN_PROGRESS: '🔄',
  BLOCKED: '🚫',
  COMPLETED: '✅'
};

export default function MyWorkPage() {
  const { user } = useAuth();
  const myId = Number(user?.id);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // expanded tasks + loaded checklist cache
  const [expandedTaskIds, setExpandedTaskIds] = useState<number[]>([]);
  const [taskDetail, setTaskDetail] = useState<Record<number, { checklistEnabled: boolean; checklistItems: ChecklistItem[] }>>({});

  const isExpanded = (id: number) => expandedTaskIds.includes(id);
  const toggleExpanded = (id: number) =>
    setExpandedTaskIds(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        setLoading(true);
        const [projRes, myTasksRes] = await Promise.all([
          fetchWithAuth('/api/projects'),
          fetchWithAuth('/api/projects/me/tasks'),
        ]);
        const [projJson, myTasksJson] = await Promise.all([projRes.json(), myTasksRes.json()]);
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
    return () => { dead = true; };
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
            id: i.id, title: i.title, done: !!i.done, sort: i.sort ?? 0
          }))
        : [],
    };
    setTaskDetail(prev => ({ ...prev, [task.id]: detail }));
    return detail;
  }

  async function updateStatus(taskId: number, status: MyTask['status']) {
    const r = await fetchWithAuth(`/api/projects/tasks/${taskId}/status`, {
      method: 'PATCH', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) throw new Error('Status update failed');
    // reflect locally without collapsing
    setTasks(ts => ts.map(t => (t.id === taskId ? { ...t, status } : t)));
  }

  async function toggleChecklistItem(task: MyTask, itemId: number, done: boolean) {
    await ensureTaskDetail(task);
    const r = await fetchWithAuth(`/api/projects/tasks/${task.id}/checklist/${itemId}`, {
      method: 'PATCH', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ done }),
    });
    if (!r.ok) throw new Error('Checklist update failed');
    setTaskDetail(prev => ({
      ...prev,
      [task.id]: {
        ...prev[task.id],
        checklistItems: prev[task.id].checklistItems.map(i => i.id === itemId ? { ...i, done } : i),
      }
    }));
  }

  // Calculate progress for each project
  const getProjectProgress = (projectId: number) => {
    const projectTasks = tasksByProject[projectId] || [];
    if (projectTasks.length === 0) return 0;
    
    const completedTasks = projectTasks.filter(t => t.status === 'COMPLETED').length;
    return Math.round((completedTasks / projectTasks.length) * 100);
  };

  if (loading) return (
    <div className={styles.loadingContainer}>
      <div className={styles.loadingSpinner}></div>
      <p>Loading your work...</p>
    </div>
  );
  
  if (err) return (
    <div className={styles.errorContainer}>
      <div className={styles.errorIcon}>⚠️</div>
      <h2>Error Loading Your Work</h2>
      <p>{err}</p>
      <button className={styles.retryButton} onClick={() => window.location.reload()}>
        Try Again
      </button>
    </div>
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>My Work</h1>
        <Link href="/projects" className={styles.backLink}>
          ← Back to Projects
        </Link>
      </div>

      {memberProjects.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📊</div>
          <h2>No Projects Assigned</h2>
          <p>You're not a member of any projects yet.</p>
        </div>
      ) : memberProjects.map(p => {
        const myTasksForProject = (tasksByProject[p.id] || []).sort((a,b) => a.id - b.id);
        const projectProgress = getProjectProgress(p.id);
        
        return (
          <div key={p.id} className={styles.projectCard}>
            <div className={styles.projectHeader}>
              <div className={styles.projectInfo}>
                <h2 className={styles.projectTitle}>{p.title}</h2>
                {p.description && (
                  <p className={styles.projectDescription}>{p.description}</p>
                )}
                <div className={styles.projectMeta}>
                  <div className={styles.metaItem}>
                    <span className={styles.metaIcon}>👥</span>
                    <span>{p.members?.length || 0} members</span>
                  </div>
                  {p.dueDate && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaIcon}>📅</span>
                      <span>Due {new Date(p.dueDate).toLocaleDateString()}</span>
                    </div>
                  )}
                  <div className={styles.metaItem}>
                    <span className={styles.metaIcon}>📋</span>
                    <span>{myTasksForProject.length} tasks assigned to you</span>
                  </div>
                </div>
                
                {/* Progress Bar */}
                {myTasksForProject.length > 0 && (
                  <div className={styles.progressSection}>
                    <div className={styles.progressHeader}>
                      <h3 className={styles.progressTitle}>Your Progress</h3>
                      <span>{projectProgress}%</span>
                    </div>
                    <div className={styles.progressBar}>
                      <div 
                        className={styles.progressFill} 
                        style={{ width: `${projectProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
              
              <Link href={`/projects/${p.id}`} className={styles.openProjectLink}>
                Open Project →
              </Link>
            </div>

            <div className={styles.tasksSection}>
              {myTasksForProject.length ? myTasksForProject.map(t => {
                const detail = taskDetail[t.id];
                const statusColor = statusColors[t.status];
                const statusIcon = statusIcons[t.status];
                
                return (
                  <div key={t.id} className={`${styles.taskCard} ${isExpanded(t.id) ? styles.expanded : ''}`}>
                    <div
                      className={styles.taskHeader}
                      onClick={() => {
                        toggleExpanded(t.id);
                        if (!isExpanded(t.id)) ensureTaskDetail(t).catch(()=>{});
                      }}
                    >
                      <div className={styles.taskInfo}>
                        <h3 className={styles.taskTitle}>{t.title}</h3>
                        <div className={styles.taskMeta}>
                          {t.dueDate && (
                            <div className={`${styles.dueDate} ${new Date(t.dueDate) < new Date() ? styles.overdue : ''}`}>
                              <span>📅</span>
                              <span>Due {new Date(t.dueDate).toLocaleDateString()}</span>
                            </div>
                          )}
                          <div 
                            className={`${styles.taskStatus} ${
                              t.status === 'NOT_STARTED' ? styles.statusNotStarted :
                              t.status === 'IN_PROGRESS' ? styles.statusInProgress :
                              t.status === 'BLOCKED' ? styles.statusBlocked :
                              styles.statusCompleted
                            }`}
                            style={{ backgroundColor: statusColor.bg, color: statusColor.text }}
                          >
                            {statusIcon} {t.status.replace('_',' ')}
                          </div>
                        </div>
                      </div>
                      <div className={`${styles.expandIcon} ${isExpanded(t.id) ? styles.expanded : ''}`}>
                        ▼
                      </div>
                    </div>

                    {isExpanded(t.id) && (
                      <div className={styles.taskContent}>
                        <div className={styles.statusActions}>
                          <h4>Update Status</h4>
                          <div className={styles.statusButtons}>
                            {(['NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED'] as const).map(s => {
                              const sColor = statusColors[s];
                              const sIcon = statusIcons[s];
                              return (
                                <button
                                  key={s}
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    updateStatus(t.id, s).catch(err => alert(err.message)); 
                                  }}
                                  disabled={t.status === s}
                                  className={`${styles.statusButton} ${t.status === s ? styles.active : ''}`}
                                  style={t.status === s ? { 
                                    backgroundColor: sColor.bg, 
                                    color: sColor.text,
                                    borderColor: sColor.bg 
                                  } : {}}
                                >
                                  {sIcon} {s.replace('_',' ')}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Checklist */}
                        {detail ? (
                          detail.checklistEnabled ? (
                            <div className={styles.checklistSection}>
                              <div className={styles.checklistHeader}>
                                <span className={styles.checklistIcon}>📋</span>
                                <h4 className={styles.checklistTitle}>Checklist</h4>
                              </div>
                              <div className={styles.checklistItems}>
                                {detail.checklistItems.length ? detail.checklistItems
                                  .sort((a,b) => a.sort - b.sort || a.id - b.id)
                                  .map(i => (
                                    <div key={i.id} className={styles.checklistItem}>
                                      <input
                                        type="checkbox"
                                        checked={i.done}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          toggleChecklistItem(t, i.id, e.target.checked).catch(err => alert(err.message));
                                        }}
                                        className={styles.checklistCheckbox}
                                      />
                                      <span className={`${styles.checklistText} ${i.done ? styles.completed : ''}`}>
                                        {i.title}
                                      </span>
                                    </div>
                                  )) : (
                                    <div className={styles.checklistEmpty}>
                                      No checklist items yet.
                                    </div>
                                  )}
                              </div>
                            </div>
                          ) : (
                            <div className={styles.checklistDisabled}>
                              Checklist is disabled for this task.
                            </div>
                          )
                        ) : (
                          <div className={styles.checklistLoading}>
                            Loading checklist...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              }) : (
                <div className={styles.noTasks}>
                  <p>No tasks assigned to you in this project.</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}