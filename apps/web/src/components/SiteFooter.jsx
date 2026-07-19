import React from 'react';
import { Link } from 'react-router-dom';
import NeonLogo from './NeonLogo';
import { Instagram, Facebook, Youtube, Zap, ShieldCheck, Truck } from 'lucide-react';

export default function SiteFooter() {
  return (
    <footer className="mt-32 border-t border-[#00AEEF]/15 bg-[#070707]">
      <div className="max-w-[90rem] mx-auto px-6 py-10 grid md:grid-cols-3 gap-6 text-sm">
        <div className="flex items-center gap-3"><Zap className="text-[#FFD400]" size={20}/><div><div className="font-display tracking-widest text-xs text-white/60">PRODUCCIÓN RÁPIDA</div><div className="font-semibold">Calidad premium</div></div></div>
        <div className="flex items-center gap-3"><ShieldCheck className="text-[#00F0FF]" size={20}/><div><div className="font-display tracking-widest text-xs text-white/60">COLORES VIVOS</div><div className="font-semibold">Máxima adherencia</div></div></div>
        <div className="flex items-center gap-3"><Truck className="text-[#FF2D95]" size={20}/><div><div className="font-display tracking-widest text-xs text-white/60">ENTREGAS CDMX</div><div className="font-semibold">Y área metropolitana</div></div></div>
      </div>
      <div className="border-t border-white/5">
        <div className="max-w-[90rem] mx-auto px-6 py-10 grid md:grid-cols-4 gap-10">
          <div className="md:col-span-2">
            <NeonLogo />
            <p className="mt-4 text-white/55 max-w-md leading-relaxed">
              Impresión DTF, playeras personalizadas y kits corporativos. Color que vende, hecho en CDMX.
            </p>
            <div className="mt-5 flex items-center gap-3 text-white/60">
              <a className="hover:text-[#00F0FF]" aria-label="Instagram"><Instagram size={18}/></a>
              <a className="hover:text-[#00F0FF]" aria-label="Facebook"><Facebook size={18}/></a>
              <a className="hover:text-[#00F0FF]" aria-label="Youtube"><Youtube size={18}/></a>
              <span className="text-xs ml-2">@neonexaprint</span>
            </div>
          </div>
          <div>
            <div className="font-display tracking-[0.22em] text-xs text-[#00AEEF] mb-3">CATÁLOGO</div>
            <ul className="space-y-2 text-white/70">
              <li><Link to="/productos">Productos</Link></li>
              <li><Link to="/tools/mockup">Mockups</Link></li>
              <li><Link to="/tools/print">Preparar DTF</Link></li>
              <li><Link to="/tools/halftone">Semitonos</Link></li>
            </ul>
          </div>
          <div>
            <div className="font-display tracking-[0.22em] text-xs text-[#00AEEF] mb-3">CONTACTO</div>
            <ul className="space-y-2 text-white/70">
              <li>hola@neonexaprint.mx</li>
              <li>+52 55 5555 5555</li>
              <li>CDMX · Área Metropolitana</li>
            </ul>
          </div>
        </div>
        <div className="max-w-[90rem] mx-auto px-6 py-5 border-t border-white/5 text-xs text-white/40 flex flex-wrap gap-4 justify-between items-center">
          <span>© {new Date().getFullYear()} Neonexa Print. Color que vende.</span>
          <div className="flex gap-4">
            <Link to="/terminos" className="hover:text-white/70">Términos y condiciones</Link>
            <Link to="/privacidad" className="hover:text-white/70">Aviso de privacidad</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
