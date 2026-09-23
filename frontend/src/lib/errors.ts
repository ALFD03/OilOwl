import { ApiError } from '../api/client'

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const fields = Object.entries(error.fieldErrors)
      .map(([field, messages]) => `${field === 'non_field_errors' ? '' : `${field}: `}${[messages].flat().join(' ')}`)
      .join(' · ')
    return fields ? `${error.message} ${fields}` : error.message
  }
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.'
}
