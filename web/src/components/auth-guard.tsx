import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { authApi } from '../lib/api.ts';

export default function AuthGuard({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.me,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full w-1/3 animate-pulse bg-ink" />
        </div>
      </div>
    );
  }

  if (isError || !data?.authenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
