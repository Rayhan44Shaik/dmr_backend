import React from "react";
import {
  paginationBarClass,
  paginationNavBtnClass,
  paginationPageBtnClass,
  shouldShowPagination,
} from "../../../../shared/ui/paginationStyles";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  itemsPerPage?: number;
  totalItems?: number;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage,
}) => {
  if (!shouldShowPagination(totalItems ?? 0)) return null;

  const getPageNumbers = (): number[] => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, currentPage + 2);

    if (end - start < maxVisible - 1) {
      if (start === 1) end = Math.min(totalPages, start + maxVisible - 1);
      else if (end === totalPages) start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  void totalItems;
  void itemsPerPage;

  return (
    <div className={paginationBarClass}>
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className={paginationNavBtnClass}
      >
        Previous
      </button>

      {getPageNumbers().map((page) => (
        <button
          type="button"
          key={page}
          onClick={() => onPageChange(page)}
          className={paginationPageBtnClass(page === currentPage)}
        >
          {page}
        </button>
      ))}

      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className={paginationNavBtnClass}
      >
        Next
      </button>
    </div>
  );
};

export default React.memo(Pagination);
