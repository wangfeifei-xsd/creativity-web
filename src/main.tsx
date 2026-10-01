import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import 'antd/dist/reset.css'
import './app/styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('缺少应用挂载节点')
createRoot(root).render(<StrictMode><App /></StrictMode>)
