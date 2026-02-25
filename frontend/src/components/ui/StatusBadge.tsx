import React from 'react';

export type BadgeVariant = 'default' | 'success' | 'destructive' | 'outline' | 'warning' | 'info';

export type TestStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'unknown';

export type QueueStatus = 'pending' | 'running' | 'done' | 'failed';

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  status?: TestStatus | QueueStatus;
  children: React.ReactNode;
  className?: string;
}

export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ variant, status, children, className = '', ...props }, ref) => {
    // If status is provided, determine variant from status
    let badgeClasses = '';
    
    if (status) {
      // Map test statuses
      if (status === 'passed') {
        badgeClasses = 'bg-green-500/10 text-green-300 border-green-500/20';
      } else if (status === 'failed') {
        badgeClasses = 'bg-red-500/10 text-red-300 border-red-500/20';
      } else if (status === 'timedOut') {
        badgeClasses = 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20';
      } else if (status === 'skipped' || status === 'unknown') {
        badgeClasses = 'bg-gray-500/10 text-gray-300 border-gray-500/20';
      } else if (status === 'pending') {
        badgeClasses = 'bg-orange-500/10 text-orange-300 border-orange-500/20';
      } else if (status === 'running') {
        badgeClasses = 'bg-blue-500/10 text-blue-300 border-blue-500/20';
      } else if (status === 'done') {
        badgeClasses = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
      }
    } else if (variant) {
      // Map variants
      const variants = {
        default: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        success: 'bg-green-500/10 text-green-300 border-green-500/20',
        destructive: 'bg-red-500/10 text-red-400 border-red-500/20',
        outline: 'text-gray-400 border-white/10',
        warning: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
        info: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
      };
      badgeClasses = variants[variant];
    } else {
      // Default fallback
      badgeClasses = 'bg-white/5 text-gray-300 border-gray-800';
    }

    return (
      <span
        ref={ref}
        className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium border ${badgeClasses} ${className}`}
        {...props}
      >
        {children}
      </span>
    );
  }
);

StatusBadge.displayName = 'StatusBadge';
