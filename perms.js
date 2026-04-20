// ═══════════════════════════════════════════════════════════════
//  ANAC PERMISSIONS — Application des permissions sur l'UI
//  ─────────────────────────────────────────────────────────────
//  Masque les éléments HTML selon les permissions de l'utilisateur.
//  Utilisation :
//    <button data-perm="delete_flight">...</button>
//    <div data-perm="view_charts">...</div>
//    <div data-admin-only="1">...</div>   (réservé au rôle admin strict)
// ═══════════════════════════════════════════════════════════════

import { getSession, hasPerm, FALLBACK_USER } from './auth.js';

function isStrictAdmin(s) {
  if (!s) return false;
  if (s.username === FALLBACK_USER) return true;
  return s.role === 'admin';
}

export function applyPermissionsToUI() {
  const s = getSession();
  const isPublic = window.ANAC_PUBLIC_MODE === true;

  // ─── data-perm : masquer si pas la permission ───
  document.querySelectorAll('[data-perm]').forEach(el => {
    const required = el.dataset.perm;
    const allowed = isPublic
      ? (required === 'view_map')
      : (s && hasPerm(required));
    if (!allowed) {
      el.style.display = 'none';
      if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
        el.disabled = true;
      }
    }
  });

  // ─── data-admin-only : réservé au rôle admin strict ───
  document.querySelectorAll('[data-admin-only]').forEach(el => {
    const allowed = !isPublic && isStrictAdmin(s);
    if (!allowed) {
      el.style.display = 'none';
      if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') el.disabled = true;
    }
  });

  // ─── Menu hamburger : masquer les items sans permission ───
  const NAV_PERMS = {
    'suivi':      'view_flights',
    'rapports':   'view_charts',
    'facturation':'view_facturation',
    'vols':       'view_map',
    'ldm':        'view_ldm',
    'admin':      'access_admin',
    'ma':         'view_ma',
  };
  document.querySelectorAll('.anac-menu-item[data-nav]').forEach(el => {
    const nav = el.dataset.nav;
    const perm = NAV_PERMS[nav];
    if (!perm) return;
    const allowed = isPublic
      ? (perm === 'view_map')
      : (s && hasPerm(perm));
    if (!allowed) el.style.display = 'none';
  });

  // Masquer les séparateurs orphelins
  document.querySelectorAll('.anac-menu-divider').forEach(d => {
    let next = d.nextElementSibling;
    let anyVisible = false;
    while (next && next.classList.contains('anac-menu-item')) {
      if (next.style.display !== 'none') { anyVisible = true; break; }
      next = next.nextElementSibling;
    }
    if (!anyVisible) d.style.display = 'none';
  });
}

// Wrap window.showSection (admin.html) pour bloquer les sections non autorisées
export function protectShowSection() {
  const origShow = window.showSection;
  if (typeof origShow !== 'function' || origShow._permsWrapped) return;

  // Mapping section → permission (copié d'admin.html)
  const SEC_PERMS = {
    'airlines':    'manage_airlines',
    'airports':    'manage_airports',
    'formats':     'manage_authformat',
    'flightnums':  'manage_flightnums',
    'programme':   'manage_programme',
    'chargement':  'manage_chargement',
    'schedules':   'manage_schedules',
  };
  const ADMIN_ONLY_SECS = ['security'];

  const wrapped = function(name) {
    const s = getSession();
    if (ADMIN_ONLY_SECS.includes(name) && !isStrictAdmin(s)) {
      alert('Accès refusé : cette section est réservée aux administrateurs.');
      return;
    }
    if (SEC_PERMS[name] && !hasPerm(SEC_PERMS[name])) {
      alert("Accès refusé : vous n'avez pas la permission d'accéder à cette section.");
      return;
    }
    return origShow.apply(this, arguments);
  };
  wrapped._permsWrapped = true;
  window.showSection = wrapped;
}

// Expose globalement
window.ANAC_APPLY_PERMS = applyPermissionsToUI;
window.ANAC_PROTECT_SHOWSECTION = protectShowSection;

// Auto-apply au chargement
function autoApply() {
  applyPermissionsToUI();
  protectShowSection();
  // Re-appliquer après les chargements async (charts, données)
  setTimeout(() => { applyPermissionsToUI(); protectShowSection(); }, 500);
  setTimeout(() => { applyPermissionsToUI(); protectShowSection(); }, 1500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoApply);
} else {
  autoApply();
}

// Observer pour réappliquer quand le DOM change (boutons injectés dynamiquement)
const observer = new MutationObserver(() => {
  applyPermissionsToUI();
});
if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, { childList: true, subtree: true });
  });
}
