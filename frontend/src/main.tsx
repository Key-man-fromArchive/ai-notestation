// @TASK P5-T5.1 - React 19 진입점 with Router
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#프론트엔드
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './lib/i18n'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
