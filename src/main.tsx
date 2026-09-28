import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { CaseProvider } from './context/CaseContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <CaseProvider>
        <App />
      </CaseProvider>
    </BrowserRouter>
  </StrictMode>,
)
