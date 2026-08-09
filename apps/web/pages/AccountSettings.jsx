import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@genemap/shared';
import { useAuth } from '@/lib/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertCircle,
  CheckCircle2,
  DatabaseZap,
  Loader2,
  ShieldAlert,
  Trash2,
} from 'lucide-react';

const DELETE_CONFIRMATION = 'DELETE MY ACCOUNT';

export default function AccountSettings() {
  const navigate = useNavigate();
  const { user, isLoadingAuth, clearSession } = useAuth();
  const [purgeState, setPurgeState] = useState({ loading: false, message: '', error: '' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const canDelete = useMemo(() => (
    Boolean(user?.email)
    && email.trim().toLowerCase() === user.email.trim().toLowerCase()
    && password.length > 0
    && confirmation === DELETE_CONFIRMATION
    && !isDeleting
  ), [confirmation, email, isDeleting, password, user?.email]);

  const requestLimitedPurge = async () => {
    setPurgeState({ loading: true, message: '', error: '' });
    try {
      const result = await apiClient.request('/entities/data-deletion-request', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const status = result?.request?.status;
      if (status !== 'completed') {
        throw new Error('The purge request was retained but did not complete. Support has been notified.');
      }
      setPurgeState({
        loading: false,
        message: 'Search history and other supported self-service content were purged.',
        error: '',
      });
    } catch (error) {
      setPurgeState({
        loading: false,
        message: '',
        error: error?.message || 'The content purge could not be completed.',
      });
    }
  };

  const deleteAccount = async (event) => {
    event.preventDefault();
    if (!canDelete) return;

    setIsDeleting(true);
    setDeleteError('');
    try {
      await apiClient.request('/account/delete', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          password,
          confirmation,
        }),
        timeoutMs: 60_000,
      });
      clearSession('Account deleted');
      navigate('/login?accountDeleted=1', { replace: true });
    } catch (error) {
      setDeleteError(error?.message || 'The account could not be deleted. No account data was removed.');
      setIsDeleting(false);
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" aria-label="Loading account settings" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen p-6 bg-slate-50">
        <Alert className="max-w-xl mx-auto mt-16">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Sign in to manage privacy and account settings.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Account & Privacy</h1>
          <p className="mt-2 text-slate-600">
            Control stored content or permanently close the signed-in account.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DatabaseZap className="h-5 w-5 text-blue-600" />
              Purge supported content
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed text-slate-600">
              This immediately removes search history and the legacy content categories covered by
              the self-service purge. It does not close your account, cancel billing, or represent
              deletion from processors and backups.
            </p>
            {purgeState.message && (
              <Alert className="border-emerald-200 bg-emerald-50">
                <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                <AlertDescription className="text-emerald-900">{purgeState.message}</AlertDescription>
              </Alert>
            )}
            {purgeState.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{purgeState.error}</AlertDescription>
              </Alert>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={requestLimitedPurge}
              disabled={purgeState.loading}
            >
              {purgeState.loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Purge supported content
            </Button>
          </CardContent>
        </Card>

        <Card className="border-red-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-800">
              <ShieldAlert className="h-5 w-5" />
              Permanently delete account
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert className="mb-5 border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-700" />
              <AlertDescription className="text-red-900">
                This action is irreversible. GeneMap first cancels verifiable individual Stripe
                subscriptions and removes the Stripe customer record, then deletes the account and
                user-owned database records. An active institutional license must be transferred or
                cancelled before its responsible account can be deleted.
              </AlertDescription>
            </Alert>

            {deleteError && (
              <Alert variant="destructive" className="mb-5" role="alert">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{deleteError}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={deleteAccount} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="delete-email">Account email</Label>
                <Input
                  id="delete-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={user.email}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="delete-password">Current password</Label>
                <Input
                  id="delete-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="delete-confirmation">
                  Type <span className="font-mono font-semibold">{DELETE_CONFIRMATION}</span>
                </Label>
                <Input
                  id="delete-confirmation"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                  required
                />
              </div>

              <Button
                type="submit"
                variant="destructive"
                disabled={!canDelete}
                className="w-full sm:w-auto"
              >
                {isDeleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Permanently delete my account
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
