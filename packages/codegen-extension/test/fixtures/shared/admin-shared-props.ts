/** The shared props of a second Inertia app (an `InertiaModule.forFeature({ scope: 'admin' })`). */
export async function buildAdminSharedProps() {
  return {
    auth: { can: { 'users.manage': true } as Record<string, boolean> },
    operator: false,
  };
}

export interface PortalSharedShape {
  tenant: { name: string };
}
