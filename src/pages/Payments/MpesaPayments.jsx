import { useState, useRef, useEffect } from "react";
import Swal from "sweetalert2";

// HashBack API Configuration
const HASHBACK_API_URL = 'https://hash-back-server-production.up.railway.app/';

export default function MpesaPayments({ 
  price, 
  currentUser, 
  symbol, 
  convertPrice,
  isProcessing,
  setIsProcessing,
  getSubscriptionPeriod,
  getDisplayPrice,
  handlePaymentSuccess,
  wsRef
}) {
  const currentCheckoutIdRef = useRef(null);
  const statusCheckIntervalRef = useRef(null);
  const [isPolling, setIsPolling] = useState(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
      }
    };
  }, []);

  // Format phone number for HashBack
  const formatPhoneNumberForHashBack = (phone) => {
    let p = phone.toString().replace(/\D/g, "");
    
    if (p.startsWith("0")) {
      return p;
    }
    if (p.startsWith("7") || p.startsWith("1")) {
      return "0" + p;
    }
    if (p.startsWith("254")) {
      return "0" + p.substring(3);
    }
    return p;
  };

  const isValidPhoneNumber = (phone) => {
    const digits = phone.replace(/\D/g, "");
    return digits.startsWith("07") && digits.length === 10;
  };

  const checkPaymentStatus = async (checkoutId) => {
    try {
      const response = await fetch(`${HASHBACK_API_URL}/api/check-payment-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutId })
      });
      
      const data = await response.json();
      
      if (data.status === 'completed') {
        if (statusCheckIntervalRef.current) {
          clearInterval(statusCheckIntervalRef.current);
        }
        handlePaymentSuccess(data);
      } else if (data.status === 'failed') {
        if (statusCheckIntervalRef.current) {
          clearInterval(statusCheckIntervalRef.current);
        }
        Swal.close();
        Swal.fire({
          title: "Payment Failed",
          text: "The payment was not successful. Please try again.",
          icon: "error"
        });
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('Status check error:', error);
    }
  };

  // Handle M-Pesa payment with HashBack
  const handleMpesaPayment = async () => {
    if (isProcessing) return;
    
    // Show phone number input modal
    const { value: phoneNumber } = await Swal.fire({
      title: "Enter M-Pesa Phone Number",
      html: `
        <div style="text-align: center; margin-bottom: 15px;">
          <i class="fas fa-mobile-alt" style="font-size: 48px; color: #065f46;"></i>
        </div>
        <p style="margin-bottom: 15px;">Enter the M-Pesa phone number to receive the payment prompt.</p>
        <p style="font-size: 0.8rem; color: #666;">Format: 07XXXXXXXX (10 digits)</p>
      `,
      input: "tel",
      inputPlaceholder: "e.g., 0712345678",
      showCancelButton: true,
      confirmButtonText: "Continue",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#059669",
      cancelButtonColor: "#6c757d",
      reverseButtons: true,
      inputValidator: (value) => {
        if (!value) {
          return "Phone number is required!";
        }
        if (!isValidPhoneNumber(value)) {
          return "Please enter a valid Kenyan phone number (e.g., 0712345678)";
        }
        return null;
      }
    });

    if (!phoneNumber) return;

    const formattedPhone = formatPhoneNumberForHashBack(phoneNumber);
    
    // Show loading
    Swal.fire({
      title: "Initiating Payment",
      text: "Connecting to M-Pesa...",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    
    setIsProcessing(true);

    try {
      const reference = `VIP-${getSubscriptionPeriod()}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      
      const response = await fetch(`${HASHBACK_API_URL}/api/initiate-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: price,
          phone: formattedPhone,
          reference: reference,
          userId: currentUser?.email || 'anonymous',
          metadata: {
            type: 'vip_subscription',
            period: getSubscriptionPeriod(),
            payment_method: 'mpesa'
          }
        })
      });

      const data = await response.json();
      
      if (data.success && data.checkoutId) {
        currentCheckoutIdRef.current = data.checkoutId;
        
        // Register with WebSocket if available
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'register',
            checkoutId: data.checkoutId
          }));
        }
        
        Swal.close();
        
        // Show M-Pesa prompt
        Swal.fire({
          title: "Check Your Phone",
          html: `
            <div style="text-align: center;">
              <i class="fas fa-mobile-alt" style="font-size: 48px; color: #065f46;"></i>
              <h3 style="margin: 15px 0;">Enter M-Pesa PIN</h3>
              <p>Check your phone to authorize payment of <strong>${symbol} ${convertPrice(price).toLocaleString()}</strong></p>
              <p style="margin-top: 10px;"><small>Phone: ${formattedPhone}</small></p>
              <div style="background: #f8f9ff; padding: 12px; border-radius: 8px; margin-top: 15px;">
                <p style="font-size: 0.8rem; margin: 0; color: #666;">
                  Reference: ${reference}
                </p>
              </div>
              <p style="font-size: 0.8rem; color: #059669; margin-top: 10px;">
                <i class="fas fa-clock"></i> You have 2 minutes to complete the payment
              </p>
            </div>
          `,
          icon: "info",
          confirmButtonText: "I've Completed Payment",
          showCancelButton: true,
          cancelButtonText: "Cancel",
        }).then((result) => {
          if (result.isConfirmed) {
            Swal.fire({
              title: "Waiting for Confirmation",
              html: `
                <div style="text-align: center;">
                  <div class="spinner-border text-success" role="status" style="width: 48px; height: 48px;">
                    <span class="visually-hidden">Loading...</span>
                  </div>
                  <p style="margin-top: 15px;">Please wait while we confirm your payment...</p>
                  <p style="font-size: 0.85rem; color: #666;">This will take a few moments</p>
                </div>
              `,
              allowOutsideClick: false,
              didOpen: () => {
                Swal.showLoading();
              }
            });
            
            // Start polling for payment status
            statusCheckIntervalRef.current = setInterval(() => {
              if (currentCheckoutIdRef.current) {
                checkPaymentStatus(currentCheckoutIdRef.current);
              }
            }, 5000);
            
            // Set timeout for payment confirmation (2 minutes)
            setTimeout(() => {
              if (statusCheckIntervalRef.current) {
                clearInterval(statusCheckIntervalRef.current);
                Swal.close();
                Swal.fire({
                  title: "Payment Not Confirmed",
                  text: "Payment confirmation timed out. Please check your M-Pesa statement or contact support.",
                  icon: "warning",
                  confirmButtonColor: "#059669"
                });
                setIsProcessing(false);
              }
            }, 120000);
          } else {
            setIsProcessing(false);
            Swal.fire({
              title: "Payment Cancelled",
              text: "You can complete the payment from your M-Pesa app or try again.",
              icon: "info"
            });
          }
        });
      } else {
        throw new Error(data.error || data.message || "Initiation failed");
      }
    } catch (error) {
      Swal.fire({
        title: "Payment Failed",
        text: error.message || "Unable to initiate payment. Please try again.",
        icon: "error"
      });
      setIsProcessing(false);
    }
  };

  return (
    <div className="mpesa-payment">
      <h3>
        GET {getSubscriptionPeriod().toUpperCase()} VIP FOR {getDisplayPrice()}
      </h3>
      <button 
        onClick={handleMpesaPayment} 
        className="paystack-btn"
        disabled={isProcessing}
        style={{
          opacity: isProcessing ? 0.7 : 1,
          cursor: isProcessing ? "not-allowed" : "pointer"
        }}
      >
        {isProcessing ? "Processing..." : "Pay with M-Pesa"}
      </button>
    </div>
  );
}