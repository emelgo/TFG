/**
 * Consultas de TanStack Query de la interfaz del CMS.
 *
 * Centraliza las claves de caché (`cmsQueryKeys`) y las opciones de cada
 * consulta (`queryOptions`) para que el *loader* de una ruta
 * (`context.queryClient.ensureQueryData(...)`) y los componentes
 * (`useQuery(...)`) compartan exactamente la misma entrada de caché: lo que
 * carga el servidor durante el SSR se hidrata en el navegador sin repetir la
 * petición.
 */
import { queryOptions } from '@tanstack/react-query';

import type { CmsApi, RecordParams, TableDataParams } from './api';
import type {
  AuditLogsListParams,
  MemberAuditLogsParams,
} from './audit-logs-api';
import { shouldRetryCmsQuery } from './errors';
import type { MembersListParams } from './settings-api';
import type { BucketContentsParams } from './storage-api';
import type { UsersListParams } from './users-api';

/** Claves de caché de TanStack Query del CMS. */
export const cmsQueryKeys = {
  all: ['cms'] as const,
  account: () => [...cmsQueryKeys.all, 'account'] as const,
  navigation: () => [...cmsQueryKeys.all, 'navigation'] as const,
  /**
   * Prefijo de todo lo que depende de alguna tabla (listados, fichas,
   * metadatos y permisos). Tras una escritura se invalida entero: borrar un
   * registro puede borrar en cascada filas de otras tablas que se ven en las
   * secciones de registros relacionados.
   */
  tables: () => [...cmsQueryKeys.all, 'tables'] as const,
  /** Prefijo común de todo lo que depende de una tabla concreta. */
  table: (schema: string, table: string) =>
    [...cmsQueryKeys.all, 'tables', schema, table] as const,
  tableData: (params: TableDataParams) =>
    [
      ...cmsQueryKeys.table(params.schema, params.table),
      'data',
      {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? null,
        search: params.search ?? '',
        sortColumn: params.sortColumn ?? null,
        sortDirection: params.sortDirection ?? null,
        filters: params.filters ?? {},
      },
    ] as const,
  savedViews: (schema: string, table: string) =>
    [...cmsQueryKeys.table(schema, table), 'views'] as const,
  tableMetadata: (schema: string, table: string) =>
    [...cmsQueryKeys.table(schema, table), 'metadata'] as const,
  /**
   * Ficha de un registro. Las claves se ordenan para que `{a, b}` y `{b, a}`
   * (el orden de los parámetros de la URL) compartan la misma entrada.
   */
  record: (params: RecordParams) =>
    [
      ...cmsQueryKeys.table(params.schema, params.table),
      'record',
      Object.fromEntries(
        Object.entries(params.keys).sort(([a], [b]) => a.localeCompare(b)),
      ),
    ] as const,
  tablePermissions: (schema: string, table: string) =>
    [...cmsQueryKeys.table(schema, table), 'permissions'] as const,
  rolesForSharing: () => [...cmsQueryKeys.all, 'roles', 'sharing'] as const,
  /** Prefijo de todo lo del explorador de usuarios (se invalida tras actuar). */
  users: () => [...cmsQueryKeys.all, 'users'] as const,
  usersList: (params: UsersListParams) =>
    [
      ...cmsQueryKeys.users(),
      'list',
      { page: params.page ?? 1, search: params.search ?? '' },
    ] as const,
  user: (id: string) => [...cmsQueryKeys.users(), 'detail', id] as const,
  /** Prefijo de todo lo del explorador de almacenamiento. */
  storage: () => [...cmsQueryKeys.all, 'storage'] as const,
  storageBuckets: () => [...cmsQueryKeys.storage(), 'buckets'] as const,
  bucketContents: (params: BucketContentsParams) =>
    [
      ...cmsQueryKeys.storage(),
      'contents',
      params.bucket,
      {
        path: params.path,
        search: params.search ?? '',
        page: params.page ?? 1,
      },
    ] as const,
  /** Prefijo de todo lo del registro de auditoría. */
  auditLogs: () => [...cmsQueryKeys.all, 'audit-logs'] as const,
  auditLogsList: (params: AuditLogsListParams) =>
    [
      ...cmsQueryKeys.auditLogs(),
      'list',
      {
        cursor: params.cursor ?? null,
        limit: params.limit ?? null,
        author: params.author ?? '',
        actions: [...(params.actions ?? [])].sort(),
        schema: params.schema ?? '',
        table: params.table ?? '',
        severity: params.severity ?? null,
        startDate: params.startDate ?? null,
        endDate: params.endDate ?? null,
      },
    ] as const,
  auditLog: (id: string) =>
    [...cmsQueryKeys.auditLogs(), 'detail', id] as const,
  memberAuditLogs: (params: MemberAuditLogsParams) =>
    [
      ...cmsQueryKeys.auditLogs(),
      'member',
      params.accountId,
      { cursor: params.cursor ?? null, limit: params.limit ?? null },
    ] as const,
  /** Obligación de MFA (Ajustes > Autenticación). */
  mfaConfiguration: () => [...cmsQueryKeys.all, 'settings', 'mfa'] as const,
  /** Prefijo de todo lo de Ajustes > Miembros (se invalida tras actuar). */
  members: () => [...cmsQueryKeys.all, 'members'] as const,
  membersList: (params: MembersListParams) =>
    [
      ...cmsQueryKeys.members(),
      'list',
      { page: params.page ?? 1, search: params.search ?? '' },
    ] as const,
  member: (id: string) => [...cmsQueryKeys.members(), 'detail', id] as const,
  /** Resultados de la búsqueda global para un texto ya normalizado. */
  globalSearch: (query: string) =>
    [...cmsQueryKeys.all, 'global-search', query] as const,
};

