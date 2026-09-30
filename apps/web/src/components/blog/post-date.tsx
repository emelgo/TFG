/**
 * Fecha de publicación de una entrada. Se formatea con `use-intl`, que usa
 * el idioma de la interfaz y la zona horaria del proveedor (UTC), así que el
 * HTML del servidor y el del navegador coinciden al hidratar.
 */
import { useFormatter } from 'use-intl';

export function PostDate(props: { value: string | null }) {
  const format = useFormatter();

  if (!props.value) {
    return null;
  }

  return (
    <time dateTime={props.value}>
      {format.dateTime(new Date(props.value), { dateStyle: 'medium' })}
    </time>
  );
}
