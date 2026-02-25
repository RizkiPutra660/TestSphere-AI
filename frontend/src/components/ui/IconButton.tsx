import React from 'react';
import { X, Trash2, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

/**
 * IconButton Component Library
 * 
 * Provides icon-only buttons with consistent styling across the application.
 * Useful for delete, edit, close, add, and other icon-based actions.
 */

export type IconButtonVariant = 'default' | 'ghost' | 'primary' | 'destructive' | 'success';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Icon component (Lucide React icon) */
  icon: LucideIcon;
  /** Button variant */
  variant?: IconButtonVariant;
  /** Button size */
  size?: IconButtonSize;
  /** Tooltip/title text shown on hover */
  tooltip?: string;
  /** Additional CSS classes */
  className?: string;
  /** Whether button is disabled */
  disabled?: boolean;
  /** Click handler */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * IconButton - Icon-only button with consistent styling
 * 
 * Usage:
 * ```tsx
 * <IconButton icon={Trash2} variant="destructive" onClick={handleDelete} tooltip="Delete" />
 * <IconButton icon={X} variant="ghost" size="sm" onClick={handleClose} />
 * <IconButton icon={Plus} variant="primary" size="lg" onClick={handleAdd} />
 * ```
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon: Icon,
      variant = 'default',
      size = 'md',
      tooltip,
      className = '',
      disabled = false,
      onClick,
      ...props
    },
    ref
  ) => {
    // Size classes
    const sizeClasses = {
      sm: 'w-7 h-7 p-1.5',
      md: 'w-8 h-8 p-2',
      lg: 'w-10 h-10 p-2.5',
    };

    // Icon size classes
    const iconSizeClasses = {
      sm: 'w-3.5 h-3.5',
      md: 'w-4 h-4',
      lg: 'w-5 h-5',
    };

    const { theme } = useTheme();
    const isDark = theme === 'dark';

    // Variant styles
    const variantClasses = isDark
      ? {
          default: 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white',
          ghost: 'bg-transparent text-gray-300 hover:bg-white/5 hover:text-white',
          primary: 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 border border-indigo-500/30',
          destructive: 'bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 border border-red-500/30',
          success: 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 border border-emerald-500/30',
        }
      : {
          default: 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900',
          ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900',
          primary: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200',
          destructive: 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200',
          success: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200',
        };

    // Disabled state
    const disabledClasses = disabled
      ? isDark
        ? 'opacity-50 cursor-not-allowed hover:bg-white/5 hover:text-gray-300'
        : 'opacity-50 cursor-not-allowed hover:bg-gray-100 hover:text-gray-600'
      : '';

    const baseClasses = `rounded-lg flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
      isDark ? 'focus:ring-offset-[#0B0F19]' : 'focus:ring-offset-white'
    }`;

    return (
      <button
        ref={ref}
        disabled={disabled}
        onClick={onClick}
        title={tooltip}
        className={`
          ${baseClasses}
          ${sizeClasses[size]}
          ${disabled ? disabledClasses : variantClasses[variant]}
          ${className}
        `}
        {...props}
      >
        <Icon className={iconSizeClasses[size]} />
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';

/**
 * IconButtonGroup - Grouped icon buttons with spacing
 * Useful for action bars with multiple icon buttons
 */
export interface IconButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Children (typically IconButton components) */
  children: React.ReactNode;
  /** Spacing between buttons */
  spacing?: 'xs' | 'sm' | 'md' | 'lg';
  /** Layout direction */
  direction?: 'row' | 'column';
  /** Additional CSS classes */
  className?: string;
}

const spacingClasses = {
  xs: 'gap-1',
  sm: 'gap-1.5',
  md: 'gap-2',
  lg: 'gap-3',
};

const directionClasses = {
  row: 'flex-row',
  column: 'flex-col',
};

export const IconButtonGroup = React.forwardRef<HTMLDivElement, IconButtonGroupProps>(
  (
    {
      children,
      spacing = 'md',
      direction = 'row',
      className = '',
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={`flex ${directionClasses[direction]} ${spacingClasses[spacing]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

IconButtonGroup.displayName = 'IconButtonGroup';

/**
 * CloseButton - Specialized close icon button
 * Common pattern in modals and panels
 */
export interface CloseButtonProps extends Omit<IconButtonProps, 'icon'> {
  /** Optional custom onClick handler */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export const CloseButton = React.forwardRef<HTMLButtonElement, CloseButtonProps>(
  (
    {
      variant = 'ghost',
      size = 'md',
      onClick,
      disabled = false,
      ...props
    },
    ref
  ) => {
    return (
      <IconButton
        ref={ref}
        icon={X}
        variant={variant}
        size={size}
        onClick={onClick}
        disabled={disabled}
        tooltip={disabled ? 'Locked' : 'Close'}
        {...props}
      />
    );
  }
);

CloseButton.displayName = 'CloseButton';

/**
 * DeleteButton - Specialized delete icon button
 * Destructive variant for delete actions
 */
export interface DeleteButtonProps extends Omit<IconButtonProps, 'icon'> {
  /** Optional custom onClick handler */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export const DeleteButton = React.forwardRef<HTMLButtonElement, DeleteButtonProps>(
  (
    {
      variant = 'destructive',
      size = 'md',
      onClick,
      tooltip = 'Delete',
      disabled = false,
      ...props
    },
    ref
  ) => {
    return (
      <IconButton
        ref={ref}
        icon={Trash2}
        variant={variant}
        size={size}
        onClick={onClick}
        tooltip={disabled ? 'Locked while running' : tooltip}
        disabled={disabled}
        {...props}
      />
    );
  }
);

DeleteButton.displayName = 'DeleteButton';

/**
 * AddButton - Specialized add icon button
 * Primary variant for add/create actions
 */
export interface AddButtonProps extends Omit<IconButtonProps, 'icon'> {
  /** Optional custom onClick handler */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export const AddButton = React.forwardRef<HTMLButtonElement, AddButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      onClick,
      tooltip = 'Add',
      disabled = false,
      ...props
    },
    ref
  ) => {
    return (
      <IconButton
        ref={ref}
        icon={Plus}
        variant={variant}
        size={size}
        onClick={onClick}
        tooltip={tooltip}
        disabled={disabled}
        {...props}
      />
    );
  }
);

AddButton.displayName = 'AddButton';
