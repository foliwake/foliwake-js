---
'create-foliwake': patch
---

The starter blocks' stylesheets (`note`, `quiz`, `steps`) give every site variable a fallback, so the blocks keep
their styles inside an app that embeds the page: an app loads `components/<name>/<name>.css` but not the site's
`styles/styles.css` where `--color-accent` and the other variables are defined, and a `var()` without a fallback
dropped its declaration (the note's border was missing in a Next app). The docs say why, and troubleshooting
covers it and an app's unlayered reset that wins over `@layer blocks`.
