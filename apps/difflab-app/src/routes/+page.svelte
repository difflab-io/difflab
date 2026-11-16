<script lang="ts">
  import { onMount } from 'svelte'
  import type { FlowRun, FlowRunDetail, FlowStep, WorkerMessage } from 'difflab-db'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  let runs = $state<FlowRun[]>([])
  let selectedRunId = $state<string | null>(null)
  let stepsByRun = $state<Record<string, FlowStep[]>>({})
  let messagesByRun = $state<Record<string, WorkerMessage[]>>({})
  let streamConnected = $state(false)

  $effect(() => {
    runs = data.runs
    if (data.initialDetail) {
      const id = data.initialDetail.run.id
      if (!selectedRunId) selectedRunId = id
      stepsByRun[id] = data.initialDetail.steps
      messagesByRun[id] = data.initialDetail.messages
    } else if (!selectedRunId && data.runs[0]) {
      selectedRunId = data.runs[0].id
    }
  })

  const activeStatuses = new Set(['queued', 'running', 'blocked'])
  const activeRuns = $derived(runs.filter((r) => activeStatuses.has(r.status)))
  const completedRuns = $derived(runs.filter((r) => !activeStatuses.has(r.status)))
  const selectedRun = $derived(runs.find((r) => r.id === selectedRunId) ?? null)
  const selectedSteps = $derived(selectedRunId ? (stepsByRun[selectedRunId] ?? []) : [])
  const selectedMessages = $derived(selectedRunId ? (messagesByRun[selectedRunId] ?? []) : [])

  async function hydrateRunDetail(runId: string): Promise<void> {
    try {
      const response = await fetch(`/v1/runs/${encodeURIComponent(runId)}`)
      if (!response.ok) return
      const detail = (await response.json()) as FlowRunDetail
      upsertRun(detail.run)
      stepsByRun[runId] = detail.steps
      messagesByRun[runId] = detail.messages
    } catch {
      // Ignore transient network errors while streaming.
    }
  }

  function upsertRun(updated: FlowRun): void {
    const idx = runs.findIndex((r) => r.id === updated.id)
    if (idx === -1) {
      runs = [updated, ...runs]
    } else {
      runs = runs.map((r, i) => (i === idx ? updated : r))
    }
    if (!selectedRunId) {
      selectedRunId = updated.id
    }
  }

  function upsertStep(runId: string, updated: FlowStep): void {
    const existing = stepsByRun[runId] ?? []
    const idx = existing.findIndex((s) => s.stepId === updated.stepId)
    if (idx === -1) {
      stepsByRun[runId] = [...existing, updated].sort((a, b) => a.seq - b.seq)
    } else {
      stepsByRun[runId] = existing.map((s, i) => (i === idx ? updated : s))
    }
  }

  function appendMessage(runId: string, msg: WorkerMessage): void {
    const existing = messagesByRun[runId] ?? []
    if (existing.some((m) => m.id === msg.id)) return
    messagesByRun[runId] = [...existing, msg]
  }

  async function selectRun(runId: string): Promise<void> {
    selectedRunId = runId
    if (!stepsByRun[runId]) {
      await hydrateRunDetail(runId)
    }
  }

  onMount(() => {
    const es = new EventSource('/v1/stream')
    es.onopen = () => {
      streamConnected = true
    }
    es.onerror = () => {
      streamConnected = false
    }

    es.addEventListener('run.updated', (raw) => {
      const payload = JSON.parse((raw as MessageEvent<string>).data) as {
        runId: string
        run: FlowRun
      }
      const isNew = !runs.some((r) => r.id === payload.runId)
      upsertRun(payload.run)
      if (isNew || !stepsByRun[payload.runId]) {
        void hydrateRunDetail(payload.runId)
      }
    })

    es.addEventListener('step.updated', (raw) => {
      const payload = JSON.parse((raw as MessageEvent<string>).data) as {
        runId: string
        step: FlowStep
      }
      upsertStep(payload.runId, payload.step)
    })

    es.addEventListener('worker.message', (raw) => {
      const payload = JSON.parse((raw as MessageEvent<string>).data) as {
        runId: string
        message: WorkerMessage
      }
      appendMessage(payload.runId, payload.message)
    })

    return () => {
      es.close()
    }
  })
</script>

<svelte:head>
  <title>Difflab Flows</title>
</svelte:head>

