import React from "react";
import { createRoot } from "react-dom/client";
import PickFixture from "./PickFixture.jsx";

if (!import.meta.env.DEV) throw new Error("Development-only component fixture");
createRoot(document.getElementById("root")).render(<React.StrictMode><PickFixture /></React.StrictMode>);
