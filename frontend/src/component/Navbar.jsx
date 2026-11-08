import React, { useState, useRef, useCallback, useEffect } from 'react'
import { navbarStyles } from "../assets/dummyStyles";
import logo from '../assets/logo.png'
import { Link, useNavigate } from 'react-router-dom';
import { useUser, useAuth, useClerk, SignedOut } from "@clerk/clerk-react";

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const { user } = useUser();
  const { getToken, isSignedIn } = useAuth();
  const clerk = useClerk();
  const navigate = useNavigate();
  const profileRef = useRef(null);

  const TOKEN_KEY = "token";

  // for token generation and storage in localStorage
  const fetchAndStoreToken = useCallback(async (options = {}) => {
    try {
      if (!getToken) return null;

      const token = await getToken(options).catch(() => null);

      if (token) {
        try {
          localStorage.setItem(TOKEN_KEY, token);
          console.log(token); // fixed typo
        } catch (e) {
          // ignore
        }
        return token;
      } else {
        return null;
      }
    } catch (err) {
      return null;
    }
  }, [getToken]);

  useEffect(() => {
    let mounted = true;

    const handleToken = async () => {
      if (isSignedIn) {
        await fetchAndStoreToken();
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    };

    handleToken();

    return () => {
      mounted = false;
    };
  }, [isSignedIn,user, fetchAndStoreToken]);
  //after sucessful login to dashboard, token is generated and stored in localStorage. This token can be used for subsequent API calls to authenticate the user.
  useEffect(()=>{
  if(isSignedIn){
    const pathName = window.location.pathname || "/";
    if(
      pathName === "/login" ||
      pathName === "/signup" ||
      pathName.startsWith("/auth") ||
      pathName === "/"
    ){
      navigate("/app/dashboard",{ replace: true });
    }
  }
}, [isSignedIn, navigate]);
  // Close profile popover on outside click
useEffect(() => {
  function onDocClick(e) {
    if (!profileRef.current) return;
    if (!profileRef.current.contains(e.target)) {
      setProfileOpen(false);
    }
  }
  if (profileOpen) {
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("touchstart", onDocClick);
  }
  return () => {
    document.removeEventListener("mousedown", onDocClick);
    document.removeEventListener("touchstart", onDocClick);
  };
}, [profileOpen]);


  // Open Sign In
  function openSignIn(){
    try{
      if(clerk && clerk.openSignIn){
        clerk.openSignIn();
      } else {
        navigate("/login");
      }
    }catch(e){
      console.error("Error opening sign-in modal:", e);
      navigate("/login");
    }
  }

  // Open Sign Up
  function openSignUp(){
    try{
      if(clerk && clerk.openSignUp){
        clerk.openSignUp();
      } else {
        navigate("/login");
      }
    }catch(e){
      console.error("Error opening sign-up modal:", e);
      navigate("/login");
    }
  }

  return (
   <header className={navbarStyles.header}>
    <div className={navbarStyles.container}>
     <nav className={navbarStyles.nav}>
      
      <div className={navbarStyles.logoSection}>
        <Link to='/' className={navbarStyles.logoLink}>
          <img src={logo} alt="Logo" className={navbarStyles.logoImage}/>
          <span className={navbarStyles.logoText}>Invoice AI</span>
        </Link>

        <div className={navbarStyles.desktopNav}>
          <a href="#features" className={navbarStyles.navLink}>Features</a>
          <a href="#pricing" className={navbarStyles.navLinkInactive}>Pricing</a>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className={navbarStyles.authSection}>
          <SignedOut>
            <button 
              onClick={openSignIn} 
              className={navbarStyles.signInButton} 
              type="button">
              Sign In
            </button>

            <button 
              onClick={openSignUp} 
              className={navbarStyles.signUpButton} 
              type="button">
              <span className={navbarStyles.signUpText}>
                Get Started
              </span>
              <svg
               className={navbarStyles.signUpIcon}
               viewBox="0 0 24 24"
               fill="none"
               stroke="currentColor"
               strokeWidth="2">
                <path d="M5 12h14m-7-7l7 7-7 7" />
              </svg>
            </button>
          </SignedOut>

          {/* Mobile toggle */}
          <button onClick={()=>setOpen(!open)} className={navbarStyles.mobileMenuButton}>
            <div className={navbarStyles.mobileMenuIcon} >
              <span className={`${navbarStyles.mobileMenuLine1} ${open ? navbarStyles.mobileMenuLine1Open : navbarStyles.mobileMenuLine1Closed}`}></span>
              <span className={`${navbarStyles.mobileMenuLine2} ${open ? navbarStyles.mobileMenuLine2Open : navbarStyles.mobileMenuLine2Closed}`}></span>
              <span className={`${navbarStyles.mobileMenuLine3} ${open ? navbarStyles.mobileMenuLine3Open : navbarStyles.mobileMenuLine3Closed}`}></span>
            </div>
          </button>
        </div>
      </div>

     </nav>
    </div>

    <div className={`${open ? "block" : "hidden"} ${navbarStyles.mobileMenu}`}>
      <div className={navbarStyles.mobileMenuContainer}>
        <a href="#features" className={navbarStyles.mobileNavLink}>Features</a>
        <a href="#pricing" className={navbarStyles.mobileNavLinkInactive}>Pricing</a>
        <div className={navbarStyles.mobileAuthSection}> 
          <SignedOut>
            <button 
              onClick={openSignIn} 
              className={navbarStyles.mobileSignIn}>
              Sign In
            </button>
            <button 
              onClick={openSignUp} 
              className={navbarStyles.mobileSignIn}>
              Get Started
            </button>   
          </SignedOut>
        </div>
      </div>
    </div>

   </header>
  )
}

export default Navbar;

