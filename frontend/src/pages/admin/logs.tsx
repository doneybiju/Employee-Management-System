import {useRouter} from 'next/router';
import ProtectedRoute from '@/components/ProtectedRoute';
import {
  Fingerprint,
  UserPlus,
  FileClock,
  ArrowRight,
  LucideIcon,
} from 'lucide-react';

interface LogCard {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  route: string;
  colorClass: string;
  bgClass: string;
}

export default function LogsGatewayPage() {
  const router = useRouter();

  const logCards: LogCard[] = [
    {
      id: 'login-events',
      title: 'Login Events',
      description:
        'View login attempts, authentication history, and security events.',
      icon: Fingerprint,
      route: '/admin/logs/login-events',
      colorClass: 'text-blue-600 dark:text-blue-400',
      bgClass: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      id: 'user-creation',
      title: 'User Creation',
      description: 'Track user account creation history and audit trail.',
      icon: UserPlus,
      route: '/admin/logs/user-creation',
      colorClass: 'text-purple-600 dark:text-purple-400',
      bgClass: 'bg-purple-50 dark:bg-purple-900/20',
    },
    {
      id: 'documents',
      title: 'Document Activity',
      description: 'Monitor document uploads, verifications, and deletions.',
      icon: FileClock,
      route: '/admin/logs/documents',
      colorClass: 'text-emerald-600 dark:text-emerald-400',
      bgClass: 'bg-emerald-50 dark:bg-emerald-900/20',
    },
  ];

  return (
    <ProtectedRoute roles={['super_admin']}>
      <div className="min-h-[calc(100vh-64px)] bg-gray-50 dark:bg-[#0a0a0a] p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              System Logs & Audit
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Monitor security events, user access, and data changes.
            </p>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {logCards.map(card => (
              <div
                key={card.id}
                onClick={() => router.push(card.route)}
                className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl p-6 hover:shadow-lg hover:border-blue-500/50 transition-all cursor-pointer group relative overflow-hidden"
              >
                {/* Icon Box */}
                <div
                  className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${card.bgClass} ${card.colorClass}`}
                >
                  <card.icon size={24} />
                </div>

                {/* Content */}
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mt-4">
                  {card.title}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                  {card.description}
                </p>

                {/* Footer/Action */}
                <div className="flex items-center mt-4 text-blue-600 dark:text-blue-400 font-medium">
                  View Logs
                  <ArrowRight
                    size={16}
                    className="ml-1 group-hover:translate-x-1 transition-transform"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
