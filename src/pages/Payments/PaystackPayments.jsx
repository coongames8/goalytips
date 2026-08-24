import { useState, useRef } from "react";
import Swal from "sweetalert2";

const PAYMENT_API_BASE = "https://payment-api-production-ea97.up.railway.app/api";

export default function PaystackPayments({ 
  price, 
  currentUser, 
  symbol, 
  convertPrice,
  isProcessing,
  setIsProcessing,
  getSubscriptionPeriod,
  getDisplayPrice,
  handleUpgrade
}) {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [step, setStep] = useState(0);
  const [paystackError, setPaystackError] = useState(null);
  const pollRef = useRef(null);
  const referenceRef = useRef(null);
  const errorShownRef = useRef(false);

  // ==================== PAYSTACK FUNCTIONS ====================
  
  const safeJson = async (response) => {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { error: "Invalid JSON response", raw: text, status: response.status };
    }
  };

  const handlePaystackError = (data, response, fallback) => {
    const message =
      data?.message ||
      data?.error ||
      data?.paystack_error?.message ||
      data?.error_type ||
      `${fallback}: ${response.status}`;
    return new Error(message);
  };

  const initializePaystackPayment = async ({ email, amount, phone, userId, activation_type }) => {
    const response = await fetch(`${PAYMENT_API_BASE}/initialize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        amount: amount.toString(),
        phone,
        userId: userId || "anonymous",
        activation_type: activation_type || "account_activation",
      }),
    });
    const data = await safeJson(response);
    if (!response.ok || !data.success) {
      throw handlePaystackError(data, response, "Payment initialization failed");
    }
    return data;
  };

  const checkPaystackStatus = async (reference) => {
    const response = await fetch(`${PAYMENT_API_BASE}/status/${encodeURIComponent(reference)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const data = await safeJson(response);
    if (!response.ok || !data.success) {
      throw handlePaystackError(data, response, "Status check failed");
    }
    return data;
  };

  const verifyPaystackPayment = async (reference) => {
    const response = await fetch(`${PAYMENT_API_BASE}/verify/${encodeURIComponent(reference)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const data = await safeJson(response);
    if (!response.ok || !data.success) {
      throw handlePaystackError(data, response, "Verification failed");
    }
    return data;
  };

  const submitPaystackOtp = async (reference, otpCode) => {
    const response = await fetch(`${PAYMENT_API_BASE}/submit-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otp: otpCode.toString(), reference }),
    });
    const data = await safeJson(response);
    if (!response.ok || !data.success) {
      throw handlePaystackError(data, response, "OTP submission failed");
    }
    return data;
  };

  const pollPaystackTransaction = (reference, onSuccess, onFailure, onRequireOtp, maxAttempts = 36) => {
    let attempts = 0;
    let suspended = false;
    let cancelled = false;
    let timer = null;

    const tick = async () => {
      if (cancelled || suspended) return;
      attempts++;
      try {
        const data = await checkPaystackStatus(reference);
        if (cancelled) return;

        if (data.paid) {
          const verified = await verifyPaystackPayment(reference).catch(() => null);
          onSuccess(verified || data);
          return;
        }
        if (data.requires_action && data.status === "send_otp" && onRequireOtp) {
          suspended = true;
          onRequireOtp(reference);
          return;
        }
        if (data.can_retry) {
          onFailure({ message: data.message || "Payment failed. Please try again." });
          return;
        }
        if (attempts >= maxAttempts) {
          onFailure({ timeout: true });
        }
      } catch (error) {
        if (cancelled) return;
        if (attempts >= maxAttempts) {
          onFailure({ timeout: true, error: error.message });
        }
      }
    };

    timer = setInterval(tick, 5000);
    tick();

    return {
      async resume() {
        if (cancelled) return;
        suspended = false;
        attempts = 0;
        tick();
      },
      cancel() {
        cancelled = true;
        if (timer) clearInterval(timer);
      },
    };
  };

  const formatPhone = (p) => {
    let clean = p.replace(/\D/g, '');
    if (clean.startsWith('0')) return clean;
    if (clean.startsWith('254')) return '0' + clean.slice(3);
    if (clean.startsWith('7') || clean.startsWith('1')) return '0' + clean;
    return clean;
  };

  const initiatePaystackPayment = async () => {
    setIsProcessing(true);
    setAwaitingOtp(false);
    setOtp('');
    setPaystackError(null);

    Swal.fire({
      title: "Initiating Payment",
      html: "Connecting to M-Pesa...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const formattedPhone = formatPhone(phone);
      const email = currentUser?.email;

      if (!email) {
        throw new Error("User email not found. Please login again.");
      }

      const amountToPay = Math.round(convertPrice(price));

      const data = await initializePaystackPayment({
        email: email,
        amount: amountToPay,
        phone: formattedPhone,
        userId: currentUser?.email || "anonymous",
        activation_type: "vip_subscription",
      });

      if (!data.reference) {
        throw new Error('No reference returned from payment gateway');
      }

      Swal.close();
      referenceRef.current = data.reference;
      setStep(1);

      pollRef.current = pollPaystackTransaction(
        data.reference,
        async () => {
          setIsProcessing(false);
          Swal.fire({
            title: "Payment Successful! 🎉",
            html: `
              <div style="text-align: center;">
                <i class="fas fa-check-circle" style="font-size: 48px; color: #10b981;"></i>
                <h3 style="margin: 15px 0;">${symbol} ${convertPrice(price).toLocaleString()} Paid</h3>
                <p>Your VIP subscription payment was successful!</p>
              </div>
            `,
            icon: "success",
            confirmButtonText: "Activate Subscription",
          }).then(() => {
            handleUpgrade();
          });
        },
        (err) => {
          if (errorShownRef.current) return; // Skip if already shown
  
          setIsProcessing(false);
          setStep(0);
          const errorMsg = err?.timeout 
            ? 'Payment timed out. Please check your transaction status.' 
            : (err?.message || 'Payment failed. Please try again.');
          setPaystackError(errorMsg);

          errorShownRef.current = true; // Mark as shown
          Swal.fire({
            title: "Payment Failed",
            text: errorMsg,
            icon: "error",
            confirmButtonText: "OK",
          });
        },
        (reference) => {
          setAwaitingOtp(true);
          setIsProcessing(false);
          setStep(0);
          Swal.close();
          Swal.fire({
            title: "OTP Required",
            text: "A one-time code has been sent to your phone. Please enter it below.",
            icon: "info",
            confirmButtonText: "OK",
          });
        }
      );
    } catch (e) {
      if (errorShownRef.current) return; // Skip if already shown

      Swal.close();
      setIsProcessing(false);
      setPaystackError(e.message);

      errorShownRef.current = true;
      Swal.fire({
        title: "Payment Failed",
        text: e.message || "Unable to process payment. Please try again.",
        icon: "error",
        confirmButtonText: "OK",
      });
    }
  };

  const handlePaystackSubmitOtp = async () => {
    if (!otp) {
      if (errorShownRef.current) return;
      errorShownRef.current = true;
      setPaystackError('Please enter the OTP sent to your phone');
      return;
    }
    setPaystackError(null);
    setIsProcessing(true);
    try {
      await submitPaystackOtp(referenceRef.current, otp);
      setAwaitingOtp(false);
      setIsProcessing(true);
      setStep(1);
      if (pollRef.current) {
        await pollRef.current.resume();
      }
    } catch (e) {
      setIsProcessing(false);
      setPaystackError(e.message);
      Swal.fire({
        title: "OTP Verification Failed",
        text: e.message || "Invalid OTP. Please try again.",
        icon: "error",
        confirmButtonText: "OK",
      });
    }
  };

  const handlePaystackPayment = async () => {
    if (!currentUser) {
      Swal.fire({
        title: "Login Required",
        text: "Please login first",
        icon: "warning",
        confirmButtonText: "OK",
      });
      return;
    }

    if (!phone) {
      setPaystackError('Please enter your phone number');
      return;
    }

    setPaystackError(null);
    await initiatePaystackPayment();
  };

  return (
    <div className="mpesa-payment">
      <h3>
        GET {getSubscriptionPeriod().toUpperCase()} VIP FOR {getDisplayPrice()}
      </h3>
      
      {!awaitingOtp && step === 0 && (
        <>
          <div style={{ width: '100%', marginBottom: '12px' }}>
            <input
              type="tel"
              placeholder="Enter M-Pesa phone number"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              className="paystack-btn"
              style={{
                background: 'white',
                color: '#333',
                border: '1px solid #ddd',
                textAlign: 'left',
                paddingLeft: '16px',
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '14px',
              }}
              maxLength={10}
            />
            <p style={{ fontSize: '12px', color: '#666', marginTop: '4px', textAlign: 'left' }}>
              Format: 07XXXXXXXX or 2547XXXXXXXX
            </p>
          </div>
          {paystackError && (
            <p style={{ fontSize: '13px', color: '#dc2626', margin: '-8px 0 4px 0', textAlign: 'left' }}>
              ⚠️ {paystackError}
            </p>
          )}
        </>
      )}

      {awaitingOtp && (
        <div style={{ width: '100%', marginBottom: '12px' }}>
          <input
            type="text"
            placeholder="Enter OTP code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            className="paystack-btn"
            style={{
              background: 'white',
              color: '#333',
              border: '1px solid #ddd',
              textAlign: 'left',
              paddingLeft: '16px',
              width: '100%',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '14px',
            }}
            maxLength={6}
          />
          <p style={{ fontSize: '12px', color: '#666', marginTop: '4px', textAlign: 'left' }}>
            A one-time code was sent to your phone
          </p>
          {paystackError && (
            <p style={{ fontSize: '13px', color: '#dc2626', margin: '-8px 0 4px 0', textAlign: 'left' }}>
              ⚠️ {paystackError}
            </p>
          )}
        </div>
      )}

      <button
        onClick={awaitingOtp ? handlePaystackSubmitOtp : handlePaystackPayment}
        className="paystack-btn"
        disabled={isProcessing}
        style={{
          opacity: isProcessing ? 0.7 : 1,
          cursor: isProcessing ? "not-allowed" : "pointer"
        }}
      >
        {isProcessing ? "Processing..." : awaitingOtp ? "Submit OTP" : "Pay Now"}
      </button>
    </div>
  );
}