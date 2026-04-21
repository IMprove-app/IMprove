import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Hud from './pages/Hud'
import './assets/index.css'

const isHudRoute = window.location.hash === '#/hud'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isHudRoute ? <Hud /> : <App />}
  </React.StrictMode>
)
