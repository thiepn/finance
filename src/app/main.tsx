import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FinanceApp } from "./FinanceApp.js";
import "../ui/styles/base.css";
import "../ui/styles/components.css";
import "../ui/styles/shell.css";
import "./app.css";
import "../overview/overview.css";
import "../ui/charts/charts.css";
import "../spending-explorer/spending-explorer.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Finance root element not found");
}

createRoot(root).render(
  <StrictMode>
    <FinanceApp />
  </StrictMode>,
);
