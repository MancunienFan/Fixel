const ROLES = {
  ADMIN: 'admin',
  MOD: 'mod',
  CONSULTANT: 'consultant'
};

const ROLES_AUTORISES = [ROLES.ADMIN, ROLES.MOD, ROLES.CONSULTANT];

const PERMISSIONS = {
  admin: {
    '*': ['*']
  },
  mod: {
    atelier: ['read', 'create', 'update', 'delete'],
    reparations: ['read', 'create', 'update', 'delete'],
    sav: ['read', 'create', 'update', 'delete'],
    clients: ['read'],
    produits: ['read'],
    factures: ['read'],
    sales: ['read', 'create', 'update']
  },
  consultant: {
    atelier: ['read'],
    reparations: ['read'],
    sav: ['read'],
    clients: ['read'],
    produits: ['read'],
    sales: ['read']
  }
};

function roleUtilisateur(req) {
  return req.utilisateur && req.utilisateur.role;
}

function roleValide(role) {
  return ROLES_AUTORISES.includes(role);
}

function aPermission(role, module, action) {
  if (!roleValide(role)) return false;
  if (role === ROLES.ADMIN) return true;

  const permissionsRole = PERMISSIONS[role] || {};
  const actions = permissionsRole[module] || [];
  return actions.includes(action) || actions.includes('*');
}

function requireAnyRole(roles = []) {
  return (req, res, next) => {
    const role = roleUtilisateur(req);

    if (!role || !roles.includes(role)) {
      return res.status(403).json({ message: 'Acces refuse. Role non autorise.' });
    }

    next();
  };
}

function requireRole(role) {
  return requireAnyRole([role]);
}

function requirePermission(module, action) {
  return (req, res, next) => {
    const role = roleUtilisateur(req);

    if (!aPermission(role, module, action)) {
      return res.status(403).json({ message: 'Acces refuse. Permission insuffisante.' });
    }

    next();
  };
}

module.exports = {
  ROLES,
  ROLES_AUTORISES,
  PERMISSIONS,
  aPermission,
  requireAnyRole,
  requireRole,
  requirePermission
};
