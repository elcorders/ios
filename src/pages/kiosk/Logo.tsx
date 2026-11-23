import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { KIOSK_TAPS, KIOSK_TAP_WINDOW_MS } from '../../components/Layout';
import { setKioskMode } from '../../lib/kioskMode';

/** Kiosk logo. S21.F6: the same gesture that opens the kiosk (6 presses in 3 s) offers to exit kiosk mode. */
export function Logo() {
  const navigate = useNavigate();
  const taps = useRef<number[]>([]);
  const onTap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t <= KIOSK_TAP_WINDOW_MS), now];
    if (taps.current.length < KIOSK_TAPS) return;
    taps.current = [];
    if (!window.confirm('Exit kiosk mode? This screen stays paired; press the site logo 6 times to come back.')) return;
    setKioskMode(false);
    navigate('/');
  };
  return (
    <span className="kiosk-logo" onClick={onTap}>
      <span className="logo" aria-hidden="true"></span>
      <span>NIBM iOS</span>
    </span>
  );
}
