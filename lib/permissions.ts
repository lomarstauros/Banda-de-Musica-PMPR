export interface ProfilePermissionsData {
  role?: string;
  instrument?: string;
  cargo?: string;
  function?: string;
  administrativeFunction?: string;
  email?: string;
}

/**
 * Verifica se o usuário tem permissão para acessar a aba e a página de Relatórios.
 * Permitido exclusivamente para: Master, Sargenteante, Comandante e Subcomandante.
 */
export function canAccessReports(profile?: ProfilePermissionsData | null, email?: string | null): boolean {
  if (!profile && !email) return false;

  const role = (profile?.role || '').toLowerCase().trim();
  const inst = (profile?.instrument || '').toLowerCase().trim();
  const cargo = (profile?.cargo || '').toLowerCase().trim();
  const func = (profile?.function || profile?.administrativeFunction || '').toLowerCase().trim();
  const userEmail = (email || profile?.email || '').toLowerCase().trim();

  // 1. Master
  if (role === 'master' || userEmail === 'heliomardejesus87@gmail.com') {
    return true;
  }

  // 2. Comandante
  const isComandante =
    role === 'comandante' ||
    (inst.includes('comandante') && !inst.includes('sub')) ||
    (cargo.includes('comandante') && !cargo.includes('sub')) ||
    (func.includes('comandante') && !func.includes('sub'));
  if (isComandante) return true;

  // 3. Subcomandante
  const isSubcomandante =
    role === 'subcomandante' ||
    inst.includes('subcomandante') ||
    cargo.includes('subcomandante') ||
    func.includes('subcomandante');
  if (isSubcomandante) return true;

  // 4. Sargenteante
  const isSargenteante =
    role === 'sargenteante' ||
    inst.includes('sargenteante') ||
    inst.includes('sargenteação') ||
    inst.includes('sargenteacao') ||
    cargo.includes('sargenteante') ||
    func.includes('sargenteante');
  if (isSargenteante) return true;

  return false;
}

