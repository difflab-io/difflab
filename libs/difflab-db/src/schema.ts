// Types -----------------------------------------------------------------------
export type RunStatus = 'queued' | 'running' | 'blocked' | 'done' | 'failed'
export type StepStatus = 'pending' | 'running' | 'done' | 'failed'
export type WorkerMessageLevel = 'info' | 'blocker' | 'done' | 'error'

export interface ProjectDatabase {
  projects: { key: string; name: string }
  repositories: {
    id: string
    project_key: string
    github_url: string
    slug: string
    local_path: string | null
  }
  runs: {
    id: string
    repo_id: string
    flow_name: string
    trigger_key: string | null
    status: RunStatus
    harness: string
    worktree_path: string | null
    store_flow_dir: string
    herdr_session: string | null
    herdr_pane_id: string | null
    herdr_agent_name: string | null
    commit_sha: string | null
    created_at: string
    updated_at: string
  }
  steps: {
    id: string
    run_id: string
    step_id: string
    seq: number
    status: StepStatus
    harness: string | null
    handoff: string | null
    summary: string | null
    started_at: string | null
    finished_at: string | null
  }
  worker_messages: {
    id: string
    run_id: string
    step_id: string | null
    level: WorkerMessageLevel
    message: string
    created_at: string
  }
}
