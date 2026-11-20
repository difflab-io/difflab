import { create } from '@bufbuild/protobuf'
import type { ProjectWithRemotes } from 'difflab-db'
import type { DTO } from 'utils/dto'
import { ProjectSchema, type Project as ProtoProject } from '../gen/difflab/v1/project_pb.js'
import { GitRemoteDTO } from './git-remote.js'

// API -------------------------------------------------------------------------
/** Protobuf contract mapper for `ProjectWithRemotes` models. */
export const ProjectDTO: DTO<ProjectWithRemotes, typeof ProjectSchema> = {
  schema: ProjectSchema,
  toProto(project: ProjectWithRemotes): ProtoProject {
    return create(ProjectSchema, {
      workspaceId: project.workspaceId,
      key: project.key,
      name: project.name,
      repositories: project.gitRemotes.map((remote) => GitRemoteDTO.toProto(remote)),
      createdAt: project.createdAt,
      updatedAt: project.createdAt,
    })
  },
  fromProto(proto): ProjectWithRemotes {
    return {
      id: '',
      key: proto.key ?? '',
      name: proto.name ?? '',
      workspaceId: proto.workspaceId ?? '',
      createdByUserId: null,
      createdAt: proto.createdAt ?? '',
      gitRemotes: (proto.repositories ?? []).map((repo) => GitRemoteDTO.fromProto(repo)),
    }
  },
}
