export interface ProjectDatabase {
  projects: { key: string; name: string }
  repositories: { id: string; project_key: string; github_url: string; slug: string }
}
