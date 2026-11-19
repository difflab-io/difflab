import { create } from '@bufbuild/protobuf'
import { Code, ConnectError, type HandlerContext, type ServiceImpl } from '@connectrpc/connect'
import {
  ProjectConflictError,
  ProjectNotFoundError,
  ProjectValidationError,
  type DifflabDb,
} from 'difflab-db'
import { annotateWideEvent } from 'utils/logx'
import { GitRemoteDTO, ProjectDTO } from '../dtos/index.js'
import {
  CreateProjectResponseSchema,
  GetProjectResponseSchema,
  LinkRepositoryResponseSchema,
  ListProjectsResponseSchema,
  ProjectService,
} from '../gen/difflab/v1/project_pb.js'
import type { AuthService } from './auth-service.js'

// Types -----------------------------------------------------------------------
export type ProjectServiceDeps = {
  db: DifflabDb
  authService: AuthService
}

// API -------------------------------------------------------------------------
export class ProjectRpcService implements ServiceImpl<typeof ProjectService> {
  constructor(
    private readonly db: DifflabDb,
    private readonly authService: AuthService,
  ) {}

  async createProject(
    req: { key: string; name: string; repositoryUrls: string[] },
    context: HandlerContext,
  ) {
    const actor = this.authService.requireActor(context)
    annotateWideEvent({ rpc_method: 'CreateProject', project_key: req.key })
    const project = await withDomainErrors(() =>
      this.db.projects.createProject(req.key, req.name, req.repositoryUrls, actor),
    )
    return create(CreateProjectResponseSchema, {
      project: ProjectDTO.toProto(project),
    })
  }

  async listProjects(_req: unknown, context: HandlerContext) {
    const actor = this.authService.requireActor(context)
    annotateWideEvent({ rpc_method: 'ListProjects' })
    const projects = await withDomainErrors(() => this.db.projects.listProjects(actor))
    return create(ListProjectsResponseSchema, {
      projects: projects.map((project) => ProjectDTO.toProto(project)),
    })
  }

  async getProject(req: { key: string }, context: HandlerContext) {
    const actor = this.authService.requireActor(context)
    annotateWideEvent({ rpc_method: 'GetProject', project_key: req.key })
    const project = await withDomainErrors(() => this.db.projects.getProjectById(req.key, actor))
    return create(GetProjectResponseSchema, {
      project: ProjectDTO.toProto(project),
    })
  }

  async linkRepository(req: { projectKey: string; remoteUrl: string }, context: HandlerContext) {
    const actor = this.authService.requireActor(context)
    annotateWideEvent({ rpc_method: 'LinkRepository', project_key: req.projectKey })
    const gitRemote = await withDomainErrors(() =>
      this.db.gitRemotes.linkGitRemoteToProject(req.projectKey, req.remoteUrl, actor),
    )
    return create(LinkRepositoryResponseSchema, {
      repository: GitRemoteDTO.toProto(gitRemote, { workspaceId: actor.workspaceId }),
    })
  }
}

export function createProjectServiceImpl({
  db,
  authService,
}: ProjectServiceDeps): ServiceImpl<typeof ProjectService> {
  return new ProjectRpcService(db, authService)
}

// Helpers ---------------------------------------------------------------------
async function withDomainErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof ConnectError) throw error
    if (error instanceof ProjectValidationError) {
      annotateWideEvent({ error_code: 'invalid_argument' })
      throw new ConnectError(error.message, Code.InvalidArgument, undefined, undefined, error)
    }
    if (error instanceof ProjectNotFoundError) {
      annotateWideEvent({ error_code: 'not_found' })
      throw new ConnectError(error.message, Code.NotFound, undefined, undefined, error)
    }
    if (error instanceof ProjectConflictError) {
      annotateWideEvent({ error_code: 'already_exists' })
      throw new ConnectError(error.message, Code.AlreadyExists, undefined, undefined, error)
    }
    throw error
  }
}
