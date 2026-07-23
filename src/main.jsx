import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx';
import { BrowserRouter } from "react-router-dom";
import { AuthContextProvider } from "./AuthContext";
import { PriceContextProvider } from './PriceContext.jsx';
import { ThemeContextProvider } from './ThemeContext.jsx';
import './App.scss';
import './pages.scss';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeContextProvider>
      <AuthContextProvider>
        <PriceContextProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </PriceContextProvider>
      </AuthContextProvider>
    </ThemeContextProvider>
  </StrictMode>,
)
