import type { PlopTypes } from '@turbo/gen';

import { createCloudflareGenerator } from './templates/cloudflare/generator';
import { createDockerGenerator } from './templates/docker/generator';
import { createPackageGenerator } from './templates/package/generator';

// List of generators to be registered
const generators = [
  createPackageGenerator,
  createCloudflareGenerator,
  createDockerGenerator,
];

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  generators.forEach((gen) => gen(plop));
}