/**
 * Crea las opciones de consulta de la interfaz base del CMS a partir de las
 * funciones de acceso a la API (`createCmsApi`).
 */
export function createCmsQueries(api: CmsApi) {
  return {
    /** Cuenta del CMS del usuario y secciones que puede usar. */
    account: () =>
      queryOptions({
        queryKey: cmsQueryKeys.account(),
        queryFn: () => api.getAccount(),
        retry: shouldRetryCmsQuery,
      }),

    /** Tablas que el usuario puede leer (explorador de datos). */
    navigation: () =>
      queryOptions({
        queryKey: cmsQueryKeys.navigation(),
        queryFn: () => api.getNavigation(),
        retry: shouldRetryCmsQuery,
      }),

    /**
     * Una página del listado de una tabla. La clave incluye todos los
     * parámetros (página, búsqueda, orden y filtros), así que cada
     * combinación tiene su propia entrada de caché y volver atrás es
     * instantáneo durante `staleTime`.
     */
    tableData: (params: TableDataParams) =>
      queryOptions({
        queryKey: cmsQueryKeys.tableData(params),
        queryFn: () => api.getTableData(params),
        retry: shouldRetryCmsQuery,
        staleTime: 30 * 1000,
      }),

    /**
     * Metadato de una tabla. Cambia muy poco (solo desde los ajustes del
     * recurso), así que se considera fresco 5 minutos.
     */
    tableMetadata: (schema: string, table: string) =>
      queryOptions({
        queryKey: cmsQueryKeys.tableMetadata(schema, table),
        queryFn: () => api.getTableMetadata({ schema, table }),
        retry: shouldRetryCmsQuery,
        staleTime: 5 * 60 * 1000,
      }),

    /**
     * Ficha de un registro con sus claves foráneas resueltas. Se considera
     * fresca 15 segundos: al volver a la ficha desde una fila relacionada se
     * ve al instante, y tras editarla se invalida su prefijo.
     */
    record: (params: RecordParams) =>
      queryOptions({
        queryKey: cmsQueryKeys.record(params),
        queryFn: () => api.getRecord(params),
        retry: shouldRetryCmsQuery,
        staleTime: 15 * 1000,
      }),

    /**
     * Permisos del usuario sobre una tabla. Deciden qué acciones de escritura
     * se muestran (crear, editar, borrar); la API las vuelve a comprobar.
     */
    tablePermissions: (schema: string, table: string) =>
      queryOptions({
        queryKey: cmsQueryKeys.tablePermissions(schema, table),
        queryFn: () => api.getTablePermissions({ schema, table }),
        retry: shouldRetryCmsQuery,
        staleTime: 60 * 1000,
      }),

    /** Vistas guardadas (personales y de equipo) de una tabla. */
    savedViews: (schema: string, table: string) =>
      queryOptions({
        queryKey: cmsQueryKeys.savedViews(schema, table),
        queryFn: () => api.getSavedViews({ schema, table }),
        retry: shouldRetryCmsQuery,
        staleTime: 30 * 1000,
      }),

    /** Roles del CMS con los que se puede compartir una vista guardada. */
    rolesForSharing: () =>
      queryOptions({
        queryKey: cmsQueryKeys.rolesForSharing(),
        queryFn: () => api.getRolesForSharing(),
        retry: shouldRetryCmsQuery,
        staleTime: 5 * 60 * 1000,
      }),

    /** Página del listado de usuarios de Auth. */
    usersList: (params: UsersListParams) =>
      queryOptions({
        queryKey: cmsQueryKeys.usersList(params),
        queryFn: () => api.getUsers(params),
        retry: shouldRetryCmsQuery,
        staleTime: 15 * 1000,
      }),

    /** Ficha de un usuario de Auth y acciones disponibles. */
    user: (id: string) =>
      queryOptions({
        queryKey: cmsQueryKeys.user(id),
        queryFn: () => api.getUser(id),
        retry: shouldRetryCmsQuery,
        staleTime: 15 * 1000,
      }),

    /** *Buckets* legibles del almacenamiento. */
    storageBuckets: () =>
      queryOptions({
        queryKey: cmsQueryKeys.storageBuckets(),
        queryFn: () => api.getStorageBuckets(),
        retry: shouldRetryCmsQuery,
        staleTime: 60 * 1000,
      }),

    /**
     * Contenido de una carpeta. Las URL de vista previa caducan a los 10
     * minutos, así que la entrada se considera fresca solo 1 minuto.
     */
    bucketContents: (params: BucketContentsParams) =>
      queryOptions({
        queryKey: cmsQueryKeys.bucketContents(params),
        queryFn: () => api.getBucketContents(params),
        retry: shouldRetryCmsQuery,
        staleTime: 60 * 1000,
      }),

    /**
     * Página del registro de auditoría. Fresca 15 segundos: es un registro
     * vivo, pero volver atrás entre páginas debe ser instantáneo.
     */
    auditLogsList: (params: AuditLogsListParams) =>
      queryOptions({
        queryKey: cmsQueryKeys.auditLogsList(params),
        queryFn: () => api.getAuditLogs(params),
        retry: shouldRetryCmsQuery,
        staleTime: 15 * 1000,
      }),

    /** Una entrada del registro (no cambia nunca: fresca 5 minutos). */
    auditLog: (id: string) =>
      queryOptions({
        queryKey: cmsQueryKeys.auditLog(id),
        queryFn: () => api.getAuditLog(id),
        retry: shouldRetryCmsQuery,
        staleTime: 5 * 60 * 1000,
      }),

    /** Página del registro de un miembro del CMS. */
    memberAuditLogs: (params: MemberAuditLogsParams) =>
      queryOptions({
        queryKey: cmsQueryKeys.memberAuditLogs(params),
        queryFn: () => api.getMemberAuditLogs(params),
        retry: shouldRetryCmsQuery,
        staleTime: 15 * 1000,
      }),

    /** Obligación de MFA y lo que el usuario puede hacer con ella. */
    mfaConfiguration: () =>
      queryOptions({
        queryKey: cmsQueryKeys.mfaConfiguration(),
        queryFn: () => api.getMfaConfiguration(),
        retry: shouldRetryCmsQuery,
      }),

    /** Página del listado de miembros del CMS. */
    membersList: (params: MembersListParams) =>
      queryOptions({
        queryKey: cmsQueryKeys.membersList(params),
        queryFn: () => api.getMembers(params),
        retry: shouldRetryCmsQuery,
        staleTime: 15 * 1000,
      }),

    /** Ficha de un miembro y acciones disponibles. */
    member: (id: string) =>
      queryOptions({
        queryKey: cmsQueryKeys.member(id),
        queryFn: () => api.getMember(id),
        retry: shouldRetryCmsQuery,
        staleTime: 15 * 1000,
      }),

    /** Búsqueda global (la paleta ya aplica el retardo al escribir). */
    globalSearch: (query: string) =>
      queryOptions({
        queryKey: cmsQueryKeys.globalSearch(query),
        queryFn: () => api.globalSearch({ query }),
        retry: shouldRetryCmsQuery,
        staleTime: 30 * 1000,
      }),
  };
}

export type CmsQueries = ReturnType<typeof createCmsQueries>;