<div class="shell">
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark">difflab</span>
      <span class="brand-sep">/</span>
      <span class="brand-section">flows</span>
    </div>
    <div class="stream-badge" data-testid="sse-status" data-connected={streamConnected}>
      <span class="dot" class:live={streamConnected}></span>
      {streamConnected ? 'SSE live' : 'connecting'}
    </div>
  </header>

  <div class="workspace">
    <aside class="sidebar" data-testid="runs-sidebar">
      <section class="group">
        <h2>Active ({activeRuns.length})</h2>
        {#if activeRuns.length === 0}
          <p class="muted">No active workflow runs.</p>
        {:else}
          {#each activeRuns as run (run.id)}
            <button
              type="button"
              class="run-item"
              class:selected={selectedRunId === run.id}
              data-testid={`run-item-${run.id}`}
              onclick={() => selectRun(run.id)}
            >
              <div class="run-item-top">
                <span class="flow-name">{run.flowName}</span>
                <span class={`pill status-${run.status}`}>{run.status}</span>
              </div>
              <div class="run-id">{run.id}</div>
            </button>
          {/each}
        {/if}
      </section>

      <section class="group">
        <h2>Completed ({completedRuns.length})</h2>
        {#if completedRuns.length === 0}
          <p class="muted">No completed runs yet.</p>
        {:else}
          {#each completedRuns as run (run.id)}
            <button
              type="button"
              class="run-item"
              class:selected={selectedRunId === run.id}
              data-testid={`run-item-${run.id}`}
              onclick={() => selectRun(run.id)}
            >
              <div class="run-item-top">
                <span class="flow-name">{run.flowName}</span>
                <span class={`pill status-${run.status}`}>{run.status}</span>
              </div>
              <div class="run-id">{run.id}</div>
            </button>
          {/each}
        {/if}
      </section>
    </aside>

    <main class="detail" data-testid="run-detail">
      {#if !selectedRun}
        <div class="empty-state">
          <h1>No workflow run selected</h1>
          <p>
            Trigger a Linear Ready task or run <code
              >difflab flows run autoreview --flag --local</code
            >.
          </p>
        </div>
      {:else}
        <section class="run-header">
          <div class="title-row">
            <div>
              <h1 data-testid="selected-flow-name">{selectedRun.flowName}</h1>
              <div class="mono sub" data-testid="selected-run-id">{selectedRun.id}</div>
            </div>
            <span
              class={`pill pill-lg status-${selectedRun.status}`}
              data-testid="selected-run-status"
            >
              {selectedRun.status}
            </span>
          </div>

          <div class="badges" data-testid="herdr-badges">
            <span class="badge">harness: {selectedRun.harness}</span>
            {#if selectedRun.herdrSession}
              <span class="badge badge-herdr" data-testid="herdr-session-badge">
                herdr session: {selectedRun.herdrSession}
              </span>
            {/if}
            {#if selectedRun.herdrPaneId}
              <span class="badge badge-herdr" data-testid="herdr-pane-badge">
                pane: {selectedRun.herdrPaneId}
              </span>
            {/if}
            {#if selectedRun.herdrAgentName}
              <span class="badge badge-herdr" data-testid="herdr-agent-badge">
                agent: {selectedRun.herdrAgentName}
              </span>
            {/if}
            {#if selectedRun.triggerKey}
              <span class="badge">trigger: {selectedRun.triggerKey}</span>
            {/if}
            {#if selectedRun.commitSha}
              <span class="badge mono">commit: {selectedRun.commitSha.slice(0, 8)}</span>
            {/if}
          </div>

          {#if selectedRun.worktreePath}
            <div class="meta-line mono">worktree: {selectedRun.worktreePath}</div>
          {/if}
        </section>

        <div class="panels">
          <section class="panel" data-testid="steps-panel">
            <h2>Steps ({selectedSteps.length})</h2>
            <ol class="step-list">
              {#each selectedSteps as step (step.id)}
                <li class="step-card" data-testid={`step-${step.stepId}`} data-status={step.status}>
                  <div class="step-row">
                    <span class="step-title">
                      <span class="mono">{step.seq}.</span>
                      {step.stepId}
                    </span>
                    <div class="step-meta">
                      {#if step.harness}
                        <span class="badge">{step.harness}</span>
                      {/if}
                      <span class={`pill status-${step.status}`}>{step.status}</span>
                    </div>
                  </div>
                  {#if step.summary}
                    <div class="step-summary">{step.summary}</div>
                  {/if}
                  {#if step.handoff}
                    <div class="step-handoff mono">{step.handoff}</div>
                  {/if}
                </li>
              {/each}
            </ol>
          </section>

          <section class="panel" data-testid="messages-panel">
            <h2>Worker activity ({selectedMessages.length})</h2>
            {#if selectedMessages.length === 0}
              <p class="muted">Waiting for step messages...</p>
            {:else}
              <ul class="log-list">
                {#each selectedMessages as msg (msg.id)}
                  <li class={`log-line level-${msg.level}`}>
                    <span class="log-meta mono">
                      [{msg.level}]{msg.stepId ? ` ${msg.stepId}:` : ''}
                    </span>
                    <span>{msg.message}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        </div>
      {/if}
    </main>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
    background: #0b0f17;
    color: #e5e7eb;
  }

  .shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    border-bottom: 1px solid #1f2937;
    background: #111827;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 15px;
  }

  .brand-mark {
    color: #f9fafb;
  }

  .brand-sep {
    color: #4b5563;
  }

  .brand-section {
    color: #93c5fd;
  }

  .stream-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 999px;
    background: #1f2937;
    color: #d1d5db;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #6b7280;
  }

  .dot.live {
    background: #10b981;
  }

  .workspace {
    display: grid;
    grid-template-columns: 280px 1fr;
    flex: 1;
  }

  .sidebar {
    border-right: 1px solid #1f2937;
    padding: 16px;
    background: #0f1522;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .group h2,
  .panel h2 {
    margin: 0 0 10px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #9ca3af;
  }

  .run-item {
    width: 100%;
    text-align: left;
    background: #141c2c;
    border: 1px solid #1f2937;
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 8px;
    color: inherit;
    cursor: pointer;
  }

  .run-item.selected {
    border-color: #3b82f6;
    background: #172554;
  }

  .run-item-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .flow-name {
    font-weight: 600;
    font-size: 14px;
  }

  .run-id {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    color: #9ca3af;
    margin-top: 4px;
  }

  .detail {
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .empty-state {
    margin: auto;
    text-align: center;
    color: #9ca3af;
  }

  .run-header {
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 10px;
    padding: 16px 18px;
  }

  .title-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .title-row h1 {
    margin: 0;
    font-size: 20px;
  }

  .sub {
    color: #9ca3af;
    font-size: 12px;
    margin-top: 4px;
  }

  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }

  .badge {
    font-size: 12px;
    padding: 3px 8px;
    border-radius: 6px;
    background: #1f2937;
    color: #d1d5db;
    border: 1px solid #374151;
  }

  .badge-herdr {
    background: #064e3b;
    border-color: #059669;
    color: #d1fae5;
  }

  .meta-line {
    margin-top: 10px;
    font-size: 12px;
    color: #9ca3af;
  }

  .panels {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .panel {
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 10px;
    padding: 16px;
  }

  .step-list,
  .log-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .step-card {
    padding: 10px 12px;
    border-radius: 8px;
    background: #0f172a;
    border: 1px solid #1e293b;
  }

  .step-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .step-title {
    font-weight: 500;
    font-size: 14px;
  }

  .step-meta {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .step-summary {
    margin-top: 6px;
    font-size: 12px;
    color: #cbd5e1;
  }

  .step-handoff {
    margin-top: 6px;
    font-size: 11px;
    color: #93c5fd;
    word-break: break-all;
  }

  .log-line {
    font-size: 12px;
    padding: 6px 8px;
    border-radius: 6px;
    background: #0f172a;
    border-left: 3px solid #475569;
  }

  .log-line.level-done {
    border-left-color: #10b981;
  }

  .log-line.level-error,
  .log-line.level-blocker {
    border-left-color: #ef4444;
  }

  .log-meta {
    color: #94a3b8;
    margin-right: 6px;
  }

  .pill {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
    text-transform: uppercase;
  }

  .pill-lg {
    font-size: 12px;
    padding: 4px 10px;
  }

  .status-queued,
  .status-pending {
    background: #374151;
    color: #e5e7eb;
  }

  .status-running {
    background: #1d4ed8;
    color: #dbeafe;
  }

  .status-done {
    background: #065f46;
    color: #d1fae5;
  }

  .status-failed,
  .status-blocked {
    background: #7f1d1d;
    color: #fee2e2;
  }

  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .muted {
    font-size: 12px;
    color: #6b7280;
    margin: 0;
  }
</style>
