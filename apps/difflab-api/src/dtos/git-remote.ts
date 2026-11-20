import { create } from '@bufbuild/protobuf'
import type { GitRemote } from 'difflab-db'
import type { DTO } from 'utils/dto'
import {
  RepositorySchema,
  type Repository as ProtoRepository,
} from '../gen/difflab/v1/project_pb.js'

// API -------------------------------------------------------------------------
/** Protobuf contract mapper for `GitRemote` models. */
export const GitRemoteDTO: DTO<GitRemote, typeof RepositorySchema> = {
  schema: RepositorySchema,
  toProto(remote: GitRemote): ProtoRepository {
    return create(RepositorySchema, {
      id: remote.id,
      workspaceId: remote.workspaceId,
      projectKey: remote.projectKey,
      remoteUrl: remote.remoteUrl,
      slug: remote.slug,
      createdAt: remote.createdAt,
    })
  },
  fromProto(proto): GitRemote {
    return {
      id: proto.id ?? '',
      workspaceId: proto.workspaceId ?? '',
      projectId: '',
      projectKey: proto.projectKey ?? '',
      remoteUrl: proto.remoteUrl ?? '',
      slug: proto.slug ?? '',
      createdByUserId: null,
      createdAt: proto.createdAt ?? '',
    }
  },
}
