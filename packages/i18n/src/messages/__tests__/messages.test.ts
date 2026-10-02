import { describe, expect, it } from 'vitest';

import { locales } from '../../config';
import { registry } from '../index';

/**
 * Paridad de traducciones entre español e inglés.
 *
 * Cada idioma debe tener EXACTAMENTE las mismas claves en cada espacio de
 * nombres (namespace). Si falta una clave en un idioma, `use-intl` mostraría
 * la clave en crudo («cms.sidebar.users») en vez del texto, así que es mejor
 * que lo detecte un test. Además se comprueba que cada mensaje conserva los
 * mismos marcadores ICU (`{count}`, `{name}`…), porque traducir por error el
 * nombre de un marcador rompe la interpolación sin dar ningún error visible.
 *
 * También se revisan las plantillas de correo de `@pymekit/email-templates`.
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

describe('catálogos de mensajes', () => {
  it('incluye español e inglés', () => {
    expect(locales).toEqual(expect.arrayContaining(['es', 'en']));
  });

  const namespaces = Object.keys(registry.en ?? {});

  for (const locale of locales.filter((l) => l !== 'en')) {
    it(`${locale} tiene los mismos namespaces que en`, () => {
      expect(Object.keys(registry[locale] ?? {}).sort()).toEqual(
        [...namespaces].sort(),
      );
    });

    for (const namespace of namespaces) {
      it(`${locale}/${namespace}: mismas claves y marcadores que en`, () => {
        expectSameShape(
          flatten(registry.en![namespace] as Tree),
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

  for (const file of readdirSync(join(root, 'en'))) {
    it(`es/${file}: mismas claves y marcadores que en`, () => {
      expectSameShape(flatten(read('en', file)), flatten(read('es', file)));
    });
  }
});
