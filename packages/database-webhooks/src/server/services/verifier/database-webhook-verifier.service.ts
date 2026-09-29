export abstract class DatabaseWebhookVerifierService {
  abstract verifySignatureOrThrow(signature: string): Promise<boolean>;
}
