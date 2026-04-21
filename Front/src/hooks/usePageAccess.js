import { useMemo } from 'react';
import { PAGE_REGISTRY, PAGE_CATEGORIES, SUBMENUS, getCategoryIds } from '../constants/pages';

/**
 * Hook for checking page access based on user permissions.
 * 
 * Logic priority:
 * 1. Superadmin → always has access
 * 2. useCustomPermissions === true → only explicit pagePermissions apply
 * 3. useCustomPermissions === false → check role against page's defaultRoles
 */
export default function usePageAccess(user) {
  const role = user?.role;
  const isSuper = role === 'superadmin';
  const pagePermissions = user?.pagePermissions || [];
  const useCustom = user?.useCustomPermissions || false;

  const hasAccess = useMemo(() => {
    return (pageId) => {
      if (isSuper) return true;

      if (useCustom) {
        return pagePermissions.includes(pageId);
      }

      // Default mode: check role against page's defaultRoles
      const page = PAGE_REGISTRY.find(p => p.id === pageId);
      if (!page) return false;
      return page.defaultRoles.includes(role);
    };
  }, [isSuper, useCustom, pagePermissions, role]);

  // Get all accessible pages for a category
  const getAccessiblePages = useMemo(() => {
    return (categoryId) => {
      return PAGE_REGISTRY
        .filter(p => p.category === categoryId)
        .filter(p => hasAccess(p.id));
    };
  }, [hasAccess]);

  // Check if a category has any accessible pages
  const hasCategoryAccess = useMemo(() => {
    return (categoryId) => {
      return getAccessiblePages(categoryId).length > 0;
    };
  }, [getAccessiblePages]);

  // Get accessible categories (categories with at least one accessible page)
  const accessibleCategories = useMemo(() => {
    return getCategoryIds().filter(catId => hasCategoryAccess(catId));
  }, [hasCategoryAccess]);

  // Get accessible pages within a submenu
  const getSubmenuPages = useMemo(() => {
    return (submenuId) => {
      const submenu = SUBMENUS[submenuId];
      if (!submenu) return [];
      return submenu.pages
        .map(pageId => PAGE_REGISTRY.find(p => p.id === pageId))
        .filter(p => p && hasAccess(p.id));
    };
  }, [hasAccess]);

  // Check if a submenu has any accessible pages
  const hasSubmenuAccess = useMemo(() => {
    return (submenuId) => {
      return getSubmenuPages(submenuId).length > 0;
    };
  }, [getSubmenuPages]);

  return {
    hasAccess,
    getAccessiblePages,
    hasCategoryAccess,
    accessibleCategories,
    getSubmenuPages,
    hasSubmenuAccess,
    isSuper,
  };
}
