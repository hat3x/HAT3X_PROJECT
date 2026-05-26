# SKILL: Next.js + shadcn/ui

## Stack Estándar HAT3X para Webs y Apps

| Capa | Herramienta | Versión mínima |
|---|---|---|
| Framework | Next.js 14+ | App Router |
| Lenguaje | TypeScript | 5.x |
| Estilos | Tailwind CSS | 3.4+ |
| Componentes | shadcn/ui | latest |
| Forms | React Hook Form + Zod | latest |
| Iconos | Lucide React | latest |

---

## Creación de Proyecto

```bash
npx create-next-app@latest mi-proyecto --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

cd mi-proyecto

# Inicializar shadcn
npx shadcn@latest init

# Componentes base recomendados
npx shadcn@latest add button card input label textarea dialog sheet dropdown-menu avatar badge alert-dialog toast
```

---

## Estructura de Directorios HAT3X

```
src/
├── app/                      # App Router
│   ├── (marketing)/          # Rutas públicas agrupadas
│   │   ├── page.tsx
│   │   ├── about/
│   │   └── contact/
│   ├── (dashboard)/          # Rutas protegidas
│   │   ├── layout.tsx        # Con auth check
│   │   └── dashboard/
│   ├── api/                  # API Routes
│   │   └── webhooks/
│   ├── globals.css
│   ├── layout.tsx            # Root layout
│   └── page.tsx
├── components/
│   ├── ui/                   # Componentes shadcn
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   └── ...
│   ├── layout/               # Header, Footer, Sidebar
│   └── shared/               # Componentes reutilizables
├── lib/
│   ├── utils.ts              # cn() helper
│   ├── auth.ts               # Auth config
│   └── db.ts                 # DB client
├── hooks/                    # Custom hooks
└── types/                    # TypeScript types
```

---

## Componentes shadcn Esenciales

### Formulario con Validación Zod

```typescript
"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"

const formSchema = z.object({
  name: z.string().min(2, "Nombre demasiado corto"),
  email: z.string().email("Email inválido"),
  phone: z.string().optional(),
  message: z.string().min(10, "Mensaje debe tener al menos 10 caracteres")
})

export function ContactForm() {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", email: "", phone: "", message: "" }
  })

  async function onSubmit(data: z.infer<typeof formSchema>) {
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      })

      if (!res.ok) throw new Error("Error al enviar")

      toast({
        title: "Mensaje enviado",
        description: "Te contactaremos pronto"
      })
      form.reset()
    } catch (error) {
      toast({
        title: "Error",
        description: "Inténtalo de nuevo más tarde",
        variant: "destructive"
      })
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" {...form.getFieldState("name")} {...form.register("name")} />
        {form.formState.errors.name && (
          <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" {...form.register("email")} />
        {form.formState.errors.email && (
          <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
        )}
      </div>

      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Enviando..." : "Enviar mensaje"}
      </Button>
    </form>
  )
}
```

---

## Patrones de Componentes HAT3X

### Header Responsive

```typescript
import { useState } from "react"
import Link from "next/link"
import { Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"

const navItems = [
  { href: "/servicios", label: "Servicios" },
  { href: "/proyectos", label: "Proyectos" },
  { href: "/nosotros", label: "Nosotros" },
  { href: "/contacto", label: "Contacto" }
]

export function Header() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
      <div className="container flex h-16 items-center justify-between px-4">
        <Link href="/" className="text-xl font-bold">
          HAT3X
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex gap-6">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm font-medium hover:text-primary">
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Mobile Nav */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[300px]">
            <nav className="flex flex-col gap-4 mt-8">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="text-lg font-medium"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
```

---

## API Routes — Patrones

### POST Endpoint con Zod Validation

```typescript
// app/api/contact/route.ts
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const contactSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  message: z.string().min(10)
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = contactSchema.parse(body)

    // Procesar: enviar email, guardar en DB, notificar CRM
    // await sendEmail(data)
    // await logToCRM(data)

    return NextResponse.json({ success: true, message: "Mensaje enviado" })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    )
  }
}
```

### Rate Limiting Básico

```typescript
import { NextRequest, NextResponse } from "next/server"
import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!
})

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "anonymous"
  const key = `ratelimit:${ip}`

  const [count] = await redis.multi([
    ["incr", key],
    ["expire", key, 60]
  ])

  if ((count as number) > 10) {
    return NextResponse.json(
      { error: "Demasiadas peticiones" },
      { status: 429 }
    )
  }

  // ... procesar petición
}
```

---

## Metadata y SEO

```typescript
// app/layout.tsx
import type { Metadata } from "next"
import { Inter } from "next/font/google"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: {
    default: "HAT3X — Consultora de IA",
    template: "%s | HAT3X"
  },
  description: "Automatizaciones, chatbots y asistentes de voz con IA",
  keywords: ["IA", "automatización", "chatbots", "n8n", "Retell AI"],
  authors: [{ name: "HAT3X", url: "https://hat3x.com" }],
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: "https://hat3x.com",
    siteName: "HAT3X",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630 }]
  },
  twitter: {
    card: "summary_large_image",
    site: "@hat3x"
  },
  robots: {
    index: true,
    follow: true
  }
}
```

```typescript
// Página individual con metadata específica
export const metadata: Metadata = {
  title: "Chatbots IA — HAT3X",
  description: "Chatbots conversacionales para web, WhatsApp, Instagram y Telegram",
  openGraph: {
    title: "Chatbots IA — HAT3X",
    description: "Chatbots conversacionales que venden 24/7"
  }
}
```

---

## Optimización de Imágenes

```typescript
import Image from "next/image"

// Siempre usar next/image para imágenes locales
<Image
  src="/hero-image.jpg"
  alt="Descripción accesible"
  width={1200}
  height={630}
  priority  // Para LCP (imágenes above the fold)
  className="object-cover"
/>

// Para imágenes externas, configurar domains en next.config.js
module.exports = {
  images: {
    domains: ["images.unsplash.com", "cdn.sanity.io"]
  }
}
```

---

## Variables de Entorno

```env
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://xxx:xxx@supabase.co:5432/postgres

# Auth (si aplica)
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=xxx

# API Keys (server-side only)
ANTHROPIC_API_KEY=sk-ant-xxx
STRIPE_SECRET_KEY=sk_test_xxx

# Redis (rate limiting)
UPSTASH_REDIS_URL=https://xxx.upstash.io
UPSTASH_REDIS_TOKEN=xxx
```

---

## Checklist de Entrega Web

- [ ] TypeScript sin errores (`tsc --noEmit`)
- [ ] Lighthouse Performance > 90
- [ ] Lighthouse SEO > 90
- [ ] Lighthouse Accessibility > 90
- [ ] Forms con validación Zod client + server
- [ ] Metadata SEO en todas las páginas
- [ ] Imágenes optimizadas con next/image
- [ ] Responsive verificado (móvil, tablet, desktop)
- [ ] `.env.example` con todas las variables
- [ ] README con instrucciones de setup
