import "@testing-library/jest-dom";

// Radix UI (Checkbox/Switch, vía su hook interno `useSize`) usa
// `ResizeObserver` para medir el control y sincronizar el `<input>` oculto de
// accesibilidad ("bubble input"). jsdom no lo implementa: sin este stub,
// cualquier test que monte `Checkbox`/`Switch` (p. ej. `menu-item-form`)
// lanza `ReferenceError: ResizeObserver is not defined` al montar. El stub no
// necesita observar de verdad — ningún test depende de que se disparen los
// callbacks de resize, solo de que la clase exista.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
