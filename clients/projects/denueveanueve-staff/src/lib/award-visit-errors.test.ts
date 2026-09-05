import { describe, it, expect } from 'vitest';
import {
  AWARD_ERROR_MESSAGES,
  classifyAwardError,
  messageForAwardError,
} from './award-visit-errors';

describe('classifyAwardError', () => {
  it('detecta el gating FEATURE_NOT_ENABLED de la RPC staff_award_visit', () => {
    expect(classifyAwardError('FEATURE_NOT_ENABLED')).toBe('FEATURE_NOT_ENABLED');
    // Da igual mayúsculas/minúsculas o que venga embebido en un mensaje más largo.
    expect(
      classifyAwardError('new row violates ... feature_not_enabled: loyalty add-on'),
    ).toBe('FEATURE_NOT_ENABLED');
  });

  it('el gating GANA a otros códigos que aparezcan en el mismo texto', () => {
    // Si la RPC mezclara varios términos, el add-on no contratado debe prevalecer:
    // así el staff nunca ve un mensaje que sugiera que puede reintentar/sortearlo.
    expect(classifyAwardError('FORBIDDEN FEATURE_NOT_ENABLED NO_LINES')).toBe(
      'FEATURE_NOT_ENABLED',
    );
  });

  it('clasifica el resto de códigos de negocio', () => {
    expect(classifyAwardError('FORBIDDEN')).toBe('FORBIDDEN');
    expect(classifyAwardError('CUSTOMER_NOT_FOUND')).toBe('CUSTOMER_NOT_FOUND');
    expect(classifyAwardError('NO_LINES')).toBe('NO_LINES');
  });

  it('cae a UNKNOWN ante texto vacío, nulo o no reconocido', () => {
    expect(classifyAwardError('')).toBe('UNKNOWN');
    expect(classifyAwardError(null)).toBe('UNKNOWN');
    expect(classifyAwardError(undefined)).toBe('UNKNOWN');
    expect(classifyAwardError('boom 500 internal')).toBe('UNKNOWN');
  });
});

describe('messageForAwardError', () => {
  it('traduce el gating al mensaje claro exigido por el negocio', () => {
    expect(messageForAwardError('FEATURE_NOT_ENABLED')).toBe(
      'Esta peluquería no tiene contratado este servicio.',
    );
    expect(messageForAwardError('FEATURE_NOT_ENABLED')).toBe(
      AWARD_ERROR_MESSAGES.FEATURE_NOT_ENABLED,
    );
  });

  it('devuelve el mensaje genérico ante un error desconocido', () => {
    expect(messageForAwardError('???')).toBe(AWARD_ERROR_MESSAGES.UNKNOWN);
  });
});
