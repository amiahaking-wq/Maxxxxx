import { useState, useEffect } from 'react';
import { Cpu, HardDrive, Activity, ExternalLink, RefreshCw } from 'lucide-react';
import { getRuntimeInfo } from '../services/api';

export default function RuntimePage() {
  const [runtime, setRuntime] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRuntimeInfo();
    const interval = setInterval(loadRuntimeInfo, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadRuntimeInfo = async () => {
    try {
      const data = await getRuntimeInfo();
      setRuntime(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load runtime info:', error);
      setLoading(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatUptime = (seconds) => {
    if (!seconds) return '0s';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-text-secondary">Loading runtime info...</div>
      </div>
    );
  }

  const cpuPercent = runtime?.cpu?.usage || 0;
  const memoryPercent = runtime?.memory?.usedPercent || 0;
  const diskPercent = runtime?.disk?.usedPercent || 0;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Runtime Status</h1>
            <p className="text-text-secondary">System resources and processes</p>
          </div>
          <button
            onClick={loadRuntimeInfo}
            className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg hover:border-accent transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* System Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="p-4 bg-surface border border-border rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-5 h-5 text-accent" />
              <span className="text-sm text-text-secondary">Uptime</span>
            </div>
            <p className="text-2xl font-semibold text-text-primary">
              {formatUptime(runtime?.uptime)}
            </p>
          </div>

          <div className="p-4 bg-surface border border-border rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-5 h-5 text-accent" />
              <span className="text-sm text-text-secondary">Platform</span>
            </div>
            <p className="text-2xl font-semibold text-text-primary">
              {runtime?.platform || 'Unknown'}
            </p>
          </div>

          <div className="p-4 bg-surface border border-border rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <HardDrive className="w-5 h-5 text-accent" />
              <span className="text-sm text-text-secondary">Node Version</span>
            </div>
            <p className="text-2xl font-semibold text-text-primary">
              {runtime?.nodeVersion || 'N/A'}
            </p>
          </div>
        </div>

        {/* Resource Usage */}
        <div className="space-y-6 mb-8">
          {/* CPU */}
          <div className="p-6 bg-surface border border-border rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Cpu className="w-6 h-6 text-accent" />
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">CPU Usage</h3>
                  <p className="text-sm text-text-secondary">
                    {runtime?.cpu?.cores || 0} cores available
                  </p>
                </div>
              </div>
              <span className="text-2xl font-semibold text-text-primary">
                {cpuPercent.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-background rounded-full h-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  cpuPercent > 80 ? 'bg-error' : cpuPercent > 60 ? 'bg-warning' : 'bg-success'
                }`}
                style={{ width: `${cpuPercent}%` }}
              />
            </div>
          </div>

          {/* Memory */}
          <div className="p-6 bg-surface border border-border rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Activity className="w-6 h-6 text-accent" />
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">Memory Usage</h3>
                  <p className="text-sm text-text-secondary">
                    {formatBytes(runtime?.memory?.used)} / {formatBytes(runtime?.memory?.total)}
                  </p>
                </div>
              </div>
              <span className="text-2xl font-semibold text-text-primary">
                {memoryPercent.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-background rounded-full h-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  memoryPercent > 80 ? 'bg-error' : memoryPercent > 60 ? 'bg-warning' : 'bg-success'
                }`}
                style={{ width: `${memoryPercent}%` }}
              />
            </div>
          </div>

          {/* Disk */}
          <div className="p-6 bg-surface border border-border rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <HardDrive className="w-6 h-6 text-accent" />
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">Disk Usage</h3>
                  <p className="text-sm text-text-secondary">
                    {formatBytes(runtime?.disk?.used)} / {formatBytes(runtime?.disk?.total)}
                  </p>
                </div>
              </div>
              <span className="text-2xl font-semibold text-text-primary">
                {diskPercent.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-background rounded-full h-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  diskPercent > 80 ? 'bg-error' : diskPercent > 60 ? 'bg-warning' : 'bg-success'
                }`}
                style={{ width: `${diskPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Tunnels */}
        {runtime?.tunnels && runtime.tunnels.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-text-primary mb-4">Active Tunnels</h2>
            <div className="space-y-3">
              {runtime.tunnels.map((tunnel, index) => (
                <div key={index} className="p-4 bg-surface border border-border rounded-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-text-primary mb-1">
                        Port {tunnel.port}
                      </p>
                      <a
                        href={tunnel.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-accent hover:underline flex items-center gap-1"
                      >
                        {tunnel.url}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                      <span className="text-sm text-success">Active</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Processes */}
        {runtime?.processes && runtime.processes.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-text-primary mb-4">Running Processes</h2>
            <div className="space-y-3">
              {runtime.processes.map((process, index) => (
                <div key={index} className="p-4 bg-surface border border-border rounded-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-text-primary mb-1">{process.name}</p>
                      <p className="text-sm text-text-secondary">
                        PID: {process.pid} • Port: {process.port || 'N/A'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                      <span className="text-sm text-success">Running</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(!runtime?.processes || runtime.processes.length === 0) &&
         (!runtime?.tunnels || runtime.tunnels.length === 0) && (
          <div className="text-center py-12 bg-surface border border-border rounded-xl">
            <Activity className="w-12 h-12 text-text-secondary mx-auto mb-3" />
            <p className="text-text-secondary">No active processes or tunnels</p>
          </div>
        )}
      </div>
    </div>
  );
}
