'use client';
import { useState, useEffect } from 'react';
import { useApp } from './AppProvider';
import { Team } from '@/app/lib/types';
import { ChevronDown, User, Users, Check } from 'lucide-react';

export function WorkspaceSwitcher() {
  const { activeWorkspace, setActiveWorkspace } = useApp();
  const [teams, setTeams] = useState<Team[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Load teams
    const token = typeof window !== 'undefined' ? localStorage.getItem('max_token') : null;
    fetch('/api/teams', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(data => setTeams(data.teams || []))
      .catch(() => setTeams([]));
  }, []);

  return (
    <div className="relative px-2 py-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 rounded-lg border border-cg-border px-3 py-2 text-sm font-medium text-cg-text hover:bg-cg-hover"
      >
        {activeWorkspace ? (
          <>
            <div className="flex h-6 w-6 items-center justify-center rounded bg-cg-accent text-white">
              <Users className="h-3.5 w-3.5" />
            </div>
            <span className="flex-1 text-left truncate">{activeWorkspace.name}</span>
          </>
        ) : (
          <>
            <div className="flex h-6 w-6 items-center justify-center rounded bg-cg-accent text-white">
              <User className="h-3.5 w-3.5" />
            </div>
            <span className="flex-1 text-left">Personal</span>
          </>
        )}
        <ChevronDown className="h-4 w-4 text-cg-muted" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-2 right-2 top-12 z-20 rounded-lg border border-cg-border bg-cg-canvas py-1 shadow-lg">
            {/* Personal workspace */}
            <button
              onClick={() => { setActiveWorkspace(null); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-cg-hover"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded bg-cg-accent text-white">
                <User className="h-3.5 w-3.5" />
              </div>
              <span className="flex-1 text-left">Personal</span>
              {!activeWorkspace && <Check className="h-4 w-4 text-cg-accent" />}
            </button>

            {teams.length > 0 && (
              <>
                <div className="border-t border-cg-border px-3 py-1 text-xs font-semibold text-cg-muted">
                  Teams
                </div>
                {teams.map(team => (
                  <button
                    key={team.id}
                    onClick={() => { setActiveWorkspace(team); setOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-cg-hover"
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded bg-cg-accent text-white">
                      <Users className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 text-left overflow-hidden">
                      <div className="truncate">{team.name}</div>
                      <div className="text-xs text-cg-muted">{team.memberCount} members</div>
                    </div>
                    {activeWorkspace?.id === team.id && <Check className="h-4 w-4 text-cg-accent" />}
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
