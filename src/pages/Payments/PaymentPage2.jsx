import { useState, useContext, useRef, useEffect } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { Check, CopyAll } from "@mui/icons-material";
import AppHelmet from "../../components/AppHelmet";
import NowPaymentsApi from "@nowpaymentsio/nowpayments-api-js";
import KoraPayment from "kora-checkout";
import { doc, setDoc } from "firebase/firestore";
import { db, getUser } from "../../firebase";
import "./Payments.scss";
import { AuthContext } from "../../AuthContext";
import { PriceContext } from "../../PriceContext";
import { useCurrency } from "../../CurrencyContext";
import Swal from "sweetalert2";
import { useFlutterwave, closePaymentModal } from 'flutterwave-react-v3';

const KORAPAY_KEY = "pk_live_KxNb5jDg18CQtJWzJt1RdgyMNsRo4D9NanrmE7nP";

// Flutterwave Public Key - Replace with your actual public key
const FLUTTERWAVE_PUBLIC_KEY = "FLWPUBK-d3031d6a729a533737bd65a51073bd37-X";

const npApi = new NowPaymentsApi({ apiKey: "D7YT1YV-PCAM4ZN-HX9W5M1-H02KFCV" });

// PayPal configuration
const paypalInitialOptions = {
  "client-id": "AXIggvGGvXozbZhdkvizPLd89nVYW8KoyNlHO0gHx7hjY_Ah_IfgXihUQGf7T2HUUVYx-D5SNncM0CtU",
  currency: "USD",
  intent: "capture",
};

// HashBack API Configuration
const HASHBACK_API_URL = 'https://hash-back-server-production.up.railway.app/';

// Fixed exchange rate (approximate KSH to USD)
const EXCHANGE_RATE = 150; // 1 USD = 150 KSH

// Paystack API Configuration
const PAYMENT_API_BASE = "https://payment-api-production-ea97.up.railway.app/api";

