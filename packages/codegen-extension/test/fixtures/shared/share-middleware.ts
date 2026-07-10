export function buildSharedProps() {
  return {
    user: { id: '1', name: 'Ada' },
    flash: { message: null as string | null },
  };
}

export type StaticSharedShape = {
  user: { id: string };
};

export const notAFunctionOrType = 42;
