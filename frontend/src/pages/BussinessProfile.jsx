import React, { useState, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";

// --- Constants ---
const API_BASE =
  import.meta.env.VITE_API_BASE || "http://localhost:4000"; // Update this to your actual backend URL

// --- Utility: Resolve Image URLs ---
function resolveImageUrl(url) {
  if (!url) return null;
  const s = String(url).trim();
  if (s.startsWith("blob:") || s.startsWith("data:")) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return `${API_BASE.replace(/\/+$/, "")}/${s.replace(/^\/+/, "")}`;
}

// --- Icons ---
const UploadIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const DeleteIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const ImageIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

export default function BusinessProfile() {
  const { getToken, isSignedIn } = useAuth();

  // State for text data
  const [meta, setMeta] = useState({
    businessName: "",
    email: "",
    address: "",
    phone: "",
    gst: "",
    defaultTaxPercent: 18,
    signatureOwnerName: "",
    signatureOwnerTitle: "",
    profileId: null,
  });

  // State for file objects and preview URLs
  const [files, setFiles] = useState({ logo: null, stamp: null, signature: null });
  const [previews, setPreviews] = useState({ logo: null, stamp: null, signature: null });
  const [saving, setSaving] = useState(false);

  // --- Fetch Profile on Load ---
  useEffect(() => {
    let mounted = true;
    async function fetchProfile() {
      if (!isSignedIn) return;
      const token = await getToken();
      try {
      const res = await fetch(`${API_BASE}/api/business-profile/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && mounted) {
          const json = await res.json();
          const data = json?.data || {};
          setMeta({
            businessName: data.businessName || "",
            email: data.email || "",
            address: data.address || "",
            phone: data.phone || "",
            gst: data.gst || "",
            defaultTaxPercent: data.defaultTaxPercent || 18,
            signatureOwnerName: data.signatureOwnerName || "",
            signatureOwnerTitle: data.signatureOwnerTitle || "",
            profileId: data._id || data.id || null,
          });
          setPreviews({
            logo: resolveImageUrl(data.logoUrl),
            stamp: resolveImageUrl(data.stampUrl),
            signature: resolveImageUrl(data.signatureUrl),
          });
        }
      } catch (err) {
        console.error("Fetch error:", err);
      }
    }
    fetchProfile();
    return () => { mounted = false; };
  }, [isSignedIn, getToken]);

  // --- Handlers ---
  const updateMeta = (field, value) => setMeta(prev => ({ ...prev, [field]: value }));

  const handleFileChange = (kind, file) => {
    if (!file) return;
    // Clean up old blob URL to prevent memory leaks
    if (previews[kind]?.startsWith("blob:")) URL.revokeObjectURL(previews[kind]);

    const url = URL.createObjectURL(file);
    setFiles(prev => ({ ...prev, [kind]: file }));
    setPreviews(prev => ({ ...prev, [kind]: url }));
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const token = await getToken();
      const fd = new FormData();

      // Append text fields
      Object.keys(meta).forEach(key => {
        if (key !== "profileId") fd.append(key, meta[key]);
      });

      // Append files (using your server's expected field names)
      if (files.logo) fd.append("logo", files.logo);
if (files.stamp) fd.append("stamp", files.stamp);
if (files.signature) fd.append("signature", files.signature);

     const url = meta.profileId
  ? `${API_BASE}/api/business-profile/${meta.profileId}`
  : `${API_BASE}/api/business-profile`;

      const res = await fetch(url, {
        method: meta.profileId ? "PUT" : "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      if (res.ok) {
        alert("Profile updated successfully!");
        // Optional: re-fetch or update profileId if it was a POST
      } else {
        throw new Error("Failed to save");
      }
    } catch (err) {
      alert("Error saving profile. Check console.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 animate-in fade-in duration-500">

      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Business Profile</h1>
          <p className="text-gray-500 mt-1">Configure your company branding and invoice defaults</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border rounded-xl hover:bg-gray-50 transition shadow-sm"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition shadow-md flex items-center gap-2"
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* LEFT: BUSINESS DETAILS */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-2xl shadow-sm border p-6 space-y-6">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <span className="w-1.5 h-6 bg-blue-600 rounded-full"></span>
              Business Information
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Business Name</label>
                <input
                  className="w-full border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none border transition"
                  placeholder="e.g. Acme Corp"
                  value={meta.businessName} onChange={e => updateMeta("businessName", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Email Address</label>
                <input
                  type="email"
                  className="w-full border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none border transition"
                  placeholder="contact@company.com"
                  value={meta.email} onChange={e => updateMeta("email", e.target.value)}
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Address</label>
                <textarea
                  rows={3}
                  className="w-full border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none border transition"
                  placeholder="Street, City, State, ZIP"
                  value={meta.address} onChange={e => updateMeta("address", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Phone</label>
                <input
                  className="w-full border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none border transition"
                  placeholder="+91 98765 43210"
                  value={meta.phone} onChange={e => updateMeta("phone", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">GST Number</label>
                <input
                  className="w-full border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none border transition"
                  placeholder="27AAAPL1234C1ZV"
                  value={meta.gst} onChange={e => updateMeta("gst", e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow-sm border p-6 space-y-6">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
              Signature Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Owner Name</label>
                <input
                  className="w-full border-gray-200 rounded-xl p-3 border focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Name on signature"
                  value={meta.signatureOwnerName} onChange={e => updateMeta("signatureOwnerName", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Designation</label>
                <input
                  className="w-full border-gray-200 rounded-xl p-3 border focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="CEO / Director"
                  value={meta.signatureOwnerTitle} onChange={e => updateMeta("signatureOwnerTitle", e.target.value)}
                />
              </div>
            </div>
          </section>
        </div>

        {/* RIGHT: BRANDING & ASSETS */}
        <div className="space-y-6">
          <section className="bg-white rounded-2xl shadow-sm border p-6">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6">Visual Assets</h2>

            <div className="space-y-8">
              {/* LOGO UPLOAD */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3">Company Logo</p>
                <div className="relative border-2 border-dashed border-gray-200 rounded-2xl aspect-video bg-gray-50 flex flex-col items-center justify-center group hover:border-blue-400 transition-colors overflow-hidden">
                  {previews.logo ? (
                    <>
                      <img src={previews.logo} className="w-full h-full object-contain p-4" alt="Logo Preview" />
                      <button
                        onClick={() => { setPreviews(p => ({...p, logo: null})); setFiles(f => ({...f, logo: null})); }}
                        className="absolute top-3 right-3 p-1.5 bg-white/80 backdrop-blur shadow-sm text-red-500 rounded-lg hover:bg-red-50 transition"
                      >
                        <DeleteIcon />
                      </button>
                    </>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center p-6 w-full h-full justify-center">
                      <div className="p-3 bg-white rounded-xl shadow-sm mb-2 text-blue-500 group-hover:scale-110 transition">
                        <UploadIcon />
                      </div>
                      <span className="text-xs text-gray-500 font-medium">PNG, JPG up to 5MB</span>
                      <input type="file" className="hidden" accept="image/*" onChange={e => handleFileChange("logo", e.target.files[0])} />
                    </label>
                  )}
                </div>
              </div>

              {/* STAMP & SIGNATURE GRID */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-600 uppercase">Stamp</p>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-2xl aspect-square bg-gray-50 hover:bg-gray-100 hover:border-blue-300 transition cursor-pointer relative overflow-hidden">
                    {previews.stamp ? (
                       <img src={previews.stamp} className="w-full h-full object-contain p-2" alt="Stamp" />
                    ) : (
                      <ImageIcon className="text-gray-300 w-8 h-8" />
                    )}
                    <input type="file" className="hidden" onChange={e => handleFileChange("stamp", e.target.files[0])} />
                  </label>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-600 uppercase">Signature</p>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-2xl aspect-square bg-gray-50 hover:bg-gray-100 hover:border-blue-300 transition cursor-pointer relative overflow-hidden">
                    {previews.signature ? (
                       <img src={previews.signature} className="w-full h-full object-contain p-2" alt="Signature" />
                    ) : (
                      <div className="text-gray-300">
                         <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                         </svg>
                      </div>
                    )}
                    <input type="file" className="hidden" onChange={e => handleFileChange("signature", e.target.files[0])} />
                  </label>
                </div>
              </div>

              {/* TAX DEFAULT */}
              <div className="pt-6 border-t border-gray-100">
                <label className="text-sm font-semibold text-gray-700">Default Tax Rate</label>
                <div className="flex items-center gap-4 mt-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <div className="relative">
                    <input
                      type="number"
                      className="w-20 border-gray-200 rounded-lg p-2 text-center font-bold text-blue-600 outline-none focus:ring-2 focus:ring-blue-500"
                      value={meta.defaultTaxPercent} onChange={e => updateMeta("defaultTaxPercent", e.target.value)}
                    />
                    <span className="absolute -top-2 -right-2 bg-blue-100 text-blue-600 text-[10px] px-1 rounded font-bold">%</span>
                  </div>
                  <input
                    type="range" min="0" max="100"
                    className="flex-1 accent-blue-600"
                    value={meta.defaultTaxPercent} onChange={e => updateMeta("defaultTaxPercent", e.target.value)}
                  />
                </div>
              </div>

            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
