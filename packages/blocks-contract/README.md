# @foliwake/blocks-contract

Types only (no runtime code) of the Foliwake blocks contract `foliwake-blocks/1`
([docs/contracts/blocks-contract.md](https://github.com/adjioev/foliwake/blob/main/docs/contracts/blocks-contract.md)),
and the page types shared by `@foliwake/server` and `@foliwake/react`.

```ts
import type { BlocksModule, BlockHost, FoliwakeEvent, BlockReport } from '@foliwake/blocks-contract';
import type { PageEnvelope, FoliwakePageData, ClientSettings, PreloadHint } from '@foliwake/blocks-contract/page';
```

- `.`: `BlocksModule` (`BLOCKS_CONTRACT`, `mountBlocks`), `MountHandle`, `BlockReport`, `BlockHost`, answers
  and verdicts, `BlockEventType` / `BlockEventDetails` / `FoliwakeEvent`.
- `./page`: `PageEnvelope` (what the origin answered, the only thing an app caches), `FoliwakePageData`
  (the prepared, serialisable page a client component receives), `ClientSettings`, `PreloadHint`, `QueryIndex`.

A change here is a contract change. Apache-2.0.
