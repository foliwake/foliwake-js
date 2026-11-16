// Which environment variable names a config may give as a credential: the engine's rule
// (src/sites/credential-env.ts), reduced to what an app needs. The engine's CLI passes its full rule
// (`envNameProblem`) on top of this one.

const NAME = /^[A-Z_][A-Z0-9_]{0,127}$/;
const SYSTEM_NAMES = new Set([
  'PATH', 'HOME', 'USER', 'USERNAME', 'LOGNAME', 'SHELL', 'PWD', 'OLDPWD', 'TMPDIR', 'TMP', 'TEMP', 'TERM', 'TERM_PROGRAM', 'LANG', 'LANGUAGE', 'TZ',
  'EDITOR', 'VISUAL', 'PAGER', 'HOSTNAME', 'HOST', 'MAIL', 'DISPLAY', 'COLUMNS', 'LINES', 'SHLVL', 'CI', 'NODE_OPTIONS', 'NODE_PATH', 'NODE_ENV',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY', 'ENV', 'PROMPT_COMMAND', 'IFS', 'CDPATH', 'MANPATH', 'INFOPATH', 'CLASSPATH', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'CURL_CA_BUNDLE',
]);
const SYSTEM_PREFIXES = ['SSH_', 'LC_', 'XDG_', 'DYLD_', 'LD_', 'GIT_', 'NODE_', 'NPM_CONFIG_', 'YARN_', 'PNPM_', 'PYTHON', 'PIP_', 'RUBY', 'GEM_', 'BUNDLE_', 'PERL5', 'PERL_', 'JAVA_', '_JAVA_', 'JDK_', 'BASH_', 'ZSH', 'DOCKER_', 'KUBE', 'SUDO_', 'GPG_', 'GNUPG', 'NEXT_PUBLIC_', 'VITE_'];

/** Why `name` cannot name a credential, or null. Browser-exposed prefixes (NEXT_PUBLIC_, VITE_) are refused too. */
export function basicEnvNameProblem(name: unknown, what: string): string | null {
  if (typeof name !== 'string' || !NAME.test(name)) {
    return `${what}: give the NAME of an environment variable (capital letters, digits and _), not the secret itself.`;
  }
  if (SYSTEM_NAMES.has(name) || SYSTEM_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    return `${what}: ${name} is a system or browser-exposed variable, not a credential; use a variable of its own.`;
  }
  return null;
}
