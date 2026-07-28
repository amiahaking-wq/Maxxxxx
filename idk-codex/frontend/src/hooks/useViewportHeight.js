/**
 * useViewportHeight — bulletproof viewport height for all browsers.
 * Uses Visual Viewport API + window resize to set a CSS variable.
 * Works on: iOS Safari, Chrome Android, Desktop, iPad.
 */
import { useEffect } from 'react';

export function useViewportHeight() {
  useEffect(() => {
    function setHeight() {
      // Visual Viewport API — the most accurate on mobile
      // Accounts for address bar, keyboard, and bottom toolbar
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
      document.documentElement.style.setProperty('--app-height', `${vh}px`);
      document.documentElement.style.setProperty('--app-width', `${vw}px`);
      
      // Also set --vh for backward compat
      document.documentElement.style.setProperty('--vh', `${vh * 0.01}px`);
    }

    setHeight();

    // Listen to all possible resize events
    window.addEventListener('resize', setHeight);
    window.addEventListener('orientationchange', setHeight);
    
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', setHeight);
      window.visualViewport.addEventListener('scroll', setHeight);
    }

    // Re-check after a delay (Safari sometimes reports wrong height initially)
    const timeout = setTimeout(setHeight, 300);
    const timeout2 = setTimeout(setHeight, 1000);

    return () => {
      window.removeEventListener('resize', setHeight);
      window.removeEventListener('orientationchange', setHeight);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', setHeight);
        window.visualViewport.removeEventListener('scroll', setHeight);
      }
      clearTimeout(timeout);
      clearTimeout(timeout2);
    };
  }, []);
}
