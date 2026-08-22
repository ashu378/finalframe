import { NextResponse } from 'next/server';
import { processShotGenerationJob } from '@/lib/generation/actions';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const result = await processShotGenerationJob(id);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
