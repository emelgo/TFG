import { Checkbox } from '@pymekit/ui/checkbox';
import { Field } from '@pymekit/ui/field';
import { Trans } from '@pymekit/ui/trans';

// Native required checkbox used purely for UX acknowledgement — it is not
// bound to form state (browser `required` enforces acceptance on submit),
// so it needs no TanStack Form field instance.
export function TermsAndConditionsFormField(
  props: {
    name?: string;
  } = {},
) {
  return (
    <Field>
      <label className={'flex items-start gap-x-3 py-2'}>
        <Checkbox required name={props.name ?? 'termsAccepted'} />

        <div className={'text-xs'}>
          <Trans
            i18nKey={'auth.acceptTermsAndConditions'}
            components={{
              TermsOfServiceLink: (
                <a
                  target={'_blank'}
                  rel={'noreferrer'}
                  className={'underline'}
                  href={'/terms-of-service'}
                >
                  <Trans i18nKey={'auth.termsOfService'} />
                </a>
              ),
              PrivacyPolicyLink: (
                <a
                  target={'_blank'}
                  rel={'noreferrer'}
                  className={'underline'}
                  href={'/privacy-policy'}
                >
                  <Trans i18nKey={'auth.privacyPolicy'} />
                </a>
              ),
            }}
          />
        </div>
      </label>
    </Field>
  );
}
