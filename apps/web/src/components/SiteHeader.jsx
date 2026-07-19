import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import NeonLogo from './NeonLogo';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { Menu, X, LogOut, User2, ShoppingBag } from 'lucide-react';

export default function SiteHeader() {
  const { user, isAuthed, logout } = useAuth();
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  const links = [
    { to: '/', label: 'Inicio' },
    { to: '/dtf/textil', label: 'DTF Textil' },
    { to: '/dtf/uv', label: 'DTF UV' },
    { to: '/personalizados', label: 'Personalizados' },
    { to: '/packs', label: 'Packs' },
    { to: '/membresias', label: 'Membresías' },
    { to: '/tools', label: 'Tools' },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-[#00AEEF]/15 bg-[#0B0B0B]/85 backdrop-blur-xl">
      <div className="max-w-[90rem] mx-auto px-6 py-4 flex items-center gap-8">
        <Link to="/" className="shrink-0"><NeonLogo /></Link>
        <nav className="hidden lg:flex items-center gap-7 ml-4">
          {links.map(l => (
            <NavLink key={l.to} to={l.to} end={l.to==='/'}
              className={({isActive}) =>
                `font-display text-[12px] tracking-[0.22em] uppercase transition-colors ${isActive ? 'text-[#00F0FF]' : 'text-white/70 hover:text-white'}`}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Link to="/cart" className="relative text-white/80 hover:text-[#00F0FF] p-1" aria-label="carrito">
            <ShoppingBag size={20}/>
            {count > 0 && <span className="absolute -top-1 -right-1 bg-[#FF2D95] text-[#0B0B0B] text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{count}</span>}
          </Link>
          {isAuthed ? (
            <>
              <Link to="/dashboard" className="hidden sm:flex items-center gap-2 text-white/80 hover:text-white text-sm">
                <User2 size={16}/> <span className="truncate max-w-[140px]">{user?.name || user?.email}</span>
              </Link>
              <button onClick={() => { logout(); nav('/'); }} className="nx-btn-ghost px-4 py-2 text-xs flex items-center gap-2">
                <LogOut size={14}/> Salir
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="hidden sm:inline-block nx-btn-ghost px-4 py-2 text-xs">Entrar</Link>
              <Link to="/register" className="nx-btn-primary px-4 py-2 text-xs">Crear cuenta</Link>
            </>
          )}
          <button onClick={() => setOpen(o => !o)} className="lg:hidden text-white p-1" aria-label="menu">
            {open ? <X/> : <Menu/>}
          </button>
        </div>
      </div>
      {open && (
        <div className="lg:hidden border-t border-[#00AEEF]/15 px-6 py-4 flex flex-col gap-3 bg-[#0B0B0B]">
          {links.map(l => (
            <NavLink key={l.to} to={l.to} end={l.to==='/'} onClick={() => setOpen(false)}
              className="font-display text-sm tracking-[0.2em] uppercase text-white/80">{l.label}</NavLink>
          ))}
        </div>
      )}
    </header>
  );
}
