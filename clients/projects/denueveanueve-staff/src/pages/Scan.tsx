import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRScannerCard } from '@/components/staff/QRScannerCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ScanLine } from 'lucide-react';

export default function Scan() {
  const navigate = useNavigate();
  const [manualToken, setManualToken] = useState('');
  const [showManual, setShowManual] = useState(false);

  const handleScanSuccess = useCallback((qrToken: string) => {
    navigate('/verify-customer', { state: { qrToken } });
  }, [navigate]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualToken.trim()) {
      navigate('/verify-customer', { state: { qrToken: manualToken.trim() } });
    }
  };

  return (
    <div className="px-4 pt-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <ScanLine className="h-6 w-6 text-primary" />
          Escanear QR
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Escanea el QR del cliente para verificar su visita</p>
      </div>

      <QRScannerCard onScanSuccess={handleScanSuccess} onFallbackManual={() => setShowManual(true)} />

      <div className="mt-4">
        <Button
          variant="outline"
          className="w-full border-border text-foreground"
          onClick={() => setShowManual(!showManual)}
        >
          <Search className="mr-2 h-4 w-4" />
          {showManual ? 'Ocultar búsqueda manual' : 'Buscar manualmente'}
        </Button>
      </div>

      {showManual && (
        <form onSubmit={handleManualSubmit} className="mt-4 space-y-3 animate-slide-up">
          <Input
            placeholder="Token QR o buscar cliente..."
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            className="h-12 bg-card border-border text-foreground"
          />
          <div className="flex gap-2">
            <Button type="submit" className="flex-1 gradient-gold text-primary-foreground shadow-gold h-12">
              Buscar por token
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-12 border-border text-foreground"
              onClick={() => navigate('/customers')}
            >
              Buscar cliente
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
