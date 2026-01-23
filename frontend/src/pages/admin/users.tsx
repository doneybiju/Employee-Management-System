import {useState, useEffect, useMemo} from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  MoreHorizontal,
  X,
  User as UserIcon,
  Briefcase,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Shield,
  Building,
  UserCheck,
} from 'lucide-react';
import {fetchWithAuth} from '@/lib/api';

/* ================= Types ================= */

type UserRow = {
  userId: number | null;
  employeeId: string;
  role: 'intern' | 'hr' | 'super_admin';
  name: string;
  department: string | null;
  position: string | null;
  companyEmail: string | null;
  phone: string | null;
  empId: string | null;
  joiningDate: string | null;
  leavingDate: string | null;
  personalEmail: string;
  nationality: string | null;
  dob: string | null;
  gender: string | null;
  supervisor: string | null;
  blocked: boolean;
  status: 'active' | 'inactive';
};

type DrawerState = {
  isOpen: boolean;
  mode: 'details' | 'edit';
  user: UserRow | null;
};

type Department = {
  id: number;
  departmentName: string;
  positions: {id: number; name: string}[];
};

/* ================= Side Drawer Component ================= */

function SideDrawer({
  state,
  onClose,
  onEdit,
  onSave,
  onDelete,
  departments,
}: {
  state: DrawerState;
  onClose: () => void;
  onEdit: () => void;
  onSave: (data: any) => Promise<void>;
  onDelete: (user: UserRow) => Promise<void>;
  departments: Department[];
}) {
  const {isOpen, mode, user} = state;
  const [formData, setFormData] = useState<any>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && user && mode === 'edit') {
      // Initialize form data
      setFormData({
        name: user.name,
        email: user.companyEmail || '',
        personalEmail: user.personalEmail || '',
        phone: user.phone || '',
        nationality: user.nationality || '',
        gender: user.gender || '',
        birthdate: user.dob ? user.dob.split('T')[0] : '',
        startDate: user.joiningDate ? user.joiningDate.split('T')[0] : '',
        endDate: user.leavingDate ? user.leavingDate.split('T')[0] : '',
        supervisor: user.supervisor || '',
        departmentId:
          departments.find(d => d.departmentName === user.department)?.id || '',
        positionId:
          departments
            .flatMap(d => d.positions)
            .find(p => p.name === user.position)?.id || '',
        role: user.role,
        empType: 'intern', // Default, would need to fetch real value if needed
      });

      // Fetch details to get empType if needed
      if (user.userId) {
        fetchWithAuth(`/api/users/admin/users/${user.userId}/detail`)
          .then(res => res.json())
          .then(data => {
            if (data.empType) {
              setFormData((prev: any) => ({...prev, empType: data.empType}));
            }
          })
          .catch(() => {});
      }
    }
  }, [isOpen, user, mode, departments]);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave(formData);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = async () => {
    if (
      confirm(
        'Are you sure you want to delete this user? This action cannot be undone.',
      )
    ) {
      setLoading(true);
      try {
        await onDelete(user);
        onClose();
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 right-0 w-[480px] bg-white dark:bg-[#111] shadow-2xl z-50 transform transition-transform duration-300 flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Drawer Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {mode === 'edit' ? 'Edit User' : 'User Details'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {mode === 'details' ? (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="flex items-center gap-4 pb-6 border-b border-gray-100 dark:border-gray-800">
                <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xl font-bold text-blue-600 dark:text-blue-400">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {user.name}
                  </h3>
                  <p className="text-gray-500 text-sm">
                    {user.position || 'No Position'}
                  </p>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-2 ${
                      user.status === 'active'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                    }`}
                  >
                    {user.status.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Detail Grid */}
              <div className="grid grid-cols-1 gap-y-4">
                <DetailItem
                  icon={Mail}
                  label="Company Email"
                  value={user.companyEmail}
                />
                <DetailItem
                  icon={Mail}
                  label="Personal Email"
                  value={user.personalEmail}
                />
                <DetailItem icon={Phone} label="Phone" value={user.phone} />
                <DetailItem
                  icon={Building}
                  label="Department"
                  value={user.department}
                />
                <DetailItem
                  icon={Briefcase}
                  label="Position"
                  value={user.position}
                />
                <DetailItem
                  icon={UserCheck}
                  label="Supervisor"
                  value={user.supervisor}
                />
                <DetailItem
                  icon={Calendar}
                  label="Join Date"
                  value={
                    user.joiningDate
                      ? new Date(user.joiningDate).toLocaleDateString()
                      : null
                  }
                />
                <DetailItem
                  icon={Calendar}
                  label="Leave Date"
                  value={
                    user.leavingDate
                      ? new Date(user.leavingDate).toLocaleDateString()
                      : null
                  }
                />
                <DetailItem
                  icon={MapPin}
                  label="Nationality"
                  value={user.nationality}
                />
                <DetailItem
                  icon={UserIcon}
                  label="Gender"
                  value={user.gender}
                />
                <DetailItem icon={Shield} label="Role" value={user.role} />
                <DetailItem
                  icon={Shield}
                  label="Employee ID"
                  value={user.empId}
                />
              </div>
            </div>
          ) : (
            /* Edit Form */
            <form id="edit-form" onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 border-b pb-2 border-gray-100 dark:border-gray-800">
                  Personal Information
                </h3>
                <Input
                  label="Name"
                  value={formData.name}
                  onChange={v => setFormData({...formData, name: v})}
                />
                <Input
                  label="Personal Email"
                  value={formData.personalEmail}
                  onChange={v => setFormData({...formData, personalEmail: v})}
                />
                <Input
                  label="Phone"
                  value={formData.phone}
                  onChange={v => setFormData({...formData, phone: v})}
                />
                <Input
                  label="Nationality"
                  value={formData.nationality}
                  onChange={v => setFormData({...formData, nationality: v})}
                />
                <Select
                  label="Gender"
                  value={formData.gender}
                  onChange={v => setFormData({...formData, gender: v})}
                  options={[
                    {label: 'Male', value: 'male'},
                    {label: 'Female', value: 'female'},
                    {label: 'Other', value: 'others'},
                  ]}
                />
                <Input
                  label="Birthdate"
                  type="date"
                  value={formData.birthdate}
                  onChange={v => setFormData({...formData, birthdate: v})}
                />
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 border-b pb-2 border-gray-100 dark:border-gray-800">
                  Employment Details
                </h3>
                <Input
                  label="Start Date"
                  type="date"
                  value={formData.startDate}
                  onChange={v => setFormData({...formData, startDate: v})}
                />
                <Input
                  label="End Date"
                  type="date"
                  value={formData.endDate}
                  onChange={v => setFormData({...formData, endDate: v})}
                />

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-500 uppercase">
                    Department
                  </label>
                  <select
                    value={formData.departmentId}
                    onChange={e => {
                      setFormData({
                        ...formData,
                        departmentId: Number(e.target.value),
                        positionId: '',
                      });
                    }}
                    className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  >
                    <option value="">Select Department</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.departmentName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-500 uppercase">
                    Position
                  </label>
                  <select
                    value={formData.positionId}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        positionId: Number(e.target.value),
                      })
                    }
                    className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    disabled={!formData.departmentId}
                  >
                    <option value="">Select Position</option>
                    {departments
                      .find(d => d.id === formData.departmentId)
                      ?.positions.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </div>

                <Input
                  label="Supervisor"
                  value={formData.supervisor}
                  onChange={v => setFormData({...formData, supervisor: v})}
                />

                <Select
                  label="Employee Type"
                  value={formData.empType}
                  onChange={v => setFormData({...formData, empType: v})}
                  options={[
                    {label: 'Intern', value: 'intern'},
                    {label: 'Employee', value: 'employee'},
                    {label: 'Team Lead', value: 'team_lead'},
                  ]}
                />
              </div>

              {user.userId && (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 border-b pb-2 border-gray-100 dark:border-gray-800">
                    Account Settings
                  </h3>
                  <Select
                    label="System Role"
                    value={formData.role}
                    onChange={v => setFormData({...formData, role: v})}
                    options={[
                      {label: 'Intern', value: 'intern'},
                      {label: 'HR', value: 'hr'},
                      {label: 'Super Admin', value: 'super_admin'},
                    ]}
                  />
                </div>
              )}
            </form>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-[#111] flex justify-between items-center">
          {mode === 'edit' ? (
            <>
              <button
                type="button"
                onClick={handleDeleteClick}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                Delete User
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="edit-form"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </>
          ) : (
            <div className="flex gap-3 w-full">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={onEdit}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg shrink-0">
        <Icon className="w-4 h-4 text-gray-500" />
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {label}
        </p>
        <p className="text-sm text-gray-900 dark:text-gray-200 font-medium">
          {value || '—'}
        </p>
      </div>
    </div>
  );
}

function Input({
  label,
  type = 'text',
  value,
  onChange,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-500 uppercase">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: {label: string; value: string}[];
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-500 uppercase">
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ================= Main Page Component ================= */

const ROWS_PER_PAGE = 10;

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'inactive'>('active');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [drawerState, setDrawerState] = useState<DrawerState>({
    isOpen: false,
    mode: 'details',
    user: null,
  });

  // Fetch Data
  useEffect(() => {
    loadData();
  }, [tab]);

  useEffect(() => {
    loadDepartments();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth(`/api/admin/users?tab=${tab}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Failed to load users', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      const res = await fetchWithAuth('/api/departments/full');
      if (res.ok) {
        setDepartments(await res.json());
      }
    } catch {
      // ignore
    }
  };

  // Filter & Slice
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // Tab Filter
      if (user.status !== tab) return false;

      // Search Filter
      if (search) {
        const q = search.toLowerCase();
        return (
          user.name.toLowerCase().includes(q) ||
          (user.companyEmail || '').toLowerCase().includes(q) ||
          (user.department || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [users, tab, search]);

  const pageData = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE;
    return filteredUsers.slice(start, start + ROWS_PER_PAGE);
  }, [filteredUsers, page]);

  const totalPages = Math.ceil(filteredUsers.length / ROWS_PER_PAGE);

  // Actions
  const handleSave = async (data: any) => {
    if (!drawerState.user) return;

    try {
      // 1. Update Internship Info
      await fetchWithAuth(
        `/api/users/admin/users/intern/${drawerState.user.employeeId}`,
        {
          method: 'PUT',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            ...data,
            userId: drawerState.user.userId,
          }),
        },
      );

      // 2. Update User (if email changed for existing user)
      if (
        drawerState.user.companyEmail &&
        data.email !== drawerState.user.companyEmail
      ) {
        // Handle email update logic if API supports it separate or via above
      }

      await loadData();
      setDrawerState(prev => ({...prev, isOpen: false}));
    } catch {
      alert('Failed to save changes');
    }
  };

  const handleDelete = async (user: UserRow) => {
    try {
      if (tab === 'active') {
        await fetchWithAuth('/api/users/admin/users/deactivate', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            userId: user.userId,
            employeeId: user.employeeId,
            companyEmail: user.companyEmail,
          }),
        });
      } else {
        await fetchWithAuth(
          `/api/users/admin/users/intern/${user.employeeId}`,
          {
            method: 'DELETE',
          },
        );
      }
      await loadData();
    } catch {
      alert('Failed to delete user');
    }
  };

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-gray-50 dark:bg-[#0a0a0a]">
      {/* Header Area */}
      <div className="px-8 py-6 pb-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Team Members
          </h1>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search users..."
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9 pr-4 py-2 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-64"
              />
            </div>

            {/* Add User */}
            <Link
              href="/admin/import-users"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add User
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={() => {
              setTab('active');
              setPage(1);
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'active' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
          >
            Active Users
          </button>
          <button
            onClick={() => {
              setTab('inactive');
              setPage(1);
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'inactive' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
          >
            Inactive Users
          </button>
        </div>
      </div>

      {/* Table Card */}
      <div className="flex-1 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm flex flex-col overflow-hidden mx-6 mb-6">
        {/* Table Body */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-gray-50/90 dark:bg-[#111]/90 backdrop-blur z-10 border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Position
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : pageData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-gray-500">
                    No users found.
                  </td>
                </tr>
              ) : (
                pageData.map(user => (
                  <tr
                    key={user.employeeId}
                    className="group hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-sm font-bold text-blue-600 dark:text-blue-400">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {user.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {user.companyEmail || user.personalEmail}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 capitalize">
                      {user.role.replace('_', ' ')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {user.department || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {user.position || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.status === 'active'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                        }`}
                      >
                        {user.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="relative inline-block text-left">
                        <button
                          onClick={() =>
                            setDrawerState({
                              isOpen: true,
                              mode: 'details',
                              user,
                            })
                          }
                          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                          <MoreHorizontal className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Quick Edit Trigger (Hidden but useful if we wanted dropdown)
                          For now, clicking the button opens Details.
                          We can add a dropdown logic or just open details
                          and let them switch to edit from there.
                          The requirement said "Action Button: A simple ... icon button. Clicking it sets drawerState to Open."
                          I'll open in Details mode by default.
                          But wait, how do they switch to Edit?
                          I should probably add an "Edit" button in the Drawer Header or Footer.
                          I'll add a mode switcher in the Drawer?
                          Or maybe the ... button opens a dropdown menu?
                          "Action Button: A simple ... icon button. Clicking it sets drawerState to Open."
                          It implies the drawer opens. Usually details first.
                          I will add an "Edit" button in the Details view of the drawer.
                      */}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="h-14 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between px-6 bg-white dark:bg-[#111]">
          <span className="text-sm text-gray-500">
            Showing{' '}
            {filteredUsers.length === 0 ? 0 : (page - 1) * ROWS_PER_PAGE + 1} to{' '}
            {Math.min(page * ROWS_PER_PAGE, filteredUsers.length)} of{' '}
            {filteredUsers.length} results
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded-md disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded-md disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <SideDrawer
        state={drawerState}
        departments={departments}
        onClose={() => setDrawerState(prev => ({...prev, isOpen: false}))}
        onEdit={() => setDrawerState(prev => ({...prev, mode: 'edit'}))}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
