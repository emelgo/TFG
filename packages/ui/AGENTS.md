# @pymekit/ui: componentes de interfaz y estilos

## Librería de componentes

El proyecto usa **Base UI** (`@base-ui/react`), no Radix UI. Diferencias clave:

- NUNCA se usa la prop `asChild`: Base UI compone elementos con la prop `render`.
- SIEMPRE se usa el patrón `render` cuando hay que renderizar un elemento propio (por ejemplo, `<Button nativeButton={false} render={<Link />} />`).

## Reglas obligatorias

1. SIEMPRE se importa como `@pymekit/ui/<nombre>`: nada de rutas profundas, sea cual sea la estructura de carpetas.
2. SIEMPRE se usa `cn()` de `@pymekit/ui/utils` para combinar clases.
3. SIEMPRE se usan clases semánticas de Tailwind (`bg-background`, `text-muted-foreground`), NUNCA colores fijos (`bg-white`, `text-gray-500`).
4. SIEMPRE se añaden atributos `data-testid` en los elementos interactivos.
5. SIEMPRE se renderiza `<FieldError errors={field.state.meta.errors} />` (de `@pymekit/ui/field`) en cada campo de formulario para mostrar los errores.
6. SIEMPRE se contemplan los casos de error, no solo el camino feliz.
7. SIEMPRE se muestran al usuario errores útiles y comprensibles, no errores internos.
8. NUNCA se añaden genéricos a `useForm`: el esquema Zod de `validators` infiere los tipos.
9. NUNCA se lee un campo de forma reactiva con `form.state.values.x` dentro del render: se usa `<form.Subscribe selector={...}>` (o `useStore(form.store, ...)`) para que la UI se vuelva a renderizar al cambiar.
10. NUNCA se usan patrones de Radix UI (`asChild`, imports de `@radix-ui/*`).
11. NUNCA se editan los ficheros de `src/shadcn/` para añadir comportamiento propio del proyecto. Reflejan los de shadcn tal cual para que su CLI pueda reemplazarlos (por ejemplo, al cambiar de tema). Lo propio del proyecto va en `src/pymekit/`.

> La carpeta `src/pymekit/` se renombra en F3; hasta entonces conserva su nombre original.

## Personalizar primitivas de shadcn

`src/shadcn/` se considera código de terceros. La CLI de shadcn puede sobrescribir cualquier fichero de esa carpeta en cualquier momento, así que cualquier personalización que se ponga ahí se perderá sin aviso en la siguiente sincronización de tema o componentes.

Para extender una primitiva de shadcn se usa uno de estos patrones, sin tocar `src/shadcn/<nombre>.tsx`:

- **Envolver y reexportar**: para añadidos de comportamiento que deben ser invisibles en el punto de uso (por ejemplo, el `FieldError` con i18n de `src/pymekit/field.tsx` o la reexportación de `toast`). Se crea `src/pymekit/<nombre>.tsx`, que reexporta las primitivas originales más las modificaciones, y se apunta la entrada `"./<nombre>"` de `package.json` a ese fichero. Los puntos de uso siguen importando de `@pymekit/ui/<nombre>`.
- **Mapa de tokens complementario**: para variantes visuales adicionales (por ejemplo, `success`, `warning` o `info` en `Badge`). Se exporta desde `src/pymekit/<nombre>.tsx` un mapa `const` de clases (por ejemplo, `badgeExtras` o `alertExtras`) y se aplica en el punto de uso con `cn(badgeExtras.success, ...)`. Se expone con una entrada hermana como `"./<nombre>-extras"`. La unión `variant` de la primitiva queda como en shadcn y la abstracción con nombre (`badgeExtras.success`) se conserva en los puntos de uso.

En ambos casos, el fichero de `src/pymekit/` lleva una cabecera que explica por qué existe, y hay que confirmar que `cn()` resuelve las clases en conflicto que aplique la variante original.

## Formularios

Los formularios usan **TanStack Form** (`@tanstack/react-form`), no react-hook-form, junto con las primitivas de campo de `@pymekit/ui/field` (`Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `FieldGroup`, …). No existe un export `@pymekit/ui/form`.

```tsx
import { useForm } from '@tanstack/react-form';
import { Field, FieldError, FieldLabel } from '@pymekit/ui/field';

const form = useForm({
  defaultValues: { email: '' },
  validators: { onChange: MySchema, onSubmit: MySchema }, // el esquema Zod directamente
  onSubmit: ({ value }) => mutation.mutate(value),
});

<form onSubmit={(e) => { e.preventDefault(); void form.handleSubmit(); }}>
  <form.Field name="email">
    {(field) => {
      const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
      return (
        <Field data-invalid={isInvalid}>
          <FieldLabel htmlFor={field.name}>...</FieldLabel>
          <Input
            id={field.name}
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(e) => field.handleChange(e.target.value)}
            aria-invalid={isInvalid}
          />
          <FieldError errors={field.state.meta.errors} />
        </Field>
      );
    }}
  </form.Field>
</form>
```

- Los valores observados se leen de forma reactiva con `<form.Subscribe selector={...}>`, nunca con `form.state.values.x` en el render.
- Si un esquema Zod tiene campos opcionales o con valor por defecto, se hace *cast* de `defaultValues` con `as z.input<typeof Schema>` para que los tipos del formulario encajen con el validador.
- `FieldError` de `@pymekit/ui/field` es el envoltorio con i18n: trata los mensajes como claves de `Trans`.
- `dialog`, `sidebar`, `breadcrumb`, `pagination` y `command` se exportan desde envoltorios de `src/pymekit/` que sustituyen los textos en inglés de shadcn («Close», «Toggle Sidebar»…) por claves `common.ui.*` (ADR-021). Dentro de `src/pymekit/` se importan esos envoltorios, no `../shadcn/<nombre>`.

## Componentes clave

| Componente | Import |
| --- | --- |
| Button, Card, Input, etc. | `@pymekit/ui/<nombre>` |
| Campos de formulario | `Field`, `FieldLabel`, `FieldDescription`, `FieldError` de `@pymekit/ui/field` |
| Ayuda «?» de un campo (*popover*, funciona con toque y teclado) | `FieldLabelWithHelp` (prop `help`; sin texto no pinta el «?») o `FieldHelp` suelto, de `@pymekit/ui/field-help` |
| Traducciones | `Trans` de `@pymekit/ui/trans` |
| Notificaciones *toast* | `toast` de `@pymekit/ui/sonner` |
| Renderizado condicional | `If` de `@pymekit/ui/if` |
| Combinación de clases | `cn` de `@pymekit/ui/utils` |
| Markdown de contenido público (sin HTML crudo, URL filtradas) | `SafeMarkdown` de `@pymekit/ui/markdown`; política pura en `@pymekit/ui/markdown-policy` |

## Zod

- SIEMPRE se importa Zod como `import * as z from 'zod'`.
- Los esquemas van en un fichero aparte para poder reutilizarlos en las *server functions*.
