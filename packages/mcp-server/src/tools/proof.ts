import type { ProofActionInput, ProofHelper } from '../proof-helper'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ok } from './shared'

const proofActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('call_action'),
    name: z.string(),
    args: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('advance_frames'),
    count: z.number(),
  }),
  z.object({
    type: z.literal('click'),
    selector: z.string(),
  }),
  z.object({
    type: z.literal('press'),
    key: z.string(),
  }),
  z.object({
    type: z.literal('mutate'),
    path: z.string(),
    value: z.unknown(),
  }),
])

function toProofActionInput(action: z.infer<typeof proofActionSchema>): ProofActionInput {
  switch (action.type) {
    case 'call_action':
      return {
        type: 'call_action',
        name: action.name,
        args: action.args,
      }
    case 'advance_frames':
      return {
        type: 'advance_frames',
        count: action.count,
      }
    case 'click':
      return {
        type: 'click',
        selector: action.selector,
      }
    case 'press':
      return {
        type: 'press',
        key: action.key,
      }
    case 'mutate':
      return {
        type: 'mutate',
        path: action.path,
        value: action.value,
      }
  }
}

export function registerProofTools(server: McpServer, proof: ProofHelper) {
  server.registerTool('proof.capture_action', {
    inputSchema: {
      label: z.string().optional(),
      action: proofActionSchema,
    },
  }, async ({ label, action }) => {
    const result = await proof.captureAction(label, toProofActionInput(action))
    return ok(result)
  })
}
