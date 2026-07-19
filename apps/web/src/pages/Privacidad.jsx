import React from 'react';
import { Helmet } from 'react-helmet';
import PageShell from '@/components/PageShell';
import { ShieldCheck } from 'lucide-react';

const h2 = "font-display text-2xl font-black uppercase mt-10 mb-3 text-[#00F0FF]";
const p = "text-white/70 leading-relaxed";
const ul = "text-white/70 leading-relaxed list-disc pl-6 space-y-1";

export default function Privacidad() {
  return (
    <PageShell>
      <Helmet>
        <title>Aviso de Privacidad — Neonexa Print</title>
        <meta name="description" content="Aviso de privacidad de Neonexa Print conforme a la LFPDPPP: qué datos recabamos, para qué los usamos y cómo ejercer tus derechos ARCO." />
      </Helmet>
      <div className="max-w-3xl mx-auto px-6 pt-16 pb-24">
        <div className="font-display tracking-[0.4em] text-[#00F0FF] text-xs flex items-center gap-2"><ShieldCheck size={14}/>NEONEXA PRINT</div>
        <h1 className="font-display text-4xl md:text-5xl font-black mt-3 uppercase">Aviso de Privacidad</h1>
        <p className="text-white/50 text-sm mt-3">Última actualización: 19 de julio de 2026</p>

        <p className={p + ' mt-8'}>
          Neonexa Print ("nosotros"), con domicilio en Ciudad de México, México, es responsable del tratamiento de los datos personales
          que nos proporcionas, en cumplimiento de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).
        </p>

        <h2 className={h2}>Datos que recabamos</h2>
        <ul className={ul}>
          <li>Datos de identificación y contacto: nombre, correo electrónico, teléfono.</li>
          <li>Datos de facturación: razón social, RFC, uso de CFDI (solo si solicitas factura).</li>
          <li>Domicilio de envío, cuando aplique.</li>
          <li>Diseños y archivos que subes para tus pedidos.</li>
          <li>Datos de uso del sitio y de las herramientas (Tools), para aplicar límites de tu plan y prevenir abuso.</li>
        </ul>
        <p className={p}>
          <b className="text-white">No almacenamos datos de tarjetas de pago.</b> Los pagos se procesan directamente por Mercado Pago,
          nuestro proveedor de pasarela de pago; nunca vemos ni guardamos el número completo de tu tarjeta.
        </p>

        <h2 className={h2}>Finalidades del tratamiento</h2>
        <p className={p}>Usamos tus datos para:</p>
        <ul className={ul}>
          <li>Procesar y dar seguimiento a tus pedidos, cotizaciones y compras de packs.</li>
          <li>Emitir facturas cuando lo solicites.</li>
          <li>Enviarte notificaciones sobre el estado de tu pedido, membresía o cuenta.</li>
          <li>Brindarte soporte por correo o WhatsApp.</li>
          <li>Aplicar los límites de uso de tu plan de membresía.</li>
        </ul>
        <p className={p}>
          De forma secundaria (opcional, puedes oponerte sin afectar el servicio principal), podríamos usar tu correo para avisarte de
          promociones o novedades del catálogo.
        </p>

        <h2 className={h2}>Con quién compartimos tus datos</h2>
        <p className={p}>No vendemos tus datos personales. Los compartimos únicamente con:</p>
        <ul className={ul}>
          <li><b className="text-white">Mercado Pago</b>, para procesar el pago de tus pedidos y membresías.</li>
          <li>Nuestro proveedor de hospedaje y correo (Hostinger), únicamente como parte de la operación técnica del sitio.</li>
          <li>Autoridades, cuando exista requerimiento legal.</li>
        </ul>

        <h2 className={h2}>Derechos ARCO</h2>
        <p className={p}>
          Tienes derecho a Acceder, Rectificar, Cancelar u Oponerte (ARCO) al tratamiento de tus datos personales, así como a revocar tu
          consentimiento. Para ejercer cualquiera de estos derechos, escríbenos a{' '}
          <a href="mailto:contacto@neonexaprint.com.mx" className="text-[#00F0FF]">contacto@neonexaprint.com.mx</a> indicando tu nombre,
          el derecho que deseas ejercer y una copia de identificación oficial. Responderemos en un plazo máximo de 20 días hábiles.
        </p>

        <h2 className={h2}>Cookies y tecnologías similares</h2>
        <p className={p}>
          Usamos almacenamiento local del navegador (localStorage) para mantener tu sesión y el contenido de tu carrito de compras.
          No usamos cookies de rastreo publicitario de terceros.
        </p>

        <h2 className={h2}>Conservación de datos</h2>
        <p className={p}>
          Conservamos tus datos mientras tengas una cuenta activa y, después de eso, durante el plazo necesario para cumplir obligaciones
          fiscales y legales aplicables.
        </p>

        <h2 className={h2}>Cambios a este aviso</h2>
        <p className={p}>
          Podemos actualizar este aviso de privacidad. Publicaremos cualquier cambio en esta misma página con la fecha de última
          actualización.
        </p>

        <h2 className={h2}>Contacto</h2>
        <p className={p}>
          Para dudas sobre este aviso o el tratamiento de tus datos, escríbenos a{' '}
          <a href="mailto:contacto@neonexaprint.com.mx" className="text-[#00F0FF]">contacto@neonexaprint.com.mx</a>.
        </p>
      </div>
    </PageShell>
  );
}
