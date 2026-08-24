import { useState, useContext, useRef, useEffect } from "react";
import { PayPalScriptProvider } from "@paypal/react-paypal-js";
import AppHelmet from "../../components/AppHelmet";
import { doc, setDoc } from "firebase/firestore";
import { db, getUser } from "../../firebase";
import "./Payments.scss";
import { AuthContext } from "../../AuthContext";
import { PriceContext } from "../../PriceContext";
import { useCurrency } from "../../CurrencyContext";
import Swal from "sweetalert2";

// Import individual payment components
import CryptoPayments from "./CryptoPayments";
import KorapayPayments from "./KorapayPayments";
import MpesaPayments from "./MpesaPayments";
import PayPalPayments from "./PayPalPayments";
import FlutterwavePayments from "./FlutterwavePayments";
import PaystackPayments from "./PaystackPayments";

// PayPal configuration
const paypalInitialOptions = {
  "client-id": "AXIggvGGvXozbZhdkvizPLd89nVYW8KoyNlHO0gHx7hjY_Ah_IfgXihUQGf7T2HUUVYx-D5SNncM0CtU",
  currency: "USD",
  intent: "capture",
};

export default function PaymentPage({ setUserData }) {
  const { price, setPrice } = useContext(PriceContext);
  const { currentUser } = useContext(AuthContext);
  const { symbol, convertPrice, currency } = useCurrency();
  const [paymentType, setPaymentType] = useState("korapay");
  const [isProcessing, setIsProcessing] = useState(false);
  const wsRef = useRef(null);

  // Payment methods - Keep commented for future use
  const paymentMethods = [
    /*{ id: "mpesa", label: "M-Pesa 📱" },*/
    /*{ id: "korapay", label: "Korapay 💳" },*/
    /*{ id: "flutterwave", label: "Flutterwave 💳" },*/
    { id: "korapay", label: currency === "KES" ? "Mobile (M-Pesa/Airtel)📲" : "Card/Bank 💳"},
    /*{ id: "korapay", label: "Mobile/Card/Bank 💳"},*/
    /*{ id: "paystack", label: "Paystack 💳" },*/
    /*{ id: "crypto", label: "Crypto ₿" },*/
    /*{ id: "paypal", label: "PayPal 💳" },*/
  ];

  // All prices stored in KSH for PriceContext
  const mpesaPlans = [
    { id: "daily", value: 200, label: "Daily VIP" },
    { id: "weekly", value: 700, label: "7 Days VIP" },
    { id: "monthly", value: 2000, label: "30 Days VIP" },
    { id: "yearly", value: 7500, label: "1 Year VIP" },
  ];

  const subscriptionPlans = {
    mpesa: mpesaPlans.map((p) => ({
      ...p,
      price: `${symbol} ${convertPrice(p.value).toLocaleString()}`,
    })),
    korapay: mpesaPlans.map((p) => ({
      ...p,
      price: `${symbol} ${convertPrice(p.value).toLocaleString()}`,
    })),
    flutterwave: mpesaPlans.map((p) => ({
      ...p,
      price: `${symbol} ${convertPrice(p.value).toLocaleString()}`,
    })),
    paystack: mpesaPlans.map((p) => ({
      ...p,
      price: `${symbol} ${convertPrice(p.value).toLocaleString()}`,
    })),
    crypto: [
      { id: "10", value: 2000, label: "Weekly", price: "$10" },
      { id: "15", value: 2400, label: "Monthly", price: "$16" },
      { id: "50", value: 7500, label: "Yearly", price: "$50" },
    ],
    paypal: [
      { id: "2", value: 300, label: "Daily", price: "$2" },
      { id: "10", value: 2000, label: "Weekly", price: "$10" },
      { id: "15", value: 2400, label: "Monthly", price: "$16" },
      { id: "50", value: 7500, label: "Yearly", price: "$50" },
    ],
  };

  // WebSocket setup for real-time payment confirmation
  useEffect(() => {
    setupWebSocket();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const setupWebSocket = () => {
    try {
      wsRef.current = new WebSocket('wss://hash-back-server-production.up.railway.app');
      
      wsRef.current.onopen = () => {
        console.log('WebSocket connected for payment');
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'payment_completed') {
            handlePaymentSuccess(message.data);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
      
      wsRef.current.onclose = () => {
        setTimeout(setupWebSocket, 5000);
      };
    } catch (error) {
      console.log('WebSocket not supported, using polling fallback');
    }
  };

  // Initialize price based on payment type
  useEffect(() => {
    // Check if current price is valid for this payment type
    const isValidPrice = subscriptionPlans[paymentType].some(
      plan => plan.value === price
    );
    
    // Only set default if price is invalid or not set
    if (!price || !isValidPrice) {
      // Try to find a matching price in the new payment type's plans
      const matchingPlan = subscriptionPlans[paymentType].find(
        plan => plan.value === price
      );
      
      if (matchingPlan) {
        // Keep the price if it exists in the new payment type
        setPrice(price);
      } else {
        // Otherwise set to first plan
        const defaultPlan = subscriptionPlans[paymentType][0];
        setPrice(defaultPlan.value);
      }
    }
  }, [paymentType]); // Don't include price to avoid infinite loops

  const getSubscriptionPeriod = () => {
    const isUSD = paymentType === "crypto" || paymentType === "paypal";
    
    if (isUSD) {
      // USD pricing
      if (price === 2) return "Daily";
      if (price === 10) return "Weekly";
      if (price === 16) return "Monthly";
      if (price === 50) return "Yearly";
    } else {
      // KES pricing
      if (price === 200) return "Daily";
      if (price === 700) return "Weekly";
      if (price === 2000) return "Monthly";
      if (price === 7500) return "Yearly";
    }
    
    // Fallback: try to determine by payment type's plan structure
    const plans = subscriptionPlans[paymentType];
    const matchingPlan = plans.find(plan => plan.value === price);
    return matchingPlan ? matchingPlan.label : "Monthly";
  };

  const handleUpgrade = async () => {
    try {
      const userDocRef = doc(db, "users", currentUser.email);
      await setDoc(
        userDocRef,
        {
          email: currentUser.email,
          username: currentUser.email,
          isPremium: true,
          subscription: getSubscriptionPeriod(),
          subDate: new Date().toISOString(),
        },
        { merge: true }
      );
      await getUser(currentUser.email, setUserData);
      Swal.fire({
        title: "Success! 🎉",
        text: `You have upgraded to ${getSubscriptionPeriod()} VIP`,
        icon: "success",
        confirmButtonText: "Continue"
      }).then(() => {
        window.location.pathname = "/";
      });
    } catch (error) {
      Swal.fire({
        title: "Error",
        text: error.message,
        icon: "error"
      });
    }
  };

  const handlePaymentSuccess = (data) => {
    setIsProcessing(false);
    
    Swal.fire({
      title: "Payment Successful! 🎉",
      html: `
        <div style="text-align: center;">
          <i class="fas fa-check-circle" style="font-size: 48px; color: #10b981;"></i>
          <h3 style="margin: 15px 0;">${symbol} ${(data.amount ? convertPrice(data.amount) : convertPrice(price)).toLocaleString()} Paid</h3>
          <p>Your VIP subscription payment was successful!</p>
          <p style="font-size: 0.85rem; color: #666; margin-top: 10px;">
            Transaction ID: ${data.transactionId || data.TransactionID || 'N/A'}
          </p>
        </div>
      `,
      icon: "success",
      confirmButtonText: "Activate Subscription",
      confirmButtonColor: "#059669"
    }).then(() => {
      handleUpgrade();
    });
  };

  // Handle payment method change
  const handlePaymentMethodChange = (methodId) => {
    setPaymentType(methodId);
    setIsProcessing(false);
  };

  // Helper to display price based on payment type
  const getDisplayPrice = () => {
    if (paymentType === "mpesa" || paymentType === "korapay" || paymentType === "flutterwave" || paymentType === "paystack") {
      return `${symbol} ${convertPrice(price).toLocaleString()}`;
    } else {
      return `${(price / 150).toFixed(2)}`; // USD conversion
    }
  };

  // Render the appropriate payment component
  const renderPaymentComponent = () => {
    const commonProps = {
      price,
      setPrice,
      currentUser,
      symbol,
      convertPrice,
      currency,
      isProcessing,
      setIsProcessing,
      getSubscriptionPeriod,
      getDisplayPrice,
      handleUpgrade,
      handlePaymentSuccess,
      subscriptionPlans,
      paymentType
    };

    switch (paymentType) {
      case "crypto":
        return <CryptoPayments {...commonProps} />;
      case "mpesa":
        return <MpesaPayments {...commonProps} wsRef={wsRef} />;
      case "paypal":
        return <PayPalPayments {...commonProps} />;
      case "flutterwave":
        return <FlutterwavePayments {...commonProps} />;
      case "paystack":
        return <PaystackPayments {...commonProps} />;
      case "korapay":
      default:
        return currency === "KES" ? <PaystackPayments {...commonProps} /> : <KorapayPayments {...commonProps} />;
    }
  };

  return (
    <PayPalScriptProvider options={paypalInitialOptions}>
      <div className="payment-container">
        <AppHelmet title="Payment" location="/pay" />

        <div className="payment-glass">
          <h2 className="payment-title">Select Subscription Package</h2>

          <div className="method-selector">
            {paymentMethods.map((method) => (
              <label
                key={method.id}
                className={`method-option ${
                  paymentType === method.id ? "active" : ""
                }`}
              >
                <input
                  type="radio"
                  name="payment-method"
                  value={method.id}
                  checked={paymentType === method.id}
                  onChange={() => handlePaymentMethodChange(method.id)}
                />
                {method.label}
              </label>
            ))}
          </div>

          <div className="plan-selector">
            {subscriptionPlans[paymentType].map((plan) => (
              <label
                key={plan.id}
                className={`plan-option ${price === plan.value ? "active" : ""}`}
              >
                <input
                  type="radio"
                  name="subscription-plan"
                  value={plan.value}
                  checked={price === plan.value}
                  onChange={() => setPrice(plan.value)}
                />
                <span className="plan-label">{plan.label}</span>
                <span className="plan-price">{plan.price}</span>
              </label>
            ))}
          </div>

          {renderPaymentComponent()}
        </div>
      </div>
    </PayPalScriptProvider>
  );
}