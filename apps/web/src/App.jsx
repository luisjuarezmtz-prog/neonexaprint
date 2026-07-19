import React from 'react';
import { Route, Routes, Navigate, BrowserRouter as Router } from 'react-router-dom';
import ScrollToTop from './components/ScrollToTop';
import { AuthProvider } from '@/lib/auth';
import { CartProvider } from '@/lib/cart';
import { MembershipProvider } from '@/lib/membership';
import HomePage from './pages/HomePage';
import Products from './pages/Products';
import Personalizados from './pages/Personalizados';
import PersonalizarProducto from './pages/PersonalizarProducto';
import Membresias from './pages/Membresias';
import MembresiasRetorno from './pages/MembresiasRetorno';
import Privacidad from './pages/Privacidad';
import Terminos from './pages/Terminos';
import Dashboard from './pages/Dashboard';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import VerifyEmail from './pages/VerifyEmail';
import ToolsHub from './pages/tools/ToolsHub';
import InspectorTool from './pages/tools/InspectorTool';
import CalculadoraTool from './pages/tools/CalculadoraTool';
import GangSheetTool from './pages/tools/GangSheetTool';
import BackgroundRemoverTool from './pages/tools/BackgroundRemoverTool';
import UpscalerTool from './pages/tools/UpscalerTool';
import VectorizerTool from './pages/tools/VectorizerTool';
import TransparencyCleanerTool from './pages/tools/TransparencyCleanerTool';
import HalftoneSmartTool from './pages/tools/HalftoneSmartTool';
import ShirtSimulatorTool from './pages/tools/ShirtSimulatorTool';
import RipPreparerTool from './pages/tools/RipPreparerTool';
import DtfTextil from './pages/dtf/DtfTextil';
import DtfUv from './pages/dtf/DtfUv';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import CheckoutRetorno from './pages/CheckoutRetorno';
import Packs from './pages/Packs';
import PackDetail from './pages/PackDetail';
import PackRetorno from './pages/PackRetorno';
import Admin from './pages/admin/Admin';
import WhatsAppButton from './components/WhatsAppButton';
import { Toaster } from 'sonner';

const APEX_HOSTS = ['neonexaprint.com.mx', 'www.neonexaprint.com.mx'];

function App() {
  if (typeof window !== 'undefined' && APEX_HOSTS.includes(window.location.hostname)) {
    window.location.replace(`https://app.neonexaprint.com.mx${window.location.pathname}${window.location.search}${window.location.hash}`);
    return null;
  }

  return (
    <AuthProvider>
      <MembershipProvider>
      <CartProvider>
        <Router>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/productos" element={<Products />} />
            <Route path="/personalizados" element={<Personalizados />} />
            <Route path="/personalizados/:slug" element={<PersonalizarProducto />} />
            <Route path="/membresias" element={<Membresias />} />
            <Route path="/membresias/retorno" element={<MembresiasRetorno />} />
            <Route path="/privacidad" element={<Privacidad />} />
            <Route path="/terminos" element={<Terminos />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verificar" element={<VerifyEmail />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/dtf/textil" element={<DtfTextil />} />
            <Route path="/dtf/uv" element={<DtfUv />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/checkout/retorno" element={<CheckoutRetorno />} />
            <Route path="/packs" element={<Packs />} />
            <Route path="/packs/retorno" element={<PackRetorno />} />
            <Route path="/packs/:slug" element={<PackDetail />} />
            <Route path="/tools" element={<ToolsHub />} />
            <Route path="/tools/inspector" element={<InspectorTool />} />
            <Route path="/tools/calculadora" element={<CalculadoraTool />} />
            <Route path="/tools/gang-sheet" element={<GangSheetTool />} />
            <Route path="/tools/background-remover" element={<BackgroundRemoverTool />} />
            <Route path="/tools/upscaler" element={<UpscalerTool />} />
            <Route path="/tools/vectorizer" element={<VectorizerTool />} />
            <Route path="/tools/transparency-cleaner" element={<TransparencyCleanerTool />} />
            <Route path="/tools/halftone-smart" element={<HalftoneSmartTool />} />
            <Route path="/tools/shirt-simulator" element={<ShirtSimulatorTool />} />
            <Route path="/tools/rip-preparer" element={<RipPreparerTool />} />
            <Route path="/tools/mockup" element={<Navigate to="/tools/shirt-simulator" replace />} />
            <Route path="/tools/print" element={<Navigate to="/tools/rip-preparer" replace />} />
            <Route path="/tools/halftone" element={<Navigate to="/tools/halftone-smart" replace />} />
          </Routes>
          <WhatsAppButton />
          <Toaster theme="dark" position="top-center" richColors closeButton />
        </Router>
      </CartProvider>
      </MembershipProvider>
    </AuthProvider>
  );
}

export default App;
