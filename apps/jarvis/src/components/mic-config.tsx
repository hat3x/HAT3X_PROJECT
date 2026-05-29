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
      setDevices(all.filter((d) => d.kind === 'audioinput'));
    });
  }, [open]);

  const bars = 8;

  return (
    <div className="flex flex-col items-center gap-2">
      {isListening && (
        <div className="flex items-end gap-0.5 h-6">
          {Array.from({ length: bars }).map((_, i) => {
            const threshold = ((i + 1) / bars) * 100;
            const active = volume >= threshold;
            return (
              <div
                key={i}
                className={`w-1.5 rounded-sm transition-all duration-75 ${
                  active ? 'bg-violet-400' : 'bg-jarvis-border'
                }`}
                style={{ height: `${40 + i * 8}%` }}
              />
            );
          })}
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="text-jarvis-muted hover:text-jarvis-text text-xs font-mono flex items-center gap-1 transition-colors"
        title="Configuración de micrófono"
      >
        <span>⚙</span>
        <span>mic</span>
      </button>

      {open && (
        <div className="bg-jarvis-surface border border-jarvis-border rounded-lg px-4 py-3 w-72 space-y-2">
          <p className="text-jarvis-muted text-xs uppercase tracking-wide font-mono">Micrófono</p>
          {devices.length === 0 ? (
            <p className="text-jarvis-muted text-xs">Cargando dispositivos...</p>
          ) : (
            <select
              value={deviceId ?? ''}
              onChange={(e) => onDeviceChange(e.target.value)}
              className="w-full bg-jarvis-bg border border-jarvis-border text-jarvis-text text-xs rounded px-2 py-1.5 focus:outline-none focus:border-violet-600"
            >
              <option value="">— Micrófono por defecto —</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Micrófono ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          )}
          <p className="text-jarvis-muted text-xs">
            Mantén pulsado el botón y habla para ver el medidor de volumen.
          </p>
        </div>
      )}
    </div>
  );
}
