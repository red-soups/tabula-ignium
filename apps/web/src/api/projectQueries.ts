import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createProject, deleteProject, getProjects, updateProject } from './projects'

export const projectsQueryKey = ['projects'] as const

export function useProjectsQuery(enabled: boolean) {
  return useQuery({
    queryKey: projectsQueryKey,
    queryFn: ({ signal }) => getProjects(signal),
    enabled,
  })
}

export function useCreateProjectMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createProject,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectsQueryKey }),
  })
}

export function useUpdateProjectMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, details }: {
      projectId: number
      details: Parameters<typeof updateProject>[1]
    }) => updateProject(projectId, details),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectsQueryKey }),
  })
}

export function useDeleteProjectMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteProject,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectsQueryKey }),
  })
}
