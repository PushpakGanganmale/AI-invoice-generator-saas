import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import StatusBadge from "../component/StatusBadge";

import {
  createInvoiceStyles,
  createInvoiceIconColors,
  createInvoiceCustomStyles,
} from "../assets/dummyStyles";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

function resolveImageUrl(url) {
  if (!url) return null;
  const s = String(url).trim();
  if (s.startsWith("data:") || s.startsWith("blob:")) return s;
  if (/^https?:\/\//i.test(s)) {
    try {
      const parsed = new URL(s);
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        const path = parsed.pathname + (parsed.search || "") + (parsed.hash || "");
        return `${API_BASE.replace(/\/+$/, "")}${path}`;
      }
      return parsed.href;
    } catch (e) {}
  }
  return `${API_BASE.replace(/\/+$/, "")}/${s.replace(/^\/+/, "")}`;
}

function readJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}
function writeJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function getStoredInvoices() { return readJSON("invoices_v1", []) || []; }
function saveStoredInvoices(arr) { writeJSON("invoices_v1", arr); }

function uid() {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch {}
  return Math.random().toString(36).slice(2, 9);
}

function currencyFmt(amount = 0, currency = "INR") {
  try {
    if (currency === "INR") return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  } catch { return `${currency} ${amount}`; }
}

function computeTotals(items = [], taxPercent = 0) {
  const safe = Array.isArray(items) ? items.filter(Boolean) : [];
  const subtotal = safe.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unitPrice || 0), 0);
  const tax = (subtotal * Number(taxPercent || 0)) / 100;
  return { subtotal, tax, total: subtotal + tax };
}

