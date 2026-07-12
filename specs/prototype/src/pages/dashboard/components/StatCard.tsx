import { type ReactNode } from 'react';

interface StatCardProps {
  icon: string;
  label: string;
  value: string | number;
  subtitle?: string;
  accent?: 'primary' | 'accent' | 'secondary' | 'amber' | 'red';
  progress?: number;
  progressColor?: 'primary' | 'accent' | 'secondary';
  onClick?: () => void;
  children?: ReactNode;
}

const accentMap = {
  primary: { bg: 'bg-primary-100', text: 'text-primary-600', dot: 'bg-primary-500' },
  accent: { bg: 'bg-accent-100', text: 'text-accent-600', dot: 'bg-accent-500' },
  secondary: { bg: 'bg-secondary-100', text: 'text-secondary-600', dot: 'bg-secondary-500' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-600', dot: 'bg-amber-500' },
  red: { bg: 'bg-red-100', text: 'text-red-600', dot: 'bg-red-500' },
};

const progressMap = {
  primary: 'bg-primary-500',
  accent: 'bg-accent-500',
  secondary: 'bg-secondary-500',
};

export default function StatCard({
  icon,
  label,
  value,
  subtitle,
  accent = 'primary',
  progress,
  progressColor = 'primary',
  onClick,
  children,
}: StatCardProps) {
  const a = accentMap[accent];
  const p = progressMap[progressColor];

  const Comp = onClick ? 'button' : 'div';
  const compProps = onClick
    ? {
        onClick,
        className: `rounded-xl border border-background-200 bg-background-50 p-4 text-left transition-colors cursor-pointer hover:border-background-300 w-full`,
      }
    : {
        className: `rounded-xl border border-background-200 bg-background-50 p-4`,
      };

  return (
    <Comp {...compProps}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 rounded-lg ${a.bg} flex items-center justify-center`}>
          <i className={`${icon} text-sm ${a.text}`}></i>
        </div>
        <span className="text-xs font-medium text-foreground-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-heading font-bold text-foreground-950">{value}</p>
      {subtitle && (
        <p className="text-[11px] text-foreground-400 mt-0.5">{subtitle}</p>
      )}
      {progress !== undefined && (
        <div className="mt-2 h-1.5 w-full rounded-full bg-background-200 overflow-hidden">
          <div
            className={`h-full rounded-full ${p} transition-all duration-500`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          ></div>
        </div>
      )}
      {children}
    </Comp>
  );
}