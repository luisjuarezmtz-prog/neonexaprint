import React from 'react';
import { Link } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import { FileText } from 'lucide-react';

const h2 = "font-display text-2xl font-black uppercase mt-10 mb-3 text-[#00F0FF]";
const p = "text-white/70 leading-relaxed";
const ul = "text-white/70 leading-relaxed list-disc pl-6 space-y-1";

export default function Terminos() {
  return (
    <PageShell>
      <div className="max-w-3xl mx-auto px-6 pt-16 pb-24">
        <div className="font-display tracking-[0.4em] text-[#00F0FF] text-xs flex items-center gap-2"><FileText size={14}/>NEONEXA PRINT</div>
        <h1 className="font-display text-4xl md:text-5xl font-black mt-3 uppercase">Términos y Condiciones</h1>
        <p className="text-white/50 text-sm mt-3">Última actualización: 19 de julio de 2026</p>

        <p className={p + ' mt-8'}>
          Al crear una cuenta o realizar un pedido en Neonexa Print aceptas estos términos y condiciones, así como nuestro{' '}
          <Link to="/privacidad" className="text-[#00F0FF]">Aviso de Privacidad</Link>.
        </p>

        <h2 className={h2}>1. El servicio</h2>
        <p className={p}>
          Neonexa Print ofrece impresión DTF (Textil y UV), productos personalizados, kits corporativos, herramientas de preparación de
          archivos (Tools) y una biblioteca de imágenes por packs, bajo suscripción o compra directa según el producto.
        </p>

        <h2 className={h2}>2. Tu cuenta</h2>
        <p className={p}>
          Eres responsable de mantener la confidencialidad de tu contraseña y de toda actividad que ocurra bajo tu cuenta. Debes
          proporcionar información verdadera al registrarte.
        </p>

        <h2 className={h2}>3. Archivos y responsabilidad del cliente</h2>
        <p className={p}>
          Al subir un archivo para impresión (DTF Textil, DTF UV o Personalizados) confirmas que el archivo es correcto y autorizas su
          impresión tal como se muestra en la vista previa. Eres responsable del contenido de tus diseños, incluyendo que cuentes con los
          derechos necesarios sobre cualquier imagen, logo o texto que incluyas.
        </p>

        <h2 className={h2}>4. Precios y pagos</h2>
        <ul className={ul}>
          <li>Los precios se muestran en pesos mexicanos (MXN) e incluyen IVA salvo que se indique lo contrario.</li>
          <li>El pago se procesa a través de Mercado Pago. El pedido se confirma como pagado únicamente cuando Mercado Pago confirma la transacción — nunca antes.</li>
          <li>En pedidos de Personalizados puedes elegir pagar el total o un anticipo del 50%.</li>
          <li>Los cupones de descuento tienen vigencia, monto mínimo y límite de usos definidos al momento de su emisión.</li>
        </ul>

        <h2 className={h2}>5. Cotizaciones (kits corporativos y proyectos especiales)</h2>
        <p className={p}>
          Las solicitudes de cotización no representan un pedido confirmado ni un cobro. Te contactaremos con una propuesta formal antes
          de cualquier producción o cobro.
        </p>

        <h2 className={h2}>6. Producción y entregas</h2>
        <p className={p}>
          Damos seguimiento a cada pedido con un historial de estados (recibido, en revisión, en producción, listo, enviado, entregado).
          Los tiempos de producción y entrega pueden variar según el volumen del pedido y la temporada.
        </p>

        <h2 className={h2}>7. Membresías</h2>
        <p className={p}>
          Las membresías dan acceso a Neonexa Tools según el plan contratado. Puedes cambiar de plan o cancelar en cualquier momento;
          la cancelación aplica al final del periodo ya pagado, conservando el acceso hasta esa fecha.
        </p>

        <h2 className={h2}>8. Biblioteca de imágenes (Packs)</h2>
        <p className={p}>
          Los packs se venden completos, no por imagen individual. La licencia de uso (personal, comercial, comercial sin reventa o
          exclusiva) se indica en cada pack y debes respetarla al usar las imágenes.
        </p>

        <h2 className={h2}>9. Cancelaciones y reembolsos</h2>
        <p className={p}>
          Por ser productos personalizados de producción bajo pedido, una vez iniciada la producción no es posible cancelar ni
          reembolsar. Si detectas un error atribuible a nosotros, contáctanos y lo resolveremos.
        </p>

        <h2 className={h2}>10. Limitación de responsabilidad</h2>
        <p className={p}>
          Las herramientas de análisis y preparación de archivos (Tools) son apoyos automatizados; la aprobación final del archivo antes
          de imprimir es siempre responsabilidad del cliente.
        </p>

        <h2 className={h2}>11. Cambios a estos términos</h2>
        <p className={p}>
          Podemos actualizar estos términos. Publicaremos cualquier cambio en esta misma página con la fecha de última actualización.
        </p>

        <h2 className={h2}>12. Contacto</h2>
        <p className={p}>
          Dudas sobre estos términos: <a href="mailto:contacto@neonexaprint.com.mx" className="text-[#00F0FF]">contacto@neonexaprint.com.mx</a>.
        </p>
      </div>
    </PageShell>
  );
}
