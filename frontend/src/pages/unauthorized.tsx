// frontend/src/pages/unauthorized.tsx
import Link from 'next/link';
import {useEffect, useState} from 'react';

export default function UnauthorizedPage() {
  const [displayText, setDisplayText] = useState('');

  useEffect(() => {
    const messages = [
      'Access Restricted',
      'Unauthorized Access',
      'Permission Denied',
    ];

    let currentIndex = 0;
    const interval = setInterval(() => {
      setDisplayText(messages[currentIndex]);
      currentIndex = (currentIndex + 1) % messages.length;
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          borderRadius: '24px',
          padding: '48px 32px',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.1)',
          maxWidth: '480px',
          width: '100%',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background Pattern */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, #ff6b6b, #ffa726, #ff6b6b)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 3s ease infinite',
          }}
        />

        {/* Main Icon */}
        <div
          style={{
            width: '120px',
            height: '120px',
            margin: '0 auto 32px',
            background: 'linear-gradient(135deg, #ff6b6b, #ffa726)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(255, 107, 107, 0.3)',
          }}
        >
          <svg
            width="60"
            height="60"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            style={{filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'}}
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
        </div>

        {/* Animated Title */}
        <h1
          style={{
            fontSize: '2.5rem',
            fontWeight: 700,
            marginBottom: '16px',
            background: 'linear-gradient(135deg, #ff6b6b, #ffa726)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            minHeight: '60px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {displayText}
        </h1>

        {/* Description */}
        <p
          style={{
            fontSize: '1.125rem',
            color: '#64748b',
            marginBottom: '8px',
            lineHeight: 1.6,
          }}
        >
          You don't have permission to access this page
        </p>

        <p
          style={{
            fontSize: '0.95rem',
            color: '#94a3b8',
            marginBottom: '32px',
            lineHeight: 1.5,
          }}
        >
          This area requires special privileges. Please contact your
          administrator if you believe this is an error.
        </p>

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Link href="/" passHref>
            <button
              style={{
                padding: '12px 32px',
                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
              onMouseOver={e => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow =
                  '0 8px 25px rgba(59, 130, 246, 0.4)';
              }}
              onMouseOut={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow =
                  '0 4px 15px rgba(59, 130, 246, 0.3)';
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Go Home
            </button>
          </Link>

          <button
            onClick={() => window.history.back()}
            style={{
              padding: '12px 24px',
              background: 'transparent',
              color: '#64748b',
              border: '2px solid #e2e8f0',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = '#f8fafc';
              e.currentTarget.style.borderColor = '#cbd5e1';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = '#e2e8f0';
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Go Back
          </button>
        </div>

        {/* Help Text */}
        <div
          style={{
            marginTop: '32px',
            padding: '16px',
            background: '#f1f5f9',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
          }}
        >
          <p
            style={{
              fontSize: '0.875rem',
              color: '#475569',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="8" />
            </svg>
            Need help? Contact your system administrator
          </p>
        </div>

        {/* Floating Elements */}
        <div
          style={{
            position: 'absolute',
            top: '20%',
            left: '10%',
            width: '40px',
            height: '40px',
            background:
              'linear-gradient(135deg, rgba(255, 107, 107, 0.1), rgba(255, 167, 38, 0.1))',
            borderRadius: '50%',
            animation: 'float 6s ease-in-out infinite',
          }}
        />

        <div
          style={{
            position: 'absolute',
            bottom: '20%',
            right: '10%',
            width: '30px',
            height: '30px',
            background:
              'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(29, 78, 216, 0.1))',
            borderRadius: '50%',
            animation: 'float 4s ease-in-out infinite reverse',
          }}
        />
      </div>

      <style jsx global>{`
        @keyframes float {
          0%,
          100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-20px) rotate(180deg);
          }
        }

        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }

        body {
          margin: 0;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
