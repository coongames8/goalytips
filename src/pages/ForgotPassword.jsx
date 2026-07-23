import { useEffect, useLayoutEffect, useState } from "react";
import AppHelmet from "../components/AppHelmet";
import { resetPassword } from "../firebase";
import { NavLink } from "react-router-dom";

export const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    resetPassword(email, setSuccess, setError);
  };

  useEffect(() => {
    error &&
      setTimeout(() => {
        setError(null);
      }, 5000);
    success &&
      setTimeout(() => {
        setSuccess(null);
        setEmail("");
      }, 5000);
  }, [error, success]);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  });

  return (
    <div className="auth-container">
      <AppHelmet title={"Forgot Password"} location={"/forgot-password"} />
      <div className="auth-glass">
        <div className="auth-header">
          <h2>Forgot Password</h2>
          <p>Enter your email to receive a reset link</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
            />
          </div>

          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <button type="submit" className="auth-btn">
            SEND RESET LINK
          </button>

          <div className="auth-footer">
            <span>Remember your password?</span>
            <NavLink to="/login" className="auth-link">
              Login &raquo;
            </NavLink>
          </div>
        </form>
      </div>
    </div>
  );
};
