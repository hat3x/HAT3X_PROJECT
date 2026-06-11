import { useState, useRef, useEffect } from "react";
import { Bot, X, Send, Phone, Mail, Sparkles, ExternalLink, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ChatAction {
  label: string;
  message?: string;
  navigate?: string;
  href?: string;
  primary?: boolean;
}

interface Message {
  role: "bot" | "user";
  text: string;
  actions?: ChatAction[];
}

type Intent =
  | "saludo"
  | "gracias"
  | "despedida"
  | "web"
  | "web_nueva"
  | "web_mejorar"
  | "web_asistente"
  | "automatizacion"
  | "auto_whatsapp"
  | "auto_formularios"
  | "auto_interno"
  | "app"
  | "app_clientes"
  | "app_interna"
  | "app_centralizar"
  | "clientes_whatsapp"
  | "citas"
  | "precio"
  | "plazos"
  | "contacto"
  | "proceso"
  | "mantenimiento"
  | "integraciones"
  | "default";

type MainTopic = "web" | "automatizacion" | "app" | "contacto" | null;

interface ChatContext {
  mainTopic: MainTopic;
  lastIntent: Intent | null;
  userMessagesCount: number;
  fallbackCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const EMAIL = "info@hat3x.com";
const PHONE = "+34 614 205 537";
const PHONE_RAW = "+34614205537";
const WHATSAPP_URL = `https://wa.me/${PHONE_RAW.replace("+", "")}`;

const INITIAL_ACTIONS: ChatAction[] = [
  { label: "Quiero mejorar mi web", message: "web_mejorar" },
  { label: "Quiero automatizar tareas", message: "automatizacion" },
  { label: "Necesito una app o plataforma", message: "app" },
  { label: "Hablar por WhatsApp", href: WHATSAPP_URL, primary: true },
];

const FALLBACK_ACTIONS: ChatAction[] = [
  { label: "Mejorar mi web", message: "web" },
  { label: "Automatizar tareas", message: "automatizacion" },
  { label: "Crear una app", message: "app" },
  { label: "Hablar con el equipo", navigate: "/contacto", primary: true },
];

const KEYWORD_INTENT_PAIRS: [string, Intent][] = [
  ["hola", "saludo"],
  ["buenas", "saludo"],
  ["buenos dias", "saludo"],
  ["hey", "saludo"],
  ["ola", "saludo"],

  ["gracias", "gracias"],
  ["muchas gracias", "gracias"],
  ["perfecto gracias", "gracias"],

  ["adios", "despedida"],
  ["hasta luego", "despedida"],
  ["nos vemos", "despedida"],
  ["bye", "despedida"],

  ["contacto", "contacto"],
  ["contactar", "contacto"],
  ["email", "contacto"],
  ["correo", "contacto"],
  ["telefono", "contacto"],
  ["llamar", "contacto"],
  ["hablar con", "contacto"],
  ["escribirnos", "contacto"],

  ["precio", "precio"],
  ["presupuesto", "precio"],
  ["presupeusto", "precio"],
  ["coste", "precio"],
  ["costo", "precio"],
  ["cuanto cuesta", "precio"],
  ["cuanto vale", "precio"],
  ["tarifa", "precio"],

  ["plazo", "plazos"],
  ["cuanto tarda", "plazos"],
  ["cuanto tiempo", "plazos"],
  ["semanas", "plazos"],
  ["meses", "plazos"],

  ["web nueva", "web_nueva"],
  ["nueva web", "web_nueva"],
  ["crear web", "web_nueva"],
  ["quiero una web", "web_nueva"],
  ["mejorar mi web", "web_mejorar"],
  ["mejorar web", "web_mejorar"],
  ["rediseno", "web_mejorar"],
  ["rediseño", "web_mejorar"],
  ["web actual", "web_mejorar"],
  ["web con asistente", "web_asistente"],
  ["asistente web", "web_asistente"],
  ["asistente inteligente", "web_asistente"],

  ["web", "web"],
  ["pagina web", "web"],
  ["pagina", "web"],
  ["sitio web", "web"],
  ["sitio", "web"],
  ["landing", "web"],
  ["website", "web"],

  ["automatizar whatsapp", "auto_whatsapp"],
  ["automatizar mensajes", "auto_whatsapp"],
  ["automatizar formularios", "auto_formularios"],
  ["formularios automaticos", "auto_formularios"],
  ["tareas internas", "auto_interno"],
  ["procesos internos", "auto_interno"],
  ["ahorrar tiempo en", "auto_interno"],

  ["automatizar", "automatizacion"],
  ["automatizacion", "automatizacion"],
  ["automtizar", "automatizacion"],
  ["ahorrar tiempo", "automatizacion"],
  ["tareas repetitivas", "automatizacion"],
  ["workflow", "automatizacion"],
  ["flujo", "automatizacion"],

  ["whatsapp", "clientes_whatsapp"],
  ["wasap", "clientes_whatsapp"],
  ["wsp", "clientes_whatsapp"],
  ["instagram", "clientes_whatsapp"],
  ["atencion al cliente", "clientes_whatsapp"],
  ["responder clientes", "clientes_whatsapp"],
  ["consultas", "clientes_whatsapp"],
  ["captar clientes", "clientes_whatsapp"],
  ["leads", "clientes_whatsapp"],

  ["cita", "citas"],
  ["reserva", "citas"],
  ["agenda", "citas"],
  ["agendar", "citas"],
  ["turnos", "citas"],
  ["booking", "citas"],
  ["recordatorio", "citas"],

  ["app para clientes", "app_clientes"],
  ["aplicacion para clientes", "app_clientes"],
  ["plataforma interna", "app_interna"],
  ["herramienta interna", "app_interna"],
  ["centralizar informacion", "app_centralizar"],
  ["centralizar información", "app_centralizar"],

  ["app", "app"],
  ["aplicacion", "app"],
  ["aplicion", "app"],
  ["plataforma", "app"],
  ["software", "app"],
  ["portal", "app"],
  ["area privada", "app"],
  ["herramienta", "app"],

  ["proceso", "proceso"],
  ["como trabajais", "proceso"],
  ["como funciona", "proceso"],
  ["pasos", "proceso"],
  ["metodologia", "proceso"],

  ["mantenimiento", "mantenimiento"],
  ["soporte", "mantenimiento"],
  ["incidencias", "mantenimiento"],
  ["actualizaciones", "mantenimiento"],

  ["integracion", "integraciones"],
  ["integrar", "integraciones"],
  ["crm", "integraciones"],
  ["erp", "integraciones"],
  ["api", "integraciones"],
  ["conectar herramientas", "integraciones"],
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;

  const dp: number[][] = Array.from({ length: la + 1 }, (_, i) =>
    Array.from({ length: lb + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[la][lb];
}

function matchesKeyword(input: string, keyword: string): boolean {
  if (input.includes(keyword)) return true;

  const kWords = keyword.split(" ");
  if (kWords.length > 1) {
    return kWords.every((w) => input.includes(w));
  }

  if (keyword.length < 5) return false;

  return input.split(" ").some((word) => {
    if (Math.abs(word.length - keyword.length) > 2) return false;
    return levenshtein(word, keyword) <= 1;
  });
}

function getIntentWeight(keyword: string, intent: Intent): number {
  let score = 1;

  if (keyword.includes(" ")) score += 2;
  if (
    intent === "web_nueva" ||
    intent === "web_mejorar" ||
    intent === "web_asistente" ||
    intent === "auto_whatsapp" ||
    intent === "auto_formularios" ||
    intent === "auto_interno" ||
    intent === "app_clientes" ||
    intent === "app_interna" ||
    intent === "app_centralizar"
  ) {
    score += 2;
  }

  return score;
}

function getMainTopicFromIntent(intent: Intent): MainTopic {
  if (intent.startsWith("web")) return "web";
  if (
    intent.startsWith("auto") ||
    intent === "automatizacion" ||
    intent === "clientes_whatsapp" ||
    intent === "citas"
  ) {
    return "automatizacion";
  }
  if (intent.startsWith("app")) return "app";
  if (intent === "contacto") return "contacto";
  return null;
}

function detectIntent(raw: string): { intent: Intent; confidence: number; matchedKeywords: string[] } {
  const input = normalize(raw);

  const bareIntents: Intent[] = [
    "web",
    "web_nueva",
    "web_mejorar",
    "web_asistente",
    "automatizacion",
    "auto_whatsapp",
    "auto_formularios",
    "auto_interno",
    "app",
    "app_clientes",
    "app_interna",
    "app_centralizar",
    "contacto",
    "precio",
    "plazos",
    "proceso",
    "citas",
    "mantenimiento",
    "integraciones",
    "clientes_whatsapp",
    "saludo",
    "gracias",
    "despedida",
    "default",
  ];

  if (bareIntents.includes(input as Intent)) {
    return {
      intent: input as Intent,
      confidence: 1,
      matchedKeywords: [input],
    };
  }

  const scores: Partial<Record<Intent, number>> = {};
  const matchesByIntent: Partial<Record<Intent, string[]>> = {};

  for (const [keyword, intent] of KEYWORD_INTENT_PAIRS) {
    const normalizedKeyword = normalize(keyword);

    if (matchesKeyword(input, normalizedKeyword)) {
      const weight = getIntentWeight(normalizedKeyword, intent);
      scores[intent] = (scores[intent] || 0) + weight;
      matchesByIntent[intent] = [...(matchesByIntent[intent] || []), normalizedKeyword];
    }
  }

  const ranked = Object.entries(scores).sort((a, b) => (b[1] || 0) - (a[1] || 0));
  if (!ranked.length) {
    return { intent: "default", confidence: 0, matchedKeywords: [] };
  }

  const [bestIntent, bestScore] = ranked[0] as [Intent, number];
  const secondScore = (ranked[1]?.[1] as number | undefined) || 0;

  const confidence = bestScore <= 0 ? 0 : Math.min(1, (bestScore - secondScore + 1) / (bestScore + 1));

  return {
    intent: bestIntent,
    confidence,
    matchedKeywords: matchesByIntent[bestIntent] || [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Optional analytics hook
// ─────────────────────────────────────────────────────────────────────────────

function trackEvent(name: string, data?: Record<string, unknown>) {
  // Ejemplo:
  // window.gtag?.("event", name, data);
  // console.log("[chat-event]", name, data);

  if (import.meta.env.DEV) {
    console.log("[chat-event]", name, data || {});
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GPT fallback (placeholder)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchGPTFallback(params: {
  message: string;
  context: ChatContext;
}): Promise<{ text: string; actions?: ChatAction[] } | null> {
  try {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/chat-assistant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify(params),
    });

    if (res.status === 429) {
      return {
        text: "En este momento hay mucho tráfico. Puedes escribirnos directamente por WhatsApp o email.",
        actions: [
          { label: "WhatsApp", href: WHATSAPP_URL, primary: true },
          { label: "Ir a contacto", navigate: "/contacto" },
        ],
      };
    }

    if (!res.ok) throw new Error(`AI error ${res.status}`);

    const data = await res.json();

    if (data.error) throw new Error(data.error);

    return {
      text: data.text,
      actions: [
        { label: "Ver servicios", navigate: "/servicios" },
        { label: "Contarnos tu idea", navigate: "/tu-idea" },
        { label: "Hablar por WhatsApp", href: WHATSAPP_URL, primary: true },
      ],
    };
  } catch (error) {
    console.error("[chat-assistant]", error);
    return {
      text: "No he podido procesar tu mensaje. Puedes escribirnos directamente y te atendemos en breve.",
      actions: [
        { label: "WhatsApp", href: WHATSAPP_URL, primary: true },
        { label: "Ir a contacto", navigate: "/contacto" },
      ],
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Response builder
// ─────────────────────────────────────────────────────────────────────────────

function buildResponse(intent: Intent, context: ChatContext): { text: string; actions: ChatAction[] } {
  const topic = context.mainTopic;

  switch (intent) {
    case "saludo":
      return {
        text: "¡Hola! Soy el asistente de HAT3X. Puedo ayudarte a mejorar tu web, automatizar tareas, crear una app o resolver dudas sobre nuestros servicios. ¿Qué necesitas?",
        actions: INITIAL_ACTIONS,
      };

    case "gracias":
      return {
        text: "¡De nada! Si quieres, podemos seguir viendo qué solución encaja mejor con tu negocio.",
        actions: [
          { label: "Ver servicios", navigate: "/servicios" },
          { label: "Hablar por WhatsApp", href: WHATSAPP_URL, primary: true },
        ],
      };

    case "despedida":
      return {
        text: `¡Hasta luego! Puedes escribirnos a ${EMAIL}, llamarnos al ${PHONE} o hablar con nosotros por WhatsApp.`,
        actions: [
          { label: "WhatsApp", href: WHATSAPP_URL, primary: true },
          { label: "Ir a contacto", navigate: "/contacto" },
        ],
      };

    case "web":
      return {
        text: "Podemos ayudarte a crear una web nueva o mejorar la que ya tienes para que se vea más profesional, transmita más confianza y esté enfocada a captar clientes.",
        actions: [
          { label: "Quiero una web nueva", message: "web_nueva" },
          { label: "Mejorar mi web actual", message: "web_mejorar" },
          { label: "Añadir asistente inteligente", message: "web_asistente" },
          { label: "Ver servicios web", navigate: "/servicios" },
        ],
      };

    case "web_nueva":
      return {
        text: "Perfecto. Podemos diseñar y desarrollar tu web desde cero, con una estructura clara, diseño profesional y enfoque en conversión para que te ayude a captar clientes desde el principio.",
        actions: [
          { label: "Ver servicios", navigate: "/servicios" },
          { label: "Pedir presupuesto", navigate: "/contacto", primary: true },
        ],
      };

    case "web_mejorar":
      return {
        text: "Podemos revisar tu web actual y mejorar diseño, estructura, velocidad, mensajes, formularios y experiencia general para que convierta mejor.",
        actions: [
          { label: "Ver servicios", navigate: "/servicios" },
          { label: "Hablar por WhatsApp", href: WHATSAPP_URL, primary: true },
        ],
      };

    case "web_asistente":
      return {
        text: "También podemos añadir un asistente inteligente a tu web para responder consultas, captar leads y guiar a tus visitas sin que tengas que estar pendiente.",
        actions: [
          { label: "Ver servicios", navigate: "/servicios" },
          { label: "Contarnos tu idea", navigate: "/tu-idea", primary: true },
        ],
      };

    case "automatizacion":
      return {
        text: "Podemos automatizar tareas repetitivas como formularios, respuestas a clientes, recordatorios, presupuestos o procesos internos para ahorrar tiempo y reducir trabajo manual.",
        actions: [
          { label: "Automatizar WhatsApp", message: "auto_whatsapp" },
          { label: "Automatizar formularios", message: "auto_formularios" },
          { label: "Automatizar tareas internas", message: "auto_interno" },
          { label: "Ver casos de uso", navigate: "/casos-de-uso" },
        ],
      };

    case "auto_whatsapp":
      return {
        text: "Podemos ayudarte a automatizar WhatsApp, Instagram u otros canales para responder más rápido, filtrar consultas y no perder oportunidades.",
        actions: [
          { label: "Ver casos de uso", navigate: "/casos-de-uso" },
          { label: "Hablar por WhatsApp", href: WHATSAPP_URL, primary: true },
        ],
      };

    case "auto_formularios":
      return {
        text: "Podemos hacer que los formularios envíen la información automáticamente a tu correo, CRM, hojas de cálculo o cualquier herramienta que uses.",
        actions: [
          { label: "Ver servicios", navigate: "/servicios" },
          { label: "Contarnos tu idea", navigate: "/tu-idea", primary: true },
        ],
      };

    case "auto_interno":
      return {
        text: "Si tienes tareas internas repetitivas, podemos ayudarte a automatizarlas para que tu equipo trabaje de forma más ágil y organizada.",
        actions: [
          { label: "Ver servicios", navigate: "/servicios" },
          { label: "Hablar con el equipo", navigate: "/contacto", primary: true },
        ],
      };

    case "clientes_whatsapp":
      return {
        text: "Podemos ayudarte a automatizar la atención a clientes desde WhatsApp, formularios o redes sociales para responder antes y no perder ninguna consulta.",
        actions: [
          { label: "Ver casos de uso", navigate: "/casos-de-uso" },
          { label: "WhatsApp", href: WHATSAPP_URL, primary: true },
        ],
      };

    case "citas":
      return {
        text: "Podemos crear sistemas para gestionar citas, reservas y recordatorios automáticos para organizar mejor la agenda y reducir olvidos.",
        actions: [
          { label: "Ver servicios", navigate: "/servicios" },
          { label: "Contarnos tu idea", navigate: "/tu-idea", primary: true },
        ],
      };

    case "app":
      return {
        text: "Podemos desarrollar apps y plataformas a medida para tu empresa o para tus clientes: áreas privadas, herramientas internas, sistemas de gestión o soluciones para centralizar información.",
        actions: [
          { label: "App para clientes", message: "app_clientes" },
          { label: "Plataforma interna", message: "app_interna" },
          { label: "Centralizar información", message: "app_centralizar" },
          { label: "Ver servicios", navigate: "/servicios" },
        ],
      };

    case "app_clientes":
      return {
        text: "Podemos crear una app o área privada para que tus clientes consulten reservas, documentos, pedidos o servicios de forma cómoda y profesional.",
        actions: [
          { label: "Ver servicios", navigate: "/servicios" },
          { label: "Pedir presupuesto", navigate: "/contacto", primary: true },
        ],
      };

    case "app_interna":
      return {
        text: "También podemos desarrollar una plataforma interna para tu equipo, con gestión de tareas, acceso centralizado a información y procesos más organizados.",
        actions: [
          { label: "Ver servicios", navigate: "/servicios" },
          { label: "Hablar con el equipo", navigate: "/contacto", primary: true },
        ],
      };

    case "app_centralizar":
      return {
        text: "Podemos crear una solución donde centralices clientes, proyectos, documentos o métricas para trabajar con todo más ordenado y sin herramientas dispersas.",
        actions: [
          { label: "Ver servicios", navigate: "/servicios" },
          { label: "Contarnos tu idea", navigate: "/tu-idea", primary: true },
        ],
      };

    case "contacto":
      return {
        text: `Puedes escribirnos a ${EMAIL}, llamarnos al ${PHONE} o contactar con nosotros directamente por WhatsApp.`,
        actions: [
          { label: "Ir a contacto", navigate: "/contacto" },
          { label: "WhatsApp", href: WHATSAPP_URL, primary: true },
        ],
      };

    case "precio":
      if (topic === "web") {
        return {
          text: "El precio de una web depende del alcance del proyecto: no es lo mismo una landing que una web completa con funcionalidades a medida. Si nos cuentas tu caso, podemos orientarte mejor.",
          actions: [
            { label: "Contar mi proyecto", navigate: "/tu-idea" },
            { label: "Pedir presupuesto", navigate: "/contacto", primary: true },
          ],
        };
      }

      if (topic === "automatizacion") {
        return {
          text: "El coste de una automatización depende de los procesos a conectar, las herramientas que uses y el nivel de personalización. Cuéntanos qué quieres automatizar y te orientamos.",
          actions: [
            { label: "Contar mi caso", navigate: "/tu-idea" },
            { label: "Hablar por WhatsApp", href: WHATSAPP_URL, primary: true },
          ],
        };
      }

      if (topic === "app") {
        return {
          text: "El presupuesto de una app o plataforma depende del número de funcionalidades, accesos, paneles y nivel de desarrollo a medida. Lo mejor es ver tu idea y definir el alcance.",
          actions: [
            { label: "Contar mi proyecto", navigate: "/tu-idea" },
            { label: "Pedir presupuesto", navigate: "/contacto", primary: true },
          ],
        };
      }

      return {
        text: "El presupuesto depende del tipo de proyecto. No es lo mismo mejorar una web, automatizar procesos o desarrollar una plataforma. Si nos cuentas lo que necesitas, te orientamos.",
        actions: [
          { label: "Contar mi proyecto", navigate: "/tu-idea" },
          { label: "Pedir presupuesto", navigate: "/contacto", primary: true },
        ],
      };

    case "plazos":
      if (topic === "web") {
        return {
          text: "Los plazos de una web dependen del alcance, pero muchas mejoras o proyectos web pueden organizarse en pocas semanas si el objetivo está claro desde el principio.",
          actions: [
            { label: "Ver proceso", navigate: "/proceso" },
            { label: "Hablar con el equipo", navigate: "/contacto", primary: true },
          ],
        };
      }

      if (topic === "automatizacion") {
        return {
          text: "Muchas automatizaciones pueden estar listas en poco tiempo, aunque depende de las herramientas a integrar y del flujo que quieras montar.",
          actions: [
            { label: "Ver proceso", navigate: "/proceso" },
            { label: "Contarnos tu idea", navigate: "/tu-idea", primary: true },
          ],
        };
      }

      if (topic === "app") {
        return {
          text: "Una app o plataforma suele requerir más tiempo porque implica diseño, estructura, funcionalidades y pruebas. Siempre trabajamos con una hoja de ruta clara.",
          actions: [
            { label: "Ver proceso", navigate: "/proceso" },
            { label: "Pedir presupuesto", navigate: "/contacto", primary: true },
          ],
        };
      }

      return {
        text: "Los plazos dependen del proyecto. Algunas mejoras o automatizaciones pueden estar listas en pocas semanas, mientras que desarrollos más amplios requieren más tiempo.",
        actions: [
          { label: "Ver cómo trabajamos", navigate: "/proceso" },
          { label: "Ir a contacto", navigate: "/contacto", primary: true },
        ],
      };

    case "proceso":
      return {
        text: "Trabajamos en 4 pasos: entendemos tu negocio, definimos la solución, la desarrollamos y hacemos seguimiento. Buscamos que todo sea claro, útil y adaptado a cada empresa.",
        actions: [
          { label: "Ver proceso", navigate: "/proceso" },
          { label: "Pedir presupuesto", navigate: "/contacto", primary: true },
        ],
      };

    case "mantenimiento":
      return {
        text: "También ofrecemos mantenimiento y soporte para ayudarte con mejoras, incidencias, ajustes y evolución de la solución una vez puesta en marcha.",
        actions: [
          { label: "Ir a contacto", navigate: "/contacto" },
          { label: "Hablar por WhatsApp", href: WHATSAPP_URL, primary: true },
        ],
      };

    case "integraciones":
      return {
        text: "Podemos integrar herramientas que ya usas, como CRM, correo, formularios, APIs o bases de datos, para conectar procesos y trabajar de forma más eficiente.",
        actions: [
          { label: "Ver servicios", navigate: "/servicios" },
          { label: "Contarnos tu caso", navigate: "/tu-idea", primary: true },
        ],
      };

    default:
      return {
        text: "No estoy completamente seguro de qué necesitas, pero puedo ayudarte con webs, automatización, apps, integraciones o contacto con el equipo.",
        actions: FALLBACK_ACTIONS,
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const ChatBot = () => {
  const navigate = useNavigate();
  const endRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loadingBot, setLoadingBot] = useState(false);

  const [context, setContext] = useState<ChatContext>({
    mainTopic: null,
    lastIntent: null,
    userMessagesCount: 0,
    fallbackCount: 0,
  });

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "bot",
      text: "Hola, soy el asistente de HAT3X. Puedo ayudarte a mejorar tu web, automatizar tareas, crear una app o resolver dudas sobre nuestros servicios. ¿Qué necesitas?",
      actions: INITIAL_ACTIONS,
    },
  ]);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);

    return () => clearTimeout(id);
  }, [messages, open]);

  const pushBotMessage = async (userText: string) => {
    setLoadingBot(true);

    const detection = detectIntent(userText);
    const nextTopic = getMainTopicFromIntent(detection.intent) || context.mainTopic;

    const nextContext: ChatContext = {
      mainTopic: nextTopic,
      lastIntent: detection.intent,
      userMessagesCount: context.userMessagesCount + 1,
      fallbackCount: detection.intent === "default" ? context.fallbackCount + 1 : 0,
    };

    setContext(nextContext);

    trackEvent("intent_detected", {
      intent: detection.intent,
      confidence: detection.confidence,
      matchedKeywords: detection.matchedKeywords,
      topic: nextTopic,
    });

    const shouldUseGPT =
      detection.intent === "default" || (detection.confidence < 0.45 && nextContext.userMessagesCount >= 2);

    if (shouldUseGPT) {
      trackEvent("gpt_fallback_triggered", {
        confidence: detection.confidence,
        fallbackCount: nextContext.fallbackCount,
      });

      const gptResponse = await fetchGPTFallback({
        message: userText,
        context: nextContext,
      });

      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            role: "bot",
            text:
              gptResponse?.text || "Cuéntanos un poco más sobre tu negocio o lo que quieres conseguir y te orientamos.",
            actions: gptResponse?.actions || FALLBACK_ACTIONS,
          },
        ]);
        setLoadingBot(false);
      }, 420);

      return;
    }

    const response = buildResponse(detection.intent, nextContext);

    setTimeout(() => {
      setMessages((prev) => [...prev, { role: "bot", ...response }]);
      setLoadingBot(false);
    }, 360);
  };

  const handleAction = (action: ChatAction) => {
    trackEvent("action_clicked", {
      label: action.label,
      type: action.href ? "href" : action.navigate ? "navigate" : action.message ? "message" : "unknown",
    });

    if (action.href) {
      window.open(action.href, "_blank", "noopener,noreferrer");
      return;
    }

    if (action.navigate) {
      setOpen(false);
      navigate(action.navigate);
      return;
    }

    if (action.message) {
      setMessages((prev) => [...prev, { role: "user", text: action.label }]);
      void pushBotMessage(action.message);
    }
  };

  const send = () => {
    const text = input.trim();
    if (!text || loadingBot) return;

    trackEvent("message_sent", { textLength: text.length });

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    void pushBotMessage(text);
  };

  const isLink = (a: ChatAction) => Boolean(a.navigate || a.href);

  return (
    <>
      <button
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) trackEvent("chat_opened");
          else trackEvent("chat_closed");
        }}
        className="fixed bottom-6 right-24 z-50 w-14 h-14 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
        aria-label={open ? "Cerrar chat" : "Abrir chat"}
      >
        {open ? <X className="w-6 h-6" /> : <Bot className="w-7 h-7" />}
      </button>

      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 glass-card border border-border/40 rounded-2xl flex flex-col overflow-hidden shadow-2xl"
          style={{ maxHeight: "76vh" }}
        >
          <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground leading-tight">Asistente HAT3X</p>
                <p className="text-[11px] text-muted-foreground">Respuestas rápidas sobre nuestros servicios</p>
              </div>
            </div>
            <Sparkles className="w-4 h-4 text-primary/60" />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col gap-1.5 ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted/60 text-foreground rounded-bl-sm"
                  }`}
                >
                  {m.text}
                </div>

                {m.role === "bot" && m.actions && m.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 max-w-[96%]">
                    {m.actions.map((action, j) => (
                      <button
                        key={`${action.label}-${j}`}
                        onClick={() => handleAction(action)}
                        className={`inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                          action.primary
                            ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                            : isLink(action)
                              ? "border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary font-medium"
                              : "border-border/50 bg-background/40 hover:bg-background/70 text-foreground"
                        }`}
                      >
                        {action.label}
                        {action.href === WHATSAPP_URL ? (
                          <MessageCircle className="w-2.5 h-2.5 opacity-80" />
                        ) : isLink(action) ? (
                          <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loadingBot && (
              <div className="flex items-start">
                <div className="max-w-[88%] rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm bg-muted/60 text-foreground">
                  Escribiendo...
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>

          <div className="px-3 py-2 border-t border-border/20 text-[11px] text-muted-foreground flex flex-wrap gap-3 shrink-0">
            <a
              href={`mailto:${EMAIL}`}
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <Mail className="w-3 h-3" />
              {EMAIL}
            </a>

            <a
              href={`tel:${PHONE_RAW}`}
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <Phone className="w-3 h-3" />
              {PHONE}
            </a>

            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <MessageCircle className="w-3 h-3" />
              WhatsApp
            </a>
          </div>

          <div className="border-t border-border/30 p-3 flex gap-2 shrink-0">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Escribe tu mensaje..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />

            <Button
              size="icon"
              onClick={send}
              disabled={!input.trim() || loadingBot}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl h-9 w-9 shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatBot;
