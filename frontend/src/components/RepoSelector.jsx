/**
 * Repository Selector Component
 * Allows users to select which GitHub repo the agent should work on
 */

import { useState } from 'react';
import { FolderGit2, Check } from 'lucide-react';
import './RepoSelector.css';

export default function RepoSelector({ currentRepo, onRepoChange }) {
  const [showSelector, setShowSelector] = useState(false);
  const [owner, setOwner] = useState(currentRepo?.owner || '');
  const [repo, setRepo] = useState(currentRepo?.repo || '');

  const handleSave = () => {
    if (owner && repo) {
      onRepoChange({ owner, repo });
      setShowSelector(false);
    }
  };

  return (
    <div className="repo-selector">
      <button
        className="repo-button"
        onClick={() => setShowSelector(!showSelector)}
      >
        <FolderGit2 size={16} />
        <span>{currentRepo ? `${currentRepo.owner}/${currentRepo.repo}` : 'Select Repository'}</span>
      </button>

      {showSelector && (
        <div className="repo-modal">
          <div className="repo-modal-content">
            <h3>Select Repository</h3>
            <p>Which GitHub repository should the agent work on?</p>

            <div className="repo-inputs">
              <input
                type="text"
                placeholder="Owner (e.g., johnadekola676-page)"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="repo-input"
              />
              <span className="repo-slash">/</span>
              <input
                type="text"
                placeholder="Repository (e.g., IDK)"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                className="repo-input"
              />
            </div>

            <div className="repo-actions">
              <button onClick={() => setShowSelector(false)} className="btn-cancel">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!owner || !repo}
                className="btn-save"
              >
                <Check size={16} />
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
