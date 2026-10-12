import React from 'react';

interface StatusBadgeProps {
  status: string;
  type?: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, type, className = '' }) => {
  const getBadgeStyle = () => {
    switch (status.toUpperCase()) {
      case 'PRESENT':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'LATE':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'ABSENT':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'INCOMPLETE':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'ON_LEAVE':
        return 'bg-violet-100 text-violet-800 border-violet-300';
      case 'HOLIDAY':
        return 'bg-sky-100 text-sky-800 border-sky-300';
      case 'WEEKEND':
        return 'bg-slate-100 text-slate-600 border-slate-300';
      case 'FUTURE':
        return 'bg-slate-50 text-slate-400 border-slate-200';
      case 'PENDING':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'APPROVED':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'REJECTED':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${getBadgeStyle()}`}>
        {status}
      </span>
      {type === 'MANUAL' && (
        <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-blue-50 text-blue-700 border border-blue-200">
          Manual
        </span>
      )}
    </div>
  );
};
