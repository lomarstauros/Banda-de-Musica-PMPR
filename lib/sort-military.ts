/**
 * Ordenação de militares por hierarquia de graduação e depois alfabeticamente.
 * Ordem: Major → Capitão → 1º Tenente → 2º Tenente → Subtenente →
 *         1º Sargento QPM PM → 2º Sargento QPM PM → ...
 */
const RANK_ORDER: Record<string, number> = {
  'Major QOM PM': 0,
  'Capitão QOM PM': 1,
  '1º Tenente QOM PM': 2,
  '2º Tenente QOM PM': 3,
  'Subtenente QPM PM': 4,
  '1º Sargento QPM PM': 5,
  '2º Sargento QPM PM': 6,
  '3º Sargento QPM PM': 7,
  'Cabo QPM PM': 8,
  'Soldado QPM PM': 9,
};

/**
 * Retorna o índice de hierarquia da graduação.
 * Graduações desconhecidas vão para o final (999).
 */
function getRankOrder(rank: string | undefined): number {
  if (!rank) return 999;
  // Busca exata primeiro
  if (RANK_ORDER[rank] !== undefined) return RANK_ORDER[rank];
  // Busca parcial (ex: "Soldado 1ª Cl." → Soldado)
  for (const key of Object.keys(RANK_ORDER)) {
    if (rank.startsWith(key) || key.startsWith(rank)) {
      return RANK_ORDER[key];
    }
  }
  return 999;
}

/**
 * Compara dois militares:
 * 1º por hierarquia de graduação (mais alto primeiro)
 * 2º por nome de guerra ou nome completo em ordem alfabética
 */
export function sortByRankThenName(a: any, b: any): number {
  const rankDiff = getRankOrder(a.rank) - getRankOrder(b.rank);
  if (rankDiff !== 0) return rankDiff;

  // Mesmo posto: ordena pelo nome de guerra ou nome completo
  const nameA = (a.war_name || a.name || '').trim().toLowerCase();
  const nameB = (b.war_name || b.name || '').trim().toLowerCase();
  return nameA.localeCompare(nameB, 'pt-BR');
}
