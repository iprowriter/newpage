# The brief, as received

Take-home from Newpage Solutions (https://newpage.io/) after the first interview.
Kept here verbatim-ish so I can check the submission against it at the end.

---

Build a fullstack web application. You decide the tech stack.

Build a conversational AI assistant using one of the following options:

- **Option 1: Chat With Your Docs** — answer questions about content from a document collection
  (PDFs, text files, or any format). The classic RAG use-case.
- **Option 2: Code Documentation Assistant** — ingest a codebase and answer questions about the
  code: how it works, where functionality is implemented, API endpoints, dependencies.
- **Option 3: Meeting Intelligence System** — analyse meeting transcripts and answer questions
  about discussions, decisions and action items. Transcripts as text files with speaker labels
  and timestamps. Optional bonus: voice-to-transcript.
- **Option 4: Career Intelligence Assistant** — analyse resumes against job descriptions. Answer
  questions about fit, skill gaps, experience alignment, interview prep.

"Choose the option that excites you most. We care as much about how you build it as what you
build. This is your chance to show us your engineering philosophy in action."

## What to submit

1. GitHub repo with the code.
2. README.md / other docs in the repo with:
   - a. Quick setup instructions
   - b. Architecture overview (a simple diagram is great but not required)
   - c. What would be required to productionize it, make it scalable, and deploy it on a
     hyper-scaler such as AWS / GCP / Azure / Cloudflare
   - d. RAG/LLM approach & decisions: choices considered and final choice for LLM / embedding
     model / vector database / orchestration framework, prompt & context management, guardrails,
     quality, observability
   - e. Key technical decisions and why
   - f. Engineering standards followed (and maybe some skipped)
   - g. How AI tools were used in the development process
   - h. What I'd do differently with more time
   - i. **Note: "We need your thoughts, not an LLM's direct output"**
3. Screenshots of the application. A video if time permits.

## What they're looking for

- **Core functionality** — a working solution answering questions over provided documents using
  RAG or similar retrieval, with a simple interface.
- **Creativity** — in UI/UX design and product innovation. "We expect a well designed application."
- **Approach and thought process** on: chunking, embedding model & LLM selection, retrieval
  approach, prompt engineering, context management, guardrails, quality controls, observability.
- **Engineering excellence** — clean, readable, well-structured code. "Ideally a simple
  containerised, well tested and observable solution."
- **AI-assisted development approach** — how I use AI coding tools and keep the code to my
  preference. How I make it repeatable and maintainable. My do's and don'ts.

## Their stated non-criteria

- Not looking for perfection — looking for approach, trade-offs, best practices within realistic
  time constraints.
- "Start simple, then enhance" — a basic working version with great engineering beats a complex
  broken version.
- Won't judge on handling every edge case (acknowledge them in the README) or on using the
  "best" tech stack (they care about the reasoning).
- Not enough time to implement everything is fine — document what I'd add next.

> "Remember, we value a solid & well-engineered basic solution A LOT MORE than an
> over-engineered complex one."
