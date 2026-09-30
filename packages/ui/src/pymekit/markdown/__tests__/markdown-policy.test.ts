/**
 * Pruebas de la política de enlaces e imágenes del Markdown público y del
 * componente `SafeMarkdown` (renderizado en el servidor, sin navegador).
 *
 * Cubren los vectores habituales de XSS en Markdown: HTML crudo, esquemas
 * `javascript:`/`data:` (también ofuscados con espacios o mayúsculas) y
 * URL sin esquema que el navegador resuelve a otro dominio.
 */
import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  EXTERNAL_LINK_REL,
  getMarkdownLinkAttributes,
  isExternalHref,
  sanitizeMarkdownHref,
  sanitizeMarkdownImageSrc,
} from '../markdown-policy';
import { SafeMarkdown } from '../safe-markdown';

describe('sanitizeMarkdownHref', () => {
  it('acepta rutas relativas, anclas y consultas', () => {
    expect(sanitizeMarkdownHref('/pricing')).toBe('/pricing');
    expect(sanitizeMarkdownHref('#seccion')).toBe('#seccion');
    expect(sanitizeMarkdownHref('?page=2')).toBe('?page=2');
    expect(sanitizeMarkdownHref('otra-entrada')).toBe('otra-entrada');
  });

  it('acepta http, https y mailto', () => {
    expect(sanitizeMarkdownHref('https://example.com/a')).toBe(
      'https://example.com/a',
    );
    expect(sanitizeMarkdownHref('http://example.com')).toBe(
      'http://example.com',
    );
    expect(sanitizeMarkdownHref('mailto:hola@example.com')).toBe(
      'mailto:hola@example.com',
    );
  });

  it('rechaza esquemas peligrosos, también ofuscados', () => {
    expect(sanitizeMarkdownHref('javascript:alert(1)')).toBeNull();
    expect(sanitizeMarkdownHref('JavaScript:alert(1)')).toBeNull();
    expect(sanitizeMarkdownHref(' java\tscript:alert(1)')).toBeNull();
    expect(sanitizeMarkdownHref('data:text/html,<script>')).toBeNull();
    expect(sanitizeMarkdownHref('vbscript:msgbox')).toBeNull();
    expect(sanitizeMarkdownHref('file:///etc/passwd')).toBeNull();
  });

  it('rechaza valores vacíos', () => {
    expect(sanitizeMarkdownHref('')).toBeNull();
    expect(sanitizeMarkdownHref('   ')).toBeNull();
    expect(sanitizeMarkdownHref(undefined)).toBeNull();
  });

  it('normaliza las URL sin esquema a https (son externas)', () => {
    expect(sanitizeMarkdownHref('//evil.example/x')).toBe(
      'https://evil.example/x',
    );
    expect(sanitizeMarkdownHref('/\\evil.example/x')).toBe(
      'https://evil.example/x',
    );
  });
});

describe('isExternalHref y getMarkdownLinkAttributes', () => {
  it('las rutas relativas y mailto no son externas', () => {
    expect(isExternalHref('/blog')).toBe(false);
    expect(isExternalHref('mailto:a@b.c')).toBe(false);
    expect(getMarkdownLinkAttributes('/blog')).toEqual({});
  });

  it('una URL absoluta a otro origen es externa', () => {
    expect(isExternalHref('https://otro.example', 'https://pymekit.test')).toBe(
      true,
    );
    expect(
      getMarkdownLinkAttributes('https://otro.example', 'https://pymekit.test'),
    ).toEqual({ target: '_blank', rel: EXTERNAL_LINK_REL });
  });

  it('una URL absoluta al propio origen es interna', () => {
    expect(
      isExternalHref('https://pymekit.test/pricing', 'https://pymekit.test'),
    ).toBe(false);
  });

  it('sin origen del sitio, toda URL absoluta cuenta como externa', () => {
    expect(isExternalHref('https://pymekit.test/pricing')).toBe(true);
  });
});

describe('sanitizeMarkdownImageSrc', () => {
  it('solo acepta https absoluto', () => {
    expect(sanitizeMarkdownImageSrc('https://cdn.example/a.png')).toBe(
      'https://cdn.example/a.png',
    );
    expect(sanitizeMarkdownImageSrc('http://cdn.example/a.png')).toBeNull();
    expect(sanitizeMarkdownImageSrc('/local.png')).toBeNull();
    expect(sanitizeMarkdownImageSrc('data:image/png;base64,AAAA')).toBeNull();
    expect(sanitizeMarkdownImageSrc('javascript:alert(1)')).toBeNull();
    expect(sanitizeMarkdownImageSrc(null)).toBeNull();
  });
});

describe('SafeMarkdown', () => {
  const render = (markdown: string, siteOrigin?: string) =>
    renderToStaticMarkup(
      createElement(SafeMarkdown, { siteOrigin, children: markdown }),
    );

  it('renderiza el Markdown básico', () => {
    const html = render('## Título\n\nTexto con **negrita**.');

    expect(html).toContain('<h2>Título</h2>');
    expect(html).toContain('<strong>negrita</strong>');
  });

  it('descarta el HTML crudo', () => {
    const html = render(
      'Hola <script>alert(1)</script><img src="https://x.example/a.png" onerror="alert(1)">',
    );

    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<img');
  });

  it('quita el enlace de un esquema peligroso pero conserva el texto', () => {
    const html = render('[pulsa](javascript:alert(1))');

    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a');
    expect(html).toContain('pulsa');
  });

  it('marca los enlaces externos con rel y target', () => {
    const html = render(
      '[fuera](https://otro.example)',
      'https://pymekit.test',
    );

    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('target="_blank"');
  });

  it('no marca los enlaces internos', () => {
    const html = render('[precios](/pricing)', 'https://pymekit.test');

    expect(html).toContain('href="/pricing"');
    expect(html).not.toContain('target=');
  });

  it('solo pinta imágenes https', () => {
    expect(render('![a](https://cdn.example/a.png)')).toContain(
      'src="https://cdn.example/a.png"',
    );
    expect(render('![a](http://cdn.example/a.png)')).not.toContain('<img');
    expect(render('![a](data:image/png;base64,AAAA)')).not.toContain('<img');
  });
});
