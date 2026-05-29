'use client';

interface TranscriptProps {
  userText: string;
  jarvisResponse: string;
  isLoading: boolean;
}

export function Transcript({ userText, jarvisResponse, isLoading }: TranscriptProps) {
  if (!userText && !jarvisResponse && !isLoading) return null;

  return (
    <div className="w-full max-w-lg space-y-2">
      {userText && (
        <div className="flex justify-end">
          <div
            className="holo-panel px-4 py-2.5 max-w-xs"
            style={{ borderColor: 'rgba(99, 102, 241, 0.3)' }}
          >
            <p className="text-xs font-mono mb-1 holo-text-muted uppercase tracking-widest">tú</p>
            <p className="holo-text-user text-sm font-mono leading-relaxed">{userText}</p>
          </div>
        </div>
      )}
      {(jarvisResponse || isLoading) && (
        <div className="flex justify-start">
          <div
            className="holo-panel px-4 py-2.5 max-w-sm"
            style={{ borderColor: 'rgba(124, 58, 237, 0.3)' }}
          >
            <p className="text-xs font-mono mb-1 holo-text-muted uppercase tracking-widest">jarvis</p>
            {isLoading ? (
              <div className="flex gap-1.5 items-center py-1">
                {([0, 150, 300] as const).map((d) => (
                  <span
                    key={d}
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: 'rgba(134, 239, 172, 0.7)', animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
            ) : (
              <p className="holo-text-jarvis text-sm font-mono leading-relaxed">{jarvisResponse}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
