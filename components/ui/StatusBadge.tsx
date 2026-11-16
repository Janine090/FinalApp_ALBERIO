import Badge from './Badge';

type Status =
  | 'present'
  | 'late'
  | 'absent'
  | 'upcoming'
  | 'active'
  | 'closed';

const CONFIG = {
  present: { label: 'Present', tone: 'success', icon: 'checkmark-circle' },
  late: { label: 'Late', tone: 'warning', icon: 'time' },
  absent: { label: 'Absent', tone: 'danger', icon: 'close-circle' },
  upcoming: { label: 'Upcoming', tone: 'info', icon: 'calendar-outline' },
  active: { label: 'Live', tone: 'success', icon: 'radio' },
  closed: { label: 'Closed', tone: 'neutral', icon: 'lock-closed' },
} as const;

export default function StatusBadge({ status }: { status: Status }) {
  const config = CONFIG[status];
  return <Badge label={config.label} tone={config.tone} icon={config.icon} />;
}
