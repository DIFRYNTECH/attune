import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AppFixture from "./AppFixture.jsx";

if (import.meta.env.DEV) createRoot(document.getElementById("root")).render(<StrictMode><AppFixture /></StrictMode>);
