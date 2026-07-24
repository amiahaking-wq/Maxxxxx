import { useState, useEffect } from 'react';
import { GitBranch, Check, RefreshCw, ExternalLink, Star } from 'lucide-react';
import axios from 'axios';

export default function RepoPage() {
  const [repos, setRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadRepos();
  }, []);

  const loadRepos = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/repos/list');
      setRepos(response.data.repos || []);
      setSelectedRepo(response.data.currentRepo || null);
    } catch (error) {
      console.error('Failed to load repos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRepo = async (repo) => {
    try {
      setUpdating(true);
      await axios.post('/api/repos/select', {
        owner: repo.owner.login,
        repo: repo.name
      });
      setSelectedRepo({ owner: repo.owner.login, name: repo.name });
    } catch (error) {
      console.error('Failed to select repo:', error);
      alert('Failed to select repository');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pb-20">
        <div className="text-text-secondary">Loading repositories...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-text-primary mb-2">Select Repository</h1>
          <p className="text-text-secondary">Choose which repository to work on</p>
        </div>

        {selectedRepo && (
          <div className="mb-6 p-4 bg-accent/10 border border-accent/30 rounded-xl">
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5 text-accent" />
              <div>
                <p className="text-sm text-text-secondary">Currently selected</p>
                <p className="text-text-primary font-medium">{selectedRepo.owner}/{selectedRepo.name}</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {repos.length === 0 ? (
            <div className="text-center py-12 bg-surface border border-border rounded-xl">
              <GitBranch className="w-12 h-12 text-text-secondary mx-auto mb-3" />
              <p className="text-text-secondary">No repositories found</p>
            </div>
          ) : (
            repos.map((repo) => {
              const isSelected = selectedRepo && selectedRepo.owner === repo.owner.login && selectedRepo.name === repo.name;
              return (
                <button
                  key={repo.id}
                  onClick={() => handleSelectRepo(repo)}
                  disabled={updating}
                  className={`w-full p-4 bg-surface border rounded-xl text-left transition-all ${isSelected ? 'border-accent bg-accent/5' : 'border-border hover:border-accent'} ${updating ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <GitBranch className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-accent' : 'text-text-secondary'}`} />
                        <p className={`font-medium truncate ${isSelected ? 'text-accent' : 'text-text-primary'}`}>{repo.name}</p>
                        {repo.private && (<span className="px-2 py-0.5 text-xs bg-warning/20 text-warning rounded-full">Private</span>)}
                      </div>
                      <p className="text-sm text-text-secondary truncate mb-2">{repo.description || 'No description'}</p>
                      <div className="flex items-center gap-4 text-xs text-text-secondary">
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3" />
                          {repo.stargazers_count}
                        </div>
                        <span>{repo.language || 'Unknown'}</span>
                        <span>Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {isSelected && (<Check className="w-5 h-5 text-accent flex-shrink-0" />)}
                      <a href={repo.html_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-text-secondary hover:text-accent transition-colors">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <button onClick={loadRepos} disabled={loading} className="w-full mt-6 flex items-center justify-center gap-2 px-6 py-3 bg-surface border border-border rounded-lg hover:border-accent transition-all disabled:opacity-50">
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Repositories
        </button>
      </div>
    </div>
  );
}
