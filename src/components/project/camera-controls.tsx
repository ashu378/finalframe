'use client';

import { useState } from 'react';
import { Camera, Zap, RefreshCw } from 'lucide-react';
import type { CameraConfig, MotionConfig } from '@/lib/types/database';

interface CameraControlsProps {
    cameraConfig: CameraConfig;
    motionConfig: MotionConfig;
    onChange: (camera: CameraConfig, motion: MotionConfig) => void;
    onReset: () => void;
}

export function CameraControls({ cameraConfig, motionConfig, onChange, onReset }: CameraControlsProps) {
    const handleCameraChange = (key: keyof CameraConfig, value: string) => {
        onChange({ ...cameraConfig, [key]: value }, motionConfig);
    };

    const handleMotionChange = (key: keyof MotionConfig, value: any) => {
        const newVal = key === 'stability' ? parseFloat(value) : value;
        onChange(cameraConfig, { ...motionConfig, [key]: newVal });
    };

    return (
        <div className="mt-4 p-4 bg-black/40 rounded-lg border border-white/10 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                    <Camera className="w-4 h-4 text-violet-400" />
                    <span>Cinematography Control</span>
                </div>
                <button
                    onClick={onReset}
                    className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                >
                    <RefreshCw className="w-3 h-3" />
                    Reset to AI Default
                </button>
            </div>

            {/* Camera Parameters */}
            <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider ml-1">Angle</label>
                    <select
                        value={cameraConfig.angle || 'eye_level'}
                        onChange={(e) => handleCameraChange('angle', e.target.value)}
                        className="w-full text-xs p-2 rounded bg-black/40 border border-white/10 text-white focus:ring-1 focus:ring-violet-500 focus:outline-none appearance-none cursor-pointer"
                    >
                        <option value="eye_level">Eye Level</option>
                        <option value="low_angle">Low Angle</option>
                        <option value="high_angle">High Angle</option>
                        <option value="drone">Drone View</option>
                        <option value="macro">Macro</option>
                    </select>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider ml-1">Movement</label>
                    <select
                        value={cameraConfig.movement || 'static'}
                        onChange={(e) => handleCameraChange('movement', e.target.value)}
                        className="w-full text-xs p-2 rounded bg-black/40 border border-white/10 text-white focus:ring-1 focus:ring-violet-500 focus:outline-none appearance-none cursor-pointer"
                    >
                        <option value="static">Static</option>
                        <option value="pan_left">Pan Left</option>
                        <option value="pan_right">Pan Right</option>
                        <option value="tilt_up">Tilt Up</option>
                        <option value="tilt_down">Tilt Down</option>
                        <option value="zoom_in">Zoom In</option>
                        <option value="zoom_out">Zoom Out</option>
                        <option value="orbit">Orbit</option>
                    </select>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider ml-1">Lens</label>
                    <select
                        value={cameraConfig.lens || 'standard'}
                        onChange={(e) => handleCameraChange('lens', e.target.value)}
                        className="w-full text-xs p-2 rounded bg-black/40 border border-white/10 text-white focus:ring-1 focus:ring-violet-500 focus:outline-none appearance-none cursor-pointer"
                    >
                        <option value="standard">Standard</option>
                        <option value="wide">Wide Angle</option>
                        <option value="telephoto">Telephoto</option>
                    </select>
                </div>
            </div>

            <div className="h-px bg-white/5" />

            {/* Motion Parameters */}
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                    <Zap className="w-4 h-4 text-violet-400" />
                    <span>Motion Dynamics</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider ml-1">Speed</label>
                        <select
                            value={motionConfig.speed || 'normal'}
                            onChange={(e) => handleMotionChange('speed', e.target.value)}
                            className="w-full text-xs p-2 rounded bg-black/40 border border-white/10 text-white focus:ring-1 focus:ring-violet-500 focus:outline-none appearance-none cursor-pointer"
                        >
                            <option value="slow">Slow</option>
                            <option value="normal">Normal</option>
                            <option value="fast">Fast</option>
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs text-gray-500 uppercase font-medium">
                            Stability ({(motionConfig.stability || 0.5) * 100}%)
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={motionConfig.stability || 0.5}
                            onChange={(e) => handleMotionChange('stability', e.target.value)}
                            className="w-full h-1.5 bg-black/40 rounded-lg appearance-none cursor-pointer accent-violet-500 border border-white/5"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
