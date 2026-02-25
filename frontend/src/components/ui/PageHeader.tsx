import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import ThemeToggle from '../ThemeToggle';

/**
 * PageHeader Component Library
 * 
 * Provides three header variants:
 * 1. AppHeader - Application-level header with logo and user menu
 * 2. PageNavHeader - Page navigation header with breadcrumbs and actions
 * 3. SectionHeader - Section title header with gradient text and description
 */

// ============================================================================
// AppHeader - Top-level application header with branding and user menu
// ============================================================================

export interface AppHeaderProps {
  /** Logo emoji or icon */
  logo?: string;
  /** Application title */
  title?: string;
  /** User information */
  user?: {
    username?: string;
    email?: string;
  };
  /** Action buttons (e.g., logout, settings) */
  actions?: React.ReactNode;
  /** Whether header should be sticky */
  sticky?: boolean;
  /** Whether to show theme toggle button */
  showThemeToggle?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export const AppHeader = React.forwardRef<HTMLElement, AppHeaderProps>(
  ({ logo = '✨', title = 'TestSphere AI', user, actions, sticky = false, showThemeToggle = true, className = '' }, ref) => {
    const { theme } = useTheme();

    return (
      <header
        ref={ref}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 2rem',
          background: theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.03)',
          backdropFilter: 'blur(10px)',
          borderBottom: theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(15, 23, 42, 0.1)',
          ...(sticky && { position: 'sticky', top: 0, zIndex: 50 }),
        }}
        className={className}
      >
        {/* Left: Logo and Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #6366F1, #22D3EE)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
            }}
          >
            {logo}
          </span>
          <span style={{ fontSize: '1.25rem', fontWeight: 600 }}>{title}</span>
        </div>

        {/* Right: Theme Toggle, User Info and Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {showThemeToggle && <ThemeToggle />}
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #6366F1, #22D3EE)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                }}
              >
                {user.username?.charAt(0).toUpperCase() || '?'}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 500, color: theme === 'dark' ? '#fff' : '#1a1f2e' }}>
                  {user.username || 'User'}
                </div>
                {user.email && (
                  <div style={{ fontSize: '0.75rem', color: theme === 'dark' ? '#6B7280' : '#64748B' }}>
                    {user.email}
                  </div>
                )}
              </div>
            </div>
          )}
          {actions}
        </div>
      </header>
    );
  }
);

AppHeader.displayName = 'AppHeader';

// ============================================================================
// PageNavHeader - Page-level header with navigation breadcrumbs
// ============================================================================

export interface BreadcrumbItem {
  /** Breadcrumb label */
  label: string;
  /** Icon component */
  icon?: LucideIcon;
  /** Click handler */
  onClick?: () => void;
  /** Button variant */
  variant?: 'ghost' | 'primary' | 'outline';
  /** Additional CSS classes for the button */
  className?: string;
}

export interface PageNavHeaderProps {
  /** Navigation breadcrumbs */
  breadcrumbs?: BreadcrumbItem[];
  /** Page title (displayed after breadcrumbs) */
  title?: string;
  /** Title icon */
  titleIcon?: LucideIcon;
  /** Title emoji */
  titleEmoji?: string;
  /** Action buttons on the right */
  actions?: React.ReactNode;
  /** Whether header should be sticky */
  sticky?: boolean;
  /** Background style */
  background?: 'default' | 'dark' | 'blur';
  /** Additional CSS classes */
  className?: string;
  /** Maximum width container class (e.g., 'max-w-7xl') */
  maxWidth?: string;
}

export const PageNavHeader = React.forwardRef<HTMLElement, PageNavHeaderProps>(
  (
    {
      breadcrumbs = [],
      title,
      titleIcon: TitleIcon,
      titleEmoji,
      actions,
      sticky = true,
      background = 'blur',
      className = '',
      maxWidth = 'max-w-7xl',
    },
    ref
  ) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const bgStyles = {
      default: isDark ? 'bg-[#0B0F19]/80' : 'bg-white/80',
      dark: isDark ? 'bg-[#0B0F19]/70' : 'bg-white/70',
      blur: isDark ? 'bg-[#0B0F19]/80 backdrop-blur-xl' : 'bg-white/80 backdrop-blur-xl',
    };

    return (
      <header
        ref={ref}
        className={`border-b ${isDark ? 'border-white/10' : 'border-gray-200'} ${bgStyles[background]} ${
          sticky ? 'sticky top-0 z-50' : ''
        } ${className}`}
      >
        <div className={`${maxWidth} mx-auto px-6 py-4 flex items-center justify-between`}>
          <div className="flex items-center gap-4">
            {/* Breadcrumbs Navigation */}
            {breadcrumbs.length > 0 && (
              <div className="flex items-center gap-2">
                {breadcrumbs.map((crumb, index) => {
                  const Icon = crumb.icon;
                  return (
                    <React.Fragment key={index}>
                      {crumb.onClick ? (
                        <button
                          onClick={crumb.onClick}
                          className={crumb.className || `${isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'} px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2`}
                        >
                          {Icon && <Icon className="w-4 h-4" />}
                          {crumb.label}
                        </button>
                      ) : (
                        <span className={crumb.className || `${isDark ? 'text-gray-400' : 'text-gray-600'} flex items-center gap-2`}>
                          {Icon && <Icon className="w-4 h-4" />}
                          {crumb.label}
                        </span>
                      )}
                      {index < breadcrumbs.length - 1 && (
                        <span className={`select-none ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>/</span>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}

            {/* Page Title */}
            {title && (
              <>
                {breadcrumbs.length > 0 && <div className="w-px h-6 bg-white/10"></div>}
                <div className="flex items-center gap-3">
                  {titleEmoji && (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6366F1] to-[#22D3EE] flex items-center justify-center shadow-[0_0_10px_#6366F1]">
                      <span className="text-base">{titleEmoji}</span>
                    </div>
                  )}
                  {TitleIcon && !titleEmoji && (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6366F1] to-[#22D3EE] flex items-center justify-center shadow-[0_0_10px_#6366F1]">
                      <TitleIcon className="w-5 h-5 text-white" />
                    </div>
                  )}
                  <span className={`text-lg font-semibold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>{title}</span>
                </div>
              </>
            )}
          </div>

          {/* Action Buttons */}
          {actions && <div className="flex items-center gap-3">{actions}</div>}
        </div>
      </header>
    );
  }
);

PageNavHeader.displayName = 'PageNavHeader';

// ============================================================================
// SectionHeader - Section title with gradient text and description
// ============================================================================

export interface SectionHeaderProps {
  /** Section title */
  title: string;
  /** Section description/subtitle */
  description?: string;
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
  /** Spacing below header */
  spacing?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
  /** Actions/buttons to display (e.g., for centered headers with action buttons) */
  actions?: React.ReactNode;
}

export const SectionHeader = React.forwardRef<HTMLElement, SectionHeaderProps>(
  (
    {
      title,
      description,
      align = 'center',
      spacing = 'md',
      className = '',
      actions,
    },
    ref
  ) => {
    const alignmentClasses = {
      left: 'text-left',
      center: 'text-center',
      right: 'text-right',
    };

    const spacingClasses = {
      sm: 'mb-6',
      md: 'mb-10',
      lg: 'mb-12',
    };

    return (
      <header ref={ref} className={`${alignmentClasses[align]} ${spacingClasses[spacing]} ${className}`}>
        <h1
          className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400 mb-4"
        >
          {title}
        </h1>
        {description && (
          <p className={`text-gray-400 ${align === 'center' ? 'max-w-2xl mx-auto' : ''}`}>
            {description}
          </p>
        )}
        {actions && (
          <div className={`mt-6 flex ${align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'} gap-3 flex-wrap`}>
            {actions}
          </div>
        )}
      </header>
    );
  }
);

SectionHeader.displayName = 'SectionHeader';

// ============================================================================
// SimplePageHeader - Simple header with back button and title
// ============================================================================

export interface SimplePageHeaderProps {
  /** Back button label */
  backLabel?: string;
  /** Back button click handler */
  onBack?: () => void;
  /** Page title */
  title: string;
  /** Background color from theme */
  bgColor?: string;
  /** Border color from theme */
  borderColor?: string;
  /** Text color for back button */
  textColor?: string;
  /** Additional CSS classes */
  className?: string;
}

export const SimplePageHeader = React.forwardRef<HTMLElement, SimplePageHeaderProps>(
  (
    {
      backLabel = '← Back to Dashboard',
      onBack,
      title,
      bgColor = 'rgba(255, 255, 255, 0.05)',
      borderColor = 'rgba(255, 255, 255, 0.1)',
      textColor = '#9CA3AF',
      className = '',
    },
    ref
  ) => {
    return (
      <header
        ref={ref}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 2rem',
          background: bgColor,
          backdropFilter: 'blur(10px)',
          borderBottom: `1px solid ${borderColor}`,
        }}
        className={className}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                background: 'transparent',
                border: 'none',
                color: textColor,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
              }}
            >
              {backLabel}
            </button>
          )}
        </div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{title}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <ThemeToggle />
        </div>
      </header>
    );
  }
);

SimplePageHeader.displayName = 'SimplePageHeader';
