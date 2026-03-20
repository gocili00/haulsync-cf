import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
    setDismissed(true);
  };

  if (!deferredPrompt || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm" data-testid="install-prompt">
      <div className="flex items-center gap-3 rounded-md border bg-card p-3 shadow-lg">
        <Download className="w-5 h-5 text-primary shrink-0" />
        <p className="text-sm flex-1">Install HaulSync for quick access</p>
        <Button size="sm" onClick={handleInstall} data-testid="button-install-app">
          Install
        </Button>
        <Button size="icon" variant="ghost" onClick={() => setDismissed(true)} data-testid="button-dismiss-install">
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
