import React from 'react';

export function FileExplorer({ files = [] }) {
  return (
    <div className="file-explorer">
      {files.length === 0 ? (
        <div className="file-explorer-empty">No files loaded</div>
      ) : (
        <ul className="file-list">
          {files.map((file, index) => (
            <li key={index} className="file-item">
              <span className="file-icon">📄</span>
              <span className="file-name">{file.name || file}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
