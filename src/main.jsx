import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx';
import { BrowserRouter } from "react-router-dom";
import { AuthContextProvider } from "./AuthContext";
import { PriceContextProvider } from './PriceContext.jsx';
import { ThemeContextProvider } from './ThemeContext.jsx';
import { CurrencyProvider } from './CurrencyContext.jsx';
import './App.scss';
import './pages.scss';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeContextProvider>
      <AuthContextProvider>
        <PriceContextProvider>
          <CurrencyProvider>
            <BrowserRouter>
            <App />
          </BrowserRouter>
          </CurrencyProvider>
        </PriceContextProvider>
      </AuthContextProvider>
    </ThemeContextProvider>
  </StrictMode>,
)
