# Marathon Orchestrator

Central coordinator that runs 24/7 or on-demand, maintaining thought signatures and self-correcting via Plan-Do-Verify-Act.

## Architecture

- **Observe**: Collect user state (last input, pending reminders, timestamp).
- **Reason**: Gemini 3 Pro (medium thinking) decides agents and actions from user context and memory.
- **Act**: Execute actions with retry and agent fallback (see errorRecovery).
- **Verify**: Gemini 3 Pro (high thinking) checks output quality; on failure, retry or fallback.
- **Update memory**: Persist thought signatures to Supabase; update conversation history.

## Usage

### Start a marathon session (background loop)

```ts
import { marathonOrchestrator } from '$lib/agents/marathonOrchestrator';

await marathonOrchestrator.runMarathon({
  userId: 'user-uuid',
  durationHours: 24,
  mode: 'hybrid',
  observeIntervalSeconds: 60,
  checkpointEveryNActions: 10,
  maxRetriesPerAction: 3,
});
```

Do not await this in a request handler; run it in the background. The session is created in `marathon_sessions` and the loop runs until `durationHours` or `stop()`.

### Stop the current session

```ts
marathonOrchestrator.stop();
```

### Single cycle (on-demand)

```ts
const userState = await marathonOrchestrator.observe(userId, 'Remind me at 8 PM', 'on_demand');
const decision = await marathonOrchestrator.reason(userState);
if (decision) {
  const results = await marathonOrchestrator.act(decision, config);
  const verification = await marathonOrchestrator.verify(decision.intent, results);
  await marathonOrchestrator.updateMemory(userId, decision, results);
}
```

### API

- `POST /api/marathon/start` — Body: `{ userId, durationHours?, mode? }`. Starts marathon in background.
- `POST /api/marathon/stop` — Body: `{ userId }`. Requests stop.
- `GET /api/marathon/status?userId=` — Returns `{ running, activeSessionId, sessions[] }`.
- `GET /api/marathon/checkpoint?sessionId=` — Returns latest checkpoint for recovery.

## Configuration

Env (optional):

- `MARATHON_MAX_DURATION_HOURS` — Default 72.
- `MARATHON_CHECKPOINT_INTERVAL_MINUTES` — Default 5.
- `MARATHON_RETRY_MAX_ATTEMPTS` — Default 3.

Checkpoints are saved every `checkpointEveryNActions` (default 10). State is pruned after 14 days via `prune_old_marathon_data()` (call periodically or from cron).

## Files

- `src/lib/agents/marathonOrchestrator.ts` — Core loop and interface.
- `src/lib/agents/verification.ts` — Plan-Do-Verify-Act verification.
- `src/lib/agents/errorRecovery.ts` — Retry and fallback strategies.
- `src/lib/agents/stateManager.ts` — Checkpoints and thought signatures in Supabase.
- `src/lib/agents/backgroundMonitor.ts` — Single-tick background cycle.
