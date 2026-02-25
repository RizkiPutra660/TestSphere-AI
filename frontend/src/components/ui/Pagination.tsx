import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * SimplePagination - Basic previous/next navigation
 * Ideal for centered layouts with minimal pagination info
 */
export interface SimplePaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export const SimplePagination = React.forwardRef<
  HTMLDivElement,
  SimplePaginationProps
>(({ currentPage, totalPages, onPageChange, disabled }, ref) => {
  return (
    <div
      ref={ref}
      className="flex items-center justify-center gap-4"
    >
      <button
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1 || disabled}
        className="px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 text-sm font-medium transition-all hover:bg-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-600/10 disabled:text-gray-500 disabled:border-gray-600/30"
        aria-label="Previous page"
      >
        ← Previous
      </button>

      <span className="text-sm text-gray-400 font-medium min-w-[120px] text-center">
        Page {currentPage} of {totalPages}
      </span>

      <button
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages || disabled}
        className="px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 text-sm font-medium transition-all hover:bg-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-600/10 disabled:text-gray-500 disabled:border-gray-600/30"
        aria-label="Next page"
      >
        Next →
      </button>
    </div>
  );
});

SimplePagination.displayName = 'SimplePagination';

/**
 * CompactPagination - Horizontal layout with info + buttons
 * Ideal for table footers and compact spaces
 */
export interface CompactPaginationProps {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  variant?: 'light' | 'dark';
}

export const CompactPagination = React.forwardRef<
  HTMLDivElement,
  CompactPaginationProps
>(({ currentPage, totalItems, itemsPerPage, onPageChange, disabled, variant = 'dark' }, ref) => {
  const canNextPage = currentPage * itemsPerPage < totalItems;

  const isDark = variant === 'dark';
  const infoBgClass = isDark ? 'bg-[#0B0F19]' : 'bg-white';
  const infoTextClass = isDark ? 'text-[#9CA3AF]' : 'text-gray-600';
  const buttonBgClass = isDark ? 'bg-[#007BFF]' : 'bg-blue-600';
  const buttonHoverClass = isDark ? 'hover:bg-[#0056b3]' : 'hover:bg-blue-700';
  const buttonDisabledClass = isDark ? 'disabled:bg-[#6c757d]' : 'disabled:bg-gray-400';

  return (
    <div
      ref={ref}
      className={`flex items-center justify-between px-4 py-3 border-t border-gray-200 ${infoBgClass}`}
    >
      <div className={`text-sm ${infoTextClass}`}>
        Showing {Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)} to{' '}
        {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} items
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1 || disabled}
          className={`flex items-center gap-2 ${buttonBgClass} text-white px-4 py-2 rounded transition-all duration-200 ${buttonHoverClass} ${buttonDisabledClass} disabled:cursor-not-allowed disabled:opacity-50`}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!canNextPage || disabled}
          className={`flex items-center gap-2 ${buttonBgClass} text-white px-4 py-2 rounded transition-all duration-200 ${buttonHoverClass} ${buttonDisabledClass} disabled:cursor-not-allowed disabled:opacity-50`}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});

CompactPagination.displayName = 'CompactPagination';

/**
 * AdvancedPagination - Full-featured pagination with page numbers
 * Ideal for complex data tables with multiple navigation options
 */
export interface AdvancedPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage?: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange?: (itemsPerPage: number) => void;
  disabled?: boolean;
  showPageNumbers?: boolean;
  variant?: 'light' | 'dark';
}

export const AdvancedPagination = React.forwardRef<
  HTMLDivElement,
  AdvancedPaginationProps
