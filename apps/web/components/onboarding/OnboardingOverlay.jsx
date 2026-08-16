import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { onboardingSteps, onboardingStorageKey } from '../../content/onboardingSteps.js';

const focusClass = 'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-600';

function saveDismissal(method) {
  if (typeof window === 'undefined') return;

  const preference = {
    storageKey: onboardingStorageKey,
    hasSeenOnboarding: true,
    dismissedAt: new Date().toISOString(),
    dismissalMethod: method,
  };

  try {
    window.localStorage.setItem(onboardingStorageKey, JSON.stringify(preference));
  } catch {
    // The overlay still closes if local storage is unavailable.
  }
}

function getFocusableElements(container) {
  if (!container) return [];

  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
}

export default function OnboardingOverlay({ isOpen, onDismiss }) {
  const navigate = useNavigate();
  const dialogRef = useRef(null);
  const startButtonRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    window.setTimeout(() => {
      startButtonRef.current?.focus();
    }, 0);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleDismiss('escape_key');
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements(dialogRef.current);
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  function handleDismiss(method) {
    saveDismissal(method);
    onDismiss?.(method);
  }

  function handleStartHere() {
    handleDismiss('start_here');
    navigate('/upload');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-3 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleDismiss('backdrop_click');
      }}
      onTouchEnd={(event) => {
        if (event.target === event.currentTarget) handleDismiss('backdrop_click');
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-description"
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white p-5 text-slate-950 shadow-2xl sm:p-7"
        onMouseDown={(event) => event.stopPropagation()}
        onTouchEnd={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <p className="inline-flex rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-900">
              First visit guide
            </p>
            <h2 id="onboarding-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
              See how upload and review will work before you choose a file
            </h2>
            <p id="onboarding-description" className="max-w-3xl text-base leading-7 text-slate-700">
              This short overview explains the planned 8-step sequence in plain language. It is for learning and preparation only, not medical advice.
            </p>
          </div>
          <button
            type="button"
            className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border-2 border-slate-300 bg-white px-3 py-2 font-semibold text-slate-950 hover:bg-slate-100 ${focusClass}`}
            aria-label="Close the first visit guide"
            onClick={() => handleDismiss('close_button')}
          >
            Close
          </button>
        </div>

        <ol className="mt-6 grid gap-4 md:grid-cols-2" aria-label="Eight upload preparation steps">
          {onboardingSteps.map((step) => (
            <li key={step.stepNumber} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-700 text-sm font-bold text-white">
                  {step.stepNumber}
                </span>
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-slate-950">{step.title}</h3>
                  <p className="text-sm leading-6 text-slate-800">{step.plainLanguageDescription}</p>
                  <p className="text-sm leading-6 text-slate-700"><strong>Why it helps:</strong> {step.userBenefit}</p>
                  <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950"><strong>Safety note:</strong> {step.safetyNote}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-slate-700">
            You can close this guide now. Your choice is saved in this browser, so it will not keep popping up.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              ref={startButtonRef}
              type="button"
              className={`inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-6 py-3 text-base font-semibold text-white hover:bg-blue-800 ${focusClass}`}
              onClick={handleStartHere}
            >
              Start here
            </button>
            <button
              type="button"
              className={`inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-950 hover:bg-slate-100 ${focusClass}`}
              onClick={() => handleDismiss('skip')}
            >
              Skip for now
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
