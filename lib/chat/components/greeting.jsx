'use client';

export function Greeting({ codeMode = false }) {
  return (
    <div className="w-full text-center">
      <div className="font-semibold text-2xl md:text-3xl text-foreground">
        {codeMode ? 'What we coding today?' : 'Hello! How can I help?'}
      </div>
    </div>
  );
}
