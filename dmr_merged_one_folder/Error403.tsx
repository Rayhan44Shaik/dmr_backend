import React from 'react';

export const Error403: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-screen text-center">
      <h1 className="text-6xl font-bold text-slate-800">403</h1>
      <p className="text-lg text-slate-600 mt-2">Access Denied</p>
      <p className="text-sm text-slate-500">You do not have permission to view this page.</p>
    </div>
  );
};