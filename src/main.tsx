import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { registerServiceWorker, initNetworkMonitoring } from "./offline";

async function bootstrap() {
  const cleanupNetwork = initNetworkMonitoring();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        const swStatus = await registerServiceWorker();
        console.log("[App] Service Worker status:", swStatus.registrationStatus);
      } catch (error) {
        console.warn("[App] Service Worker registration failed:", error);
      }
    });
  }

  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();
