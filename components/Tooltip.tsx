"use client";

import { ReactNode } from "react";

const SIDE_CLASSES: Record<string, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
  left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
  right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
};

export default function Tooltip({
  label,
  side = "bottom",
  className = "",
  children,
}: {
  label: string;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`relative inline-flex group/tooltip ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-white dark:text-neutral-900 bg-neutral-800 dark:bg-neutral-100 shadow-md opacity-0 scale-95 transition-all duration-100 group-hover/tooltip:opacity-100 group-hover/tooltip:scale-100 group-hover/tooltip:delay-300 ${SIDE_CLASSES[side]}`}
      >
        {label}
      </span>
    </span>
  );
}
