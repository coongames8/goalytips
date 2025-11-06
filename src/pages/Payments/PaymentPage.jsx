import { useState, useContext, useRef, useEffect } from "react";
//import { PriceContext, AuthContext } from '../../contexts';
import { Check, CopyAll } from "@mui/icons-material";
import AppHelmet from "../../components/AppHelmet";
import NowPaymentsApi from "@nowpaymentsio/nowpayments-api-js";
import { PaystackButton } from "react-paystack";
import { doc, setDoc } from "firebase/firestore";
import { db, getUser } from "../../firebase";
import "./Payments.scss";
import { AuthContext } from "../../AuthContext";
import { PriceContext } from "../../PriceContext";

const npApi = new NowPaymentsApi({ apiKey: "D7YT1YV-PCAM4ZN-HX9W5M1-H02KFCV" });

export default function PaymentPage({ setUserData }) {
	const { price, setPrice } = useContext(PriceContext);
	const { currentUser } = useContext(AuthContext);
	const [paymentType, setPaymentType] = useState("mpesa");
	const [currenciesArr, setCurrenciesArr] = useState(null);
	const [selectedCurrency, setSelectedCurrency] = useState("TUSD");
	const addressRef = useRef();
	const [copied, setCopied] = useState(false);
	const [payAmount, setPayAmount] = useState("");
	const [payCurrency, setPayCurrency] = useState("");
	const [address, setAddress] = useState("");
	const [network, setNetwork] = useState("");

	// Payment methods
	const paymentMethods = [
		{ id: "mpesa", label: "M-Pesa 📲" },
		{ id: "crypto", label: "Crypto ₿" },
	];

	// Subscription plans
	const subscriptionPlans = {
		mpesa: [
			{ id: "daily", value: 200, label: "Daily VIP", price: "KSH 200" },
			{ id: "weekly", value: 650, label: "7 Days VIP", price: "KSH 650" },
			{ id: "monthly", value: 1500, label: "30 Days VIP", price: "KSH 1500" },
			{ id: "yearly", value: 5000, label: "1 Year VIP", price: "KSH 5000" },
		],
		crypto: [
			{ id: "10", value: 10, label: "Weekly", price: "$10" },
			{ id: "12", value: 12, label: "Monthly", price: "$12" },
			{ id: "40", value: 40, label: "Yearly", price: "$40" },
		],
	};

	const getSubscriptionPeriod = () => {
		if (paymentType === "mpesa") {
			if (price === 200) return "Daily";
			if (price === 650) return "Weekly";
			if (price === 1500) return "Monthly";
			return "Yearly";
		} else {
			if (price === 10) return "Weekly";
			if (price === 12) return "Monthly";
			return "Yearly";
		}
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
			alert(`You Have Upgraded To ${getSubscriptionPeriod()} VIP`);
			window.location.pathname = "/";
		} catch (error) {
			alert(error.message);
		}
	};

	const paystackConfig = {
		reference: new Date().getTime().toString(),
		email: currentUser.email,
		amount: price * 100,
		publicKey: "pk_live_d2e5187d5e0f9edeb5a8be8c42fe66628906c370",//pk_live_d0d5675da8738d0b7cc7485cbf74c5e1c505bb27
		currency: "KES",
		metadata: { name: currentUser.email },
		text: "Pay Now",
		onSuccess: handleUpgrade,
		onClose: () => console.log("Payment closed"),
	};

	const getCryptoAddress = async () => {
		const params = {
			price_amount: price,
			price_currency: "usd",
			pay_currency: selectedCurrency.toLowerCase(),
		};
		const response = await npApi.createPayment(params);
		setPayAmount(response.pay_amount);
		setPayCurrency(response.pay_currency);
		setAddress(response.pay_address);
		setNetwork(response.network);
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
		if (paymentType === "crypto") getCryptoAddress();
	}, [selectedCurrency, price, paymentType]);

	return (
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
								onChange={() => setPaymentType(method.id)}
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
								onChange={(e) => setSelectedCurrency(e.target.value)}
								className="glass-select"
							>
								{currenciesArr?.map((currency) => (
									<option key={currency} value={currency}>
										{currency}
									</option>
								))}
							</select>
						</div>

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
							<p>
								Address: <span>{address}</span>
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
					</div>
				) : (
					<div className="mpesa-payment">
						<h3>
							GET {getSubscriptionPeriod().toUpperCase()} VIP FOR KSH {price}
						</h3>
						<PaystackButton {...paystackConfig} className="paystack-btn" />
					</div>
				)}
			</div>
		</div>
	);
}
