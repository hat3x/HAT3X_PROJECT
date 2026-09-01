import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://pedidos100montaditos.es",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, session_id } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY no configurada");

    // Cargar menú con categorías
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // SEC-004: rate limit por sesión (20/5min) e IP (60/5min). Fail-open si la
    // función aún no existe (r.data == null); bloquea solo cuando devuelve false.
    const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    const rl = await Promise.all([
      supabase.rpc("check_rate_limit", { p_key: `chat:sess:${session_id ?? ip}`, p_limit: 20, p_window_secs: 300 }),
      supabase.rpc("check_rate_limit", { p_key: `chat:ip:${ip}`,                  p_limit: 60, p_window_secs: 300 }),
    ]);
    if (rl.some((r) => r.data === false)) {
      return new Response(
        JSON.stringify({ error: "Has enviado demasiados mensajes. Espera un momento." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const [{ data: cats }, { data: prods }] = await Promise.all([
      supabase.from("menu_categorias").select("id, nombre").order("orden"),
      supabase
        .from("menu_productos")
        .select("id, nombre, descripcion, precio, categoria_id, numero")
        .eq("disponible", true),
    ]);

    const catMap = new Map((cats ?? []).map((c: any) => [c.id, c.nombre]));
    // Hora actual en Madrid: los desayunos solo están disponibles de 10:00 a 12:00.
    const madridHour = parseInt(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false }).format(new Date()),
      10,
    );
    const desayunoAbierto = madridHour >= 10 && madridHour < 12;

    // Horarios (Madrid) — deben coincidir con src/lib/kitchen-hours.ts:
    //   COCINA:  L-J y D cierra 22:30; V y S cierra 23:30.
    //   BEBIDAS: L-J y D cierra 23:00; V y S cierra 24:00 (cierre del local).
    const mParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date());
    const wd = mParts.find((p) => p.type === "weekday")?.value ?? "Mon";
    const mm = parseInt(mParts.find((p) => p.type === "minute")?.value ?? "0", 10);
    const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dow = dowMap[wd] ?? 1;
    const minsNow = madridHour * 60 + mm;
    const esFinde = dow === 5 || dow === 6; // viernes y sábado
    const abierto = minsNow >= 6 * 60; // antes de las 06:00 es madrugada: cerrado
    const cocinaAbierta = abierto && minsNow < (esFinde ? 23 * 60 + 30 : 22 * 60 + 30);
    const bebidasAbierta = abierto && minsNow < (esFinde ? 24 * 60 : 23 * 60);
    const esAperitivoBarra = (n: string) => /aceituna|gilda|cucurucho/i.test(n);

    void esAperitivoBarra; // (clasificación disponible si se necesita)
    // Productos internos (combos de desayuno, marcador de cocina y nachos de la promo): no se listan.
    const INTERNAL_IDS = new Set([
      "5a15e000-0000-4000-8000-000000000001",
      "5a15e000-0000-4000-8000-000000000010",
      "5a15e000-0000-4000-8000-000000000011",
      "5a15e000-0000-4000-8000-000000000012",
    ]);
    const menuText = (prods ?? [])
      .filter((p: any) => !INTERNAL_IDS.has(p.id))
      // Fuera de 10–12 ocultamos los desayunos para que Monty no los ofrezca.
      // OJO: la comida de cocina NO se oculta aunque la cocina esté cerrada, para que
      // Monty siga pudiendo informar de ella; lo que se prohíbe es AÑADIRLA (regla COCINA).
      .filter((p: any) => desayunoAbierto || catMap.get(p.categoria_id) !== "Desayunos")
      .map(
        (p: any) =>
          `- [${catMap.get(p.categoria_id) ?? "Otro"}] ${p.numero ? `#${p.numero} ` : ""}${p.nombre} — ${
            p.precio
          }€${p.descripcion ? ` (${p.descripcion})` : ""}`
      )
      .join("\n");

    const systemPrompt = `Eres el asistente virtual de "100 Montaditos". Ayudas a los clientes a elegir productos del menú según sus gustos, alergias o necesidades.

REGLAS:
- Responde SIEMPRE en español, de forma breve, amable y directa.
- Recomienda SOLO productos del menú listado abajo. Nunca inventes productos.
- Cuando recomiendes, lista 2-5 opciones con su nombre exacto y precio.
- Los montaditos tienen un número identificador del #1 al #100. Cuando un cliente pregunte por un número (ej: "el 3", "el número 15", "ponme el 42"), identifica el montadito por su número en el menú y recomiéndalo indicando su nombre completo.
- Si el cliente menciona una alergia o ingrediente que no quiere, analiza descripciones y nombres para excluir productos que probablemente lo contengan. Si no estás seguro, avísale de que confirme con el personal.
- El menú incluye MONTADITOS, APERITIVOS, RACIONES, ENSALADAS, MONTYRUEDAS y BEBIDAS. ANTES de decir que algo NO está, busca a fondo en TODA la lista de abajo (incluida la sección [Aperitivos]). Por ejemplo, las "Gildas" y las "Aceitunas" SÍ están (son aperitivos). Solo di que no existe si de verdad no aparece en la lista.
- MONTYRUEDAS: son bandejas de 5 montaditos del mismo tipo (Dinas, Perros, Burguers, Pizzas) por 8€ (2€ menos que comprándolos sueltos). La MontyRueda Gourmets cuesta 8€ y deja al cliente ELEGIR 5 montaditos gourmet de los 10 disponibles (al añadirla se abre un selector en la app). Si te piden una rueda o cuál sale más a cuenta, recomiéndala con su etiqueta [[add:NOMBRE EXACTO]] (ej. [[add:MontyRueda Pizzas]]).
- DESAYUNOS: disponibles SOLO de 10:00 a 12:00 (hora de Madrid). ${desayunoAbierto ? "AHORA SÍ están disponibles." : "AHORA NO están disponibles (fuera de horario): NO los menciones, NO los recomiendes y NO ofrezcas añadirlos."} Hay tostadas, croissant y bollería (1,80€) y dos desayunos combo: "Desayuno Clásico" (3€: tostada de tomate y jamón O croissant de mantequilla y mermelada + café o infusión a elegir) y "Desayuno Dulce" (2€: 1 MontyCookie a elegir + café o infusión a elegir); en ambos, si eligen café escogen además el tipo (Solo, Cortado, Con leche o Bombón), y a ambos se les puede añadir un zumo de naranja natural por +1,10€. Para añadir CUALQUIER desayuno NO uses la etiqueta [[add:]]: dile al cliente que lo elija en la sección "Desayunos" de la app, porque debe escoger pan/montadito, café o infusión y zumo. Cuando recomiendes un desayuno combo, añade al FINAL su etiqueta de banner para mostrar la foto: el Dulce con [[banner:desayuno-dulce]] y el Clásico con [[banner:desayuno-clasico]] (solo si AHORA están disponibles, 10:00–12:00).
- PROMOCIONES: "5€ La vida tiesa, la vida mejor" — 8 combos distintos, todos por 5€ (con jarra premium +0,50€ si aplica), en la sección "Promociones": Jarra Quijote+Cucurucho+Monty, Montadito Clásico+2 Especiales, 2 Jarras Quijote+Aceitunas, 2 Jarras Sancho, 2 Para Picar (de 2,50€), Coca-Cola+Especial+Aceitunas, Clásico+Especial+MontyCookie, y Jarra Sancho+Cucurucho+Gilda. NO uses [[add:]] para ninguno: dirige siempre al cliente a la sección "Promociones" para elegir sus opciones.
- CAFÉ E INFUSIONES: disponibles a CUALQUIER hora (ya no hay restricción horaria). Al pedir un café se elige el tipo (Solo, Cortado, Con leche o Bombón) y si se quiere descafeinado, en un selector que se abre en la app; tú puedes recomendarlo con [[add:]] usando su nombre exacto del menú. Las MontyCookies (montaditos dulces #68–#70) cuestan 1,80€.
- ACEITUNAS: es un aperitivo de barra (1€) con DOS variantes a elegir, "de la abuela" y "manzanilla"; el sabor se escoge en un selector de la app. Se pueden pedir aunque la cocina esté cerrada. Igual que las Gildas, que también tienen variante (boquerón o anchoa).
- LOCAL: ${bebidasAbierta ? "abierto ahora mismo." : "CERRADO del todo (ya ha cerrado también la barra). Puedes INFORMAR de la carta, pero NO uses la etiqueta [[add:]] para NADA: hoy ya no se puede pedir. Avisa de que volvemos mañana e indica el horario: cocina hasta las 22:30 (23:30 viernes y sábados) y bebidas hasta las 23:00 (24:00 viernes y sábados)."}
- COCINA: ${cocinaAbierta ? "abierta ahora mismo." : "CERRADA ahora mismo. SÍ puedes INFORMAR sobre cualquier producto del menú (qué montaditos hay, ingredientes, etc.), pero NO uses la etiqueta [[add:]] para NADA que vaya a cocina (montaditos, raciones, ensaladas, montyruedas, nachos, patatas, alitas, croquetas, promos, desayunos…), porque ahora no se pueden pedir. Avisa de que la cocina ya ha cerrado y que en este momento SOLO se pueden PEDIR bebidas y los 3 aperitivos de barra (aceitunas, cucurucho de patatas, gildas) — para esos sí puedes usar [[add:]]."}
- Si pregunta por algo que no está en la carta, dilo claramente.
- Mantén el texto BREVE (1-3 frases). NO escribas listas de productos en el texto, los productos se mostrarán como botones aparte.
- IMPORTANTE: Para cada producto que recomiendes, añade al FINAL del mensaje (después del texto) una línea por producto con esta etiqueta exacta: [[add:NOMBRE_EXACTO_DEL_PRODUCTO]] usando el nombre TAL CUAL aparece en el menú (sin negritas, sin precio, SIN el número #). Ejemplo de respuesta completa:
"¡El #3 es el Pulled pork BBQ! 🐷
[[add:Pulled pork BBQ]]"
- NO incluyas el número ni el precio en la etiqueta. Solo el nombre exacto del producto.

MENÚ DISPONIBLE:
${menuText}`;

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          temperature: 0.3,
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Demasiadas peticiones, espera un momento." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            error: "Créditos AI agotados. Contacta al administrador.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat-menu error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
