import { useForm } from '@tanstack/react-form';
/**
 * Diálogo de crear o editar un permiso del CMS (F2.7b).
 *
 * Un solo campo «tipo» decide la forma del permiso:
 *
 *  - **Sistema**: recurso del CMS (`role`, `permission`, `account`…) y
 *    acción.
 *  - **Tabla** y **Columna**: esquema, tabla (y columna) elegidos de las
 *    tablas gestionadas que el usuario puede leer (`GET
 *    /v1/permissions/catalog`), o el comodín `*` explícito.
 *  - **Almacenamiento**: *bucket* y patrón de ruta, SIEMPRE explícitos
 *    (para todo, `*`): desde F2.7b un valor vacío ya no significa «todo»
 *    (ADR-015).
 *
 * Validación con `PermissionFormSchema` (mismos formatos que la API) y
 * envío solo de los campos de la forma elegida (`toPermissionInput`). La
 * API rechaza con `PERMISSION_NOT_GRANTABLE` crear o transformar un
 * permiso en una capacidad que el usuario no tiene.
 */
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { RBAC_ACTIONS, RBAC_SYSTEM_RESOURCES } from '@pymekit/cms-shared/rbac';
import type {
  CmsRbacCatalog,
  CmsRbacPermission,
} from '@pymekit/cms-ui-core/api';
import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import { Button } from '@pymekit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pymekit/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
} from '@pymekit/ui/field';
import { FieldLabelWithHelp } from '@pymekit/ui/field-help';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { Input } from '@pymekit/ui/input';
import { NativeSelect, NativeSelectOption } from '@pymekit/ui/native-select';
import { Spinner } from '@pymekit/ui/spinner';
import { Textarea } from '@pymekit/ui/textarea';

import {
  useCreatePermissionMutation,
  useUpdatePermissionMutation,
} from '../../hooks/use-rbac-mutations';
import {
  EMPTY_PERMISSION_FORM,
  PERMISSION_KINDS,
  PermissionFormSchema,
  type PermissionFormValues,
  permissionToFormValues,
  toPermissionInput,
} from '../../utils/rbac-forms';

type DialogControl = { open: boolean; onOpenChange: (open: boolean) => void };

/** Crear un permiso (sin `permission`) o editarlo (con `permission`). */
export function PermissionFormDialog(
  props: DialogControl & {
    permission?: CmsRbacPermission;
    onSaved?: (id: string) => void;
  },
) {
  return props.permission ? (
    <EditPermissionDialog {...props} permission={props.permission} />
  ) : (
    <CreatePermissionDialog {...props} />
  );
}

function CreatePermissionDialog(
  props: DialogControl & { onSaved?: (id: string) => void },
) {
  const mutation = useCreatePermissionMutation();

  return (
    <PermissionFormBody
      {...props}
      mode="create"
      initial={EMPTY_PERMISSION_FORM}
      submit={async (values) => {
        const result = await mutation.mutateAsync(toPermissionInput(values));

        props.onSaved?.(result.data.id);
      }}
    />
  );
}

function EditPermissionDialog(
  props: DialogControl & {
    permission: CmsRbacPermission;
    onSaved?: (id: string) => void;
  },
) {
  const mutation = useUpdatePermissionMutation(props.permission.id);

  return (
    <PermissionFormBody
      {...props}
      mode="edit"
      initial={permissionToFormValues(props.permission)}
      submit={async (values) => {
        await mutation.mutateAsync(toPermissionInput(values));
        props.onSaved?.(props.permission.id);
      }}
    />
  );
}

