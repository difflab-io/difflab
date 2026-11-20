import { create } from '@bufbuild/protobuf'
import type { GitRemote } from 'difflab-db'
import type { DTO } from 'utils/dto'
import {
  RepositorySchema,
  type Repository as ProtoRepository,
} from '../gen/difflab/v1/project_pb.js'

// API -------------------------------------------------------------------------
/** Protobuf contract mapper for `GitRemote` entities. */
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
