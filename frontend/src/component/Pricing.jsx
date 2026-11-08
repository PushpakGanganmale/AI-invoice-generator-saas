import React, { useState } from 'react'
import { pricingStyles, pricingCardStyles } from '../assets/dummyStyles'
import { useNavigate } from 'react-router-dom'
import { useClerk, useAuth } from '@clerk/clerk-react'

const Pricing = () => {

  const [billingPeriod, setBillingPeriod] = useState("monthly");

  const clerk = useClerk();
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();

  const plans = {
    monthly: [
      {
        title: "Starter",
        price: "₹0",
        period: "month",
        description: "Perfect for freelancers and small projects",
        features: [
          "5 invoices per month",
          "Basic AI parsing",
          "Standard templates",
          "Email support",
          "PDF export",
        ],
        isPopular: false,
      },
      {
        title: "Professional",
        price: "₹499",
        period: "month",
        description: "For growing businesses and agencies",
        features: [
          "Unlimited invoices",
          "Advanced AI parsing",
          "Custom branding",
          "Priority support",
          "Advanced analytics",
          "Team collaboration (3 members)",
          "API access",
        ],
        isPopular: true,
      },
      {
        title: "Enterprise",
        price: "₹1,499",
        period: "month",
        description: "For large organizations with custom needs",
        features: [
          "Everything in Professional",
          "Unlimited team members",
          "Custom workflows",
          "Dedicated account manager",
          "SLA guarantee",
          "White-label solutions",
          "Advanced security",
        ],
        isPopular: false,
      },
    ],

    annual: [
      {
        title: "Starter",
        price: "₹0",
        period: "month",
        description: "Perfect for freelancers and small projects",
        features: [
          "5 invoices per month",
          "Basic AI parsing",
          "Standard templates",
          "Email support",
          "PDF export",
        ],
        isPopular: false,
      },
      {
        title: "Professional",
        price: "₹399",
        period: "month",
        description: "For growing businesses and agencies",
        features: [
          "Unlimited invoices",
          "Advanced AI parsing",
          "Custom branding",
          "Priority support",
          "Advanced analytics",
          "Team collaboration (3 members)",
          "API access",
        ],
        isPopular: true,
      },
      {
        title: "Enterprise",
        price: "₹1,199",
        period: "month",
        description: "For large organizations with custom needs",
        features: [
          "Everything in Professional",
          "Unlimited team members",
          "Custom workflows",
          "Dedicated account manager",
          "SLA guarantee",
          "White-label solutions",
          "Advanced security",
        ],
        isPopular: false,
      },
    ],
  };

  const currentPlans = plans[billingPeriod];

  function handleCtaClick(planMeta, flags = {}) {
    if (flags.openSignInFallback || !isSignedIn) {
      if (clerk && typeof clerk.openSignIn === "function") {
        clerk.openSignIn({
          redirectUrl: "/app/create-invoice"
        });
      }
    } else {
      navigate("/app/create-invoice", {
        state: { fromPlan: planMeta?.title || null }
      });
    }
  }

  return (
    <section id='pricing' className={pricingStyles.section + " py-20 relative overflow-hidden"}>

      <div className={pricingStyles.bgElement1}></div>
      <div className={pricingStyles.bgElement2}></div>
      <div className={pricingStyles.bgElement3}></div>

      <div className={pricingStyles.container + " max-w-7xl mx-auto px-4 relative z-10"}>

        {/* Header */}
        <div className="text-center mb-16">

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-100 mb-6">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            <span className="text-sm font-medium text-blue-700">
              Transparent Pricing
            </span>
          </div>

          <h2 className="text-5xl md:text-6xl font-bold text-slate-900">
            Simple, <span className="text-blue-600">Fair Pricing</span>
          </h2>

          {/* Billing Toggle */}
          <div className="flex justify-center mt-10">
            <div className="bg-slate-100 p-1 rounded-xl flex items-center">

              <button
                onClick={() => setBillingPeriod("monthly")}
                className={`px-6 py-2 rounded-lg text-sm font-semibold ${
                  billingPeriod === "monthly"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                Monthly
              </button>

              <button
                onClick={() => setBillingPeriod("annual")}
                className={`px-6 py-2 rounded-lg text-sm font-semibold ${
                  billingPeriod === "annual"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                Annual
              </button>

            </div>
          </div>

        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

          {currentPlans.map((plan, index) => (

            <div
              key={index}
              className={`p-8 rounded-3xl bg-white border ${
                plan.isPopular
                  ? "border-blue-500 shadow-xl scale-105"
                  : "border-slate-200"
              }`}
            >

              {plan.isPopular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-xs font-bold">
                  Most Popular
                </div>
              )}

              <h3 className="text-xl font-bold text-slate-900 mb-2">
                {plan.title}
              </h3>

              <p className="text-slate-500 text-sm mb-6">
                {plan.description}
              </p>

              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-slate-500">/{plan.period}</span>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleCtaClick(plan)}
                className={`w-full py-3 rounded-xl font-semibold ${
                  plan.isPopular
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-800"
                }`}
              >
                {plan.title === "Enterprise" ? "Contact Sales" : "Choose Plan"}
              </button>

            </div>

          ))}

        </div>

        {/* All Plans Include */}
        <div className="mt-20 max-w-4xl mx-auto bg-white border border-slate-200 rounded-3xl p-10">

          <h3 className="text-2xl font-bold text-center mb-10">
            All plans include
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 text-slate-600 text-sm">

            <div className="flex items-center gap-3">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              Secure cloud storage
            </div>

            <div className="flex items-center gap-3">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              Mobile-friendly interface
            </div>

            <div className="flex items-center gap-3">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              Automatic backups
            </div>

            <div className="flex items-center gap-3">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              Real-time notifications
            </div>

            <div className="flex items-center gap-3">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              Multi-currency support
            </div>

            <div className="flex items-center gap-3">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              Tax calculation
            </div>

          </div>

        </div>

        {/* Contact Sales */}
        <p className="text-center mt-8 text-slate-500">
          Have questions about pricing?{" "}
          <span className="text-blue-600 font-medium cursor-pointer">
            Contact our sales team →
          </span>
        </p>

        {/* Footer */}
        <div className="mt-16 border-t border-slate-200 pt-6 flex flex-col md:flex-row items-center justify-between text-sm text-slate-500">

          <p>
            © 2026 InvoiceAI • Built by Pushpak
          </p>

          <div className="flex items-center gap-6 mt-3 md:mt-0">
            <a href="#" className="hover:text-slate-800">
              Terms
            </a>
            <a href="#" className="hover:text-slate-800">
              Privacy
            </a>
          </div>

        </div>

      </div>
    </section>
  )
}

export default Pricing

