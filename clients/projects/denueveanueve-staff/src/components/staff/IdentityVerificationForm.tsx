import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ShieldCheck, Loader2, RefreshCw } from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

interface IdentityVerificationFormProps {
  customerId: string;
  onVerified: (method: string) => void;
}

const PIN_TABLES = ['visit_pins', 'verification_pins'] as const;
type PinTable = (typeof PIN_TABLES)[number];

function generatePin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function isMissingTableError(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return code === 'PGRST205' || code === '42P01';
}

export function IdentityVerificationForm({ customerId, onVerified }: IdentityVerificationFormProps) {
  const { session } = useAuth();
  const [pin, setPin] = useState('');
  const [generatedPin, setGeneratedPin] = useState<string | null>(null);
  const [pinId, setPinId] = useState<string | null>(null);
  const [pinTable, setPinTable] = useState<PinTable | null>(null);
  const [generating, setGenerating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const createPin = async () => {
    setGenerating(true);
    setError(null);
    setPin('');

    const newPin = generatePin();
    const newPinId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min

    let insertErr: { message?: string } | null = null;
    let resolvedTable: PinTable | null = null;

    for (const table of PIN_TABLES) {
      const { error: candidateErr } = await supabase
        .from(table as any)
        .insert({
          id: newPinId,
          customer_id: customerId,
          pin: newPin,
          expires_at: expiresAt,
          created_by_staff_id: session?.user?.id ?? null,
        } as any);

      if (!candidateErr) {
        resolvedTable = table;
        insertErr = null;
        break;
      }

      insertErr = candidateErr;
      if (!isMissingTableError(candidateErr)) {
        break;
      }
    }

    if (insertErr || !resolvedTable) {
      setError(`Error al generar PIN: ${insertErr?.message ?? 'tabla no disponible'}`);
      setGenerating(false);
      return;
    }

    setPinTable(resolvedTable);
    setGeneratedPin(newPin);
    setPinId(newPinId);
    setGenerating(false);
  };

  useEffect(() => {
    createPin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const handleVerify = async () => {
    setError(null);

    if (pin.length < 4) {
      setError('Introduce el PIN de 4 dígitos');
      return;
    }

    if (!pinId) {
      setError('No hay PIN activo. Genera uno nuevo.');
      return;
    }

    setVerifying(true);

    const tablesToTry = pinTable ? [pinTable] : [...PIN_TABLES];
    let data: any = null;
    let fetchErr: { message?: string } | null = null;
    let resolvedTable: PinTable | null = pinTable;

    for (const table of tablesToTry) {
      const { data: candidateData, error: candidateErr } = await supabase
        .from(table as any)
        .select('id, pin, expires_at, used')
        .eq('id', pinId)
        .maybeSingle();

      if (!candidateErr) {
        data = candidateData;
        resolvedTable = table;
        fetchErr = null;
        break;
      }

      fetchErr = candidateErr;
      if (!isMissingTableError(candidateErr)) {
        break;
      }
    }

    if (fetchErr || !data) {
      setError(fetchErr ? `PIN no encontrado: ${fetchErr.message ?? ''}` : 'PIN no encontrado');
      setVerifying(false);
      return;
    }

    if (data.used) {
      setError('Este PIN ya fue utilizado');
      setVerifying(false);
      return;
    }

    if (new Date(data.expires_at) < new Date()) {
      setError('PIN expirado. Genera uno nuevo.');
      setVerifying(false);
      return;
    }

    if (data.pin !== pin) {
      setError('PIN incorrecto');
      setVerifying(false);
      return;
    }

    const tableForUpdate = resolvedTable ?? pinTable ?? PIN_TABLES[0];
    await supabase
      .from(tableForUpdate as any)
      .update({ used: true } as any)
      .eq('id', pinId);

    setPinTable(tableForUpdate);
    setVerifying(false);
    onVerified('QR_PIN');
  };

  return (
    <div className="rounded-xl bg-card border border-border p-4">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">Verificar identidad</h3>
      </div>

      {generating ? (
        <div className="flex flex-col items-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
          <p className="text-sm text-muted-foreground">Generando PIN...</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-primary/10 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">
              Se envió un PIN al cliente. Pídele que te lo diga.
            </p>
            <p className="text-[10px] text-muted-foreground">Expira en 5 minutos</p>
          </div>

          <div>
            <Label className="text-foreground text-sm mb-2 block">
              Introduce el PIN del cliente
            </Label>
            <div className="flex justify-center">
              <InputOTP
                maxLength={4}
                value={pin}
                onChange={(val) => setPin(val)}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="h-14 w-14 text-xl bg-muted border-border" />
                  <InputOTPSlot index={1} className="h-14 w-14 text-xl bg-muted border-border" />
                  <InputOTPSlot index={2} className="h-14 w-14 text-xl bg-muted border-border" />
                  <InputOTPSlot index={3} className="h-14 w-14 text-xl bg-muted border-border" />
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 border-border text-foreground"
              onClick={createPin}
              disabled={verifying}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Nuevo PIN
            </Button>
            <Button
              className="flex-1 gradient-gold text-primary-foreground shadow-gold"
              onClick={handleVerify}
              disabled={verifying || pin.length < 4}
            >
              {verifying ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Verificar'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
