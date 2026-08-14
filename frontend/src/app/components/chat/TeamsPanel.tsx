'use client';
import { useState, useEffect } from 'react';
import { useTeams } from '@/app/hooks/useTeams';
import { Team } from '@/app/lib/types';
import { X, Plus, Users, Trash2, UserPlus, Shield, Crown } from 'lucide-react';

interface Member {
  id: string;
  teamId: string;
  userId: string;
  role: string;
  status: string;
  invitedBy: string;
  invitedAt: string;
  joinedAt: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function TeamsPanel({ open, onClose }: Props) {
  const { teams, create, remove } = useTeams();
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');

  useEffect(() => {
    if (!selectedTeam) return;
    // Load members
    const token = typeof window !== 'undefined' ? localStorage.getItem('max_token') : null;
    fetch(`/api/teams/${selectedTeam.id}/members`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(data => setMembers(data.members || []))
      .catch(() => setMembers([]));
  }, [selectedTeam]);

  if (!open) return null;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const team = await create(newName, newDesc);
    if (team) {
      setNewName('');
      setNewDesc('');
      setCreating(false);
    }
  };

  const handleInvite = async () => {
    if (!selectedTeam || !inviteEmail.trim()) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('max_token') : null;
    try {
      const res = await fetch(`/api/teams/${selectedTeam.id}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (res.ok) {
        setInviteEmail('');
        // Refresh members
        const memRes = await fetch(`/api/teams/${selectedTeam.id}/members`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await memRes.json();
        setMembers(data.members || []);
      }
    } catch {}
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedTeam) return;
    if (!confirm('Remove this member?')) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('max_token') : null;
    await fetch(`/api/teams/${selectedTeam.id}/members/${userId}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    setMembers(prev => prev.filter(m => m.userId !== userId));
  };

  const roleIcon = (role: string) => {
    if (role === 'owner') return <Crown className="h-3.5 w-3.5 text-amber-500" />;
    if (role === 'admin') return <Shield className="h-3.5 w-3.5 text-blue-500" />;
    return <Users className="h-3.5 w-3.5 text-cg-muted" />;
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed right-0 top-0 z-40 flex h-full w-96 max-w-[90vw] flex-col border-l border-cg-border bg-cg-sidebar">
        <div className="flex items-center justify-between border-b border-cg-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-cg-text">
            <Users className="h-5 w-5" /> Teams
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-cg-muted hover:bg-cg-hover">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {selectedTeam ? (
            // ===== Team detail view =====
            <div>
              <button
                onClick={() => setSelectedTeam(null)}
                className="mb-3 text-sm text-cg-muted hover:text-cg-text"
              >
                ← Back to teams
              </button>
              <h3 className="mb-1 text-xl font-semibold text-cg-text">{selectedTeam.name}</h3>
              {selectedTeam.description && (
                <p className="mb-4 text-sm text-cg-muted">{selectedTeam.description}</p>
              )}

              {/* Invite form */}
              {selectedTeam.role === 'owner' || selectedTeam.role === 'admin' ? (
                <div className="mb-4 rounded-lg border border-cg-border bg-cg-canvas p-3">
                  <div className="mb-2 text-sm font-medium text-cg-text">Invite member</div>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="flex-1 rounded border border-cg-border bg-cg-canvas px-2 py-1 text-sm"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
                      className="rounded border border-cg-border bg-cg-canvas px-2 py-1 text-sm"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={handleInvite}
                      className="rounded bg-cg-accent px-2 py-1 text-white"
                    >
                      <UserPlus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Members list */}
              <div className="mb-2 text-sm font-medium text-cg-text">Members ({members.length})</div>
              <div className="space-y-1">
                {members.map(m => (
                  <div key={m.id} className="flex items-center gap-2 rounded-lg border border-cg-border bg-cg-canvas px-3 py-2">
                    {roleIcon(m.role)}
                    <div className="flex-1">
                      <div className="text-sm text-cg-text">{m.userId}</div>
                      <div className="text-xs text-cg-muted">
                        {m.role} · {m.status}
                      </div>
                    </div>
                    {(selectedTeam.role === 'owner' || selectedTeam.role === 'admin') && m.role !== 'owner' && (
                      <button
                        onClick={() => handleRemoveMember(m.userId)}
                        className="rounded p-1 text-cg-muted hover:bg-cg-hover hover:text-red-600"
                        title="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {selectedTeam.role === 'owner' && (
                <button
                  onClick={async () => {
                    if (confirm('Delete this team? This cannot be undone.')) {
                      if (await remove(selectedTeam.id)) setSelectedTeam(null);
                    }
                  }}
                  className="mt-6 flex items-center gap-1 text-sm text-red-600 hover:underline"
                >
                  <Trash2 className="h-4 w-4" /> Delete team
                </button>
              )}
            </div>
          ) : creating ? (
            // ===== Create team form =====
            <div>
              <button
                onClick={() => setCreating(false)}
                className="mb-3 text-sm text-cg-muted hover:text-cg-text"
              >
                ← Cancel
              </button>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-cg-muted">Team name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Engineering Team"
                    className="w-full rounded-lg border border-cg-border bg-cg-canvas px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-cg-muted">Description (optional)</label>
                  <textarea
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-cg-border bg-cg-canvas px-3 py-2 text-sm"
                  />
                </div>
                <button
                  onClick={handleCreate}
                  className="w-full rounded-lg bg-cg-accent px-4 py-2 text-sm text-white hover:opacity-90"
                >
                  Create team
                </button>
              </div>
            </div>
          ) : (
            // ===== Teams list =====
            <div>
              <button
                onClick={() => setCreating(true)}
                className="mb-3 flex w-full items-center justify-center gap-1 rounded-lg border border-cg-border px-3 py-2 text-sm text-cg-text hover:bg-cg-hover"
              >
                <Plus className="h-4 w-4" /> Create team
              </button>
              {teams.length === 0 ? (
                <div className="py-8 text-center">
                  <Users className="mx-auto mb-2 h-10 w-10 text-cg-muted" />
                  <p className="text-sm text-cg-muted">No teams yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {teams.map(team => (
                    <button
                      key={team.id}
                      onClick={() => setSelectedTeam(team)}
                      className="flex w-full items-center gap-3 rounded-lg border border-cg-border bg-cg-canvas p-3 text-left hover:bg-cg-hover"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cg-accent text-white">
                        <Users className="h-4 w-4" />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <div className="truncate text-sm font-medium text-cg-text">{team.name}</div>
                        <div className="text-xs text-cg-muted">
                          {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
                          {team.role === 'owner' && ' · owner'}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
