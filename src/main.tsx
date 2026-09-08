import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "../app/globals.css";
import "../app/price.css";
import "../app/reviews.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App/></React.StrictMode>
);
