import { useFlutterwave, closePaymentModal } from 'flutterwave-react-v3';
import Swal from "sweetalert2";

const FLUTTERWAVE_PUBLIC_KEY = "FLWPUBK-d3031d6a729a533737bd65a51073bd37-X";

export default function FlutterwavePayments({ 
  price, 
  currentUser, 
  convertPrice, 
  currency,
  isProcessing,
  setIsProcessing,
  getSubscriptionPeriod,
  getDisplayPrice,
  handleUpgrade
}) {

  // Handle Flutterwave payment
  const getFlutterwaveConfig = () => {
    const payCurrency = currency === "NGN" ? "NGN" : "KES";
    const amount = Math.round(convertPrice(price));
    
    return {
      public_key: FLUTTERWAVE_PUBLIC_KEY,
      tx_ref: `VIP-${getSubscriptionPeriod()}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      amount: amount,
      currency: payCurrency,
      payment_options: 'card,mobilemoney,ussd,banktransfer',
      redirect_url: window.location.href.split('?')[0],
      customer: {
        email: currentUser?.email || '',
        phone_number: currentUser?.phone || '',
        name: currentUser?.email?.split('@')[0] || 'Goalytips User',
      },
      customizations: {
        title: `${getSubscriptionPeriod()} VIP Subscription`,
        description: `Upgrade to ${getSubscriptionPeriod()} VIP Plan`,
        logo: 'https://your-logo-url.com/logo.png',
      },
      meta: {
        period: getSubscriptionPeriod(),
        user_id: currentUser?.email || '',
        payment_method: 'flutterwave',
      },
    };
  };

  const handleFlutterwavePayment = useFlutterwave(getFlutterwaveConfig());

  const handleFlutterwavePay = () => {
    if (isProcessing) return;
    if (!currentUser?.email) {
      Swal.fire({
        title: 'Login Required',
        text: 'Please login first',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      return;
    }

    setIsProcessing(true);

    handleFlutterwavePayment({
      callback: async (response) => {
        if (response.status === 'successful') {
          closePaymentModal();
          setIsProcessing(false);
          handleUpgrade();
        } else {
          setIsProcessing(false);
          Swal.fire({
            title: 'Payment Failed',
            text: response.message || 'Transaction was not successful',
            icon: 'error',
            confirmButtonText: 'OK',
          });
        }
      },
      onClose: () => {
        setIsProcessing(false);
      },
    });
  };

  return (
    <div className="mpesa-payment">
      <h3>
        GET {getSubscriptionPeriod().toUpperCase()} VIP FOR {getDisplayPrice()}
      </h3>
      <button
        onClick={handleFlutterwavePay}
        className="paystack-btn"
        disabled={isProcessing}
        style={{
          opacity: isProcessing ? 0.7 : 1,
          cursor: isProcessing ? "not-allowed" : "pointer"
        }}
      >
        {isProcessing ? "Processing..." : "Pay with Flutterwave"}
      </button>
    </div>
  );
}