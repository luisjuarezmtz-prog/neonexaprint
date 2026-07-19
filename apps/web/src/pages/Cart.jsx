import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import { useCart } from '@/lib/cart';
import { money } from '@/lib/neonexa';
import { Trash2, ShoppingBag, ArrowRight } from 'lucide-react';

export default function Cart() {
  const { items, remove, subtotal } = useCart();
  const nav = useNavigate();
  const cur = items[0]?.currency || 'MXN';

  return (
    <PageShell>
      <div className="max-w-[72rem] mx-auto px-6 pt-14 pb-24">
        <h1 className="font-display text-5xl font-black uppercase flex items-center gap-4"><ShoppingBag className="text-[#00AEEF]" size={40}/>Carrito</h1>

        {items.length === 0 ? (
          <div className="nx-card p-16 text-center mt-10">
            <div className="font-display text-2xl uppercase">Tu carrito está vacío</div>
            <p className="text-white/60 mt-2">Empieza con un pedido de impresión.</p>
            <div className="mt-6 flex gap-3 justify-center flex-wrap">
              <Link to="/dtf/textil" className="nx-btn-primary px-5 py-3">DTF Textil</Link>
              <Link to="/dtf/uv" className="nx-btn-ghost px-5 py-3">DTF UV</Link>
            </div>
          </div>
        ) : (
          <div className="mt-10 grid lg:grid-cols-[1fr_340px] gap-8 items-start">
            <div className="space-y-4">
              {items.map(it => (
                <div key={it.id} className="nx-card p-4 flex gap-4 items-center">
                  <div className="w-20 h-20 shrink-0 nx-checker rounded flex items-center justify-center overflow-hidden">
                    {it.thumb ? <img src={it.thumb} alt="" className="max-w-full max-h-full object-contain"/> : <ShoppingBag className="text-white/30"/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{it.title}</div>
                    <div className="text-xs text-white/50 mt-1">{it.unitLabel}</div>
                    <div className="text-xs text-white/40 mt-0.5">
                      {it.service === 'dtf_textil'
                        ? `${it.config.meters} m × ${it.config.qty} · ancho ${it.config.width} m`
                        : `${it.config.mode}${it.config.blanco?' · blanco':''}${it.config.barniz?' · barniz':''} × ${it.config.qty}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-black text-[#00AEEF]">{money(it.subtotal, it.currency)}</div>
                    <button onClick={()=>remove(it.id)} className="text-white/40 hover:text-[#FF2D95] mt-2"><Trash2 size={16}/></button>
                  </div>
                </div>
              ))}
            </div>
            <aside className="lg:sticky lg:top-24 nx-card p-6">
              <div className="font-display uppercase tracking-widest text-sm text-[#00F0FF]">Resumen</div>
              <div className="flex justify-between mt-4 text-sm"><span className="text-white/60">Subtotal</span><span>{money(subtotal, cur)}</span></div>
              <div className="flex justify-between mt-2 text-sm"><span className="text-white/60">IVA (16%)</span><span>{money(subtotal*0.16, cur)}</span></div>
              <div className="border-t border-white/10 my-4"/>
              <div className="flex justify-between items-center"><span className="text-white/60">Total</span><span className="font-display text-3xl font-black text-[#00AEEF]">{money(subtotal*1.16, cur)}</span></div>
              <button onClick={()=>nav('/checkout')} className="nx-btn-primary w-full py-3 mt-6 flex items-center justify-center gap-2">
                Ir a pagar <ArrowRight size={16}/>
              </button>
            </aside>
          </div>
        )}
      </div>
    </PageShell>
  );
}
