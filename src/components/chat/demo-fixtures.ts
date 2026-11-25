import { seedDriveFolders } from '#/components/design-system/DriveExplorer'
import { INITIAL_WORKSPACE_DOCS } from '#/lib/marble/templates'
import type {
  DriveChatAction,
  DriveChatModelOption,
  DriveChatThread,
} from '#/lib/ai/drive-chat-types'

const seeded = seedDriveFolders(
  INITIAL_WORKSPACE_DOCS.map((doc) => ({ ...doc })),
)

export const CHAT_DEMO_DOCS = seeded.docs
export const CHAT_DEMO_FOLDERS = seeded.folders

export const CHAT_DEMO_MODELS: DriveChatModelOption[] = [
  {
    id: 'antigravity/gemini-4-neon',
    name: 'Gemini 4 Neon',
    providerId: 'antigravity',
    providerName: 'Google Antigravity',
    connected: true,
    status: 'active',
    contextWindow: '1M',
    speedTier: 'deep',
    supportsVision: true,
    supportsReasoning: true,
    reasoningEfforts: ['off', 'low', 'medium', 'high', 'max'],
    description: 'Deep reasoning and cross-document synthesis via ACP',
    badge: 'Antigravity',
  },
  {
    id: 'antigravity/gemini-4-argon',
    name: 'Gemini 4 Argon',
    providerId: 'antigravity',
    providerName: 'Google Antigravity',
    connected: true,
    status: 'active',
    contextWindow: '1M',
    speedTier: 'fast',
    supportsVision: true,
    supportsReasoning: true,
    reasoningEfforts: ['off', 'low', 'medium', 'high'],
    description: 'Fast design, documents, and visual layout edits',
    badge: 'Antigravity',
  },
  {
    id: 'opencode-go/glm-5.3',
    name: 'GLM-5.3',
    providerId: 'opencode-go',
    providerName: 'OpenCode Go',
    connected: true,
    status: 'active',
    contextWindow: '1M',
    speedTier: 'deep',
    supportsVision: false,
    supportsReasoning: true,
    reasoningEfforts: ['off', 'low', 'high', 'max'],
    description: 'High-allowance OpenCode Go flagship for coding and editing',
    badge: 'OpenCode Go',
  },
  {
    id: 'opencode-go/kimi-k3.1-pro',
    name: 'Kimi K3.1 Pro',
    providerId: 'opencode-go',
    providerName: 'OpenCode Go',
    connected: true,
    status: 'active',
    contextWindow: '1M',
    speedTier: 'deep',
    supportsVision: true,
    supportsReasoning: true,
    reasoningEfforts: ['off', 'low', 'high', 'max'],
    description: 'Multimodal frontier reasoning and agentic editing via Go',
    badge: 'OpenCode Go',
  },
  {
    id: 'opencode-go/deepseek-v4.1-flash',
    name: 'DeepSeek V4.1 Flash',
    providerId: 'opencode-go',
    providerName: 'OpenCode Go',
    connected: true,
    status: 'active',
    contextWindow: '1M',
    speedTier: 'fast',
    supportsVision: true,
    supportsReasoning: true,
    reasoningEfforts: ['off', 'low', 'high', 'max'],
    description: 'Fast reasoning and cross-Drive lookup via Go',
    badge: 'OpenCode Go',
  },
  {
    id: 'grok-build/grok-4.7',
    name: 'Grok 4.7',
    providerId: 'grok-build',
    providerName: 'Grok Build',
    connected: true,
    status: 'active',
    contextWindow: '256K',
    speedTier: 'deep',
    supportsVision: true,
    supportsReasoning: true,
    reasoningEfforts: ['off', 'low', 'medium', 'high', 'max'],
    description: "SpaceXAI's latest frontier model via Grok Build ACP",
    badge: 'Grok Build',
  },
  {
    id: 'grok-build/grok-4.7-build-fast',
    name: 'Grok 4.7 Fast',
    providerId: 'grok-build',
    providerName: 'Grok Build',
    connected: true,
    status: 'active',
    contextWindow: '256K',
    speedTier: 'fast',
    supportsVision: true,
    supportsReasoning: true,
    reasoningEfforts: ['off', 'low', 'medium', 'high', 'max'],
    description: 'Fast variant via Grok Build ACP',
    badge: 'Grok Build',
  },
  {
    id: 'claude-opus-5-5',
    name: 'Claude Opus 5.5',
    providerId: 'claude',
    providerName: 'Anthropic Claude',
    connected: false,
    status: 'disconnected',
    contextWindow: '400K',
    speedTier: 'deep',
    supportsVision: true,
    supportsReasoning: true,
    reasoningEfforts: ['off', 'low', 'medium', 'high', 'max'],
    description: 'Connect in Models & Providers to enable',
    badge: 'Claude',
  },
  {
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    providerId: 'openai',
    providerName: 'OpenAI',
    connected: false,
    status: 'disconnected',
    contextWindow: '400K',
    speedTier: 'fast',
    supportsVision: true,
    supportsReasoning: true,
    reasoningEfforts: ['off', 'low', 'medium', 'high'],
    description: 'Connect in Models & Providers to enable',
    badge: 'OpenAI',
  },
]

