import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api';
import { EmployeeTypeOption } from '../types';

/** Fallback list keeps the UI usable if the catalog fetch fails (e.g. offline). */
const FALLBACK_TYPES: EmployeeTypeOption[] = [
  { id: 0, code: 'FIELD_STAFF', name: 'Field Staff', is_active: true },
  { id: 1, code: 'INTERN', name: 'Intern', is_active: true },
];

export function useEmployeeTypes() {
  const [types, setTypes] = useState<EmployeeTypeOption[]>(FALLBACK_TYPES);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<EmployeeTypeOption[]> => {
    try {
      const res = await apiClient.get('/auth/employee-types/');
      const active = res.data.results || res.data;
      if (Array.isArray(active)) {
        setTypes(active);
        return active;
      }
    } catch (err) {
      console.error('Error fetching employee types:', err);
    }
    return FALLBACK_TYPES;
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  return { types, activeTypes: types.filter((t) => t.is_active), loading, refresh };
}