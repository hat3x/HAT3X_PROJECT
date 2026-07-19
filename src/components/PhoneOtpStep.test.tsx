// Tests del paso de UI de verificación OTP (PhoneOtpStep).
//
// El componente recibe las tres acciones (enviar/reenviar/verificar) por prop, así que
// aquí las inyectamos como dobles `vi.fn()` que devuelven los mismos resultados
// discriminados que `phone-verification.ts`. No hace falta mockear Supabase ni las
// variables de entorno. Envolvemos con <I18nProvider> para que `t()` devuelva el texto
// real en español (locale por defecto) y podamos afirmar sobre lo que ve el usuario.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/lib/i18n';
import PhoneOtpStep from './PhoneOtpStep';
import type { ConfirmOtpResult, SendOtpResult } from '@/lib/phone-verification';

// input-otp programa timers de sincronización de selección (0/10/50 ms) que NO limpia
// al desmontar. Los drenamos —con el entorno de jsdom aún vivo y dentro de act()— tras
// cada test para que no salten después del teardown (donde `window` ya no existe).
afterEach(async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
});

const sendOk = (e164 = '+34600123456'): SendOtpResult => ({ ok: true, e164 });
const sendFail = (errorKey: string): SendOtpResult => ({ ok: false, errorKey });
const verifyOk = (): ConfirmOtpResult => ({ ok: true });
const verifyFail = (errorKey: string): ConfirmOtpResult => ({ ok: false, errorKey });

type Overrides = Partial<Parameters<typeof PhoneOtpStep>[0]>;

function setup(overrides: Overrides = {}) {
  const handlers = {
    phone: '+34600123456',
    onSendCode: vi.fn(async () => sendOk()),
    onResendCode: vi.fn(async () => sendOk()),
    onVerifyCode: vi.fn(async () => verifyOk()),
    onVerified: vi.fn(),
    onContinueWithoutVerification: vi.fn(),
    onChangeNumber: vi.fn(),
    ...overrides,
  };
  const utils = render(
    <I18nProvider>
      <PhoneOtpStep {...handlers} />
    </I18nProvider>
  );
  const getInput = () => utils.container.querySelector('input') as HTMLInputElement | null;
  return { ...utils, ...handlers, getInput };
}

/** Espera a que el campo del código esté en el DOM (el SMS ya "salió"). */
async function waitForCodeInput(getInput: () => HTMLInputElement | null) {
  await waitFor(() => expect(getInput()).not.toBeNull());
  return getInput() as HTMLInputElement;
}

describe('PhoneOtpStep', () => {
  it('envía el SMS al montar y muestra el título, el teléfono y el campo de código', async () => {
    const { onSendCode, getInput } = setup();

    await waitFor(() => expect(onSendCode).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Verifica tu teléfono')).toBeTruthy();
    expect(screen.getByText('+34600123456')).toBeTruthy();
    const input = await waitForCodeInput(getInput);
    // Accesibilidad: el campo lleva su etiqueta accesible (no hay label visible).
    expect(input.getAttribute('aria-label')).toBe('Código de verificación');
  });

  it('auto-verifica al completar los 6 dígitos y avisa al padre (onVerified)', async () => {
    const onVerifyCode = vi.fn(async () => verifyOk());
    const { onVerified, getInput } = setup({ onVerifyCode });

    const input = await waitForCodeInput(getInput);
    fireEvent.change(input, { target: { value: '123456' } });

    await waitFor(() => expect(onVerifyCode).toHaveBeenCalledWith('123456'));
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    expect(screen.getByText('¡Teléfono verificado!')).toBeTruthy();
  });

  it('muestra un error LEGIBLE (reusa la clave i18n) cuando el código es incorrecto', async () => {
    const onVerifyCode = vi.fn(async () => verifyFail('auth.error.otpInvalid'));
    const { onVerified, getInput } = setup({ onVerifyCode });

    const input = await waitForCodeInput(getInput);
    fireEvent.change(input, { target: { value: '654321' } });

    await waitFor(() =>
      expect(screen.getByText('El código introducido no es correcto. Revísalo e inténtalo de nuevo.')).toBeTruthy()
    );
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('mensaje HONESTO cuando no hay proveedor Phone configurado + salida "continuar sin verificar"', async () => {
    const onSendCode = vi.fn(async () => sendFail('auth.error.otpProviderUnavailable'));
    const { onContinueWithoutVerification } = setup({ onSendCode });

    await waitFor(() => expect(screen.getByText('Verificación por SMS no disponible')).toBeTruthy());
    // El texto honesto reutiliza la clave añadida a mapOtpError.
    expect(screen.getByText(/el envío de SMS todavía no está activado en esta peluquería/i)).toBeTruthy();
    // No se muestra el campo de código porque no se puede enviar.
    expect(screen.queryByLabelText('Código de verificación')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar sin verificar' }));
    expect(onContinueWithoutVerification).toHaveBeenCalledTimes(1);
  });

  it('reenvío con espera mínima: durante el cooldown NO hay botón de reenviar, hay cuenta atrás', async () => {
    const { getInput } = setup({ resendCooldownSeconds: 60, now: () => 1_000_000 });

    await waitForCodeInput(getInput);
    // Cuenta atrás visible (60s → "1:00") y sin botón "Reenviar código" habilitado.
    await waitFor(() => expect(screen.getByText('1:00')).toBeTruthy());
    expect(screen.getByText('Podrás reenviarlo en')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reenviar código' })).toBeNull();
  });

  it('sin cooldown, "Reenviar código" llama a onResendCode y confirma el reenvío', async () => {
    const onResendCode = vi.fn(async () => sendOk());
    const { getInput } = setup({ resendCooldownSeconds: 0, onResendCode });

    await waitForCodeInput(getInput);
    const resendBtn = await screen.findByRole('button', { name: 'Reenviar código' });
    fireEvent.click(resendBtn);

    await waitFor(() => expect(onResendCode).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Te hemos enviado un código nuevo.')).toBeTruthy());
  });

  it('el botón "Verificar y continuar" está deshabilitado hasta que el código está completo', async () => {
    const { onVerifyCode, getInput } = setup();

    const input = await waitForCodeInput(getInput);
    const verifyBtn = screen.getByRole('button', { name: 'Verificar y continuar' }) as HTMLButtonElement;
    expect(verifyBtn.disabled).toBe(true);

    // Un código incompleto lo mantiene deshabilitado y NO dispara la verificación.
    fireEvent.change(input, { target: { value: '123' } });
    expect((screen.getByRole('button', { name: 'Verificar y continuar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onVerifyCode).not.toHaveBeenCalled();
  });

  it('"Cambiar número" invoca onChangeNumber', async () => {
    const { onChangeNumber, getInput } = setup();

    await waitForCodeInput(getInput);
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar número' }));
    expect(onChangeNumber).toHaveBeenCalledTimes(1);
  });

  it('no envía nada automáticamente cuando autoSend=false (uso controlado)', async () => {
    const { onSendCode, getInput } = setup({ autoSend: false });

    // Muestra el campo directamente sin llamar al envío.
    await waitForCodeInput(getInput);
    expect(onSendCode).not.toHaveBeenCalled();
  });
});
