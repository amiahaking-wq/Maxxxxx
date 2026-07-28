import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  FileJson,
  Image,
  MoreVertical,
  Plus,
  Trash2,
  Edit,
  Copy,
  Download
} from 'lucide-react';
import { getFileTree, getFileContent, updateFileContent } from '../services/api';

const FileExplorer = ({ onFileSelect, activeFile }) => {
  const [fileTree, setFileTree] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const contextMenuRef = useRef(null);

  useEffect(() => {
    loadFileTree();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target)) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

  const loadFileTree = async () => {
    try {
      const tree = await getFileTree();
      setFileTree(tree);
    } catch (error) {
      console.error('Failed to load file tree:', error);
    }
  };

  const toggleFolder = (path) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const handleFileClick = async (node) => {
    if (node.type === 'file') {
      try {
        const content = await getFileContent(node.path);
        onFileSelect({ ...node, content });
      } catch (error) {
        console.error('Failed to load file:', error);
      }
    } else {
      toggleFolder(node.path);
    }
  };

  const handleContextMenu = (e, node) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedNode(node);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node
    });
  };

  const getFileIcon = (node) => {
    if (node.type === 'directory') {
      return expandedFolders.has(node.path) ? (
        <FolderOpen size={16} className="file-icon folder" />
      ) : (
        <Folder size={16} className="file-icon folder" />
      );
    }

    const ext = node.name.split('.').pop().toLowerCase();

    switch (ext) {
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
        return <FileCode size={16} className="file-icon code" />;
      case 'json':
        return <FileJson size={16} className="file-icon json" />;
      case 'md':
      case 'txt':
        return <FileText size={16} className="file-icon text" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'svg':
        return <Image size={16} className="file-icon image" />;
      default:
        return <File size={16} className="file-icon" />;
    }
  };

  const renderNode = (node, depth = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isActive = activeFile === node.path;

    return (
      <div key={node.path} className="file-tree-node">
        <div
          className={`file-tree-item ${isActive ? 'active' : ''}`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => handleFileClick(node)}
          onContextMenu={(e) => handleContextMenu(e, node)}
        >
          {node.type === 'directory' && (
            <span className="expand-icon">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          )}
          {getFileIcon(node)}
          <span className="file-name">{node.name}</span>
          <button
            className="file-menu-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleContextMenu(e, node);
            }}
          >
            <MoreVertical size={14} />
          </button>
        </div>

        {node.type === 'directory' && isExpanded && node.children && (
          <div className="file-tree-children">
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const handleContextMenuAction = (action) => {
    console.log('Context menu action:', action, selectedNode);
    setContextMenu(null);
    // Implement actions: new file, rename, delete, etc.
  };

  return (
    <div className="file-explorer">
      <div className="file-explorer-header">
        <span className="header-title">EXPLORER</span>
        <div className="header-actions">
          <button className="header-action-btn" title="New File">
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="file-tree">
        {fileTree.map(node => renderNode(node))}
      </div>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`
          }}
        >
          <div className="context-menu-item" onClick={() => handleContextMenuAction('new')}>
            <Plus size={14} />
            <span>New File</span>
          </div>
          <div className="context-menu-item" onClick={() => handleContextMenuAction('rename')}>
            <Edit size={14} />
            <span>Rename</span>
          </div>
          <div className="context-menu-item" onClick={() => handleContextMenuAction('copy')}>
            <Copy size={14} />
            <span>Copy Path</span>
          </div>
          <div className="context-menu-item" onClick={() => handleContextMenuAction('download')}>
            <Download size={14} />
            <span>Download</span>
          </div>
          <div className="context-menu-divider" />
          <div className="context-menu-item danger" onClick={() => handleContextMenuAction('delete')}>
            <Trash2 size={14} />
            <span>Delete</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileExplorer;
