 import React, { useCallback, useEffect, useState, useMemo } from "react";
import { dashboardStyles } from "../assets/dummyStyles";
import { useAuth } from "@clerk/clerk-react";
import KpiCard from "../component/KpiCard";
import { EyeIcon, FileTextIcon } from "lucide-react";
import StatusBadge from "../component/StatusBadge";
import { useNavigate, useLocation } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE;

/* normalize client object */
function normalizeClient(raw) {
  if (!raw) return { name: "", email: "", address: "", phone: "" };
  if (typeof raw === "string") return { name: raw, email: "", address: "", phone: "" };
  if (typeof raw === "object") {
    return {
      name: raw.name ?? raw.company ?? raw.client ?? "Unknown Client",
      email: raw.email ?? raw.emailAddress ?? "",
      address: raw.address ?? "",
      phone: raw.phone ?? raw.contact ?? "",
    };
  }
  return { name: "", email: "", address: "", phone: "" };
}

function currencyFmt(amount = 0, currency = "INR") {
  try {
    const n = Number(amount || 0);
    if (currency === "INR") {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
      }).format(n);
    }
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(n);
  } catch {
    return `${currency} ${amount}`;
  }
}

const Dashboard = () => {
  const navigate = useNavigate();
const location = useLocation();
  const { getToken, isSignedIn } = useAuth();

  const [storedInvoices, setStoredInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [businessProfile, setBusinessProfile] = useState(null);

  // Helper functions for the table
  const getClientName = (inv) => normalizeClient(inv.client).name;
  const getClientInitial = (inv) => getClientName(inv).charAt(0).toUpperCase() || "?";
  const formatDate = (dateStr) => (dateStr ? new Date(dateStr).toLocaleDateString() : "-");
const openInvoice = (inv) => {
  const invoiceId = inv.id || inv._id;
  navigate(`/app/invoices/${invoiceId}/edit`);
};

  // Get the 5 most recent invoices
  const recent = useMemo(() => storedInvoices.slice(0, 5), [storedInvoices]);

const obtainToken = useCallback(async () => {
  if (!getToken) return null;

  try {
    const token = await getToken();
    return token;
  } catch {
    return null;
  }
}, [getToken]);
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await obtainToken();
      const headers = { Accept: "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/api/invoices`, {
        method: "GET",
        headers,
      });

      const json = await res.json().catch(() => null);
      if (res.status === 401) {
        setError("Unauthorized. Please sign in.");
        setStoredInvoices([]);
        return;
      }
      if (!res.ok) {
        throw new Error(json?.message || `Failed to fetch (${res.status})`);
      }

      const raw = json?.data || [];
      const mapped = (Array.isArray(raw) ? raw : []).map((inv) => ({
        ...inv,
        id: inv._id,
        amount: Number(inv.total ?? inv.amount ?? 0),
        currency: (inv.currency || "INR").toUpperCase(),
        status: typeof inv.status === "string" 
          ? inv.status.charAt(0).toUpperCase() + inv.status.slice(1) 
          : "Draft",
      }));

      setStoredInvoices(mapped);
    } catch (err) {
      setError(err?.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, [obtainToken]);

  const fetchBusinessProfile = useCallback(async () => {
    try {
      const token = await obtainToken();
      if (!token) return;
     const res = await fetch(`${API_BASE}/api/business-profile/me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      const json = await res.json().catch(() => null);
      if (json?.data) setBusinessProfile(json.data);
    } catch (err) {
      console.warn("Failed to fetch business profile:", err);
    }
  }, [obtainToken]);
useEffect(() => {
  if (!isSignedIn) return;
  fetchInvoices();
  fetchBusinessProfile();
}, [isSignedIn, location.pathname, fetchInvoices, fetchBusinessProfile]);
  const kpis = useMemo(() => {
    const totalInvoices = storedInvoices.length;
    let totalPaid = 0, totalUnpaid = 0, paidCount = 0;

    storedInvoices.forEach((inv) => {
      const amount = Number(inv.amount || 0);
      if (inv.status === "Paid") {
        totalPaid += amount;
        paidCount++;
      } else if (inv.status === "Unpaid" || inv.status === "Overdue") {
        totalUnpaid += amount;
      }
    });

    return {
      totalInvoices,
      totalPaid,
      totalUnpaid,
      paidCount,
      paidPercentage: totalInvoices > 0 ? (paidCount / totalInvoices) * 100 : 0,
    };
  }, [storedInvoices]);

  return (
    <div className={dashboardStyles.pageContainer}>
      <div className={dashboardStyles.headerContainer}>
        <h1 className={dashboardStyles.headerTitle}>Dashboard Overview</h1>
        <p className={dashboardStyles.headerSubTitle}>
          Track user invoicing performance and business insights
        </p>
      </div>

      {loading ? (
        <div className="p-6">Loading invoices...</div>
      ) : error ? (
        <div className="p-6">
          <div className="text-red-600 mb-3">Error: {error}</div>
          <div className="flex gap-2">
            <button onClick={fetchInvoices} className="px-3 py-1 bg-blue-600 text-white rounded">Retry</button>
            {error.toLowerCase().includes("unauthorized") && (
              <button onClick={() => navigate("/login")} className="px-3 py-1 bg-gray-700 text-white rounded">Sign In</button>
            )}
          </div>
        </div>
      ) : null}

      <div className={dashboardStyles.kpiGrid}>
        <KpiCard title="Total Invoices" value={kpis.totalInvoices} hint="Active Invoices" iconType="document" trend={8.5} />
        <KpiCard title="Total Paid" value={currencyFmt(kpis.totalPaid, "INR")} hint="Received Amount (INR)" iconType="revenue" trend={12.2} />
        <KpiCard title="Total Unpaid" value={currencyFmt(kpis.totalUnpaid, "INR")} hint="Outstanding Balance (INR)" iconType="clock" trend={-3.1} />
      </div>

      <div className={dashboardStyles.mainGrid}>
        <div className={dashboardStyles.sidebarColumn}>
          <div className={dashboardStyles.quickStatsCard}>
            <h3 className={dashboardStyles.quickStatsTitle}>Quick Stats</h3>
            <div className="space-y-3">
              <div className={dashboardStyles.quickStatsRow}>
                <span className={dashboardStyles.quickStatsLabel}>Paid Rate</span>
                <span className={dashboardStyles.quickStatsValue}>{kpis.paidPercentage.toFixed(1)}%</span>
              </div>
              <div className={dashboardStyles.quickStatsRow}>
                <span className={dashboardStyles.quickStatsLabel}>Avg. Invoice</span>
                <span className={dashboardStyles.quickStatsValue}>
                  {currencyFmt(kpis.totalInvoices > 0 ? (kpis.totalPaid + kpis.totalUnpaid) / kpis.totalInvoices : 0, "INR")}
                </span>
              </div>
              <div className={dashboardStyles.quickStatsRow}>
                <span className={dashboardStyles.quickStatsLabel}>Collection Eff</span>
                <span className={dashboardStyles.quickStatsValue}>{kpis.paidPercentage.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          <div className={dashboardStyles.cardContainer}>
            <div className="p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Quick Actions</h3>
              <div className={dashboardStyles.quickActionsContainer}>
                <button onClick={() => navigate("/app/create-invoice")} className={`${dashboardStyles.quickActionButton} ${dashboardStyles.quickActionBlue}`}>
                  <div className={`${dashboardStyles.quickActionIconContainer} ${dashboardStyles.quickActionIconBlue}`}>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14m-7-7h14" /></svg>
                  </div>
                  <span className={dashboardStyles.quickActionText}>Create Invoice</span>
                </button>
                <button onClick={() => navigate("/app/invoices")} className={`${dashboardStyles.quickActionButton} ${dashboardStyles.quickActionGray}`}>
                  <div className={`${dashboardStyles.quickActionIconContainer} ${dashboardStyles.quickActionIconGray}`}><FileTextIcon className="w-4 h-4" /></div>
                  <span className={dashboardStyles.quickActionText}>View All Invoices</span>
                </button>
                <button onClick={() => navigate("/app/business-profile")} className={`${dashboardStyles.quickActionButton} ${dashboardStyles.quickActionGray}`}>
                  <div className={`${dashboardStyles.quickActionIconContainer} ${dashboardStyles.quickActionIconGray}`}>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                  </div>
                  <span className={dashboardStyles.quickActionText}>Business Profile</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={dashboardStyles.contentColumn}>
          <div className={dashboardStyles.cardContainerOverflow}>
            <div className={dashboardStyles.tableHeader}>
              <div className={dashboardStyles.tableHeaderContent}>
                <div>
                  <h3 className={dashboardStyles.table?.title || "font-semibold text-lg"}>Recent Invoices</h3>
                  <p className={dashboardStyles.tableSubtitle}>Latest 5 Invoices from your Account</p>
                </div>
                <button onClick={() => navigate("/app/invoices")} className={dashboardStyles.tableActionButton}>
                  View All <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14m-7-7l7 7-7 7" /></svg>
                </button>
              </div>
            </div>
            <div className={dashboardStyles.tableContainer}>
              <table className={dashboardStyles.table}>
                <thead>
                  <tr className={dashboardStyles.tableHead}>
                    <th className={dashboardStyles.tableHeaderCell}>Client & ID</th>
                    <th className={dashboardStyles.tableHeaderCell}>Amount</th>
                    <th className={dashboardStyles.tableHeaderCell}>Status</th>
                    <th className={dashboardStyles.tableHeaderCell}>Due date</th>
                    <th className={dashboardStyles.tableHeaderCell}>Actions</th>
                  </tr>
                </thead>
                <tbody className={dashboardStyles.tableBody}>
                  {recent.map((inv) => (
                    <tr key={inv.id} className={dashboardStyles.tableRow} onClick={() => openInvoice(inv)}>
                      <td className={dashboardStyles.tableCell}>
                        <div className="flex items-center gap-3">
                          <div className={dashboardStyles.clientAvatar}>{getClientInitial(inv)}</div>
                          <div>
                            <div className={dashboardStyles.clientInfo}>{getClientName(inv)}</div>
                            <div className={dashboardStyles.clientSubInfo}>
  {inv.invoiceNumber || inv.id}
</div>
                          </div>
                        </div>
                      </td>
                      <td className={dashboardStyles.tableCell}>
                        <div className={dashboardStyles.amountCell}>{currencyFmt(inv.amount, inv.currency)}</div>
                      </td>
                      <td className={dashboardStyles.tableCell}>
                        <StatusBadge status={inv.status} size="Default" showIcon={true} />
                      </td>
                      <td className={dashboardStyles.tableCell}>
                        <div className={dashboardStyles.dateCell}>{formatDate(inv.dueDate)}</div>
                      </td>
                      <td className={dashboardStyles.tableCell}>
                        <div className="text-right">
                          <button onClick={(e) => { e.stopPropagation(); openInvoice(inv); }} className={dashboardStyles.actionButton}>
                            <EyeIcon className="w-4 h-4 mr-1 inline" /> View
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {recent.length === 0 && !loading && (
                    <tr>
                      <td colSpan="5" className={dashboardStyles.emptyState}>
                        <div className={dashboardStyles.emptyStateText}>
                          <FileTextIcon className={dashboardStyles.emptyStateIcon} />
                          <div className={dashboardStyles.emptyStateMessage}>No invoices yet</div>
                          <button onClick={() => navigate("/app/create-invoice")} className={dashboardStyles.emptyStateAction}>Create Your First Invoice</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

