---
'@foliwake/server': patch
'@foliwake/next': patch
---

The hook trims leading and trailing whitespace and newlines from the secret read from `secretEnv` and
`previousSecretEnv` (a secret pasted with a trailing newline used to fail every signature), warns once naming the
variable (never the value), and treats an all-whitespace value as unset. New: `hookSecretsFrom` in
`@foliwake/server/hook-endpoint`. The docs make the secret with `openssl rand -hex 32 | tr -d '\n'`.
