import {
  Body,
  Column,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
  render,
} from 'react-email';

import { BodyStyle } from '../components/body-style';
import { EmailContent } from '../components/content';
import { CtaButton } from '../components/cta-button';
import { EmailFooter } from '../components/footer';
import { EmailHeader } from '../components/header';
import { EmailHeading } from '../components/heading';
import { EmailWrapper } from '../components/wrapper';
import { escapeHtml } from '../lib/escape-html';
import { initializeEmailI18n } from '../lib/i18n';

interface Props {
  teamName: string;
  teamLogo?: string;
  inviter: string | undefined;
  invitedUserEmail: string;
  link: string;
  productName: string;
  language?: string;
}

export async function renderInviteEmail(props: Props) {
  const namespace = 'invite-email';

  const { t } = await initializeEmailI18n({
    language: props.language,
    namespace,
  });

  const previewText = `Join ${props.invitedUserEmail} on ${props.productName}`;
  const subject = t(`subject`);

  const heading = t(`heading`, {
    teamName: props.teamName,
    productName: props.productName,
  });

  const hello = t(`hello`, {
    invitedUserEmail: props.invitedUserEmail,
  });

  // `mainText` is rendered via `dangerouslySetInnerHTML`, so user-controlled
  // values must be HTML-escaped before interpolation. The other fields below
  // render through JSX (auto-escaped) and must NOT be escaped here to avoid
  // double-escaping.
  const mainText = t(`mainText`, {
    inviter: escapeHtml(props.inviter),
    teamName: escapeHtml(props.teamName),
    productName: escapeHtml(props.productName),
    strong: (chunks: string) => `<strong>${chunks}</strong>`,
  });

  const joinTeam = t(`joinTeam`, {
    teamName: props.teamName,
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
              <EmailHeading>{heading}</EmailHeading>
            </EmailHeader>

            <EmailContent>
              <Text className="text-[16px] leading-[24px] text-[#242424]">
                {hello}
              </Text>

              <Text
                className="text-[16px] leading-[24px] text-[#242424]"
                dangerouslySetInnerHTML={{ __html: mainText }}
              />

              {props.teamLogo && (
                <Section>
                  <Row>
                    <Column align="center">
                      <Img
                        className="rounded-full"
                        src={props.teamLogo}
                        width="64"
                        height="64"
                      />
                    </Column>
                  </Row>
                </Section>
              )}

              <Section className="mt-[32px] mb-[32px] text-center">
                <CtaButton href={props.link}>{joinTeam}</CtaButton>
              </Section>

              <Text className="text-[16px] leading-[24px] text-[#242424]">
                {t(`copyPasteLink`)}{' '}
                <Link href={props.link} className="text-blue-600 no-underline">
                  {props.link}
                </Link>
              </Text>

              <Hr className="mx-0 my-[26px] w-full border border-solid border-[#eaeaea]" />

              <Text className="text-[12px] leading-[24px] text-[#666666]">
                {t(`invitationIntendedFor`, {
                  invitedUserEmail: props.invitedUserEmail,
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
