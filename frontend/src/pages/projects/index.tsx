import {useEffect, useState, type FormEvent} from 'react';
import Link from 'next/link';
import {useAuth} from '@/context/AuthContext';
import {fetchWithAuth} from '@/lib/api';
import Drawer from '@/components/Drawer';
import {
  Calendar,
  Plus,
  Search,
  Briefcase,
  CheckCircle,
  Clock,
  Filter,
  Eye,
  Loader2,
} from 'lucide-react';

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
  useAuth();
  const [canManage, setCanManage] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD'
  >('ALL');

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');

  // Create/Edit state
  const [creating, setCreating] = useState(false);
  const [memberCandidates, setMemberCandidates] = useState<Member[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('NOT_STARTED');

  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Status colors
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'NOT_STARTED':
        return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
      case 'IN_PROGRESS':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'COMPLETED':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'ON_HOLD':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusLabel = (status: string) => status.replace('_', ' ');

  // helpers
  const toDateInput = (iso?: string | null) =>
    iso ? new Date(iso).toISOString().slice(0, 10) : '';

  function openCreate() {
    setTitle('');
    setDescription('');
    setDueDate('');
    setStatus('NOT_STARTED');
    setSelectedMembers([]);
    setDrawerMode('create');
    setDrawerOpen(true);
  }

  function openEdit(p: Project) {
    setEditingProject(p);
    setTitle(p.title);
    setDescription(p.description ?? '');
    setDueDate(toDateInput(p.dueDate));
    setStatus(p.status);
    // For editing members, we ideally need full member list which we load in drawer
    setSelectedMembers(p.members.map(m => m.id));
    setDrawerMode('edit');
    setDrawerOpen(true);
  }

  function deriveProjectStatus(p: Project): Project['status'] {
    if (p.status === 'ON_HOLD') return 'ON_HOLD';
    if (Array.isArray(p.tasks) && p.tasks.length > 0) {
      const allCompleted = p.tasks.every(t => t.status === 'COMPLETED');
      if (allCompleted) return 'COMPLETED';
      const allNotStarted = p.tasks.every(t => t.status === 'NOT_STARTED');
      if (allNotStarted) return 'NOT_STARTED';
      return 'IN_PROGRESS';
    }
    const prog = typeof p.progress === 'number' ? p.progress : 0;
    if (prog >= 100) return 'COMPLETED';
    if (prog <= 0) return 'NOT_STARTED';
    return 'IN_PROGRESS';
  }

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (drawerOpen && canManage) loadMemberCandidates();
  }, [drawerOpen, canManage]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetchWithAuth('/api/projects/permissions');
        if (r.ok) {
          const j = await r.json();
          setCanManage(!!j?.canCreate);
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
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter(project => project.status === statusFilter);
    }
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setCreating(true);
    try {
      const isEdit = drawerMode === 'edit' && editingProject;
      const url = isEdit
        ? `/api/projects/${editingProject.id}`
        : '/api/projects';
      const method = isEdit ? 'PATCH' : 'POST';

      const body: any = {
        title: title.trim(),
        description: description.trim() || null,
        dueDate: dueDate || null,
        status,
      };

      if (!isEdit) {
        body.memberIds = selectedMembers;
      } else {
        // Edit mode doesn't support updating members in this endpoint usually,
        // but if the API supported it we would add it.
        // For now sticking to existing logic which only creates with members.
        // Wait, the original code didn't have member editing logic in `saveEdit`.
        // So I will stick to that constraint unless I see `memberIds` being used in PATCH.
        // Original `saveEdit` body: title, description, dueDate, status.
      }

      const response = await fetchWithAuth(url, {
        method,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
      });

      if (!response.ok)
        throw new Error(`Failed to ${isEdit ? 'update' : 'create'} project`);

      if (!isEdit) {
        // Reload projects if create (since IDs change etc)
        await loadProjects();
      } else {
        // Optimistic update
        setProjects(prev =>
          prev.map(p =>
            p.id === editingProject!.id
              ? {
                  ...p,
                  title: title.trim(),
                  description: description.trim() || null,
                  dueDate: dueDate || null,
                  status,
                  updatedAt: new Date().toISOString(),
                }
              : p,
          ),
        );
      }
      setDrawerOpen(false);
    } catch (err: any) {
      alert(err.message || 'Operation failed');
    } finally {
      setCreating(false);
    }
  };

  const deleteProject = async (id: number) => {
    if (!confirm('Delete this project?')) return;
    try {
      const res = await fetchWithAuth(`/api/projects/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setProjects(prev => prev.filter(p => p.id !== id));
      }
    } catch (e) {
      alert('Failed to delete');
    }
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

  const totalProjects = projects.length;
  const inProgressProjects = projects.filter(
    p => p.status === 'IN_PROGRESS',
  ).length;
  const completedProjects = projects.filter(
    p => p.status === 'COMPLETED',
  ).length;

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-[#111] p-6 rounded-xl border border-gray-200 dark:border-gray-800 flex items-center gap-4 shadow-sm">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-lg">
            <Briefcase size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Total Projects</p>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
              {totalProjects}
            </h3>
          </div>
        </div>
        <div className="bg-white dark:bg-[#111] p-6 rounded-xl border border-gray-200 dark:border-gray-800 flex items-center gap-4 shadow-sm">
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 rounded-lg">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">In Progress</p>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
              {inProgressProjects}
            </h3>
          </div>
        </div>
        <div className="bg-white dark:bg-[#111] p-6 rounded-xl border border-gray-200 dark:border-gray-800 flex items-center gap-4 shadow-sm">
          <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-600 rounded-lg">
            <CheckCircle size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Completed</p>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
              {completedProjects}
            </h3>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative flex-1 max-w-md w-full">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-black border focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg outline-none transition-all"
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex bg-gray-100 dark:bg-[#1A1A1A] p-1 rounded-lg">
            {(
              [
                'ALL',
                'NOT_STARTED',
                'IN_PROGRESS',
                'COMPLETED',
                'ON_HOLD',
              ] as const
            ).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  statusFilter === s
                    ? 'bg-white dark:bg-[#333] text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                {s === 'ALL' ? 'All' : s.replace('_', ' ')}
              </button>
            ))}
          </div>
          {canManage && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm ml-auto"
            >
              <Plus size={18} /> New Project
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 p-4 rounded-lg border border-red-200 dark:border-red-900">
          {error}
        </div>
      )}

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-[#111] rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
          <div className="mx-auto w-12 h-12 bg-gray-100 dark:bg-[#222] rounded-full flex items-center justify-center mb-4">
            <Filter className="text-gray-400" size={24} />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            No projects found
          </h3>
          <p className="text-gray-500 mt-1">
            Try adjusting your search or filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map(project => (
            <div
              key={project.id}
              className="group bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl hover:shadow-md transition-all duration-200 flex flex-col"
            >
              <div className="p-6 flex-1">
                <div className="flex justify-between items-start mb-4">
                  <h3
                    className="font-bold text-lg text-gray-900 dark:text-white line-clamp-1"
                    title={project.title}
                  >
                    {project.title}
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${getStatusColor(project.status)}`}
                  >
                    {getStatusLabel(project.status)}
                  </span>
                </div>
                <p className="text-gray-500 text-sm mb-6 line-clamp-2 min-h-[40px]">
                  {project.description || 'No description provided.'}
                </p>

                <div className="mb-6">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-500 font-medium">Progress</span>
                    <span className="text-gray-900 dark:text-white font-semibold">
                      {project.progress}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-500"
                      style={{width: `${project.progress}%`}}
                    />
                  </div>
                </div>

                <div className="flex items-center text-sm text-gray-500 gap-2">
                  <Calendar size={14} />
                  <span>
                    {project.dueDate
                      ? formatDate(project.dueDate)
                      : 'No due date'}
                  </span>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-[#1A1A1A]/50 rounded-b-xl flex items-center justify-between">
                <div className="flex -space-x-2">
                  {project.members.slice(0, 3).map(m => (
                    <div
                      key={m.id}
                      className="w-8 h-8 rounded-full border-2 border-white dark:border-[#111] bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300"
                      title={m.name}
                    >
                      {getInitials(m.name)}
                    </div>
                  ))}
                  {project.members.length > 3 && (
                    <div className="w-8 h-8 rounded-full border-2 border-white dark:border-[#111] bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-medium text-gray-500">
                      +{project.members.length - 3}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  {canManage && (
                    <button
                      onClick={() => openEdit(project)}
                      className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium"
                    >
                      Edit
                    </button>
                  )}
                  <Link href={`/projects/${project.id}`}>
                    <button className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-[#222] border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-[#333] transition-colors">
                      <Eye size={14} /> View
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === 'create' ? 'Create Project' : 'Edit Project'}
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Project Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              placeholder="e.g. Website Redesign"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none"
              placeholder="Project details..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as ProjectStatus)}
                className="w-full px-3 py-2 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
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
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              />
            </div>
          </div>

          {drawerMode === 'create' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Assign Team Members
              </label>
              <div className="max-h-[200px] overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
                {memberCandidates.map(member => (
                  <div
                    key={member.id}
                    onClick={() => {
                      setSelectedMembers(prev =>
                        prev.includes(member.id)
                          ? prev.filter(id => id !== member.id)
                          : [...prev, member.id],
                      );
                    }}
                    className={`flex items-center p-3 cursor-pointer transition-colors ${
                      selectedMembers.includes(member.id)
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-[#1A1A1A]'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded border flex items-center justify-center mr-3 ${
                        selectedMembers.includes(member.id)
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      {selectedMembers.includes(member.id) && (
                        <CheckCircle size={12} />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {member.name}
                      </p>
                      <p className="text-xs text-gray-500">{member.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-[#1A1A1A] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !title.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
            >
              {creating && <Loader2 size={16} className="animate-spin" />}
              {drawerMode === 'create' ? 'Create Project' : 'Save Changes'}
            </button>
          </div>

          {drawerMode === 'edit' && canManage && (
            <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => {
                  if (editingProject) {
                    deleteProject(editingProject.id);
                    setDrawerOpen(false);
                  }
                }}
                className="w-full px-4 py-2 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-lg font-medium hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
              >
                Delete Project
              </button>
            </div>
          )}
        </form>
      </Drawer>
    </div>
  );
}
