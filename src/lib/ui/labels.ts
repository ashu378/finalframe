/** Customer-facing vocabulary. Keep internal names out of creator-facing UI. */
export const customerTerminology = {
  project: 'video project',
  projects: 'video projects',
  plan: 'plan',
  scene: 'part',
  scenes: 'parts',
  shot: 'take',
  shots: 'takes',
  asset: 'media',
  assets: 'media library',
  productionGuide: 'creative guide',
  assembly: 'put it together',
  render: 'make video',
  version: 'version',
  versions: 'versions',
  library: 'library',
  credits: 'video credits',
} as const;

export type CustomerTerm = keyof typeof customerTerminology;
export type CustomerTerminology = typeof customerTerminology;

export function customerTerm(term: CustomerTerm): string {
  return customerTerminology[term];
}

/** Legacy/internal keys mapped to the same friendly vocabulary. */
export type UiLabelMap = Record<string, string>;

export const humanLabels: UiLabelMap = {
  productions: customerTerminology.projects,
  production: customerTerminology.project,
  blueprint: customerTerminology.plan,
  scene: customerTerminology.scene,
  scenes: customerTerminology.scenes,
  shot: customerTerminology.shot,
  shots: customerTerminology.shots,
  asset: customerTerminology.asset,
  assets: customerTerminology.assets,
  production_bible: customerTerminology.productionGuide,
  assembly: customerTerminology.assembly,
  render: customerTerminology.render,
  snapshot: customerTerminology.version,
  snapshots: customerTerminology.versions,
  registry: customerTerminology.library,
  signal: 'video',
  credits: customerTerminology.credits,
  director: customerTerminology.productionGuide,
};

export type CreationMode = 'IDEA' | 'SCRIPT' | 'FOOTAGE' | 'ASSETS';

export type CreationModeDefinition = {
  id: CreationMode;
  title: string;
  description: string;
  accent: string;
};

export const creationModes = [
  { id: 'IDEA', title: 'Start with an idea', description: 'Describe a story, ad, cartoon, or product video in your own words.', accent: 'bg-[#f6dfb1]' },
  { id: 'SCRIPT', title: 'Paste a script', description: 'Bring a script, voiceover, or rough outline and we will shape the visuals.', accent: 'bg-[#f1c7b7]' },
  { id: 'FOOTAGE', title: 'Use your footage', description: 'Upload clips and turn them into a clear, polished edit.', accent: 'bg-[#c8ddd5]' },
  { id: 'ASSETS', title: 'Bring your media', description: 'Add images, products, characters, logos, audio, or brand references.', accent: 'bg-[#d8cee8]' },
] satisfies readonly CreationModeDefinition[];

export function getCreationMode(mode: CreationMode): CreationModeDefinition {
  return creationModes.find((item) => item.id === mode) ?? creationModes[0];
}

export type FriendlyStatusTone = 'neutral' | 'warm' | 'success' | 'danger';

export type FriendlyProjectStatus = {
  label: string;
  description: string;
  tone: FriendlyStatusTone;
};

export function friendlyProjectStatus(status?: string): FriendlyProjectStatus {
  switch (status?.toLowerCase()) {
    case 'rendered':
    case 'completed':
      return { label: 'Ready to share', description: 'Your video is ready for review or download.', tone: 'success' };
    case 'rendering':
    case 'processing':
    case 'queued':
      return { label: 'Making your video', description: 'FinalFrame is working through the approved plan.', tone: 'warm' };
    case 'approved':
      return { label: 'Ready to make', description: 'Your plan is approved and ready for production.', tone: 'warm' };
    case 'blueprint_ready':
    case 'plan_ready':
      return { label: 'Plan ready', description: 'Take a look at the plan before you approve the cost.', tone: 'warm' };
    case 'failed':
    case 'cancelled':
      return { label: 'Needs attention', description: 'Something interrupted this video. You can try again.', tone: 'danger' };
    case 'archived':
      return { label: 'Archived', description: 'This video is kept safely but is not in your active projects.', tone: 'neutral' };
    default:
      return { label: 'Idea in progress', description: 'Your project is ready for its next step.', tone: 'neutral' };
  }
}

export type WorkflowStepKey = 'idea' | 'plan' | 'approve' | 'make' | 'review' | 'download';

export type FriendlyWorkflowStep = {
  key: WorkflowStepKey;
  label: string;
  description: string;
};

export const workflowSteps = [
  { key: 'idea', label: 'Idea', description: 'Tell us what you want to make.' },
  { key: 'plan', label: 'Plan', description: 'Review the story and visuals.' },
  { key: 'approve', label: 'Approve cost', description: 'See credits before anything runs.' },
  { key: 'make', label: 'Make', description: 'FinalFrame creates each part.' },
  { key: 'review', label: 'Review', description: 'Give notes or approve the video.' },
  { key: 'download', label: 'Download', description: 'Share your finished video.' },
] satisfies readonly FriendlyWorkflowStep[];

export function getWorkflowStep(key: WorkflowStepKey): FriendlyWorkflowStep {
  return workflowSteps.find((step) => step.key === key) ?? workflowSteps[0];
}

export type NavigationSectionId = 'projects' | 'media' | 'templates' | 'settings';

export type NavigationSection = {
  id: NavigationSectionId;
  href: string;
  label: string;
  description?: string;
};

export const navigationSections = [
  { id: 'projects', href: '/dashboard', label: 'Video projects', description: 'Start, plan, and review your videos.' },
  { id: 'media', href: '/dashboard/assets', label: 'Media library', description: 'Keep your photos, clips, audio, and brand files together.' },
  { id: 'templates', href: '/dashboard/templates', label: 'Templates', description: 'Use a proven starting point.' },
  { id: 'settings', href: '/dashboard/settings', label: 'Settings', description: 'Manage your studio and preferences.' },
] satisfies readonly NavigationSection[];

export const creatorNavigation = navigationSections;