/* icons */
const PreviewIcon = ({ className = "w-4 h-4" }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>);
const SaveIcon = ({ className = "w-4 h-4" }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>);
const UploadIcon = ({ className = "w-4 h-4" }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>);
const DeleteIcon = ({ className = "w-4 h-4" }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>);
const AddIcon = ({ className = "w-4 h-4" }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14m-7-7h14" /></svg>);

export default function CreateInvoice() {
  const navigate = useNavigate();
  const { id } = useParams();
  const loc = useLocation();
  const invoiceFromState = loc.state && loc.state.invoice ? loc.state.invoice : null;
  const isEditing = Boolean(id && id !== "new");

  const { getToken, isSignedIn } = useAuth();

  const obtainToken = useCallback(async () => {
    try { return await getToken(); } catch { return null; }
  }, [getToken]);

  function buildDefaultInvoice() {
    return {
      id: uid(),
      invoiceNumber: undefined, // FIX: undefined so backend generates it, not empty string
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: "",
      fromBusinessName: "",
      fromEmail: "",
      fromAddress: "",
      fromPhone: "",
      fromGst: "",
      client: { name: "", email: "", address: "", phone: "" },
      items: [{ id: uid(), description: "Service / Item", qty: 1, unitPrice: 0 }],
      currency: "INR",
      status: "draft",
      stampDataUrl: null,
      signatureDataUrl: null,
      logoDataUrl: null,
      signatureName: "",
      signatureTitle: "",
      taxPercent: undefined,
      notes: "",
    };
  }

  const [invoice, setInvoice] = useState(() => buildDefaultInvoice());
  const [items, setItems] = useState(invoice.items || []);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);

  function updateInvoiceField(field, value) {
    setInvoice((inv) => (inv ? { ...inv, [field]: value } : inv));
  }
  function updateClient(field, value) {
    setInvoice((inv) => inv ? { ...inv, client: { ...(inv.client || {}), [field]: value } } : inv);
  }
  function updateItem(idx, key, value) {
    setItems((arr) => {
      const copy = arr.slice();
      const it = { ...(copy[idx] || {}) };
      if (key === "description") it.description = value;
      else it[key] = Number(value) || 0;
      copy[idx] = it;
      setInvoice((inv) => (inv ? { ...inv, items: copy } : inv));
      return copy;
    });
  }
  function addItem() {
    const it = { id: uid(), description: "", qty: 1, unitPrice: 0 };
    setItems((arr) => { const next = [...arr, it]; setInvoice((inv) => (inv ? { ...inv, items: next } : inv)); return next; });
  }
  function removeItem(idx) {
    setItems((arr) => { const next = arr.filter((_, i) => i !== idx); setInvoice((inv) => (inv ? { ...inv, items: next } : inv)); return next; });
  }
  function handleStatusChange(newStatus) { setInvoice((inv) => (inv ? { ...inv, status: newStatus } : inv)); }
  function handleCurrencyChange(newCurrency) { setInvoice((inv) => (inv ? { ...inv, currency: newCurrency } : inv)); }

  function handleImageUpload(file, kind = "logo") {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setInvoice((inv) => inv ? { ...inv, [`${kind}DataUrl`]: dataUrl } : inv);
    };
    reader.readAsDataURL(file);
  }
  function removeImage(kind = "logo") {
    setInvoice((inv) => inv ? { ...inv, [`${kind}DataUrl`]: null } : inv);
  }

  /* fetch business profile */
  useEffect(() => {
    let mounted = true;
    const fetchBusinessProfile = async () => {
      try {
        if (!isSignedIn) return;
        const token = await obtainToken();
        if (!token) return;
        const res = await fetch(`${API_BASE}/api/business-profile/me`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        const data = json?.data || json || null;
        if (!data || !mounted) return;

        const serverProfile = {
          businessName: data.businessName ?? "",
          email: data.email ?? "",
          address: data.address ?? "",
          phone: data.phone ?? "",
          gst: data.gst ?? "",
          defaultTaxPercent: data.defaultTaxPercent ?? 18,
          signatureOwnerName: data.signatureOwnerName ?? "",
          signatureOwnerTitle: data.signatureOwnerTitle ?? "",
          logoUrl: data.logoUrl ?? null,
          stampUrl: data.stampUrl ?? null,
          signatureUrl: data.signatureUrl ?? null,
        };

        setProfile(serverProfile);
        setInvoice((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            fromBusinessName: prev.fromBusinessName || serverProfile.businessName,
            fromEmail: prev.fromEmail || serverProfile.email,
            fromAddress: prev.fromAddress || serverProfile.address,
            fromPhone: prev.fromPhone || serverProfile.phone,
            fromGst: prev.fromGst || serverProfile.gst,
            logoDataUrl: prev.logoDataUrl || resolveImageUrl(serverProfile.logoUrl) || null,
            stampDataUrl: prev.stampDataUrl || resolveImageUrl(serverProfile.stampUrl) || null,
            signatureDataUrl: prev.signatureDataUrl || resolveImageUrl(serverProfile.signatureUrl) || null,
            signatureName: prev.signatureName || serverProfile.signatureOwnerName,
            signatureTitle: prev.signatureTitle || serverProfile.signatureOwnerTitle,
            taxPercent: prev.taxPercent !== undefined ? prev.taxPercent : serverProfile.defaultTaxPercent,
          };
        });
      } catch (error) {
        console.warn("Failed to fetch business profile:", error);
      }
    };
    fetchBusinessProfile();
    return () => { mounted = false; };
  }, [isSignedIn, obtainToken]);

  /* load invoice when editing or from AI state */
  useEffect(() => {
    let mounted = true;
    async function prepare() {
      if (invoiceFromState) {
        const base = { ...buildDefaultInvoice(), ...invoiceFromState };
        base.logoDataUrl = resolveImageUrl(base.logoDataUrl ?? base.logoUrl) || null;
        base.stampDataUrl = resolveImageUrl(base.stampDataUrl ?? base.stampUrl) || null;
        base.signatureDataUrl = resolveImageUrl(base.signatureDataUrl ?? base.signatureUrl) || null;
        setInvoice(base);
        setItems(Array.isArray(invoiceFromState.items) ? invoiceFromState.items.slice() : buildDefaultInvoice().items);
        return;
      }

      if (isEditing && !invoiceFromState) {
        setLoading(true);
        try {
          const token = await obtainToken();
          const headers = { Accept: "application/json" };
          if (token) headers["Authorization"] = `Bearer ${token}`;
          const res = await fetch(`${API_BASE}/api/invoices/${id}`, { method: "GET", headers });
          if (res.ok) {
            const json = await res.json().catch(() => null);
            const data = json?.data || json || null;
            if (data && mounted) {
              const merged = { ...buildDefaultInvoice(), ...data };
              merged.id = data._id ?? data.id ?? merged.id;
              merged.invoiceNumber = data.invoiceNumber ?? merged.invoiceNumber;
              merged.logoDataUrl = resolveImageUrl(data.logoDataUrl ?? data.logoUrl) || merged.logoDataUrl || null;
              merged.stampDataUrl = resolveImageUrl(data.stampDataUrl ?? data.stampUrl) || merged.stampDataUrl || null;
              merged.signatureDataUrl = resolveImageUrl(data.signatureDataUrl ?? data.signatureUrl) || merged.signatureDataUrl || null;
              setInvoice(merged);
              setItems(Array.isArray(data.items) ? data.items.slice() : merged.items);
              setLoading(false);
              return;
            }
          }
        } catch (err) {
          console.warn("Server invoice fetch failed:", err);
        } finally {
          setLoading(false);
        }

        // fallback to local storage
        const all = getStoredInvoices();
        const found = all.find((x) => x && (x.id === id || x._id === id || x.invoiceNumber === id));
        if (found && mounted) {
          const fixed = { ...buildDefaultInvoice(), ...found };
          setInvoice(fixed);
          setItems(Array.isArray(found.items) ? found.items.slice() : buildDefaultInvoice().items);
        }
      }
    }
    prepare();
    return () => { mounted = false; };
  }, [id, invoiceFromState, isEditing, obtainToken]);

  /* Save invoice */
 async function handleSave() {
  if (!invoice || loading) return;

  if (!isSignedIn) {
    alert("Please sign in first.");
    return;
  }

  const token = await obtainToken();

  if (!token) {
    alert("Authentication failed. Please login again.");
    return;
  }

  setLoading(true);

  try {
    const totals = computeTotals(items, invoice.taxPercent);

    const prepared = {
      issueDate: invoice.issueDate || "",
      dueDate: invoice.dueDate || "",

      fromBusinessName: invoice.fromBusinessName || "",
      fromEmail: invoice.fromEmail || "",
      fromAddress: invoice.fromAddress || "",
      fromPhone: invoice.fromPhone || "",
      fromGst: invoice.fromGst || "",

      client: invoice.client || {},
      items: items || [],

      currency: invoice.currency || "INR",
      status: invoice.status || "draft",

      taxPercent: Number(invoice.taxPercent ?? 18),

      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,

      logoDataUrl: invoice.logoDataUrl || null,
      stampDataUrl: invoice.stampDataUrl || null,
      signatureDataUrl: invoice.signatureDataUrl || null,

      notes: invoice.notes || "",
    };

    // Only include invoiceNumber if user entered one
    if (invoice.invoiceNumber && String(invoice.invoiceNumber).trim()) {
      prepared.invoiceNumber = String(invoice.invoiceNumber).trim();
    }

    const endpoint =
      isEditing && invoice.id
        ? `${API_BASE}/api/invoices/${invoice.id}`
        : `${API_BASE}/api/invoices`;

    const method = isEditing ? "PUT" : "POST";

    const res = await fetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(prepared),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(json?.message || "Failed to save invoice");
    }

    const saved = json?.data ?? json ?? {};

    setInvoice((prev) => ({
      ...prev,
      id: saved?._id || saved?.id || prev.id,
      invoiceNumber: saved?.invoiceNumber || prev.invoiceNumber,
    }));

    setItems(saved?.items || items);

    alert(`Invoice ${isEditing ? "updated" : "created"} successfully.`);

    navigate("/app/invoices");

  } catch (err) {
    console.error("Invoice save error:", err);
    alert(err.message || "Failed to save invoice");
  } finally {
    setLoading(false);
  }
}

  function handlePreview() {
    const prepared = {
      ...invoice,
      items,
      subtotal: computeTotals(items, invoice.taxPercent).subtotal,
      tax: computeTotals(items, invoice.taxPercent).tax,
      total: computeTotals(items, invoice.taxPercent).total,
    };
    navigate(`/app/invoices/${invoice.id}/preview`, { state: { invoice: prepared } });
  }

  const totals = computeTotals(items, invoice?.taxPercent ?? 18);

  return (
    <div className={createInvoiceStyles.pageContainer}>
      {/* Header */}
      <div className={createInvoiceStyles.headerContainer}>
        <div>
          <h1 className={createInvoiceStyles.headerTitle}>{isEditing ? "Edit Invoice" : "Create New Invoice"}</h1>
          <p className={createInvoiceStyles.headerSubtitle}>{isEditing ? "Update invoice details and items below" : "Fill in invoice details, add line items, and configure branding"}</p>
        </div>
        <div className={createInvoiceStyles.headerButtonContainer}>
          <button onClick={handlePreview} className={createInvoiceStyles.previewButton}><PreviewIcon className="w-4 h-4" /> Preview</button>
          <button onClick={handleSave} disabled={loading} className={createInvoiceStyles.saveButton}>
            <SaveIcon className="w-4 h-4" />
            {loading ? "Saving..." : isEditing ? "Update Invoice" : "Create Invoice"}
          </button>
        </div>
      </div>

      {/* Invoice Details */}
      <div className={createInvoiceStyles.cardContainer}>
        <div className={createInvoiceStyles.cardHeaderContainer}>
          <div className={`${createInvoiceStyles.cardIconContainer} ${createInvoiceIconColors.invoice}`}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
          </div>
          <h2 className={createInvoiceStyles.cardTitle}>Invoice Details</h2>
        </div>

        <div className={createInvoiceStyles.gridCols3}>
          <div>
            <label className={createInvoiceStyles.label}>Invoice Number</label>
            <input value={invoice?.invoiceNumber || ""} onChange={(e) => updateInvoiceField("invoiceNumber", e.target.value)} placeholder="Auto-generated if empty" className={createInvoiceStyles.inputMedium} />
          </div>
          <div>
            <label className={createInvoiceStyles.label}>Invoice Date</label>
            <input type="date" value={invoice?.issueDate || ""} onChange={(e) => updateInvoiceField("issueDate", e.target.value)} className={createInvoiceStyles.input} />
          </div>
          <div>
            <label className={createInvoiceStyles.label}>Due Date</label>
            <input type="date" value={invoice?.dueDate || ""} onChange={(e) => updateInvoiceField("dueDate", e.target.value)} className={createInvoiceStyles.input} />
          </div>
        </div>

        {/* Currency and Status */}
        <div className={createInvoiceStyles.currencyStatusGrid}>
          <div>
            <label className={createInvoiceStyles.labelWithMargin}>Currency</label>
            <div className={createInvoiceStyles.currencyContainer}>
              <button onClick={() => handleCurrencyChange("INR")} className={`${createInvoiceStyles.currencyButton} ${invoice.currency === "INR" ? createInvoiceStyles.currencyButtonActive1 : createInvoiceStyles.currencyButtonInactive}`}>
                <span className={createInvoiceCustomStyles.currencySymbol}>₹</span>
                <div className="text-left"><div className="font-medium">Indian Rupee</div><div className="text-xs opacity-70">INR</div></div>
              </button>
              <button onClick={() => handleCurrencyChange("USD")} className={`${createInvoiceStyles.currencyButton} ${invoice.currency === "USD" ? createInvoiceStyles.currencyButtonActive2 : createInvoiceStyles.currencyButtonInactive}`}>
                <span className={createInvoiceCustomStyles.currencySymbol}>$</span>
                <div className="text-left"><div className="font-medium">US Dollar</div><div className="text-xs opacity-70">USD</div></div>
              </button>
            </div>
          </div>

          <div>
            <label className={createInvoiceStyles.labelWithMargin}>Status</label>
            <div className={createInvoiceStyles.statusContainer}>
              {[{ value: "draft", label: "Draft" }, { value: "unpaid", label: "Unpaid" }, { value: "paid", label: "Paid" }, { value: "overdue", label: "Overdue" }].map((s) => (
                <button key={s.value} onClick={() => handleStatusChange(s.value)} className={`${createInvoiceStyles.statusButton} ${invoice.status === s.value ? createInvoiceStyles.statusButtonActive : createInvoiceStyles.statusButtonInactive}`}>
                  <StatusBadge status={s.label} size="default" showIcon={true} />
                </button>
              ))}
            </div>
            <div className={createInvoiceStyles.statusDropdown}>
              <select value={invoice.status} onChange={(e) => handleStatusChange(e.target.value)} className="w-full">
                <option value="draft">Draft</option>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className={createInvoiceStyles.mainGrid}>
        <div className={createInvoiceStyles.leftColumn}>

          {/* Bill From */}
          <div className={createInvoiceStyles.cardContainer}>
            <div className={createInvoiceStyles.cardHeaderContainer}>
              <div className={`${createInvoiceStyles.cardIconContainer} ${createInvoiceIconColors.billFrom}`}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              </div>
              <h3 className={createInvoiceStyles.cardTitle}>Bill From</h3>
            </div>
            <div className={createInvoiceStyles.gridCols2}>
              <div><label className={createInvoiceStyles.label}>Business Name</label><input value={invoice?.fromBusinessName ?? ""} onChange={(e) => updateInvoiceField("fromBusinessName", e.target.value)} placeholder="Your Business Name" className={createInvoiceStyles.input} /></div>
              <div><label className={createInvoiceStyles.label}>Email</label><input value={invoice?.fromEmail ?? ""} onChange={(e) => updateInvoiceField("fromEmail", e.target.value)} placeholder="business@email.com" className={createInvoiceStyles.input} /></div>
              <div className={createInvoiceStyles.gridColSpan2}><label className={createInvoiceStyles.label}>Address</label><textarea value={invoice?.fromAddress ?? ""} onChange={(e) => updateInvoiceField("fromAddress", e.target.value)} placeholder="Business Address" rows={3} className={createInvoiceStyles.textarea} /></div>
              <div><label className={createInvoiceStyles.label}>Phone</label><input value={invoice?.fromPhone ?? ""} onChange={(e) => updateInvoiceField("fromPhone", e.target.value)} placeholder="+91 98765 43210" className={createInvoiceStyles.input} /></div>
              <div><label className={createInvoiceStyles.label}>GST Number</label><input value={invoice?.fromGst ?? ""} onChange={(e) => updateInvoiceField("fromGst", e.target.value)} placeholder="27AAAPL1234C1ZV" className={createInvoiceStyles.input} /></div>
            </div>
          </div>

          {/* Bill To */}
          <div className={createInvoiceStyles.cardContainer}>
            <div className={createInvoiceStyles.cardHeaderContainer}>
              <div className={`${createInvoiceStyles.cardIconContainer} ${createInvoiceIconColors.billTo}`}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              </div>
              <h3 className={createInvoiceStyles.cardTitle}>Bill To</h3>
            </div>
            <div className={createInvoiceStyles.gridCols2}>
              <div><label className={createInvoiceStyles.label}>Client Name</label><input value={invoice?.client?.name || ""} onChange={(e) => updateClient("name", e.target.value)} placeholder="Client Name" className={createInvoiceStyles.input} /></div>
              <div><label className={createInvoiceStyles.label}>Client Email</label><input value={invoice?.client?.email || ""} onChange={(e) => updateClient("email", e.target.value)} placeholder="client@email.com" className={createInvoiceStyles.input} /></div>
              <div className={createInvoiceStyles.gridColSpan2}><label className={createInvoiceStyles.label}>Client Address</label><textarea value={invoice?.client?.address || ""} onChange={(e) => updateClient("address", e.target.value)} placeholder="Client Address" rows={3} className={createInvoiceStyles.textarea} /></div>
              <div><label className={createInvoiceStyles.label}>Client Phone</label><input value={invoice?.client?.phone || ""} onChange={(e) => updateClient("phone", e.target.value)} placeholder="+91 98765 43210" className={createInvoiceStyles.input} /></div>
            </div>
          </div>

          {/* Items */}
          <div className={createInvoiceStyles.cardContainer}>
            <div className={createInvoiceStyles.cardHeaderWithButton}>
              <div className={createInvoiceStyles.cardHeaderLeft}>
                <div className={createInvoiceStyles.cardIconContainer}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="12" y1="8" x2="12" y2="16" /></svg>
                </div>
                <h3 className={createInvoiceStyles.cardTitle}>Items & Services</h3>
              </div>
              <div className={createInvoiceStyles.currencyBadge}>All amounts in {invoice.currency}</div>
            </div>

            <div className={createInvoiceStyles.itemsListWrapper}>
              {items.map((it, idx) => {
                const totalValue = Number(it?.qty || 0) * Number(it?.unitPrice || 0);
                const totalLabel = currencyFmt(totalValue, invoice.currency);
                return (
                  <div key={it?.id ?? idx} className={`${createInvoiceStyles.itemsTableRow} ${createInvoiceStyles.itemRow}`}>
                    <div className={createInvoiceStyles.itemColDescription}>
                      <label className={createInvoiceStyles.itemsFieldLabel}>Description</label>
                      <input className={createInvoiceStyles.itemsInput} value={it?.description ?? ""} onChange={(e) => updateItem(idx, "description", e.target.value)} placeholder="Item description" />
                    </div>
                    <div className={createInvoiceStyles.itemColQuantity}>
                      <label className={createInvoiceStyles.itemsFieldLabel}>Quantity</label>
                      <input type="text" inputMode="numeric" className={createInvoiceStyles.itemsNumberInput} value={String(it?.qty ?? "")} onChange={(e) => updateItem(idx, "qty", e.target.value)} />
                    </div>
                    <div className={createInvoiceStyles.itemColUnitPrice}>
                      <label className={createInvoiceStyles.itemsFieldLabel}>Unit Price</label>
                      <input type="text" inputMode="decimal" className={createInvoiceStyles.itemsNumberInput} value={String(it?.unitPrice ?? "")} onChange={(e) => updateItem(idx, "unitPrice", e.target.value)} />
                    </div>
                    <div className={createInvoiceStyles.itemColTotal}>
                      <label className={createInvoiceStyles.itemsFieldLabel}>Total</label>
                      <div className={createInvoiceStyles.itemsTotal}>{totalLabel}</div>
                    </div>
                    <div className={createInvoiceStyles.itemColRemove}>
                      <button type="button" onClick={() => removeItem(idx)} className={createInvoiceStyles.itemsRemoveButton}><DeleteIcon className="w-4 h-4" /></button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6">
              <button onClick={addItem} className={createInvoiceStyles.addItemButton}><AddIcon className={`w-4 h-4 ${createInvoiceStyles.iconHover}`} /> Add Item</button>
            </div>
          </div>

          {/* Notes */}
          <div className={createInvoiceStyles.cardContainer}>
            <h3 className={createInvoiceStyles.cardSubtitle}>Notes</h3>
            <textarea value={invoice.notes || ""} onChange={(e) => updateInvoiceField("notes", e.target.value)} placeholder="Payment terms, thank you notes, etc." rows={3} className={createInvoiceStyles.textarea} />
          </div>
        </div>

        {/* Right Column */}
        <div className={createInvoiceStyles.rightColumn}>

          {/* Branding */}
          <div className={createInvoiceStyles.cardSmallContainer}>
            <h3 className={createInvoiceStyles.cardSubtitle}>Branding</h3>
            <div className="space-y-4">
              <div>
                <label className={createInvoiceStyles.label}>Company Logo</label>
                <div className={createInvoiceStyles.uploadSmallArea}>
                  {invoice?.logoDataUrl ? (
                    <div className={createInvoiceStyles.imagePreviewContainer}>
                      <div className={createInvoiceStyles.logoPreview}><img src={invoice.logoDataUrl} alt="logo" className="object-contain w-full h-full" onError={(e) => { e.currentTarget.style.display = "none"; }} /></div>
                      <div className={createInvoiceStyles.buttonGroup}>
                        <label className={createInvoiceStyles.changeButton}><UploadIcon className="w-4 h-4" /> Change<input type="file" accept="image/*" onChange={(e) => handleImageUpload(e.target.files && e.target.files[0], "logo")} className="hidden" /></label>
                        <button onClick={() => removeImage("logo")} className={createInvoiceStyles.removeButton}><DeleteIcon className="w-4 h-4" /> Remove</button>
                      </div>
                    </div>
                  ) : (
                    <label className="cursor-pointer block">
                      <div className={`${createInvoiceStyles.imagePreviewContainer} ${createInvoiceStyles.hoverScale}`}>
                        <div className={createInvoiceStyles.uploadIconContainer}><UploadIcon className="w-5 h-5" /></div>
                        <div><p className={createInvoiceStyles.uploadTextTitle}>Upload Logo</p><p className={createInvoiceStyles.uploadTextSubtitle}>PNG, JPG up to 5MB</p></div>
                        <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e.target.files && e.target.files[0], "logo")} className="hidden" />
                      </div>
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Summary & Tax */}
          <div className={createInvoiceStyles.cardSmallContainer}>
            <h3 className={createInvoiceStyles.cardSubtitle}>Summary & Tax</h3>
            <div className="space-y-4">
              <div className={createInvoiceStyles.summaryRow}>
                <div className={createInvoiceStyles.summaryLabel}>Subtotal</div>
                <div className={createInvoiceStyles.summaryValue}>{currencyFmt(totals.subtotal, invoice.currency)}</div>
              </div>
              <div>
                <label className={createInvoiceStyles.label}>Tax Percentage</label>
                <input type="number" value={invoice.taxPercent ?? 18} onChange={(e) => updateInvoiceField("taxPercent", Number(e.target.value || 0))} className={createInvoiceStyles.inputCenter} min="0" max="100" step="0.1" />
              </div>
              <div className={createInvoiceStyles.taxRow}>
                <div className="text-sm text-gray-600">Tax Amount</div>
                <div className="font-medium text-gray-900">{currencyFmt(totals.tax, invoice.currency)}</div>
              </div>
              <div className={createInvoiceStyles.totalRow}>
                <div className={createInvoiceStyles.totalLabel}>Total</div>
                <div className={createInvoiceStyles.totalValue}>{currencyFmt(totals.total, invoice.currency)}</div>
              </div>
            </div>
          </div>

          {/* Stamp & Signature */}
          <div className={createInvoiceStyles.cardSmallContainer}>
            <h3 className={createInvoiceStyles.cardSubtitle}>Stamp & Signature</h3>
            <div className="space-y-6">
              {/* Stamp */}
              <div>
                <label className={createInvoiceStyles.label}>Digital Stamp</label>
                <div className={createInvoiceStyles.uploadSmallArea}>
                  {invoice.stampDataUrl ? (
                    <div className={createInvoiceStyles.imagePreviewContainer}>
                      <div className={createInvoiceStyles.stampPreview}><img src={invoice.stampDataUrl} alt="stamp" className="object-contain w-full h-full" /></div>
                      <div className={createInvoiceStyles.buttonGroup}>
                        <label className={createInvoiceStyles.changeButton}><UploadIcon className="w-4 h-4" /> Change<input type="file" accept="image/*" onChange={(e) => handleImageUpload(e.target.files && e.target.files[0], "stamp")} className="hidden" /></label>
                        <button onClick={() => removeImage("stamp")} className={createInvoiceStyles.removeButton}><DeleteIcon className="w-4 h-4" /> Remove</button>
                      </div>
                    </div>
                  ) : (
                    <label className="cursor-pointer block">
                      <div className={`${createInvoiceStyles.imagePreviewContainer} ${createInvoiceStyles.hoverScale}`}>
                        <div className={createInvoiceStyles.uploadSmallIconContainer}><UploadIcon className="w-4 h-4" /></div>
                        <div><p className={createInvoiceStyles.uploadTextTitle}>Upload Stamp</p><p className={createInvoiceStyles.uploadTextSubtitle}>PNG with transparency</p></div>
                        <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e.target.files && e.target.files[0], "stamp")} className="hidden" />
                      </div>
                    </label>
                  )}
                </div>
              </div>

              {/* Signature */}
              <div>
                <label className={createInvoiceStyles.label}>Digital Signature</label>
                <div className={createInvoiceStyles.uploadSmallArea}>
                  {invoice.signatureDataUrl ? (
                    <div className={createInvoiceStyles.imagePreviewContainer}>
                      <div className={createInvoiceStyles.signaturePreview}><img src={invoice.signatureDataUrl} alt="signature" className="object-contain w-full h-full" /></div>
                      <div className={createInvoiceStyles.buttonGroup}>
                        <label className={createInvoiceStyles.changeButton}><UploadIcon className="w-4 h-4" /> Change<input type="file" accept="image/*" onChange={(e) => handleImageUpload(e.target.files && e.target.files[0], "signature")} className="hidden" /></label>
                        <button onClick={() => removeImage("signature")} className={createInvoiceStyles.removeButton}><DeleteIcon className="w-4 h-4" /> Remove</button>
                      </div>
                    </div>
                  ) : (
                    <label className="cursor-pointer block">
                      <div className={`${createInvoiceStyles.imagePreviewContainer} ${createInvoiceStyles.hoverScale}`}>
                        <div className={createInvoiceStyles.uploadSmallIconContainer}><UploadIcon className="w-4 h-4" /></div>
                        <div><p className={createInvoiceStyles.uploadTextTitle}>Upload Signature</p><p className={createInvoiceStyles.uploadTextSubtitle}>PNG with transparency</p></div>
                        <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e.target.files && e.target.files[0], "signature")} className="hidden" />
                      </div>
                    </label>
                  )}
                </div>
                <div className="mt-4 space-y-3">
                  <div><label className={createInvoiceStyles.label}>Signature Owner Name</label><input placeholder="John Doe" value={invoice.signatureName || ""} onChange={(e) => updateInvoiceField("signatureName", e.target.value)} className={createInvoiceStyles.inputSmall} /></div>
                  <div><label className={createInvoiceStyles.label}>Signature Title / Designation</label><input placeholder="Director / CEO" value={invoice.signatureTitle || ""} onChange={(e) => updateInvoiceField("signatureTitle", e.target.value)} className={createInvoiceStyles.inputSmall} /></div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
