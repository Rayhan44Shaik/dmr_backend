import React from 'react';

const statusColors = {
  good: 'bg-green-100 text-green-800',
  low: 'bg-amber-100 text-amber-800',
  critical: 'bg-red-100 text-red-800',
  active: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  valid: 'bg-green-100 text-green-800',
  expiring: 'bg-amber-100 text-amber-800',
  expired: 'bg-red-100 text-red-800',
} as const;

interface StatusBadgeProps {
  status: keyof typeof statusColors;
  label?: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label }) => {
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status]}`}>
      {label || status}
    </span>
  );
};

export default React.memo(StatusBadge);