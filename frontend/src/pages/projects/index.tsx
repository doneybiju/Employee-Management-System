// frontend/src/pages/projects/index.tsx
import {useEffect, useState, type FormEvent} from 'react';
import Link from 'next/link';
import {useAuth} from '@/context/AuthContext';
import {fetchWithAuth} from '@/lib/api';

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
      <div className="flex-1 p-8 bg-gray-50 h-screen flex flex-col items-center justify-center text-gray-500">
        <div className="text-4xl mb-4">⏳</div>
        <p>Loading projects...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-8 bg-gray-50 h-screen flex flex-col items-center justify-center text-red-600">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-medium mb-2">Error Loading Projects</h2>
        <p className="mb-4">{error}</p>
        <button className="px-4 py-2 bg-blue-600 text-white rounded shadow-sm hover:bg-blue-700 transition-all" onClick={loadProjects}>
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
    <div className="flex-1 p-8 bg-gray-50 h-screen overflow-y-auto">
      {/* Header Section */}
      <header className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl font-medium text-gray-900">Project Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your projects, track progress, and collaborate with your team
          </p>
        </div>
        {canManage && (
          <button
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded shadow-sm transition-all flex items-center gap-2"
            onClick={() => canManage && setShowCreateModal(true)}
          >
            <span>+</span>
            Create New Project
          </button>
        )}
      </header>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-3xl font-semibold text-gray-900">{totalProjects}</div>
          <div className="text-sm text-gray-500 mt-1">Total Projects</div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-3xl font-semibold text-gray-900">{inProgressProjects}</div>
          <div className="text-sm text-gray-500 mt-1">In Progress</div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-3xl font-semibold text-gray-900">{completedProjects}</div>
          <div className="text-sm text-gray-500 mt-1">Completed</div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-3xl font-semibold text-gray-900">
            {totalProjects
              ? Math.round((completedProjects / totalProjects) * 100)
              : 0}
            %
          </div>
          <div className="text-sm text-gray-500 mt-1">Success Rate</div>
        </div>
      </div>

      {/* Filter Section */}
      <section className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900">All Projects</h2>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
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
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all flex items-center gap-1.5 ${statusFilter === statusKey ? 'ring-2 ring-offset-1 ring-blue-100' : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-600'}`}
              onClick={() => setStatusFilter(statusKey)}
              style={
                statusFilter === statusKey
                  ? {
                      backgroundColor: statusColors[statusKey].bg,
                      color: statusColors[statusKey].text,
                      borderColor: statusColors[statusKey].bg,
                    }
                  : {}
              }
            >
              <span>{statusIcons[statusKey]}</span>
              {statusKey.replace('_', ' ')}
              <span className="ml-1 opacity-75 text-xs bg-white/30 px-1.5 py-0.5 rounded-full">
                {getStatusCount(statusKey)}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProjects.length > 0 ? (
          filteredProjects.map(project => (
            <div key={project.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 flex flex-col justify-between h-full hover:shadow-md transition-shadow">
              <div className="mb-4">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <h3 className="text-lg font-medium text-gray-900 line-clamp-1" title={project.title}>
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
                      className="text-xs border-gray-300 rounded text-gray-600 py-1"
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
                  <p className="text-sm text-gray-500 line-clamp-2 mb-4">
                    {project.description}
                  </p>
                )}

                <div className="flex flex-col gap-2 text-sm text-gray-500">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase tracking-wider font-medium text-gray-400">Status</span>
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1"
                      style={{
                        backgroundColor: statusColors[project.status].bg,
                        color: statusColors[project.status].text,
                      }}
                    >
                      {statusIcons[project.status]}{' '}
                      {project.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase tracking-wider font-medium text-gray-400">Due</span>
                    <span>
                      {project.dueDate
                        ? formatDate(project.dueDate)
                        : 'No due date'}
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Progress</span>
                    <span>{project.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full transition-all"
                      style={{width: `${project.progress}%`}}
                    ></div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex -space-x-2 overflow-hidden py-1">
                    {project.members.slice(0, 4).map((member, index) => (
                      <div
                        key={member.id}
                        className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600"
                        style={{zIndex: 10 - index}}
                        title={member.name}
                      >
                        {getInitials(member.name)}
                      </div>
                    ))}
                    {project.members.length > 4 && (
                      <div className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-500">
                        +{project.members.length - 4}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-between items-center gap-4">
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  Updated {formatDate(project.updatedAt)}
                </span>

                <div className="flex gap-2 shrink-0">
                  <Link href={`/projects/${project.id}`}>
                    <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">View →</button>
                  </Link>

                  {canManage && (
                    <>
                      <button
                        onClick={() => openEdit(project)}
                        className="text-gray-400 hover:text-gray-600"
                        aria-label="Edit project"
                        title="Edit project"
                      >
                        ✏️
                      </button>

                      <button
                        onClick={() => deleteProject(project.id)}
                        className="text-gray-400 hover:text-red-600"
                        aria-label="Delete project"
                        title="Delete project"
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full flex flex-col items-center justify-center p-12 bg-white rounded-lg border border-gray-200 shadow-sm text-gray-500">
            <div className="text-4xl mb-4">📁</div>
            <h3 className="text-lg font-medium text-gray-900">No projects found</h3>
            <p className="text-sm mt-1 mb-4">
              {searchQuery || statusFilter !== 'ALL'
                ? 'Try adjusting your search or filter criteria'
                : 'Get started by creating your first project'}
            </p>
            {searchQuery || statusFilter !== 'ALL' ? (
              <button
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                }}
              >
                Clear Filters
              </button>
            ) : canManage ? (
              <button
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded shadow-sm transition-all"
                onClick={() => setShowCreateModal(true)}
              >
                Create Your First Project
              </button>
            ) : null}
          </div>
        )}
      </div>

      {editingProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto m-4 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-medium text-gray-900">Edit Project</h2>
              <button className="text-gray-400 hover:text-gray-600 text-2xl leading-none" onClick={closeEdit}>
                ×
              </button>
            </div>

            <form onSubmit={saveEdit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Project Title *</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="input w-full"
                  placeholder="Enter project title"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  className="input w-full"
                  placeholder="Project description (optional)"
                  rows={3}
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={e => setEditDueDate(e.target.value)}
                  className="input w-full"
                />
              </div>

              {/* ADD status select in Edit modal */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={editingProject?.status || 'NOT_STARTED'}
                  onChange={e =>
                    setEditingProject(p =>
                      p ? {...p, status: e.target.value as ProjectStatus} : p,
                    )
                  }
                  className="input w-full"
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>
                      {s.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  onClick={closeEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || !editTitle.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto m-4 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-medium text-gray-900">Create New Project</h2>
              <button
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={createProject}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Project Title *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="input w-full"
                  placeholder="Enter project title"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="input w-full"
                  placeholder="Project description (optional)"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value as any)}
                    className="input w-full"
                  >
                    <option value="NOT_STARTED">Not Started</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="ON_HOLD">On Hold</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Add Team Members</label>
                <div className="border border-gray-300 rounded-md max-h-48 overflow-y-auto divide-y divide-gray-100">
                  {memberCandidates.map(member => (
                    <div
                      key={member.id}
                      className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                        selectedMembers.includes(member.id)
                          ? 'bg-blue-50'
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => {
                        setSelectedMembers(prev =>
                          prev.includes(member.id)
                            ? prev.filter(id => id !== member.id)
                            : [...prev, member.id],
                        );
                      }}
                    >
                      <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                        {getInitials(member.name)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{member.name}</div>
                        <div className="text-xs text-gray-500">
                          {member.email}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !title.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
