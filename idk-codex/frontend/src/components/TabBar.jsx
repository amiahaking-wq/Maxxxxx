import React from 'react';
import { X, Circle } from 'lucide-react';

const TabBar = ({ tabs, activeTab, onTabClick, onTabClose }) => {
  const getFileName = (path) => {
    return path.split('/').pop();
  };

  const handleClose = (e, tabId) => {
    e.stopPropagation();
    onTabClose(tabId);
  };

  return (
    <div className="tab-bar">
      <div className="tabs-container">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''} ${tab.isDirty ? 'dirty' : ''}`}
            onClick={() => onTabClick(tab.id)}
          >
            <span className="tab-name">{getFileName(tab.path)}</span>
            {tab.isDirty && <Circle size={8} className="dirty-indicator" />}
            <button
              className="tab-close"
              onClick={(e) => handleClose(e, tab.id)}
              title="Close"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TabBar;
