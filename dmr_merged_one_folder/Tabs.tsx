import React, { useState } from "react";

interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  onChange?: (id: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, defaultTab, onChange }) => {
  const [activeId, setActiveId] = useState(defaultTab || tabs[0]?.id);
  const activeTab = tabs.find((t) => t.id === activeId);

  return (
    <div>
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveId(tab.id);
              onChange?.(tab.id);
            }}
            className={`relative px-3.5 py-2 text-[13px] font-medium transition-colors ${
              activeId === tab.id
                ? "text-brand-700 dark:text-brand-300"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {tab.label}
            {activeId === tab.id && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />
            )}
          </button>
        ))}
      </div>
      <div className="pt-4">{activeTab?.content}</div>
    </div>
  );
};
