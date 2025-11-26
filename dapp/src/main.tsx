import React from "react"
import ReactDOM from "react-dom/client"

import { Web3Provider } from "./providers/Web3Provider"
import App from "./App"

import "./index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Web3Provider>
      <App />
    </Web3Provider>
  </React.StrictMode>,
)
