import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ButtonApp } from "./ButtonApp";
import "./button.css";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <ButtonApp />
    </StrictMode>,
  );
}
