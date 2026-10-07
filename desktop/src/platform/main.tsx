import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { PlatformApp } from "./PlatformApp";
import "./platform.css";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <PlatformApp />
    </StrictMode>,
  );
}
