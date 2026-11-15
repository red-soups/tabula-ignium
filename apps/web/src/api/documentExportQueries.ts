import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createDocumentExport, deleteDocumentExport, getDocumentExports,
} from './documentExports'

export const documentExportsKey = ['document-exports'] as const

export function useDocumentExportsQuery(enabled = true) {
  return useQuery({
    queryKey: documentExportsKey,
    queryFn: ({ signal }) => getDocumentExports(signal),
    enabled,
  })
}

export function useCreateDocumentExportMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createDocumentExport,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: documentExportsKey }),
  })
}

export function useDeleteDocumentExportMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteDocumentExport,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: documentExportsKey }),
  })
}
