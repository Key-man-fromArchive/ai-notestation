// @TASK P0-T0.4 - React 19 진입점
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#프론트엔드
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
