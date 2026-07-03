import type { AISettings, AIStatus, AITextProvider } from '../../../shared/types'

export function aiProviderLabel(provider: AITextProvider): string {
  if (provider === 'codex') return 'Codex'
  if (provider === 'openai') return 'OpenAI API'
  return 'Anthropic API'
}

export function aiModelForProvider(settings: AISettings, provider: AITextProvider): string {
  if (provider === 'codex') return settings.codexModel
  if (provider === 'openai') return settings.openaiModel
  return settings.anthropicModel
}

export function updateAIModel(settings: AISettings, provider: AITextProvider, model: string): AISettings {
  if (provider === 'codex') return { ...settings, codexModel: model }
  if (provider === 'openai') return { ...settings, openaiModel: model }
  return { ...settings, anthropicModel: model }
}

export function configuredAIProviders(status: AIStatus | null): AITextProvider[] {
  if (!status) return []
  return [
    status.codex.authenticated ? 'codex' : null,
    status.openai.configured ? 'openai' : null,
    status.anthropic.configured ? 'anthropic' : null
  ].filter((provider): provider is AITextProvider => provider !== null)
}
