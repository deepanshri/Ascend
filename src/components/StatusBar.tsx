import React, { useEffect, useState } from 'react';

export const StatusBar: React.FC = () => {
  const [time, setTime] = useState('9:41');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = now.getMinutes();
      // Keep standard 12-hour or current time format
      const formattedMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;
      setTime(`${hours % 12 || 12}:${formattedMinutes}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      id="status-bar"
      className="flex justify-between items-center text-slate-900 font-semibold text-[15px] pt-1 px-3 select-none"
    >
      <span className="tracking-tight font-medium ml-1">{time}</span>
      <div className="flex items-center space-x-1.5 mr-1 text-slate-900">
        {/* Signal Icon */}
        <svg className="w-4 h-3.5" fill="currentColor" viewBox="0 0 17 12">
          <rect height="3.5" rx="0.7" width="2.5" x="0" y="8.5" />
          <rect height="6" rx="0.7" width="2.5" x="4" y="6" />
          <rect height="8.5" rx="0.7" width="2.5" x="8" y="3.5" />
          <rect height="11.5" rx="0.7" width="2.5" x="12" y="0.5" />
        </svg>
        {/* Wifi Icon */}
        <svg className="w-4 h-3.5" fill="currentColor" viewBox="0 0 16 12">
          <path d="M8 12a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6zm4.8-4.7a6.8 6.8 0 00-9.6 0 .8.8 0 11-1.1-1.1 8.4 8.4 0 0111.8 0 .8.8 0 11-1.1 1.1zm2.3-2.3a10.1 10.1 0 00-14.2 0 .8.8 0 11-1.1-1.1 11.7 11.7 0 0116.4 0 .8.8 0 11-1.1 1.1z" />
        </svg>
        {/* Battery Icon */}
        <div className="relative w-5 h-2.5 border-[1.2px] border-slate-900 rounded-[4px] p-0.5 flex items-center">
          <div className="h-full bg-slate-900 rounded-[1.5px] w-[82%]" />
          <div className="absolute -right-1 w-0.5 h-1 bg-slate-900 rounded-r-sm" />
        </div>
      </div>
    </div>
  );
};
