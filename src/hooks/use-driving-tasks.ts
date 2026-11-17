import { useEffect, useState } from 'react';

import type { DrivingTask } from '@/hooks/student-file';
import { supabase } from '@/lib/supabase';

/** The list is the same for everyone and rarely changes, so it is loaded once per app run. */
let cache: Promise<DrivingTask[] | null> | null = null;

function load() {
  cache ??= Promise.resolve(
    supabase
      .from('driving_tasks')
      .select('id, stage, chapter, code, title')
      .eq('license_category', 'B')
      .order('sort_order')
      .returns<DrivingTask[]>()
  ).then(({ data, error }) => {
    if (error || !data) {
      cache = null; // try again next time
      return null;
    }
    return data;
  });
  return cache;
}

/** The official driving tasks ("כרטיס תלמיד"), in order. Null while loading or if loading failed. */
export function useDrivingTasks() {
  const [tasks, setTasks] = useState<DrivingTask[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    load().then((result) => {
      if (cancelled) return;
      setTasks(result);
      setFailed(result === null);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return { tasks, failed };
}
