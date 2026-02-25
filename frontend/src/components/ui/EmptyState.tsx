import React from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * EmptyState - Standardized empty state component
 * Displays when no data is available with optional icon, message, and action button
 */
export interface EmptyStateProps {
  /** Icon component to display (optional) */
  icon?: LucideIcon | React.ReactNode;
  /** Icon as emoji string (e.g., "📭") - used when icon prop is string */
  emoji?: string;
  /** Primary message/title */
  title?: string;
  /** Secondary description (optional) */
  description?: string;
  /** Action button text (optional) */
  actionText?: string;
  /** Action button callback (optional) */
  onAction?: () => void;
  /** Additional CSS classes for the container */
  className?: string;
  /** Icon size (sm/md/lg) */
  iconSize?: 'sm' | 'md' | 'lg';
  /** Theme variant (light/dark) */
  variant?: 'light' | 'dark';
  /** Padding amount (sm/md/lg) */
  padding?: 'sm' | 'md' | 'lg';
  /** Full height container */
  fullHeight?: boolean;
}

export const EmptyState = React.forwardRef<
  HTMLDivElement,
  EmptyStateProps
>(
  (
    {
      icon,
      emoji,
      title = 'No data found',
      description,
      actionText,
      onAction,
      className = '',
      iconSize = 'md',
      variant = 'dark',
      padding = 'md',
      fullHeight = true,
    },
    ref
  ) => {
    // Size mappings
    const iconSizeClasses = {
      sm: 'w-12 h-12',
      md: 'w-16 h-16',
      lg: 'w-20 h-20',
    };

    const emojiSize = {
      sm: 'text-3xl',
      md: 'text-5xl',
      lg: 'text-6xl',
    };

    const paddingClasses = {
      sm: 'p-4',
      md: 'p-8',
      lg: 'p-12',
    };

    const bgClasses = variant === 'dark' ? 'bg-[#0B0F19]/50' : 'bg-gray-50';
    const borderClasses =
      variant === 'dark'
        ? 'border-[#2a2f3e]'
        : 'border-gray-200';
    const textClasses = variant === 'dark' ? 'text-gray-400' : 'text-gray-600';
    const titleClasses =
      variant === 'dark' ? 'text-gray-200' : 'text-gray-900';
    const iconBgClasses =
      variant === 'dark'
        ? 'bg-indigo-500/10 border-indigo-500/20'
        : 'bg-blue-50 border-blue-200';

    const containerHeight = fullHeight ? 'min-h-[400px]' : '';

    return (
      <div
        ref={ref}
        className={`flex flex-col items-center justify-center text-center rounded-xl border ${borderClasses} ${bgClasses} ${paddingClasses[padding]} ${containerHeight} ${className}`}
      >
        {/* Icon or Emoji */}
        {emoji ? (
          <div className={`${emojiSize[iconSize]} mb-4`}>{emoji}</div>
        ) : icon ? (
          React.isValidElement(icon) ? (
            icon
          ) : (
            <div
              className={`${iconSizeClasses[iconSize]} rounded-lg ${iconBgClasses} border flex items-center justify-center mb-4 flex-shrink-0`}
            >
              {React.createElement(icon as React.ComponentType<{ className: string }>, {
                className: 'w-6 h-6 text-indigo-400',
              })}
            </div>
          )
        ) : null}

        {/* Title */}
        {title && (
          <h3 className={`text-lg font-semibold ${titleClasses} mb-2`}>
            {title}
          </h3>
        )}

        {/* Description */}
        {description && (
          <p className={`text-sm ${textClasses} mb-6 max-w-sm`}>
            {description}
          </p>
        )}

        {/* Action Button */}
        {actionText && onAction && (
          <button
            onClick={onAction}
            className={`px-6 py-2 rounded-lg font-medium transition-all duration-200 ${
              variant === 'dark'
                ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/30'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {actionText}
          </button>
        )}
      </div>
    );
  }
);

EmptyState.displayName = 'EmptyState';

/**
 * TableEmptyState - Specialized empty state for table contexts
 * Uses more compact styling suitable for table containers
 */
export interface TableEmptyStateProps extends Omit<EmptyStateProps, 'padding' | 'fullHeight'> {
  /** Whether this is a table footer or standalone */
  isTableFooter?: boolean;
}

export const TableEmptyState = React.forwardRef<
  HTMLDivElement,
  TableEmptyStateProps
>(
  (
    {
      emoji = '📭',
      title = 'No data available',
      description,
      actionText,
      onAction,
      className = '',
      variant = 'light',
      isTableFooter = false,
      ...props
    },
    ref
  ) => {
    const bgClass = variant === 'dark' ? 'bg-[#0B0F19]/50' : 'bg-white';
    const borderClass = variant === 'dark' ? 'border-t border-[#2a2f3e]' : 'border-t border-gray-200';
    
    const containerClass = isTableFooter
      ? `${bgClass} ${borderClass} py-8`
      : 'min-h-[300px]';

    return (
      <div ref={ref} className={`${containerClass} ${className}`}>
        <EmptyState
          emoji={emoji}
          title={title}
          description={description}
          actionText={actionText}
          onAction={onAction}
          variant={variant}
          padding="md"
          fullHeight={!isTableFooter}
          className="border-0 bg-transparent"
          {...props}
        />
      </div>
    );
  }
);

TableEmptyState.displayName = 'TableEmptyState';

/**
 * ListEmptyState - Specialized empty state for list containers
 * Useful for showing when a list/feed has no items
 */
export interface ListEmptyStateProps extends Omit<EmptyStateProps, 'padding'> {
  /** Show a secondary action link (optional) */
  secondaryActionText?: string;
  /** Secondary action callback */
  onSecondaryAction?: () => void;
}

export const ListEmptyState = React.forwardRef<
  HTMLDivElement,
  ListEmptyStateProps
>(
  (
    {
      emoji = '📋',
      title = 'Nothing here yet',
      description,
      actionText,
      onAction,
      secondaryActionText,
      onSecondaryAction,
      className = '',
      variant = 'dark',
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={`flex flex-col items-center justify-center py-12 text-center ${className}`}
      >
        <EmptyState
          emoji={emoji}
          title={title}
          description={description}
          actionText={actionText}
          onAction={onAction}
          variant={variant}
          padding="md"
          fullHeight={false}
          className="border-0 bg-transparent"
          {...props}
        />

        {/* Secondary Action Link */}
        {secondaryActionText && onSecondaryAction && (
          <button
            onClick={onSecondaryAction}
            className={`mt-4 text-sm font-medium transition-colors ${
              variant === 'dark'
                ? 'text-indigo-400 hover:text-indigo-300'
                : 'text-blue-600 hover:text-blue-700'
            }`}
          >
            {secondaryActionText}
          </button>
        )}
      </div>
    );
  }
);

ListEmptyState.displayName = 'ListEmptyState';
