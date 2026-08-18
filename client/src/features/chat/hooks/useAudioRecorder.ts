import { useEffect, useRef, useState } from 'react';

/** Tope duro para no generar archivos gigantes: a los 5 minutos se corta sola. */
const MAX_DURATION_SEC = 300;

const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    // Si el chat se desmonta con el micrófono todavía abierto (navegaste sin cancelar), corta
    // la grabación igual: no dejar el ícono de "usando el micrófono" prendido en el navegador.
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      clearInterval(timerRef.current);
    };
  }, []);

  function cleanupStream(): void {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    clearInterval(timerRef.current);
  }

  async function startRecording(): Promise<void> {
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Tu navegador no permite grabar audio.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();

      setIsRecording(true);
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => {
          const next = prev + 1;
          if (next >= MAX_DURATION_SEC) {
            mediaRecorderRef.current?.stop();
          }
          return next;
        });
      }, 1000);
    } catch {
      setError('No se pudo acceder al micrófono. Revisá los permisos del navegador.');
    }
  }

  /** Corta la grabación y devuelve el audio grabado (o null si no había nada grabando). */
  function stopAndGetBlob(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];
        resolve(blob);
      };
      recorder.stop();
      setIsRecording(false);
      cleanupStream();
    });
  }

  /** Descarta la grabación en curso sin subir nada. */
  function cancelRecording(): void {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    chunksRef.current = [];
    setIsRecording(false);
    cleanupStream();
  }

  return { isRecording, elapsedSeconds, error, startRecording, stopAndGetBlob, cancelRecording };
}
