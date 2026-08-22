export type CreationMode = 'IDEA' | 'SCRIPT' | 'FOOTAGE' | 'ASSETS';

export type FriendlyProjectStatus = {
  label: string;
  description: string;
  tone: 'neutral' | 'warm' | 'success' | 'danger';
};

export type FriendlyWorkflowStep = {
  key: string;
  label: string;
  description: string;
};

export type NavigationSection = {
  href: string;
  label: string;
  description?: string;
};

export type UiLabelMap = Record<string, string>;

export const humanLabels: UiLabelMap = {
  productions: 'Video projects',
  production: 'Video project',
  blueprint: 'Plan',
  scene: 'Part',
  scenes: 'Parts',
  shot: 'Take',
  shots: 'Takes',
  asset: 'Media',
  assets: 'Media library',
  production_bible: 'Creative guide',
  assembly: 'Put it together',
  render: 'Make video',
  snapshot: 'Version',
  snapshots: 'Versions',
  registry: 'Library',
  signal: 'Video',
  credits: 'Video credits',
  director: 'Creative guide',
};

export const workflowSteps: FriendlyWorkflowStep[] = [
  { key: 'idea', label: 'Idea', description: 'Tell us what you want to make.' },
  { key: 'plan', label: 'Plan', description: 'Review the story and visuals.' },
  { key: 'approve', label: 'Approve cost', description: 'See credits before anything runs.' },
  { key: 'make', label: 'Make', description: 'FinalFrame creates each part.' },
  { key: 'review', label: 'Review', description: 'Give notes or approve the video.' },
  { key: 'download', label: 'Download', description: 'Share your finished video.' },
];

export function friendlyProjectStatus(status?: string): FriendlyProjectStatus {
  switch (status?.toLowerCase()) {
    case 'rendered':
    case 'completed':
      return { label: 'Ready to share', description: 'Your video is ready for review or download.', tone: 'success' };
    case 'rendering':
    case 'processing':
      return { label: 'Making your video', description: 'FinalFrame is working through the approved plan.', tone: 'warm' };
    case 'approved':
      return { label: 'Ready to make', description: 'Your plan is approved and ready for production.', tone: 'warm' };
    case 'blueprint_ready':
      return { label: 'Plan ready', description: 'Take a look at the plan before you approve the cost.', tone: 'warm' };
    case 'failed':
      return { label: 'Needs attention', description: 'Something interrupted this video. You can try again.', tone: 'danger' };
    case 'archived':
      return { label: 'Archived', description: 'This video is kept safely but is not in your active projects.', tone: 'neutral' };
    default:
      return { label: 'Idea in progress', description: 'Your project is ready for its next step.', tone: 'neutral' };
  }
}

export const creationModes = [
  { id: 'IDEA' as CreationMode, title: 'Start with an idea', description: 'Describe a story, ad, cartoon, or product video in your own words.', accent: 'bg-[#f6dfb1]' },
  { id: 'SCRIPT' as CreationMode, title: 'Paste a script', description: 'Bring a script, voiceover, or rough outline and we will shape the visuals.', accent: 'bg-[#f1c7b7]' },
  { id: 'FOOTAGE' as CreationMode, title: 'Use your footage', description: 'Upload clips and turn them into a clear, polished edit.', accent: 'bg-[#c8ddd5]' },
  { id: 'ASSETS' as CreationMode, title: 'Bring your media', description: 'Add images, products, characters, logos, audio, or brand references.', accent: 'bg-[#d8cee8]' },
];
