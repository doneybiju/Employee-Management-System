import {useMemo, useState} from 'react';
import {Deadline} from '@/types/dashboard';
import {
  Clock,
  ChevronUp,
  ChevronDown,
  CheckCircle,
  ListTodo,
  Flag,
  File,
  Calendar,
} from 'lucide-react';

function daysLeft(iso: string) {
  return Math.ceil(
    (new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) /
      86_400_000,
  );
}
function urgency(days: number) {
  if (days <= 2) return 'critical';
  if (days <= 7) return 'high';
  if (days <= 14) return 'medium';
  return 'low';
}

export default function UpcomingDeadlines({
  deadlines,
  title = 'Upcoming Deadlines',
  initialLimit = 3,
}: {
  deadlines: Deadline[];
  title?: string;
  initialLimit?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = useMemo(
    () => (showAll ? deadlines : deadlines.slice(0, initialLimit)),
    [showAll, deadlines, initialLimit],
  );

  return (
    <section className="bg-white dark:bg-[#111] rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6 shadow-sm">
      <div className="flex justify-between items-center mb-5">
        <div className="flex items-center gap-3 text-lg font-semibold text-gray-900 dark:text-white">
          <Clock className="w-5 h-5 text-blue-600" />
          {title}
          <span className="bg-blue-600 text-white px-2 py-0.5 rounded-xl text-xs font-semibold">
            {deadlines.length}
          </span>
        </div>

        {deadlines.length > initialLimit && (
          <button
            className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-3 py-2 rounded text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            onClick={() => setShowAll(v => !v)}
          >
            {showAll ? 'Show Less' : 'View All'}
            {showAll ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[260px] overflow-y-auto pr-2 custom-scrollbar">
        {visible.length === 0 ? (
          <div className="col-span-full text-center py-12 px-5">
            <div className="text-5xl text-gray-300 mb-4 flex justify-center">
              <CheckCircle className="w-12 h-12" />
            </div>
            <h3 className="text-gray-500 text-base font-semibold mb-2">
              No upcoming deadlines
            </h3>
            <p className="text-gray-400 text-sm">
              You&apos;re all caught up for now!
            </p>
          </div>
        ) : (
          visible.map((d, i) => {
            const dleft = daysLeft(d.dueDate);
            const tag = urgency(dleft);

            let borderClass = 'border-l-4 border-l-green-600';
            let badgeClass = 'bg-green-600';

            if (tag === 'critical') {
              borderClass = 'border-l-4 border-l-red-600';
              badgeClass = 'bg-red-600';
            } else if (tag === 'high') {
              borderClass = 'border-l-4 border-l-orange-600';
              badgeClass = 'bg-orange-600';
            } else if (tag === 'medium') {
              borderClass = 'border-l-4 border-l-yellow-600';
              badgeClass = 'bg-yellow-600';
            }

            return (
              <div
                key={i}
                className={`bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl p-5 hover:border-blue-500/50 transition-colors shadow-sm ${borderClass}`}
              >
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 capitalize">
                    {d.kind === 'task' ? (
                      <ListTodo className="w-3.5 h-3.5" />
                    ) : d.kind === 'internship_end' ? (
                      <Flag className="w-3.5 h-3.5" />
                    ) : (
                      <File className="w-3.5 h-3.5" />
                    )}
                    {d.kind.replace('_', ' ')}
                  </div>
                  <div
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold text-white ${badgeClass}`}
                  >
                    {dleft}d
                  </div>
                </div>
                <h4 className="text-[15px] font-semibold text-gray-900 dark:text-white mb-2">
                  {d.title}
                </h4>
                {d.subtitle && (
                  <p className="text-[13px] text-gray-500 mb-4 leading-relaxed">
                    {d.subtitle}
                  </p>
                )}
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(d.dueDate).toLocaleDateString()}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
