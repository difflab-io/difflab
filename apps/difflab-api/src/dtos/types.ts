import type { DescMessage, MessageInitShape, MessageShape } from '@bufbuild/protobuf'

// Types -----------------------------------------------------------------------
export type DTO<TDomain, TDesc extends DescMessage, TContext = void> = {
  readonly schema: TDesc
  toProto: TContext extends void
    ? (domain: TDomain) => MessageShape<TDesc>
    : (domain: TDomain, context: TContext) => MessageShape<TDesc>
  fromProto: (proto: MessageShape<TDesc> | MessageInitShape<TDesc>) => TDomain
}