export default function PaymentPage2({ setUserData }) {
  const { price, setPrice } = useContext(PriceContext); // price is always in KSH
  const { currentUser } = useContext(AuthContext);
  const { symbol, convertPrice, currency} = useCurrency();
  const [paymentType, setPaymentType] = useState("korapay");
  const [currenciesArr, setCurrenciesArr] = useState(null);
  const [selectedCurrency, setSelectedCurrency] = useState("TUSD");
  const addressRef = useRef();
  const [copied, setCopied] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payCurrency, setPayCurrency] = useState("");
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("");
  const [paypalKey, setPaypalKey] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatingAddress, setGeneratingAddress] = useState(false);
  const [paymentId, setPaymentId] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const wsRef = useRef(null);
  const currentCheckoutIdRef = useRef(null);
  const statusCheckIntervalRef = useRef(null);
  const pollingIntervalRef = useRef(null);

  // Paystack states
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [step, setStep] = useState(0);
  const [paystackError, setPaystackError] = useState(null);
  const pollRef = useRef(null);
  const referenceRef = useRef(null);

  // Payment methods - Added Paystack
  const paymentMethods = [
    /*{ id: "mpesa", label: "M-Pesa 📱" },*/
    /*{ id: "korapay", label: "Korapay 💳" },*/
    /*{ id: "flutterwave", label: "Flutterwave 💳" },*/
    /*{ id: "korapay", label: paymentType === "korapay" && currency === "KES" ? "Mobile (M-Pesa/Airtel)📲" : "Card/Bank 💳"},*/
    { id: "korapay", label: "Mobile/Card/Bank 💳"},
    /*{ id: "paystack", label: "Paystack 💳" },*/
    { id: "crypto", label: "Crypto ₿" },
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
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (pollRef.current) {
        pollRef.current.cancel();
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
          console.log('WebSocket message:', message);
          
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
        console.log('WebSocket disconnected');
        setTimeout(setupWebSocket, 5000);
      };
    } catch (error) {
      console.log('WebSocket not supported, using polling fallback');
    }
  };

  // Currency conversion helpers
  const kshToUsd = (ksh) => (ksh / EXCHANGE_RATE).toFixed(2);
  const usdToKsh = (usd) => Math.round(usd * EXCHANGE_RATE);

  // Get current price in USD for PayPal/Crypto
  const getCurrentPriceInUsd = () => {
    return kshToUsd(price);
  };

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

  // Initialize price based on payment type
  useEffect(() => {
    const defaultPlan = subscriptionPlans[paymentType][0];
    setPrice(defaultPlan.value);
  }, [paymentType]);

  const getSubscriptionPeriod = () => {
    if (price === 200 || price === 300) return "Daily";
    if (price === 700 || price === 2000) return "Weekly";
    if (price === 2000 || price === 2400) return "Monthly";
    return "Yearly";
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
    
    if (statusCheckIntervalRef.current) {
      clearInterval(statusCheckIntervalRef.current);
    }
    
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

  const checkPaymentStatus = async (checkoutId) => {
    try {
      const response = await fetch(`${HASHBACK_API_URL}/api/check-payment-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutId })
      });
      
      const data = await response.json();
      console.log('Status check:', data);
      
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
          setIsProcessing(false);
          setStep(0);
          const errorMsg = err?.timeout 
            ? 'Payment timed out. Please check your transaction status.' 
            : (err?.message || 'Payment failed. Please try again.');
          setPaystackError(errorMsg);
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
      Swal.close();
      setIsProcessing(false);
      setPaystackError(e.message);
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

  // ==================== END PAYSTACK FUNCTIONS ====================

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
      console.log('Initiation response:', data);
      
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
      console.error('Payment error:', error);
      Swal.fire({
        title: "Payment Failed",
        text: error.message || "Unable to initiate payment. Please try again.",
        icon: "error"
      });
      setIsProcessing(false);
    }
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

  // Force PayPal buttons to re-render when price changes
  useEffect(() => {
    if (paymentType === "paypal") {
      setPaypalKey(prev => prev + 1);
    }
  }, [price, paymentType]);

  // Handle payment method change
  const handlePaymentMethodChange = (methodId) => {
    setPaymentType(methodId);
    setIsProcessing(false);
    setAddress("");
    setPaymentId(null);
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
    // Reset Paystack states
    setPhone("");
    setOtp("");
    setAwaitingOtp(false);
    setStep(0);
    setPaystackError(null);
    if (pollRef.current) {
      pollRef.current.cancel();
      pollRef.current = null;
    }
  };

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
    console.error("PayPal error:", err);
    Swal.fire({
      title: "Payment Failed",
      text: "PayPal payment failed. Please try again.",
      icon: "error"
    });
  };

  // Helper to display price based on payment type
  const getDisplayPrice = () => {
    if (paymentType === "mpesa" || paymentType === "korapay" || paymentType === "flutterwave" || paymentType === "paystack") {
      return `${symbol} ${convertPrice(price).toLocaleString()}`;
    } else {
      return `${getCurrentPriceInUsd()}`;
    }
  };

  // Handle Korapay payment
  const handleKorapayPayment = () => {
    if (isProcessing) return;
    setIsProcessing(true);
    const amount = convertPrice(price);
    const payCurrency = currency === "NGN" ? "NGN" : "KES";
    const paymentOptions = {
      key: KORAPAY_KEY,
      reference: new Date().getTime().toString(),
      amount,
      currency: payCurrency,
      customer: {
        name: currentUser?.email || "Goalytips User",
        email: currentUser?.email || "coongames8@gmail.com",
      },
      onSuccess: () => {
        setIsProcessing(false);
        handleUpgrade();
      },
      onFailed: (err) => {
        setIsProcessing(false);
        Swal.fire({
          title: "Payment Failed",
          text: err?.message || "Korapay payment was not successful. Please try again.",
          icon: "error"
        });
      },
    };
    const payment = new KoraPayment();
    payment.initialize(paymentOptions);
  };

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
        console.log('Flutterwave payment response:', response);
        
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
    <PayPalScriptProvider options={paypalInitialOptions}>
      <div className="payment-container">
        <AppHelmet title="Payment" location="/pay" />

        <div className="payment-glass">
          <h2 className="payment-title">Select Payment Method</h2>

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

          {paymentType === "crypto" ? (
            <div className="crypto-details">
              <h3>CRYPTO PAYMENT DETAILS</h3>

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
          ) : paymentType === "mpesa" ? (
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
          ) /*: paymentType === "korapay" && currency === "KES" ? (
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
          )*/ : paymentType === "korapay" ? (
            <div className="mpesa-payment">
              <h3>
                GET {getSubscriptionPeriod().toUpperCase()} VIP FOR {getDisplayPrice()}
              </h3>
              <button
                onClick={currency === "KES" ? handleFlutterwavePay : handleKorapayPayment}
                className="paystack-btn"
                disabled={isProcessing}
                style={{
                  opacity: isProcessing ? 0.7 : 1,
                  cursor: isProcessing ? "not-allowed" : "pointer"
                }}
              >
                {isProcessing ? "Processing..." : "Pay Now"}
              </button>
            </div>
          ) : (
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
          )}
        </div>
      </div>
    </PayPalScriptProvider>
  );
}