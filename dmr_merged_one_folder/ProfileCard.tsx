import React, { useState, useRef } from "react";
import { Card, Button, Input, Select } from "../common";
import { 
  Camera, 
  Hash, 
  Calendar, 
  Sparkles, 
  Globe, 
  Edit3, 
  Check, 
  X,
  Lock
} from "lucide-react";

export const ProfileCard: React.FC = () => {
  // Toggle between view & edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // Profile photo state
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initial user form state
  const [profileData, setProfileData] = useState({
    fullName: "Rubulla",
    department: "Administration",
    email: "info@dmrpoultries.com",
    designation: "Owner",
    mobile: "+91 9122456789",
    username: "rubullaadmin",
    employeeId: "DMR001",
    dateJoined: "01-Jan-2020",
    language: "English",
    theme: "Light"
  });

  const handleChange = (field: string, value: string) => {
    setProfileData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarUrl(URL.createObjectURL(file));
    }
  };

  const handleSave = () => {
    setIsEditing(false);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <Card className="max-w-4xl mx-auto p-6 md:p-8 space-y-8 bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-xl rounded-3xl">
      
      {/* Hidden File Input for Image Upload */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handlePhotoUpload} 
        accept="image/*" 
        className="hidden" 
      />

      {/* 1. HERO HEADER BAR */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 p-6 text-white shadow-lg">
        {/* Subtle decorative glow */}
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-emerald-500/20 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
            
            {/* Avatar Circle with Hover Overlay */}
            <div className="relative group shrink-0">
              <div className="h-20 w-20 rounded-2xl bg-white/10 border-2 border-white/20 shadow-xl flex items-center justify-center overflow-hidden transition-transform group-hover:scale-105">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-emerald-600 flex items-center justify-center text-white font-bold text-xl">
                    {profileData.fullName.substring(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-md transition-all active:scale-95"
                title="Upload Photo"
              >
                <Camera size={13} />
              </button>
            </div>

            {/* Quick Meta Details */}
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h2 className="text-xl font-bold tracking-tight">{profileData.fullName}</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold border border-emerald-500/30">
                  Active
                </span>
              </div>
              <p className="text-xs text-emerald-200/80 font-medium">{profileData.designation} • {profileData.department}</p>
              
              <div className="pt-1 flex items-center justify-center sm:justify-start gap-3 text-[11px] text-slate-300">
                <span className="flex items-center gap-1"><Hash size={11} className="text-emerald-400" /> {profileData.employeeId}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Calendar size={11} className="text-emerald-400" /> {profileData.dateJoined}</span>
              </div>
            </div>
          </div>

          {/* Mode Toggle Button */}
          {!isEditing ? (
            <Button 
              variant="secondary" 
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs px-4 py-2 transition-colors"
            >
              <Edit3 size={14} /> Edit Profile
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button 
                variant="secondary" 
                onClick={() => setIsEditing(false)}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs px-3 py-1.5 transition-colors"
              >
                <X size={14} /> Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 2. MAIN INPUT GRID */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
          <Sparkles size={14} className="text-emerald-600" /> Account Details
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input 
            label="Full Name" 
            value={profileData.fullName} 
            onChange={(e: any) => handleChange("fullName", e.target.value)}
            className={!isEditing ? "bg-slate-50 text-slate-600 cursor-not-allowed" : "bg-white focus:border-emerald-600 focus:ring-emerald-600"} 
            readOnly={!isEditing} 
          />
          
          <Input 
            label="Department" 
            value={profileData.department} 
            onChange={(e: any) => handleChange("department", e.target.value)}
            className={!isEditing ? "bg-slate-50 text-slate-600 cursor-not-allowed" : "bg-white focus:border-emerald-600 focus:ring-emerald-600"} 
            readOnly={!isEditing} 
          />

          <Input 
            label="Email Address" 
            value={profileData.email} 
            onChange={(e: any) => handleChange("email", e.target.value)}
            className={!isEditing ? "bg-slate-50 text-slate-600 cursor-not-allowed" : "bg-white focus:border-emerald-600 focus:ring-emerald-600"} 
            readOnly={!isEditing} 
          />

          <Input 
            label="Designation" 
            value={profileData.designation} 
            onChange={(e: any) => handleChange("designation", e.target.value)}
            className={!isEditing ? "bg-slate-50 text-slate-600 cursor-not-allowed" : "bg-white focus:border-emerald-600 focus:ring-emerald-600"} 
            readOnly={!isEditing} 
          />

          <Input 
            label="Mobile Number" 
            value={profileData.mobile} 
            onChange={(e: any) => handleChange("mobile", e.target.value)}
            className={!isEditing ? "bg-slate-50 text-slate-600 cursor-not-allowed" : "bg-white focus:border-emerald-600 focus:ring-emerald-600"} 
            readOnly={!isEditing} 
          />

          {/* Locked System Attributes */}
          <div className="relative">
            <Input 
              label="Username" 
              value={profileData.username} 
              className="bg-slate-100/80 text-slate-500 cursor-not-allowed" 
              readOnly 
            />
            <Lock size={12} className="absolute right-3 top-9 text-slate-400" />
          </div>

          <div className="relative">
            <Input 
              label="Employee ID" 
              value={profileData.employeeId} 
              className="bg-slate-100/80 text-slate-500 cursor-not-allowed" 
              readOnly 
            />
            <Lock size={12} className="absolute right-3 top-9 text-slate-400" />
          </div>

          <div className="relative">
            <Input 
              label="Date Joined" 
              value={profileData.dateJoined} 
              className="bg-slate-100/80 text-slate-500 cursor-not-allowed" 
              readOnly 
            />
            <Lock size={12} className="absolute right-3 top-9 text-slate-400" />
          </div>
        </div>
      </div>

      {/* 3. PREFERENCES SECTION */}
      <div className="p-5 rounded-2xl bg-slate-50/80 border border-slate-100 space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
          <Globe size={14} className="text-emerald-600" /> Preferences
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select 
            label="Preferred Language" 
            options={["English", "Telugu"]} 
            value={profileData.language} 
            onChange={(e: any) => handleChange("language", e.target.value)}
          />
          <Select 
            label="Theme Preference" 
            options={["Light", "Dark"]} 
            value={profileData.theme} 
            onChange={(e: any) => handleChange("theme", e.target.value)}
          />
        </div>
      </div>

      {/* 4. FOOTER CONTROLS */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
        <p className="text-xs text-slate-400">
          {isSaved ? "✅ Changes saved successfully!" : "System locks apply to core credentials."}
        </p>

        {isEditing && (
          <div className="flex items-center gap-3">
            <Button 
              variant="secondary" 
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
              <Check size={14} /> Save Changes
            </Button>
          </div>
        )}
      </div>

    </Card>
  );
};