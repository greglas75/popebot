'use client';

import { useState, useEffect } from 'react';
import { KeyIcon, CopyIcon, CheckIcon, TrashIcon, PlusIcon } from './icons.js';
import { SecretRow, EmptyState, formatDate, timeAgo } from './settings-shared.js';
import { createNewApiKey, getApiKeys, deleteApiKey, getApiKeySettings, updateApiKeySetting, regenerateWebhookSecret } from '../actions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Keys sub-tab — Multiple named API keys
// ─────────────────────────────────────────────────────────────────────────────

export function ApiKeysListPage() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError] = useState(null);

  const loadKeys = async () => {
    try {
      const result = await getApiKeys();
      setKeys(Array.isArray(result) ? result : result ? [result] : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleCreate = async () => {
    if (creating || !newKeyName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createNewApiKey(newKeyName.trim());
      if (result.error) {
        setError(result.error);
      } else {
        setNewKey(result.key);
        setNewKeyName('');
        setShowCreateForm(false);
        await loadKeys();
      }
    } catch {
      setError('Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
      return;
    }
    try {
      await deleteApiKey(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
      setConfirmDelete(null);
      if (newKey) setNewKey(null);
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-16 animate-pulse rounded-md bg-border/50" />
        <div className="h-16 animate-pulse rounded-md bg-border/50" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-base font-medium">API Keys</h2>
          <p className="text-sm text-muted-foreground">Authenticate external requests to /api endpoints via the x-api-key header.</p>
        </div>
        {!showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-foreground text-background hover:bg-foreground/90 shrink-0 transition-colors"
          >
            <PlusIcon size={14} />
            Create key
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive mb-4">{error}</p>
      )}

      {/* Create form */}
      {showCreateForm && (
        <div className="rounded-lg border border-dashed bg-card p-4 mb-4">
          <label className="text-xs font-medium mb-1.5 block">Key name</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. n8n, production, staging..."
              autoFocus
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <button
              onClick={handleCreate}
              disabled={!newKeyName.trim() || creating}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 transition-colors"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => { setShowCreateForm(false); setNewKeyName(''); }}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* New key banner */}
      {newKey && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 mb-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="text-sm font-medium text-green-500">
              API key created — copy it now. You won't be able to see it again.
            </p>
            <button
              onClick={() => setNewKey(null)}
              className="text-xs text-muted-foreground hover:text-foreground shrink-0 transition-colors"
            >
              Dismiss
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono break-all select-all">
              {newKey}
            </code>
            <CopyButton text={newKey} />
          </div>
        </div>
      )}

      {/* Key list */}
      {keys.length > 0 ? (
        <div className="rounded-lg border bg-card">
          <div className="divide-y divide-border">
            {keys.map((k) => (
              <div key={k.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-4">
                <div className="flex items-center gap-2">
                  <KeyIcon size={14} className="text-muted-foreground shrink-0" />
                  <div>
                  <div className="text-sm font-medium">{k.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {k.keyPrefix}...
                    <span className="font-sans ml-2">
                      Created {formatDate(k.createdAt)}
                      <span> · {k.lastUsedAt ? `Last used ${timeAgo(k.lastUsedAt)}` : 'Never used'}</span>
                    </span>
                  </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(k.id)}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium border shrink-0 self-start sm:self-auto transition-colors ${
                    confirmDelete === k.id
                      ? 'border-destructive text-destructive hover:bg-destructive/10'
                      : 'border-border text-muted-foreground hover:text-destructive hover:border-destructive/50'
                  }`}
                >
                  <TrashIcon size={12} />
                  {confirmDelete === k.id ? 'Confirm' : 'Delete'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : !showCreateForm && (
        <EmptyState
          message="No API keys configured"
          actionLabel="Create API key"
          onAction={() => setShowCreateForm(true)}
        />
      )}
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
    >
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Voice sub-tab — AssemblyAI API Key
// ─────────────────────────────────────────────────────────────────────────────

export function ApiKeysVoicePage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = async () => {
    try {
      const result = await getApiKeySettings();
      setSettings(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const getStatus = (key) => settings?.secrets?.find((s) => s.key === key)?.isSet || false;

  const handleSave = async (key, value) => {
    setSaving(true);
    await updateApiKeySetting(key, value);
    await loadSettings();
    setSaving(false);
  };

  if (loading) {
    return <div className="h-24 animate-pulse rounded-md bg-border/50" />;
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-medium">Voice</h2>
        <p className="text-sm text-muted-foreground">Required for voice input in chat.</p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <SecretRow
          label="AssemblyAI API Key"
          isSet={getStatus('ASSEMBLYAI_API_KEY')}
          saving={saving}
          onSave={(val) => handleSave('ASSEMBLYAI_API_KEY', val)}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Telegram sub-tab — Bot Token + Webhook Secret + Chat ID
// ─────────────────────────────────────────────────────────────────────────────

export function ApiKeysTelegramPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chatId, setChatId] = useState('');
  const [savingChatId, setSavingChatId] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadSettings = async () => {
    try {
      const result = await getApiKeySettings();
      setSettings(result);
      setChatId(result.telegramChatId || '');
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const getStatus = (key) => settings?.secrets?.find((s) => s.key === key)?.isSet || false;

  const handleSave = async (key, value) => {
    setSaving(true);
    await updateApiKeySetting(key, value);
    await loadSettings();
    setSaving(false);
  };

  const handleRegenerate = async (key) => {
    setSaving(true);
    await regenerateWebhookSecret(key);
    await loadSettings();
    setSaving(false);
  };

  const handleSaveChatId = async () => {
    setSavingChatId(true);
    await updateApiKeySetting('TELEGRAM_CHAT_ID', chatId);
    setSavingChatId(false);
  };

  if (loading) {
    return <div className="h-24 animate-pulse rounded-md bg-border/50" />;
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-medium">Telegram</h2>
        <p className="text-sm text-muted-foreground">Connect a Telegram bot to receive and send messages through your agent.</p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <div className="divide-y divide-border">
          <SecretRow
            label="Bot Token"
            isSet={getStatus('TELEGRAM_BOT_TOKEN')}
            saving={saving}
            onSave={(val) => handleSave('TELEGRAM_BOT_TOKEN', val)}
          />
          <SecretRow
            label="Webhook Secret"
            isSet={getStatus('TELEGRAM_WEBHOOK_SECRET')}
            saving={saving}
            onSave={(val) => handleSave('TELEGRAM_WEBHOOK_SECRET', val)}
            onRegenerate={() => handleRegenerate('TELEGRAM_WEBHOOK_SECRET')}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center pt-3 mt-3 border-t border-border">
          <label className="text-sm font-medium shrink-0">Chat ID</label>
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="123456789"
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
              onKeyDown={(e) => e.key === 'Enter' && handleSaveChatId()}
            />
            <button
              onClick={handleSaveChatId}
              disabled={savingChatId}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium border border-border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 transition-colors"
            >
              {savingChatId ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Backwards compat export
export function SettingsSecretsPage() {
  return <ApiKeysListPage />;
}

// ApiKeysGitHubPage removed — GitHub credentials now live on the GitHub > Tokens tab
