import React from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Radio,
  UserCheck,
  Clock,
  UserX,
  ArrowRight,
  ShieldCheck,
  FileQuestion,
  AlertCircle,
} from 'lucide-react';
import type { DashboardSummary } from '../../types';

interface StatsOverviewProps {
  summary: DashboardSummary | null;
  totalAssistants: number;
  onDutyCount: number;
  onShowOnDuty: () => void;
}

/**
 * Compact KPI row plus a single action banner. The two "awaiting approval" /
 * "pending request" queues are surfaced as action links rather than spent KPI
 * tiles, so the row stays on one line and reads as a stable snapshot.
 */
export const StatsOverview: React.FC<StatsOverviewProps> = ({
  summary,
  totalAssistants,
  onDutyCount,
  onShowOnDuty,
}) => {
  const pendingApproval = summary?.pending_approval ?? 0;
  const pendingManual = summary?.pending_manual_requests ?? 0;

  const cards = [
    {
      title: 'Total Field Assistants',
      value: summary?.total_assistants ?? totalAssistants,
      icon: Users,
      color: 'bg-blue-50 text-blue-800 border-blue-200 hover:border-blue-400 cursor-pointer',
      iconColor: 'text-blue-600',
      link: '/admin/employees',
    },
    {
      title: 'Currently On Duty',
      value: onDutyCount,
      icon: Radio,
      color: 'bg-emerald-50 text-emerald-950 border-emerald-300 ring-2 ring-emerald-400/50 shadow-sm cursor-pointer',
      iconColor: 'text-emerald-600 animate-pulse',
      onClick: onShowOnDuty,
    },
    {
      title: 'Present Today',
      value: summary?.present ?? 0,
      icon: UserCheck,
      color: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      iconColor: 'text-emerald-600',
    },
    {
      title: 'Late Arrivals',
      value: summary?.late ?? 0,
      icon: Clock,
      color: 'bg-amber-50 text-amber-800 border-amber-200',
      iconColor: 'text-amber-600',
    },
    {
      title: 'Absent',
      value: summary?.absent ?? 0,
      icon: UserX,
      color: 'bg-rose-50 text-rose-800 border-rose-200',
      iconColor: 'text-rose-600',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const inner = (
            <div
              onClick={card.onClick}
              className={`h-full p-4 rounded-2xl border ${card.color} shadow-sm transition-all hover:shadow-md`}
            >
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">
                  {card.title}
                </div>
                <Icon className={`w-4 h-4 ${card.iconColor}`} />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-black font-mono tracking-tight">
                {card.value}
              </div>
            </div>
          );

          if (card.link) {
            return (
              <Link key={card.title} to={card.link}>
                {inner}
              </Link>
            );
          }
          return <div key={card.title}>{inner}</div>;
        })}
      </div>

      {(pendingApproval > 0 || pendingManual > 0) && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm shrink-0">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span>Action required</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pendingApproval > 0 && (
              <Link
                to="/admin/attendance-approvals"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-900 text-xs font-bold shadow-2xs hover:bg-amber-100 transition-all"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>{pendingApproval} duty day{pendingApproval === 1 ? '' : 's'} awaiting approval</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            )}
            {pendingManual > 0 && (
              <Link
                to="/admin/manual-requests"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-900 text-xs font-bold shadow-2xs hover:bg-amber-100 transition-all"
              >
                <FileQuestion className="w-3.5 h-3.5 text-orange-600" />
                <span>{pendingManual} manual request{pendingManual === 1 ? '' : 's'} pending</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
