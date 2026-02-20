import "./index.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./contexts/AuthContext";
import { App } from "./App";

const root = createRoot(document.getElementById("root")!);
root.render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
