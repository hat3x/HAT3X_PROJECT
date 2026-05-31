'use client';

import { useState } from 'react';

interface TextCommandInputProps {
  disabled?: boolean;
  onCommand: (text: string) => void;
}

export function TextCommandInput({ disabled, onCommand }: TextCommandInputProps) {
  const [value, setValue] = useState('');

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    setValue('');
    onCommand(text);
  }

  return (
    <form
      className="w-full max-w-2xl rounded border border-white/10 bg-slate-950/50 p-2 shadow-[0_0_24px_rgba(34,211,238,0.08)]"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex items-end gap-2">
        <label className="sr-only" htmlFor="aiden-text-command">
          Orden por texto
        </label>
        <textarea
          id="aiden-text-command"
          value={value}
          disabled={disabled}
          rows={1}
          placeholder="Escribe una orden para Jarvis"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          className="max-h-28 min-h-10 flex-1 resize-none rounded border border-transparent bg-transparent px-3 py-2 text-sm leading-5 text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          className="h-10 rounded border border-cyan-300/30 bg-cyan-300/10 px-4 text-xs font-medium uppercase tracking-[0.16em] text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Enviar
        </button>
      </div>
    </form>
  );
}
