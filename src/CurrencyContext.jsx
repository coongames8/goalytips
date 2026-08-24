import { createContext, useContext, useEffect, useState, useCallback } from "react";

const COUNTRIES = {
  KE: { code: "KE", name: "Kenya", currency: "KES", symbol: "KSH", rate: 1 },
  NG: { code: "NG", name: "Nigeria", currency: "NGN", symbol: "₦", rate: 11.63 },
  US: { code: "US", name: "United States", currency: "USD", symbol: "$", rate: 1 / 150 },
  GB: { code: "GB", name: "United Kingdom", currency: "GBP", symbol: "£", rate: 1 / 192 },
  EU: { code: "EU", name: "Euro Zone", currency: "EUR", symbol: "€", rate: 1 / 162 },
};

const DEFAULT_COUNTRY = COUNTRIES.KE;

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [detected, setDetected] = useState(null);
  const [locality, setLocality] = useState(null);
  const [loading, setLoading] = useState(true);

  const detectCountry = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("https://ipapi.co/json/");
      if (res.ok) {
        const data = await res.json();
        await setLocality(data);
        const matched = COUNTRIES[data.country_code];
        if (matched) {
          setCountry(matched);
          setDetected(matched);
          return;
        }
      }
      setCountry(DEFAULT_COUNTRY);
      setDetected(DEFAULT_COUNTRY);
    } catch {
      setCountry(DEFAULT_COUNTRY);
      setDetected(DEFAULT_COUNTRY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    detectCountry();
  }, [detectCountry]);

  const convertPrice = useCallback(
    (priceInKes) => Math.round((priceInKes || 0) * country.rate),
    [country]
  );

  const formatPrice = useCallback(
    (priceInKes) => {
      const converted = convertPrice(priceInKes);
      return `${country.symbol} ${converted.toLocaleString()}`;
    },
    [country, convertPrice]
  );

  const value = {
    country,
    detected,
    locality,
    loading,
    currency: country.currency,
    symbol: country.symbol,
    rate: country.rate,
    convertPrice,
    formatPrice,
    setCountry,
  };

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    return {
      country: DEFAULT_COUNTRY,
      detected: null,
      locality: null,
      loading: false,
      currency: DEFAULT_COUNTRY.currency,
      symbol: DEFAULT_COUNTRY.symbol,
      rate: DEFAULT_COUNTRY.rate,
      convertPrice: (p) => Math.round((p || 0) * DEFAULT_COUNTRY.rate),
      formatPrice: (p) => `${DEFAULT_COUNTRY.symbol} ${Math.round((p || 0) * DEFAULT_COUNTRY.rate).toLocaleString()}`,
      setCountry: () => {},
    };
  }
  return ctx;
}
