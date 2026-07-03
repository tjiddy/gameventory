/** Minimal sign-in page (§3.6). The Authelia OIDC flow is wired in Phase 3;
    this page is the return-to target and a bookmarkable entry point. */
export function LoginPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <a
        href="/api/auth/oidc/authelia/login"
        className="rounded bg-cyan-600 px-4 py-2 font-medium hover:bg-cyan-500"
      >
        Sign in with Authelia
      </a>
    </div>
  );
}
