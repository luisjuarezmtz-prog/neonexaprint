import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';

const MemCtx = createContext(null);

export function isMembershipActive(m) {
  if (!m) return false;
  if (!['activa', 'prueba'].includes(m.status)) return false;
  if (m.period_end && new Date(m.period_end) < new Date()) return false;
  return true;
}

export function MembershipProvider({ children }) {
  const { user, isAuthed } = useAuth();
  const [membership, setMembership] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isAuthed || !user) { setMembership(null); setLoading(false); return; }
    setLoading(true);
    try {
      const list = await pb.collection('memberships').getFullList({ sort: '-created', expand: 'plan' });
      setMembership(list[0] || null);
    } catch { setMembership(null); }
    finally { setLoading(false); }
  }, [isAuthed, user]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <MemCtx.Provider value={{ membership, loading, refresh, allowed: isMembershipActive(membership) }}>
      {children}
    </MemCtx.Provider>
  );
}

export function useMembership() {
  const ctx = useContext(MemCtx);
  if (!ctx) throw new Error('useMembership must be inside MembershipProvider');
  return ctx;
}

// add a period to a start date
export function addPeriod(date, interval) {
  const d = new Date(date);
  if (interval === 'anual') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}
