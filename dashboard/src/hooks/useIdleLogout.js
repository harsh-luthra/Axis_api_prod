import { useEffect, useRef } from 'react';

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];

export default function useIdleLogout(timeoutMs, onTimeout) {
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    let timeoutId;

    function reset() {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => onTimeoutRef.current?.(), timeoutMs);
    }

    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timeoutId);
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, reset));
    };
  }, [timeoutMs]);
}
