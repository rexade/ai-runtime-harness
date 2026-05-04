import React from 'react'
import { createRoot } from 'react-dom/client'
import { PlaygroundApp } from './PlaygroundApp'
import './styles.css'

const root = createRoot(document.getElementById('root') as HTMLElement)
root.render(<PlaygroundApp />)
