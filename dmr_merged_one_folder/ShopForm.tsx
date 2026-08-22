import { useEffect, useState } from "react";
import type { Shop } from "../types/shop";
import {
  Store,
  User,
  Phone,
  Mail,
  MapPin,
  Home,
  IndianRupee,
  MessageSquare,
} from "lucide-react";

type ShopFormProps = {
  shop?: Shop | null;
  onSave: (shop: {
    shopName: string;
    ownerName: string;
    phoneNumber: string;
    whatsappNumber: string;
    email: string;
    village: string;
    address: string;
    status: "Active" | "Inactive";
    openingBalance: number;
  }) => void;
  onCancel: () => void;
  isSaving?: boolean;
};

function ShopForm({ shop, onSave, onCancel, isSaving = false }: ShopFormProps) {
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [whatsappNumber, setWhatsAppNumber] = useState("");
  const [email, setEmail] = useState("");
  const [village, setVillage] = useState("");
  const [address, setAddress] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0.00");
  const [status, setStatus] = useState<"Active" | "Inactive">("Active");

  const [errors, setErrors] = useState({
    shopName: "",
    ownerName: "",
    phoneNumber: "",
    whatsappNumber: "",
    email: "",
    village: "",
    openingBalance: "",
  });

  const isEditing = !!shop;

  useEffect(() => {
    if (shop) {
      setShopName(shop.shopName);
      setOwnerName(shop.ownerName);
      setPhoneNumber(shop.phoneNumber);
      setWhatsAppNumber(shop.whatsappNumber ?? "");
      setEmail(shop.email ?? "");
      setVillage(shop.village);
      setAddress(shop.address ?? "");
      setOpeningBalance(shop.openingBalance !== undefined ? String(shop.openingBalance) : "0.00");
      setStatus(shop.status);
    } else {
      setShopName("");
      setOwnerName("");
      setPhoneNumber("");
      setWhatsAppNumber("");
      setEmail("");
      setVillage("");
      setAddress("");
      setOpeningBalance("0.00");
      setStatus("Active");
    }
    setErrors({
      shopName: "",
      ownerName: "",
      phoneNumber: "",
      whatsappNumber: "",
      email: "",
      village: "",
      openingBalance: "",
    });
  }, [shop]);

  const handleSubmit = () => {
    const newErrors = {
      shopName: "",
      ownerName: "",
      phoneNumber: "",
      whatsappNumber: "",
      email: "",
      village: "",
      openingBalance: "",
    };

    if (shopName.trim().length < 3) {
      newErrors.shopName = "Shop Name must contain at least 3 characters.";
    }
    if (ownerName.trim().length < 3) {
      newErrors.ownerName = "Owner Name must contain at least 3 characters.";
    }
    if (!/^[0-9]{10}$/.test(phoneNumber)) {
      newErrors.phoneNumber = "Mobile Number must be exactly 10 digits.";
    }
    if (whatsappNumber.trim() !== "" && !/^[0-9]{10}$/.test(whatsappNumber)) {
      newErrors.whatsappNumber = "WhatsApp Number must be exactly 10 digits.";
    }
    if (email.trim() === "") {
      newErrors.email = "Email ID is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = "Please enter a valid email address.";
    }
    if (village.trim() === "") {
      newErrors.village = "Village is required.";
    }

    const parsedBalance = parseFloat(openingBalance);
    if (openingBalance.trim() === "" || isNaN(parsedBalance)) {
      newErrors.openingBalance = "Opening Balance is required and must be a valid number.";
    }

    setErrors(newErrors);

    if (
      newErrors.shopName ||
      newErrors.ownerName ||
      newErrors.phoneNumber ||
      newErrors.whatsappNumber ||
      newErrors.email ||
      newErrors.village ||
      newErrors.openingBalance
    ) {
      return;
    }

    onSave({
      shopName,
      ownerName,
      phoneNumber,
      whatsappNumber: whatsappNumber.trim() || "",
      email,
      village,
      address,
      status,
      openingBalance: parsedBalance,
    });
  };

  const inputClass = (hasError = false) =>
    `w-full pl-12 pr-4 py-3.5 text-base border-2 rounded-xl focus:ring-4 focus:ring-blue-100/60 focus:border-blue-500 transition-all duration-200 ${
      hasError ? "border-red-500" : "border-slate-200"
    } bg-white/90 hover:shadow-md focus:shadow-lg appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;

  const iconWrapperClass =
    "absolute left-3 top-1/2 -translate-y-1/2 bg-blue-50 p-2 rounded-full text-blue-600";

  // ✅ Title changed to "Edit Shop" when editing
  const title = isEditing ? "Edit Shop" : "Add Shop";
  // ✅ Subtitle changed to "Update details" when editing
  const subtitle = isEditing ? "Update details" : "Fill in the information";

  const toggleStatus = () => {
    if (!isSaving) {
      setStatus(status === "Active" ? "Inactive" : "Active");
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-100 to-slate-200/80 px-8 py-6 flex items-center justify-between border-b border-slate-200/60">
        <div className="flex items-center gap-4">
          <div className="bg-blue-100 p-3 rounded-2xl">
            <Store className="h-7 w-7 text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">{title}</h2>
            <p className="text-sm text-slate-500 font-medium">{subtitle}</p>
          </div>
        </div>

        {/* Status toggle switch */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-600">Status</span>
          <button
            type="button"
            onClick={toggleStatus}
            disabled={isSaving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
              status === "Active" ? "bg-emerald-500" : "bg-slate-300"
            } ${isSaving ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                status === "Active" ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span
            className={`text-sm font-medium ${
              status === "Active" ? "text-emerald-600" : "text-slate-500"
            }`}
          >
            {status}
          </span>
        </div>
      </div>

      {/* Form body */}
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="relative">
            <label className="block mb-2 text-sm font-semibold text-slate-700">
              Shop Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className={iconWrapperClass}>
                <Store size={18} />
              </div>
              <input
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="Enter Shop Name"
                className={inputClass(!!errors.shopName)}
              />
            </div>
            {errors.shopName && (
              <p className="text-red-600 text-sm mt-1">{errors.shopName}</p>
            )}
          </div>

          <div className="relative">
            <label className="block mb-2 text-sm font-semibold text-slate-700">
              Owner Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className={iconWrapperClass}>
                <User size={18} />
              </div>
              <input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Enter Owner Name"
                className={inputClass(!!errors.ownerName)}
              />
            </div>
            {errors.ownerName && (
              <p className="text-red-600 text-sm mt-1">{errors.ownerName}</p>
            )}
          </div>

          <div className="relative">
            <label className="block mb-2 text-sm font-semibold text-slate-700">
              Mobile Number <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className={iconWrapperClass}>
                <Phone size={18} />
              </div>
              <input
                value={phoneNumber}
                maxLength={10}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))}
                placeholder="Enter Mobile Number"
                className={inputClass(!!errors.phoneNumber)}
              />
            </div>
            {errors.phoneNumber && (
              <p className="text-red-600 text-sm mt-1">{errors.phoneNumber}</p>
            )}
          </div>

          <div className="relative">
            <label className="block mb-2 text-sm font-semibold text-slate-700">
              WhatsApp Number
            </label>
            <div className="relative">
              <div className={iconWrapperClass}>
                <MessageSquare size={18} />
              </div>
              <input
                value={whatsappNumber}
                maxLength={10}
                onChange={(e) => setWhatsAppNumber(e.target.value.replace(/\D/g, ""))}
                placeholder="Enter WhatsApp Number (optional)"
                className={inputClass(!!errors.whatsappNumber)}
              />
            </div>
            {errors.whatsappNumber && (
              <p className="text-red-600 text-sm mt-1">{errors.whatsappNumber}</p>
            )}
          </div>

          <div className="relative">
            <label className="block mb-2 text-sm font-semibold text-slate-700">
              Email ID <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className={iconWrapperClass}>
                <Mail size={18} />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter Email ID"
                className={inputClass(!!errors.email)}
              />
            </div>
            {errors.email && (
              <p className="text-red-600 text-sm mt-1">{errors.email}</p>
            )}
          </div>

          <div className="relative">
            <label className="block mb-2 text-sm font-semibold text-slate-700">
              Village <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className={iconWrapperClass}>
                <MapPin size={18} />
              </div>
              <input
                value={village}
                onChange={(e) => setVillage(e.target.value)}
                placeholder="Enter Village"
                className={inputClass(!!errors.village)}
              />
            </div>
            {errors.village && (
              <p className="text-red-600 text-sm mt-1">{errors.village}</p>
            )}
          </div>

          <div className="relative">
            <label className="block mb-2 text-sm font-semibold text-slate-700">
              Opening Balance <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className={iconWrapperClass}>
                <IndianRupee size={18} />
              </div>
              <input
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0.00"
                className={inputClass(!!errors.openingBalance)}
              />
            </div>
            {errors.openingBalance && (
              <p className="text-red-600 text-sm mt-1">{errors.openingBalance}</p>
            )}
          </div>

          <div className="relative md:col-span-2">
            <label className="block mb-2 text-sm font-semibold text-slate-700">
              Address
            </label>
            <div className="relative">
              <div className="absolute left-3 top-3.5 bg-blue-50 p-2 rounded-full text-blue-600">
                <Home size={18} />
              </div>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter Address"
                rows={2}
                className="w-full pl-12 pr-4 py-3 text-base border-2 rounded-xl focus:ring-4 focus:ring-blue-100/60 focus:border-blue-500 transition-all duration-200 border-slate-200 bg-white/90 hover:shadow-md focus:shadow-lg resize-y"
              />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-4 mt-6 pt-5 border-t border-slate-200/80">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="px-6 py-2.5 border-2 border-slate-300 rounded-xl hover:bg-slate-50/80 font-semibold text-base text-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-base transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isSaving && (
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            {isSaving ? "Saving..." : isEditing ? "Update Shop" : "Save Shop"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ShopForm;