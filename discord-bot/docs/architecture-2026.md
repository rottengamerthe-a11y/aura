# Aurix Architecture Direction

Aurix is moving from a command-first bot toward an event-driven game platform.

## Runtime Layers

- `src/core/eventBus.js`: internal domain event bus. New systems should publish events instead of directly coupling to command handlers.
- `src/analytics/service.js`: durable interaction and economy analytics for dashboards, balancing, and abuse detection.
- `src/economy/dynamicBalance.js`: server-specific economy policy calculation based on real holdings and wealth gaps.
- `src/ai/intentRouter.js`: local natural-language intent routing. This can later be backed by an LLM without changing Discord command handlers.
- `src/dashboard/api.js`: authenticated web API surface for analytics and balancing data.
- `src/game/service.js`: legacy gameplay facade. New features should be extracted into focused modules instead of expanding this file.

## Event-Driven Pattern

Commands should:

1. Validate Discord interaction input.
2. Call a focused domain service.
3. Persist state.
4. Publish a domain event such as `interaction.completed`, `economy.changed`, `world.choice_resolved`, or `project.completed`.
5. Let analytics, notifications, balancing, and dashboards subscribe independently.

## 2026+ Feature Direction

- AI-assisted gameplay: keep deterministic command handlers, but use intent routing and AI text generation as optional adapters.
- Dynamic balancing: calculate server policy from economy health, then apply it at faucet and sink boundaries.
- Cooperative systems: prefer projects, world decisions, factions, and server stories over solo timer loops.
- Visual inventory: treat inventory payloads as renderable view models so Discord embeds and web dashboard cards use the same data.
- Dashboard integration: expose read-only analytics first, then add admin-authorized write endpoints for settings and economy policy.

## Migration Rule

Do not rewrite the whole bot at once. Extract one bounded system at a time:

1. analytics
2. economy policy
3. world/story
4. inventory presentation
5. command registry
6. AI adapters

Each extraction should keep existing slash commands stable.
