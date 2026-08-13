import React from "react";
import ReactDOM from "react-dom/client";

import "@fontsource-variable/manrope";
import "@fontsource-variable/newsreader";

import App from "./App";
import "./styles.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/motion.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
