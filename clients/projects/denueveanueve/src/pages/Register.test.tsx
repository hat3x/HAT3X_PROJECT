// Test de integración del encadenado del registro (sub-5).
//
// Prueba el flujo COMPLETO de Register.tsx contra dobles de sus fronteras (Supabase,
// router, toasts, salón y useAuth), verificando lo que pide la subtarea:
//   1) signUp → paso de verificación OTP → la RPC de enlace `register_my_customer_account`
//      se llama SOLO tras confirmar el teléfono (gating), y
//   2) si la RPC devuelve PHONE_NOT_VERIFIED, se reabre la verificación con un aviso
//      claro y sin callejón sin salida (NO se navega; se reenvía un código nuevo).
//
// Se envuelve con el <I18nProvider> real para afirmar sobre el texto que ve el usuario
// (locale por defecto: español), como en PhoneOtpStep.test.tsx.
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/lib/i18n';

// Dobles hoisted (vi.mock se iza por encima de las constantes; vi.hoisted evita el
// ReferenceError al compartir los mocks entre la fábrica y las aserciones).
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
  // Sesión que expone useAuth: por defecto sin usuario (alta normal); los tests de
  // reanudación (sub-6) la rellenan con un usuario de teléfono sin confirmar.
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
  // Mantiene mapAuthError/mapRegisterError reales (puros) y sólo sustituye useAuth,
  // para no montar el AuthProvider (que se suscribiría a onAuthStateChange).
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useAuth: () => ({ signUp: mocks.signUp, user: mocks.authState.user, loading: mocks.authState.loading }),
  };
});

// Import DESPUÉS de declarar los mocks (respeta el izado de vi.mock).
import Register from './Register';

// input-otp deja timers de sincronización de selección sin limpiar al desmontar; los
// drenamos tras cada test con jsdom aún vivo (mismo patrón que PhoneOtpStep.test.tsx).
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
  // Camino feliz por defecto: hay sesión tras signUp; el SMS se envía y se verifica ok.
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
function fillAndSubmit(container: HTMLElement) {
  const set = (id: string, value: string) =>
    fireEvent.change(container.querySelector(`#${id}`) as HTMLInputElement, { target: { value } });
  set('firstName', 'Ana');
  set('lastName', 'García');
  set('phone', '600123456');
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

describe('Register — encadenado del registro (sub-5)', () => {
  it('signUp → verificación OTP → la RPC de enlace SOLO tras verificar; luego navega a /home', async () => {
    const { container } = renderRegister();
    fillAndSubmit(container);

    // Tras el alta con sesión, se entra al paso de verificación y se dispara el SMS
    // (updateUser con el E.164 normalizado)…
    await waitFor(() => expect(mocks.auth.updateUser).toHaveBeenCalledWith({ phone: '+34600123456' }));
    // …pero la RPC de enlace NO se ha llamado todavía (gating: solo tras verificar).
    expect(mocks.rpc).not.toHaveBeenCalled();

    // El usuario introduce el código → verifyOtp (phone_change) ok → recién ahí se enlaza.
    const input = await waitForCodeInput(container);
    fireEvent.change(input, { target: { value: '123456' } });

    await waitFor(() =>
      expect(mocks.auth.verifyOtp).toHaveBeenCalledWith({
        phone: '+34600123456',
        token: '123456',
        type: 'phone_change',
      })
    );
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith('register_my_customer_account', {
        p_salon_id: 'salon-1',
        p_phone: '600123456',
        p_full_name: 'Ana García',
        p_email: 'ana@example.com',
      })
    );
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/home'));
  });

  it('la RPC NO se llama antes de verificar aunque el teléfono ya esté en el paso OTP', async () => {
    // Refuerza el gating: mientras el usuario está en el paso de verificación pero aún
    // no ha metido un código válido, el enlace por RPC permanece sin ejecutarse.
    const { container } = renderRegister();
    fillAndSubmit(container);

    await waitForCodeInput(container);
    // Un código incompleto no dispara la verificación ni, por tanto, la RPC.
    const input = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '123' } });

    expect(mocks.auth.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('PHONE_NOT_VERIFIED → reabre la verificación con aviso, reenvía código y NO navega (sin callejón sin salida)', async () => {
    // El servidor exige el teléfono verificado y rechaza el enlace con PHONE_NOT_VERIFIED
    // (EXCEPTION P0001 con ese motivo).
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'PHONE_NOT_VERIFIED' } });

    const { container } = renderRegister();
    fillAndSubmit(container);

    const input = await waitForCodeInput(container);
    fireEvent.change(input, { target: { value: '123456' } });

    // La RPC se llamó y rechazó → aparece el aviso de verificación obligatoria…
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Verificación obligatoria')).toBeTruthy());
    // …NO se deja al usuario en un callejón sin salida: no se navega…
    expect(mocks.navigate).not.toHaveBeenCalled();
    // …y se reabre la verificación remontando el paso (se reenvía un código nuevo:
    // updateUser vuelve a llamarse) con el campo disponible para reintentar.
    await waitFor(() => expect(mocks.auth.updateUser).toHaveBeenCalledTimes(2));
    await waitForCodeInput(container);
    // Se avisó con el mensaje de teléfono no verificado (toast).
    expect(mocks.toast.error).toHaveBeenCalledWith('Debes verificar tu número de teléfono para completar el registro.');
  });

  it('un rechazo distinto (add-on no contratado) avisa y devuelve al formulario', async () => {
    // A diferencia de PHONE_NOT_VERIFIED, un FEATURE_NOT_ENABLED sí es terminal para
    // este intento: se avisa y se vuelve al formulario (reaparecen sus campos).
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'FEATURE_NOT_ENABLED' } });

    const { container } = renderRegister();
    fillAndSubmit(container);

    const input = await waitForCodeInput(container);
    fireEvent.change(input, { target: { value: '123456' } });

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        'Esta peluquería no tiene contratado este servicio. Ponte en contacto con el salón para más información.'
      )
    );
    // Vuelve al formulario: el campo de nombre reaparece; no se navega.
    await waitFor(() => expect(container.querySelector('#firstName')).not.toBeNull());
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});

