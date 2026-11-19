import { create } from '@bufbuild/protobuf'
import { Code, ConnectError, type HandlerContext, type ServiceImpl } from '@connectrpc/connect'
import {
  ProjectConflictError,
  ProjectNotFoundError,
  ProjectValidationError,
  type DifflabDb,
  type Project as DomainProject,
  type Repository as DomainRepository,
} from 'difflab-db'
import { kActor } from '../context.js'
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

// API -------------------------------------------------------------------------
export function createProjectServiceImpl(db: DifflabDb): ServiceImpl<typeof ProjectService> {
  return {
    async createProject(req, context: HandlerContext) {
      const actor = context.values.get(kActor)
      const project = await withDomainErrors(() =>
        db.projects.createProject(req.key, req.name, req.repositoryUrls, actor),
      )
      return create(CreateProjectResponseSchema, {
        project: toProtoProject(project),
      })
    },

    async listProjects(_req, context: HandlerContext) {
      const actor = context.values.get(kActor)
      const projects = await withDomainErrors(() => db.projects.listProjects(actor))
      return create(ListProjectsResponseSchema, {
        projects: projects.map(toProtoProject),
      })
    },

    async getProject(req, context: HandlerContext) {
      const actor = context.values.get(kActor)
      const project = await withDomainErrors(() => db.projects.getProjectById(req.key, actor))
      return create(GetProjectResponseSchema, {
        project: toProtoProject(project),
      })
    },

    async linkRepository(req, context: HandlerContext) {
      const actor = context.values.get(kActor)
      const repository = await withDomainErrors(() =>
        db.repositories.linkRepositoryToProject(req.projectKey, req.remoteUrl, actor),
      )
      return create(LinkRepositoryResponseSchema, {
        repository: toProtoRepository(repository, actor.workspaceId),
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
    repositories: project.repositories.map((repo) => toProtoRepository(repo, project.workspaceId)),
    createdAt: project.createdAt,
    updatedAt: project.createdAt,
  })
}

function toProtoRepository(repository: DomainRepository, workspaceId: string): ProtoRepository {
  return create(RepositorySchema, {
    id: repository.id,
    workspaceId,
    projectKey: repository.projectId,
    remoteUrl: repository.url,
    slug: repository.slug,
    createdAt: repository.createdAt,
  })
}
