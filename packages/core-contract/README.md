# @foliwake/core-contract

The contract of Foliwake core over HTTP, for clients that call a Foliwake server without the engine: the
open `foliwake` CLI (`@foliwake/cli`) and your own tools.

A Foliwake server serves core, the one entrance to operations on sites, at `/api/rpc/<procedure>` on tRPC's
HTTP wire (no transformer; a query is `GET …?input=<JSON>`, a mutation `POST` with the JSON input), with a
CLI sign-in token or a CI key as `Authorization: Bearer …`. This package says what is there:

- `PROCEDURES`: every procedure (`sites.status`, `code.deploy`, …) and whether it is a query or a mutation;
  `procedureType(name)` looks one up.
- Types: `CoreProcedures` (each procedure's input and output), `CoreInput<'sites.status'>`,
  `CoreOutput<'sites.status'>`, and `CoreCaller`, one function per procedure nested by its words.
- `ERROR_CATEGORIES`, `ERROR_CODES` and the type `CoreError`: a failure answers tRPC's error with
  `error.data.coreError = { code, message, category, retryable, fields? }`. The codes are not a closed list;
  handle an unknown one by its category.
- `CORE_API` and `CONTRACT_DIGEST`: `GET /api/version` on a server answers
  `{ api, engine, build, contract }`; the same `contract` digest means the server speaks exactly this contract.

```ts
import { procedureType, type CoreOutput } from '@foliwake/core-contract';

const response = await fetch('https://foliwake.example/api/rpc/sites.status?input=' + encodeURIComponent(
  JSON.stringify({ site: 'my-site' }),
), { headers: { authorization: `Bearer ${process.env.FOLIWAKE_TOKEN}` } });
const status = (await response.json()).result.data as CoreOutput<'sites.status'>;
console.log(procedureType('sites.status'), status.live?.site_release);
```

## Versions

While the API version is 1, a server changes the contract additively only: new procedures, new optional input
fields, new output fields. Renaming or removing a procedure or an input field is API version 2. A server that
does not have a procedure answers the error `PROCEDURE_UNKNOWN` (category `not_found`): it is older than the
client. Send `X-Foliwake-Cli: <name>/<version>` with your requests; servers log it.

## Where it comes from

The engine writes the contract from its router (`manifest.json`, `errors.json`, `index.d.ts`); this repository
keeps a copy in `engine/` with their checksums, and `pnpm core-contract:sync <engine checkout>` updates it. The
package's sources are generated from that copy; do not edit them.
