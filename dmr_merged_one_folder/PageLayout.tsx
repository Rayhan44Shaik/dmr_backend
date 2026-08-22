// D:\Development\DMR-Poultries-ERP\frontend\dmr-poultries-web\src\components\common\PageLayout.tsx

import React from "react";

export type PageLayoutProps = {
  children: React.ReactNode;
  className?: string;
};

export default function PageLayout({ children, className = "" }: PageLayoutProps) {
  return (
    <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 ${className}`}>
      <div className="space-y-6">
        {children}
      </div>
    </div>
  );
}