export const CHAT_DEMO_ACTIONS: DriveChatAction[] = [
  {
    id: 'demo-act-edit',
    kind: 'edit_document',
    docId: 'ws-week-12-ablations',
    docTitle: 'Week 12 Ablation Notes',
    fileName: 'week-12-ablations.mrbl',
    label: 'Edit Week 12 Ablation Notes',
    summary: 'Add threshold comparison summary referencing qec-threshold.mrbl',
    status: 'proposed',
    ops: [
      {
        type: 'setText',
        id: 'ablation-summary',
        text: 'Surface code distance d=7 reaches 0.84% logical error at p=0.45%, outperforming baseline MWPM by 1.38x.',
      },
    ],
    diffPreview: [
      'setText #ablation-summary: "Surface code distance d=7 reaches 0.84% logical error at p=0.45%, outperforming baseline MWPM by 1.38x."',
    ],
  },
  {
    id: 'demo-act-folder',
    kind: 'create_folder',
    name: 'QEC Milestones',
    parentId: null,
    parentPath: 'My Drive',
    color: 'accent',
    label: 'Create folder QEC Milestones',
    summary: 'Create folder "QEC Milestones" inside My Drive',
    status: 'applied',
    createdFolderId: 'folder-qec-milestones',
  },
  {
    id: 'demo-act-move',
    kind: 'move_document',
    docId: 'ws-logical-memory-spec',
    docTitle: 'Logical Memory Architecture Spec',
    fromFolderName: 'Specs',
    targetFolderId: 'folder-papers',
    targetFolderName: 'Papers',
    label: 'Move Logical Memory Architecture Spec',
    summary: 'Move "Logical Memory Architecture Spec" from Specs to Papers',
    status: 'proposed',
  },
]

export const CHAT_DEMO_THREADS: DriveChatThread[] = [
  {
    id: 'thread-qec-audit',
    title: 'Cross-check QEC ablation metrics & organize papers',
    createdAt: '2026-11-23T17:20:00.000Z',
    updatedAt: '2026-11-23T18:45:00.000Z',
    pinned: true,
    modelId: 'antigravity/gemini-4-neon',
    reasoningEffort: 'high',
    mode: 'review',
    messages: [
      {
        id: 'demo-u-1',
        role: 'user',
        content:
          'Compare the logical error numbers across my Lab notes and Specs, update the Week 12 Ablation Notes summary, and move the Logical Memory spec into Papers.',
        createdAt: '2026-11-23T18:43:00.000Z',
        contextRefs: [
          {
            kind: 'doc',
            id: 'ws-week-12-ablations',
            title: 'Week 12 Ablation Notes',
            fileName: 'week-12-ablations.mrbl',
            category: 'notebook',
          },
        ],
      },
      {
        id: 'demo-a-1',
        role: 'assistant',
        content: `I reviewed all **${CHAT_DEMO_DOCS.length} files** across your Drive and cross-checked the threshold data between \`week-12-ablations.mrbl\`, \`logical-memory-spec.mrbl\`, and \`qec-threshold.mrbl\`.

### Key findings across your Drive

| Document | Folder | Highlight |
| --- | --- | --- |
| \`week-12-ablations.mrbl\` | Lab | Distance $d=7$ sweep shows a **1.38x** reduction over baseline MWPM |
| \`logical-memory-spec.mrbl\` | Specs | Specifies the stabilizer cycle budget and readout latency ceiling |
| \`group-meeting.mrbl\` | Talks | Deck slides still reference the older week-11 baseline numbers |

I prepared the requested Drive edits below — you can review each diff individually or click **Apply all** to commit them to your workspace.`,
        createdAt: '2026-11-23T18:45:00.000Z',
        modelId: 'antigravity/gemini-4-neon',
        modelName: 'Gemini 4 Neon',
        providerId: 'antigravity',
        reasoningEffort: 'high',
        mode: 'review',
        thinkingDurationMs: 3400,
        thoughts: [
          'Inspecting Drive snapshot across Lab, Papers, Specs, and Talks folders.\nComparing ablation metrics in week-12-ablations.mrbl against logical-memory-spec.mrbl.\nVerified existing data-marble-id targets before proposing setText op and move_document action.',
        ],
        referencedDocIds: [
          'ws-week-12-ablations',
          'ws-logical-memory-spec',
          'ws-group-meeting',
        ],
        actions: CHAT_DEMO_ACTIONS,
      },
    ],
  },
  {
    id: 'thread-evergreen-check',
    title: 'Audit slides against evergreen design rules',
    createdAt: '2026-11-23T14:10:00.000Z',
    updatedAt: '2026-11-23T14:12:00.000Z',
    modelId: 'opencode-go/glm-5.3',
    reasoningEffort: 'medium',
    mode: 'ask',
    messages: [
      {
        id: 'demo-u-2',
        role: 'user',
        content:
          'Do any of my files violate the anti-slop rules in document-donts-system.mrbl?',
        createdAt: '2026-11-23T14:10:00.000Z',
      },
      {
        id: 'demo-a-2',
        role: 'assistant',
        content:
          'All active documents currently comply with `document-design-system.mrbl` and `document-donts-system.mrbl` — no banned warm-cream hex codes, uppercase eyebrows, or trailing arrow buttons were found.',
        createdAt: '2026-11-23T14:12:00.000Z',
        modelId: 'opencode-go/glm-5.3',
        modelName: 'GLM-5.3',
        providerId: 'opencode-go',
        reasoningEffort: 'medium',
        mode: 'ask',
        referencedDocIds: [
          'ws-document-design-system',
          'ws-document-donts-system',
        ],
      },
    ],
  },
]
