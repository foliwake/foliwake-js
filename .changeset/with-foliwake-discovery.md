---
'@foliwake/next': minor
---

`withFoliwake` reads `FOLIWAKE_URL`: when it is set, the site's discovery document is read as Next loads
next.config (with the optional `foliwake.remote.json` version 3 merged), validated, and inlined as a snapshot for
the server modules; the CSP `img-src` gets the site's media CDN. Nothing is fetched at run time. A failure fails the
build with the address and the reason. In that case `withFoliwake` returns a promise of the config, which Next
accepts (type `FoliwakeNextConfig = NextConfig | Promise<NextConfig>`; code that annotated the result as
`NextConfig` needs the new type). Without `FOLIWAKE_URL` the version 2 file is read as before.
`foliwakeCspHeader` takes an already read `config`. Without `withFoliwake`, `FOLIWAKE_URL` alone is refused at run
time with a message that says to wrap next.config.
