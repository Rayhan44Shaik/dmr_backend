import React from "react";
import {
  paginationBarClass,
  paginationNavBtnClass,
  paginationPageBtnClass,
} from "../../../../shared/ui/paginationStyles";

interface Props {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  hidePageInfo?: boolean; // when true, only render navigation buttons
}

function TripPagination({ currentPage, totalPages, onPageChange, hidePageInfo = false }: Props) {
  const hasMultiplePages = totalPages > 1;

  const getPageNumbers = () => {
    const maxVisible = 5;
    const half = Math.floor(maxVisible / 2);
    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }
    const pages = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  const visiblePages = hasMultiplePages ? getPageNumbers() : [1];
  const showFirstEllipsis = hasMultiplePages && visiblePages[0] > 1;
  const showLastEllipsis = hasMultiplePages && visiblePages[visiblePages.length - 1] < totalPages;
  const atFirst = currentPage === 1;
  const atLast = currentPage === totalPages || !hasMultiplePages;

  const renderNavButtons = () => (
    <>
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={atFirst}
        className={paginationNavBtnClass}
      >
        Previous
      </button>

      {hasMultiplePages ? (
        <>
          {showFirstEllipsis && (
            <>
              <button
                type="button"
                onClick={() => onPageChange(1)}
                className={paginationPageBtnClass(currentPage === 1)}
              >
                1
              </button>
              <span className="px-1 text-slate-400">…</span>
            </>
          )}

          {visiblePages.map((page) => (
            <button
              type="button"
              key={page}
              onClick={() => onPageChange(page)}
              className={paginationPageBtnClass(page === currentPage)}
            >
              {page}
            </button>
          ))}

          {showLastEllipsis && (
            <>
              <span className="px-1 text-slate-400">…</span>
              <button
                type="button"
                onClick={() => onPageChange(totalPages)}
                className={paginationPageBtnClass(currentPage === totalPages)}
              >
                {totalPages}
              </button>
            </>
          )}
        </>
      ) : (
        <span className={paginationPageBtnClass(true)}>1</span>
      )}

      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={atLast}
        className={paginationNavBtnClass}
      >
        Next
      </button>
    </>
  );

  if (hidePageInfo) {
    return (
      <div className="flex items-center justify-end flex-wrap gap-1.5">
        {renderNavButtons()}
      </div>
    );
  }

  return (
    <div className={paginationBarClass}>
      {renderNavButtons()}
    </div>
  );
}

export default React.memo(TripPagination);
