import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";

import AppShell from "./component/AppShell";
import Dashboard from "./pages/Dashboard";
import CreateInvoice from "./pages/CreateInvoice";
import Invoices from "./pages/Invoices";
import InvoicePreview from "./component/InvoicePreview";
import BussinessProfile from "./pages/BussinessProfile";

const ClerkProtected = ({ children }) => (
  <>
    <SignedIn>{children}</SignedIn>
    <SignedOut>
      <RedirectToSignIn />
    </SignedOut>
  </>
);

const App = () => {
  return (
    <div className="min-h-screen max-w-full overflow-x-hidden">
      <Routes>

        {/* Public Page */}
        <Route path="/" element={<Home />} />

        {/* Protected App */}
        <Route
          path="/app"
          element={
            <ClerkProtected>
              <AppShell />
            </ClerkProtected>
          }
        >
          <Route index element={<Dashboard />} />

          <Route path="dashboard" element={<Dashboard />} />

          <Route path="invoices" element={<Invoices />} />

          <Route path="create-invoice" element={<CreateInvoice />} />

          <Route path="invoices/new" element={<CreateInvoice />} />

          <Route path="invoices/:id/preview" element={<InvoicePreview />} />

          <Route path="invoices/:id/edit" element={<CreateInvoice />} />

          {/* BUSINESS PROFILE */}
          <Route path="business-profile" element={<BussinessProfile />} />

        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </div>
  );
};

export default App;

