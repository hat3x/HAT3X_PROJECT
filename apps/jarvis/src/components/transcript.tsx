'use client';

interface TranscriptProps {
  userText: string;
  jarvisResponse: string;
  isLoading: boolean;
}

export function Transcript({ userText, jarvisResponse, isLoading }: TranscriptProps) {
  if (!userText && !jarvisResponse && !isLoading) return null;

  return (
    <div className="w-full max-w-2xl space-y-3">
      {userText && (
        <div className="flex justify-end">
          <div className="holo-panel max-w-md border-cyan-300/25 px-4 py-3">
            <p className="mb-1 text-xs font-mono uppercase tracking-widest text-slate-500">Jota</p>
            <p className="text-sm leading-relaxed text-cyan-100">{userText}</p>
          </div>
        </div>
      )}

      {(jarvisResponse || isLoading) && (
        <div className="flex justify-start">
          <div className="holo-panel max-w-xl border-emerald-300/25 px-4 py-3">
            <p className="mb-1 text-xs font-mono uppercase tracking-widest text-slate-500">Jarvis</p>
            {isLoading ? (
              <div className="flex items-center gap-1.5 py-1">
                {([0, 150, 300] as const).map((delay) => (
                  <span
                    key={delay}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-300/80"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-emerald-100">{jarvisResponse}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
