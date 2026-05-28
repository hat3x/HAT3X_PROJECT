'use client';

interface TranscriptProps {
  userText: string;
  jarvisResponse: string;
  isLoading: boolean;
}

export function Transcript({ userText, jarvisResponse, isLoading }: TranscriptProps) {
  if (!userText && !jarvisResponse && !isLoading) return null;

  return (
    <div className="w-full max-w-lg space-y-3">
      {userText && (
        <div className="flex justify-end">
          <div className="bg-jarvis-surface border border-jarvis-border rounded-2xl rounded-tr-sm px-4 py-2 max-w-xs">
            <p className="text-jarvis-text text-sm">{userText}</p>
          </div>
        </div>
      )}
      {(jarvisResponse || isLoading) && (
        <div className="flex justify-start">
          <div className="bg-violet-950/50 border border-violet-800/30 rounded-2xl rounded-tl-sm px-4 py-2 max-w-sm">
            {isLoading ? (
              <div className="flex gap-1 items-center py-1">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            ) : (
              <p className="text-jarvis-text text-sm">{jarvisResponse}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
