import React, { useState } from "react";
import Dashboard from "./Dashboard";
import LandingPage from "./LandingPage";

export default function App() {
  const [showDashboard, setShowDashboard] = useState(false);

  if (!showDashboard) {
    return <LandingPage onGetStarted={() => setShowDashboard(true)} />;
  }

  return <Dashboard />;
}