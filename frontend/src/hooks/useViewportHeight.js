/**
 * useViewportHeight — bulletproof viewport height for all browsers.
 * Uses Visual Viewport API + window resize to set a CSS variable.
 * Also triggers a React re-render when the height changes (for keyboard).
 */
import { useEffect, useState } from 'react';

export function useViewportHeight() {
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    function updateHeight() {
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${vh}px`);
      document.documentElement.style.setProperty('--vh', `${vh * 0.01}px`);
      setViewportHeight(vh);
    }

    updateHeight();

    // Listen to all possible resize events
    window.addEventListener('resize', updateHeight);
    window.addEventListener('orientationchange', updateHeight);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateHeight);
      window.visualViewport.addEventListener('scroll', updateHeight);
    }

    // Re-check after delays (Safari sometimes reports wrong height initially)
    const t1 = setTimeout(updateHeight, 100);
    const t2 = setTimeout(updateHeight, 300);
    const t3 = setTimeout(updateHeight, 1000);

    return () => {
      window.removeEventListener('resize', updateHeight);
      window.removeEventListener('orientationchange', updateHeight);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateHeight);
        window.visualViewport.removeEventListener('scroll', updateHeight);
      }
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  return viewportHeight;
}