describe('Register — reanudación de un registro a medias (sub-6)', () => {
  /** Sesión de una cuenta creada por signUp que abandonó ANTES de verificar el teléfono. */
  const pendingSessionUser = {
    email: 'ana@example.com',
    phone_confirmed_at: null,
    user_metadata: { phone: '600123456', first_name: 'Ana', last_name: 'García' },
  };

  it('con sesión y teléfono SIN confirmar, salta directo al OTP (sin pedir el formulario) y reenvía el código', async () => {
    mocks.authState.user = pendingSessionUser;

    const { container } = renderRegister();

    // No se pide el formulario: se abre el paso de verificación y se dispara el SMS con el
    // E.164 normalizado del teléfono guardado en la sesión (reutiliza el MISMO PhoneOtpStep).
    await waitFor(() => expect(mocks.auth.updateUser).toHaveBeenCalledWith({ phone: '+34600123456' }));
    await waitForCodeInput(container);
    // Aviso cálido de reanudación (no el gate obligatorio) y sin campos del formulario.
    expect(screen.getByText('Retomamos donde lo dejaste')).toBeTruthy();
    expect(container.querySelector('#firstName')).toBeNull();

    // Introduce el código → verifyOtp ok → recién ahí se enlaza la ficha con los datos
    // RECONSTRUIDOS de la sesión (mismo p_phone que el alta) → navega a /home.
    const input = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '123456' } });

    await waitFor(() =>
      expect(mocks.auth.verifyOtp).toHaveBeenCalledWith({
        phone: '+34600123456',
        token: '123456',
        type: 'phone_change',
      })
    );
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith('register_my_customer_account', {
        p_salon_id: 'salon-1',
        p_phone: '600123456',
        p_full_name: 'Ana García',
        p_email: 'ana@example.com',
      })
    );
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/home'));
  });

  it('con el teléfono YA confirmado, NO reanuda: muestra el formulario de alta y no envía ningún SMS', async () => {
    mocks.authState.user = { ...pendingSessionUser, phone_confirmed_at: '2026-07-19T10:00:00Z' };

    const { container } = renderRegister();

    // Sin reanudación: aparece el formulario (campo de nombre) y no se dispara el OTP.
    await waitFor(() => expect(container.querySelector('#firstName')).not.toBeNull());
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });
});
