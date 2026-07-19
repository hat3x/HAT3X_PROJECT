// Suite de ACEPTACIÓN de la verificación de teléfono en el registro (sub-8).
//
// Cierra los cuatro criterios de la subtarea con Supabase mockeado (flujo) y con las
// utilidades puras (ya cubiertas aparte). En vez de duplicar los caminos felices ya
// probados, esta suite se centra en los casos NEGATIVOS y DINÁMICOS que el resto de
// tests no ejercita —que es donde de verdad se sostiene o se cae cada criterio—:
//
//   (a) register_my_customer_account NO se llama si el teléfono no está confirmado.
//       · Ya cubierto (camino feliz): Register.test.tsx afirma que la RPC no se llama
//         antes de verificar (ni con un código incompleto).
//       · NUEVO aquí: un código OTP ERRÓNEO tampoco enlaza —la RPC nunca se ejecuta—,
//         de modo que un código inválido no "cuela" una cuenta enlazada.
//
//   (b) tras confirmar el OTP, la RPC se llama con el teléfono correcto.
//       · NUEVO aquí: con un teléfono DISTINTO del resto de tests, para probar que el
//         valor viaja de verdad (no hay número "hardcodeado"): el SMS usa el E.164
//         normalizado y la RPC recibe el teléfono tal cual lo tecleó el usuario (p_phone).
//
//   (c) PHONE_NOT_VERIFIED se traduce a un mensaje claro y permite reintentar.
//       · Ya cubierto (reapertura): Register.test.tsx afirma aviso + reenvío + campo.
//       · NUEVO aquí: el reintento LLEGA A BUEN PUERTO (2º OTP correcto → 2ª RPC OK →
//         navega). "Permitir reintentar" no es solo reabrir: es poder terminar.
//
//   (d) el reenvío de código respeta la espera mínima.
//       · Ya cubierto (estados estáticos): PhoneOtpStep.test.tsx afirma "durante el
//         cooldown no hay botón" y "sin cooldown, reenvía".
//       · NUEVO aquí: la TRANSICIÓN dinámica completa —bloqueado durante la espera,
//         habilitado al agotarse y RE-ARMADO tras reenviar (no se reenvía en ráfaga)—.
//
// Se envuelve con el <I18nProvider> real (locale por defecto: español) para afirmar
// sobre el texto que ve el usuario, igual que Register.test.tsx y PhoneOtpStep.test.tsx.
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/lib/i18n';

// Dobles hoisted (vi.mock se iza por encima de las constantes; vi.hoisted evita el
// ReferenceError al compartir los mocks entre la fábrica y las aserciones), mismo
// patrón que Register.test.tsx para reproducir fielmente las fronteras del flujo.
const mocks = vi.hoisted(() => ({
  auth: {
    updateUser: vi.fn(),
    verifyOtp: vi.fn(),
    resend: vi.fn(),
    getSession: vi.fn(),
  },
  rpc: vi.fn(),
  navigate: vi.fn(),
  signUp: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  authState: { user: null as unknown, loading: false },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: mocks.auth, rpc: mocks.rpc },
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/lib/salon-context', () => ({
  useSalon: () => ({ id: 'salon-1', name: 'Salón Test' }),
}));
vi.mock('@/lib/auth', async (importOriginal) => {
  // Mantiene mapAuthError real (puro) y sólo sustituye useAuth, para no montar el
  // AuthProvider (que se suscribiría a onAuthStateChange).
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useAuth: () => ({ signUp: mocks.signUp, user: mocks.authState.user, loading: mocks.authState.loading }),
  };
});

// Imports DESPUÉS de declarar los mocks (respeta el izado de vi.mock).
import Register from './Register';
import PhoneOtpStep from '@/components/PhoneOtpStep';
import type { ConfirmOtpResult, SendOtpResult } from '@/lib/phone-verification';

