import { getConfig } from '../vault/config.js';
import { searchNotes } from '../vault/search.js';

export function vaultSearch(query: string, limit?: number) {
  const config = getConfig();
  return searchNotes(config.vault_path, query, limit);
}
