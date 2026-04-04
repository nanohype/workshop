export interface ProviderConfig {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export const PROVIDER_CONFIG: ProviderConfig = {
  id: 'claude-code',
  name: 'Claude Code',
  color: '#6366f1',
  icon: 'terminal',
};
