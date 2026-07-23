import Logo from '../../assets/logo.png';
import './Navbar.scss';
import { NavLink } from "react-router-dom";
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../AuthContext';
import { ThemeContext } from '../../ThemeContext';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase';
import { Menu, Close, LightMode, DarkMode, Logout } from '@mui/icons-material';

const Navbar1 = () => {
    const { currentUser } = useContext(AuthContext);
    const { theme, toggleTheme } = useContext(ThemeContext);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 12);
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => {
        document.body.style.overflow = mobileOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [mobileOpen]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (err) {
            console.error("Logout failed:", err);
        }
    }

    const closeMenu = () => setMobileOpen(false);

    return (
        <header className={`glass-navbar ${scrolled ? 'scrolled' : ''}`}>
            <div className="navbar-container">
                <NavLink to="/" className='logo' onClick={closeMenu}>
                    <img src={Logo} alt='Goalytips logo' />
                    <span className="brand-name">Goalytips</span>
                </NavLink>

                <nav className={`desktop-nav ${mobileOpen ? 'mobile-open' : ''}`}>
                    <NavLink to="/" onClick={closeMenu} className={({ isActive }) => isActive ? 'active' : ''}>Home</NavLink>
                    <NavLink to="/about" onClick={closeMenu} className={({ isActive }) => isActive ? 'active' : ''}>About</NavLink>
                    <div className="btn-wrapper">
                        {currentUser ?
                            <button className="glass-btn logout-btn" onClick={() => { handleLogout(); closeMenu(); }}>
                                <Logout className="btn-icon" /> Logout
                            </button> :
                            <NavLink className="glass-btn" to="/login" onClick={closeMenu}>Log In</NavLink>
                        }
                    </div>
                </nav>

                <div className="nav-actions">
                    <button
                        className="theme-toggle"
                        onClick={toggleTheme}
                        aria-label="Toggle theme"
                        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    >
                        {theme === 'dark' ? <LightMode /> : <DarkMode />}
                    </button>

                    <button
                        className="menu-toggle"
                        onClick={() => setMobileOpen(!mobileOpen)}
                        aria-label="Toggle menu"
                    >
                        {mobileOpen ? <Close /> : <Menu />}
                    </button>
                </div>
            </div>

            {mobileOpen && <div className="nav-overlay" onClick={closeMenu} />}
        </header>
    );
}

export default Navbar1;
