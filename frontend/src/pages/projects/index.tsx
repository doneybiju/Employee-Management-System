import {useEffect, useState, type FormEvent, useMemo} from 'react';
import Link from 'next/link';
import {useAuth} from '@/context/AuthContext';
import {fetchWithAuth} from '@/lib/api';
import Drawer from '@/components/Drawer';
import {
  Search,
  Plus,
  Calendar,
  Filter,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Layout,
  Briefcase,
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

type ProjectStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED';

const ITEMS_PER_PAGE = 9;

export default function ProjectsPage() {
  useAuth();
  // permissions state
  const [canManage, setCanManage] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD'
  >('ALL');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);

  // Drawer & Form State
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [creating, setCreating] = useState(false);
  const [memberCandidates, setMemberCandidates] = useState<Member[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);

  // Form Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('NOT_STARTED');

  // Edit State (kept simple for now, using existing modal or we could refactor to drawer too,
  // but let's stick to the prompt which specifically asked for "Create Project = Side Drawer")
  // For consistency, I'll keep the edit logic but maybe not fully refactor it to drawer in this step
  // unless I have time. I will stick to the requested scope: "Create Project = Side Drawer".
  // However, I'll update the Edit UI to be cleaner if it pops up.
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Helpers
  const toDateInput = (iso?: string | null) =>
    iso ? new Date(iso).toISOString().slice(0, 10) : '';

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

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

  // Effects
  useEffect(() => {
    loadProjects();
    checkPermissions();
  }, []);

  useEffect(() => {
    if (showCreateDrawer && canManage) loadMemberCandidates();
  }, [showCreateDrawer, canManage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const checkPermissions = async () => {
    try {
      const r = await fetchWithAuth('/api/projects/permissions');
      if (r.ok) {
        const j = await r.json();
        setCanManage(!!j?.canCreate);
      }
    } catch {
      // ignore
    }
  };

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

      setTitle('');
      setDescription('');
      setDueDate('');
      setStatus('NOT_STARTED');
      setSelectedMembers([]);
      setShowCreateDrawer(false);
      await loadProjects();
    } catch (err: any) {
      alert(err.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  // Filter Logic
  const filteredProjects = useMemo(() => {
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
    return filtered;
  }, [projects, statusFilter, searchQuery]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredProjects.length / ITEMS_PER_PAGE);
  const paginatedProjects = filteredProjects.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  // Edit & Delete handlers
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

  async function deleteProject(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!canManage) return;
    if (!confirm('Delete this project and all its tasks?')) return;

    try {
      const res = await fetchWithAuth(`/api/projects/${id}`, {
        method: 'DELETE',
      });
      if (res.status === 204 || res.ok) {
        setProjects(prev => prev.filter(p => p.id !== id));
      } else {
        const j = await res.json().catch(() => ({}));
        alert(j?.error || 'Delete failed');
      }
    } catch (e: any) {
      alert(e?.message || 'Delete failed');
    }
  }

  // Render Status Badge
  const StatusBadge = ({status}: {status: ProjectStatus}) => {
    const styles = {
      NOT_STARTED:
        'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
      IN_PROGRESS:
        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      COMPLETED:
        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      ON_HOLD:
        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    };

    const labels = {
      NOT_STARTED: 'Not Started',
      IN_PROGRESS: 'Active',
      COMPLETED: 'Completed',
      ON_HOLD: 'On Hold',
    };

    return (
      <span
        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${styles[status]}`}
      >
        {labels[status]}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-gray-50 dark:bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm font-medium">
            Loading projects...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-gray-50 dark:bg-[#0a0a0a] p-4">
        <div className="bg-white dark:bg-[#111] p-8 rounded-2xl shadow-sm border border-red-100 dark:border-red-900/30 text-center max-w-md">
          <div className="w-12 h-12 bg-red-50 dark:bg-red-900/20 rounded-xl flex items-center justify-center mx-auto mb-4 text-red-600">
            <AlertCircle size={24} />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
            Failed to load projects
          </h2>
          <p className="text-gray-500 text-sm mb-6">{error}</p>
          <button
            onClick={loadProjects}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-50 dark:bg-[#0a0a0a]">
      {/* Sticky Header */}
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-[1600px] mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg text-white shadow-lg shadow-blue-600/20">
              <Briefcase size={20} />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Projects
            </h1>
            <span className="px-2.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-medium rounded-full">
              {filteredProjects.length}
            </span>
          </div>

          <div className="flex flex-1 md:justify-end items-center gap-3">
            {/* Search */}
            <div className="relative w-full md:w-64 group">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors"
                size={16}
              />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-[#1a1a1a] border-transparent focus:bg-white dark:focus:bg-[#111] border focus:border-blue-500/50 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 transition-all focus:ring-4 focus:ring-blue-500/10 outline-none"
              />
            </div>

            {/* Filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="appearance-none pl-9 pr-8 py-2 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-colors outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer text-gray-700 dark:text-gray-300"
              >
                <option value="ALL">All Status</option>
                <option value="IN_PROGRESS">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="NOT_STARTED">Pending</option>
                <option value="ON_HOLD">On Hold</option>
              </select>
              <Filter
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                size={16}
              />
            </div>

            {/* Create Button */}
            {canManage && (
              <button
                onClick={() => setShowCreateDrawer(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm hover:shadow-md active:translate-y-0.5"
              >
                <Plus size={16} />
                <span className="hidden sm:inline">New Project</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Content Grid */}
      <main className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800">
        <div className="max-w-[1600px] mx-auto">
          {paginatedProjects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-6">
              {paginatedProjects.map(project => (
                <Link
                  href={`/projects/${project.id}`}
                  key={project.id}
                  className="block h-full"
                >
                  <div className="group h-full flex flex-col bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl p-5 hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-black/50 hover:border-blue-500/30 dark:hover:border-blue-500/30 transition-all duration-300 cursor-pointer relative overflow-hidden">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1 min-w-0 pr-3">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 transition-colors">
                          {project.title}
                        </h3>
                      </div>
                      <StatusBadge status={project.status} />
                    </div>

                    {/* Body */}
                    <div className="flex-1">
                      <p className="text-gray-500 dark:text-gray-400 text-sm line-clamp-2 mb-4 h-10">
                        {project.description || 'No description provided.'}
                      </p>

                      <div className="mb-4">
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-gray-500 font-medium">
                            Progress
                          </span>
                          <span className="text-gray-900 dark:text-gray-100 font-bold">
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
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800 mt-2">
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <Calendar size={14} />
                        <span>
                          {project.dueDate
                            ? formatDate(project.dueDate)
                            : 'No deadline'}
                        </span>
                      </div>

                      <div className="flex items-center -space-x-2">
                        {project.members.slice(0, 3).map((m, i) => (
                          <div
                            key={m.id}
                            className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-white dark:border-[#111] flex items-center justify-center text-[10px] font-bold text-gray-600 dark:text-gray-300 z-[3]"
                            style={{zIndex: 3 - i}}
                            title={m.name}
                          >
                            {getInitials(m.name)}
                          </div>
                        ))}
                        {project.members.length > 3 && (
                          <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-white dark:border-[#111] flex items-center justify-center text-[10px] font-bold text-gray-500 z-0">
                            +{project.members.length - 3}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick Actions (only visible on hover for managers) */}
                    {canManage && (
                      <div className="absolute top-4 right-14 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            openEdit(project);
                          }}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-400 hover:text-blue-600 transition-colors"
                          title="Edit"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-96 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl bg-gray-50/50 dark:bg-white/5">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4 text-gray-400">
                <Layout size={32} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                No projects found
              </h3>
              <p className="text-gray-500 max-w-sm mt-2 mb-6">
                {searchQuery || statusFilter !== 'ALL'
                  ? 'No projects match your current filters. Try adjusting them.'
                  : 'Get started by creating your first project.'}
              </p>
              {searchQuery || statusFilter !== 'ALL' ? (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('ALL');
                  }}
                  className="text-blue-600 font-medium hover:underline"
                >
                  Clear all filters
                </button>
              ) : canManage ? (
                <button
                  onClick={() => setShowCreateDrawer(true)}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Create Project
                </button>
              ) : null}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 mt-4 mb-8">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-gray-200 dark:border-gray-800 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-gray-200 dark:border-gray-800 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Create Project Drawer */}
      <Drawer
        open={showCreateDrawer}
        onClose={() => setShowCreateDrawer(false)}
        title="Create New Project"
      >
        <form onSubmit={createProject} className="flex flex-col gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Project Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                placeholder="e.g. Website Redesign"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all min-h-[120px] resize-y"
                placeholder="Describe the project scope..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Initial Status
                </label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as ProjectStatus)}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all appearance-none"
                >
                  <option value="NOT_STARTED">Not Started</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="ON_HOLD">On Hold</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Team Members
              </label>
              <div className="border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-[#1a1a1a] max-h-[200px] overflow-y-auto p-2">
                {memberCandidates.length === 0 ? (
                  <p className="text-gray-400 text-sm p-2 text-center">
                    Loading members...
                  </p>
                ) : (
                  memberCandidates.map(member => (
                    <div
                      key={member.id}
                      onClick={() => {
                        setSelectedMembers(prev =>
                          prev.includes(member.id)
                            ? prev.filter(id => id !== member.id)
                            : [...prev, member.id],
                        );
                      }}
                      className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                        selectedMembers.includes(member.id)
                          ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                          : 'hover:bg-gray-100 dark:hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          selectedMembers.includes(member.id)
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        {getInitials(member.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {member.name}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {member.email}
                        </div>
                      </div>
                      {selectedMembers.includes(member.id) && (
                        <CheckCircle2 size={16} className="text-blue-600" />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="pt-4 mt-auto">
            <button
              type="submit"
              disabled={creating || !title.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20"
            >
              {creating ? 'Creating Project...' : 'Create Project'}
            </button>
          </div>
        </form>
      </Drawer>

      {/* Edit Modal (Keeping as fallback or simple modal since logic is reused) */}
      {editingProject && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#111] rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200 dark:border-gray-800 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Edit Project
              </h2>
              <button
                onClick={closeEdit}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <AlertCircle className="rotate-45" size={24} />
              </button>
            </div>

            <form onSubmit={saveEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-lg outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-lg outline-none focus:border-blue-500 min-h-[100px]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={e => setEditDueDate(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-lg outline-none focus:border-blue-500"
                />
              </div>

              {/* Delete Button inside Edit for convenience */}
              <div className="pt-4 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={e => deleteProject(editingProject.id, e)}
                  className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Delete Project
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={closeEdit}
                    className="px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {savingEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
