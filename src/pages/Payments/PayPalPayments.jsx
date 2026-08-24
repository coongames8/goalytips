import { useState, useEffect } from "react";
import { PayPalButtons } from "@paypal/react-paypal-js";
import Swal from "sweetalert2";

export default function PayPalPayments({ 
  price, 
  getSubscriptionPeriod, 
  getDisplayPrice,
  handleUpgrade
}) {
  const [paypalKey, setPaypalKey] = useState(0);

  // Fixed exchange rate (approximate KSH to USD)
  const EXCHANGE_RATE = 150;

  // Currency conversion helpers
  const kshToUsd = (ksh) => (ksh / EXCHANGE_RATE).toFixed(2);

  // Get current price in USD for PayPal
  const getCurrentPriceInUsd = () => {
    return kshToUsd(price);
  };

  // Force PayPal buttons to re-render when price changes
  useEffect(() => {
    setPaypalKey(prev => prev + 1);
  }, [price]);

  // PayPal order creation
  const createPayPalOrder = (data, actions) => {
    const usdPrice = getCurrentPriceInUsd();
    return actions.order.create({
      purchase_units: [
        {
          amount: {
            value: usdPrice,
            currency_code: "USD",
          },
          description: `${getSubscriptionPeriod()} VIP Subscription`,
        },
      ],
    });
  };

  // PayPal approval handler
  const onPayPalApprove = (data, actions) => {
    return actions.order.capture().then(function (details) {
      console.log("PayPal payment completed:", details);
      handleUpgrade();
    });
  };

  // PayPal error handler
  const onPayPalError = (err) => {
    Swal.fire({
      title: "Payment Failed",
      text: "PayPal payment failed. Please try again.",
      icon: "error"
    });
  };

  return (
    <div className="paypal-payment">
      <h3>
        GET {getSubscriptionPeriod().toUpperCase()} VIP FOR {getDisplayPrice()}
      </h3>
      <div className="paypal-buttons-container">
        <PayPalButtons
          key={paypalKey}
          style={{
            layout: "horizontal",
            color: "gold",
            shape: "pill",
            label: "pay"
          }}
          createOrder={createPayPalOrder}
          onApprove={onPayPalApprove}
          onError={onPayPalError}
          forceReRender={[price]}
        />
      </div>
      <p style={{ textAlign: 'center', marginTop: '10px', fontSize: '14px', opacity: 0.8 }}>
        Paying: {getDisplayPrice()} for {getSubscriptionPeriod()} VIP
      </p>
    </div>
  );
}