import { useMemo, useState } from 'react';
import { Deadline } from '@/types/dashboard';

function daysLeft(iso: string) {
  return Math.ceil(
    (new Date(iso).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86_400_000
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
    [showAll, deadlines, initialLimit]
  );

  return (
    <section className="deadlines-section">
      <div className="section-header">
        <div className="section-title">
          <i className="fas fa-clock" />
          {title}
          <span className="count-badge">{deadlines.length}</span>
        </div>

        {deadlines.length > initialLimit && (
          <button className="toggle-btn" onClick={() => setShowAll(v => !v)}>
            {showAll ? 'Show Less' : 'View All'}
            <i className={`fas fa-chevron-${showAll ? 'up' : 'down'}`} />
          </button>
        )}
      </div>

      {/* scroll area shows many cards without stretching the page */}
      <div className="deadlines-grid scroll-area">
        {visible.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><i className="fas fa-check-circle" /></div>
            <h3>No upcoming deadlines</h3>
            <p>You're all caught up for now!</p>
          </div>
        ) : (
          visible.map((d, i) => {
            const dleft = daysLeft(d.dueDate);
            const tag = urgency(dleft);
            return (
              <div key={i} className={`deadline-card ${tag}`}>
                <div className="deadline-header">
                  <div className="deadline-type">
                    <i className={`fas ${
                      d.kind === 'task' ? 'fa-tasks' :
                      d.kind === 'internship_end' ? 'fa-flag' : 'fa-file'
                    }`} />
                    {d.kind.replace('_',' ')}
                  </div>
                  <div className={`urgency-badge ${tag}`}>{dleft}d</div>
                </div>
                <h4 className="deadline-title">{d.title}</h4>
                {d.subtitle && <p className="deadline-subtitle">{d.subtitle}</p>}
                <div className="deadline-footer">
                  <div className="deadline-date">
                    <i className="fas fa-calendar" />
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
