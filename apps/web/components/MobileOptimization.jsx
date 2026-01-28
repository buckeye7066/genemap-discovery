import React, { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Download, X, Smartphone } from "lucide-react";

export default function MobileOptimization() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Detect platform
    const userAgent = window.navigator.userAgent.toLowerCase();
    const iOS = /iphone|ipad|ipod/.test(userAgent);
    const android = /android/.test(userAgent);
    
    setIsIOS(iOS);
    setIsAndroid(android);

    // Check if already installed
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                      window.navigator.standalone ||
                      document.referrer.includes('android-app://');
    
    setIsStandalone(standalone);

    // Don't show prompt if already installed
    if (standalone) {
      return;
    }

    // Handle Android/Desktop PWA install prompt
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      
      // Show prompt after 5 seconds on first visit
      setTimeout(() => {
        const hasSeenPrompt = localStorage.getItem('pwa-prompt-seen');
        if (!hasSeenPrompt) {
          setShowPrompt(true);
        }
      }, 5000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // For iOS, show instructions after 5 seconds
    if (iOS && !standalone) {
      setTimeout(() => {
        const hasSeenPrompt = localStorage.getItem('pwa-prompt-seen');
        if (!hasSeenPrompt) {
          setShowPrompt(true);
        }
      }, 5000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setShowPrompt(false);
      localStorage.setItem('pwa-prompt-seen', 'true');
    }
    
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-prompt-seen', 'true');
    
    // Show again after 7 days
    setTimeout(() => {
      localStorage.removeItem('pwa-prompt-seen');
    }, 7 * 24 * 60 * 60 * 1000);
  };

  if (!showPrompt || isStandalone) {
    return null;
  }

  return (
    <Alert className="mb-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 relative">
      <Smartphone className="h-4 w-4 text-blue-600" />
      <AlertDescription className="pr-8">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="font-semibold text-blue-900 mb-2">
              Install GeneMap App
            </p>
            
            {isIOS ? (
              <div className="text-sm text-blue-800 space-y-2">
                <p>Install this app on your iPhone/iPad:</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>Tap the Share button <span className="inline-block bg-blue-200 px-2 py-0.5 rounded">⎋</span></li>
                  <li>Scroll and tap "Add to Home Screen"</li>
                  <li>Tap "Add" to confirm</li>
                </ol>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-blue-800">
                  {isAndroid ? 'Install for faster access and offline use' : 'Install this app for the best experience'}
                </p>
                {deferredPrompt && (
                  <Button
                    size="sm"
                    onClick={handleInstallClick}
                    className="bg-blue-600 hover:bg-blue-700 mt-2 min-h-[40px]"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Install Now
                  </Button>
                )}
              </div>
            )}
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDismiss}
            className="absolute top-2 right-2 h-6 w-6"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}