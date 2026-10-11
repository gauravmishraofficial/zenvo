import { useEffect } from 'react';

export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · Voyage by Zenvo` : 'Voyage by Zenvo';
  }, [title]);
}
