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
 * Permitido exclusivamente para:
 * - Master
 * - Gestor (Admin / Manager)
 * - Sargenteante (Sargenteação)
 * - Comandante
 * - Subcomandante
 * 
 * Para qualquer outro usuário comum (músico), retorna false.
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

  // 2. Gestor (Admin / Manager / Gestor)
  const isGestor =
    role === 'admin' ||
    role === 'manager' ||
    role === 'gestor' ||
    cargo.includes('gestor') ||
    func.includes('gestor');
  if (isGestor) return true;

  // 3. Comandante
  const isComandante =
    role === 'comandante' ||
    (inst.includes('comandante') && !inst.includes('sub')) ||
    (cargo.includes('comandante') && !cargo.includes('sub')) ||
    (func.includes('comandante') && !func.includes('sub'));
  if (isComandante) return true;

  // 4. Subcomandante
  const isSubcomandante =
    role === 'subcomandante' ||
    inst.includes('subcomandante') ||
    cargo.includes('subcomandante') ||
    func.includes('subcomandante');
  if (isSubcomandante) return true;

  // 5. Sargenteante
  const isSargenteante =
    role === 'sargenteante' ||
    inst.includes('sargenteante') ||
    inst.includes('sargenteação') ||
    inst.includes('sargenteacao') ||
    cargo.includes('sargenteante') ||
    func.includes('sargenteante');
  if (isSargenteante) return true;

  // Usuário comum não tem acesso
  return false;
}

