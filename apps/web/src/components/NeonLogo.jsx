import React from 'react';

export default function NeonLogo({ size = 60 }) {
  // size approximates the icon height; the full wordmark scales from it.
  const height = Math.round(size * 1.4);
  return (
    <img
      src="/neonexa-logo.png"
      alt="Neonexa Print — Color que vende"
      className="select-none w-auto object-contain"
      style={{ height }}
      draggable={false}
    />
  );
}
