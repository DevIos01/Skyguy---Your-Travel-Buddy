import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applySessionPersistence } from "./lib/sessionPersistence";

// Honour the user's "Remember me" choice BEFORE React mounts. If they opted
// out, this moves any persisted session out of localStorage into
// sessionStorage so it dies with the tab.
applySessionPersistence();

createRoot(document.getElementById("root")!).render(<App />);
