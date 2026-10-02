/**
 * Piezas comunes de Ajustes > Permisos (F2.7b): la descripción corta de un
 * permiso, la marca de «sistema», el enlace de vuelta, la lista de
 * elementos asignados con su botón de quitar y los diálogos de confirmar
 * un borrado y de asignar elementos.
 *
 * Los diálogos no deciden nada: solo se muestran si la API dijo que la
 * acción está permitida (`access` de la ficha) y la API vuelve a
 * comprobarlo todo al recibir la petición.
 */
import { useState } from 'react';

import { Link } from '@tanstack/react-router';
import { ChevronLeftIcon, LockIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { CmsRbacPermission } from '@pymekit/cms-ui-core/api';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pymekit/ui/alert-dialog';
import { Badge } from '@pymekit/ui/badge';
import { Button } from '@pymekit/ui/button';
import { Checkbox } from '@pymekit/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pymekit/ui/dialog';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { Spinner } from '@pymekit/ui/spinner';
import { cn } from '@pymekit/ui/utils';

import {
  describePermissionTarget,
  filterByQuery,
} from '../../utils/rbac-forms';

/** Marca de objeto de sistema (inmutable desde el CMS). */
export function SystemBadge() {
  const t = useTranslations('cms.settings.permissions');

  return (
    <Badge variant="outline" data-testid="rbac-system-badge">
      <LockIcon className="h-3 w-3" />
      {t('system')}
    </Badge>
  );
}

/** Tipo, objetivo y acción de un permiso en forma de etiquetas. */
export function PermissionSummary(props: {
  permission: Pick<
    CmsRbacPermission,
    | 'permissionType'
    | 'systemResource'
    | 'scope'
    | 'schemaName'
    | 'tableName'
    | 'columnName'
    | 'bucketName'
    | 'pathPattern'
    | 'action'
  >;
}) {
  const t = useTranslations('cms.settings.permissions');
  const { permission } = props;
  const kind =
    permission.permissionType === 'system'
      ? 'system'
      : (permission.scope ?? 'table');

  return (
    <span className="flex flex-wrap items-center gap-1">
      <Badge variant="secondary">{t(`kinds.${kind}`)}</Badge>
      <code className="bg-muted rounded px-1 py-0.5 text-xs">
        {describePermissionTarget(permission)}
      </code>
      <Badge variant="outline">
        {t(`actions.${actionKey(permission.action)}`)}
      </Badge>
    </span>
  );
}

function actionKey(action: string) {
  return action === '*' ? 'all' : action;
}

/** Enlace de vuelta a la pestaña indicada de la pantalla de permisos. */
export function BackToPermissions(props: {
  tab: 'roles' | 'groups' | 'permissions';
}) {
  const t = useTranslations('cms.settings.permissions');

  return (
    <Link
      to="/admin/cms/settings/permissions"
      search={{ tab: props.tab }}
      data-testid="rbac-back"
      className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-xs"
    >
      <ChevronLeftIcon className="h-3.5 w-3.5" />
      {t('back')}
    </Link>
  );
}

/**
 * Lista de elementos asignados (grupos o permisos) con un botón para
 * quitar cada uno si `onRemove` está definido.
 */
export function AssignedList(props: {
  testId: string;
  emptyLabel: string;
  items: Array<{ id: string; label: React.ReactNode }>;
  removeLabel: string;
  onRemove?: (id: string) => void;
  isRemoving?: boolean;
}) {
  if (props.items.length === 0) {
    return (
      <p
        className="text-muted-foreground text-sm"
        data-testid={`${props.testId}-empty`}
      >
        {props.emptyLabel}
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-md border" data-testid={props.testId}>
      {props.items.map((item) => (
        <li
          key={item.id}
          className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
          data-testid={`${props.testId}-item`}
          data-item-id={item.id}
        >
          <span className="min-w-0 flex-1">{item.label}</span>

          {props.onRemove ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={props.isRemoving}
              aria-label={props.removeLabel}
              data-testid={`${props.testId}-remove-${item.id}`}
              onClick={() => props.onRemove?.(item.id)}
            >
              <XIcon className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Confirmación de borrado de un rol, grupo o permiso. */
export function ConfirmDeleteDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => Promise<unknown>;
}) {
  const t = useTranslations('cms.settings.permissions');
  const [isPending, setIsPending] = useState(false);

  return (
    <AlertDialog
      open={props.open}
      onOpenChange={(open) => {
        if (!isPending) {
          props.onOpenChange(open);
        }
      }}
    >
      <AlertDialogContent data-testid="confirm-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {t('cancel')}
          </AlertDialogCancel>

          <Button
            type="button"
            variant="destructive"
            data-testid="confirm-delete-submit"
            disabled={isPending}
            onClick={() => {
              setIsPending(true);
              void props
                .onConfirm()
                .catch(() => {
                  // El aviso de error ya lo muestra la mutación.
                })
                .finally(() => setIsPending(false));
            }}
          >
            {isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
            {t('delete')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Diálogo para asignar varios elementos a la vez. Solo ofrece los que la
 * API devolvió como asignables (`assignable*`: capacidades que el usuario
 * tiene y que aún no están asignadas).
 */
export function AssignItemsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  emptyLabel: string;
  options: Array<{
    id: string;
    name: string;
    description?: string | null;
    detail?: React.ReactNode;
  }>;
  onSubmit: (ids: string[]) => Promise<unknown>;
}) {
  const t = useTranslations('cms.settings.permissions');
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog({
    open: props.open,
    onOpenChange: props.onOpenChange,
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  const options = filterByQuery(props.options, query, (option) => [
    option.name,
    option.description,
  ]);

  return (
    <Dialog {...dialogProps}>
      <DialogContent data-testid="assign-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>

        {props.options.length === 0 ? (
          <p
            className="text-muted-foreground text-sm"
            data-testid="assign-empty"
          >
            {props.emptyLabel}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              className="border-input bg-background h-8 rounded-md border px-2 text-sm"
              placeholder={t('searchPlaceholder')}
              data-testid="assign-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />

            <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
              {options.map((option) => {
                const checked = selected.includes(option.id);

                return (
                  <li key={option.id}>
                    <label className="hover:bg-muted flex cursor-pointer items-start gap-2 px-3 py-2 text-sm">
                      <Checkbox
                        className="mt-0.5"
                        checked={checked}
                        data-testid={`assign-option-${option.id}`}
                        onCheckedChange={(value) =>
                          setSelected((current) =>
                            value
                              ? [...current, option.id]
                              : current.filter((id) => id !== option.id),
                          )
                        }
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-medium">{option.name}</span>
                        {option.detail ?? null}
                        {option.description ? (
                          <span className="text-muted-foreground text-xs">
                            {option.description}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => setOpen(false)}
          >
            {t('cancel')}
          </Button>

          <Button
            type="button"
            data-testid="assign-submit"
            disabled={isPending || selected.length === 0}
            onClick={() => {
              setIsPending(true);
              void props
                .onSubmit(selected)
                .then(() => setOpen(false))
                .catch(() => {
                  // El aviso de error ya lo muestra la mutación.
                })
                .finally(() => setIsPending(false));
            }}
          >
            {isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
            {t('assign', { count: selected.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Enlace a la ficha de un rol, grupo o permiso. Si el usuario no puede
 * abrir esa ficha (roles: `role:select`; grupos y permisos:
 * `permission:select`), se muestra solo el texto: un enlace que acaba en
 * «no encontrado» no ayuda.
 */
export function RbacEntityLink(
  props: React.PropsWithChildren<{
    kind: 'role' | 'group' | 'permission';
    id: string;
    enabled: boolean;
    className?: string;
  }>,
) {
  if (!props.enabled) {
    return <span className={props.className}>{props.children}</span>;
  }

  const className = cn(props.className, 'hover:underline');

  if (props.kind === 'role') {
    return (
      <Link
        to="/admin/cms/settings/permissions/roles/$id"
        params={{ id: props.id }}
        className={className}
      >
        {props.children}
      </Link>
    );
  }

  if (props.kind === 'group') {
    return (
      <Link
        to="/admin/cms/settings/permissions/groups/$id"
        params={{ id: props.id }}
        className={className}
      >
        {props.children}
      </Link>
    );
  }

  return (
    <Link
      to="/admin/cms/settings/permissions/$id"
      params={{ id: props.id }}
      className={className}
    >
      {props.children}
    </Link>
  );
}
