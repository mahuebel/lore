import { getConfig } from '../vault/config.js';
import { queryNotes, type QueryFilters } from '../vault/query.js';

export function vaultQuery(filters: QueryFilters) {
  const config = getConfig();
  return queryNotes(config.vault_path, filters);
}
