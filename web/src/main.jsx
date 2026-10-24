import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(<App />);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      window.dispatchEvent(
        new CustomEvent("research-storage-error", {
          detail:
            "Offline app setup could not complete. Keep this page open and reconnect before field collection.",
        }),
      );
    });
  });
}
