---
'@foliwake/blocks-contract': minor
'@foliwake/server': minor
'@foliwake/next': minor
---

**BREAKING** `PageEnvelope.generation` is now a number (`X-Site-Generation`, the live generation, which only
grows), or null when the origin sends none; it was a string. An origin that sends a value that is not a
non-negative integer is refused (`FoliwakePageError` kind `invalid`). Code that compared or stored the string
needs updating.

`@foliwake/next/cache` adds `setGenerationFloor((site) => Promise<number | null>)`: the app's highest known live
generation (for example written by the hook's `onDelivery`). A cached live read whose generation is below the
floor no longer stays for `app.revalidate` seconds: it lives at most 15 seconds and is read again, and the old
page is shown meanwhile instead of an error. A floor that cannot be read turns the check off for that read and
logs; without a floor nothing changes.
