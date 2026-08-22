import React from 'react';

interface LoadingSkeletonProps {
  count?: number;
  type?: 'card' | 'table' | 'chart';
}

const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ count = 1, type = 'card' }) => {
  if (type === 'table') {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-10 bg-gray-200 rounded w-full"></div>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 rounded w-full"></div>
        ))}
      </div>
    );
  }

  if (type === 'chart') {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-6 bg-gray-200 rounded w-1/3"></div>
        <div className="h-48 bg-gray-100 rounded"></div>
      </div>
    );
  }

  // Default: card skeleton
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="h-4 bg-gray-200 rounded w-2/3 mb-2"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2"></div>
        </div>
      ))}
    </div>
  );
};

export default React.memo(LoadingSkeleton);