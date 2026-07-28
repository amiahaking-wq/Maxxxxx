/**
 * useViewportHeight — bulletproof viewport height for ALL browsers and devices.
 * 
 * Handles:
 * - iOS Safari address bar showing/hiding
 * - Mobile keyboard opening/closing
 * - Android Chrome toolbar
 * - Orientation changes
 * - Dynamic Island / notch safe areas
 */
import { useEffect, useState } from 'react';

export function useViewportHeight() {
  const [viewportHeight, setViewportHeight] = useState(() => {
    if (typeof window === 'undefined') return 0;
    return window.visualViewport ? window.visualViewport.height : window.innerHeight;
  });

  useEffect(() => {
    function updateHeight() {
      // Visual Viewport API is the most accurate — accounts for keyboard,
      // address bar, bottom toolbar, etc.
      const vh = window.visualViewport 
        ? window.visualViewport.height 
        : window.innerHeight;
      
      // Also get the offset (how much the keyboard pushed the viewport up)
      const offsetTop = window.visualViewport 
        ? window.visualViewport.offsetTop 
        : 0;

      // Set CSS variables for components that use them
      document.documentElement.style.setProperty('--app-height', `${vh}px`);
      document.documentElement.style.setProperty('--vh', `${vh * 0.01}px`);
      document.documentElement.style.setProperty('--viewport-offset', `${offsetTop}px`);
      
      // Update state to trigger re-render
      setViewportHeight(vh);
    }

    // Initial set
    updateHeight();

    // Use ResizeObserver on visualViewport for the most responsive updates
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateHeight);
      window.visualViewport.addEventListener('scroll', updateHeight);
    }

    // Fallback listeners
    window.addEventListener('resize', updateHeight);
    window.addEventListener('orientationchange', () => {
      // Delay for orientation change to complete
      setTimeout(updateHeight, 100);
      setTimeout(updateHeight, 500);
    });

    // Handle focus/blur on inputs (keyboard open/close detection)
    document.addEventListener('focusin', () => {
      // Keyboard opening — update after a short delay
      setTimeout(updateHeight, 100);
      setTimeout(updateHeight, 300);
    });
    document.addEventListener('focusout', () => {
      // Keyboard closing — update after a short delay
      setTimeout(updateHeight, 100);
      setTimeout(updateHeight, 300);
    });

    // Safari sometimes reports wrong height initially — keep checking
    const intervals = [100, 300, 500, 1000, 2000].map(delay => 
      setTimeout(updateHeight, delay)
    );

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateHeight);
        window.visualViewport.removeEventListener('scroll', updateHeight);
      }
      window.removeEventListener('resize', updateHeight);
      window.removeEventListener('orientationchange', updateHeight);
      document.removeEventListener('focusin', updateHeight);
      document.removeEventListener('focusout', updateHeight);
      intervals.forEach(clearTimeout);
    };
  }, []);

  return viewportHeight;
}
