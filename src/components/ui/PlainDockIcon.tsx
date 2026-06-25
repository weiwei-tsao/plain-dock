'use client';

import React from 'react';

interface PlainDockIconProps {
  className?: string;
}

const PlainDockIcon: React.FC<PlainDockIconProps> = ({ className }) => (
  <svg
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* P letterform — evenodd so the bowl hollow punches through */}
    <path
      fillRule="evenodd"
      d="M7 6h5v19H7z M12 6h5q7 0 7 6.5q0 6.5-7 6.5h-5z M12 9.5h3.5q4 0 4 3q0 3-4 3H12z"
      fill="currentColor"
    />
    {/* Dock bar accent */}
    <rect x="6" y="27" width="20" height="2.5" rx="1.25" fill="#4f46e5" />
  </svg>
);

export default PlainDockIcon;
