import React from 'react';

export function APIKeyStatus({ providers = {} }) {
  const providerList = [
    { key: 'groq', name: 'Groq', color: '#ff6b6b' },
    { key: 'gemini', name: 'Gemini', color: '#4dabf7' },
    { key: 'anthropic', name: 'Anthropic', color: '#51cf66' }
  ];

  return (
    <div className="api-key-status">
      {providerList.map(provider => {
        const status = providers[provider.key];
        const isActive = status === 'active' || status === 'ready';

        return (
          <div key={provider.key} className="provider-pill">
            <span className={`pill-indicator ${isActive ? 'active' : 'inactive'}`}
                  style={{ backgroundColor: isActive ? provider.color : '#6c757d' }} />
            <span className="pill-name">{provider.name}</span>
          </div>
        );
      })}
    </div>
  );
}
