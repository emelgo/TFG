import { Loader2 } from 'lucide-react';

import { CardHeader } from '@pymekit/ui/card';
import { cn } from '@pymekit/ui/utils';

/**
 * Cabecera de una sección de registros relacionados: el total delante del
 * nombre («4 Accounts Memberships»), un icono opcional y una acción a la
 * derecha (por ejemplo, abrir la tabla ya filtrada).
 */
export function RelatedRecordsSectionHeader(props: {
  label: string;
  count: number;
  isLoading?: boolean;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <CardHeader className={cn(props.className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {props.icon}

          <span className="text-sm font-medium">
            {props.isLoading ? (
              <Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" />
            ) : (
              <span className="mr-1.5" data-testid="related-records-count">
                {props.count}
              </span>
            )}

            {props.label}
          </span>
        </div>

        {props.action ? (
          <div className="flex items-center">{props.action}</div>
        ) : null}
      </div>
    </CardHeader>
  );
}
