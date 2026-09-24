import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { ApiError } from './api/client'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import './index.css'

// "Night & Gold" oscuro por defecto; se respeta la preferencia guardada.
let theme = 'dark'
try {
  theme = localStorage.getItem('oilowl.theme') === 'light' ? 'light' : 'dark'
} catch {
  /* sin almacenamiento */
}
document.documentElement.dataset.theme = theme

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
    mutations: { retry: false },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
