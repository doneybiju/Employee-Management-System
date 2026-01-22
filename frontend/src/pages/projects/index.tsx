// frontend/src/pages/projects/index.tsx
import {useEffect, useState, type FormEvent} from 'react';
import Link from 'next/link';
import {useAuth} from '@/context/AuthContext';
import {fetchWithAuth} from '@/lib/api';
import styles from './index.module.css';

type Project = {
  id: number;
  title: string;
  description?: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED';
  dueDate?: string | null;
  updatedAt: string;
  progress: number;
  members: Array<{id: number; name: string}>;
  tasks?: ProjectTaskLite[];
};

type ProjectTaskLite = {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED';
};

type Member = {
  id: number;
  name: string;
  email: string;
};

const STATUS_OPTIONS = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
] as const;
type ProjectStatus = (typeof STATUS_OPTIONS)[number];

export default function ProjectsPage() {
  const {user} = useAuth();
  // permissions state must come before effects that use it
  const [canManage, setCanManage] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD'
  >('ALL');

  // Create project modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [memberCandidates, setMemberCandidates] = useState<Member[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<
    'NOT_STARTED' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED'
  >('NOT_STARTED');

  // Status colors and icons
  const statusColors = {
    NOT_STARTED: {bg: '#f3f4f6', text: '#6b7280'},
    IN_PROGRESS: {bg: '#dbeafe', text: '#1e40af'},
    COMPLETED: {bg: '#d1fae5', text: '#065f46'},
    ON_HOLD: {bg: '#fef3c7', text: '#92400e'},
    ALL: {bg: '#667eea', text: '#ffffff'},
  };

  const statusIcons = {
    NOT_STARTED: '⏳',
    IN_PROGRESS: '🔄',
    COMPLETED: '✅',
    ON_HOLD: '⏸️',
    ALL: '📁',
  };

  // helpers
  const toDateInput = (iso?: string | null) =>
    iso ? new Date(iso).toISOString().slice(0, 10) : '';

  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  function openEdit(p: Project) {
    setEditingProject(p);
    setEditTitle(p.title);
    setEditDescription(p.description ?? '');
    setEditDueDate(toDateInput(p.dueDate));
  }
  function closeEdit() {
    setEditingProject(null);
    setSavingEdit(false);
  }

  function deriveProjectStatus(p: Project): Project['status'] {
    // Respect ON_HOLD if backend explicitly set it
    if (p.status === 'ON_HOLD') return 'ON_HOLD';

    // Prefer exact task statuses if provided
    if (Array.isArray(p.tasks) && p.tasks.length > 0) {
      const allCompleted = p.tasks.every(t => t.status === 'COMPLETED');
      if (allCompleted) return 'COMPLETED';

      const allNotStarted = p.tasks.every(t => t.status === 'NOT_STARTED');
      if (allNotStarted) return 'NOT_STARTED';

      return 'IN_PROGRESS';
    }

    // Fallback: infer from progress bar
    const prog = typeof p.progress === 'number' ? p.progress : 0;
    if (prog >= 100) return 'COMPLETED';
    if (prog <= 0) return 'NOT_STARTED';
    return 'IN_PROGRESS';
  }

  const [savingId, setSavingId] = useState<number | null>(null);

  // load projects once
  useEffect(() => {
    loadProjects();
  }, []);

  // load members only when modal opens and user can manage
  useEffect(() => {
    if (showCreateModal && canManage) loadMemberCandidates();
  }, [showCreateModal, canManage]);

  // fetch permission once on mount
  useEffect(() => {
    (async () => {
      try {
        const r = await fetchWithAuth('/api/projects/permissions');
        if (r.ok) {
          const j = await r.json();
          setCanManage(!!j?.canCreate); // super_admin or teamLead
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    filterProjects();
  }, [projects, searchQuery, statusFilter]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await fetchWithAuth('/api/projects');
      if (!response.ok) throw new Error('Failed to load projects');
      const data = await response.json();
      const normalized: Project[] = Array.isArray(data)
        ? data.map((p: Project) => ({...p, status: deriveProjectStatus(p)}))
        : [];
      setProjects(normalized);

      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const loadMemberCandidates = async () => {
    try {
      const response = await fetchWithAuth(
        '/api/projects/member-candidates?q=',
      );
      if (response.ok) {
        const data = await response.json();
        setMemberCandidates(data);
      }
    } catch (err) {
      console.error('Failed to load members:', err);
    }
  };

  const filterProjects = () => {
    let filtered = projects;

    // Filter by status
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter(project => project.status === statusFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        project =>
          project.title.toLowerCase().includes(query) ||
          project.description?.toLowerCase().includes(query) ||
          project.members.some(member =>
            member.name.toLowerCase().includes(query),
          ),
      );
    }

    setFilteredProjects(filtered);
  };

  async function updateProjectStatus(
    projectId: number,
    newStatus: ProjectStatus,
  ) {
    try {
      setSavingId(projectId);
      const res = await fetchWithAuth(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({status: newStatus}),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'Failed to update status');
      }
      setProjects(prev =>
        prev.map(p => (p.id === projectId ? {...p, status: newStatus} : p)),
      );
    } catch (e: any) {
      alert(e?.message || 'Failed to update status');
    } finally {
      setSavingId(null);
    }
  }

  const createProject = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setCreating(true);
    try {
      const response = await fetchWithAuth('/api/projects', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          dueDate: dueDate || null,
          status,
          memberIds: selectedMembers,
        }),
      });

      if (!response.ok) throw new Error('Failed to create project');

      // Reset form and close modal
      setTitle('');
      setDescription('');
      setDueDate('');
      setStatus('NOT_STARTED');
      setSelectedMembers([]);
      setShowCreateModal(false);

      // Reload projects
      await loadProjects();
    } catch (err: any) {
      alert(err.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingProject) return;
    if (!editTitle.trim()) return;

    setSavingEdit(true);
    try {
      const res = await fetchWithAuth(`/api/projects/${editingProject.id}`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          dueDate: editDueDate || null,
          status: editingProject.status,
        }),
      });
      if (!res.ok) throw new Error('Update failed');

      // update list optimistically
      setProjects(prev =>
        prev.map(p =>
          p.id === editingProject.id
            ? {
                ...p,
                title: editTitle.trim(),
                description: editDescription.trim() || null,
                dueDate: editDueDate || null,
                status: editingProject.status,
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      );
      closeEdit();
    } catch (err: any) {
      alert(err?.message || 'Update failed');
      setSavingEdit(false);
    }
  }

  async function deleteProject(id: number) {
    if (!canManage) return;
    if (!confirm('Delete this project and all its tasks?')) return;

    try {
      const res = await fetchWithAuth(`/api/projects/${id}`, {
        method: 'DELETE',
      });
      if (res.status === 204 || res.ok) {
        // remove from state; filtered list will auto-update
        setProjects(prev => prev.filter(p => p.id !== id));
      } else {
        const j = await res.json().catch(() => ({}));
        alert(j?.error || 'Delete failed');
      }
    } catch (e: any) {
      alert(e?.message || 'Delete failed');
    }
  }

  const getStatusCount = (status: string) => {
    return projects.filter(
      project => status === 'ALL' || project.status === status,
    ).length;
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}></div>
        <p>Loading projects...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorIcon}>⚠️</div>
        <h2 className={styles.errorTitle}>Error Loading Projects</h2>
        <p>{error}</p>
        <button className={styles.retryBtn} onClick={loadProjects}>
          Try Again
        </button>
      </div>
    );
  }

  const totalProjects = projects.length;
  const inProgressProjects = projects.filter(
    p => p.status === 'IN_PROGRESS',
  ).length;
  const completedProjects = projects.filter(
    p => p.status === 'COMPLETED',
  ).length;

  return (
    <div className={styles.container}>
      {/* Header Section */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>Project Dashboard</h1>
          <p className={styles.subtitle}>
            Manage your projects, track progress, and collaborate with your team
          </p>
          {canManage && (
            <button
              className={styles.createBtn}
              onClick={() => canManage && setShowCreateModal(true)}
            >
              <span>+</span>
              Create New Project
            </button>
          )}
        </div>
      </header>

      {/* Stats Overview */}
      <div className={styles.statsOverview}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{totalProjects}</div>
          <div className={styles.statLabel}>Total Projects</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{inProgressProjects}</div>
          <div className={styles.statLabel}>In Progress</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{completedProjects}</div>
          <div className={styles.statLabel}>Completed</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>
            {totalProjects
              ? Math.round((completedProjects / totalProjects) * 100)
              : 0}
            %
          </div>
          <div className={styles.statLabel}>Success Rate</div>
        </div>
      </div>

      {/* Filter Section */}
      <section className={styles.filterSection}>
        <div className={styles.filterHeader}>
          <h2 className={styles.filterTitle}>All Projects</h2>
          <div className={styles.searchBox}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
          </div>
        </div>

        <div className={styles.statusTabs}>
          {(
            [
              'ALL',
              'NOT_STARTED',
              'IN_PROGRESS',
              'COMPLETED',
              'ON_HOLD',
            ] as const
          ).map(statusKey => (
            <button
              key={statusKey}
              className={`${styles.statusTab} ${statusFilter === statusKey ? styles.active : ''}`}
              onClick={() => setStatusFilter(statusKey)}
              style={
                statusFilter === statusKey
                  ? {
                      backgroundColor: statusColors[statusKey].bg,
                      color: statusColors[statusKey].text,
                    }
                  : {}
              }
            >
              <span>{statusIcons[statusKey]}</span>
              {statusKey.replace('_', ' ')}
              <span className={styles.statusCount}>
                {getStatusCount(statusKey)}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Projects Grid */}
      <div className={styles.projectsGrid}>
        {filteredProjects.length > 0 ? (
          filteredProjects.map(project => (
            <div key={project.id} className={styles.projectCard}>
              <div className={styles.projectCardHeader}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <h3 className={styles.projectTitle} style={{margin: 0}}>
                    {project.title}
                  </h3>

                  {canManage && (
                    <select
                      value={project.status}
                      onChange={e =>
                        updateProjectStatus(
                          project.id,
                          e.target.value as ProjectStatus,
                        )
                      }
                      disabled={savingId === project.id}
                      aria-label="Update project status"
                      title="Update project status"
                      style={{padding: '6px 8px', borderRadius: 6}}
                    >
                      {STATUS_OPTIONS.map(s => (
                        <option key={s} value={s}>
                          {s.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {project.description && (
                  <p className={styles.projectDescription}>
                    {project.description}
                  </p>
                )}
              </div>

              <div className={styles.projectCardBody}>
                <div className={styles.projectMeta}>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Status</span>
                    <span className={styles.metaValue}>
                      <span
                        className={styles.statusBadge}
                        style={{
                          backgroundColor: statusColors[project.status].bg,
                          color: statusColors[project.status].text,
                        }}
                      >
                        {statusIcons[project.status]}{' '}
                        {project.status.replace('_', ' ')}
                      </span>
                    </span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Due Date</span>
                    <span className={styles.metaValue}>
                      {project.dueDate
                        ? formatDate(project.dueDate)
                        : 'No due date'}
                    </span>
                  </div>
                </div>

                <div className={styles.progressSection}>
                  <div className={styles.progressHeader}>
                    <span className={styles.progressLabel}>Progress</span>
                    <span className={styles.progressPercent}>
                      {project.progress}%
                    </span>
                  </div>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{width: `${project.progress}%`}}
                    ></div>
                  </div>
                </div>

                <div className={styles.membersSection}>
                  <div className={styles.membersLabel}>Team Members</div>
                  <div className={styles.membersList}>
                    {project.members.slice(0, 4).map((member, index) => (
                      <div
                        key={member.id}
                        className={styles.memberAvatar}
                        style={{zIndex: 10 - index}}
                        title={member.name}
                      >
                        {getInitials(member.name)}
                      </div>
                    ))}
                    {project.members.length > 4 && (
                      <div className={styles.moreMembers}>
                        +{project.members.length - 4}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.projectCardFooter}>
                <span className={styles.metaValue}>
                  Updated {formatDate(project.updatedAt)}
                </span>

                <div style={{display: 'flex', gap: 8}}>
                  <Link href={`/projects/${project.id}`}>
                    <button className={styles.viewBtn}>View Project →</button>
                  </Link>

                  {canManage && (
                    <>
                      <button
                        onClick={() => openEdit(project)}
                        className={styles.editBtn}
                        aria-label="Edit project"
                        title="Edit project"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => deleteProject(project.id)}
                        className={styles.deleteBtn}
                        aria-label="Delete project"
                        title="Delete project"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📁</div>
            <h3 className={styles.emptyTitle}>No projects found</h3>
            <p className={styles.emptyText}>
              {searchQuery || statusFilter !== 'ALL'
                ? 'Try adjusting your search or filter criteria'
                : 'Get started by creating your first project'}
            </p>
            {searchQuery || statusFilter !== 'ALL' ? (
              <button
                className={styles.retryBtn}
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                }}
              >
                Clear Filters
              </button>
            ) : canManage ? (
              <button
                className={styles.createBtn}
                onClick={() => setShowCreateModal(true)}
                style={{background: '#667eea', color: 'white'}}
              >
                Create Your First Project
              </button>
            ) : null}
          </div>
        )}
      </div>

      {editingProject && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Edit Project</h2>
              <button className={styles.modalClose} onClick={closeEdit}>
                ×
              </button>
            </div>

            <form onSubmit={saveEdit} className={styles.modalForm}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Project Title *</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className={styles.formInput}
                  placeholder="Enter project title"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Description</label>
                <textarea
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  className={styles.formTextarea}
                  placeholder="Project description (optional)"
                  rows={3}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Due Date</label>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={e => setEditDueDate(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              {/* ADD status select in Edit modal */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Status</label>
                <select
                  value={editingProject?.status || 'NOT_STARTED'}
                  onChange={e =>
                    setEditingProject(p =>
                      p ? {...p, status: e.target.value as ProjectStatus} : p,
                    )
                  }
                  className={styles.formSelect}
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>
                      {s.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={closeEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || !editTitle.trim()}
                  className={styles.submitBtn}
                >
                  {savingEdit ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {canManage && showCreateModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Create New Project</h2>
              <button
                className={styles.modalClose}
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={createProject} className={styles.modalForm}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Project Title *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className={styles.formInput}
                  placeholder="Enter project title"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className={styles.formTextarea}
                  placeholder="Project description (optional)"
                  rows={3}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Status</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value as any)}
                    className={styles.formSelect}
                  >
                    <option value="NOT_STARTED">Not Started</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="ON_HOLD">On Hold</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Add Team Members</label>
                <div className={styles.memberSelect}>
                  {memberCandidates.map(member => (
                    <div
                      key={member.id}
                      className={`${styles.memberOption} ${
                        selectedMembers.includes(member.id)
                          ? styles.selected
                          : ''
                      }`}
                      onClick={() => {
                        setSelectedMembers(prev =>
                          prev.includes(member.id)
                            ? prev.filter(id => id !== member.id)
                            : [...prev, member.id],
                        );
                      }}
                    >
                      <div className={styles.memberAvatarSmall}>
                        {getInitials(member.name)}
                      </div>
                      <div>
                        <div style={{fontWeight: 600}}>{member.name}</div>
                        <div style={{fontSize: '12px', opacity: 0.7}}>
                          {member.email}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !title.trim()}
                  className={styles.submitBtn}
                >
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
