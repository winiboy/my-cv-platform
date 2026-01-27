import { cn } from "@/lib/utils";

/**
 * Displays the current Git branch name and app version as a small, non-intrusive indicator.
 * Server component - reads environment variables at render time.
 * Hidden during print to avoid appearing in exported documents.
 */
export function BranchIndicator({ className }: { className?: string }) {
  const branch = process.env.NEXT_PUBLIC_GIT_BRANCH;
  const version = process.env.NEXT_PUBLIC_APP_VERSION;

  // Do not render if branch is unknown or not available
  if (!branch || branch === "unknown") {
    return null;
  }

  // Do not show indicator on main/master branches in production
  const isMainBranch = branch === "main" || branch === "master";
  if (isMainBranch && process.env.NODE_ENV === "production") {
    return null;
  }

  // Build display text: include version if available
  const hasVersion = version && version !== "unknown";
  const displayText = hasVersion ? `${branch} • v${version}` : branch;
  const ariaLabel = hasVersion
    ? `Current branch: ${branch}, version ${version}`
    : `Current branch: ${branch}`;

  return (
    <div
      className={cn(
        "fixed top-0 left-1/2 -translate-x-1/2 z-[60]",
        "inline-flex items-center gap-1.5 px-3 py-1",
        "bg-amber-100 text-amber-800 border border-amber-300",
        "text-xs font-medium rounded-b-md shadow-sm",
        "print:hidden",
        className
      )}
      role="status"
      aria-label={ariaLabel}
    >
      <svg
        className="h-3 w-3 flex-shrink-0"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z"
        />
      </svg>
      <span className="truncate max-w-[200px]">{displayText}</span>
    </div>
  );
}