function PermissionFormBody(
  props: DialogControl & {
    mode: 'create' | 'edit';
    initial: PermissionFormValues;
    submit: (values: PermissionFormValues) => Promise<void>;
  },
) {
  const t = useTranslations('cms.settings.permissions');
  const { queries } = useCmsApi();
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog({
    open: props.open,
    onOpenChange: props.onOpenChange,
  });

  // Tablas gestionadas legibles para los selectores. Si falla (sin
  // permiso, red), los selectores solo ofrecen el comodín y el valor actual.
  const catalog = useQuery({ ...queries.rbacCatalog(), enabled: props.open });

  const form = useForm({
    defaultValues: props.initial,
    validators: {
      onChange: PermissionFormSchema,
      onSubmit: PermissionFormSchema,
    },
    onSubmit: async ({ value }) => {
      setIsPending(true);

      try {
        await props.submit(value);
        setOpen(false);
      } catch {
        // El aviso de error ya lo muestra la mutación.
      } finally {
        setIsPending(false);
      }
    },
  });

  // Campos repetidos (texto y selector) como funciones internas: así el
  // tipo de `form` se infiere sin genéricos explícitos.
  const renderText = (params: {
    name: 'name' | 'bucketName' | 'pathPattern';
    label: string;
    help?: string;
    /** Explicación del botón «?» junto a la etiqueta. */
    info: string;
    testId: string;
    maxLength: number;
  }) => (
    <form.Field name={params.name}>
      {(field) => {
        const isInvalid =
          field.state.meta.isTouched && !field.state.meta.isValid;

        return (
          <Field data-invalid={isInvalid}>
            <FieldLabelWithHelp htmlFor={params.testId} help={params.info}>
              {params.label}
            </FieldLabelWithHelp>
            <Input
              id={params.testId}
              data-testid={params.testId}
              value={field.state.value}
              maxLength={params.maxLength}
              aria-invalid={isInvalid}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            {params.help ? (
              <FieldDescription>{params.help}</FieldDescription>
            ) : null}
            <FieldError errors={field.state.meta.errors} />
          </Field>
        );
      }}
    </form.Field>
  );

  const renderSelect = (params: {
    name: 'systemResource' | 'schemaName' | 'tableName' | 'columnName';
    label: string;
    /** Explicación del botón «?» junto a la etiqueta. */
    info: string;
    testId: string;
    options: Array<{ value: string; label: string }>;
    onValueChange?: () => void;
  }) => (
    <form.Field name={params.name}>
      {(field) => {
        const isInvalid =
          field.state.meta.isTouched && !field.state.meta.isValid;

        return (
          <Field data-invalid={isInvalid}>
            <FieldLabelWithHelp htmlFor={params.testId} help={params.info}>
              {params.label}
            </FieldLabelWithHelp>
            <NativeSelect
              id={params.testId}
              data-testid={params.testId}
              className="w-full"
              value={field.state.value}
              aria-invalid={isInvalid}
              onBlur={field.handleBlur}
              onChange={(event) => {
                field.handleChange(event.target.value);
                params.onValueChange?.();
              }}
            >
              <NativeSelectOption value="">
                {t('permission.choose')}
              </NativeSelectOption>
              {params.options.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError errors={field.state.meta.errors} />
          </Field>
        );
      }}
    </form.Field>
  );

  return (
    <Dialog {...dialogProps}>
      <DialogContent
        data-testid="permission-form-dialog"
        className="sm:max-w-lg"
      >
        <form
          className="flex max-h-[80vh] flex-col gap-4 overflow-y-auto"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {props.mode === 'create'
                ? t('permission.createTitle')
                : t('permission.editTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('permission.formDescription')}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            {renderText({
              name: 'name',
              label: t('permission.name'),
              info: t('permission.nameHelp'),
              testId: 'permission-form-name',
              maxLength: 100,
            })}

            <form.Field name="description">
              {(field) => (
                <Field>
                  <FieldLabelWithHelp
                    htmlFor="permission-form-description"
                    help={t('permission.descriptionHelp')}
                  >
                    {t('permission.description')}
                  </FieldLabelWithHelp>
                  <Textarea
                    id="permission-form-description"
                    data-testid="permission-form-description"
                    value={field.state.value}
                    maxLength={500}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>

            <form.Field
              name="kind"
              listeners={{
                // Al cambiar de tipo se limpian los campos del anterior,
                // para no enviar ni validar valores que ya no se ven.
                onChange: () => {
                  for (const name of [
                    'systemResource',
                    'schemaName',
                    'tableName',
                    'columnName',
                    'bucketName',
                    'pathPattern',
                  ] as const) {
                    form.setFieldValue(name, '');
                  }
                },
              }}
            >
              {(field) => (
                <Field>
                  <FieldLabelWithHelp
                    htmlFor="permission-form-kind"
                    help={t('permission.kindHelp')}
                  >
                    {t('permission.kind')}
                  </FieldLabelWithHelp>
                  <NativeSelect
                    id="permission-form-kind"
                    data-testid="permission-form-kind"
                    className="w-full"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(
                        event.target.value as PermissionFormValues['kind'],
                      )
                    }
                  >
                    {PERMISSION_KINDS.map((kind) => (
                      <NativeSelectOption key={kind} value={kind}>
                        {t(`kinds.${kind}`)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <FieldDescription>
                    {t(`kindHelp.${field.state.value}`)}
                  </FieldDescription>
                </Field>
              )}
            </form.Field>

            <form.Subscribe
              selector={(state) => ({
                kind: state.values.kind,
                schemaName: state.values.schemaName,
                tableName: state.values.tableName,
              })}
            >
              {({ kind, schemaName, tableName }) => {
                if (kind === 'system') {
                  return renderSelect({
                    name: 'systemResource',
                    label: t('permission.resource'),
                    info: t('permission.resourceHelp'),
                    testId: 'permission-form-resource',
                    options: RBAC_SYSTEM_RESOURCES.map((resource) => ({
                      value: resource,
                      label: t(`resources.${resource}`),
                    })),
                  });
                }

                if (kind === 'storage') {
                  return (
                    <>
                      {renderText({
                        name: 'bucketName',
                        label: t('permission.bucket'),
                        info: t('permission.bucketMoreHelp'),
                        help: t('permission.bucketHelp'),
                        testId: 'permission-form-bucket',
                        maxLength: 100,
                      })}
                      {renderText({
                        name: 'pathPattern',
                        label: t('permission.path'),
                        info: t('permission.pathMoreHelp'),
                        help: t('permission.pathHelp'),
                        testId: 'permission-form-path',
                        maxLength: 500,
                      })}
                    </>
                  );
                }

                const options = getCatalogOptions(catalog.data, {
                  schemaName,
                  tableName,
                });

                return (
                  <>
                    {renderSelect({
                      name: 'schemaName',
                      label: t('permission.schema'),
                      info: t('permission.schemaHelp'),
                      testId: 'permission-form-schema',
                      options: options.schemas,
                      onValueChange: () => {
                        form.setFieldValue('tableName', '');
                        form.setFieldValue('columnName', '');
                      },
                    })}
                    {renderSelect({
                      name: 'tableName',
                      label: t('permission.table'),
                      info: t('permission.tableHelp'),
                      testId: 'permission-form-table',
                      options: options.tables,
                      onValueChange: () => form.setFieldValue('columnName', ''),
                    })}
                    {kind === 'column'
                      ? renderSelect({
                          name: 'columnName',
                          label: t('permission.column'),
                          info: t('permission.columnHelp'),
                          testId: 'permission-form-column',
                          options: options.columns,
                        })
                      : null}
                    <p className="text-muted-foreground text-xs">
                      {t('permission.catalogHelp')}
                    </p>
                  </>
                );
              }}
            </form.Subscribe>

            <form.Field name="action">
              {(field) => (
                <Field>
                  <FieldLabelWithHelp
                    htmlFor="permission-form-action"
                    help={t('permission.actionHelp')}
                  >
                    {t('permission.action')}
                  </FieldLabelWithHelp>
                  <NativeSelect
                    id="permission-form-action"
                    data-testid="permission-form-action"
                    className="w-full"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(
                        event.target.value as PermissionFormValues['action'],
                      )
                    }
                  >
                    {RBAC_ACTIONS.map((action) => (
                      <NativeSelectOption key={action} value={action}>
                        {t(`actions.${action === '*' ? 'all' : action}`)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
          </FieldGroup>

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
              type="submit"
              data-testid="permission-form-submit"
              disabled={isPending}
            >
              {isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
              {props.mode === 'create'
                ? t('permission.create')
                : t('permission.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Opciones de los selectores de esquema, tabla y columna a partir del
 * catálogo, con el comodín `*` y el valor actual aunque no esté en el
 * catálogo (al editar un permiso sobre una tabla que el usuario ya no lee).
 */
function getCatalogOptions(
  catalog: CmsRbacCatalog | undefined,
  current: { schemaName: string; tableName: string },
) {
  const tables = catalog?.tables ?? [];
  const wildcard = { value: '*', label: '*' };
  const withCurrent = (values: string[], value: string) =>
    value && value !== '*' && !values.includes(value)
      ? [...values, value]
      : values;

  const schemas = withCurrent(
    [...new Set(tables.map((table) => table.schemaName))],
    current.schemaName,
  );

  const tableNames =
    current.schemaName === '*'
      ? []
      : withCurrent(
          tables
            .filter((table) => table.schemaName === current.schemaName)
            .map((table) => table.tableName),
          current.tableName,
        );

  const columns =
    tables.find(
      (table) =>
        table.schemaName === current.schemaName &&
        table.tableName === current.tableName,
    )?.columns ?? [];

  const toOptions = (values: string[]) => [
    wildcard,
    ...values.map((value) => ({ value, label: value })),
  ];

  return {
    schemas: toOptions(schemas),
    tables: toOptions(tableNames),
    columns: toOptions(columns),
  };
}
