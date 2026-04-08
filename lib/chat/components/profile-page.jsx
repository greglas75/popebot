'use client';

import { useState, useEffect } from 'react';
import { PageLayout } from './page-layout.js';
import { KeyIcon } from './icons.js';
import { updateProfile } from '../../auth/actions.js';

const TABS = [
  { id: 'login', label: 'Login', href: '/profile/login', icon: KeyIcon },
];

export function ProfileLayout({ session, children }) {
  const [activePath, setActivePath] = useState('');

  useEffect(() => {
    setActivePath(window.location.pathname);
  }, []);

  return (
    <PageLayout session={session}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Profile</h1>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
        {TABS.map((tab) => {
          const isActive = activePath === tab.href || activePath.startsWith(tab.href + '/');
          const Icon = tab.icon;
          return (
            <a
              key={tab.id}
              href={tab.href}
              className={`inline-flex items-center gap-2 px-3 py-2 min-h-[44px] shrink-0 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </a>
          );
        })}
      </div>

      {/* Tab content */}
      {children}
    </PageLayout>
  );
}

export function ProfileLoginPage({ session }) {
  const [email, setEmail] = useState(session?.user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);

    if (!currentPassword) {
      setMessage({ type: 'error', text: 'Current password is required.' });
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setSaving(true);
    try {
      const result = await updateProfile({
        email: email !== session?.user?.email ? email : undefined,
        currentPassword,
        newPassword: newPassword || undefined,
      });

      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Profile updated. Changes take effect on next sign-in.' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to update profile.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-6">
      {message && (
        <div className={`rounded-lg border p-3 text-sm ${
          message.type === 'error'
            ? 'border-destructive/30 bg-destructive/5 text-destructive'
            : 'border-green-500/30 bg-green-500/5 text-green-500'
        }`}>
          {message.text}
        </div>
      )}

      {/* Email */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
        />
      </div>

      {/* Current Password */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Current password</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Required to save changes"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
        />
      </div>

      {/* New Password */}
      <div className="space-y-2">
        <label className="text-sm font-medium">New password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Leave blank to keep current"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
        />
      </div>

      {/* Confirm New Password */}
      {newPassword && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Confirm new password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md px-4 py-2 text-sm font-medium bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save changes'}
      </button>
    </form>
  );
}
