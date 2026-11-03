-- Las políticas RLS no evalúan por fila las funciones que no dependen de ella.
--
-- `is_super_admin()`, `is_mfa_compliant()` (de `public` y de `cms`),
-- `is_aal2()`, `auth.uid()` y `auth.jwt()` no reciben argumentos: su resultado es el mismo para todas las
-- filas de una consulta. Si una política las llama directamente, PostgreSQL
-- las vuelve a ejecutar en cada fila; envueltas en `(select …)`, las evalúa
-- una sola vez (InitPlan). Con 10.000 cuentas, la diferencia en la lista de
-- cuentas de la consola era de unos 900 ms frente a unos 7 ms (B-60).
--
-- El catálogo muestra la forma envuelta como `( SELECT is_super_admin() AS
-- is_super_admin)`. El test quita esas apariciones de la expresión de cada
-- política y comprueba que no queda ninguna llamada directa. Si alguien añade
-- una política nueva sin el envoltorio, falla y la nombra.
--
-- Excepción: `cms.saved_views` y `cms.saved_view_roles`. Sus políticas se
-- consultan mutuamente y, con una subconsulta en la política anidada,
-- PostgreSQL detecta una recursión al insertar en `saved_view_roles` (lo
-- comprueban cms-saved-views y cms-rbac-f27b). Son tablas pequeñas.
--
-- [TFG] RNF-09 · B-55, B-60.

begin;

select plan(1);

select is_empty(
  $$
    select schemaname || '.' || tablename || ' · ' || policyname
    from pg_policies
    where schemaname in ('public', 'cms', 'storage')
      and (schemaname, tablename) not in (
        ('cms', 'saved_views'),
        ('cms', 'saved_view_roles')
      )
      and regexp_replace(
            coalesce(qual, '') || ' ' || coalesce(with_check, ''),
            'SELECT (public\.|cms\.|auth\.)?(is_super_admin|is_mfa_compliant|is_aal2|uid|jwt)\(\)',
            '',
            'g'
          ) ~ '(is_super_admin|is_mfa_compliant|is_aal2|auth\.uid|auth\.jwt)\(\)'
  $$,
  'Ninguna política RLS evalúa por fila is_super_admin, is_mfa_compliant, is_aal2, auth.uid ni auth.jwt'
);

select * from finish();

rollback;
