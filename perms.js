// ═══════════════════════════════════════════════════════════════
//  ANAC PERMISSIONS — Application des permissions sur l'UI
//  ─────────────────────────────────────────────────────────────
//  Masque les éléments HTML selon les permissions de l'utilisateur.
//  Utilisation :
//    <button data-perm="delete_flight">...</button>
//    <div data-perm="access_admin">...</div>
//    <div data-dady-only="1">...</div>   (réservé au compte DADY)
// ═══════════════════════════════════════════════════════════════

import { getSession, hasPerm, FALLBACK_USER } from './auth.js';

function isDady(s) {
  return s && s.username === FALLBACK_USER;
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

  // ─── data-dady-only : réservé au compte DADY uniquement ───
  document.querySelectorAll('[data-dady-only]').forEach(el => {
    const allowed = !isPublic && isDady(s);
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
    'ldm':        'access_ldm',
    'admin':      'access_admin',
    'ma':         'access_ma',
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

// Wrap window.showSection (admin.html) pour bloquer Sécurité (DADY uniquement)
export function protectShowSection() {
  const origShow = window.showSection;
  if (typeof origShow !== 'function' || origShow._permsWrapped) return;

  const DADY_ONLY_SECS = ['security'];

  const wrapped = function(name) {
    const s = getSession();
    if (DADY_ONLY_SECS.includes(name) && !isDady(s)) {
      alert('Accès refusé : cette section est réservée au compte principal DADY.');
      return;
    }
    return origShow.apply(this, arguments);
  };
  wrapped._permsWrapped = true;
  window.showSection = wrapped;
}

window.ANAC_APPLY_PERMS = applyPermissionsToUI;
window.ANAC_PROTECT_SHOWSECTION = protectShowSection;

function autoApply() {
  applyPermissionsToUI();
  protectShowSection();
  setTimeout(() => { applyPermissionsToUI(); protectShowSection(); }, 500);
  setTimeout(() => { applyPermissionsToUI(); protectShowSection(); }, 1500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoApply);
} else {
  autoApply();
}

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
