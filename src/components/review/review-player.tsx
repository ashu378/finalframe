'use client';

import { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Film } from 'lucide-react';

interface ReviewPlayerProps {
    url?: string;
    onTimeUpdate?: (time: number) => void;
}

export const ReviewPlayer = forwardRef(({ url, onTimeUpdate }: ReviewPlayerProps, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isMuted, setIsMuted] = useState(false);

    const toggleMute = () => {
        if (videoRef.current) {
            videoRef.current.muted = !isMuted;
            setIsMuted(!isMuted);
        }
    };

    const toggleFullscreen = () => {
        if (videoRef.current) {
            if (!document.fullscreenElement) {
                videoRef.current.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        }
    };

    useImperativeHandle(ref, () => ({
        seekTo: (time: number) => {
            if (videoRef.current) {
                videoRef.current.currentTime = time;
                if (!isPlaying) videoRef.current.play().catch(() => { });
            }
        }
    }));

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleUpdate = () => {
            if (onTimeUpdate) onTimeUpdate(video.currentTime);
            setProgress((video.currentTime / video.duration) * 100);
        };

        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);

        video.addEventListener('timeupdate', handleUpdate);
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);

        return () => {
            video.removeEventListener('timeupdate', handleUpdate);
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
        };
    }, [onTimeUpdate]);

    const togglePlay = () => {
        if (!videoRef.current) return;

        if (videoRef.current.paused) {
            videoRef.current.play().catch(e => console.log('Play interrupted', e));
        } else {
            videoRef.current.pause();
        }
    };

    if (!url) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center gap-6 bg-black/40 backdrop-blur-3xl border border-white/5 rounded-sm">
                <div className="w-20 h-20 rounded-sm bg-black/60 flex items-center justify-center border border-white/5 shadow-2xl relative">
                    <div className="absolute inset-0 border border-primary/20 animate-pulse rounded-sm" />
                    <Film className="w-8 h-8 text-zinc-800" />
                </div>
                <div className="text-center">
                    <p className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.3em] mb-2 italic">Awaiting Master Output</p>
                    <p className="text-[9px] font-black text-zinc-700 uppercase tracking-widest">Signal propagation in progress...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full group">
            <video
                ref={videoRef}
                src={url}
                className="w-full h-full object-contain bg-black"
                onClick={togglePlay}
            />

            {/* Premium Custom Controls Overly */}
            <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                {/* Progress Bar */}
                <div className="h-0.5 w-full bg-white/5 rounded-none mb-8 relative cursor-pointer overflow-hidden group/bar">
                    <div
                        className="absolute h-full bg-primary shadow-[0_0_15px_rgba(251,191,36,0.5)] transition-all duration-100"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-8">
                        <button onClick={togglePlay} className="text-white hover:text-primary transition-all active:scale-90">
                            {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
                        </button>
                        <button onClick={toggleMute} className="text-white hover:text-primary transition-colors">
                            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                        </button>
                    </div>

                    <button onClick={toggleFullscreen} className="text-white hover:text-primary transition-colors">
                        <Maximize className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
});

ReviewPlayer.displayName = 'ReviewPlayer';
