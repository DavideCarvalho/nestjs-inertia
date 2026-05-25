export function getSharedProps(_req: unknown) {
  return {
    appName: 'nestjs-inertia-example',
    year: new Date().getFullYear(),
  };
}
