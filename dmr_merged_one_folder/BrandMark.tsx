// src/ui/BrandMark.tsx

interface BrandMarkProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: { box: "h-8 w-8 rounded-lg text-[13px]" },
  md: { box: "h-9 w-9 rounded-[10px] text-[15px]" },
  lg: { box: "h-11 w-11 rounded-xl text-[18px]" },
} as const;

/** DMR Poultries brand mark — modern emerald → teal gradient "DM" monogram tile. */
export default function BrandMark({ size = "md", className = "" }: BrandMarkProps) {
  const s = sizes[size];
  return (
    <div
      className={`relative shrink-0 select-none ${s.box} ${className}`}
      aria-hidden="true"
    >
      {/* Gradient tile */}
      <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 shadow-lg shadow-emerald-900/25 ring-1 ring-inset ring-white/20 dark:ring-emerald-300/20" />

      {/* Glass sheen */}
      <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-tr from-transparent via-white/10 to-white/40" />

      {/* Monogram */}
      <span className="absolute inset-0 flex items-center justify-center gap-px font-black tracking-tighter text-white [text-shadow:0_1px_2px_rgb(2_44_34_/_0.45)]">
        DM
      </span>

      {/* Accent dot */}
      <span className="absolute right-[2px] top-[2px] h-2 w-2 rounded-full bg-lime-300 ring-2 ring-white/70 dark:ring-emerald-950/50" />
    </div>
  );
}