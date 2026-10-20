/**
 * Punto de entrada público de los *middleware* y guardas de bajo nivel.
 *
 * Es un simple *barrel* sobre `middleware.server.ts` para que el
 * especificador `@pymekit/function-middleware/server` resuelva a un fichero
 * que NO termina en `.server.ts`. La protección de importaciones de TanStack
 * Start rechaza cualquier importación entre paquetes que resuelva
 * directamente a un módulo con `.server.` en el nombre dentro del grafo del
 * cliente, y las referencias a `createMiddleware(...)` sobreviven en los
 * *stubs* RPC que genera el compilador para los ficheros `.functions.ts`. El
 * compilador sigue
 * eliminando de esos *stubs* los cuerpos `.server(...)` (y su grafo de
 * Supabase), así que reexportar a través de este fichero es seguro.
 */
export * from './middleware.server';
