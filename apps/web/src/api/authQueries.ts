import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AuthRequestError,
  completeSignup,
  getAccount,
  logout,
  updateProfile,
  type CurrentUser,
  type PendingSignup,
  type ProfileDetails,
  type SignupDetails,
} from './auth'

export const AUTH_QUERY_KEY = ['auth', 'me'] as const

type Account = CurrentUser | PendingSignup | null

export function useAccountQuery(enabled = true) {
  return useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: ({ signal }) => getAccount(signal),
    enabled,
  })
}

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (details: ProfileDetails) => updateProfile(details),
    onSuccess: (user) => {
      queryClient.setQueryData<Account>(AUTH_QUERY_KEY, user)
    },
  })
}

export function useCompleteSignupMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (details: SignupDetails) => completeSignup(details),
    onSuccess: (user) => {
      queryClient.setQueryData<Account>(AUTH_QUERY_KEY, user)
    },
    onError: (error) => {
      if (error instanceof AuthRequestError && error.status === 401) {
        queryClient.setQueryData<Account>(AUTH_QUERY_KEY, null)
      }
    },
  })
}

export function useLogoutMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData<Account>(AUTH_QUERY_KEY, null)
    },
  })
}
