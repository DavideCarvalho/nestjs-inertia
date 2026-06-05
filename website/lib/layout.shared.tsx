import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig } from './shared';

/**
 * Mono wordmark with the violet "wire" dot — the same identity the landing
 * header uses: a glowing violet dot followed by the package name in a
 * monospace face. Keeps the home → docs transition visually continuous.
 */
function NavTitle() {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[15px] font-semibold tracking-tight">
      <span
        aria-hidden
        className="size-2 rounded-full bg-violet-400 shadow-[0_0_8px_2px] shadow-violet-500/50"
      />
      {appName}
    </span>
  );
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <NavTitle />,
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
