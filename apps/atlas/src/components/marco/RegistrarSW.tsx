"use client";
import { useEffect } from "react";

/**
 * Registra el service worker. No pinta nada.
 *
 * Sin esto no hay push: el evento lo recibe el worker, no la página — de hecho
 * llega con la app cerrada, que es justo la gracia.
 *
 * Los fallos se tragan a propósito: en un navegador sin soporte, o servido por
 * http desde una IP de la red local, `register` rechaza. Que Atlas no se instale
 * no es motivo para romper la pantalla.
 */
export function RegistrarSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
