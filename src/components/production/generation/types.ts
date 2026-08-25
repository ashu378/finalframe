export interface GenerationShotView {
    _id: string;
    title: string;
    prompt: string;
    durationSeconds: number;
    status?: string;
}

export interface GenerationSceneView {
    _id: string;
    title: string;
    purpose?: string;
    orderIndex: number;
    shots: GenerationShotView[];
}

export interface GenerationSequenceView {
    _id: string;
    title: string;
    description?: string;
    orderIndex: number;
    scenes: GenerationSceneView[];
}

export interface GenerationJobView {
    _id?: string;
    jobId?: string;
    shotId: string;
    status?: string;
    progress?: number;
    errorMessage?: string;
    assetId?: string;
}
