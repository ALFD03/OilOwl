/**
 * Fábrica de recursos REST: cualquier endpoint estándar obtiene sus hooks con una sola línea.
 *   export const islands = createResource<Island>('islands')
 *   const { data } = islands.useList({ station })
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import type { Paginated } from './types'

type Params = Record<string, string | number | boolean | null | undefined>
type Id = string | number

export function createResource<T extends { id?: Id }, TInput = Partial<T>>(path: string) {
  const key = [path] as const

  function useInvalidate() {
    const client = useQueryClient()
    return () => client.invalidateQueries({ queryKey: key })
  }

  return {
    key,
    path,
    list: (params?: Params) => api<Paginated<T>>(path, { query: params }),
    get: (id: Id) => api<T>(`${path}/${id}`),

    useList(params?: Params, options: { enabled?: boolean } = {}) {
      return useQuery({
        queryKey: [...key, 'list', params ?? {}],
        queryFn: () => api<Paginated<T>>(path, { query: params }),
        placeholderData: keepPreviousData,
        enabled: options.enabled ?? true,
      })
    },

    /** Todos los registros (para selects): recorre la paginación hasta 1000 elementos. */
    useAll(params?: Params, options: { enabled?: boolean } = {}) {
      return useQuery({
        queryKey: [...key, 'all', params ?? {}],
        queryFn: async () => {
          const first = await api<Paginated<T>>(path, { query: { ...params, page_size: 200 } })
          const rest = await Promise.all(
            Array.from({ length: Math.min(first.pages, 5) - 1 }, (_, i) =>
              api<Paginated<T>>(path, { query: { ...params, page_size: 200, page: i + 2 } }),
            ),
          )
          return [first, ...rest].flatMap((page) => page.results)
        },
        enabled: options.enabled ?? true,
        staleTime: 60_000,
      })
    },

    useOne(id: Id | undefined) {
      return useQuery({
        queryKey: [...key, 'one', id],
        queryFn: () => api<T>(`${path}/${id}`),
        enabled: id !== undefined && id !== '',
      })
    },

    useCreate() {
      const invalidate = useInvalidate()
      return useMutation({ mutationFn: (body: TInput) => api<T>(path, { method: 'POST', body }), onSuccess: invalidate })
    },

    useUpdate() {
      const invalidate = useInvalidate()
      return useMutation({
        mutationFn: ({ id, body }: { id: Id; body: TInput }) => api<T>(`${path}/${id}`, { method: 'PATCH', body }),
        onSuccess: invalidate,
      })
    },

    useRemove() {
      const invalidate = useInvalidate()
      return useMutation({ mutationFn: (id: Id) => api<void>(`${path}/${id}`, { method: 'DELETE' }), onSuccess: invalidate })
    },

    /** Acción personalizada: POST /path/{id}/{name} o /path/{name} */
    useAction<TBody = unknown, TResult = T>(name: string, options: { detail?: boolean } = { detail: true }) {
      const invalidate = useInvalidate()
      return useMutation({
        mutationFn: ({ id, body }: { id?: Id; body?: TBody }) =>
          api<TResult>(options.detail ? `${path}/${id}/${name}` : `${path}/${name}`, { method: 'POST', body: body ?? {} }),
        onSuccess: invalidate,
      })
    },
  }
}

export type Resource<T extends { id?: Id }> = ReturnType<typeof createResource<T>>
