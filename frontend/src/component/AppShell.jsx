import React, { useState, useEffect } from "react";
import { appShellStyles } from "../assets/dummyStyles";
import logo from "../assets/logo.png";
import { useClerk, useUser } from "@clerk/clerk-react";
import { useNavigate, NavLink, Link, Outlet } from "react-router-dom";

const AppShell = () => {
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const { user } = useUser();

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    localStorage.setItem("sidebar_collapsed", collapsed ? "true" : "false");
  }, [collapsed]);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleSidebar = () => setCollapsed(!collapsed);

  // --- Logic calculated once per render ---
  const displayName = (() => {
    if (!user) return "User";
    const name = user.fullName || user.firstName || user.username || "";
    return name.trim() || (user?.primaryEmailAddress?.emailAddress || "").split("@")[0] || "User";
  })();

  const firstName = displayName.split(" ").filter(Boolean)[0] || "User";

  const initials = (() => {
    const parts = displayName.split(" ").filter(Boolean);
    if (parts.length === 0) return "U";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  })();

  const logout = async () => {
    try {
      await signOut();
      navigate("/login");
    } catch (error) {
      console.warn("SignOut Error", error);
    }
  };

  // --- Icon Components ---
  const DashboardIcon = ({ className = "w-5 h-5" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );

  const InvoiceIcon = ({ className = "w-5 h-5" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );

  const CreateIcon = ({ className = "w-5 h-5" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );

  const ProfileIcon = ({ className = "w-5 h-5" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );

  const LogoutIcon = ({ className = "w-5 h-5" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );

  const CollapseIcon = ({ isCollapsed }) => (
    <svg className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? "rotate-180" : ""}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
    </svg>
  );

  const SidebarLink = ({ to, icon, children }) => (
    <NavLink
      to={to}
      onClick={() => setMobileOpen(false)} // Close mobile menu on click
      className={({ isActive }) => `
        ${appShellStyles.sidebarLink}
        ${collapsed ? appShellStyles.sidebarLinkCollapsed : ""}
        ${isActive ? appShellStyles.sidebarLinkActive : appShellStyles.sidebarLinkInactive}
      `}
    >
      {({ isActive }) => (
        <>
          <div className={`${appShellStyles.sidebarIcon} ${
              isActive ? appShellStyles.sidebarIconActive : appShellStyles.sidebarIconInactive
            }`}>
            {icon}
          </div>
          {!collapsed && <span className={appShellStyles.sidebarText}>{children}</span>}
          {!collapsed && isActive && <div className={appShellStyles.sidebarActiveIndicator} />}
        </>
      )}
    </NavLink>
  );

  return (
    <div className={appShellStyles.root}>
      <div className={appShellStyles.layout}>
        
        {/* SIDEBAR */}
        <aside className={`${appShellStyles.sidebar} 
          ${collapsed ? appShellStyles.sidebarCollapsed : appShellStyles.sidebarExpanded}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} 
          fixed lg:relative z-50 transition-transform duration-300`}>
          
          <div className={appShellStyles.sidebarContainer}>
            <div className={appShellStyles.logoContainer}>
              <Link to="/" className={appShellStyles.logoLink}>
                <img src={logo} alt="logo" className={appShellStyles.logoImage} />
                {!collapsed && <span className={appShellStyles.logoText}>InvoiceAI</span>}
              </Link>
            </div>

            <nav className={appShellStyles.nav}>
              <SidebarLink to="/app/dashboard" icon={<DashboardIcon />}>Dashboard</SidebarLink>
              <SidebarLink to="/app/invoices" icon={<InvoiceIcon />}>Invoices</SidebarLink>
              <SidebarLink to="/app/create-invoice" icon={<CreateIcon />}>Create Invoice</SidebarLink>
              <SidebarLink to="/app/business-profile" icon={<ProfileIcon />}>Business Profile</SidebarLink>
            </nav>

            <div className={appShellStyles.userSection}>
              <button onClick={logout} className={appShellStyles.logoutButton}>
                <LogoutIcon />
                {!collapsed && <span>Logout</span>}
              </button>

              <button onClick={toggleSidebar} className={appShellStyles.collapseButtonInner}>
                {!collapsed && <span>Collapse</span>}
                <CollapseIcon isCollapsed={collapsed} />
              </button>
            </div>
          </div>
        </aside>

        {/* MOBILE OVERLAY */}
        {mobileOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 lg:hidden" 
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className={`${appShellStyles.header} ${scrolled ? appShellStyles.headerScrolled : appShellStyles.headerNotScrolled}`}>
            <div className="w-full px-4 sm:px-6 lg:px-8"> 
              <div className="flex items-center justify-between h-16 sm:h-20">

                {/* LEFT: Welcome Area */}
                <div className="flex items-center gap-3">
                  <button onClick={() => setMobileOpen(true)} className={`${appShellStyles.mobileMenuButton} lg:hidden`}>
                    <svg className={appShellStyles.mobileMenuIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>

                  <button onClick={toggleSidebar} className={`${appShellStyles.desktopCollapseButton} hidden lg:block`}>
                    <CollapseIcon isCollapsed={collapsed}/>
                  </button>

                  <div className="hidden sm:block">
                    <h2 className="text-sm font-medium text-gray-500">
                      Welcome back, <span className="text-gray-900 font-bold">{firstName}</span>
                    </h2>
                  </div>
                </div>

                {/* RIGHT: Create Button + Profile */}
                <div className="flex items-center gap-4 sm:gap-6 ml-auto">
                  <button
                    onClick={() => navigate("/app/create-invoice")}
                    className={appShellStyles.ctaButton}
                  >
                    <CreateIcon className={appShellStyles.ctaIcon}/>
                    <span className="hidden xs:inline">Create Invoice</span>
                    <span className="xs:hidden">Create</span>
                  </button>

                  <div className="flex items-center gap-3 border-l border-gray-200 pl-4 sm:pl-6">
                    <div className="text-right hidden md:block">
                      <p className="text-sm font-bold text-gray-900 leading-tight">{displayName}</p>
                      <p className="text-xs text-gray-500">{user?.primaryEmailAddress?.emailAddress}</p>
                    </div>

                    <div className={appShellStyles.userAvatarContainer}>
                      <div className={appShellStyles.userAvatar}>
                        {initials}
                        <div className={appShellStyles.userAvatarBorder}/>
                      </div>
                      <div className={appShellStyles.userStatus}></div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </header>

          {/* PAGE CONTENT */}
          <main className={`${appShellStyles.main} flex-1 overflow-auto p-4 sm:p-6 lg:p-8`}>
            <div className={appShellStyles.mainContainer}>
               <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default AppShell;

