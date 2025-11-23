import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Universal Link Handler
 * Ensures deep links and external navigation work across all platforms
 */
export default function UniversalLinkHandler() {
  const navigate = useNavigate();
  
  useEffect(() => {
    // Handle custom URL schemes and deep links
    const handleAppOpen = (event) => {
      const url = event.url || window.location.href;
      
      // Parse deep link parameters
      const urlParams = new URLSearchParams(new URL(url).search);
      const page = urlParams.get('page');
      const action = urlParams.get('action');
      
      if (page) {
        navigate(`/${page}`);
      }
      
      if (action === 'login') {
        // Handle login redirect
        navigate('/');
      }
    };
    
    // Listen for app resume events (mobile)
    window.addEventListener('appopen', handleAppOpen);
    
    // Handle universal links on iOS
    if (window.webkit?.messageHandlers?.appOpen) {
      window.webkit.messageHandlers.appOpen.postMessage = handleAppOpen;
    }
    
    // Handle Android intent links
    if (window.Android?.handleIntent) {
      window.handleIntent = handleAppOpen;
    }
    
    // Ensure all external links open in the appropriate context
    const handleLinkClick = (event) => {
      const target = event.target.closest('a');
      if (!target) return;
      
      const href = target.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      
      // External links
      if (href.startsWith('http') && !href.includes(window.location.hostname)) {
        // Check if in embedded context
        const isEmbedded = window !== window.top;
        const isInApp = /FBAN|FBAV|Instagram|Line|WhatsApp/i.test(navigator.userAgent);
        
        if (isEmbedded || isInApp) {
          event.preventDefault();
          // Try to open in system browser
          if (window.open(href, '_system')) {
            return;
          }
          // Fallback: try _blank
          window.open(href, '_blank', 'noopener,noreferrer');
        }
      }
    };
    
    document.addEventListener('click', handleLinkClick);
    
    return () => {
      window.removeEventListener('appopen', handleAppOpen);
      document.removeEventListener('click', handleLinkClick);
    };
  }, [navigate]);
  
  return null;
}