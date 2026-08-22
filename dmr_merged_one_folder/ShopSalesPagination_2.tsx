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
}

function ShopSalesPagination({ currentPage, totalPages, onPageChange }: Props) {

  // Build a window of up to 10 pages around the current page
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 10;
    const half = Math.floor(maxVisible / 2);
    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  const visiblePages = getPageNumbers();
  const showFirstEllipsis = visiblePages[0] > 1;
  const showLastEllipsis = visiblePages[visiblePages.length - 1] < totalPages;

  return (
    <div className={paginationBarClass}>
      <button
        type="button"
        disabled={currentPage === 1}
        onClick={() => onPageChange(currentPage - 1)}
        className={paginationNavBtnClass}
      >
        Previous
      </button>

      {showFirstEllipsis && (
        <>
          <button type="button" onClick={() => onPageChange(1)} className={paginationPageBtnClass(false)}>
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
          <button type="button" onClick={() => onPageChange(totalPages)} className={paginationPageBtnClass(false)}>
            {totalPages}
          </button>
        </>
      )}

      <button
        type="button"
        disabled={currentPage === totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        className={paginationNavBtnClass}
      >
        Next
      </button>
    </div>
  );
}

export default React.memo(ShopSalesPagination);
