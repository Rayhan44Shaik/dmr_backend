import React from 'react';
import { Link } from 'react-router-dom';

export const Error404: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-screen text-center">
      <h1 className="text-6xl font-bold text-slate-800">404</h1>
      <p className="text-lg text-slate-600 mt-2">Page not found</p>
      <Link to="/dashboard" className="mt-4 text-blue-600 hover:underline">
        Go to Dashboard
      </Link>
    </div>
  );
};