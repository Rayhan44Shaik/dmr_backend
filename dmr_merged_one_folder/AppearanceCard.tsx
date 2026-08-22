import React, { useEffect, useState } from "react";
import { Card, Button } from "../common";
import { Sun, Moon, Check } from "lucide-react";
import { useTheme } from "../../../../providers/ThemeProvider";

const FONT_SIZES = ["Small", "Medium", "Large"] as const;
type FontSize = (typeof FONT_SIZES)[number];

const FONT_SIZE_PX: Record<FontSize, string> = { Small: "15px", Medium: "16px", Large: "17px" };

function storedFontSize(): FontSize {
  try {
    const value = localStorage.getItem("dmr_font_size");
    return FONT_SIZES.includes(value as FontSize) ? (value as FontSize) : "Medium";
  } catch {
    return "Medium";
  }
}

export const AppearanceCard: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [fontSize, setFontSize] = useState<FontSize>(storedFontSize);
  const [saved, setSaved] = useState(false);

  // Apply the font-size preference to the document root.
  useEffect(() => {
    document.documentElement.style.fontSize = FONT_SIZE_PX[fontSize];
    try {
      localStorage.setItem("dmr_font_size", fontSize);
    } catch {
      /* ignore */
    }
  }, [fontSize]);

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <span className="text-base font-bold text-slate-800">Appearance</span>
        <span className="text-[11px] text-slate-400">Customise how the app looks</span>
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold text-slate-600">Theme</label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => theme === "dark" && toggleTheme()}
            className={`relative flex w-28 items-center justify-center gap-2 rounded-lg border py-2.5 text-xs font-semibold transition-colors ${
              theme === "light"
                ? "border-brand-600 bg-brand-50 text-brand-800"
                : "border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
          >
            <Sun size={15} /> Light
            {theme === "light" && <Check size={13} className="absolute right-2 top-2 text-brand-600" />}
          </button>
          <button
            type="button"
            onClick={() => theme === "light" && toggleTheme()}
            className={`relative flex w-28 items-center justify-center gap-2 rounded-lg border py-2.5 text-xs font-semibold transition-colors ${
              theme === "dark"
                ? "border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-300"
                : "border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
          >
            <Moon size={15} /> Dark
            {theme === "dark" && <Check size={13} className="absolute right-2 top-2 text-brand-600 dark:text-brand-300" />}
          </button>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold text-slate-600">Font size</label>
        <div className="flex gap-2 text-xs">
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setFontSize(size)}
              className={`flex-1 rounded-lg border py-2 transition-colors ${
                fontSize === size
                  ? "border-brand-600 bg-brand-50 font-semibold text-brand-800"
                  : "border-slate-200 text-slate-500 hover:border-slate-300"
              }`}
            >
              {size}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">This changes the font size across the application.</p>
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold text-slate-600">Brand accent</label>
        <div className="flex gap-3">
          <div className="h-7 w-7 rounded-full bg-brand-600 ring-2 ring-brand-600/30" title="DMR Emerald (active)" />
          <div className="h-7 w-7 rounded-full border border-slate-200 bg-slate-100" title="More accents coming soon" />
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
        <Button
          variant="secondary"
          onClick={() => {
            setFontSize("Medium");
            if (theme === "dark") toggleTheme();
            setSaved(false);
          }}
        >
          Reset
        </Button>
        <Button
          onClick={() => {
            setSaved(true);
            window.setTimeout(() => setSaved(false), 2000);
          }}
        >
          {saved ? "Saved ✓" : "Apply changes"}
        </Button>
      </div>
    </Card>
  );
};
