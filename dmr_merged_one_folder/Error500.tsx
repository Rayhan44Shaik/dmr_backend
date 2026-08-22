import React from 'react';

export const Error500: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-screen text-center">
      <h1 className="text-6xl font-bold text-slate-800">500</h1>
      <p className="text-lg text-slate-600 mt-2">Internal Server Error</p>
      <p className="text-sm text-slate-500">Something went wrong. Please try again later.</p>
    </div>
  );
};