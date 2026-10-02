/**
 * Errores de los paneles del CMS y su traducción a respuestas HTTP (F2.8).
 *
 * Las rutas heredadas respondían a casi todo con un 500 y el texto del error
 * (`getErrorMessage`), que podía llevar mensajes de PostgreSQL, y con un 404
 * cuando RLS impedía editar (la actualización afectaba a 0 filas). Ahora los
 * servicios lanzan `DashboardError` con un código estable (`DASHBOARD_*` de
 * `@pymekit/cms-shared/error-codes`) y las rutas responden con su estado y
 * un mensaje genérico; el detalle solo va al *log*.
 *
 * [TFG] RF-11 · RNF-02: los errores internos no llegan al cliente.
 */
import type { Context } from 'hono';

import {
  CMS_API_ERROR_CODES,
  type CmsApiErrorCode,
} from '@pymekit/cms-shared/error-codes';
import { getLogger } from '@pymekit/shared/logger';

export type DashboardErrorCode = Extract<
  CmsApiErrorCode,
  `DASHBOARD_${string}`
>;

type ErrorStatus = 400 | 403 | 404 | 500;

const RESPONSES: Record<
  DashboardErrorCode,
  { status: ErrorStatus; message: string }
> = {
  DASHBOARD_NOT_FOUND: { status: 404, message: 'Dashboard not found' },
  DASHBOARD_FORBIDDEN: {
    status: 403,
    message: 'You do not have permission to change this dashboard',
  },
  DASHBOARD_INVALID_DATA: { status: 400, message: 'The request is not valid' },
  DASHBOARD_SHARE_RANK_DENIED: {
    status: 403,
    message: 'You can only share with roles below your own rank',
  },
  DASHBOARD_WIDGET_NOT_FOUND: { status: 404, message: 'Widget not found' },
  DASHBOARD_WIDGET_NO_ACCESS: {
    status: 403,
    message: 'You do not have permission to read the data of this widget',
  },
  DASHBOARD_WIDGET_INVALID_SOURCE: {
    status: 400,
    message: 'The widget table or columns are not valid',
  },
  DASHBOARD_ACTION_FAILED: {
    status: 500,
    message: 'The request could not be completed. Please try again later',
  },
};

/** Error de dominio de los paneles con su código estable. */
export class DashboardError extends Error {
  constructor(readonly code: DashboardErrorCode) {
    super(code);
    this.name = 'DashboardError';
  }
}

/** SQLSTATE de un error de `postgres.js` (o de su causa, si Drizzle lo envuelve). */
function getSqlState(error: unknown): string | undefined {
  const candidates = [error, (error as { cause?: unknown })?.cause];

  for (const candidate of candidates) {
    const code = (candidate as { code?: unknown } | null)?.code;

    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) {
      return code;
    }
  }

  return undefined;
}

/**
 * Clasifica cualquier error en código, estado y mensaje públicos. Los
 * rechazos de la base de datos que la API no había previsto (una carrera
 * con otro usuario) se traducen: RLS o privilegios (`42501`) → sin permiso;
 * clave foránea (`23503`, la tabla dejó de estar gestionada) → origen no
 * válido; restricciones (`23514`, `22P02`) → datos no válidos.
 */
export function classifyDashboardError(error: unknown) {
  let code: DashboardErrorCode = CMS_API_ERROR_CODES.DASHBOARD_ACTION_FAILED;

  if (error instanceof DashboardError) {
    code = error.code;
  } else {
    switch (getSqlState(error)) {
      case '42501':
        code = CMS_API_ERROR_CODES.DASHBOARD_FORBIDDEN;
        break;
      case '23503':
        code = CMS_API_ERROR_CODES.DASHBOARD_WIDGET_INVALID_SOURCE;
        break;
      case '23514':
      case '22P02':
        code = CMS_API_ERROR_CODES.DASHBOARD_INVALID_DATA;
        break;
    }
  }

  return { errorCode: code, ...RESPONSES[code] };
}

/** Responde con el error clasificado y deja el detalle en el *log*. */
export async function respondWithDashboardError(
  c: Context,
  error: unknown,
  operation: string,
) {
  const { status, errorCode, message } = classifyDashboardError(error);

  if (status === 500) {
    const logger = await getLogger();
    logger.error({ error, operation }, 'Dashboards request failed');
  }

  return c.json({ success: false as const, error: message, errorCode }, status);
}

/** Respuesta 400 de un `zValidator` que no pasa (sin el detalle de Zod). */
export function invalidDashboardInput(
  result: { success: boolean },
  c: Context,
) {
  if (!result.success) {
    return c.json(
      {
        success: false as const,
        error: RESPONSES.DASHBOARD_INVALID_DATA.message,
        errorCode: CMS_API_ERROR_CODES.DASHBOARD_INVALID_DATA,
      },
      400,
    );
  }
}
