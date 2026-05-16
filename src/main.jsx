import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import "./index.css";
import "./attune.css";
import "./landing.css";
import "./privacy.css";
import App from "./app/App.jsx";

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
