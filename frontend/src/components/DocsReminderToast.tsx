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
        className="fixed inset-0 bg-slate-900/45 z-[999]"
        aria-hidden="true"
      />
      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(720px,95vw)] bg-white rounded-2xl p-6 shadow-[0_24px_60px_rgba(0,0,0,0.25)] z-[1000] text-center"
      >
        <div className="w-14 h-14 -mt-14 mx-auto mb-2.5 rounded-full bg-amber-100 grid place-items-center text-amber-600 text-xl shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          !
        </div>
        <div className="font-bold text-slate-900 text-xl mb-2">
          Documents Required
        </div>
        <div className="text-gray-500 mx-auto mb-4 max-w-[560px]">
          {item.message}
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={markReadAndHide}
            className="py-2.5 px-4 rounded-xl bg-gray-200 text-gray-700 border-none font-semibold cursor-pointer hover:bg-gray-300"
          >
            Remind Later
          </button>
          <button
            onClick={markReadAndHide}
            className="py-2.5 px-4.5 rounded-xl bg-indigo-600 text-white border-none font-bold cursor-pointer hover:bg-indigo-700"
          >
            Send Now
          </button>
        </div>
      </div>
    </>
  );
}
