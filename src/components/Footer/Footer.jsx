import {
	ArrowUpward,
	Facebook,
	Telegram,
	WhatsApp,
	X,
	Instagram,
} from "@mui/icons-material";
import { useEffect, useState } from "react";
import "./Footer.scss";
import { Link, NavLink } from "react-router-dom";
import { socialLinks } from "../../data";

const Footer = ({ user }) => {
	const [isAdmin, setIsAdmin] = useState(null);
	const [showScroll, setShowScroll] = useState(false);

	const handleScroll = () => {
		window.scrollTo({
			top: 0,
			behavior: "smooth",
		});
	};

	const checkScrollTop = () => {
		if (!showScroll && window.pageYOffset > 400) {
			setShowScroll(true);
		} else if (showScroll && window.pageYOffset <= 400) {
			setShowScroll(false);
		}
	};

	useEffect(() => {
		window.addEventListener("scroll", checkScrollTop);
		return () => window.removeEventListener("scroll", checkScrollTop);
	}, [showScroll]);

	useEffect(() => {
		if (user !== null) {
			setIsAdmin(
				user.email === "kkibetkkoir@gmail.com" ||
					user.email === "arovanzgamez@gmail.com"
			);
		}
	}, [user]);

	return (
		<footer className="footer-glass">
			<div className="footer-content">
				<div className="footer-links">
					<p className="copyright">&copy; Goalytips {new Date().getFullYear()}</p>
					<NavLink to="/about#faq" className="footer-link">
						FAQ
					</NavLink>
					{isAdmin && (
						<NavLink to="/admin/tips" className="footer-link">
							ADD TIP
						</NavLink>
					)}
				</div>
			</div>

			<button
				className={`scroll-top ${showScroll ? "visible" : ""}`}
				onClick={handleScroll}
				aria-label="Scroll to top"
			>
				<ArrowUpward />
			</button>
		</footer>
	);
};

export default Footer;
