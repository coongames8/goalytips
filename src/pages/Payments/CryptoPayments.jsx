import { useState, useRef, useEffect } from "react";
import { Check, CopyAll } from "@mui/icons-material";
import NowPaymentsApi from "@nowpaymentsio/nowpayments-api-js";
import Swal from "sweetalert2";

const npApi = new NowPaymentsApi({ apiKey: "D7YT1YV-PCAM4ZN-HX9W5M1-H02KFCV" });

export default function CryptoPayments({ 
  price, 
  getSubscriptionPeriod, 
  getDisplayPrice,
  handleUpgrade,
  isProcessing,
  setIsProcessing
}) {
  const [currenciesArr, setCurrenciesArr] = useState(null);
  const [selectedCurrency, setSelectedCurrency] = useState("TUSD");
  const addressRef = useRef();
  const [copied, setCopied] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payCurrency, setPayCurrency] = useState("");
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("");
  const [generatingAddress, setGeneratingAddress] = useState(false);
  const [paymentId, setPaymentId] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollingIntervalRef = useRef(null);

  // Fixed exchange rate (approximate KSH to USD)
  const EXCHANGE_RATE = 150;

  // Currency conversion helpers
  const kshToUsd = (ksh) => (ksh / EXCHANGE_RATE).toFixed(2);

  // Get current price in USD for PayPal/Crypto
  const getCurrentPriceInUsd = () => {
    return kshToUsd(price);
  };

  // Crypto payment - use USD price
  const getCryptoAddress = async () => {
    setGeneratingAddress(true);
    setAddress(null);
    setPayAmount("");
    setPayCurrency("");
    setNetwork("");
    setPaymentId(null);
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
    try {
      const usdPrice = getCurrentPriceInUsd();
      const params = {
        price_amount: parseFloat(usdPrice),
        price_currency: "usd",
        pay_currency: selectedCurrency.toLowerCase(),
        order_id: `VIP-${getSubscriptionPeriod()}-${Date.now()}`,
        order_description: `${getSubscriptionPeriod()} VIP Subscription`,
      };
      const response = await npApi.createPayment(params);
      setPayAmount(response.pay_amount);
      setPayCurrency(response.pay_currency);
      setAddress(response.pay_address);
      setNetwork(response.network);
      setPaymentId(response.payment_id);
      Swal.fire({
        title: "Address Generated!",
        text: "Crypto payment address has been generated. Please send the exact amount to the address shown.",
        icon: "success",
        timer: 3000,
        showConfirmButton: false,
      });
    } catch (error) {
      Swal.fire({
        title: "Error",
        text: error.message || "Could not generate payment address. Please try again.",
        icon: "error",
        confirmButtonText: "OK",
      });
    } finally {
      setGeneratingAddress(false);
    }
  };

  // Check crypto payment status via NOWPayments API
  const checkCryptoPaymentStatus = async () => {
    if (!paymentId) return false;
    try {
      const response = await fetch(
        `https://api.nowpayments.io/v1/payment/${paymentId}`,
        {
          headers: {
            "x-api-key": "D7YT1YV-PCAM4ZN-HX9W5M1-H02KFCV",
          },
        }
      );
      const data = await response.json();
      const status = data.payment_status;
      if (
        status === "finished" ||
        status === "confirmed" ||
        status === "sending"
      ) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setIsPolling(false);
        Swal.fire({
          title: "Payment Successful!",
          html: `
            <div style="text-align: center;">
              <i class="fas fa-check-circle" style="font-size: 48px; color: #10b981;"></i>
              <h3 style="margin: 15px 0;">${getCurrentPriceInUsd()} Paid</h3>
              <p>Your VIP subscription payment was successful!</p>
            </div>
          `,
          icon: "success",
          confirmButtonText: "Activate Subscription",
          confirmButtonColor: "#059669",
        }).then(() => {
          handleUpgrade();
        });
        return true;
      } else if (
        status === "failed" ||
        status === "refunded" ||
        status === "expired"
      ) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setIsPolling(false);
        Swal.fire({
          title: "Payment Failed",
          text: "Your payment was not successful. Please try again.",
          icon: "error",
          confirmButtonText: "Generate New Address",
        }).then(() => {
          setAddress("");
          setPaymentId(null);
        });
        return false;
      }
      return false;
    } catch (error) {
      return false;
    }
  };

  // Start polling for crypto payment status
  const startCryptoPolling = () => {
    if (!paymentId) {
      Swal.fire({
        title: "No Active Payment",
        text: "Please generate a payment address first.",
        icon: "warning",
        confirmButtonText: "OK",
      });
      return;
    }
    setIsPolling(true);
    Swal.fire({
      title: "Monitoring Payment",
      html: `
        <div style="text-align: center;">
          <i class="fas fa-spinner fa-spin" style="font-size: 48px; color: #667eea;"></i>
          <h3 style="margin: 15px 0;">Waiting for Payment</h3>
          <p>We are monitoring the blockchain for your payment.</p>
          <p style="font-size: 0.85rem; color: #666;">This will automatically update when payment is detected.</p>
        </div>
      `,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: "Stop Monitoring",
      didOpen: () => {
        pollingIntervalRef.current = setInterval(async () => {
          const completed = await checkCryptoPaymentStatus();
          if (completed) {
            Swal.close();
          }
        }, 10000);
        setTimeout(() => {
          checkCryptoPaymentStatus();
        }, 2000);
      },
      willClose: () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setIsPolling(false);
      },
    });
  };

  const handleCryptoCurrencyChange = (newCurrency) => {
    setSelectedCurrency(newCurrency);
    setAddress("");
    setPaymentId(null);
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
  };

  const handleCopy = (e) => {
    e.preventDefault();
    addressRef.current.select();
    document.execCommand("copy");
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  };

  useEffect(() => {
    const fetchCurrencies = async () => {
      const response = await fetch(
        "https://api.nowpayments.io/v1/merchant/coins",
        {
          headers: { "x-api-key": "K80YG02-W464QP0-QR7E9EZ-QFY3ZGQ" },
        }
      );
      const data = await response.json();
      setCurrenciesArr(data.selectedCurrencies);
    };

    fetchCurrencies();
  }, []);

  return (
    <div className="crypto-details">
      <h3>
        GET {getSubscriptionPeriod().toUpperCase()} VIP FOR ${getDisplayPrice()}
      </h3>

      <div className="form-group">
        <label>Select Currency:</label>
        <select
          value={selectedCurrency}
          onChange={(e) => handleCryptoCurrencyChange(e.target.value)}
          className="glass-select"
        >
          {currenciesArr?.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
      </div>

      {address ? (
        <>
          <div className="payment-info">
            <p>
              Amount:{" "}
              <span>
                {payAmount} {payCurrency?.toUpperCase()}
              </span>
            </p>
            <p>
              Network: <span>{network?.toUpperCase()}</span>
            </p>
          </div>

          <div className="address-copy">
            <input
              type="text"
              value={address || ""}
              readOnly
              ref={addressRef}
              className="glass-input"
            />
            <button onClick={handleCopy} className="copy-btn">
              {copied ? (
                <Check className="icon" />
              ) : (
                <CopyAll className="icon" />
              )}
            </button>
          </div>

          <div className="crypto-actions">
            <button
              className="generate-address-btn"
              onClick={getCryptoAddress}
              disabled={generatingAddress}
            >
              {generatingAddress ? "Generating..." : "Generate New Address"}
            </button>

            {!isPolling && (
              <button className="check-status-btn" onClick={startCryptoPolling}>
                Check Payment Status
              </button>
            )}
          </div>

          {isPolling && (
            <div className="polling-indicator">
              <i className="fas fa-spinner fa-spin"></i> Monitoring payment
              status...
            </div>
          )}
        </>
      ) : (
        <button
          className="generate-address-btn full-width"
          onClick={getCryptoAddress}
          disabled={generatingAddress}
        >
          {generatingAddress
            ? "Generating Address..."
            : "Generate Payment Address"}
        </button>
      )}
    </div>
  );
}