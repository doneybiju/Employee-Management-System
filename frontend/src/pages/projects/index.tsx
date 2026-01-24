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
      <div className="flex flex-col items-center justify-center py-32 bg-white rounded-3xl my-10">
        <div className="w-16 h-16 border-4 border-gray-100 border-t-[#667eea] rounded-full animate-spin mb-6"></div>
        <p>Loading projects...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20 px-10 bg-white rounded-3xl my-10 border-2 border-red-200">
        <div className="text-6xl mb-6 text-red-600">⚠️</div>
        <h2 className="text-2xl font-bold text-red-600 mb-3">
          Error Loading Projects
        </h2>
        <p>{error}</p>
        <button
          className="bg-[#667eea] text-white border-none py-3 px-6 rounded-xl font-semibold cursor-pointer mt-4 transition-colors hover:bg-[#5a6fd8]"
          onClick={loadProjects}
        >
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
    <div className="max-w-[1400px] mx-auto p-8 font-sans bg-gray-50 min-h-screen">
      {/* Header Section */}
      <header className="bg-gradient-to-br from-[#667eea] to-[#764ba2] rounded-3xl p-10 mb-8 text-white shadow-[0_20px_40px_rgba(102,126,234,0.3)] relative overflow-hidden before:content-[''] before:absolute before:inset-0 before:bg-[url('data:image/svg+xml,%3Csvg%20width=%2760%27%20height=%2760%27%20viewBox=%270%200%2060%2060%27%20xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cg%20fill=%27none%27%20fill-rule=%27evenodd%27%3E%3Cg%20fill=%27%23ffffff%27%20fill-opacity=%270.1%27%3E%3Ccircle%20cx=%2730%27%20cy=%2730%27%20r=%271%27/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')]">
        <div className="relative z-[2]">
          <h1 className="text-5xl font-extrabold m-0 mb-4 leading-none">
            Project Dashboard
          </h1>
          <p className="text-xl opacity-90 m-0 mb-8 font-normal">
            Manage your projects, track progress, and collaborate with your team
          </p>
          {canManage && (
            <button
              className="bg-white/20 backdrop-blur-md border-2 border-white/30 text-white px-8 py-4 rounded-2xl text-lg font-semibold cursor-pointer transition-all inline-flex items-center gap-3 hover:bg-white/30 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(255,255,255,0.2)]"
              onClick={() => canManage && setShowCreateModal(true)}
            >
              <span>+</span>
              Create New Project
            </button>
          )}
        </div>
      </header>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          {value: totalProjects, label: 'Total Projects'},
          {value: inProgressProjects, label: 'In Progress'},
          {value: completedProjects, label: 'Completed'},
          {
            value: `${
              totalProjects
                ? Math.round((completedProjects / totalProjects) * 100)
                : 0
            }%`,
            label: 'Success Rate',
          },
        ].map((stat, i) => (
          <div
            key={i}
            className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 text-center transition-transform hover:-translate-y-1"
          >
            <div className="text-4xl font-extrabold text-gray-800 mb-2">
              {stat.value}
            </div>
            <div className="text-sm text-gray-500 font-semibold uppercase tracking-wider">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Filter Section */}
      <section className="bg-white rounded-2xl p-6 mb-8 shadow-sm border border-gray-200">
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <h2 className="text-2xl font-bold text-gray-800 m-0">All Projects</h2>
          <div className="relative w-full md:max-w-[300px]">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              🔍
            </span>
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full py-3 px-4 pl-12 border-2 border-gray-200 rounded-xl text-sm transition-colors bg-gray-50 focus:outline-none focus:border-[#667eea] focus:ring-4 focus:ring-[#667eea]/10"
            />
          </div>
        </div>

        <div className="flex gap-2 flex-wrap justify-center md:justify-start">
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
              className={`px-6 py-3 border-2 rounded-xl font-semibold cursor-pointer transition-all flex items-center gap-2 text-sm ${
                statusFilter === statusKey
                  ? 'bg-[#667eea] border-[#667eea] text-white scale-105'
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-100'
              }`}
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
              <span className="bg-white/20 px-2 py-0.5 rounded-xl text-xs font-bold">
                {getStatusCount(statusKey)}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
        {filteredProjects.length > 0 ? (
          filteredProjects.map(project => (
            <div
              key={project.id}
              className="bg-white rounded-[20px] shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-gray-100 transition-all overflow-hidden hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.15)] hover:border-gray-200 flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 bg-gradient-to-br from-gray-50 to-white">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h3 className="text-xl font-bold text-gray-800 m-0 leading-snug">
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
                      className="py-1.5 px-2 rounded-md border border-gray-200 text-sm bg-white"
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
                  <p className="text-gray-500 text-sm leading-relaxed m-0 line-clamp-2">
                    {project.description}
                  </p>
                )}
              </div>

              <div className="p-6 flex-1">
                <div className="grid grid-cols-2 gap-5 mb-5">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
                      Status
                    </span>
                    <span className="text-sm font-semibold text-gray-800">
                      <span
                        className="px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider"
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
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
                      Due Date
                    </span>
                    <span className="text-sm font-semibold text-gray-800">
                      {project.dueDate
                        ? formatDate(project.dueDate)
                        : 'No due date'}
                    </span>
                  </div>
                </div>

                <div className="mb-5">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-gray-600">
                      Progress
                    </span>
                    <span className="text-sm font-bold text-[#667eea]">
                      {project.progress}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#667eea] to-[#764ba2] transition-[width] duration-300"
                      style={{width: `${project.progress}%`}}
                    ></div>
                  </div>
                </div>

                <div className="mb-5">
                  <div className="text-xs text-gray-500 font-semibold mb-2 uppercase tracking-wider">
                    Team Members
                  </div>
                  <div className="flex items-center">
                    {project.members.slice(0, 4).map((member, index) => (
                      <div
                        key={member.id}
                        className="w-8 h-8 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white flex items-center justify-center font-semibold text-xs border-2 border-white -mr-2 relative"
                        style={{zIndex: 10 - index}}
                        title={member.name}
                      >
                        {getInitials(member.name)}
                      </div>
                    ))}
                    {project.members.length > 4 && (
                      <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs font-semibold ml-2 border-2 border-white">
                        +{project.members.length - 4}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-5 px-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-800">
                  Updated {formatDate(project.updatedAt)}
                </span>

                <div className="flex gap-2">
                  <Link href={`/projects/${project.id}`}>
                    <button className="bg-[#667eea] text-white border-none px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all hover:bg-[#5a6fd8] hover:-translate-y-px">
                      View Project →
                    </button>
                  </Link>

                  {canManage && (
                    <>
                      <button
                        onClick={() => openEdit(project)}
                        className="bg-white text-gray-900 border border-gray-200 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer hover:bg-gray-50"
                        aria-label="Edit project"
                        title="Edit project"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => deleteProject(project.id)}
                        className="bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer hover:bg-red-100 hover:border-red-300"
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
          <div className="col-span-full text-center py-20 px-10 bg-white rounded-[20px] border-2 border-dashed border-gray-200">
            <div className="text-6xl mb-6 opacity-50">📁</div>
            <h3 className="text-2xl font-bold text-gray-800 mb-3">
              No projects found
            </h3>
            <p className="text-gray-500 text-base mb-6">
              {searchQuery || statusFilter !== 'ALL'
                ? 'Try adjusting your search or filter criteria'
                : 'Get started by creating your first project'}
            </p>
            {searchQuery || statusFilter !== 'ALL' ? (
              <button
                className="bg-[#667eea] text-white border-none py-3 px-6 rounded-xl font-semibold cursor-pointer transition-colors hover:bg-[#5a6fd8]"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                }}
              >
                Clear Filters
              </button>
            ) : canManage ? (
              <button
                className="bg-[#667eea] text-white border-none py-3 px-6 rounded-xl font-semibold cursor-pointer transition-colors hover:bg-[#5a6fd8]"
                onClick={() => setShowCreateModal(true)}
              >
                Create Your First Project
              </button>
            ) : null}
          </div>
        )}
      </div>

      {editingProject && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-5 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-[500px] max-h-[90vh] overflow-y-auto shadow-2xl animate-[modalSlideIn_0.3s_ease]">
            <div className="flex justify-between items-center pt-8 px-8">
              <h2 className="text-2xl font-bold text-gray-800 m-0">
                Edit Project
              </h2>
              <button
                className="bg-gray-100 border-none text-2xl cursor-pointer text-gray-500 p-2 rounded-xl w-10 h-10 flex items-center justify-center transition-all hover:bg-gray-200 hover:text-gray-800"
                onClick={closeEdit}
              >
                ×
              </button>
            </div>

            <form onSubmit={saveEdit} className="p-8">
              <div className="mb-6">
                <label className="block mb-2 font-semibold text-gray-700 text-sm">
                  Project Title *
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm transition-colors bg-gray-50 focus:outline-none focus:border-[#667eea] focus:ring-4 focus:ring-[#667eea]/10"
                  placeholder="Enter project title"
                />
              </div>

              <div className="mb-6">
                <label className="block mb-2 font-semibold text-gray-700 text-sm">
                  Description
                </label>
                <textarea
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm transition-colors bg-gray-50 focus:outline-none focus:border-[#667eea] focus:ring-4 focus:ring-[#667eea]/10 min-h-[100px] resize-y"
                  placeholder="Project description (optional)"
                  rows={3}
                />
              </div>

              <div className="mb-6">
                <label className="block mb-2 font-semibold text-gray-700 text-sm">
                  Due Date
                </label>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={e => setEditDueDate(e.target.value)}
                  className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm transition-colors bg-gray-50 focus:outline-none focus:border-[#667eea] focus:ring-4 focus:ring-[#667eea]/10"
                />
              </div>

              <div className="mb-6">
                <label className="block mb-2 font-semibold text-gray-700 text-sm">
                  Status
                </label>
                <select
                  value={editingProject?.status || 'NOT_STARTED'}
                  onChange={e =>
                    setEditingProject(p =>
                      p ? {...p, status: e.target.value as ProjectStatus} : p,
                    )
                  }
                  className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm transition-colors bg-gray-50 focus:outline-none focus:border-[#667eea] focus:ring-4 focus:ring-[#667eea]/10"
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>
                      {s.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  className="bg-white border-2 border-gray-200 px-6 py-3 rounded-xl font-semibold cursor-pointer transition-all hover:bg-gray-50 hover:border-gray-300"
                  onClick={closeEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || !editTitle.trim()}
                  className="bg-[#667eea] text-white border-none px-6 py-3 rounded-xl font-semibold cursor-pointer transition-all hover:bg-[#5a6fd8] hover:-translate-y-px disabled:bg-gray-300 disabled:cursor-not-allowed"
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-5 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-[500px] max-h-[90vh] overflow-y-auto shadow-2xl animate-[modalSlideIn_0.3s_ease]">
            <div className="flex justify-between items-center pt-8 px-8">
              <h2 className="text-2xl font-bold text-gray-800 m-0">
                Create New Project
              </h2>
              <button
                className="bg-gray-100 border-none text-2xl cursor-pointer text-gray-500 p-2 rounded-xl w-10 h-10 flex items-center justify-center transition-all hover:bg-gray-200 hover:text-gray-800"
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={createProject} className="p-8">
              <div className="mb-6">
                <label className="block mb-2 font-semibold text-gray-700 text-sm">
                  Project Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm transition-colors bg-gray-50 focus:outline-none focus:border-[#667eea] focus:ring-4 focus:ring-[#667eea]/10"
                  placeholder="Enter project title"
                />
              </div>

              <div className="mb-6">
                <label className="block mb-2 font-semibold text-gray-700 text-sm">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm transition-colors bg-gray-50 focus:outline-none focus:border-[#667eea] focus:ring-4 focus:ring-[#667eea]/10 min-h-[100px] resize-y"
                  placeholder="Project description (optional)"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block mb-2 font-semibold text-gray-700 text-sm">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm transition-colors bg-gray-50 focus:outline-none focus:border-[#667eea] focus:ring-4 focus:ring-[#667eea]/10"
                  />
                </div>
                <div>
                  <label className="block mb-2 font-semibold text-gray-700 text-sm">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value as any)}
                    className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm transition-colors bg-gray-50 focus:outline-none focus:border-[#667eea] focus:ring-4 focus:ring-[#667eea]/10"
                  >
                    <option value="NOT_STARTED">Not Started</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="ON_HOLD">On Hold</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </div>
              </div>

              <div className="mb-6">
                <label className="block mb-2 font-semibold text-gray-700 text-sm">
                  Add Team Members
                </label>
                <div className="max-h-[200px] overflow-y-auto border-2 border-gray-200 rounded-xl p-2 bg-gray-50">
                  {memberCandidates.map(member => (
                    <div
                      key={member.id}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedMembers.includes(member.id)
                          ? 'bg-[#667eea] text-white'
                          : 'hover:bg-gray-200'
                      }`}
                      onClick={() => {
                        setSelectedMembers(prev =>
                          prev.includes(member.id)
                            ? prev.filter(id => id !== member.id)
                            : [...prev, member.id],
                        );
                      }}
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white flex items-center justify-center font-semibold text-xs border border-white">
                        {getInitials(member.name)}
                      </div>
                      <div>
                        <div className="font-semibold">{member.name}</div>
                        <div className="text-xs opacity-70">{member.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  className="bg-white border-2 border-gray-200 px-6 py-3 rounded-xl font-semibold cursor-pointer transition-all hover:bg-gray-50 hover:border-gray-300"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !title.trim()}
                  className="bg-[#667eea] text-white border-none px-6 py-3 rounded-xl font-semibold cursor-pointer transition-all hover:bg-[#5a6fd8] hover:-translate-y-px disabled:bg-gray-300 disabled:cursor-not-allowed"
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
