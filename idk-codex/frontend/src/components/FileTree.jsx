/**
 * File Tree Component
 */

import { useState, useEffect } from 'react';
import { File, Folder, FolderOpen, ChevronRight, ChevronDown } from 'lucide-react';
import './FileTree.css';

function TreeNode({ node, onFileClick, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isDirectory = node.type === 'directory';

  const handleClick = () => {
    if (isDirectory) {
      setExpanded(!expanded);
    } else {
      onFileClick(node);
    }
  };

  return (
    <div className="tree-node">
      <div
        className={`tree-node-content ${isDirectory ? 'directory' : 'file'}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
      >
        {isDirectory && (
          <span className="tree-chevron">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
        )}
        <span className="tree-icon">
          {isDirectory ? (
            expanded ? <FolderOpen size={16} /> : <Folder size={16} />
          ) : (
            <File size={16} />
          )}
        </span>
        <span className="tree-name">{node.name}</span>
      </div>

      {isDirectory && expanded && node.children && (
        <div className="tree-children">
          {node.children.map((child, idx) => (
            <TreeNode
              key={child.path || idx}
              node={child}
              onFileClick={onFileClick}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ tree, onFileClick }) {
  if (!tree) {
    return (
      <div className="file-tree">
        <div className="file-tree-empty">No files loaded</div>
      </div>
    );
  }

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <h3>Files</h3>
      </div>
      <div className="file-tree-content">
        <TreeNode node={tree} onFileClick={onFileClick} depth={0} />
      </div>
    </div>
  );
}
