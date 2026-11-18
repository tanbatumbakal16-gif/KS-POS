"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";

type BarcodeScannerProps = {
  onCodeDetected: (code: string) => boolean;
};

function cameraErrorMessage(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access was blocked. Allow camera access in Safari Settings > Websites > Camera, then try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera was found on this device.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The camera is unavailable or being used by another app. Close other camera apps and try again.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "The requested camera is unavailable. Check that the rear camera is working, then restart the scanner.";
  }
  if (name === "AbortError") {
    return "Safari interrupted camera startup. Tap Restart scanner to try again.";
  }
  if (name === "InvalidStateError") {
    return "Safari could not read a camera frame. Keep this page open and restart the scanner.";
  }
  const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
  return `The camera could not start${detail}. Check camera permissions and try again.`;
}

export default function BarcodeScanner({ onCodeDetected }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const sessionRef = useRef(0);
  const isScanningRef = useRef(false);
  const trackListenersRef = useRef<Array<() => void>>([]);
  const interruptionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  const startingRef = useRef(false);
  const scanHandledRef = useRef(false);
  const decoderErrorCountRef = useRef(0);
  const decoderDiagnosticShownRef = useRef(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [scanMessage, setScanMessage] = useState("");

  const stopCamera = useCallback(() => {
    sessionRef.current += 1;
    isScanningRef.current = false;
    if (interruptionTimerRef.current) {
      clearTimeout(interruptionTimerRef.current);
      interruptionTimerRef.current = null;
    }
    trackListenersRef.current.forEach((removeListener) => removeListener());
    trackListenersRef.current = [];
    controlsRef.current?.stop();
    controlsRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  async function startCamera() {
    if (startingRef.current || isScanningRef.current) return;

    stopCamera();
    const session = ++sessionRef.current;

    setCameraError("");
    setScanMessage("");
    setIsStarting(true);
    startingRef.current = true;
    scanHandledRef.current = false;
    decoderErrorCountRef.current = 0;
    decoderDiagnosticShownRef.current = false;

    try {
      if (!window.isSecureContext) {
        throw new Error("secure-context");
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("camera-unsupported");
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch (error) {
        if (error instanceof Error && error.name === "OverconstrainedError") {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: "environment" },
          });
        } else {
          throw error;
        }
      }

      if (!mountedRef.current || sessionRef.current !== session) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("camera-preview-unavailable");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;

      const handleTrackEnded = () => {
        if (sessionRef.current !== session) return;
        scanHandledRef.current = true;
        stopCamera();
        setIsScanning(false);
        const trackStates = stream.getVideoTracks().map((track) => `${track.label || "video"}: ${track.readyState}, muted=${track.muted}`).join("; ");
        setCameraError(`Camera track ended unexpectedly (${trackStates}). Tap Restart scanner to reconnect it.`);
      };
      const handleTrackMuted = () => {
        if (sessionRef.current !== session || interruptionTimerRef.current) return;
        interruptionTimerRef.current = setTimeout(() => {
          interruptionTimerRef.current = null;
          if (sessionRef.current !== session) return;
          setCameraError("Safari muted the camera track for over three seconds. The scanner is still active; return to this page or tap Stop if you want to close it.");
        }, 3000);
      };
      const handleTrackUnmuted = () => {
        if (interruptionTimerRef.current) {
          clearTimeout(interruptionTimerRef.current);
          interruptionTimerRef.current = null;
        }
      };
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener("ended", handleTrackEnded);
        track.addEventListener("mute", handleTrackMuted);
        track.addEventListener("unmute", handleTrackUnmuted);
        trackListenersRef.current.push(() => {
          track.removeEventListener("ended", handleTrackEnded);
          track.removeEventListener("mute", handleTrackMuted);
          track.removeEventListener("unmute", handleTrackUnmuted);
        });
      });

      await video.play();
      // On iOS Safari play() may resolve before its first camera frame is drawable.
      // ZXing otherwise treats the initial drawImage InvalidStateError as fatal.
      await new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 5000;
        const checkFrame = () => {
          if (!mountedRef.current || sessionRef.current !== session) {
            reject(new Error("Camera startup was cancelled."));
            return;
          }
          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
            resolve();
            return;
          }
          if (Date.now() >= deadline) {
            reject(new Error("Safari did not provide a camera frame within five seconds."));
            return;
          }
          window.setTimeout(checkFrame, 100);
        };
        checkFrame();
      });

      const { BarcodeFormat, BrowserMultiFormatReader } = await import(
        "@zxing/browser"
      );
      const reader = new BrowserMultiFormatReader();
      reader.possibleFormats = [
        BarcodeFormat.EAN_8,
        BarcodeFormat.EAN_13,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.QR_CODE,
      ];

      const controls = await reader.decodeFromVideoElement(
        video,
        (result, error) => {
          if (sessionRef.current !== session) return;
          if (!result) {
            if (error && !["NotFoundException", "ChecksumException", "FormatException"].includes(error.name)) {
              decoderErrorCountRef.current += 1;
              if (decoderErrorCountRef.current >= 3 && !decoderDiagnosticShownRef.current) {
                decoderDiagnosticShownRef.current = true;
                setCameraError(`Camera is still running, but ZXing reported repeated frame errors (${error.name}: ${error.message}). Keep the camera open or restart if scanning does not recover.`);
              }
            } else {
              decoderErrorCountRef.current = 0;
            }
            // ZXing reports errors for individual frames as well as fatal setup
            // errors. A bad/temporarily unavailable frame must not end the stream.
            if (scanHandledRef.current) {
              scanHandledRef.current = false;
            }
            return;
          }

          if (scanHandledRef.current) return;

          decoderErrorCountRef.current = 0;
          scanHandledRef.current = true;
          const code = result.getText().trim();
          const matched = onCodeDetected(code);
          setScanMessage(
            matched
              ? `Scanned ${code}. Product added to the cart.`
              : `No product matches ${code}. Check the barcode or SKU and try again.`
          );
        }
      );

      if (!mountedRef.current || sessionRef.current !== session) {
        controls.stop();
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      if (scanHandledRef.current) {
        controls.stop();
        return;
      }

      controlsRef.current = controls;
      isScanningRef.current = true;
      setIsScanning(true);
    } catch (error) {
      if (sessionRef.current !== session) return;
      stopCamera();
      if (mountedRef.current) {
        if (error instanceof Error && error.message === "secure-context") {
          setCameraError("Camera scanning requires a secure HTTPS connection (or localhost).");
        } else if (error instanceof Error && error.message === "camera-unsupported") {
          setCameraError("This browser does not support camera access. Use a USB or Bluetooth barcode scanner instead.");
        } else {
          setCameraError(`${cameraErrorMessage(error)}${error instanceof Error ? ` [${error.name}: ${error.message}]` : ` [${String(error)}]`}`);
        }
        setIsScanning(false);
      }
    } finally {
      startingRef.current = false;
      if (mountedRef.current) setIsStarting(false);
    }
  }

  function stopScanning() {
    stopCamera();
    scanHandledRef.current = false;
    decoderErrorCountRef.current = 0;
    decoderDiagnosticShownRef.current = false;
    setIsScanning(false);
    setScanMessage("Camera stopped.");
  }

  return (
    <div className="mt-5 grid min-w-0 gap-4 sm:mt-6 sm:gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)]">
      <div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-950 sm:aspect-video">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            muted
            playsInline
            aria-label="Live barcode scanner camera preview"
          />
          {isScanning && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-28 w-[82%] rounded-xl border-2 border-emerald-300 shadow-[0_0_0_999px_rgba(2,6,23,0.38)] sm:h-36" />
            </div>
          )}
          {!isScanning && !isStarting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white">
              <ScanLine aria-hidden="true" size={32} className="text-emerald-300" />
              <p className="mt-3 text-sm font-medium">Camera preview appears here</p>
            </div>
          )}
          {isStarting && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 px-6 text-center text-sm font-medium text-white">
              Starting camera… Please allow camera access when prompted.
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {!isScanning ? (
            <button
              type="button"
              onClick={startCamera}
              disabled={isStarting}
              className="min-h-12 flex-1 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60 sm:flex-none"
            >
              {isStarting ? "Starting camera…" : cameraError ? "Restart scanner" : "Start camera scanner"}
            </button>
          ) : (
            <button
              type="button"
              onClick={stopScanning}
              className="min-h-12 flex-1 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 sm:flex-none"
            >
              Stop camera
            </button>
          )}
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Camera scanning works on HTTPS or localhost. Point the rear camera at an EAN, UPC, Code 128 barcode, or product QR code.
        </p>
        {cameraError && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {cameraError}
          </p>
        )}
        {scanMessage && (
          <p role="status" aria-live="polite" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
            {scanMessage}
          </p>
        )}
      </div>

      <aside className="rounded-2xl bg-slate-50 p-4 sm:p-5">
        <h4 className="font-semibold text-slate-900">Hardware barcode scanner</h4>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          USB and Bluetooth scanners that act like a keyboard work here. Tap the field, scan a label, and let the scanner send Enter.
        </p>
        <ul className="mt-4 space-y-2 text-xs leading-5 text-slate-500">
          <li>• Keep the scanner input focused while scanning.</li>
          <li>• Product barcodes and SKUs are both matched.</li>
          <li>• QR codes are treated as product codes; payment QR codes are not processed.</li>
        </ul>
      </aside>
    </div>
  );
}
