import { useEffect, useRef, useState } from 'react';

interface StreamEntry {
  id: string;
  stream: MediaStream | null;
}

interface AnalyserEntry {
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  data: Uint8Array<ArrayBuffer>;
}

const SPEAKING_THRESHOLD = 12;
const POLL_INTERVAL_MS = 150;

function getAudioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

/** Detección de "quién está hablando" por volumen (AnalyserNode por stream), para pintar el borde de cada tarjeta en la pantalla de llamada. Reconstruye los analizadores cuando cambia el roster de streams (join/leave), no en cada render. */
export function useSpeakingParticipants(entries: StreamEntry[]): Set<string> {
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, AnalyserEntry>>(new Map());
  const streamsKey = entries.map((e) => `${e.id}:${e.stream?.id ?? 'none'}`).join('|');

  useEffect(() => {
    const Ctor = getAudioContextCtor();
    if (!Ctor) {
      return;
    }
    if (!audioContextRef.current) {
      audioContextRef.current = new Ctor();
    }
    const ctx = audioContextRef.current;

    const currentIds = new Set(entries.map((e) => e.id));
    analysersRef.current.forEach((entry, id) => {
      if (!currentIds.has(id)) {
        entry.source.disconnect();
        analysersRef.current.delete(id);
      }
    });

    entries.forEach(({ id, stream }) => {
      if (!stream || stream.getAudioTracks().length === 0 || analysersRef.current.has(id)) {
        return;
      }
      try {
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        analysersRef.current.set(id, {
          source,
          analyser,
          data: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
        });
      } catch {
        // El stream puede no estar listo todavía (justo llegó el track); se reintenta en el próximo cambio de roster.
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamsKey]);

  useEffect(() => {
    const interval = setInterval(() => {
      const next = new Set<string>();
      analysersRef.current.forEach(({ analyser, data }, id) => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          sum += data[i];
        }
        if (sum / data.length > SPEAKING_THRESHOLD) {
          next.add(id);
        }
      });
      setSpeaking((prev) => {
        if (prev.size === next.size && Array.from(prev).every((id) => next.has(id))) {
          return prev;
        }
        return next;
      });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      analysersRef.current.forEach((entry) => entry.source.disconnect());
      analysersRef.current.clear();
      void audioContextRef.current?.close().catch(() => {});
      audioContextRef.current = null;
    };
  }, []);

  return speaking;
}
