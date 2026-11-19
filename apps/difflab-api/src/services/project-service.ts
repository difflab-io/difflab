import { create } from '@bufbuild/protobuf'
import { Code, ConnectError, type HandlerContext, type ServiceImpl } from '@connectrpc/connect'
import {
  ProjectConflictError,
  ProjectNotFoundError,
  ProjectValidationError,
  type DifflabDb,
  type GitRemote,
  type Project as DomainProject,
} from 'difflab-db'
import {
  CreateProjectResponseSchema,
  GetProjectResponseSchema,
  LinkRepositoryResponseSchema,
  ListProjectsResponseSchema,
  ProjectSchema,
  ProjectService,
  RepositorySchema,
  type Project as ProtoProject,
  type Repository as ProtoRepository,
} from '../gen/difflab/v1/project_pb.js'
import type { AuthService } from './auth-service.js'

// Types -----------------------------------------------------------------------
export type ProjectServiceDeps = {
  db: DifflabDb
  authService: AuthService
}

// API -------------------------------------------------------------------------
export function createProjectServiceImpl({
  db,
  authService,
}: ProjectServiceDeps): ServiceImpl<typeof ProjectService> {
  return {
    async createProject(req, context: HandlerContext) {
      const actor = authService.resolveActor(context)
      const project = await withDomainErrors(() =>
        db.projects.createProject(req.key, req.name, req.repositoryUrls, actor),
      )
      return create(CreateProjectResponseSchema, {
        project: toProtoProject(project),
      })
    },

    async listProjects(_req, context: HandlerContext) {
      const actor = authService.resolveActor(context)
      const projects = await withDomainErrors(() => db.projects.listProjects(actor))
      return create(ListProjectsResponseSchema, {
        projects: projects.map(toProtoProject),
      })
    },

    async getProject(req, context: HandlerContext) {
      const actor = authService.resolveActor(context)
      const project = await withDomainErrors(() => db.projects.getProjectById(req.key, actor))
      return create(GetProjectResponseSchema, {
        project: toProtoProject(project),
      })
    },

    async linkRepository(req, context: HandlerContext) {
      const actor = authService.resolveActor(context)
      const gitRemote = await withDomainErrors(() =>
        db.gitRemotes.linkGitRemoteToProject(req.projectKey, req.remoteUrl, actor),
      )
      return create(LinkRepositoryResponseSchema, {
        repository: toProtoRepository(gitRemote, actor.workspaceId),
      })
    },
  }
}

// Helpers ---------------------------------------------------------------------
async function withDomainErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof ConnectError) throw error
    if (error instanceof ProjectValidationError) {
      throw new ConnectError(error.message, Code.InvalidArgument, undefined, undefined, error)
    }
    if (error instanceof ProjectNotFoundError) {
      throw new ConnectError(error.message, Code.NotFound, undefined, undefined, error)
    }
    if (error instanceof ProjectConflictError) {
      throw new ConnectError(error.message, Code.AlreadyExists, undefined, undefined, error)
    }
    throw error
  }
}

function toProtoProject(project: DomainProject): ProtoProject {
  return create(ProjectSchema, {
    workspaceId: project.workspaceId,
    key: project.id,
    name: project.name,
    repositories: project.gitRemotes.map((remote) =>
      toProtoRepository(remote, project.workspaceId),
    ),
    createdAt: project.createdAt,
    updatedAt: project.createdAt,
  })
}

function toProtoRepository(remote: GitRemote, workspaceId: string): ProtoRepository {
  return create(RepositorySchema, {
    id: remote.id,
    workspaceId,
    projectKey: remote.projectId,
    remoteUrl: remote.url,
    slug: remote.slug,
    createdAt: remote.createdAt,
  })
}
