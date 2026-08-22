import React, { useState, useRef } from "react";
import { User, Building2, Hash, Calendar, Camera, Check } from "lucide-react";
import { getCurrentUser } from "../services";

export default function Profile() {
  const user = getCurrentUser();
  const [formData, setFormData] = useState(user);
  const [isSaved, setIsSaved] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setAvatarUrl(URL.createObjectURL(file));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />

      <div className="relative overflow-hidden rounded-3xl bg-slate-900 p-6 sm:p-8 text-white shadow-xl">
        <div className="relative z-10 flex flex-col sm:flex-row items-center gap-6">
          <div className="relative group shrink-0">
            <div className="h-24 w-24 rounded-2xl bg-emerald-600 border-2 border-white/20 flex items-center justify-center overflow-hidden text-2xl font-bold">
              {avatarUrl ? <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" /> : formData.name.substring(0, 2).toUpperCase()}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-2 -right-2 p-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl border-2 border-slate-900 transition-colors"
            >
              <Camera size={14} />
            </button>
          </div>

          <div className="flex-1 text-center sm:text-left space-y-1">
            <h1 className="text-2xl font-bold">{formData.name}</h1>
            <p className="text-xs text-emerald-200">{formData.role} • {formData.department}</p>
            <div className="pt-2 flex flex-wrap gap-2 text-xs text-slate-300">
              <span className="bg-white/10 px-2.5 py-1 rounded-lg flex items-center gap-1"><Hash size={12} /> {formData.employeeId}</span>
              <span className="bg-white/10 px-2.5 py-1 rounded-lg flex items-center gap-1"><Calendar size={12} /> {formData.dateJoined}</span>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><User size={16} className="text-emerald-600" /> General Details</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Full Name</label>
                <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Email Address</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Mobile Phone</label>
                <input type="text" name="mobile" value={formData.mobile} onChange={handleChange} className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Building2 size={16} className="text-emerald-600" /> Work Info</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Department</label>
                <input type="text" name="department" value={formData.department} onChange={handleChange} className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Designation</label>
                <input type="text" name="role" value={formData.role} onChange={handleChange} className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <button type="button" onClick={() => setFormData(user)} className="px-4 py-2 border rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Reset</button>
          <button type="submit" className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm">
            {isSaved ? <Check size={14} /> : null} {isSaved ? "Saved!" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}