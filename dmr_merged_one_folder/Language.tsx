import { useState } from "react";
import { Globe, Check, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";

interface LanguageOption {
  id: string;
  name: string;
  nativeName: string;
  flag: string;
  region: string;
}

const LANGUAGES: LanguageOption[] = [
  { id: "en", name: "English", nativeName: "English (US)", flag: "🇺🇸", region: "International" },
  { id: "te", name: "Telugu", nativeName: "తెలుగు", flag: "🇮🇳", region: "Regional (India)" },
];

export default function Language() {
  const [selectedLang, setSelectedLang] = useState<string>("en");
  const [enabledLocales, setEnabledLocales] = useState<Record<string, boolean>>({
    en: true,
    te: true,
  });
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const toggleLocale = (id: string) => {
    // Prevent disabling the active default language
    if (id === selectedLang && enabledLocales[id]) return;
    
    setEnabledLocales((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleSave = () => {
    setIsLoading(true);
    setIsSaved(false);

    // Simulate API save delay
    setTimeout(() => {
      setIsLoading(false);
      setIsSaved(true);

      // Hide success alert after 3 seconds
      setTimeout(() => setIsSaved(false), 3000);
    }, 600);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800 tracking-tight">
            Language & Regional Settings
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Customize default system display languages and active localization modules.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
          <Sparkles size={12} className="text-indigo-500" /> Multi-lingual ERP
        </span>
      </div>

      {/* Save Notification */}
      {isSaved && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium animate-in slide-in-from-top-2">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>Language preferences updated successfully across all system modules.</span>
        </div>
      )}

      {/* Main Content Area */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Decorative / Info Card */}
        <div className="md:col-span-4 bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-sm flex flex-col justify-between min-h-[220px]">
          <div className="space-y-3">
            <div className="h-10 w-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center text-indigo-200 border border-white/10">
              <Globe size={22} />
            </div>
            <h4 className="text-sm font-semibold text-white">System Locale Control</h4>
            <p className="text-xs text-indigo-200/80 leading-relaxed">
              Switching default language updates menus, reports, tables, and transactional notifications instantly.
            </p>
          </div>
          <div className="pt-4 border-t border-white/10 flex items-center gap-1.5 text-[11px] text-indigo-300 font-medium">
            <ShieldCheck size={14} className="text-emerald-400" /> RTL & LTR Supported
          </div>
        </div>

        {/* Right Interactive Selection */}
        <div className="md:col-span-8 space-y-6">
          {/* Default Language Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-2">
              Primary System Language
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {LANGUAGES.map((lang) => {
                const isSelected = selectedLang === lang.id;
                const isEnabled = enabledLocales[lang.id];

                return (
                  <button
                    key={lang.id}
                    type="button"
                    onClick={() => {
                      if (!isEnabled) {
                        setEnabledLocales((prev) => ({ ...prev, [lang.id]: true }));
                      }
                      setSelectedLang(lang.id);
                    }}
                    className={`relative p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                      isSelected
                        ? "border-indigo-600 bg-indigo-50/40 shadow-sm ring-1 ring-indigo-600/20"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                  >
                    <span className="text-2xl select-none leading-none pt-0.5">{lang.flag}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-800">{lang.name}</p>
                        {isSelected && (
                          <div className="h-4 w-4 rounded-full bg-indigo-600 flex items-center justify-center text-white">
                            <Check size={10} strokeWidth={3} />
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] font-medium text-slate-500 mt-0.5">{lang.nativeName}</p>
                      <span className="inline-block text-[10px] text-slate-400 mt-1">
                        {lang.region}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Locales Toggle Section */}
          <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 space-y-3">
            <div>
              <h5 className="text-xs font-semibold text-slate-700">Available System Locales</h5>
              <p className="text-[11px] text-slate-400">
                Enable locales users are allowed to toggle in their personal session bar.
              </p>
            </div>

            <div className="space-y-2 pt-1">
              {LANGUAGES.map((lang) => {
                const isEnabled = enabledLocales[lang.id];
                const isCurrentDefault = selectedLang === lang.id;

                return (
                  <div
                    key={lang.id}
                    className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200/60 shadow-2xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">{lang.flag}</span>
                      <span className="text-xs font-medium text-slate-700">
                        {lang.name} <span className="text-slate-400">({lang.nativeName})</span>
                      </span>
                      {isCurrentDefault && (
                        <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md">
                          Default
                        </span>
                      )}
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        disabled={isCurrentDefault}
                        onChange={() => toggleLocale(lang.id)}
                        className="sr-only peer"
                      />
                      <div
                        className={`w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all ${
                          isCurrentDefault
                            ? "opacity-60 cursor-not-allowed peer-checked:bg-indigo-400"
                            : "peer-checked:bg-indigo-600"
                        }`}
                      ></div>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="pt-4 border-t border-slate-100 flex justify-end gap-3 items-center">
        <button
          type="button"
          onClick={() => {
            setSelectedLang("en");
            setEnabledLocales({ en: true, te: true });
          }}
          className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
        >
          Reset to Defaults
        </button>
        <button
          onClick={handleSave}
          disabled={isLoading}
          className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold transition-all shadow-md shadow-indigo-200 disabled:opacity-70 flex items-center gap-1.5"
        >
          {isLoading ? (
            <>
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <span>Save Preferences</span>
          )}
        </button>
      </div>
    </div>
  );
}