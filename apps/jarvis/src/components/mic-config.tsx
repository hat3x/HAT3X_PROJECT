'use client';

import { useState, useEffect } from 'react';

interface MicConfigProps {
  deviceId: string | undefined;
  onDeviceChange: (deviceId: string) => void;
  volume: number;
  isListening: boolean;
}

export function MicConfig({ deviceId, onDeviceChange, volume, isListening }: MicConfigProps) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    if (!open) return;
    navigator.mediaDevices.enumerateDevices().then((all) => {
      setDevices(all.filter((device) => device.kind === 'audioinput'));
    });
  }, [open]);

  return (
    <div className="flex flex-col items-center gap-2">
      {isListening && (
        <div className="flex h-6 items-end gap-0.5">
          {Array.from({ length: 8 }).map((_, index) => {
            const threshold = ((index + 1) / 8) * 100;
            const active = volume >= threshold;
            return (
              <div
                key={index}
                className={`w-1.5 rounded-sm transition-all duration-75 ${
                  active ? 'bg-cyan-300' : 'bg-slate-800'
                }`}
                style={{ height: `${40 + index * 8}%` }}
              />
            );
          })}
        </div>
      )}

      <button
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 text-xs font-mono text-slate-500 transition-colors hover:text-cyan-200"
        title="Microfono"
      >
        <span className="text-[10px] uppercase tracking-[0.16em]">input</span>
      </button>

      {open && (
        <div className="w-72 space-y-2 rounded border border-white/10 bg-slate-950/95 px-4 py-3 shadow-2xl shadow-black/40">
          <p className="text-xs font-mono uppercase tracking-wide text-slate-500">Microfono</p>
          {devices.length === 0 ? (
            <p className="text-xs text-slate-500">Buscando dispositivos...</p>
          ) : (
            <select
              value={deviceId ?? ''}
              onChange={(event) => onDeviceChange(event.target.value)}
              className="w-full rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 focus:border-cyan-300/50 focus:outline-none"
            >
              <option value="">Microfono por defecto</option>
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microfono ${device.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
