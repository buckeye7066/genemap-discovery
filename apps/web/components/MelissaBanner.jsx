import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Heart, X, Crown } from "lucide-react";

export default function MelissaBanner() {
  const [show, setShow] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const currentUser = await apiClient.getMe();
      setUser(currentUser);

      // Check if user is Melissa and hasn't dismissed the banner
      if (currentUser?.email === "justus_melissa@yahoo.com") {
        const dismissed = localStorage.getItem("melissa_upgrade_banner_dismissed");
        if (!dismissed) {
          setShow(true);
        }
      }
    } catch (err) {
      // User not logged in or error
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("melissa_upgrade_banner_dismissed", "true");
    setShow(false);
  };

  if (!show || !user) {
    return null;
  }

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-2xl px-4 animate-in slide-in-from-top duration-300">
      <Alert className="bg-gradient-to-r from-pink-50 to-purple-50 border-2 border-pink-300 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center">
              <Heart className="w-5 h-5 text-white fill-white" />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Crown className="w-5 h-5 text-purple-600" />
              <h3 className="font-bold text-lg text-slate-900">Premium Upgrade!</h3>
            </div>
            <AlertDescription className="text-slate-700">
              You've been upgraded to <span className="font-semibold text-purple-700">Premium</span> by your favorite cousin! 
              He loves you and wants you to have full access to all GeneMap features. Enjoy! 💜
            </AlertDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDismiss}
            className="flex-shrink-0 hover:bg-pink-100"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </Alert>
    </div>
  );
}