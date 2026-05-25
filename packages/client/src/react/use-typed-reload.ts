import type { InertiaPages } from '@dudousxd/nestjs-inertia';
/* v8 ignore next -- import resolution is not a branch */
import { router } from '@inertiajs/react';

type ReloadOptions<K extends keyof InertiaPages> = {
  only?: Array<keyof InertiaPages[K] & string>;
  except?: Array<keyof InertiaPages[K] & string>;
  preserveScroll?: boolean;
  preserveState?: boolean;
};

export function useTypedReload<K extends keyof InertiaPages>() {
  return (options?: ReloadOptions<K>) => {
    router.reload({
      only: options?.only as string[],
      except: options?.except as string[],
      preserveScroll: options?.preserveScroll,
      preserveState: options?.preserveState,
    });
  };
}