>(
  (
    {
      currentPage,
      totalPages,
      totalItems,
      itemsPerPage = 10,
      onPageChange,
      onItemsPerPageChange,
      disabled,
      showPageNumbers = true,
      variant = 'light',
    },
    ref
  ) => {
    const isDark = variant === 'dark';

    // Calculate range of pages to show (always show 5 or fewer page buttons)
    const getPageNumbers = () => {
      const pages: number[] = [];
      const maxPagesToShow = 5;

      if (totalPages <= maxPagesToShow) {
        for (let i = 1; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        let startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

        if (endPage - startPage < maxPagesToShow - 1) {
          startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
          pages.push(i);
        }
      }

      return pages;
    };

    const pageNumbers = showPageNumbers ? getPageNumbers() : [];
    const indexOfFirstRow = (currentPage - 1) * itemsPerPage + 1;
    const indexOfLastRow = Math.min(currentPage * itemsPerPage, totalItems);

    // Theme classes
    const containerBgClass = isDark ? 'bg-white' : 'bg-gray-50';
    const textColorClass = isDark ? 'text-gray-700' : 'text-gray-500';
    const buttonBgClass = isDark ? 'bg-white' : 'bg-white';
    const buttonBgHoverClass = isDark ? 'hover:bg-gray-50' : 'hover:bg-gray-50';
    const buttonActiveBgClass = isDark ? 'bg-blue-50' : 'bg-blue-50';
    const buttonActiveBorderClass = isDark ? 'border-blue-500' : 'border-blue-500';
    const buttonActiveTextClass = isDark ? 'text-blue-600' : 'text-blue-600';
    const borderColorClass = isDark ? 'border-gray-300' : 'border-gray-300';

    return (
      <div ref={ref} className={`border-t ${borderColorClass} px-4 py-3 flex items-center justify-between sm:px-6 ${containerBgClass}`}>
        {/* Mobile view - Simple prev/next */}
        <div className="flex-1 flex justify-between sm:hidden gap-2">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1 || disabled}
            className={`relative inline-flex items-center px-4 py-2 border ${borderColorClass} text-sm font-medium rounded-md ${buttonBgClass} ${textColorClass} ${buttonBgHoverClass} disabled:opacity-50 disabled:cursor-not-allowed`}
            aria-label="Previous page"
          >
            Previous
          </button>
          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages || disabled}
            className={`relative inline-flex items-center px-4 py-2 border ${borderColorClass} text-sm font-medium rounded-md ${buttonBgClass} ${textColorClass} ${buttonBgHoverClass} disabled:opacity-50 disabled:cursor-not-allowed`}
            aria-label="Next page"
          >
            Next
          </button>
        </div>

        {/* Desktop view - Full pagination controls */}
        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
          {/* Info section */}
          <div className="flex items-center gap-4">
            <p className={`text-sm ${textColorClass}`}>
              Showing <span className="font-medium">{indexOfFirstRow}</span> to{' '}
              <span className="font-medium">{indexOfLastRow}</span> of{' '}
              <span className="font-medium">{totalItems}</span> results
            </p>

            {/* Items per page selector */}
            {onItemsPerPageChange && (
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  onItemsPerPageChange(Number(e.target.value));
                  onPageChange(1); // Reset to page 1 when changing items per page
                }}
                disabled={disabled}
                className={`text-sm border ${borderColorClass} rounded-md focus:ring-blue-500 focus:border-blue-500 px-2 py-1 ${containerBgClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                aria-label="Items per page"
              >
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
            )}
          </div>

          {/* Navigation */}
          <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
            {/* Previous button */}
            <button
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1 || disabled}
              className={`relative inline-flex items-center px-2 py-2 rounded-l-md border ${borderColorClass} ${buttonBgClass} text-sm font-medium ${textColorClass} ${buttonBgHoverClass} disabled:opacity-50 disabled:cursor-not-allowed`}
              aria-label="Previous page"
            >
              <span className="sr-only">Previous</span>
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>

            {/* Page number buttons */}
            {pageNumbers.map((pageNum, index) => (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                aria-current={currentPage === pageNum ? 'page' : undefined}
                disabled={disabled}
                className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                  currentPage === pageNum
                    ? `z-10 ${buttonActiveBgClass} ${buttonActiveBorderClass} ${buttonActiveTextClass}`
                    : `${buttonBgClass} ${borderColorClass} ${textColorClass} ${buttonBgHoverClass}`
                } disabled:opacity-50 disabled:cursor-not-allowed ${index === 0 ? 'rounded-none' : ''} ${index === pageNumbers.length - 1 ? 'rounded-none' : ''}`}
              >
                {pageNum}
              </button>
            ))}

            {/* Next button */}
            <button
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages || disabled}
              className={`relative inline-flex items-center px-2 py-2 rounded-r-md border ${borderColorClass} ${buttonBgClass} text-sm font-medium ${textColorClass} ${buttonBgHoverClass} disabled:opacity-50 disabled:cursor-not-allowed`}
              aria-label="Next page"
            >
              <span className="sr-only">Next</span>
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </nav>
        </div>
      </div>
    );
  }
);

AdvancedPagination.displayName = 'AdvancedPagination';
