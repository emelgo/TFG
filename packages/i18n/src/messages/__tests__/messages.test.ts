import { describe, expect, it } from 'vitest';

import { defaultLocale, locales } from '../../config';
import { registry } from '../index';

/**
 * Paridad de traducciones entre los idiomas configurados.
 *
 * Hoy PymeKit solo trae español (ADR-021), pero el test se conserva como
 * red de seguridad del punto de extensión: si se añade un idioma, debe tener
 * EXACTAMENTE las mismas claves que el español (idioma de referencia) en
 * cada espacio de nombres (namespace). Si falta una clave en un idioma, `use-intl` mostraría
 * la clave en crudo («cms.sidebar.users») en vez del texto, así que es mejor
 * que lo detecte un test. Además se comprueba que cada mensaje conserva los
 * mismos marcadores ICU (`{count}`, `{name}`…), porque traducir por error el
 * nombre de un marcador rompe la interpolación sin dar ningún error visible.
 *
 * También se revisan las plantillas de correo de `@pymekit/email-templates`
 * y que toda clave escrita literalmente en el código (`i18nKey="…"`) exista
 * en español, para que no aparezca nunca una clave en crudo.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Tree = Record<string, unknown>;

/** Aplana un árbol de mensajes a `ruta.de.la.clave → texto`. */
function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();

  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object') {
      for (const [k, v] of flatten(value as Tree, path)) out.set(k, v);
    } else {
      out.set(path, String(value));
    }
  }

  return out;
}

/**
 * Nombres de los argumentos ICU de un mensaje (`{count, plural…}` → count).
 * Por convención los argumentos van en camelCase con minúscula inicial; así no
 * se confunden con el texto de una rama (`=0 {Assign}`), que sí se traduce.
 */
function placeholders(message: string): string[] {
  const names = [...message.matchAll(/\{\s*([a-z_][\w]*)\s*[,}]/g)].map(
    (match) => match[1] ?? '',
  );

  return [...new Set(names)].sort();
}

/** Compara dos catálogos aplanados: mismas claves y mismos marcadores. */
function expectSameShape(
  base: Map<string, string>,
  other: Map<string, string>,
) {
  expect([...other.keys()].sort()).toEqual([...base.keys()].sort());

  for (const [key, text] of base) {
    expect({ key, args: placeholders(other.get(key) ?? '') }).toEqual({
      key,
      args: placeholders(text),
    });
  }
}

/** Idioma de referencia con el que se comparan los demás. */
const BASE = 'es';

describe('catálogos de mensajes', () => {
  it('el idioma por defecto es el español y tiene catálogo', () => {
    expect(defaultLocale).toBe(BASE);
    expect(locales).toContain(BASE);
  });

  it('cada idioma configurado tiene su catálogo', () => {
    for (const locale of locales) {
      expect(Object.keys(registry[locale] ?? {}).length).toBeGreaterThan(0);
    }
  });

  const namespaces = Object.keys(registry[BASE] ?? {});

  for (const locale of locales.filter((l) => l !== BASE)) {
    it(`${locale} tiene los mismos namespaces que ${BASE}`, () => {
      expect(Object.keys(registry[locale] ?? {}).sort()).toEqual(
        [...namespaces].sort(),
      );
    });

    for (const namespace of namespaces) {
      it(`${locale}/${namespace}: mismas claves y marcadores que ${BASE}`, () => {
        expectSameShape(
          flatten(registry[BASE]![namespace] as Tree),
          flatten((registry[locale]?.[namespace] ?? {}) as Tree),
        );
      });
    }
  }
});

describe('plantillas de correo', () => {
  const root = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../email-templates/src/locales',
  );
  const read = (locale: string, file: string) =>
    JSON.parse(readFileSync(join(root, locale, file), 'utf8')) as Tree;

  it(`existen las plantillas en ${BASE}`, () => {
    expect(readdirSync(join(root, BASE)).length).toBeGreaterThan(0);
  });

  for (const locale of readdirSync(root).filter((l) => l !== BASE)) {
    for (const file of readdirSync(join(root, BASE))) {
      it(`${locale}/${file}: mismas claves y marcadores que ${BASE}`, () => {
        expectSameShape(flatten(read(BASE, file)), flatten(read(locale, file)));
      });
    }
  }
});

describe('claves usadas en el código', () => {
  // Raíz del monorepo (este fichero está en packages/i18n/src/messages/__tests__).
  const repo = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
  const skip = new Set(['node_modules', '__tests__', 'dist', '.turbo']);

  /** Ficheros .ts/.tsx de las carpetas `src` de la web y de los paquetes. */
  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (skip.has(entry.name)) return [];
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sources(path);
      return /\.tsx?$/.test(entry.name) ? [path] : [];
    });
  }

  const roots = [
    join(repo, 'apps/web/src'),
    ...readdirSync(join(repo, 'packages'), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .flatMap((e) => {
        const dir = join(repo, 'packages', e.name);
        // Los paquetes agrupados (features/*, cms/*, billing/*) tienen subpaquetes.
        return readdirSync(dir, { withFileTypes: true })
          .filter((s) => s.isDirectory() && !skip.has(s.name))
          .map((s) => (s.name === 'src' ? dir : join(dir, s.name)));
      }),
  ];

  const keys = flatten(registry[BASE] as Tree);
  const used = new Set<string>();

  for (const root of roots) {
    let files: string[] = [];
    try {
      files = sources(join(root, 'src'));
    } catch {
      continue;
    }
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      // Solo las claves literales con namespace: `i18nKey="ns.clave"` o
      // `i18nKey={'ns.clave'}`. Las dinámicas no se pueden comprobar aquí.
      for (const match of text.matchAll(
        /i18nKey=\{?\s*['"]([a-zA-Z]+\.[\w.]+)['"]/g,
      )) {
        const key = match[1] ?? '';
        if (namespacesOf(key)) used.add(key);
      }
    }
  }

  function namespacesOf(key: string) {
    return Object.keys(registry[BASE] ?? {}).includes(key.split('.')[0]!);
  }

  it('toda clave literal existe en español', () => {
    // Si el recorrido no encontrara claves, el test pasaría sin comprobar nada.
    expect(used.size).toBeGreaterThan(100);
    const missing = [...used].filter((key) => !keys.has(key)).sort();
    expect(missing).toEqual([]);
  });
});
