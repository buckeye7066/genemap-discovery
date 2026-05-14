// Rendered when the auth provider reports the current cookie session
// belongs to a user that is not (or no longer) in the database. Previous
// builds were broken because this file was missing despite being imported
// from App.jsx; we ship a minimal honest UI here rather than silently
// stripping the import (which would degrade the auth UX).
import { useAuth } from '@/lib/AuthContext';

export default function UserNotRegisteredError() {
  const { navigateToLogin } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg p-8 text-center space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">
          Account not recognised
        </h1>
        <p className="text-slate-600">
          Your session is no longer valid. Please sign in again to continue.
        </p>
        <button
          type="button"
          onClick={() => (navigateToLogin ? navigateToLogin() : (window.location.href = '/'))}
          className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          Sign in
        </button>
      </div>
    </div>
  );
}
