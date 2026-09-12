import React from 'react';

export const HomeIndicator: React.FC = () => {
  return (
    <div
      id="home-indicator"
      className="w-full flex justify-center pb-2 pt-1 absolute bottom-1.5 left-0 pointer-events-none z-50"
    >
      <div className="w-32 h-1 bg-slate-300 rounded-full" />
    </div>
  );
};
