import { useState, useEffect } from 'react';
import { X, Check, Sparkles } from 'lucide-react';
import { getAvailableModels, updateModel } from '../services/api';

export default function ModelSelector({ isOpen, onClose, currentModel }) {
  const [models, setModels] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadModels();
    }
  }, [isOpen]);

  const loadModels = async () => {
    try {
      setLoading(true);
      const data = await getAvailableModels();
      setModels(data.models || []);

      // Set current selection
      if (currentModel) {
        setSelectedProvider(currentModel.provider || '');
        setSelectedModel(currentModel.model || '');
      }
    } catch (error) {
      console.error('Failed to load models:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedProvider || !selectedModel) return;

    try {
      setUpdating(true);
      await updateModel(selectedProvider, selectedModel);
      onClose({ provider: selectedProvider, model: selectedModel });
    } catch (error) {
      console.error('Failed to update model:', error);
      alert('Failed to update model preference');
    } finally {
      setUpdating(false);
    }
  };

  if (!isOpen) return null;

  // Group models by provider
  const modelsByProvider = models.reduce((acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-accent" />
            <div>
              <h2 className="text-xl font-semibold text-text-primary">Select AI Model</h2>
              <p className="text-sm text-text-secondary">Choose the model for agent tasks</p>
            </div>
          </div>
          <button
            onClick={() => onClose(null)}
            className="p-2 hover:bg-background rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12 text-text-secondary">Loading models...</div>
          ) : Object.keys(modelsByProvider).length === 0 ? (
            <div className="text-center py-12 text-text-secondary">No models available</div>
          ) : (
            <div className="space-y-6">
              {Object.entries(modelsByProvider).map(([provider, providerModels]) => (
                <div key={provider}>
                  <h3 className="text-lg font-semibold text-text-primary mb-3 capitalize">
                    {provider}
                  </h3>
                  <div className="space-y-2">
                    {providerModels.map((model) => {
                      const isSelected = selectedProvider === provider && selectedModel === model.name;
                      return (
                        <button
                          key={model.name}
                          onClick={() => {
                            setSelectedProvider(provider);
                            setSelectedModel(model.name);
                          }}
                          className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                            isSelected
                              ? 'border-accent bg-accent/5'
                              : 'border-border hover:border-accent/50'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-text-primary font-medium">{model.name}</span>
                                {model.recommended && (
                                  <span className="px-2 py-0.5 bg-accent/20 text-accent text-xs rounded-full">
                                    Recommended
                                  </span>
                                )}
                              </div>
                              {model.description && (
                                <p className="text-sm text-text-secondary mb-2">
                                  {model.description}
                                </p>
                              )}
                              <div className="flex items-center gap-3 text-xs text-text-secondary">
                                {model.contextWindow && (
                                  <span>Context: {model.contextWindow.toLocaleString()} tokens</span>
                                )}
                                {model.pricing && (
                                  <span>
                                    ${model.pricing.input}/1K in • ${model.pricing.output}/1K out
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className={`flex-shrink-0 ml-4 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                              isSelected ? 'border-accent bg-accent' : 'border-border'
                            }`}>
                              {isSelected && <Check className="w-4 h-4 text-white" />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex items-center justify-between">
          <div className="text-sm text-text-secondary">
            {selectedModel && (
              <span>
                Selected: <span className="text-text-primary font-medium">{selectedModel}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onClose(null)}
              className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!selectedModel || updating}
              className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updating ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
