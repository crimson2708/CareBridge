import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeNote } from "./api/client";
import type { TranscribeResponse, VoiceLanguage } from "./api/types";

const encodeWAV = (audioBuffer: AudioBuffer): Blob => {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const bitDepth = 16;

  const result = new Float32Array(audioBuffer.length * numChannels);
  if (numChannels === 2) {
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    for (let i = 0; i < audioBuffer.length; i += 1) {
      result[i * 2] = left[i];
      result[i * 2 + 1] = right[i];
    }
  } else {
    result.set(audioBuffer.getChannelData(0));
  }

  const dataLength = result.length * (bitDepth / 8);
  const bufferLength = 44 + dataLength;
  const dataView = new DataView(new ArrayBuffer(bufferLength));

  const writeString = (view: DataView, offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(dataView, 0, "RIFF");
  dataView.setUint32(4, 36 + dataLength, true);
  writeString(dataView, 8, "WAVE");
  writeString(dataView, 12, "fmt ");
  dataView.setUint32(16, 16, true);
  dataView.setUint16(20, 1, true);
  dataView.setUint16(22, numChannels, true);
  dataView.setUint32(24, sampleRate, true);
  dataView.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  dataView.setUint16(32, numChannels * (bitDepth / 8), true);
  dataView.setUint16(34, bitDepth, true);
  writeString(dataView, 36, "data");
  dataView.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < result.length; i += 1, offset += 2) {
    const sample = Math.max(-1, Math.min(1, result[i]));
    dataView.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return new Blob([dataView], { type: "audio/wav" });
};

type RecorderOptions = {
  patientId: string;
  language?: VoiceLanguage;
  /** Stops and transcribes automatically once a recording reaches this length. */
  maxSeconds?: number;
  onSuccess?: (data: TranscribeResponse) => void;
  onError?: (err: unknown) => void;
};

export function useAudioRecorder({
  patientId,
  language = "en",
  maxSeconds,
  onSuccess,
  onError,
}: RecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRecordingRef = useRef(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const cleanupAudioNodes = useCallback(async () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    try {
      sourceRef.current?.disconnect();
    } catch {
      // no-op
    }

    try {
      analyserRef.current?.disconnect();
    } catch {
      // no-op
    }

    sourceRef.current = null;
    analyserRef.current = null;
    setAudioLevel(0);

    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  const stopTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const pickMimeType = (): string => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];

    for (const mimeType of candidates) {
      if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
    }
    return "";
  };

  const setupAudioLevelMeter = useCallback(async (stream: MediaStream) => {
    const BrowserAudioContext =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!BrowserAudioContext) return;

    const audioContext = new BrowserAudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.85;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    sourceRef.current = source;

    const buffer = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      const currentAnalyser = analyserRef.current;
      if (!currentAnalyser || !isRecordingRef.current) {
        setAudioLevel(0);
        return;
      }

      currentAnalyser.getByteTimeDomainData(buffer);
      let sumSquares = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const normalized = (buffer[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }

      const rms = Math.sqrt(sumSquares / buffer.length);
      const level = Math.min(1, Math.max(0, rms * 4));
      setAudioLevel(level);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const sendToBackend = useCallback(
    async (wavBlob: Blob) => {
      setIsProcessing(true);
      try {
        // returns a draft only — the note is not saved until the nurse approves it
        const data = await transcribeNote({ audio: wavBlob, patientId, language });
        onSuccess?.(data);
      } catch (err) {
        onError?.(err);
      } finally {
        setIsProcessing(false);
      }
    },
    [language, onError, onSuccess, patientId],
  );

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current) return;

    // browsers hide the mic API entirely outside localhost and HTTPS
    if (!navigator.mediaDevices?.getUserMedia) {
      onError?.(
        new Error("This connection can't use the microphone. You can type the note instead."),
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      await setupAudioLevelMeter(stream);

      const mimeType = pickMimeType();
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, options);

      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const finalMime = recorder.mimeType || "audio/webm";
        const rawAudioBlob = new Blob(audioChunksRef.current, { type: finalMime });

        if (rawAudioBlob.size > 0) {
          try {
            const arrayBuffer = await rawAudioBlob.arrayBuffer();
            const browserAudioContext =
              window.AudioContext ||
              (window as Window & { webkitAudioContext?: typeof AudioContext })
                .webkitAudioContext;

            if (!browserAudioContext) {
              throw new Error("AudioContext is not supported in this browser.");
            }

            const decodeCtx = new browserAudioContext();
            const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
            const wavBlob = encodeWAV(audioBuffer);
            await decodeCtx.close();

            await sendToBackend(wavBlob);
          } catch (err) {
            onError?.(err);
          }
        }

        cleanupStream();
        await cleanupAudioNodes();
      };

      recorder.start(250);
      isRecordingRef.current = true;
      setIsRecording(true);
      setRecordingDuration(0);

      durationTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      // don't leave the mic light on if the recorder failed to start
      cleanupStream();
      void cleanupAudioNodes();
      onError?.(err);
    }
  }, [
    cleanupAudioNodes,
    cleanupStream,
    onError,
    sendToBackend,
    setupAudioLevelMeter,
  ]);

  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current) return;

    isRecordingRef.current = false;
    setIsRecording(false);
    stopTimer();

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }

    cleanupStream();
    void cleanupAudioNodes();
  }, [cleanupAudioNodes, cleanupStream, stopTimer]);

  const toggleRecording = useCallback(() => {
    if (isRecordingRef.current) {
      stopRecording();
    } else {
      void startRecording();
    }
  }, [startRecording, stopRecording]);

  useEffect(() => {
    if (isRecording && maxSeconds && recordingDuration >= maxSeconds) {
      stopRecording();
    }
  }, [isRecording, maxSeconds, recordingDuration, stopRecording]);

  useEffect(() => {
    return () => {
      // leaving the screen discards the recording: audio she walked away from
      // must not be uploaded to a transcription provider
      isRecordingRef.current = false;
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        if (recorder.state !== "inactive") recorder.stop();
      }
      stopTimer();
      cleanupStream();
      void cleanupAudioNodes();
    };
  }, [cleanupAudioNodes, cleanupStream, stopTimer]);

  return {
    isRecording,
    isProcessing,
    recordingDuration,
    audioLevel,
    toggleRecording,
  };
}
