// frontend/src/pages/projects/[id].tsx
import {useEffect, useState, type FormEvent} from 'react';
import {useRouter} from 'next/router';
import Link from 'next/link';
import {useAuth} from '@/context/AuthContext';
import {fetchWithAuth} from '@/lib/api';
import styles from './[id].module.css';

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
          `Please unassign/reassign them first.`,
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
              `Please unassign/reassign them first.`,
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
      <div className={`${styles.taskCard} ${expanded ? styles.expanded : ''}`}>
        <div
          className={styles.taskHeader}
          onClick={() => !isEditing && onToggle()}
        >
          <div className={styles.taskMainInfo}>
            <div className={styles.taskTitleSection}>
              {!isEditing ? (
                <h4 className={styles.taskTitle}>{t.title}</h4>
              ) : (
                <input
                  className={styles.taskTitleInput}
                  value={eTitle}
                  onChange={e => setETitle(e.target.value)}
                  onClick={e => e.stopPropagation()}
                />
              )}

              <div
                className={styles.taskStatusBadge}
                style={{
                  backgroundColor: statusColor.bg,
                  color: statusColor.text,
                  borderColor: statusColor.border,
                }}
              >
                <span className={styles.statusIcon}>{statusIcon}</span>
                {t.status.replace('_', ' ')}
              </div>
            </div>

            <div className={styles.taskPreviewMeta}>
              <span className={styles.assigneePreview}>
                👤 {t.assignedTo?.name || 'Unassigned'}
              </span>
              {t.dueDate && (
                <span
                  className={`${styles.dueDatePreview} ${new Date(t.dueDate) < new Date() ? styles.overdue : ''}`}
                >
                  📅 {new Date(t.dueDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          <div
            className={styles.taskActions}
            onClick={e => e.stopPropagation()}
          >
            {canEdit && (
              <>
                <button
                  className={styles.iconBtn}
                  onClick={e => {
                    e.stopPropagation();
                    onStartEdit();
                  }}
                  title="Edit"
                >
                  ✏️
                </button>

                <button
                  className={`${styles.iconBtn} ${styles.deleteBtn}`}
                  onClick={() => deleteTask(t.id)}
                  title="Delete task"
                >
                  🗑️
                </button>
              </>
            )}
            <button
              className={`${styles.iconBtn} ${styles.expandBtn}`}
              onClick={onToggle}
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? '↑' : '↓'}
            </button>
          </div>
        </div>

        {expanded && (
          <div className={styles.taskExpandedContent}>
            {!isEditing ? (
              <>
                {t.description && (
                  <div className={styles.taskDescriptionSection}>
                    <h5>Description</h5>
                    <p className={styles.taskDescription}>{t.description}</p>
                  </div>
                )}

                <div className={styles.taskDetailsGrid}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Assigned to:</span>
                    <span className={styles.detailValue}>
                      <span className={styles.avatarSm}>👤</span>
                      {t.assignedTo?.name || 'Unassigned'}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Due date:</span>
                    <span
                      className={`${styles.detailValue} ${t.dueDate && new Date(t.dueDate) < new Date() ? styles.overdue : ''}`}
                    >
                      <span className={styles.icon}>📅</span>
                      {t.dueDate
                        ? new Date(t.dueDate).toLocaleDateString()
                        : 'No due date'}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Created:</span>
                    <span className={styles.detailValue}>
                      <span className={styles.icon}>🕒</span>
                      Recently
                    </span>
                  </div>
                </div>

                {/* Enhanced Checklist Section */}
                <div className={styles.checklistSection}>
                  <div className={styles.checklistHeader}>
                    <div className={styles.checklistTitle}>
                      <h5>Checklist</h5>
                      {t.checklistEnabled && t.checklistItems.length > 0 && (
                        <div className={styles.checklistProgress}>
                          <div className={styles.progressBar}>
                            <div
                              className={styles.progressFill}
                              style={{width: `${checklistProgress}%`}}
                            ></div>
                          </div>
                          <span className={styles.progressText}>
                            {checklistProgress}%
                          </span>
                        </div>
                      )}
                    </div>
                    {canEdit && (
                      <button
                        className={`${styles.toggleChecklistBtn} ${t.checklistEnabled ? styles.active : ''}`}
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
                      <div className={styles.checklistItems}>
                        {t.checklistItems
                          .sort((a, b) => a.sort - b.sort || a.id - b.id)
                          .map(ci => (
                            <div key={ci.id} className={styles.checklistItem}>
                              <label className={styles.checklistLabel}>
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
                                  className={styles.checklistCheckbox}
                                />

                                <span
                                  className={`${styles.checklistText} ${ci.done ? styles.completed : ''}`}
                                >
                                  {ci.title}
                                </span>
                              </label>
                              {canEdit && (
                                <button
                                  className={styles.checklistItemDelete}
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
                        <div className={styles.addChecklistItem}>
                          <input
                            placeholder="Add a new checklist item..."
                            value={newItem}
                            onChange={e => setNewItem(e.target.value)}
                            className={styles.checklistInput}
                            onKeyPress={e => {
                              if (e.key === 'Enter' && newItem.trim()) {
                                addChecklistItem(t.id, newItem.trim());
                                setNewItem('');
                              }
                            }}
                          />
                          <button
                            className={styles.addItemBtn}
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
                    <div className={styles.checklistDisabledState}>
                      <div className={styles.emptyIcon}>📋</div>
                      <p>Checklist is disabled for this task</p>
                      {canEdit && (
                        <button
                          className={styles.enableChecklistBtn}
                          onClick={() => setChecklistEnabled(t.id, true)}
                        >
                          Enable Checklist
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {canAct && (
                  <div className={styles.statusActionsSection}>
                    <h5>Update Status</h5>
                    <div className={styles.statusActionsGrid}>
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
                          className={`${styles.statusActionBtn} ${t.status === s ? styles.active : ''}`}
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
                          <span className={styles.statusIcon}>
                            {statusIcons[s]}
                          </span>
                          <span className={styles.statusText}>
                            {s.replace('_', ' ')}
                          </span>
                          {t.status === s && (
                            <span className={styles.currentIndicator}>✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              // Enhanced Edit Form
              <div className={styles.taskEditForm}>
                <div className={styles.formGroup}>
                  <label>Title *</label>
                  <input
                    value={eTitle}
                    onChange={e => setETitle(e.target.value)}
                    className={styles.formInput}
                    placeholder="Task title"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Description</label>
                  <textarea
                    value={eDesc}
                    onChange={e => setEDesc(e.target.value)}
                    className={styles.formTextarea}
                    placeholder="Task description"
                    rows={4}
                  />
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Assign To</label>
                    <select
                      value={eAssign}
                      onChange={e =>
                        setEAssign(e.target.value ? Number(e.target.value) : '')
                      }
                      className={styles.formSelect}
                    >
                      <option value="">Unassigned</option>
                      {members.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label>Due Date</label>
                    <input
                      type="date"
                      value={eDue}
                      onChange={e => setEDue(e.target.value)}
                      className={styles.formInput}
                    />
                  </div>
                </div>

                <div className={styles.editActions}>
                  <button
                    className={`${styles.saveBtn} ${styles.primary}`}
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
                    className={styles.cancelBtn}
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
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}></div>
        <p>Loading project details...</p>
      </div>
    );

  if (err)
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorIcon}>⚠️</div>
        <h2>Error Loading Project</h2>
        <p>{err}</p>
        <button
          className={styles.retryBtn}
          onClick={() => window.location.reload()}
        >
          Try Again
        </button>
      </div>
    );

  if (!proj)
    return (
      <div className={styles.notFound}>
        <h2>Project Not Found</h2>
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
    <div className={styles.container}>
      <header className={styles.projectHeader}>
        {user ? (
          <Link href="/projects" className={styles.backButton}>
            ← Back to Projects
          </Link>
        ) : null}

        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
          <div
            style={{
              width: 140,
              height: 8,
              background: '#eee',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${projectProgress}%`,
                background: '#4cc9f0',
              }}
            />
          </div>
          <span style={{fontSize: 12, color: '#555'}}>{projectProgress}%</span>
        </div>

        <div className={styles.projectTitleSection}>
          <h1 className={styles.projectTitle}>{proj.title}</h1>
          <div
            className={styles.projectStatus}
            style={{
              backgroundColor: projectStatusColor.bg,
              color: projectStatusColor.text,
              borderColor: projectStatusColor.border,
            }}
          >
            <span className={styles.statusIcon}>{projectStatusIcon}</span>
            {computedStatus.replace('_', ' ')}
          </div>
        </div>

        <p className={styles.projectDescription}>
          {proj.description || 'No description provided'}
        </p>

        <div className={styles.projectMeta}>
          <div className={styles.metaInfo}>
            <span className={styles.metaLabel}>Due Date:</span>
            <span className={styles.metaValue}>
              {proj.dueDate
                ? new Date(proj.dueDate).toLocaleDateString()
                : 'No due date'}
            </span>
          </div>
          <div className={styles.metaInfo}>
            <span className={styles.metaLabel}>Tasks:</span>
            <span className={styles.metaValue}>{proj.tasks.length}</span>
          </div>
          <div className={styles.metaInfo}>
            <span className={styles.metaLabel}>Members:</span>
            <span className={styles.metaValue}>{proj.members.length}</span>
          </div>
        </div>
      </header>

      <div className={styles.projectContent}>
        {/* Team Section */}
        <section className={styles.teamSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Team Members</h2>
            {canManage && (
              <button
                className={styles.addMemberBtn}
                onClick={() => setShowMemberModal(true)}
              >
                + Add Members
              </button>
            )}
          </div>

          <div className={styles.membersGrid}>
            {proj.members.length ? (
              proj.members.map(m => (
                <div key={m.id} className={styles.memberCard}>
                  <div className={styles.memberAvatar}>
                    {m.name
                      .split(' ')
                      .map(n => n[0])
                      .join('')
                      .toUpperCase()}
                  </div>
                  <div className={styles.memberInfo}>
                    <div className={styles.memberName}>{m.name}</div>
                    {m.email && (
                      <div className={styles.memberEmail}>{m.email}</div>
                    )}

                    {canManage && (
                      <button
                        onClick={() => removeMember(m.id, m.name)}
                        title="Remove from project"
                        style={{
                          marginTop: 8,
                          padding: '6px 10px',
                          fontSize: 12,
                          borderRadius: 6,
                          border: '1px solid #ef4444',
                          background: '#fff',
                          color: '#ef4444',
                          cursor: 'pointer',
                        }}
                      >
                        ✖ Remove
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.emptyState}>
                <p>No team members yet</p>
                {canManage && <p>Add members to get started</p>}
              </div>
            )}
          </div>
        </section>

        {/* Tasks Section */}
        <section className={styles.tasksSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Tasks</h2>
            {canManage && (
              <button
                className={styles.createTaskBtn}
                onClick={() => setShowTaskModal(true)}
              >
                + Create Task
              </button>
            )}
          </div>

          <div className={styles.tasksGrid}>
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
              <div className={styles.emptyState}>
                <p>No tasks yet</p>
                {canManage && <p>Create your first task to get started</p>}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Add Members Modal */}
      {showMemberModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3>Add Team Members</h3>
              <button
                className={styles.modalClose}
                onClick={() => setShowMemberModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={addMembers} className={styles.modalForm}>
              <div className={styles.formGroup}>
                <label>Search Users</label>
                <input
                  placeholder="Search by name, email..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              {search && (
                <div className={styles.candidatesList}>
                  <h4>Select users to add:</h4>
                  {candidates.length ? (
                    candidates.map(c => {
                      const checked = selectedIds.includes(c.id);
                      return (
                        <label key={c.id} className={styles.candidateItem}>
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
                            className={styles.candidateCheckbox}
                          />
                          <div className={styles.candidateInfo}>
                            <div className={styles.candidateName}>{c.name}</div>
                            {c.email && (
                              <div className={styles.candidateEmail}>
                                {c.email}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })
                  ) : (
                    <p className={styles.noResults}>No users found</p>
                  )}
                </div>
              )}

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setShowMemberModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedIds.length || addingMembers}
                  className={styles.submitBtn}
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
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3>Create New Task</h3>
              <button
                className={styles.modalClose}
                onClick={() => setShowTaskModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={createTask} className={styles.modalForm}>
              <div className={styles.formGroup}>
                <label>Task Title *</label>
                <input
                  required
                  placeholder="Enter task title"
                  value={tTitle}
                  onChange={e => setTTitle(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Description</label>
                <textarea
                  placeholder="Task description (optional)"
                  value={tDesc}
                  onChange={e => setTDesc(e.target.value)}
                  className={styles.formTextarea}
                  rows={3}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Assign To</label>
                  <select
                    value={tAssign}
                    onChange={e =>
                      setTAssign(e.target.value ? Number(e.target.value) : '')
                    }
                    className={styles.formSelect}
                  >
                    <option value="">Unassigned</option>
                    {proj.members.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Due Date</label>
                  <input
                    type="date"
                    value={tDue}
                    onChange={e => setTDue(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={tChecklistEnabled}
                    onChange={e => setTChecklistEnabled(e.target.checked)}
                    className={styles.checkbox}
                  />
                  <span>Enable checklist for this task</span>
                </label>
              </div>

              {tChecklistEnabled && (
                <div className={styles.checklistCreation}>
                  <label>Checklist Items</label>
                  {tChecklistItems.map((val, idx) => (
                    <div key={idx} className={styles.checklistItemInput}>
                      <input
                        placeholder={`Item ${idx + 1}`}
                        value={val}
                        onChange={e => {
                          const next = [...tChecklistItems];
                          next[idx] = e.target.value;
                          setTChecklistItems(next);
                        }}
                        className={styles.formInput}
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
                        className={styles.removeItemBtn}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setTChecklistItems(a => [...a, ''])}
                    className={styles.addItemBtn}
                  >
                    + Add Another Item
                  </button>
                </div>
              )}

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setShowTaskModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingTask}
                  className={styles.submitBtn}
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
