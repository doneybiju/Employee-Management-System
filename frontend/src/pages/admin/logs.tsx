import {useRouter} from 'next/router';
import ProtectedRoute from '@/components/ProtectedRoute';

interface LogCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  route: string;
  color: string;
}

export default function LogsGatewayPage() {
  const router = useRouter();

  const logCards: LogCard[] = [
    {
      id: 'login-events',
      title: 'Login Events',
      description:
        'View login attempts, authentication history, and security events',
      icon: '🔐',
      route: '/admin/logs/login-events',
      color: '#3b82f6',
    },
    {
      id: 'user-creation',
      title: 'User Creation',
      description: 'Track user account creation history and audit trail',
      icon: '👤',
      route: '/admin/logs/user-creation',
      color: '#8b5cf6',
    },
    {
      id: 'documents',
      title: 'Document Activity',
      description: 'Monitor document uploads and deletions by HR and admins',
      icon: '📄',
      route: '/admin/logs/documents',
      color: '#10b981',
    },
  ];

  const handleCardClick = (route: string) => {
    router.push(route);
  };

  return (
    <ProtectedRoute roles={['super_admin']}>
      <div className="logs-gateway-page">
        <div className="header-section">
          <h1>System Logs</h1>
          <p className="subtitle">Access and monitor system activity logs</p>
        </div>

        <div className="cards-grid">
          {logCards.map(card => (
            <div
              key={card.id}
              className="log-card"
              onClick={() => handleCardClick(card.route)}
              style={{borderTopColor: card.color}}
            >
              <div
                className="card-icon"
                style={{background: `${card.color}15`}}
              >
                <span style={{color: card.color}}>{card.icon}</span>
              </div>
              <h3 className="card-title">{card.title}</h3>
              <p className="card-description">{card.description}</p>
              <div className="card-arrow" style={{color: card.color}}>
                →
              </div>
            </div>
          ))}
        </div>

        <style jsx>{`
          .logs-gateway-page {
            padding: 2rem;
            max-width: 1200px;
            margin: 0 auto;
          }

          .header-section {
            margin-bottom: 3rem;
          }

          .header-section h1 {
            margin: 0 0 0.5rem 0;
            font-size: 2.5rem;
            color: #1a1a1a;
            font-weight: 700;
          }

          .subtitle {
            color: #666;
            margin: 0;
            font-size: 1.125rem;
          }

          .cards-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 1.5rem;
          }

          .log-card {
            background: white;
            border-radius: 12px;
            padding: 2rem;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
            border-top: 4px solid;
            cursor: pointer;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
          }

          .log-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.12);
          }

          .card-icon {
            width: 64px;
            height: 64px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2rem;
            margin-bottom: 1.5rem;
          }

          .card-title {
            margin: 0 0 0.75rem 0;
            font-size: 1.5rem;
            font-weight: 600;
            color: #1a1a1a;
          }

          .card-description {
            margin: 0;
            color: #666;
            font-size: 0.95rem;
            line-height: 1.6;
          }

          .card-arrow {
            position: absolute;
            bottom: 1.5rem;
            right: 1.5rem;
            font-size: 1.5rem;
            font-weight: bold;
            opacity: 0;
            transition:
              opacity 0.3s ease,
              transform 0.3s ease;
          }

          .log-card:hover .card-arrow {
            opacity: 1;
            transform: translateX(4px);
          }

          @media (max-width: 768px) {
            .logs-gateway-page {
              padding: 1rem;
            }

            .header-section h1 {
              font-size: 2rem;
            }

            .cards-grid {
              grid-template-columns: 1fr;
            }

            .log-card {
              padding: 1.5rem;
            }
          }
        `}</style>
      </div>
    </ProtectedRoute>
  );
}
