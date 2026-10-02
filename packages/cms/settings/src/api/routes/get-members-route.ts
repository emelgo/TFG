/**
 * Rutas de Ajustes > Miembros del CMS (F2.7a).
 *
 *  - `GET /v1/members`: página del listado (búsqueda por nombre o correo).
 *  - `GET /v1/members/:id`: ficha con rol, estado, qué puede hacer el
 *    usuario actual y los roles que podría asignar.
 *  - `POST /v1/members/:id/roles`: cambia el rol (quitar y/o asignar).
 *  - `POST /v1/members/:id/activate` y `/deactivate`: estado de la cuenta.
 *
 * La autorización la decide `MembersService` con las funciones SQL de
 * rango y RLS (ver su cabecera). Los errores se responden con un código
 * estable (`MEMBER_*`) y un mensaje genérico; el detalle solo va al *log*.
 * Antes devolvían el texto del error con un 500 en todos los casos.
 *
 * Las rutas heredadas `PUT /v1/members/role` (asignar un rol con *upsert*)
 * y `PUT /v1/members/:id` (reescribir el nombre y un correo «de adorno» en
 * `metadata`) se retiraron: ninguna pantalla las usa y la segunda permitía
 * mostrar un correo distinto del real de Auth.
 *
 * [TFG] RF-09 · RNF-02 · ADR-014.
 */
import { zValidator } from '@hono/zod-validator';
import type { Hono } from 'hono';
import * as z from 'zod';

import { createMembersService } from '../services/members.service';
import {
  invalidSettingsInput,
  respondWithSettingsError,
} from './settings-responses';

const IdParamsSchema = z.object({ id: z.string().uuid() });

const MembersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  search: z.string().trim().max(100).optional(),
});

/**
 * Cambio de rol. Una cuenta tiene como mucho un rol, así que se admite
 * asignar uno y quitar a lo sumo uno (el actual); el servicio comprueba el
 * resto.
 */
const UpdateMemberRolesSchema = z
  .object({
    rolesToAdd: z.array(z.string().uuid()).max(1),
    rolesToRemove: z.array(z.string().uuid()).max(1),
  })
  .strict()
  .refine((value) => value.rolesToAdd.length + value.rolesToRemove.length > 0);

/** Registra `GET /v1/members`. */
export function registerGetMembersRouter(router: Hono) {
  return router.get(
    '/v1/members',
    zValidator('query', MembersQuerySchema, invalidSettingsInput('MEMBER')),
    async (c) => {
      const { page, search } = c.req.valid('query');

      try {
        const data = await createMembersService(c).getMembers({
          page,
          search,
        });

        return c.json(data);
      } catch (error) {
        return respondWithSettingsError(c, error, {
          fallback: 'MEMBER_ACTION_FAILED',
          logContext: { route: 'members:list' },
        });
      }
    },
  );
}

/** Registra `GET /v1/members/:id`. */
export function registerGetMemberDetailsRouter(router: Hono) {
  return router.get(
    '/v1/members/:id',
    zValidator('param', IdParamsSchema, invalidSettingsInput('MEMBER')),
    async (c) => {
      const { id } = c.req.valid('param');

      try {
        const data = await createMembersService(c).getMemberDetails(id);

        return c.json(data);
      } catch (error) {
        return respondWithSettingsError(c, error, {
          fallback: 'MEMBER_ACTION_FAILED',
          logContext: { route: 'members:details', id },
        });
      }
    },
  );
}

/** Registra `POST /v1/members/:id/roles`. */
export function registerUpdateMemberRolesRouter(router: Hono) {
  return router.post(
    '/v1/members/:id/roles',
    zValidator('param', IdParamsSchema, invalidSettingsInput('MEMBER')),
    zValidator('json', UpdateMemberRolesSchema, invalidSettingsInput('MEMBER')),
    async (c) => {
      const { id } = c.req.valid('param');
      const changes = c.req.valid('json');

      try {
        await createMembersService(c).updateMemberRoles(id, changes);

        return c.json({ success: true as const });
      } catch (error) {
        return respondWithSettingsError(c, error, {
          fallback: 'MEMBER_ACTION_FAILED',
          logContext: { route: 'members:roles', id, changes },
        });
      }
    },
  );
}

/** Registra `POST /v1/members/:id/deactivate`. */
export function registerDeactivateMemberRouter(router: Hono) {
  return router.post(
    '/v1/members/:id/deactivate',
    zValidator('param', IdParamsSchema, invalidSettingsInput('MEMBER')),
    async (c) => {
      const { id } = c.req.valid('param');

      try {
        await createMembersService(c).setMemberActive(id, false);

        return c.json({ success: true as const });
      } catch (error) {
        return respondWithSettingsError(c, error, {
          fallback: 'MEMBER_ACTION_FAILED',
          logContext: { route: 'members:deactivate', id },
        });
      }
    },
  );
}

/** Registra `POST /v1/members/:id/activate`. */
export function registerActivateMemberRouter(router: Hono) {
  return router.post(
    '/v1/members/:id/activate',
    zValidator('param', IdParamsSchema, invalidSettingsInput('MEMBER')),
    async (c) => {
      const { id } = c.req.valid('param');

      try {
        await createMembersService(c).setMemberActive(id, true);

        return c.json({ success: true as const });
      } catch (error) {
        return respondWithSettingsError(c, error, {
          fallback: 'MEMBER_ACTION_FAILED',
          logContext: { route: 'members:activate', id },
        });
      }
    },
  );
}

export type GetMembersRoute = ReturnType<typeof registerGetMembersRouter>;

export type GetMemberDetailsRoute = ReturnType<
  typeof registerGetMemberDetailsRouter
>;

export type UpdateMemberRolesRoute = ReturnType<
  typeof registerUpdateMemberRolesRouter
>;

export type DeactivateMemberRoute = ReturnType<
  typeof registerDeactivateMemberRouter
>;

export type ActivateMemberRoute = ReturnType<
  typeof registerActivateMemberRouter
>;
