import { Body, Head, Html, Preview, Tailwind, Text, render } from 'react-email';

import { BodyStyle } from '../components/body-style';
import { EmailContent } from '../components/content';
import { EmailFooter } from '../components/footer';
import { EmailHeader } from '../components/header';
import { EmailHeading } from '../components/heading';
import { EmailWrapper } from '../components/wrapper';
import { initializeEmailI18n } from '../lib/i18n';

interface Props {
  productName: string;
  language?: string;
}

export async function renderAccountDeleteEmail(props: Props) {
  const namespace = 'account-delete-email';

  const { t } = await initializeEmailI18n({
    language: props.language,
    namespace,
  });

  const previewText = t(`previewText`, {
    productName: props.productName,
  });

  const subject = t(`subject`, {
    productName: props.productName,
  });

  const html = await render(
    <Html>
      <Head>
        <BodyStyle />
      </Head>

      <Preview>{previewText}</Preview>

      <Tailwind>
        <Body>
          <EmailWrapper>
            <EmailHeader>
              <EmailHeading>{previewText}</EmailHeading>
            </EmailHeader>

            <EmailContent>
              <Text className="text-[16px] leading-[24px] text-[#242424]">
                {t(`hello`)}
              </Text>

              <Text className="text-[16px] leading-[24px] text-[#242424]">
                {t(`paragraph1`, {
                  productName: props.productName,
                })}
              </Text>

              <Text className="text-[16px] leading-[24px] text-[#242424]">
                {t(`paragraph2`)}
              </Text>

              <Text className="text-[16px] leading-[24px] text-[#242424]">
                {t(`paragraph3`, {
                  productName: props.productName,
                })}
              </Text>

              <Text className="text-[16px] leading-[24px] text-[#242424]">
                {t(`paragraph4`, {
                  productName: props.productName,
                })}
              </Text>
            </EmailContent>

            <EmailFooter>{props.productName}</EmailFooter>
          </EmailWrapper>
        </Body>
      </Tailwind>
    </Html>,
  );

  return {
    html,
    subject,
  };
}
