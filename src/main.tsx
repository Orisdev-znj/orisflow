import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
// Polices de la charte, EMBARQUÉES (l'application est hors ligne : jamais de Google Fonts). Sous-ensemble
// « latin » : accents français, œ, guillemets « ». Roboto = corps de texte ; Roboto Slab = titres.
import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/latin-400-italic.css";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto/latin-700.css";
import "@fontsource/roboto-slab/latin-400.css";
import "@fontsource/roboto-slab/latin-500.css";
import "./styles.css";

createRoot(document.getElementById("racine")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
