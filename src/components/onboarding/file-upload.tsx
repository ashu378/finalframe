'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface FileUploadProps {
    bucketName?: string;
    onUploadComplete: (path: string, fileName: string) => void;
    accept?: string;
    label?: string;
}

export function FileUpload({
    bucketName = 'studio-assets',
    onUploadComplete,
    accept = 'image/*,video/*',
    label = 'Upload File'
}: FileUploadProps) {
    const [uploading, setUploading] = useState(false);
    const [fileUrl, setFileUrl] = useState<string | null>(null);
    const account = useQuery(api.account.current, {});
    const generateUploadUrl = useMutation(api.assetStorage.generateUploadUrl);
    const ingestAsset = useMutation(api.assetStorage.ingestAsset);

    async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        try {
            setUploading(true);
            const file = event.target.files?.[0];
            if (!file) return;

            const studioExternalId = account?.studio?.externalId;
            if (!studioExternalId) throw new Error('Create your studio before uploading media.');
            const uploadUrl = await generateUploadUrl({ studioExternalId });
            const response = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
            if (!response.ok) throw new Error('Media upload failed');
            const { storageId } = await response.json() as { storageId: string };
            await ingestAsset({ studioExternalId, storageId: storageId as never, source: 'user_upload', roles: ['reference'], name: file.name, mimeType: file.type, metadata: { fileName: file.name, size: file.size, bucketName } });
            onUploadComplete(storageId, file.name);
            setFileUrl(storageId);
        } catch (error) {
            alert('Error uploading file');
            console.error(error);
        } finally {
            setUploading(false);
        }
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-4">
                <Input
                    type="file"
                    accept={accept}
                    onChange={handleFileChange}
                    disabled={uploading}
                    className="max-w-xs"
                />
                {uploading && <span className="text-sm text-muted-foreground">Uploading...</span>}
                {fileUrl && !uploading && <span className="text-sm text-green-600 font-medium">Uploaded</span>}
            </div>
            {/* Visual preview could go here */}
        </div>
    );
}
