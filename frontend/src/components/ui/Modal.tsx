import React from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';
import { useTheme } from '../../context/ThemeContext';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  showCloseButton?: boolean;
}

export const Modal = React.forwardRef<HTMLDivElement, ModalProps>(
  (
    {
      isOpen,
      onClose,
      title,
      children,
      footer,
      maxWidth = 'md',
      className = '',
      showCloseButton = true,
    },
    ref
  ) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    if (!isOpen) return null;

    const maxWidthClasses = {
      sm: 'max-w-sm',
      md: 'max-w-md',
      lg: 'max-w-lg',
      xl: 'max-w-xl',
      '2xl': 'max-w-2xl',
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal Content */}
        <div
          ref={ref}
          className={`relative rounded-2xl w-full ${maxWidthClasses[maxWidth]} mx-4 overflow-hidden ${className} ${
            isDark
              ? 'bg-[#1a1f2e] border border-white/10 shadow-2xl'
              : 'bg-white border border-gray-200 shadow-2xl'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          {(title || showCloseButton) && (
            <div className={`flex items-center justify-between p-4 ${isDark ? 'border-b border-white/10' : 'border-b border-gray-200'}`}>
              {title && <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{title}</h3>}
              {!title && <div />}
              {showCloseButton && (
                <IconButton
                  icon={X}
                  variant="ghost"
                  size="md"
                  onClick={onClose}
                  tooltip="Close"
                />
              )}
            </div>
          )}

          {/* Body */}
          <div className={`p-4 max-h-[70vh] overflow-auto ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className={`flex items-center justify-end gap-3 p-4 ${isDark ? 'border-t border-white/10' : 'border-t border-gray-200'}`}>
              {footer}
            </div>
          )}
        </div>
      </div>
    );
  }
);

Modal.displayName = 'Modal';

// Confirmation Modal Variant
export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDangerous = false,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const cancelBtnClass = isDark
    ? 'px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-white/10 transition-colors'
    : 'px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors';

  const confirmBtnClass = isDangerous
    ? 'px-4 py-2 rounded-lg text-sm text-white font-medium transition-colors bg-red-600 hover:bg-red-500'
    : 'px-4 py-2 rounded-lg text-sm text-white font-medium transition-colors bg-indigo-600 hover:bg-indigo-500';

  const messageClass = isDark ? 'text-sm text-gray-300' : 'text-sm text-gray-700';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="md"
      footer={
        <>
          <button onClick={onClose} className={cancelBtnClass}>
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={confirmBtnClass}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <p className={messageClass}>{message}</p>
    </Modal>
  );
};
