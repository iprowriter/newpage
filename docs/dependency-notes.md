# Dependency notes

Running record of dependency decisions that a reviewer might otherwise read as carelessness.

## `npm audit`: 3 high, `deepmerge-ts` via `prisma`

**Status: accepted, not fixed.**

```
deepmerge-ts <8.0.0 — stack exhaustion when merging recursive object graphs
  └─ @prisma/config  └─ prisma (devDependency)
```

`npm audit fix --force` resolves it by downgrading `prisma` to 6.12.0, a major version
backwards. That is a worse trade than the finding:

- The vulnerable path is the **Prisma CLI's config merge**, a build-time devDependency. It is not
  in `@prisma/client`, so it does not exist in the running application or the shipped image.
- The failure mode is stack exhaustion on a maliciously recursive object graph. The only input to
  that path is `prisma.config.ts`, which is in this repo. There is no untrusted input.
- Downgrading to Prisma 6 would mean giving up the v7 driver-adapter setup the app is built on.

**What would change this:** the advisory reaching `@prisma/client`, or a Prisma 7.x patch release
picking up `deepmerge-ts` ≥ 8. Recheck before submission.

Recorded rather than silenced because "0 vulnerabilities" achieved by a forced major downgrade is
a worse engineering signal than a documented, reasoned exception.

## Pinned deliberately

- `qdrant/qdrant:v1.12.4` in compose — a floating `:latest` would make a reviewer's run differ
  from the one the eval numbers came from. Same reasoning as ADR-0014 for models.
- `postgres:17` — major pinned, minor floats.

## Gemini model pinning: `models.list` is not proof of access

**Found during first live run of the hosted path.**

`GEMINI_MODEL` was pinned to `gemini-2.5-flash`. The models endpoint returned it as available
and listing `supportedGenerationMethods` included `generateContent`. The actual call returned:

```
404 — This model models/gemini-2.5-flash is no longer available to new users.
      Please update your code to use models/gemini-3.6-flash
```

A model can be withdrawn **for new API keys only**, while remaining listed and remaining live for
existing ones. So a listing check passes, and the failure surfaces on a reviewer's first question.

This does not weaken ADR-0014 — pinning is still right, and a floating alias would have made the
eval table unreproducible. What it changes is the failure mode: the Gemini adapter now detects
this specific 404, extracts the suggested replacement from the response, and raises
*"Gemini model X has been retired for new API keys. Set GEMINI_MODEL to Y in .env.local"* rather
than a bare 404.

Pinned to `gemini-3.6-flash`. **Verify with an actual generateContent call before submission, not
by listing models.**

Second, smaller finding from the same run: `gemini-3.6-flash` is a thinking model and returns its
reasoning as response parts flagged `thought`. Concatenating all parts would have leaked
chain-of-thought into answers and broken JSON parsing of structured output. Those parts are
filtered in the adapter.
