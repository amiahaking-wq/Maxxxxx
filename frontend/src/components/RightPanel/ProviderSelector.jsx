import React from 'react';

export function ProviderSelector({ selected, onChange, providers }) {
  const modes = [
    { value: 'auto', label: 'Auto Routing', icon: '🤖' },
    { value: 'gemini-pro', label: 'Force Gemini Pro', icon: '💎' },
    { value: 'groq', label: 'Force Groq', icon: '⚡' }
  ];

  return (
    <div className="provider-selector">
      {modes.map(mode => (
        <button
          key={mode.value}
          className={`provider-mode ${selected === mode.value ? 'active' : ''}`}
          onClick={() => onChange(mode.value)}
        >
          <span className="mode-icon">{mode.icon}</span>
          <span className="mode-label">{mode.label}</span>
        </button>
      ))}
    </div>
  );
}
