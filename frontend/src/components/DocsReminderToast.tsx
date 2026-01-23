// frontend/src/components/DocsReminderToast.tsx
import {useEffect, useState} from 'react';
import {fetchWithAuth} from '@/lib/api';
import {useAuth} from '@/context/AuthContext';

type InboxItem = {id: number; message: string};

export default function DocsReminderToast() {
  const [item, setItem] = useState<InboxItem | null>(null);
  const [open, setOpen] = useState(false);
  const {isAuthenticated, ready} = useAuth();

  async function load() {
    try {
      const res = await fetchWithAuth('/api/reminders/inbox', {
        cache: 'no-store' as RequestCache,
      });
      if (!res.ok) return;
      const j = (await res.json()) as InboxItem | null;
      if (j && j.id) {
        // suppress if this specific message-id was already shown
        const seenKey = `docsRemSeen:id:${j.id}`;
        if (typeof window !== 'undefined' && localStorage.getItem(seenKey)) {
          // ensure it’s marked read server-side too
          try {
            await fetchWithAuth(`/api/reminders/inbox/${j.id}/read`, {
              method: 'POST',
            });
          } catch {}
          return;
        }
        setItem(j);
        setOpen(true);
      }
    } catch {}
  }
  useEffect(() => {
    if (!ready || !isAuthenticated) return;
    void load();
  }, [ready, isAuthenticated]);

  async function markReadAndHide() {
    if (item) {
      try {
        await fetchWithAuth(`/api/reminders/inbox/${item.id}/read`, {
          method: 'POST',
        });
      } catch {}
      try {
        localStorage.setItem(`docsRemSeen:id:${item.id}`, '1');
      } catch {}
    }
    setOpen(false);
  }

  if (!open || !item) return null;

  return (
    <>
      {/* Backdrop blocks all interaction */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15,23,42,.45)',
          zIndex: 999,
        }}
        aria-hidden="true"
      />
      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%,-50%)',
          width: 'min(720px, 95vw)',
          background: '#fff',
          borderRadius: 14,
          padding: '26px 22px',
          boxShadow: '0 24px 60px rgba(0,0,0,.25)',
          zIndex: 1000,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            margin: '-56px auto 10px',
            borderRadius: 999,
            background: '#FEF3C7',
            display: 'grid',
            placeItems: 'center',
            color: '#D97706',
            fontSize: 20,
            boxShadow: '0 8px 24px rgba(0,0,0,.08)',
          }}
        >
          !
        </div>
        <div
          style={{
            fontWeight: 700,
            color: '#0F172A',
            fontSize: 22,
            marginBottom: 8,
          }}
        >
          Documents Required
        </div>
        <div style={{color: '#6B7280', margin: '0 auto 16px', maxWidth: 560}}>
          {item.message}
        </div>
        <div style={{display: 'flex', gap: 12, justifyContent: 'center'}}>
          <button
            onClick={markReadAndHide}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              background: '#E5E7EB',
              color: '#374151',
              border: 'none',
              fontWeight: 600,
            }}
          >
            Remind Later
          </button>
          <button
            onClick={markReadAndHide}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              background: '#4F46E5',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
            }}
          >
            Send Now
          </button>
        </div>
      </div>
    </>
  );
}
