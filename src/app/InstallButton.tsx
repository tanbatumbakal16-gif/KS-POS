
"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallButton() {
  const [installEvent, setInstallEvent] =
    useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");

    const updateInstalled = () => {
      setInstalled(media.matches || Boolean(
        (navigator as Navigator & { standalone?: boolean }).standalone
      ));
    };

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };

    updateInstalled();
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", updateInstalled);
    media.addEventListener("change", updateInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", updateInstalled);
      media.removeEventListener("change", updateInstalled);
    };
  }, []);

  async function installApp() {
    if (!installEvent) return;

    await installEvent.prompt();
    const choice = await installEvent.userChoice;

    if (choice.outcome === "accepted") {
      setInstalled(true);
    }

    setInstallEvent(null);
  }

  if (installed) {
    return <span className="text-sm">KS POS is installed</span>;
  }

  if (!installEvent) {
    return (
      <span className="block max-w-64 text-xs leading-5 text-slate-500">
        Install KS POS from your browser menu or add it to your home screen.
      </span>
    );
  }

  return (
    <button
      onClick={installApp}
      className="min-h-11 rounded-xl bg-[#14251f] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
    >
      Install KS POS
    </button>
  );
}
