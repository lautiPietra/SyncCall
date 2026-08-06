import { useEffect, useState } from 'react';
import { SyncCallMark } from '../components/ui/SyncCallMark';

const NAME = 'SyncCall';
const LETTER_DELAY_MS = 70;
const WINK_DELAY_MS = 1800;
const LEAVE_DELAY_MS = 3000;
const LEAVE_DURATION_MS = 500;

interface SplashScreenProps {
  onFinish: () => void;
}

export function SplashScreen({ onFinish }: SplashScreenProps) {
  const [wink, setWink] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const winkTimer = setTimeout(() => setWink(true), WINK_DELAY_MS);
    const leaveTimer = setTimeout(() => setLeaving(true), LEAVE_DELAY_MS);
    const finishTimer = setTimeout(onFinish, LEAVE_DELAY_MS + LEAVE_DURATION_MS);

    return () => {
      clearTimeout(winkTimer);
      clearTimeout(leaveTimer);
      clearTimeout(finishTimer);
    };
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#232C4D] via-bg-secondary to-bg transition-opacity ${
        leaving ? 'animate-fade-out' : ''
      }`}
    >
      <div className="relative flex flex-col items-center gap-6">
        <div className="absolute left-1/2 top-1/2 -z-10 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl" />
        <SyncCallMark size={110} wink={wink} />

        <h1 className="flex text-4xl font-extrabold tracking-tight sm:text-5xl">
          {NAME.split('').map((letter, i) => (
            <span
              key={i}
              className="animate-letter-in inline-block opacity-0"
              style={{
                animationDelay: `${300 + i * LETTER_DELAY_MS}ms`,
                ...(i >= 4
                  ? {
                      backgroundImage: 'linear-gradient(to right, #5B6DFF, #7A5AF8)',
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      color: 'transparent',
                    }
                  : { color: 'white' }),
              }}
            >
              {letter}
            </span>
          ))}
        </h1>

        <p
          className="animate-fade-in text-sm tracking-widest text-text-description opacity-0"
          style={{ animationDelay: '1100ms' }}
        >
          CONECTA EN TIEMPO REAL
        </p>
      </div>
    </div>
  );
}
