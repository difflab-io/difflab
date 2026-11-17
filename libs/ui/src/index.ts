// API -------------------------------------------------------------------------
export { default as ThemeToggle } from './theme-toggle/ThemeToggle.svelte'
export { ThemeService } from './theme-toggle/themeService.svelte.js'
export { themeToggleVariants, type ThemeToggleVariants } from './theme-toggle/styles.js'
export type {
  ResolvedThemeMode,
  ThemePreference,
  ThemeServiceOptions,
  ThemeToggleProps,
} from './theme-toggle/types.js'

export { default as StatusPill } from './status-pill/StatusPill.svelte'
export {
  inferStatusTone,
  statusPillVariants,
  type StatusPillVariants,
} from './status-pill/styles.js'
export type { StatusPillProps, StatusTone } from './status-pill/types.js'

export { default as AppRail } from './app-rail/AppRail.svelte'
export { appRailButtonVariants, type AppRailButtonVariants } from './app-rail/styles.js'
export type { AppRailItem, AppRailProps, DifflabAppId } from './app-rail/types.js'

export { default as ProjectSelector } from './project-selector/ProjectSelector.svelte'
export { projectKeyPillVariants, type ProjectKeyPillVariants } from './project-selector/styles.js'
export type { ProjectSelectorOption, ProjectSelectorProps } from './project-selector/types.js'

export { default as RepoComponentGraph } from './repo-graph/RepoComponentGraph.svelte'
export {
  componentChipVariants,
  repoGraphRowVariants,
  repoNodeBoxVariants,
  type RepoGraphRowVariants,
} from './repo-graph/styles.js'
export type {
  ComponentTaxonomyKind,
  RepoComponentGraphProps,
  RepoComponentNode,
  RepositoryGraphRow,
} from './repo-graph/types.js'

export { default as FlowDagGraph } from './flow-dag/FlowDagGraph.svelte'
export { flowDagNodeVariants, type FlowDagNodeVariants } from './flow-dag/styles.js'
export type { FlowDagGraphProps, FlowDagStepNode } from './flow-dag/types.js'

export { default as MarkdownDocument } from './markdown-view/MarkdownDocument.svelte'
export { segmentMarkdown } from './markdown-view/parser.js'
export type { MarkdownDocumentProps, MarkdownSegment } from './markdown-view/types.js'
