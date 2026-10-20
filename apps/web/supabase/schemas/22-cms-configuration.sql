
/**
 * -------------------------------------------------------
 * Sección: Configuración del CMS
 * Pares clave-valor con las opciones del panel de administración (por
 * ejemplo, `requires_mfa`). La RLS que limita quién puede leerlas y
 * modificarlas se define en 35-cms-configuration-rls.sql.
 * -------------------------------------------------------
 */
create table if not exists cms.configuration (
  key VARCHAR(100) primary key,
  value TEXT not null,
  created_at TIMESTAMPTZ not null default NOW(),
  updated_at TIMESTAMPTZ not null default NOW()
);

alter table cms.configuration enable row level security;

-- Permisos de tabla; qué filas puede ver o tocar cada usuario lo decide la RLS.
grant
select
,
  insert,
update,
delete on cms.configuration to authenticated,
service_role;

-- Función `cms.get_configuration_value`: devuelve el valor de una opción por su
-- clave. Se ejecuta con los permisos del usuario, así que la RLS de la tabla
-- sigue aplicándose.
create or replace function cms.get_configuration_value (p_key VARCHAR(100)) returns TEXT
set
  search_path = '' as $$
declare
    v_value TEXT;
begin
    -- Validate key format to prevent injection
    if p_key !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' then
        raise exception 'Invalid configuration key format';
    end if;

    select value
    into v_value
    from cms.configuration
    where key = p_key;

    return v_value;
end;
$$ language plpgsql;

grant
execute on function cms.get_configuration_value (VARCHAR(100)) to authenticated,
service_role;