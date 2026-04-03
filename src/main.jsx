import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import GravityIO from "./GravityIO.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <GravityIO />
  </StrictMode>
);
