import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  /** Softly animate the card in. */
  animate?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = "", animate = false }) => {
  return (
    <div
      className={`rounded-xl border border-slate-200/80 bg-white shadow-card ${animate ? "animate-fade-in-up" : ""} ${className}`}
    >
      {children}
    </div>
  );
};
