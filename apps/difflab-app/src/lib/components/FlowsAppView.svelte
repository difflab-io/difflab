<script lang="ts">
  import type { FlowRun, FlowStep, WorkerMessage } from 'difflab-db'
  import { Cpu, FolderGit2, GitCommitHorizontal, Terminal } from 'lucide-svelte'
  import { FlowDagGraph, StatusPill } from 'ui'

  // Types ---------------------------------------------------------------------
  interface Props {
    projectId: string | null
    projectName: string | null
    runs: FlowRun[]
    allRunsCount: number
    showAllProjects: boolean
    searchQuery: string
    selectedRun: FlowRun | null
    selectedSteps: FlowStep[]
    selectedMessages: WorkerMessage[]
    repoLabels: Record<string, string>
    onToggleShowAll: (next: boolean) => void
    onSelectRun: (runId: string) => void
  }

  // API -----------------------------------------------------------------------
  let {
    projectId,
    projectName,
    runs,
    allRunsCount,
    showAllProjects,
    searchQuery,
    selectedRun,
    selectedSteps,
    selectedMessages,
    repoLabels,
    onToggleShowAll,
    onSelectRun,
  }: Props = $props()

  let selectedStepId = $state<string | null>(null)

  $effect(() => {
    const runId = selectedRun?.id
    if (runId) {
      selectedStepId = null
    }
  })

  const activeStatuses = new Set(['queued', 'running', 'blocked'])

  const filteredRuns = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return runs
    return runs.filter(
      (r) =>
        r.flowName.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (repoLabels[r.repoId] ?? '').toLowerCase().includes(q) ||
        (r.triggerKey ?? '').toLowerCase().includes(q),
    )
  })

  const activeRuns = $derived(filteredRuns.filter((r) => activeStatuses.has(r.status)))
  const completedRuns = $derived(filteredRuns.filter((r) => !activeStatuses.has(r.status)))

  const visibleMessages = $derived(
    selectedStepId ? selectedMessages.filter((m) => m.stepId === selectedStepId) : selectedMessages,
  )

  // Helpers -------------------------------------------------------------------
  function formatLogTime(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleTimeString(undefined, {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }
</script>

<div class="flex min-h-0 flex-1 overflow-hidden">
  <!-- Contextual Sidebar: Active then Completed Runs -->
  <aside
    data-testid="runs-sidebar"
    class="flex w-68 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
  >
    <div class="flex items-center justify-between gap-1.5 border-b border-sidebar-border px-3 py-2">
      <span class="truncate text-xs font-semibold text-foreground">
        {showAllProjects ? 'All Flows' : `${projectName ?? projectId ?? 'Project'} Flows`}
      </span>
      {#if (projectId && allRunsCount > runs.length) || showAllProjects}
        <div class="inline-flex rounded-md border border-border bg-background p-0.5 text-[10px]">
          <button
            type="button"
            class={[
              'rounded-xs px-1.5 py-0.5 font-medium transition-colors',
              !showAllProjects ? 'bg-accent text-foreground' : 'text-muted-foreground',
            ].join(' ')}
            onclick={() => onToggleShowAll(false)}
          >
            {projectId ?? 'Project'}
          </button>
          <button
            type="button"
            class={[
              'rounded-xs px-1.5 py-0.5 font-medium transition-colors',
              showAllProjects ? 'bg-accent text-foreground' : 'text-muted-foreground',
            ].join(' ')}
            onclick={() => onToggleShowAll(true)}
          >
            All ({allRunsCount})
          </button>
        </div>
      {/if}
    </div>

    <div class="flex-1 overflow-y-auto px-2.5 py-3">
      <!-- Active Section -->
      <section class="mb-4">
        <div class="mb-1.5 flex items-center justify-between px-1">
          <h2 class="m-0 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Active ({activeRuns.length})
          </h2>
        </div>
        {#if activeRuns.length === 0}
          <p class="m-0 px-1.5 py-1.5 text-xs text-muted-foreground">No active workflow runs.</p>
        {:else}
          <div class="flex flex-col gap-1">
            {#each activeRuns as run (run.id)}
              {@const selected = selectedRun?.id === run.id}
              <button
                type="button"
                data-testid={`run-item-${run.id}`}
                class={[
                  'flex w-full flex-col gap-1 rounded-md border px-2.5 py-2 text-left transition-colors',
                  selected
                    ? 'border-[var(--info)] bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'border-transparent bg-transparent hover:bg-sidebar-accent/60',
                ].join(' ')}
                onclick={() => onSelectRun(run.id)}
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate text-xs font-semibold text-foreground">{run.flowName}</span>
                  <StatusPill status={run.status} size="xs" />
                </div>
                {#if repoLabels[run.repoId]}
                  <div class="truncate text-[11px] text-[var(--info)]">
                    {repoLabels[run.repoId]}
                  </div>
                {/if}
                <div class="truncate font-mono text-[10px] text-muted-foreground">{run.id}</div>
              </button>
            {/each}
          </div>
        {/if}
      </section>

      <!-- Completed Section -->
      <section>
        <div class="mb-1.5 flex items-center justify-between px-1">
          <h2 class="m-0 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Completed ({completedRuns.length})
          </h2>
        </div>
        {#if completedRuns.length === 0}
          <p class="m-0 px-1.5 py-1.5 text-xs text-muted-foreground">No completed runs yet.</p>
        {:else}
          <div class="flex flex-col gap-1">
            {#each completedRuns as run (run.id)}
              {@const selected = selectedRun?.id === run.id}
              <button
                type="button"
                data-testid={`run-item-${run.id}`}
                class={[
                  'flex w-full flex-col gap-1 rounded-md border px-2.5 py-2 text-left transition-colors',
                  selected
                    ? 'border-border bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'border-transparent bg-transparent hover:bg-sidebar-accent/60',
                ].join(' ')}
                onclick={() => onSelectRun(run.id)}
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate text-xs font-medium text-foreground">{run.flowName}</span>
                  <StatusPill status={run.status} size="xs" />
                </div>
                {#if repoLabels[run.repoId]}
                  <div class="truncate text-[11px] text-muted-foreground">
                    {repoLabels[run.repoId]}
                  </div>
                {/if}
                <div class="truncate font-mono text-[10px] text-muted-foreground/80">{run.id}</div>
              </button>
            {/each}
          </div>
        {/if}
      </section>
    </div>
  </aside>

  <!-- Main Detail Pane -->
  <main data-testid="run-detail" class="flex-1 overflow-y-auto bg-background px-6 py-5">
    {#if !selectedRun}
      <div class="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">
        <h1 class="m-0 text-base font-semibold text-foreground">No workflow run selected</h1>
        <p class="mt-1.5 text-xs text-muted-foreground">
          Trigger a Linear Ready task or run
          <code class="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-foreground">
            difflab flows run autoreview --flag --local
          </code>.
        </p>
      </div>
    {:else}
      <div class="mx-auto flex max-w-6xl flex-col gap-4">
        <!-- Page Header: Run Name + Live Status Beside Title + Herdr Metadata -->
        <section class="rounded-lg border border-border bg-card p-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-wrap items-center gap-2.5">
              <h1
                data-testid="selected-flow-name"
                class="m-0 text-lg font-semibold tracking-tight text-foreground"
              >
                {selectedRun.flowName}
              </h1>
              <StatusPill status={selectedRun.status} size="md" testId="selected-run-status" />
            </div>
            <span data-testid="selected-run-id" class="font-mono text-xs text-muted-foreground">
              {selectedRun.id}
            </span>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-1.5" data-testid="herdr-badges">
            {#if repoLabels[selectedRun.repoId]}
              <span
                class="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-[11px] text-foreground"
              >
                <FolderGit2 size={11} strokeWidth={1.6} class="text-muted-foreground" />
                {repoLabels[selectedRun.repoId]}
              </span>
            {/if}
            <span
              class="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
            >
              <Cpu size={11} strokeWidth={1.6} />
              harness: {selectedRun.harness}
            </span>
            {#if selectedRun.herdrSession}
              <StatusPill
                status={`herdr session: ${selectedRun.herdrSession}`}
                tone="success"
                size="xs"
                testId="herdr-session-badge"
              />
            {/if}
            {#if selectedRun.herdrPaneId}
              <StatusPill
                status={`pane: ${selectedRun.herdrPaneId}`}
                tone="success"
                size="xs"
                testId="herdr-pane-badge"
              />
            {/if}
            {#if selectedRun.herdrAgentName}
              <StatusPill
                status={`agent: ${selectedRun.herdrAgentName}`}
                tone="success"
                size="xs"
                testId="herdr-agent-badge"
              />
            {/if}
            {#if selectedRun.triggerKey}
              <span
                class="inline-flex items-center rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
              >
                trigger: {selectedRun.triggerKey}
              </span>
            {/if}
            {#if selectedRun.commitSha}
              <span
                class="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-[11px] text-foreground"
              >
                <GitCommitHorizontal size={12} strokeWidth={1.6} class="text-muted-foreground" />
                {selectedRun.commitSha.slice(0, 8)}
              </span>
            {/if}
          </div>

          {#if selectedRun.worktreePath}
            <div class="mt-2 truncate font-mono text-[11px] text-muted-foreground">
              worktree: {selectedRun.worktreePath}
            </div>
          {/if}
        </section>

        <!-- Directed Acyclic Task Graph -->
        <FlowDagGraph
          steps={selectedSteps}
          {selectedStepId}
          onSelectStep={(stepId) => {
            selectedStepId = stepId
          }}
        />

        <!-- Step & Worker Logs -->
        <section
          data-testid="messages-panel"
          class="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
        >
          <div
            class="flex items-center justify-between gap-2 border-b border-border bg-secondary/40 px-3.5 py-2"
          >
            <div class="flex items-center gap-2">
              <Terminal size={13} strokeWidth={1.6} class="text-muted-foreground" />
              <h2 class="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Step &amp; worker logs ({visibleMessages.length})
              </h2>
            </div>
            {#if selectedStepId}
              <button
                type="button"
                class="text-[11px] font-medium text-[var(--info)] hover:underline"
                onclick={() => {
                  selectedStepId = null
                }}
              >
                Show all ({selectedMessages.length})
              </button>
            {/if}
          </div>

          {#if visibleMessages.length === 0}
            <p class="m-0 px-4 py-5 text-xs text-muted-foreground">
              {selectedStepId
                ? `No log messages tagged specifically for step "${selectedStepId}".`
                : 'Waiting for step messages...'}
            </p>
          {:else}
            <ul
              class="m-0 flex max-h-96 list-none flex-col divide-y divide-border/50 overflow-y-auto p-0 font-mono text-xs"
            >
              {#each visibleMessages as msg (msg.id)}
                <li
                  class={[
                    'flex items-start gap-2.5 border-l-2 px-3.5 py-2 leading-relaxed',
                    msg.level === 'done'
                      ? 'border-l-[var(--success)] bg-[color-mix(in_oklab,var(--success)_4%,transparent)]'
                      : msg.level === 'error' || msg.level === 'blocker'
                        ? 'border-l-[var(--danger)] bg-[color-mix(in_oklab,var(--danger)_6%,transparent)]'
                        : 'border-l-border',
                  ].join(' ')}
                >
                  <span class="shrink-0 text-[11px] text-muted-foreground">
                    {formatLogTime(msg.createdAt)}
                  </span>
                  <span
                    class={[
                      'shrink-0 uppercase text-[10px] font-semibold',
                      msg.level === 'done'
                        ? 'text-[var(--success)]'
                        : msg.level === 'error' || msg.level === 'blocker'
                          ? 'text-[var(--danger)]'
                          : 'text-muted-foreground',
                    ].join(' ')}
                  >
                    [{msg.level}]
                  </span>
                  {#if msg.stepId}
                    <span
                      class="shrink-0 rounded bg-secondary px-1.5 py-0 text-[10px] text-[var(--info)]"
                    >
                      {msg.stepId}
                    </span>
                  {/if}
                  <span class="min-w-0 flex-1 break-words text-foreground">{msg.message}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      </div>
    {/if}
  </main>
</div>
