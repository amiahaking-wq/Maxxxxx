import { useNavigate, useLocation } from 'react-router-dom';
import { Home, GitBranch, CheckSquare, MessageSquare, Smartphone } from 'lucide-react';

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/repo', icon: GitBranch, label: 'Repo' },
    { path: '/tasks', icon: CheckSquare, label: 'Tasks' },
    { path: '/chat', icon: MessageSquare, label: 'Chat' },
    { path: '/runtime', icon: Smartphone, label: 'Runtime' }
  ];

  const isActive = (path) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-border z-40">
      <div className="flex items-center justify-around">
        {navItems.map(({ path, icon: Icon, label }) => {
          const active = isActive(path);
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
                active ? 'text-accent' : 'text-text-secondary'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
