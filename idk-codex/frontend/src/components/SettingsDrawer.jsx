/**
 * SettingsDrawer — full settings panel.
 *
 * Sections:
 *  - Mode: Simple / Developer toggle
 *  - Model: pick from QUICK_MODELS
 *  - Connectors: GitHub, Supabase, Gmail, Calendar, Drive
 *    Each shows connection status + required env vars + test button
 *  - About: version + links
 */

import { useState, useEffect } from 'react';
import {
  X, Settings, Code2, MessageSquare, RefreshCw, CheckCircle2, XCircle,
  Github, Database, Mail, Calendar, Folder, ExternalLink, Zap
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

const CONNECTOR_ICONS = {
  github: Github,
  supabase: Database,
  gmail: Mail,
  calendar: Calendar,
  drive: Folder
};

const CONNECTOR_COLORS = {
  github: '#fff',
  supabase: '#3ecf8e',
  gmail: '#ea4335',
  calendar: '#4285f4',
  drive: '#ffba00'
};

export default function SettingsDrawer({
  open, onClose,
  devMode, setDevMode,
  currentModel, setCurrentModel, models
}) {
  const [connectors, setConnectors] = useState([]);
  const [loadingConnectors, setLoadingConnectors] = useState(false);
  const [testingConnector, setTestingConnector] = useState(null);

  useEffect(() => {
    if (open) loadConnectors();
  }, [open]);

  async function loadConnectors() {
    setLoadingConnectors(true);
    try {
      const r = await fetch(`${API_BASE}/api/connectors/details`);
      if (r.ok) {
        const data = await r.json();
        if (data.success) setConnectors(data.connectors || []);
      }
    } catch (e) { /* ignore */ } finally {
      setLoadingConnectors(false);
    }
  }

  async function testConnector(name) {
    setTestingConnector(name);
    try {
      const r = await fetch(`${API_BASE}/api/connectors/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await r.json();
      alert(data.message || (data.connected ? 'Connected' : 'Not connected'));
      loadConnectors();
    } catch (e) {
      alert('Test failed: ' + e.message);
    } finally {
      setTestingConnector(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-gray-950 border-l border-gray-800 w-full max-w-md h-full flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Settings size={20} className="text-blue-400" />
            <h2 className="font-semibold text-gray-100">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg text-gray-400"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Mode */}
          <Section title="Mode">
            <div className="flex gap-2">
              <button
                onClick={() => setDevMode(false)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  !devMode ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'
                }`}
              >
                <MessageSquare size={16} />
                Simple
              </button>
              <button
                onClick={() => setDevMode(true)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  devMode ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'
                }`}
              >
                <Code2 size={16} />
                Developer
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {devMode
                ? 'Developer mode exposes the file tree, terminal, and runtime dashboard at /dev.'
                : 'Simple mode is a clean chat interface focused on conversation and artifacts.'}
            </p>
          </Section>

          {/* Model */}
          <Section title="Model">
            <div className="space-y-1">
              {models.map(m => (
                <button
                  key={m.id}
                  onClick={() => setCurrentModel(m.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    currentModel === m.id
                      ? 'bg-blue-600/20 border border-blue-600 text-white'
                      : 'bg-gray-900 border border-transparent text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  <span className="font-medium">{m.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    m.badge === 'free' ? 'bg-green-900 text-green-300'
                    : m.badge === 'paid' ? 'bg-yellow-900 text-yellow-300'
                    : 'bg-purple-900 text-purple-300'
                  }`}>
                    {m.badge}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Switching models preserves chat history. Free models may have rate limits.
            </p>
          </Section>

          {/* Connectors */}
          <Section
            title="Connectors"
            action={
              <button
                onClick={loadConnectors}
                className="p-1.5 hover:bg-gray-800 rounded text-gray-400"
                title="Refresh"
              >
                <RefreshCw size={14} className={loadingConnectors ? 'animate-spin' : ''} />
              </button>
            }
          >
            <p className="text-xs text-gray-500 mb-3">
              Connect MAX to your apps. The agent can use connected services to complete tasks — but always asks before destructive actions.
            </p>

            {loadingConnectors && connectors.length === 0 ? (
              <div className="text-center py-6 text-gray-500 text-sm">Loading connectors...</div>
            ) : (
              <div className="space-y-2">
                {connectors.map(conn => {
                  const Icon = CONNECTOR_ICONS[conn.name] || Zap;
                  const color = CONNECTOR_COLORS[conn.name] || '#888';
                  const info = conn.info || {};
                  const requiredEnv = info.requiredEnv || [];
                  const envStatus = conn.envStatus || {};
                  const allEnvSet = requiredEnv.every(k => envStatus[k]);

                  return (
                    <div
                      key={conn.name}
                      className="bg-gray-900 border border-gray-800 rounded-lg p-3"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: color + '20', color }}
                        >
                          <Icon size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-gray-100">{info.name || conn.name}</span>
                            {conn.connected ? (
                              <span className="flex items-center gap-1 text-xs text-green-400">
                                <CheckCircle2 size={12} /> Connected
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-gray-500">
                                <XCircle size={12} /> Not connected
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{info.description}</p>
                        </div>
                        <button
                          onClick={() => testConnector(conn.name)}
                          disabled={testingConnector === conn.name}
                          className="flex-shrink-0 px-2.5 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded text-gray-300 disabled:opacity-50"
                        >
                          {testingConnector === conn.name ? 'Testing...' : 'Test'}
                        </button>
                      </div>

                      {/* Required env vars */}
                      {!allEnvSet && requiredEnv.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-800">
                          <div className="text-xs text-gray-500 mb-1.5">Required env vars (set in Railway):</div>
                          <div className="space-y-1">
                            {requiredEnv.map(envVar => (
                              <div key={envVar} className="flex items-center justify-between text-xs">
                                <code className={`font-mono ${envStatus[envVar] ? 'text-green-400' : 'text-gray-400'}`}>
                                  {envVar}
                                </code>
                                {envStatus[envVar] ? (
                                  <CheckCircle2 size={12} className="text-green-400" />
                                ) : (
                                  <XCircle size={12} className="text-gray-600" />
                                )}
                              </div>
                            ))}
                          </div>
                          {info.docs && (
                            <a
                              href={info.docs}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 mt-2 text-xs text-blue-400 hover:text-blue-300"
                            >
                              <ExternalLink size={10} />
                              How to get these
                            </a>
                          )}
                        </div>
                      )}

                      {/* Available tools */}
                      {conn.connected && conn.tools && conn.tools.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {conn.tools.map(t => (
                            <span key={t} className="text-xs px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded font-mono">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* About */}
          <Section title="About">
            <div className="text-xs text-gray-500 space-y-1">
              <div>MAX AI Agent v2.0</div>
              <div>Production deployment on Railway</div>
              <a
                href="https://github.com/amiahaking-wq/Maxxxxx"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
              >
                <ExternalLink size={10} />
                View source on GitHub
              </a>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, action, children }) {
  return (
    <div className="px-4 py-4 border-b border-gray-900">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}
