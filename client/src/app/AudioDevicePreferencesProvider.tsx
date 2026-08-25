import { createContext, useContext, useState, type ReactNode } from 'react';

const INPUT_KEY = 'synccall.audio.inputDeviceId';
const OUTPUT_KEY = 'synccall.audio.outputDeviceId';

function readDeviceId(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

interface AudioDevicePreferencesContextValue {
  /** null = micrófono/salida predeterminada del sistema. */
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  setInputDeviceId: (deviceId: string | null) => void;
  setOutputDeviceId: (deviceId: string | null) => void;
}

const AudioDevicePreferencesContext = createContext<AudioDevicePreferencesContextValue | undefined>(undefined);

/**
 * Qué micrófono y qué salida de audio usar en las llamadas: preferencia del dispositivo/navegador
 * actual (localStorage), no del usuario — un deviceId de esta máquina no significa nada en otra.
 */
export function AudioDevicePreferencesProvider({ children }: { children: ReactNode }) {
  const [inputDeviceId, setInputDeviceIdState] = useState<string | null>(() => readDeviceId(INPUT_KEY));
  const [outputDeviceId, setOutputDeviceIdState] = useState<string | null>(() => readDeviceId(OUTPUT_KEY));

  function persist(key: string, deviceId: string | null): void {
    try {
      if (deviceId) {
        localStorage.setItem(key, deviceId);
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // localStorage puede fallar (modo privado, cuota llena): no persiste, pero sigue andando esta sesión.
    }
  }

  function setInputDeviceId(deviceId: string | null): void {
    setInputDeviceIdState(deviceId);
    persist(INPUT_KEY, deviceId);
  }

  function setOutputDeviceId(deviceId: string | null): void {
    setOutputDeviceIdState(deviceId);
    persist(OUTPUT_KEY, deviceId);
  }

  const value: AudioDevicePreferencesContextValue = { inputDeviceId, outputDeviceId, setInputDeviceId, setOutputDeviceId };
  return <AudioDevicePreferencesContext.Provider value={value}>{children}</AudioDevicePreferencesContext.Provider>;
}

export function useAudioDevicePreferences(): AudioDevicePreferencesContextValue {
  const ctx = useContext(AudioDevicePreferencesContext);
  if (!ctx) {
    throw new Error('useAudioDevicePreferences debe usarse dentro de <AudioDevicePreferencesProvider>');
  }
  return ctx;
}
