import React from 'react';

const WHATSAPP_NUMBER = '56110050049';
const DISPLAY_NUMBER = '+56 1105 0049';
const DEFAULT_MESSAGE = 'Hola Neonexa, me gustaría cotizar un pedido.';

export default function WhatsAppButton() {
  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(DEFAULT_MESSAGE)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Chatear por WhatsApp al ${DISPLAY_NUMBER}`}
      className="group fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-[60] flex items-center"
    >
      <span
        className="pointer-events-none absolute inline-flex h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-[#25D366] opacity-40 animate-ping"
        aria-hidden="true"
      />
      <span
        className="relative flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-[#25D366] shadow-[0_0_0_1px_rgba(0,240,255,0.35),0_10px_30px_-6px_rgba(0,0,0,0.6)] transition-transform duration-150 ease-out group-hover:-translate-y-0.5 group-hover:shadow-[0_0_0_1px_rgba(0,240,255,0.6),0_16px_36px_-6px_rgba(0,0,0,0.7)] group-active:scale-95"
      >
        <svg
          viewBox="0 0 32 32"
          className="h-6 w-6 sm:h-7 sm:w-7 fill-white"
          aria-hidden="true"
        >
          <path d="M16.004 0C7.164 0 0 7.163 0 16.002c0 2.82.744 5.583 2.156 8.007L.06 31.94l8.15-2.135a15.94 15.94 0 0 0 7.79 2.03h.006c8.838 0 16-7.163 16-16.001 0-4.276-1.665-8.293-4.688-11.317A15.9 15.9 0 0 0 16.004 0Zm0 2.4c3.62 0 7.02 1.412 9.584 3.976a13.47 13.47 0 0 1 3.975 9.63c0 7.505-6.106 13.61-13.615 13.61a13.55 13.55 0 0 1-6.888-1.88l-.494-.293-4.548 1.192 1.216-4.432-.322-.51a13.55 13.55 0 0 1-2.083-7.29C2.83 8.505 8.936 2.4 16.44 2.4h-.436Zm-6.66 8.246c-.264 0-.694.099-1.056.494-.362.396-1.386 1.353-1.386 3.3 0 1.945 1.42 3.826 1.617 4.09.198.264 2.744 4.42 6.826 6.02 3.383 1.328 4.07 1.128 4.8 1.06.73-.066 2.35-.958 2.68-1.88.33-.923.33-1.716.231-1.88-.099-.165-.363-.264-.759-.463-.396-.198-2.346-1.155-2.71-1.287-.362-.132-.627-.198-.891.198-.264.396-1.023 1.287-1.254 1.55-.231.264-.462.298-.858.1-.396-.199-1.671-.616-3.183-1.965-1.176-1.048-1.97-2.345-2.202-2.741-.231-.396-.024-.61.174-.808.198-.198.462-.512.694-.767.198-.23.264-.396.396-.66.132-.264.066-.494-.033-.693-.099-.198-.792-1.98-1.089-2.71-.264-.643-.535-.628-.759-.638h-.14Z" />
        </svg>
      </span>
      <span className="ml-3 hidden sm:group-hover:flex items-center rounded-full bg-[#0B0B0B]/90 border border-[#00AEEF]/25 px-4 py-2 text-xs font-display tracking-widest uppercase text-white/90 whitespace-nowrap shadow-lg">
        Escríbenos {DISPLAY_NUMBER}
      </span>
    </a>
  );
}
