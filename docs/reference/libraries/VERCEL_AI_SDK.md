Vercel AI SDK Reference — Sharp Tools

Overview

This document summarizes how Sharp Tools uses the Vercel AI SDK and provides quick links, setup notes, and example snippets adapted for this repository.

Useful links

- Vercel AI SDK docs: https://sdk.vercel.ai/
- GitHub: https://github.com/vercel/ai

Install

If you need the SDK in this project, install the packages you plan to use. For example:

```bash
npm install ai @vercel/ai openai @ai-sdk/openai
```

Alternatively, with pnpm or yarn:

```bash
pnpm add ai @vercel/ai openai @ai-sdk/openai
# or
yarn add ai @vercel/ai openai @ai-sdk/openai
```

Basic usage (Sharp Tools examples)

The Sharp Tools repo includes both Python and TypeScript utilities. Below are concise TypeScript examples showing how we would use the Vercel AI SDK alongside OpenAI for simple completions and structured outputs.

Simple text generation

```ts
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });

async function demo() {
  const result = await generateText({
    model: openai('gpt-4o-mini'),
    prompt: 'Summarize the goals of the Sharp Tools project in one sentence.'
  });
  console.log(result.text);
}

demo();
```

Structured output (zod)

```ts
import { generateObject } from 'ai';
import { z } from 'zod';
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const Summary = z.object({
  title: z.string(),
  bullets: z.array(z.string())
});

async function structured() {
  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: Summary,
    prompt: 'Create a short summary of the Sharp Tools documentation.'
  });
  console.log(object);
}

structured();
```

Streaming to UI (React server action sketch)

```ts
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = await streamText({
    model: openai('gpt-4o-mini'),
    messages
  });
  return result.toAIStreamResponse();
}
```

Environment variables

- Set `OPENAI_API_KEY` for OpenAI provider usage.
- In local development, use a `.env` file or exported shell variable.

Repository fit

- TypeScript utilities live under `gjdutils/src/ts/`. You can add SDK-based scripts alongside `scripts/` if you want to experiment.
- Keep secrets out of the repo. Prefer `.env` with `.gitignore`.

Notes

- The Vercel AI SDK is model-agnostic; you can swap providers by switching the factory (e.g., OpenAI, Anthropic, etc.).
- For longer-running tasks, prefer streaming and incremental UI updates.
- For Python-only workflows in Sharp Tools, this SDK may not be necessary.


