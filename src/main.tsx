import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Application entry point
createRoot(document.getElementById("root")!).render(<App />);
