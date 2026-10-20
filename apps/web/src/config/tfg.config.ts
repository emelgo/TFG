/**
 * Configuración de la información académica del TFG.
 *
 * Esta instancia de PymeKit se presenta como Trabajo Fin de Grado. La landing
 * muestra un bloque «Proyecto académico» (logotipo de la ESI-UCA, autor y
 * tutor) y un recorrido guiado por la demostración, pensados para la defensa.
 *
 * Una pyme real que reutilice la plantilla no quiere ver nada de esto. Por eso
 * todo depende de un único interruptor: con `VITE_SHOW_TFG_INFO=false` la web
 * queda limpia sin tocar el código.
 *
 * [TFG] RNF-01 (reutilización por configuración).
 */
const tfgConfig = {
  enabled: import.meta.env.VITE_SHOW_TFG_INFO !== 'false',
  author: 'Enrique Mellado',
  tutor: 'Juan Carlos de la Torre Macías',
  logo: '/images/tfg/logo-uca-esi.jpg',
};

export default tfgConfig;
