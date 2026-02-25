import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

// ============================================
// Base Card Component
// ============================================

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outlined';
  padding?: 'sm' | 'md' | 'lg';
  className?: string;
  children: React.ReactNode;
}

/**
 * Card: Basic container component with optional styling variants
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', padding = 'md', className = '', ...props }, ref) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const paddingClasses = {
      sm: 'p-3',
      md: 'p-6',
      lg: 'p-8',
    };

    const variantClasses = {
      default: isDark ? 'bg-white/5 border border-white/10' : 'bg-gray-50 border border-gray-200',
      elevated: isDark ? 'bg-white/10 border border-white/20 shadow-lg' : 'bg-white border border-gray-200 shadow-md',
      outlined: isDark ? 'bg-transparent border border-white/10' : 'bg-transparent border border-gray-300',
    };

    return (
      <div
        ref={ref}
        className={`rounded-xl transition-all ${paddingClasses[padding]} ${variantClasses[variant]} ${className}`}
        {...props}
      />
    );
  }
);
Card.displayName = 'Card';

// ============================================
// StatCard Component
// ============================================

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  emoji?: string;
  label: string;
  value: string | number;
  trend?: {
    direction: 'up' | 'down';
    percentage: number;
  };
  variant?: 'neutral' | 'success' | 'error' | 'warning' | 'info';
  showHeader?: boolean;
  headerText?: string;
}

/**
 * StatCard: Displays statistics with icon/emoji, label, and value
 * Perfect for summary sections
 */
export const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  (
    {
      icon: Icon,
      emoji,
      label,
      value,
      trend,
      variant = 'neutral',
      showHeader = true,
      headerText = 'All time',
      className = '',
      ...props
    },
    ref
  ) => {
    const variantClasses = {
      neutral: { bg: 'bg-white/5', border: 'border-white/10', icon: 'bg-white/10' },
      success: { bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', icon: 'bg-emerald-500/10' },
      error: { bg: 'bg-red-500/5', border: 'border-red-500/20', icon: 'bg-red-500/10' },
      warning: { bg: 'bg-yellow-500/5', border: 'border-yellow-500/20', icon: 'bg-yellow-500/10' },
      info: { bg: 'bg-indigo-500/5', border: 'border-indigo-500/20', icon: 'bg-indigo-500/10' },
    };

    const variantStyle = variantClasses[variant];
    const trendColor = trend?.direction === 'up' ? 'text-emerald-400' : 'text-red-400';

    return (
      <div
        ref={ref}
        className={`rounded-xl border backdrop-blur-sm p-6 transition-all ${variantStyle.bg} ${variantStyle.border} ${className}`}
        {...props}
      >
        {/* Header with icon and time label */}
        {showHeader && (
          <div className="flex items-center justify-between mb-4">
            {emoji ? (
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${variantStyle.icon}`}
                style={{ fontSize: '1.25rem' }}
              >
                {emoji}
              </div>
            ) : Icon ? (
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${variantStyle.icon}`}>
                <Icon className="w-5 h-5" />
              </div>
            ) : null}
            <div className="text-xs text-gray-400">{headerText}</div>
          </div>
        )}

        {/* Value */}
        <div className="text-3xl font-bold mb-1">{value}</div>

        {/* Label and trend */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-gray-400 text-sm font-medium">{label}</span>
          {trend && (
            <span className={`text-xs font-semibold ${trendColor}`}>
              {trend.direction === 'up' ? '↑' : '↓'} {trend.percentage}%
            </span>
          )}
        </div>
      </div>
    );
  }
);
StatCard.displayName = 'StatCard';

// ============================================
// InfoCard Component
// ============================================

export interface InfoCardProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  emoji?: string;
  title: string;
  description?: string;
  variant?: 'info' | 'success' | 'warning' | 'error' | 'neutral';
  actionButton?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * InfoCard: Styled information container with icon, title, and optional content
 * Perfect for alerts, informational boxes, and highlighted sections
 */
