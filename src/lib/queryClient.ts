import { QueryClient } from '@tanstack/react-query'

// One shared cache for data loaded from the server (Supabase, from Milestone 2 on).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // data counts as fresh for 1 minute, so fewer repeat requests
      retry: 1, // retry a failed request once
      refetchOnWindowFocus: false, // no surprise reloads when you switch back to the app
    },
  },
})
