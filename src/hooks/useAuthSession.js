import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useAuthSession() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      if (!supabase) {
        if (!isMounted) return;
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!isMounted) return;

        const nextSession = data?.session || null;
        setSession(nextSession);
        setUser(nextSession?.user || null);
      } catch {
        if (!isMounted) return;
        setSession(null);
        setUser(null);
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    }

    init();

    if (!supabase) return () => {
      isMounted = false;
    };

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
      setUser(nextSession?.user || null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      try {
        data?.subscription?.unsubscribe?.();
      } catch {
        // ignore
      }
    };
  }, []);

  return { user, session, loading };
}
