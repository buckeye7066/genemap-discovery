import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onboardingSteps, onboardingStorageKey } from "../../content/onboardingSteps.js";

const focusClass =
  "focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

function hasSavedDismissal() {
  try {
    return Boolean(window.localStorage.getItem(onboardingStorageKey));
  } catch {
    return true;
  }
}

function saveDismissal(method) {
  try {
    window.localStorage.setItem(
      onboardingStorageKey,
      JSON.stringify({
        storageKey: onboardingStorageKey,
        hasSeenOnboarding: true,
        dismissedAt: new Date().toISOString(),
        dismissalMethod: method,
      }),
    );
  } catch {
    // If storage is unavailable, still let the person continue without showing a technical error.
  }
}

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
}

export default function OnboardingOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef(null);
  const startButtonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!hasSavedDismissal()) {
      previousFocusRef.current = document.activeElement;
      setIsOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => startButtonRef.current?.focus(), 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = originalOverflow;
      const previousFocus = previousFocusRef.current;
      if (previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus();
      }
    };
  }, [isOpen]);

  const dismiss = useCallback((method) => {
    saveDismissal(method);
    setIsOpen(false);
  }, []);

  const handleStartHere = useCallback(() => {
    dismiss("start_here");
    navigate("/upload");
  }, [dismiss, navigate]);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss("escape_key");
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusableElements(dialogRef.current);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [dismiss],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-6" onKeyDown={handleKeyDown}>
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default"
        aria-label="Close onboarding overview"
        onClick={() => dismiss("backdrop_click")}
      />

      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-description"
        className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white p-5 text-slate-950 shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-950">
              First visit overview
            </p>
            <h2 id="onboarding-title" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              See how uploading would work before you choose any file.
            </h2>
            <p id="onboarding-description" className="mt-3 max-w-3xl text-base leading-7 text-slate-700">
              This short guide shows the planned 8-step upload sequence in plain language. You can start, skip, or close it now.
            </p>
          </div>
          <button
            type="button"
            onClick={() => dismiss("close_button")}
            className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-2xl font-bold text-slate-800 hover:bg-slate-100 ${focusClass}`}
            aria-label="Close onboarding overview"
          >
            ×
          </button>
        </div>

        <ol className="mt-6 grid gap-3 md:grid-cols-2" aria-label="Eight upload overview steps">
          {onboardingSteps.map((step) => (
            <li key={step.stepNumber} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-700 text-sm font-bold text-white" aria-label={`Step ${step.stepNumber}`}>
                  {step.stepNumber}
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-950">{step.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-700">{step.plainLanguageDescription}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-800">
                    <span className="font-semibold">Why this helps: </span>
                    {step.userBenefit}
                  </p>
                  <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                    <span className="font-semibold">Safety note: </span>
                    {step.safetyNote}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => dismiss("skip")}
            className={`inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-950 hover:bg-slate-100 ${focusClass}`}
          >
            Skip for now
          </button>
          <button
            ref={startButtonRef}
            type="button"
            onClick={handleStartHere}
            className={`inline-flex min-h-12 items-center justify-center rounded-2xl bg-blue-700 px-7 py-3 text-lg font-bold text-white hover:bg-blue-800 ${focusClass}`}
          >
            Start here
          </button>
        </div>
      </section>
    </div>
  );
}
