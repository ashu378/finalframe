import type { HTMLAttributes } from 'react';
import { Check } from 'lucide-react';

import { workflowSteps, type WorkflowStepKey } from '@/lib/ui/labels';
import { cn } from '@/lib/utils';

export interface WorkflowStepperProps extends HTMLAttributes<HTMLOListElement> {
  activeStep?: WorkflowStepKey;
  completedThrough?: WorkflowStepKey;
}

export function WorkflowStepper({ activeStep = 'brief', completedThrough, className, ...props }: WorkflowStepperProps) {
  const activeIndex = workflowSteps.findIndex((step) => step.key === activeStep);
  const completedIndex = completedThrough ? workflowSteps.findIndex((step) => step.key === completedThrough) : -1;

  return (
    <ol className={cn('flex gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-9 lg:overflow-visible', className)} aria-label="Video-making steps" {...props}>
      {workflowSteps.map((step, index) => {
        const isComplete = index <= completedIndex;
        const isActive = !isComplete && index === activeIndex;
        return (
          <li key={step.key} className={cn('relative min-w-[170px] rounded-xl border px-3 py-3 lg:min-w-0', isActive ? 'border-primary bg-primary/10' : 'border-border/70 bg-card')}>
            <div className="flex items-center gap-2">
              <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold', isComplete ? 'bg-[hsl(var(--success))] text-white' : isActive ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground')} aria-hidden="true">
                {isComplete ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className="text-sm font-semibold">{step.label}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{step.description}</p>
          </li>
        );
      })}
    </ol>
  );
}
