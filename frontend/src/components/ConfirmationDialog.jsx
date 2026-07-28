import { AlertTriangle, Check, X } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

export default function ConfirmationDialog({ confirmation, onResolved }) {
  if (!confirmation) return null;

  const handleRespond = async (approved) => {
    try {
      await fetch(`${API_BASE}/api/permissions/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmationId: confirmation.confirmationId, approved })
      });
    } catch (e) {}
    onResolved && onResolved();
  };

  const riskColor = confirmation.riskLevel === 'high' ? 'bg-red-900/50 text-red-300 border-red-700'
    : confirmation.riskLevel === 'medium' ? 'bg-yellow-900/50 text-yellow-300 border-yellow-700'
    : 'bg-blue-900/50 text-blue-300 border-blue-700';

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-950 border border-gray-800 rounded-xl w-full max-w-md overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
          <AlertTriangle size={20} className="text-yellow-500" />
          <h3 className="font-semibold text-gray-100">Confirmation Required</h3>
          <span className={`ml-auto text-xs px-2 py-0.5 rounded border ${riskColor}`}>{confirmation.riskLevel || 'medium'}</span>
        </div>
        <div className="px-4 py-4">
          <p className="text-sm text-gray-300 mb-3">MAX wants to perform this action:</p>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 mb-3">
            <div className="text-xs text-gray-500 mb-1">Tool: <span className="font-mono text-gray-300">{confirmation.tool}</span></div>
            <div className="text-sm text-gray-100 mt-2">{confirmation.description}</div>
          </div>
          <p className="text-xs text-gray-500">{confirmation.reason}</p>
        </div>
        <div className="px-4 py-3 border-t border-gray-800 flex gap-2">
          <button onClick={() => handleRespond(false)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium"><X size={16} /> Deny</button>
          <button onClick={() => handleRespond(true)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"><Check size={16} /> Allow</button>
        </div>
      </div>
    </div>
  );
}
