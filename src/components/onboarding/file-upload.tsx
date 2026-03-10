'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
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

    async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        try {
            setUploading(true);
            const file = event.target.files?.[0];
            if (!file) return;

            const supabase = createClient();
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from(bucketName)
                .upload(filePath, file);

            if (uploadError) {
                throw uploadError;
            }

            onUploadComplete(filePath, file.name);
            setFileUrl(filePath); // Just tracking we have one
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
