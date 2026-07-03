import type { ImportedFilePayload } from '../../../shared/types'

export async function filePayloads(files: File[]): Promise<ImportedFilePayload[]> {
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer())
    }))
  )
}
