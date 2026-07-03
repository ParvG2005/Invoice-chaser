# Graph Report - invoice_chaser  (2026-06-06)

## Corpus Check
- 91 files · ~16,601 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 448 nodes · 792 edges · 27 communities (21 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `createLogger()` - 14 edges
3. `cn()` - 13 edges
4. `scripts` - 11 edges
5. `InvoicePilot` - 11 edges
6. `InvoicePilot Architecture` - 10 edges
7. `withApiHandler()` - 9 edges
8. `successResponse()` - 9 edges
9. `Button` - 8 edges
10. `AiProvider` - 8 edges

## Surprising Connections (you probably didn't know these)
- `CsvParseResult` --references--> `CreateInvoiceInput`  [EXTRACTED]
  src/lib/import/csv-parser.ts → src/lib/validations/invoice.ts
- `ParsedPreview` --references--> `CreateInvoiceInput`  [EXTRACTED]
  src/modules/invoices/components/import-dialog.tsx → src/lib/validations/invoice.ts
- `InvoiceTableProps` --references--> `InvoiceDto`  [EXTRACTED]
  src/modules/invoices/components/invoice-table.tsx → src/types/index.ts
- `Badge()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/badge.tsx → src/lib/utils/cn.ts
- `Skeleton()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/skeleton.tsx → src/lib/utils/cn.ts

## Import Cycles
- 2-file cycle: `src/lib/rate-limit/index.ts -> src/lib/rate-limit/upstash.ts -> src/lib/rate-limit/index.ts`

## Communities (27 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (43): apiFetch(), CreateInvoiceDialog(), ImportDialog(), InvoiceTable(), InvoiceTableProps, statusVariant, StatsCards(), StatusChart() (+35 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (31): ApiContext, HandlerOptions, log, RouteContext, RouteHandler, withApiHandler(), errorResponse(), successResponse() (+23 more)

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (24): delay(), fetchWithRetry(), FetchWithRetryOptions, isRetryableStatus(), log, RETRYABLE_STATUS, FallbackAiProvider, getAiProvider() (+16 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (29): devDependencies, eslint, eslint-config-next, eslint-config-prettier, @eslint/eslintrc, prettier, prisma, tailwindcss (+21 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (30): dependencies, class-variance-authority, @clerk/nextjs, clsx, date-fns, inngest, lucide-react, next (+22 more)

### Community 5 - "Community 5"
Cohesion: 0.17
Nodes (12): checkRateLimit(), createDefaultLimiter(), getLimiter(), InMemoryRateLimiter, limiter, log, RateLimitEntry, RateLimiter (+4 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.15
Nodes (11): inngest, inngestFunctions, log, overdueCheckWorkflow, reminderScanWorkflow, sendReminderWorkflow, { GET, POST, PUT }, getJobScheduler() (+3 more)

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 9 - "Community 9"
Cohesion: 0.36
Nodes (6): userRepository, isUniqueViolation(), log, organizationService, resolveUserOrganization(), slugify()

### Community 10 - "Community 10"
Cohesion: 0.18
Nodes (7): CallMeBotWhatsappProvider, log, MockWhatsappProvider, SendWhatsappParams, SendWhatsappResult, TwilioWhatsappProvider, WhatsappProvider

### Community 11 - "Community 11"
Cohesion: 0.17
Nodes (11): CSV upload format, Deployment (Vercel), Environment variables, InvoicePilot, License, MVP features, Prerequisites, Project structure (+3 more)

### Community 12 - "Community 12"
Cohesion: 0.18
Nodes (10): AI provider abstraction, Database indexes, Design principles, Email abstraction, InvoicePilot Architecture, Job scheduler abstraction, Layer diagram, Multi-tenancy path (+2 more)

### Community 13 - "Community 13"
Cohesion: 0.28
Nodes (5): geistMono, geistSans, metadata, QueryProvider(), ThemeProvider()

### Community 14 - "Community 14"
Cohesion: 0.07
Nodes (31): AppError, ForbiddenError, NotFoundError, RateLimitError, UnauthorizedError, ValidationError, globalForPrisma, getEmailProvider() (+23 more)

### Community 15 - "Community 15"
Cohesion: 0.21
Nodes (13): ImportTab, ParsedPreview, CsvParseResult, FIELD_ALIASES, parseCsv(), extractAmount(), getAll(), getText() (+5 more)

### Community 16 - "Community 16"
Cohesion: 0.40
Nodes (4): compat, __dirname, eslintConfig, __filename

## Knowledge Gaps
- **181 isolated node(s):** `allow`, `$schema`, `style`, `rsc`, `tsx` (+176 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createLogger()` connect `Community 2` to `Community 1`, `Community 5`, `Community 7`, `Community 9`, `Community 10`, `Community 14`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Community 4` to `Community 3`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `allow`, `$schema`, `style` to the rest of the system?**
  _181 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06594594594594595 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08859357696567 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._