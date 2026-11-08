import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";

import {
  useParams,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "@clerk/clerk-react";
import { invoicePreviewStyles } from "../assets/dummyStyles";

// Strip trailing slashes so "https://api.com/" does not produce "//api/..."
const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(
  /\/+$/,
  ""
);

// Fallback only. The backend returns its own key with every order,
// so frontend and backend keys can never mismatch.
const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID;

const PROFILE_ENDPOINT = `${API_BASE}/api/business-profile/me`;

const INVOICE_ENDPOINT = (id) =>
  `${API_BASE}/api/invoices/${encodeURIComponent(id)}`;

function resolveImageUrl(url) {
  if (!url) return null;

  const s = String(url).trim();

  if (s.startsWith("data:")) return s;

  if (/localhost|127\.0\.0\.1/.test(s)) {
    try {
      const parsed = new URL(s);
      const path =
        parsed.pathname +
        (parsed.search || "") +
        (parsed.hash || "");

      return `${API_BASE}${path}`;
    } catch {
      const path = s.replace(/^https?:\/\/[^/]+/, "");
      return `${API_BASE}${path}`;
    }
  }

  if (/^https?:\/\//i.test(s)) return s;

  return `${API_BASE}/${s.replace(/^\/+/, "")}`;
}

function readJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const defaultProfile = {
  businessName: "",
  email: "",
  address: "",
  phone: "",
  gst: "",
  stampDataUrl: null,
  signatureDataUrl: null,
  logoDataUrl: null,
  defaultTaxPercent: 18,
  signatureName: "",
  signatureTitle: "",
};

function currencyFmt(amount = 0, currency = "INR") {
  try {
    return new Intl.NumberFormat(
      currency === "INR" ? "en-IN" : "en-US",
      {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    ).format(Number(amount) || 0);
  } catch {
    return `${currency} ${Number(amount || 0).toFixed(2)}`;
  }
}

function formatDate(dateInput) {
  if (!dateInput) return "—";

  const d =
    dateInput instanceof Date
      ? dateInput
      : new Date(String(dateInput));

  if (Number.isNaN(d.getTime())) return "—";

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();

  return `${dd}/${mm}/${yyyy}`;
}

function normalizeClient(raw) {
  if (!raw) {
    return {
      name: "",
      email: "",
      address: "",
      phone: "",
    };
  }

  if (typeof raw === "string") {
    return {
      name: raw,
      email: "",
      address: "",
      phone: "",
    };
  }

  if (typeof raw === "object") {
    return {
      name: raw.name ?? raw.company ?? raw.client ?? "",
      email: raw.email ?? raw.emailAddress ?? "",
      address:
        raw.address ?? raw.addr ?? raw.clientAddress ?? "",
      phone: raw.phone ?? raw.contact ?? raw.mobile ?? "",
    };
  }

  return {
    name: "",
    email: "",
    address: "",
    phone: "",
  };
}

const round2 = (n) => Number(Number(n || 0).toFixed(2));

/* ---------------- ICONS ---------------- */

const PrintIcon = ({ className = "w-4 h-4" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <path d="M6 14h12v8H6z" />
  </svg>
);

const EditIcon = ({ className = "w-4 h-4" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const ArrowLeftIcon = ({ className = "w-4 h-4" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

/* ---------------- COMPONENT ---------------- */

export default function InvoicePreview() {
  const { id } = useParams();
  const loc = useLocation();
  const navigate = useNavigate();

  const { getToken, isSignedIn } = useAuth();

  const [invoice, setInvoice] = useState(null);

  const [loadingInvoice, setLoadingInvoice] =
    useState(true);

  const [invoiceError, setInvoiceError] = useState(null);

  const [paymentLoading, setPaymentLoading] =
    useState(false);

  // Amount (in invoice currency) the user wants to pay now.
  const [payAmount, setPayAmount] = useState("");

  // Guards against double clicks / double checkout.
  const payingRef = useRef(false);

  const [profile, setProfile] = useState(
    () => readJSON("business_profile", defaultProfile) ||
      defaultProfile
  );

  const [profileLoading, setProfileLoading] =
    useState(false);

  const prevTitleRef = useRef(document.title);

  const obtainToken = useCallback(async () => {
    if (typeof getToken !== "function") return null;

    try {
      let token = await getToken().catch(() => null);

      if (!token) {
        token = await getToken({
          forceRefresh: true,
        }).catch(() => null);
      }

      return token;
    } catch {
      return null;
    }
  }, [getToken]);

  /* ---------------- FETCH INVOICE ---------------- */

  const fetchInvoice = useCallback(
    async (invoiceId) => {
      const token = await obtainToken();

      if (!token) {
        throw new Error("Please sign in again.");
      }

      const response = await fetch(
        INVOICE_ENDPOINT(invoiceId),
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const json = await response.json();

      if (!response.ok || !json?.data) {
        throw new Error(
          json?.message || "Unable to fetch invoice."
        );
      }

      return {
        ...json.data,
        id: json.data._id || json.data.id || invoiceId,
        items: Array.isArray(json.data.items)
          ? json.data.items
          : [],
        invoiceNumber: json.data.invoiceNumber || "",
        currency: json.data.currency || "INR",
      };
    },
    [obtainToken]
  );

  /* ---------------- VERIFY PAYMENT (with retry) ---------------- */

  // Verification is idempotent on the backend, so retrying is safe.
  // A fresh Clerk token is requested on every attempt because tokens
  // expire after ~60 seconds, which is shorter than many checkouts.
  const verifyPaymentWithRetry = useCallback(
    async (payload) => {
      let lastError = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const token = await obtainToken();

          if (!token) {
            throw new Error("Please sign in again.");
          }

          const response = await fetch(
            `${API_BASE}/api/payment/update-payment`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(payload),
            }
          );

          let data = null;

          try {
            data = await response.json();
          } catch {}

          if (response.ok && data?.success) {
            return data;
          }

          const err = new Error(
            data?.message ||
              `Payment verification failed (HTTP ${response.status}).`
          );

          // Definitive client errors should not be retried.
          if (
            response.status >= 400 &&
            response.status < 500 &&
            ![401, 408, 409, 429].includes(response.status)
          ) {
            err.final = true;
            throw err;
          }

          lastError = err;
        } catch (error) {
          if (error.final) throw error;
          lastError = error;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, attempt * 1500)
        );
      }

      throw (
        lastError || new Error("Payment verification failed.")
      );
    },
    [obtainToken]
  );

  useEffect(() => {
    let mounted = true;

    async function loadInvoice() {
      if (!id) {
        setInvoiceError("Invoice ID is missing.");
        setLoadingInvoice(false);
        return;
      }

      setLoadingInvoice(true);
      setInvoiceError(null);

      try {
        const data = await fetchInvoice(id);

        if (mounted) {
          setInvoice(data);
        }
      } catch (error) {
        console.error("Invoice fetch error:", error);

        if (mounted) {
          setInvoiceError(error.message);
          setInvoice(null);
        }
      } finally {
        if (mounted) {
          setLoadingInvoice(false);
        }
      }
    }

    loadInvoice();

    return () => {
      mounted = false;
    };
  }, [id, fetchInvoice]);

  /* ---------------- DEFAULT PAY AMOUNT = REMAINING BALANCE ---------------- */

  useEffect(() => {
    if (!invoice) return;

    const remaining = Math.max(
      round2(
        Number(invoice.total || 0) -
          Number(invoice.paidAmount || 0)
      ),
      0
    );

    setPayAmount(remaining > 0 ? String(remaining) : "");
  }, [invoice]);

  /* ---------------- FETCH PROFILE ---------------- */

  useEffect(() => {
    let mounted = true;

    async function fetchProfile() {
      setProfileLoading(true);

      try {
        const token = await obtainToken();

        if (!token) return;

        const response = await fetch(
          PROFILE_ENDPOINT,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) return;

        const json = await response.json();
        const data = json?.data ?? json;

        if (mounted && data) {
          const normalized = {
            businessName:
              data.businessName ??
              data.name ??
              defaultProfile.businessName,

            email: data.email ?? defaultProfile.email,

            address:
              data.address ?? defaultProfile.address,

            phone: data.phone ?? defaultProfile.phone,

            gst: data.gst ?? defaultProfile.gst,

            stampDataUrl:
              data.stampUrl ??
              data.stampDataUrl ??
              defaultProfile.stampDataUrl,

            signatureDataUrl:
              data.signatureUrl ??
              data.signatureDataUrl ??
              defaultProfile.signatureDataUrl,

            logoDataUrl:
              data.logoUrl ??
              data.logoDataUrl ??
              defaultProfile.logoDataUrl,

            defaultTaxPercent:
              Number.isFinite(
                Number(data.defaultTaxPercent)
              )
                ? Number(data.defaultTaxPercent)
                : defaultProfile.defaultTaxPercent,

            signatureName:
              data.signatureOwnerName ??
              data.signatureName ??
              defaultProfile.signatureName,

            signatureTitle:
              data.signatureOwnerTitle ??
              data.signatureTitle ??
              defaultProfile.signatureTitle,
          };

          setProfile(normalized);
          writeJSON("business_profile", normalized);
        }
      } catch (error) {
        console.error("Profile fetch error:", error);
      } finally {
        if (mounted) {
          setProfileLoading(false);
        }
      }
    }

    const stored = readJSON("business_profile", null);

    if (!stored) {
      fetchProfile();
    }

    return () => {
      mounted = false;
    };
  }, [obtainToken]);

  /* ---------------- DOCUMENT TITLE ---------------- */

  useEffect(() => {
    if (!invoice) return;

    const invoiceNumber =
      invoice.invoiceNumber || invoice.id;

    const safe =
      `Invoice-${String(invoiceNumber).replace(
        /[^\w\-_.() ]/g,
        "_"
      )}`;

    const previousTitle = prevTitleRef.current;

    document.title = safe;

    return () => {
      document.title = previousTitle;
    };
  }, [invoice]);

  /* ---------------- PRINT ---------------- */

  const handlePrint = useCallback(() => {
    const invoiceNumber =
      invoice?.invoiceNumber || invoice?.id || "invoice";

    const safe =
      `Invoice-${String(invoiceNumber).replace(
        /[^\w\-_.() ]/g,
        "_"
      )}`;

    const previousTitle = document.title;

    document.title = safe;

    window.print();

    setTimeout(() => {
      document.title = previousTitle;
    }, 500);
  }, [invoice]);

  /* ---------------- PAYMENT ---------------- */

  const handlePayment = async () => {
    if (payingRef.current || paymentLoading) return;

    if (!isSignedIn) {
      alert("Please sign in before making a payment.");
      return;
    }

    if (!API_BASE) {
      alert(
        "Payment configuration is missing (VITE_API_BASE). Please contact support."
      );
      return;
    }

    if (!window.Razorpay) {
      alert(
        "Razorpay Checkout is not loaded. Please refresh the page."
      );
      return;
    }

    const invoiceId = invoice?._id || invoice?.id;

    if (!invoiceId) {
      alert("Invalid invoice.");
      return;
    }

    if (invoice.status === "paid") {
      alert("This invoice is already paid.");
      return;
    }

    const remaining = Math.max(
      round2(
        Number(invoice.total || 0) -
          Number(invoice.paidAmount || 0)
      ),
      0
    );

    const amountToPay = round2(Number(payAmount));

    if (!Number.isFinite(amountToPay) || amountToPay < 1) {
      alert("Please enter an amount of at least 1.00.");
      return;
    }

    if (amountToPay > remaining + 0.001) {
      alert(
        `The amount cannot exceed the remaining balance (${currencyFmt(
          remaining,
          invoice.currency
        )}).`
      );
      return;
    }

    payingRef.current = true;
    setPaymentLoading(true);

    const finish = () => {
      payingRef.current = false;
      setPaymentLoading(false);
    };

    const clientInfo = normalizeClient(invoice.client);

    try {
      const token = await obtainToken();

      if (!token) {
        throw new Error("Please sign in again.");
      }

      /* -------- CREATE ORDER -------- */

      const orderResponse = await fetch(
        `${API_BASE}/api/payment/create-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            invoiceId,
            amount: amountToPay,
          }),
        }
      );

      let orderData = null;

      try {
        orderData = await orderResponse.json();
      } catch {}

      if (
        !orderResponse.ok ||
        !orderData?.success ||
        !orderData?.order
      ) {
        throw new Error(
          orderData?.message ||
            `Payment initialization failed (HTTP ${orderResponse.status}).`
        );
      }

      const order = orderData.order;

      // The backend's key always matches its secret (test vs live).
      const checkoutKey = orderData.keyId || RAZORPAY_KEY_ID;

      if (!checkoutKey) {
        throw new Error(
          "Razorpay public key is not available. Please contact support."
        );
      }

      /* -------- POST-PAYMENT HELPERS -------- */

      const paidBefore = round2(Number(invoice.paidAmount || 0));

      const showSuccess = (freshInvoice) => {
        const freshRemaining = Math.max(
          round2(
            Number(freshInvoice.total || 0) -
              Number(freshInvoice.paidAmount || 0)
          ),
          0
        );

        alert(
          `Payment successful!\n\nPaid: ${currencyFmt(
            freshInvoice.paidAmount,
            freshInvoice.currency
          )}\nRemaining: ${currencyFmt(
            freshRemaining,
            freshInvoice.currency
          )}\nStatus: ${freshInvoice.status}`
        );
      };

      // The money may already be recorded (e.g. by the Razorpay webhook)
      // even if the verify call failed or timed out. Poll the database
      // for up to ~30s before telling the user anything went wrong.
      const waitForRecordedPayment = async () => {
        for (let attempt = 0; attempt < 8; attempt++) {
          try {
            const freshInvoice = await fetchInvoice(invoiceId);

            if (
              round2(Number(freshInvoice.paidAmount || 0)) >
              paidBefore
            ) {
              return freshInvoice;
            }
          } catch (pollError) {
            console.error("Payment poll error:", pollError);
          }

          await new Promise((resolve) => setTimeout(resolve, 4000));
        }

        return null;
      };

      /* -------- CHECKOUT OPTIONS -------- */

      const options = {
        key: checkoutKey,

        amount: order.amount,

        currency: order.currency || "INR",

        name: "Invoice Genius",

        description:
          `Invoice Payment - ${invoice.invoiceNumber}`,

        order_id: order.id,

        prefill: {
          name: clientInfo.name || "",
          email: clientInfo.email || "",
          contact: clientInfo.phone || "",
        },

        theme: {
          color: "#16a34a",
        },

        modal: {
          ondismiss: function () {
            console.log("Razorpay Checkout closed.");
            finish();
          },
        },

        /* -------- PAYMENT SUCCESS HANDLER -------- */

        handler: async function (response) {
          try {
            await verifyPaymentWithRetry({
              invoiceId,
              razorpay_payment_id:
                response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
            });

            /* -------- REFRESH FROM DATABASE -------- */

            const freshInvoice = await fetchInvoice(invoiceId);

            setInvoice(freshInvoice);

            showSuccess(freshInvoice);
          } catch (error) {
            console.error(
              "Payment verification error:",
              error
            );

            // Verification failed or timed out, but the payment may
            // still have been recorded. Confirm before alarming anyone.
            const recorded = await waitForRecordedPayment();

            if (recorded) {
              setInvoice(recorded);
              showSuccess(recorded);
            } else {
              alert(
                `Your payment was received by Razorpay but is still being confirmed.\n\nReference: ${
                  response?.razorpay_payment_id || "N/A"
                }\n\nDo NOT pay again. Refresh this page in a minute - the invoice will update automatically.`
              );

              try {
                const freshInvoice = await fetchInvoice(invoiceId);
                setInvoice(freshInvoice);
              } catch (refreshError) {
                console.error(
                  "Invoice refresh error:",
                  refreshError
                );
              }
            }
          } finally {
            finish();
          }
        },
      };

      /* -------- OPEN CHECKOUT -------- */

      const razor = new window.Razorpay(options);

      // Razorpay keeps its modal open and lets the user retry after a
      // failed attempt, so we only log here. ondismiss resets the button.
      razor.on("payment.failed", function (response) {
        console.error(
          "Razorpay payment attempt failed:",
          response?.error
        );
      });

      razor.open();
    } catch (error) {
      console.error("Payment Error:", error);

      alert(error.message || "Payment initialization failed.");

      finish();
    }
  };

  /* ---------------- LOADING ---------------- */

  if (loadingInvoice || profileLoading) {
    return <div className="p-6">Loading...</div>;
  }

  /* ---------------- EMPTY STATE ---------------- */

  if (!invoice) {
    return (
      <div className={invoicePreviewStyles.pageContainer}>
        <div className={invoicePreviewStyles.emptyStateContainer}>
          <div className={invoicePreviewStyles.emptyStateCard}>
            <div className={invoicePreviewStyles.emptyStateIconContainer}>
              <svg
                className={invoicePreviewStyles.emptyStateIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>

            <h3 className={invoicePreviewStyles.emptyStateTitle}>
              Invoice Not Found
            </h3>

            <p className={invoicePreviewStyles.emptyStateMessage}>
              {invoiceError ||
                "The invoice does not exist or may have been deleted."}
            </p>

            <div className="mt-6">
              <button
                onClick={() => navigate(-1)}
                className={invoicePreviewStyles.emptyStateButton}
              >
                <ArrowLeftIcon className="w-4 h-4" />
                Back to Invoices
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- INVOICE DATA ---------------- */

  const items = Array.isArray(invoice.items)
    ? invoice.items.filter(Boolean)
    : [];

  const subtotal = Number(invoice.subtotal || 0);

  const taxPercent = Number(invoice.taxPercent || 0);

  const tax = Number(invoice.tax || 0);

  const total = Number(invoice.total || 0);

  const paidAmount = Number(invoice.paidAmount || 0);

  const remainingAmount = Math.max(
    round2(total - paidAmount),
    0
  );

  const logo = resolveImageUrl(
    invoice.logoDataUrl ??
      profile.logoDataUrl ??
      null
  );

  const stamp = resolveImageUrl(
    invoice.stampDataUrl ??
      profile.stampDataUrl ??
      null
  );

  const signature = resolveImageUrl(
    invoice.signatureDataUrl ??
      profile.signatureDataUrl ??
      null
  );

  const signatureName =
    invoice.signatureName ??
    profile.signatureName ??
    "";

  const signatureTitle =
    invoice.signatureTitle ??
    profile.signatureTitle ??
    "";

  const client = normalizeClient(invoice.client);

  const invoiceCurrency = invoice.currency || "INR";

  const displayStatus = {
    partially_paid: "Partially Paid",
    unpaid: "Unpaid",
    paid: "Paid",
    draft: "Draft",
    overdue: "Overdue",
  }[invoice.status] || "Draft";

  /* ---------------- RENDER ---------------- */

  return (
    <div className={invoicePreviewStyles.pageContainer}>
      <div className={invoicePreviewStyles.container}>

        {/* HEADER ACTIONS */}

        <div
          className={`${invoicePreviewStyles.headerContainer} ${invoicePreviewStyles.noPrint}`}
        >
          <div>
            <h1 className={invoicePreviewStyles.headerTitle}>
              Invoice Preview
            </h1>

            <p className={invoicePreviewStyles.headerSubtitle}>
              Review invoice{" "}
              <span className={invoicePreviewStyles.headerInvoiceNumber}>
                #{invoice.invoiceNumber || invoice.id}
              </span>
            </p>
          </div>

          <div className={invoicePreviewStyles.headerActions}>
            <button
              onClick={() =>
                navigate(
                  `/app/invoices/${invoice.id}/edit`,
                  { state: { invoice } }
                )
              }
              className={invoicePreviewStyles.editInvoiceButton}
            >
              <EditIcon className="w-4 h-4" />
              Edit Invoice
            </button>

            <button
              onClick={handlePrint}
              className={invoicePreviewStyles.printButton}
            >
              <PrintIcon className="w-4 h-4" />
              Print / Save as PDF
            </button>

            {invoice.status !== "paid" && remainingAmount > 0 && (
              <>
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="pay-amount"
                    className="text-sm text-gray-600 whitespace-nowrap"
                  >
                    Pay amount
                  </label>

                  <input
                    id="pay-amount"
                    type="number"
                    inputMode="decimal"
                    min="1"
                    max={remainingAmount}
                    step="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    disabled={paymentLoading}
                    className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                  />
                </div>

                <button
                  onClick={handlePayment}
                  disabled={paymentLoading}
                  className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg"
                >
                  {paymentLoading
                    ? "Processing..."
                    : `Pay ${currencyFmt(
                        Number(payAmount) || 0,
                        invoiceCurrency
                      )}`}
                </button>
              </>
            )}
          </div>
        </div>

        {/* PRINTABLE INVOICE */}

        <div
          id="print-area"
          className={invoicePreviewStyles.printArea}
        >
          {/* HEADER */}

          <div className={invoicePreviewStyles.printHeader}>
            <div className={invoicePreviewStyles.companyInfo}>
              {logo && (
                <img
                  src={logo}
                  alt="Company Logo"
                  className={invoicePreviewStyles.logo}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              )}

              <div>
                <div className={invoicePreviewStyles.invoiceFromLabel}>
                  Invoice From
                </div>

                <div className={invoicePreviewStyles.companyName}>
                  {invoice.fromBusinessName ||
                    profile.businessName ||
                    "—"}
                </div>

                <div className={invoicePreviewStyles.companyAddress}>
                  {invoice.fromAddress ||
                    profile.address ||
                    "—"}
                </div>

                <div className={invoicePreviewStyles.companyContact}>
                  {(invoice.fromEmail || profile.email) && (
                    <div>
                      <strong>Email:</strong>{" "}
                      {invoice.fromEmail || profile.email}
                    </div>
                  )}

                  {(invoice.fromPhone || profile.phone) && (
                    <div>
                      <strong>Phone:</strong>{" "}
                      {invoice.fromPhone || profile.phone}
                    </div>
                  )}

                  {(invoice.fromGst || profile.gst) && (
                    <div>
                      <strong>GST:</strong>{" "}
                      {invoice.fromGst || profile.gst}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={invoicePreviewStyles.invoiceInfo}>
              <div className={invoicePreviewStyles.invoiceTitle}>
                INVOICE
              </div>

              <div className={invoicePreviewStyles.invoiceNumber}>
                #{invoice.invoiceNumber || invoice.id}
              </div>

              <div className={invoicePreviewStyles.invoiceDetails}>
                <div className={invoicePreviewStyles.invoiceDetailRow}>
                  <span className={invoicePreviewStyles.invoiceDetailLabel}>
                    Invoice Date:
                  </span>

                  <span className={invoicePreviewStyles.invoiceDetailValue}>
                    {formatDate(invoice.issueDate)}
                  </span>
                </div>

                <div className={invoicePreviewStyles.invoiceDetailRow}>
                  <span className={invoicePreviewStyles.invoiceDetailLabel}>
                    Due Date:
                  </span>

                  <span className={invoicePreviewStyles.invoiceDetailValue}>
                    {formatDate(invoice.dueDate)}
                  </span>
                </div>

                <div className={invoicePreviewStyles.invoiceDetailRow}>
                  <span className={invoicePreviewStyles.invoiceDetailLabel}>
                    Status:
                  </span>

                  <span
                    className={`${
                      invoicePreviewStyles.invoiceDetailValue
                    } ${
                      invoice.status === "paid"
                        ? invoicePreviewStyles.statusPaid
                        : invoice.status === "partially_paid"
                        ? "text-amber-600 font-semibold"
                        : invoice.status === "unpaid"
                        ? invoicePreviewStyles.statusUnpaid
                        : invoice.status === "overdue"
                        ? invoicePreviewStyles.statusOverdue
                        : invoicePreviewStyles.statusDraft
                    }`}
                  >
                    {displayStatus}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* CLIENT AND PAYMENT DETAILS */}

          <div className={invoicePreviewStyles.section}>
            <div className={invoicePreviewStyles.flexContainer}>
              <div className="flex-1">
                <div className={invoicePreviewStyles.billToLabel}>
                  Bill To
                </div>

                <div className={invoicePreviewStyles.clientDetails}>
                  <div className={invoicePreviewStyles.clientName}>
                    {client.name || "Client Name"}
                  </div>

                  {client.address && (
                    <div className={invoicePreviewStyles.clientText}>
                      {client.address}
                    </div>
                  )}

                  {client.email && (
                    <div className={invoicePreviewStyles.clientText}>
                      {client.email}
                    </div>
                  )}

                  {client.phone && (
                    <div className={invoicePreviewStyles.clientText}>
                      {client.phone}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1">
                <div className={invoicePreviewStyles.paymentDetailsLabel}>
                  Payment Details
                </div>

                <div className={invoicePreviewStyles.paymentDetails}>
                  <div className={invoicePreviewStyles.paymentDetailRow}>
                    <span className={invoicePreviewStyles.paymentDetailLabel}>
                      Currency:
                    </span>

                    <span className={invoicePreviewStyles.paymentDetailValue}>
                      {invoiceCurrency}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ITEMS TABLE */}

          <div className={invoicePreviewStyles.section}>
            <div className="overflow-x-auto">
              <table className={invoicePreviewStyles.table}>
                <thead>
                  <tr>
                    <th style={{ width: "50%", minWidth: "150px" }}>
                      Description
                    </th>

                    <th
                      style={{
                        width: "15%",
                        textAlign: "right",
                        minWidth: "70px",
                      }}
                    >
                      Quantity
                    </th>

                    <th
                      style={{
                        width: "20%",
                        textAlign: "right",
                        minWidth: "90px",
                      }}
                    >
                      Unit Price
                    </th>

                    <th
                      style={{
                        width: "15%",
                        textAlign: "right",
                        minWidth: "80px",
                      }}
                    >
                      Total
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {items.length ? (
                    items.map((item, index) => (
                      <tr key={item.id || index}>
                        <td className={invoicePreviewStyles.tableCell}>
                          {item.description || "Item Description"}
                        </td>

                        <td style={{ textAlign: "right" }}>
                          {item.qty || 0}
                        </td>

                        <td style={{ textAlign: "right" }}>
                          {currencyFmt(
                            item.unitPrice,
                            invoiceCurrency
                          )}
                        </td>

                        <td
                          style={{
                            textAlign: "right",
                            fontWeight: "600",
                          }}
                        >
                          {currencyFmt(
                            Number(item.qty || 0) *
                              Number(item.unitPrice || 0),
                            invoiceCurrency
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan="4"
                        style={{
                          textAlign: "center",
                          padding: "20px",
                          color: "#6b7280",
                        }}
                      >
                        No items added to this invoice
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* NOTES */}

          {invoice.notes && (
            <div className={invoicePreviewStyles.section}>
              <div className={invoicePreviewStyles.notesLabel}>
                Notes
              </div>

              <div className={invoicePreviewStyles.notesContent}>
                {invoice.notes}
              </div>
            </div>
          )}

          {/* TOTALS, SIGNATURE AND STAMP */}

          <div className={invoicePreviewStyles.section}>
            <div className={invoicePreviewStyles.flexContainer}>
              <div className="flex-1">
                <div className={invoicePreviewStyles.signatureLabel}>
                  Authorized Signature
                </div>

                {signature ? (
                  <div className={invoicePreviewStyles.signatureContainer}>
                    <img
                      src={signature}
                      alt="Authorized Signature"
                      className={invoicePreviewStyles.signatureImage}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />

                    {(signatureName || signatureTitle) && (
                      <div className="mt-2 text-sm text-gray-700">
                        <div className={invoicePreviewStyles.signatureName}>
                          {signatureName}
                        </div>

                        {signatureTitle && (
                          <div className={invoicePreviewStyles.signatureTitle}>
                            {signatureTitle}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={invoicePreviewStyles.placeholderContainer}>
                    No Signature
                  </div>
                )}
              </div>

              <div className="flex-1 text-center">
                <div className={invoicePreviewStyles.stampLabel}>
                  Company Stamp
                </div>

                {stamp ? (
                  <img
                    src={stamp}
                    alt="Company Stamp"
                    className={invoicePreviewStyles.stampImage}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <div className={invoicePreviewStyles.placeholderContainer}>
                    No Stamp
                  </div>
                )}
              </div>

              <div className="flex-1">
                <div className={invoicePreviewStyles.totalsContainer}>
                  <div className="space-y-2">
                    <div className={invoicePreviewStyles.totalsRow}>
                      <span className={invoicePreviewStyles.totalsLabel}>
                        Subtotal
                      </span>

                      <span className={invoicePreviewStyles.totalsValue}>
                        {currencyFmt(subtotal, invoiceCurrency)}
                      </span>
                    </div>

                    <div className={invoicePreviewStyles.totalsRow}>
                      <span className={invoicePreviewStyles.totalsLabel}>
                        Tax ({taxPercent}%)
                      </span>

                      <span className={invoicePreviewStyles.totalsValue}>
                        {currencyFmt(tax, invoiceCurrency)}
                      </span>
                    </div>

                    <div className={invoicePreviewStyles.totalDivider}>
                      <div className={invoicePreviewStyles.totalsRow}>
                        <span className={invoicePreviewStyles.totalAmountLabel}>
                          Total Amount
                        </span>

                        <span className={invoicePreviewStyles.totalAmountValue}>
                          {currencyFmt(total, invoiceCurrency)}
                        </span>
                      </div>

                      <div className={invoicePreviewStyles.totalsRow}>
                        <span className="text-green-600 font-medium">
                          Paid Amount
                        </span>

                        <span className="text-green-600 font-semibold">
                          {currencyFmt(paidAmount, invoiceCurrency)}
                        </span>
                      </div>

                      <div className={invoicePreviewStyles.totalsRow}>
                        <span className="text-red-600 font-medium">
                          Remaining Amount
                        </span>

                        <span className="text-red-600 font-semibold">
                          {currencyFmt(
                            remainingAmount,
                            invoiceCurrency
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* FOOTER */}

          <div className={invoicePreviewStyles.footer}>
            <div className={invoicePreviewStyles.footerText}>
              {invoice.terms ||
                invoice.footnote ||
                "Thank you for your business. We appreciate your trust in our services."}
            </div>

            <div className={invoicePreviewStyles.footerSubText}>
              Invoice generated by InvoiceAI • {formatDate(new Date())}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}