import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Hud from './pages/Hud'
import Scratch from './pages/Scratch'
import Tasks from './pages/Tasks'
import './assets/index.css'

const hash = window.location.hash
const page =
  hash === '#/hud'
    ? <Hud />
    : hash === '#/scratch'
      ? <Scratch />
      : hash === '#/tasks'
        ? <Tasks />
        : <App />

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {page}
  </React.StrictMode>
)