// input-otp deja timers de sincronización de selección sin limpiar al desmontar; los
// drenamos tras cada test con jsdom aún vivo (mismo patrón que Register.test.tsx).
afterEach(async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  // Por defecto NO hay sesión previa (alta normal, sin reanudación de sub-6).
  mocks.authState.user = null;
  mocks.authState.loading = false;
  // Camino feliz por defecto: hay sesión tras signUp; el SMS se envía y se verifica ok,
  // y la RPC enlaza. Cada test sobrescribe SÓLO la pieza que quiere poner a prueba.
  mocks.signUp.mockResolvedValue({ data: { user: {}, session: { access_token: 'tok' } }, error: null });
  mocks.auth.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
  mocks.auth.verifyOtp.mockResolvedValue({ data: {}, error: null });
  mocks.auth.resend.mockResolvedValue({ data: {}, error: null });
  mocks.auth.getSession.mockResolvedValue({ data: { session: null } });
  mocks.rpc.mockResolvedValue({ data: { outcome: 'created' }, error: null });
});

function renderRegister() {
  return render(
    <I18nProvider>
      <Register />
    </I18nProvider>
  );
}

/** Rellena el formulario con datos válidos, acepta los términos y lo envía. */
function fillAndSubmit(container: HTMLElement, phone = '600123456') {
  const set = (id: string, value: string) =>
    fireEvent.change(container.querySelector(`#${id}`) as HTMLInputElement, { target: { value } });
  set('firstName', 'Ana');
  set('lastName', 'García');
  set('phone', phone);
  set('email', 'ana@example.com');
  set('dateOfBirth', '1990-01-01');
  set('password', 'supersecret');
  // Aceptar los términos (primer checkbox: términos > marketing > whatsapp).
  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  fireEvent.submit(container.querySelector('form') as HTMLFormElement);
}

/** Espera a que aparezca el campo del código OTP (el SMS ya "salió"). */
async function waitForCodeInput(container: HTMLElement) {
  await waitFor(() => expect(container.querySelector('input')).not.toBeNull());
  return container.querySelector('input') as HTMLInputElement;
}

