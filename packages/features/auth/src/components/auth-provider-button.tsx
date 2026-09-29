import { Button } from '@pymekit/ui/button';
import { OauthProviderLogoImage } from '@pymekit/ui/oauth-provider-logo-image';

export function AuthProviderButton({
  providerId,
  onClick,
  children,
}: React.PropsWithChildren<{
  providerId: string;
  onClick: () => void;
}>) {
  return (
    <Button
      className={'flex w-full gap-x-3 text-center'}
      data-provider={providerId}
      data-testid={'auth-provider-button'}
      variant={'outline'}
      onClick={onClick}
    >
      <OauthProviderLogoImage providerId={providerId} />

      <span>{children}</span>
    </Button>
  );
}
