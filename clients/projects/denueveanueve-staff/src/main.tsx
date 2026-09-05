import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// PWA: registra el service worker SOLO en producción y si el navegador lo soporta. Si
// falla, la app funciona igual (la PWA es progresiva, no un requisito). En desarrollo no
// se registra para no interferir con el HMR de Vite.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* PWA opcional: sin service worker la app sigue siendo 100% funcional. */
    });
  });
}
