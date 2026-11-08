import React from "react";
import Navbar from "../component/Navbar";
import Hero from "../component/Hero";
import Features from "../component/Features";
import Pricing from "../component/Pricing";
import KpiCard from "../component/KpiCard";
import CreateInvoice from "./CreateInvoice";


const Home = () => {
  return (
    <div>
      <Navbar />

      <main>
        <Hero />

        <div>
          <Features />
        </div>

        <div>
          <Pricing />
        </div>
        <div>
          <KpiCard />
        </div>




      </main>
    </div>
  );
};

export default Home;