export const InfoCard = React.forwardRef<HTMLDivElement, InfoCardProps>(
  (
    {
      icon: Icon,
      emoji,
      title,
      description,
      variant = 'info',
      actionButton,
      children,
      className = '',
      ...props
    },
    ref
  ) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const variantClasses = {
      info: {
        dark: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', icon: 'text-indigo-400', title: 'text-indigo-100', desc: 'text-indigo-300' },
        light: { bg: 'bg-indigo-50', border: 'border-indigo-200', icon: 'text-indigo-600', title: 'text-indigo-900', desc: 'text-indigo-700' },
      },
      success: {
        dark: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: 'text-emerald-400', title: 'text-emerald-100', desc: 'text-emerald-300' },
        light: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-600', title: 'text-emerald-900', desc: 'text-emerald-700' },
      },
      warning: {
        dark: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', icon: 'text-yellow-400', title: 'text-yellow-100', desc: 'text-yellow-300' },
        light: { bg: 'bg-yellow-50', border: 'border-yellow-200', icon: 'text-yellow-600', title: 'text-yellow-900', desc: 'text-yellow-700' },
      },
      error: {
        dark: { bg: 'bg-red-500/10', border: 'border-red-500/30', icon: 'text-red-400', title: 'text-red-100', desc: 'text-red-300' },
        light: { bg: 'bg-red-50', border: 'border-red-200', icon: 'text-red-600', title: 'text-red-900', desc: 'text-red-700' },
      },
      neutral: {
        dark: { bg: 'bg-white/5', border: 'border-white/10', icon: 'text-gray-400', title: 'text-gray-100', desc: 'text-gray-400' },
        light: { bg: 'bg-gray-50', border: 'border-gray-200', icon: 'text-gray-600', title: 'text-gray-900', desc: 'text-gray-600' },
      },
    };

    const colors = variantClasses[variant][isDark ? 'dark' : 'light'];

    return (
      <div
        ref={ref}
        className={`rounded-xl border ${colors.bg} ${colors.border} p-4 ${className}`}
        {...props}
      >
        <div className="flex gap-3">
          {/* Icon */}
          {emoji ? (
            <div style={{ fontSize: '1.25rem', flexShrink: 0, marginTop: '0.125rem' }}>{emoji}</div>
          ) : Icon ? (
            <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${colors.icon}`} />
          ) : null}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className={`font-semibold mb-1 ${colors.title}`}>{title}</div>
            {description && <p className={`text-sm ${colors.desc}`}>{description}</p>}
            {children}
          </div>

          {/* Action Button */}
          {actionButton && <div className="flex-shrink-0 ml-2">{actionButton}</div>}
        </div>
      </div>
    );
  }
);
InfoCard.displayName = 'InfoCard';

// ============================================
// FeatureCard Component
// ============================================

export interface FeatureCardProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  emoji?: string;
  title: string;
  description: string;
  onClick?: () => void;
  isSelected?: boolean;
  isDisabled?: boolean;
}

/**
 * FeatureCard: Interactive card for feature showcase or selection
 * Perfect for feature grids, selection dialogs, etc.
 */
export const FeatureCard = React.forwardRef<HTMLDivElement, FeatureCardProps>(
  (
    {
      icon: Icon,
      emoji,
      title,
      description,
      onClick,
      isSelected = false,
      isDisabled = false,
      className = '',
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        onClick={!isDisabled ? onClick : undefined}
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !isDisabled) {
            onClick?.();
          }
        }}
        className={`group relative text-left rounded-xl border p-6 transition-all duration-200 ${
          isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        } ${
          isSelected
            ? 'bg-indigo-500/15 border-indigo-500/50 shadow-lg shadow-indigo-500/20'
            : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-indigo-500/30 hover:shadow-lg'
        } ${className}`}
        {...props}
      >
        {/* Icon/Emoji */}
        <div className="mb-4 flex items-center justify-center w-12 h-12 rounded-lg bg-white/10 group-hover:bg-indigo-500/20 transition-colors">
          {emoji ? (
            <span style={{ fontSize: '1.5rem' }}>{emoji}</span>
          ) : Icon ? (
            <Icon className="w-6 h-6 text-indigo-400" />
          ) : null}
        </div>

        {/* Content */}
        <h3 className="text-white font-semibold mb-2 group-hover:text-indigo-300 transition-colors">{title}</h3>
        <p className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">{description}</p>

        {/* Selection indicator */}
        {isSelected && (
          <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
            <svg
              className="w-3 h-3 text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        )}
      </div>
    );
  }
);
FeatureCard.displayName = 'FeatureCard';

// ============================================
// GradientCard Component
// ============================================

export interface GradientCardProps extends React.HTMLAttributes<HTMLDivElement> {
  gradientFrom: string;
  gradientTo: string;
  icon?: LucideIcon;
  emoji?: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

/**
 * GradientCard: Visually emphasized card with gradient background
 * Perfect for hero sections, featured content, and highlights
 */
export const GradientCard = React.forwardRef<HTMLDivElement, GradientCardProps>(
  (
    {
      gradientFrom,
      gradientTo,
      icon: Icon,
      emoji,
      title,
      subtitle,
      children,
      className = '',
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={`relative rounded-2xl border border-white/30 p-8 overflow-hidden backdrop-blur-md ${className}`}
        style={{
          background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
        }}
        {...props}
      >
        {/* Grid pattern overlay (optional visual effect) */}
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(90deg, transparent 24%, rgba(68, 68, 68, .05) 25%, rgba(68, 68, 68, .05) 26%, transparent 27%, transparent 74%, rgba(68, 68, 68, .05) 75%, rgba(68, 68, 68, .05) 76%, transparent 77%, transparent), linear-gradient(0deg, transparent 24%, rgba(68, 68, 68, .05) 25%, rgba(68, 68, 68, .05) 26%, transparent 27%, transparent 74%, rgba(68, 68, 68, .05) 75%, rgba(68, 68, 68, .05) 76%, transparent 77%, transparent)',
          backgroundSize: '50px 50px',
        }} />

        {/* Content */}
        <div className="relative z-10">
          {/* Icon */}
          {emoji ? (
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>{emoji}</div>
          ) : Icon ? (
            <div className="mb-4 flex items-center justify-center w-14 h-14 rounded-lg bg-white/20">
              <Icon className="w-7 h-7 text-white" />
            </div>
          ) : null}

          {/* Title & Subtitle */}
          <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
          {subtitle && <p className="text-white/80 text-sm mb-4">{subtitle}</p>}

          {/* Children */}
          {children}
        </div>
      </div>
    );
  }
);
GradientCard.displayName = 'GradientCard';
