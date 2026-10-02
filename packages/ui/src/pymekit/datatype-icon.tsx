/**
 * Icono que representa el tipo de dato de una columna de PostgreSQL.
 *
 * Lo usan el explorador de datos del CMS (menú «Añadir filtro», cabecera de
 * cada filtro) y cualquier pantalla que liste columnas, para que el usuario
 * distinga de un vistazo números, textos, fechas, booleanos o JSON. Recibe el
 * nombre del tipo tal como lo devuelve el catálogo (`integer`,
 * `timestamp with time zone`…); los tipos desconocidos (enumerados propios,
 * por ejemplo) usan un icono de lista genérico.
 */
import {
  BinaryIcon,
  BracesIcon,
  Calendar,
  HashIcon,
  KeyRoundIcon,
  ListIcon,
  ToggleRightIcon,
  TypeIcon,
} from 'lucide-react';

export function DataTypeIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  switch (type) {
    case 'integer':
    case 'bigint':
    case 'real':
    case 'double precision':
    case 'smallint':
    case 'numeric':
      return <HashIcon className={className} />;

    case 'character varying':
    case 'text':
      return <TypeIcon className={className} />;

    case 'boolean':
      return <ToggleRightIcon className={className} />;

    case 'date':
    case 'timestamp':
    case 'timestamp with time zone':
    case 'time':
      return <Calendar className={className} />;

    case 'json':
    case 'jsonb':
      return <BracesIcon className={className} />;

    case 'bytea':
      return <BinaryIcon className={className} />;

    case 'uuid':
      return <KeyRoundIcon className={className} />;

    default:
      return <ListIcon className={className} />;
  }
}
