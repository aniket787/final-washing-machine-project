import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./App.css";
import "./LandingPage.css";

const root = createRoot(document.getElementById("root"));
root.render(<App />);