// ─────────────────────────────────────────────────────────────────────────────
// (a) La RPC de enlace NO se llama si el teléfono no está confirmado.
// ─────────────────────────────────────────────────────────────────────────────
describe('(a) register_my_customer_account NO se llama si el teléfono no está confirmado', () => {
  it('un código OTP ERRÓNEO no verifica el teléfono → la RPC de enlace nunca se ejecuta (y se puede reintentar)', async () => {
    // Caso negativo que el camino feliz no cubre: si verifyOtp rechaza el código, el
    // teléfono NO queda confirmado y el enlace por RPC debe seguir sin dispararse.
    mocks.auth.verifyOtp.mockResolvedValue({
      data: {},
      error: { code: 'otp_invalid', message: 'Invalid token' },
    });

    const { container } = renderRegister();
    fillAndSubmit(container);

    // Se envió el SMS (updateUser con el E.164), pero aún no hay enlace por RPC.
    await waitFor(() => expect(mocks.auth.updateUser).toHaveBeenCalledWith({ phone: '+34600123456' }));
    expect(mocks.rpc).not.toHaveBeenCalled();

    const input = await waitForCodeInput(container);
    fireEvent.change(input, { target: { value: '654321' } });

    // Se intentó verificar y falló…
    await waitFor(() => expect(mocks.auth.verifyOtp).toHaveBeenCalledTimes(1));
    // …con un error LEGIBLE, dejando el paso disponible para reintentar…
    await waitFor(() =>
      expect(screen.getByText('El código introducido no es correcto. Revísalo e inténtalo de nuevo.')).toBeTruthy()
    );
    // …y, lo esencial: la RPC de enlace NUNCA se llamó ni se navegó a la app.
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (b) Tras confirmar el OTP, la RPC se llama con el teléfono correcto.
// ─────────────────────────────────────────────────────────────────────────────
describe('(b) tras confirmar el OTP, la RPC se llama con el teléfono correcto', () => {
  it('propaga el teléfono TECLEADO a la RPC (p_phone) y el E.164 normalizado al SMS/verificación', async () => {
    // Teléfono distinto del resto de tests: prueba que el valor viaja de verdad (sin
    // número "hardcodeado"). El SMS usa el E.164; la RPC recibe el teléfono tal cual.
    const { container } = renderRegister();
    fillAndSubmit(container, '611 222 333');

    // El SMS sale con el E.164 normalizado…
    await waitFor(() => expect(mocks.auth.updateUser).toHaveBeenCalledWith({ phone: '+34611222333' }));
    // …y la RPC sigue SIN llamarse hasta que el teléfono se confirma (gating).
    expect(mocks.rpc).not.toHaveBeenCalled();

    const input = await waitForCodeInput(container);
    fireEvent.change(input, { target: { value: '123456' } });

    // Verificación con el MISMO E.164 (type phone_change)…
    await waitFor(() =>
      expect(mocks.auth.verifyOtp).toHaveBeenCalledWith({
        phone: '+34611222333',
        token: '123456',
        type: 'phone_change',
      })
    );
    // …y recién entonces el enlace, con el teléfono TECLEADO en p_phone.
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith('register_my_customer_account', {
        p_salon_id: 'salon-1',
        p_phone: '611 222 333',
        p_full_name: 'Ana García',
        p_email: 'ana@example.com',
      })
    );
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/home'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (c) PHONE_NOT_VERIFIED → mensaje claro y permite reintentar (hasta completar).
// ─────────────────────────────────────────────────────────────────────────────
describe('(c) PHONE_NOT_VERIFIED se traduce a un mensaje claro y permite reintentar', () => {
  it('primer intento rechazado con PHONE_NOT_VERIFIED → aviso claro + reapertura; el reintento verifica y COMPLETA el registro', async () => {
    // El servidor rechaza el PRIMER enlace exigiendo teléfono verificado; el segundo
    // (ya verificado) tiene éxito. Así probamos que "permitir reintentar" termina bien.
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'PHONE_NOT_VERIFIED' } })
      .mockResolvedValue({ data: { outcome: 'created' }, error: null });

    const { container } = renderRegister();
    fillAndSubmit(container);

    const firstInput = await waitForCodeInput(container);
    fireEvent.change(firstInput, { target: { value: '123456' } });

    // La 1ª RPC rechaza → mensaje CLARO (toast) + aviso de verificación obligatoria…
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith('Debes verificar tu número de teléfono para completar el registro.')
    );
    await waitFor(() => expect(screen.getByText('Verificación obligatoria')).toBeTruthy());
    // …SIN callejón sin salida: no se navega y se reabre la verificación (reenvía SMS)…
    expect(mocks.navigate).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.auth.updateUser).toHaveBeenCalledTimes(2));

    // …el usuario REINTENTA: reintroduce el código → 2ª verificación OK → 2ª RPC OK → navega.
    const secondInput = await waitForCodeInput(container);
    fireEvent.change(secondInput, { target: { value: '123456' } });
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/home'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (d) El reenvío de código respeta la espera mínima (transición dinámica completa).
// ─────────────────────────────────────────────────────────────────────────────
describe('(d) el reenvío de código respeta la espera mínima', () => {
  const sendOk = (e164 = '+34600123456'): SendOtpResult => ({ ok: true, e164 });
  const verifyOk = (): ConfirmOtpResult => ({ ok: true });

  it('bloquea el reenvío durante la espera, lo habilita al agotarse y RE-ARMA la cuenta atrás tras reenviar', async () => {
    // El componente inyecta las acciones por prop (sin Supabase). Usamos una espera de
    // 1s con el reloj real: basta para observar la transición sin tests lentos.
    const onResendCode = vi.fn(async () => sendOk());
    render(
      <I18nProvider>
        <PhoneOtpStep
          phone="+34600123456"
          onSendCode={vi.fn(async () => sendOk())}
          onResendCode={onResendCode}
          onVerifyCode={vi.fn(async () => verifyOk())}
          resendCooldownSeconds={1}
        />
      </I18nProvider>
    );

    // Nada más enviar el SMS inicial, la espera mínima está ACTIVA: hay cuenta atrás,
    // NO hay botón de reenviar y onResendCode no se ha llamado.
    await waitFor(() => expect(screen.getByText('Podrás reenviarlo en')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Reenviar código' })).toBeNull();
    expect(onResendCode).not.toHaveBeenCalled();

    // Al AGOTARSE la espera mínima, aparece el botón de reenviar.
    const resendBtn = await screen.findByRole('button', { name: 'Reenviar código' }, { timeout: 4000 });

    // Reenviar → llama a onResendCode y confirma el reenvío…
    fireEvent.click(resendBtn);
    await waitFor(() => expect(onResendCode).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Te hemos enviado un código nuevo.')).toBeTruthy());

    // …y RE-ARMA la espera mínima: el botón vuelve a desaparecer (no se reenvía en ráfaga).
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reenviar código' })).toBeNull());
  });
});
