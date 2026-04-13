import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { DialogProvider } from "./context/DialogContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <DialogProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </DialogProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

// Register Service Worker for offline support
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("Service Worker registered:", registration);
      })
      .catch((error) => {
        console.error("Service Worker registration failed:", error);
      });
  });
}
