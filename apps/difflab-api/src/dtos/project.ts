import { create } from '@bufbuild/protobuf'
import type { GitRemote, Project as DomainProject } from 'difflab-db'
import {
  ProjectSchema,
  RepositorySchema,
  type Project as ProtoProject,
  type Repository as ProtoRepository,
} from '../gen/difflab/v1/project_pb.js'
import type { DTO } from './types.js'

// API -------------------------------------------------------------------------
export const GitRemoteDTO: DTO<GitRemote, typeof RepositorySchema, { workspaceId: string }> = {
  schema: RepositorySchema,
  toProto(remote: GitRemote, context: { workspaceId: string }): ProtoRepository {
    return create(RepositorySchema, {
      id: remote.id,
      workspaceId: context.workspaceId,
      projectKey: remote.projectId,
      remoteUrl: remote.url,
      slug: remote.slug,
      createdAt: remote.createdAt,
    })
  },
  fromProto(proto): GitRemote {
    return {
      id: proto.id ?? '',
      projectId: proto.projectKey ?? '',
      url: proto.remoteUrl ?? '',
      slug: proto.slug ?? '',
      createdAt: proto.createdAt ?? '',
    }
  },
}

export const ProjectDTO: DTO<DomainProject, typeof ProjectSchema> = {
  schema: ProjectSchema,
  toProto(project: DomainProject): ProtoProject {
    return create(ProjectSchema, {
      workspaceId: project.workspaceId,
      key: project.id,
      name: project.name,
      repositories: project.gitRemotes.map((remote) =>
        GitRemoteDTO.toProto(remote, { workspaceId: project.workspaceId }),
      ),
      createdAt: project.createdAt,
      updatedAt: project.createdAt,
    })
  },
  fromProto(proto): DomainProject {
    return {
      id: proto.key ?? '',
      name: proto.name ?? '',
      workspaceId: proto.workspaceId ?? '',
      createdByUserId: null,
      createdAt: proto.createdAt ?? '',
      gitRemotes: (proto.repositories ?? []).map((repo) => GitRemoteDTO.fromProto(repo)),
    }
  },
}
